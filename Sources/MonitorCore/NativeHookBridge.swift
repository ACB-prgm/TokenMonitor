import Foundation
import Darwin

public enum NativeHookBridge {
    public static func read(_ url: URL) -> [String: Any] {
        (try? Data(contentsOf: url)).flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] } ?? [:]
    }
    public static func write(_ value: [String: Any], to url: URL) throws {
        let data = try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys])
        try data.write(to: url, options: .atomic)
        try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: url.path)
    }
    public static func process(_ payload: [String: Any], root: URL, pid: Int?, now: Date = Date(), launch: () -> Void) throws {
        guard let event = payload["hook_event_name"] as? String, HookConfiguration.events.contains(event),
              let session = payload["session_id"] as? String, !session.isEmpty else { return }
        if let transcript = payload["transcript_path"], !(transcript is NSNull) {
            guard let path = transcript as? String, path.hasPrefix("/") else { return }
        }
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        let fd = open(root.appendingPathComponent("bridge.lock").path, O_CREAT | O_RDWR | O_NOFOLLOW, 0o600)
        guard fd >= 0 else { throw MonitorSetupError.invalid("Cannot open bridge lock.") }
        defer { close(fd) }
        guard flock(fd, LOCK_EX) == 0 else { throw MonitorSetupError.invalid("Cannot lock bridge.") }
        defer { flock(fd, LOCK_UN) }
        let previous = read(root.appendingPathComponent("active-session.json"))
        var state = previous["session_id"] as? String == session ? previous : [:]
        for key in ["session_id", "transcript_path", "cwd", "model", "turn_id", "hook_event_name", "title"] {
            if let value = payload[key] { state[key] = value }
        }
        if previous["session_id"] as? String == session, (payload["transcript_path"] as? String).map({ !$0.isEmpty }) != true {
            state["transcript_path"] = previous["transcript_path"]
        }
        let formatter = ISO8601DateFormatter(); formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        state["updated_at"] = formatter.string(from: now)
        state["codex_pid"] = pid.map { $0 as Any } ?? NSNull()
        state["ended"] = event == "SessionEnd"
        try write(state, to: root.appendingPathComponent("active-session.json"))
        let suppressionURL = root.appendingPathComponent("suppression.json")
        let suppressed = read(suppressionURL)["suppress_auto_launch_for_codex_pid"] as? Int
        if let pid, let suppressed, suppressed != pid { try write([:], to: suppressionURL) }
        if event != "SessionEnd", let pid, suppressed != pid { launch() }
    }
}
