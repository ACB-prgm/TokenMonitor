import Foundation
import Darwin

/// Offset-based reader. Keeps incomplete lines until a newline arrives. Never stores prompt text on disk.
public final class JSONLTail {
    private var offset: UInt64 = 0
    private var inode: UInt64?
    private var checkpoint = Data()
    private var pending = Data()
    private var discardOversizedLine = false
    public init() {}
    public func read(_ path: String, reset: () -> Void, line: (Data) -> Void) throws {
        let attr = try FileManager.default.attributesOfItem(atPath: path)
        let currentInode = (attr[.systemFileNumber] as? NSNumber)?.uint64Value
        let size = (attr[.size] as? NSNumber)?.uint64Value ?? 0
        let file = try FileHandle(forReadingFrom: URL(fileURLWithPath: path))
        defer { try? file.close() }
        var rewritten = false
        if offset > 0, size >= offset, !checkpoint.isEmpty {
            try file.seek(toOffset: offset - UInt64(checkpoint.count))
            rewritten = try file.read(upToCount: checkpoint.count) != checkpoint
        }
        if inode != currentInode || size < offset || rewritten {
            offset = 0; checkpoint.removeAll(); pending.removeAll(keepingCapacity: true); discardOversizedLine = false; reset()
        }
        inode = currentInode
        try file.seek(toOffset: offset)
        while let block = try file.read(upToCount: 65536), !block.isEmpty {
            offset += UInt64(block.count)
            checkpoint = Data((checkpoint + block).suffix(128))
            pending.append(block)
            while let end = pending.firstIndex(of: 10) {
                let record = pending.prefix(upTo: end)
                if !discardOversizedLine { line(Data(record)) }
                discardOversizedLine = false
                pending.removeSubrange(...end)
            }
            if pending.count > 4 * 1024 * 1024 { pending.removeAll(keepingCapacity: false); discardOversizedLine = true }
        }
    }
}
/// Watches the parent as well as the file so atomic replacement and delayed creation work.
public final class FileWatcher {
    private var directory: DispatchSourceFileSystemObject?
    private var file: DispatchSourceFileSystemObject?
    private let queue: DispatchQueue
    private let path: String
    private var inode: UInt64?
    private let changed: () -> Void
    public init(path: String, queue: DispatchQueue, changed: @escaping () -> Void) {
        self.path = path; self.queue = queue; self.changed = changed
        let parent = URL(fileURLWithPath: path).deletingLastPathComponent().path
        directory = source(parent, events: [.write, .rename, .delete]) { [weak self] in self?.refresh() }
        refresh()
    }
    private func source(_ path: String, events: DispatchSource.FileSystemEvent, action: @escaping () -> Void) -> DispatchSourceFileSystemObject? {
        let fd = open(path, O_EVTONLY)
        guard fd >= 0 else { return nil }
        let s = DispatchSource.makeFileSystemObjectSource(fileDescriptor: fd, eventMask: events, queue: queue)
        s.setEventHandler(handler: action)
        s.setCancelHandler { close(fd) }
        s.resume()
        return s
    }
    private func refresh() {
        let next = ((try? FileManager.default.attributesOfItem(atPath: path))?[.systemFileNumber] as? NSNumber)?.uint64Value
        if next != inode || file == nil {
            file?.cancel(); file = nil; inode = next
            file = source(path, events: [.write, .extend, .rename, .delete, .attrib]) { [weak self] in self?.refresh() }
        }
        changed()
    }
    deinit { file?.cancel(); directory?.cancel() }
}
