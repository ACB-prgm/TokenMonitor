import Foundation

public enum AutomaticTask {
    /// Internal/subagent sessions must not interrupt the user's selected task.
    /// Unknown or not-yet-written transcripts can be reconsidered on the next hook.
    public static func accepts(header: Data, sessionID: String) -> Bool {
        guard let record = try? JSONSerialization.jsonObject(with: header) as? [String: Any],
              record["type"] as? String == "session_meta",
              let payload = record["payload"] as? [String: Any],
              payload["id"] as? String == sessionID else { return false }
        if let source = payload["source"] as? [String: Any], source["subagent"] != nil { return false }
        if let source = payload["source"] as? String, source.lowercased().hasPrefix("subagent") { return false }
        return true
    }
    public static func accepts(transcriptPath: String?, sessionID: String) -> Bool {
        guard let transcriptPath, let file = FileHandle(forReadingAtPath: transcriptPath) else { return false }
        defer { try? file.close() }
        guard let data = try? file.read(upToCount: 65_536), let newline = data.firstIndex(of: 10) else { return false }
        return accepts(header: data.prefix(upTo: newline), sessionID: sessionID)
    }
}
