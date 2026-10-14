import Foundation
import Darwin

/// Task IDs are meaningful only within their source machine.
public struct SourceSelection {
    public private(set) var source = "local"
    public private(set) var currentID: String?
    public private(set) var isLocked = false
    public init() {}
    public mutating func select(source: String, id: String) { self.source = source; currentID = id }
    public mutating func toggleLock() { if currentID != nil { isLocked.toggle() } }
    public mutating func receiveHook(source: String, id: String) -> Bool {
        guard !isLocked || (self.source == source && currentID == id) else { return false }
        select(source: source, id: id); return true
    }
}

public struct RemoteConfiguration: Codable, Equatable, Identifiable {
    public var id = UUID()
    public var label = ""
    public var host = ""
    public var user = ""
    public var port = 22
    public var identityFile = ""
    public var enabled = true
    public init() {}
    public static var storageURL: URL {
        FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".codex/usage-monitor/remotes.json")
    }
    public func validate() throws {
        func valid(_ text: String) -> Bool {
            !text.isEmpty && text.count <= 255 && text.range(of: #"^[A-Za-z0-9_.:@-]+$"#, options: .regularExpression) != nil && !text.hasPrefix("-")
        }
        guard !label.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, label.count <= 80,
              valid(host), user.isEmpty || valid(user), (1...65535).contains(port),
              identityFile.hasPrefix("/"), !identityFile.contains("\n") else {
            throw MonitorSetupError.invalid("Enter a label, valid SSH host/user/port, and an absolute private-key path.")
        }
    }
    public static func load() -> [Self] {
        guard let data = try? Data(contentsOf: storageURL), let values = try? JSONDecoder().decode([Self].self, from: data) else { return [] }
        return values
    }
    public static func save(_ values: [Self]) throws {
        for value in values { try value.validate() }
        guard Set(values.map(\.id)).count == values.count else { throw MonitorSetupError.invalid("Duplicate remote IDs.") }
        try FileManager.default.createDirectory(at: storageURL.deletingLastPathComponent(), withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        try JSONEncoder().encode(values).write(to: storageURL, options: .atomic)
        try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: storageURL.path)
    }
    public static let remoteCommand = #"version=$(/usr/bin/plutil -extract CFBundleShortVersionString raw -o - "$HOME/Applications/Codex Usage Monitor.app/Contents/Info.plist" 2>/dev/null) || exit 127; /usr/bin/awk -v version="$version" 'BEGIN { split(version, v, "."); exit !(v[1] > 1 || (v[1] == 1 && v[2] >= 2)) }' || exit 127; exec "$HOME/Applications/Codex Usage Monitor.app/Contents/MacOS/CodexUsageMonitor" --remote-agent"#
    public var sshArguments: [String] {
        ["-T", "-o", "BatchMode=yes", "-o", "IdentitiesOnly=yes", "-o", "StrictHostKeyChecking=yes",
         "-o", "ConnectTimeout=8", "-o", "ServerAliveInterval=15", "-o", "ServerAliveCountMax=2",
         "-o", "ForwardAgent=no", "-o", "ClearAllForwardings=yes", "-o", "PermitLocalCommand=no",
         "-i", identityFile, "-p", String(port), "--", user.isEmpty ? host : "\(user)@\(host)",
         // A constant remote command: no configuration values are interpolated into a shell program.
         Self.remoteCommand]
    }
}

public struct RemoteMessage: Codable {
    public static let protocolVersion = 1
    public var version = protocolVersion
    public var kind: String
    public var taskID: String?
    public var snapshot: Snapshot?
    public var threads: [RecentThread]?
    public init(kind: String, taskID: String? = nil, snapshot: Snapshot? = nil, threads: [RecentThread]? = nil) {
        self.kind = kind; self.taskID = taskID; self.snapshot = snapshot; self.threads = threads
    }
    public func encodedLine() throws -> Data {
        let data = try JSONEncoder().encode(self)
        guard data.count <= RemoteLineDecoder.maximumBytes else { throw MonitorSetupError.invalid("Telemetry message exceeds size limit.") }
        return data + Data([10])
    }
    public static func decode(_ line: Data) throws -> Self {
        guard line.count <= RemoteLineDecoder.maximumBytes else { throw MonitorSetupError.invalid("Telemetry message exceeds size limit.") }
        let value = try JSONDecoder().decode(Self.self, from: line)
        guard value.version == protocolVersion else { throw MonitorSetupError.invalid("Remote helper protocol is incompatible. Update TokenMonitor on both machines.") }
        guard (value.threads?.count ?? 0) <= 30, (value.snapshot?.samples.count ?? 0) <= 120,
              (value.taskID?.count ?? 0) <= 200 else {
            throw MonitorSetupError.invalid("Invalid telemetry collection size.")
        }
        if let snapshot = value.snapshot {
            guard snapshot.callCount >= 0, snapshot.samples.allSatisfy({ $0.input > 0 && $0.cached >= 0 && $0.cached <= $0.input && $0.output >= 0 && $0.reasoning >= 0 }) else {
                throw MonitorSetupError.invalid("Invalid token counts.")
            }
        }
        return value
    }
}

/// Bounded framing for arbitrarily split pipe reads; an oversized line terminates the protocol.
public struct RemoteLineDecoder {
    public static let maximumBytes = 1024 * 1024
    private var pending = Data()
    public init() {}
    public mutating func consume(_ data: Data) throws -> [Data] {
        var result: [Data] = []
        for byte in data {
            if byte == 10 {
                if !pending.isEmpty { result.append(pending) }
                pending.removeAll(keepingCapacity: true)
            } else {
                guard pending.count < Self.maximumBytes else { throw MonitorSetupError.invalid("Telemetry message exceeds size limit.") }
                pending.append(byte)
            }
        }
        return result
    }
}

extension Snapshot {
    /// Titles and workspace basenames are shared, never source paths or raw conversation contents.
    public var remoteSafe: Snapshot {
        var value = self
        if var session = value.session {
            session.transcript_path = nil
            session.cwd = session.cwd.map { URL(fileURLWithPath: $0).lastPathComponent }
            session.title = value.title
            value.session = session
        }
        return value
    }
}

/// Read one available pipe chunk. Foundation's read(upToCount:) may wait to fill the
/// entire requested count on pipes, delaying small live messages until EOF.
public enum RemotePipe {
    public static func read(_ handle: FileHandle, maximum: Int = 65536) throws -> Data {
        var bytes = [UInt8](repeating: 0, count: maximum)
        while true {
            let count = bytes.withUnsafeMutableBytes { Darwin.read(handle.fileDescriptor, $0.baseAddress, $0.count) }
            if count >= 0 { return Data(bytes.prefix(count)) }
            if errno == EINTR { continue }
            throw NSError(domain: NSPOSIXErrorDomain, code: Int(errno))
        }
    }
}
