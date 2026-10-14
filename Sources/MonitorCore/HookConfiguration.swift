import Foundation

public enum MonitorSetupError: Error, LocalizedError {
    case invalid(String)
    public var errorDescription: String? { if case .invalid(let message) = self { return message }; return nil }
}

public enum HookConfiguration {
    public static let events = ["SessionStart", "UserPromptSubmit", "Stop", "SessionEnd", "PreCompact", "PostCompact"]
    public static func quote(_ value: String) -> String { "'" + value.replacingOccurrences(of: "'", with: "'\\''") + "'" }
    public static func command(home: URL) -> String {
        quote(home.appendingPathComponent("Applications/Codex Usage Monitor.app/Contents/MacOS/CodexUsageMonitor").path) + " --hook"
    }
    // Parse words without executing a shell. Reject operators/expansions outside quotes.
    public static func words(_ command: String) -> [String]? {
        var result = [String](), word = "", quote: Character?, escaped = false, started = false
        for c in command {
            if escaped { word.append(c); escaped = false; started = true; continue }
            if c == "\\", quote != "'" { escaped = true; started = true; continue }
            if let q = quote {
                if q == "\"", c == "$" || c == "`" { return nil }
                if c == q { quote = nil } else { word.append(c) }
                started = true; continue
            }
            if c == "'" || c == "\"" { quote = c; started = true }
            else if c.isWhitespace { if started { result.append(word); word = ""; started = false } }
            else if ";|&<>$`(){}*?~".contains(c) { return nil }
            else { word.append(c); started = true }
        }
        guard quote == nil, !escaped else { return nil }
        if started { result.append(word) }
        return result
    }
    public static func isOwned(_ command: String, home: URL) -> Bool {
        guard let parts = words(command) else { return false }
        if parts == [home.appendingPathComponent("Applications/Codex Usage Monitor.app/Contents/MacOS/CodexUsageMonitor").path, "--hook"] { return true }
        let names = ["TokenMonitor.py", "codex_usage_monitor_hook.py", "codex_usage_stop.py", "codex_usage_stop_wrapper.sh"]
        let targets = names.map { home.appendingPathComponent(".codex/hooks/" + $0).path }
        return (parts.count == 1 && targets.contains(parts[0])) ||
            (parts.count == 2 && ["/usr/bin/python3", "python3", "/bin/bash", "/bin/sh"].contains(parts[0]) && targets.contains(parts[1]))
    }
    public static func merge(_ data: Data, home: URL, uninstall: Bool = false) throws -> Data {
        guard var config = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw MonitorSetupError.invalid("Hook configuration must be a JSON object.") }
        guard var hooks = config["hooks"] as? [String: Any] ?? (config["hooks"] == nil ? [:] : nil) else { throw MonitorSetupError.invalid("hooks must be an object.") }
        for (event, value) in hooks {
            guard let groups = value as? [[String: Any]] else { throw MonitorSetupError.invalid("Unknown hook group schema; configuration was not changed.") }
            var kept = [[String: Any]]()
            for var group in groups {
                guard let handlers = group["hooks"] as? [[String: Any]] else { throw MonitorSetupError.invalid("Unknown hook handler schema; configuration was not changed.") }
                let filtered = handlers.filter { handler in
                    !(handler["type"] as? String == "command" && (handler["command"] as? String).map { isOwned($0, home: home) } == true)
                }
                if !filtered.isEmpty || handlers.isEmpty { group["hooks"] = filtered; kept.append(group) }
            }
            hooks[event] = kept
        }
        if !uninstall {
            for event in events {
                var groups = hooks[event] as? [[String: Any]] ?? []
                groups.append(["hooks": [["type": "command", "command": command(home: home), "timeout": 3]]])
                hooks[event] = groups
            }
        }
        config["hooks"] = hooks
        return try JSONSerialization.data(withJSONObject: config, options: [.prettyPrinted, .sortedKeys])
    }
}
