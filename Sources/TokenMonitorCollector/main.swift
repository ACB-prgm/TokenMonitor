import Foundation
import MonitorCore
import CryptoKit
import Darwin

let home = ProcessInfo.processInfo.environment["CODEX_HOME"].map { URL(fileURLWithPath: $0) }
    ?? FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".codex")
let store = EmbeddedTelemetryStore(home: home)
let encoder = JSONEncoder()
encoder.dateEncodingStrategy = .iso8601
encoder.outputFormatting = [.sortedKeys]
func readBlock() -> Data? {
    var bytes = [UInt8](repeating: 0, count: 65536)
    var count: Int
    repeat { count = Darwin.read(STDIN_FILENO, &bytes, bytes.count) } while count < 0 && errno == EINTR
    return count > 0 ? Data(bytes.prefix(count)) : nil
}

if CommandLine.arguments.contains("--hook") {
    var input = Data()
    while let block = readBlock() {
        input.append(block)
        if input.count > 1024 * 1024 { exit(0) }
    }
    if let payload = try? JSONSerialization.jsonObject(with: input) as? [String: Any] { _ = try? store.hooks.record(payload) }
    exit(0)
}

// Bounded newline framing, no transcript/source-path arguments. One serial
// request stream; the bridge correlates responses by ID and handles restarts.
var pending = Data(), oversized = false
while let block = readBlock() {
    pending.append(block)
    while let end = pending.firstIndex(of: 10) {
        let line = Data(pending.prefix(upTo: end)); pending.removeSubrange(...end)
        if oversized || line.count > 65536 { oversized = false; continue }
        guard let request = try? JSONSerialization.jsonObject(with: line) as? [String: Any],
              let id = request["id"] as? String, id.count <= 100,
              let method = request["method"] as? String else { continue }
        var result: [String: Any] = [:]
        switch method {
        case "catalog":
            let hostID = request["hostId"] as? String
            result["hostMatched"] = hostID.flatMap { store.resolve($0) } != nil
            result["tasks"] = (try? JSONSerialization.jsonObject(with: encoder.encode(store.tasks()))) ?? []
            if let hook = store.hooks.latest { result["latestHook"] = ["id": hook.session.session_id, "sequence": hook.sequence, "event": hook.session.hook_event_name ?? ""] }
        case "state":
            if let task = request["taskId"] as? String, let snapshot = store.snapshot(id: task), let data = try? encoder.encode(snapshot) {
                let revision = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
                result["revision"] = revision
                if request["revision"] as? String == revision { result["unchanged"] = true }
                else { result["state"] = (try? JSONSerialization.jsonObject(with: data)) ?? NSNull() }
            } else { result["unavailable"] = true }
        default: result["error"] = "Unsupported collector request"
        }
        if let data = try? JSONSerialization.data(withJSONObject: ["id": id, "result": result], options: [.sortedKeys]), data.count < 1024 * 1024 {
            FileHandle.standardOutput.write(data + Data([10]))
        }
    }
    if pending.count > 65536 { pending.removeAll(keepingCapacity: false); oversized = true }
}
