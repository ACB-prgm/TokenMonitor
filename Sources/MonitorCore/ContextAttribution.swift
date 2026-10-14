import Foundation

public struct ContextContributor: Codable, Identifiable, Equatable {
    public var id: String { name }
    public let name: String
    public let calls: Int
    public let tokens: Int
}
public struct ContextAttribution: Codable, Equatable {
    public var contributors: [ContextContributor] = []
    public var skillCount = 0
    public var callCount = 0
    public var afterCompaction = false
    public var tokens: Int { contributors.reduce(0) { $0 + $1.tokens } }
    public init() {}
    public func bounded(to input: Int) -> ContextAttribution {
        guard tokens > input else { return self }
        var result = self
        let factor = Double(max(0, input)) / Double(tokens)
        result.contributors = contributors.map { ContextContributor(name: $0.name, calls: $0.calls, tokens: Int(Double($0.tokens) * factor)) }
        return result
    }
    public func percent(of input: Int?) -> Double? { Formatting.percent(tokens, limit: input) }
}

/// Replaceable text estimator, not a tokenizer. Counts recorded text only: no hidden
/// schemas, image tokens, or attribution of compaction summaries. Wrapped tool output
/// is charged once to its enclosing call; mixed executions stay under Tools.
public final class ContextAttributionEstimator {
    private struct Call { let name: String; let skill: String? }
    private var calls: [String: Call] = [:]
    private var outputs = Set<String>()
    private var totals: [String: Int] = [:]
    private var counts: [String: Int] = [:]
    private var skills = Set<String>()
    private var compacted = false
    public init() {}
    public static func estimate(_ text: String) -> Int { Int(ceil(Double(text.count) / 4)) }
    private static func text(_ value: Any?) -> String {
        if let s = value as? String { return s }
        if let blocks = value as? [[String: Any]] {
            return blocks.compactMap { $0["text"] as? String }.joined(separator: "\n")
        }
        return ""
    }
    public func consume(type: String, payload: [String: Any]) {
        if type == "compacted" {
            calls.removeAll(); outputs.removeAll(); totals.removeAll(); counts.removeAll(); skills.removeAll()
            compacted = true
            for item in payload["replacement_history"] as? [[String: Any]] ?? [] {
                consume(type: "response_item", payload: item)
            }
            return
        }
        guard type == "response_item", let kind = payload["type"] as? String,
              let id = payload["call_id"] as? String else { return }
        if kind == "function_call" || kind == "custom_tool_call" {
            guard calls[id] == nil else { return }
            let name = payload["name"] as? String ?? "Tools"
            let args = Self.text(payload["arguments"] ?? payload["input"])
            let skill = Self.skillPath(args)
            let group = skill.map { "Skills / \($0)" } ?? Self.group(name: name, namespace: payload["namespace"] as? String, arguments: args)
            calls[id] = Call(name: group, skill: skill)
            counts[group, default: 0] += 1
            totals[group, default: 0] += Self.estimate(args)
        } else if kind == "function_call_output" || kind == "custom_tool_call_output" {
            guard outputs.insert(id).inserted else { return }
            let call = calls[id]
            let group = call?.name ?? "Tools (unmatched)"
            let text = Self.text(payload["output"])
            totals[group, default: 0] += Self.estimate(text)
            if let skill = call?.skill, !text.isEmpty { skills.insert(skill) }
        }
    }
    public func snapshot(input: Int?) -> ContextAttribution {
        var result = ContextAttribution()
        // Bound the approximation to measured input; proportionally scale contributors
        // rather than imply more attributed tokens than the entire context contains.
        let sum = totals.values.reduce(0, +)
        let factor = input.map { sum > 0 ? min(1, Double(max(0, $0)) / Double(sum)) : 1 } ?? 1
        result.contributors = totals.map { ContextContributor(name: $0.key, calls: counts[$0.key, default: 0], tokens: Int(Double($0.value) * factor)) }
            .sorted { $0.tokens == $1.tokens ? $0.name < $1.name : $0.tokens > $1.tokens }
        result.skillCount = skills.count
        result.callCount = counts.values.reduce(0, +)
        result.afterCompaction = compacted
        return result
    }
    private static func skillPath(_ args: String) -> String? {
        // Require a read command, not merely a skill catalog or a mention in output.
        guard args.range(of: #"\b(cat|read|sed|head)\b"#, options: .regularExpression) != nil,
              let range = args.range(of: #"[A-Za-z0-9_.-]+/SKILL\.md"#, options: .regularExpression) else { return nil }
        return String(args[range].dropLast("/SKILL.md".count))
    }
    private static func group(name: String, namespace: String?, arguments: String) -> String {
        let lower = name.lowercased()
        if lower == "exec" || lower.contains("exec_command") || lower.contains("shell") {
            if arguments.range(of: #"\b(cat|rg|grep|sed|head|read_file)\b"#, options: .regularExpression) != nil { return "Read/Search" }
            if lower == "exec", !arguments.contains("exec_command"), !arguments.contains("write_stdin") { return "Tools" }
            return "Shell"
        }
        if lower.contains("search") || lower.contains("read_file") { return "Read/Search" }
        let full = namespace.map { "\($0)/\(name)" } ?? name
        return String(full.replacingOccurrences(of: "mcp__", with: "").replacingOccurrences(of: "__", with: "/").prefix(42))
    }
}
