import Foundation

public struct ThreadOutputTotals: Codable, Equatable {
    public var total: Int?
    public var reasoning: Int?
    public var source: String
    public var nonReasoning: Int? {
        guard let total, let reasoning, reasoning <= total else { return nil }
        return total - reasoning
    }
}

public struct TokenUsageSample: Codable, Equatable {
    public let timestamp: Date
    public let input: Int
    public let cached: Int
    public let cacheWrite: Int
    public let output: Int
    public let reasoning: Int
    public let total: Int?
    public let ordinal: Int?
    public var fresh: Int { input - cached }
    public var cacheHit: Double { Double(cached) / Double(input) * 100 }
}
public struct Allowance: Codable, Equatable {
    public let used: Double
    public let reset: Date?
}
public struct CompactionEvent: Codable, Equatable {
    public let timestamp: Date
    /// Boundary between the preceding and following call on the call-index chart.
    public let callPosition: Double
}
public enum RecentCallsChart {
    public static func domain(callCount: Int, sampleCount: Int, compactions: [CompactionEvent]) -> ClosedRange<Double> {
        guard sampleCount > 0 else { return 0...1 }
        let first = Double(callCount - sampleCount)
        let last = max(Double(callCount - 1), compactions.map(\.callPosition).max() ?? first)
        // Explicit bounds prevent Charts from extending absolute call indices to zero.
        return first...max(first + 1, last)
    }
}
public enum CompactionStatus {
    public static func isActive(event: String?, started: Date?, completed: Date?, latestCall: Date?) -> Bool {
        guard event == "PreCompact", let started else { return false }
        if let completed, completed >= started { return false }
        if let latestCall, latestCall > started { return false }
        return true
    }
}
public final class CodexTelemetryParser {
    public private(set) var awaitingPostCompactionCall = false
    public private(set) var compactedContext: Int?
    public private(set) var compactions: [CompactionEvent] = []
    public var visibleCompactions: [CompactionEvent] {
        compactions.filter { $0.callPosition >= Double(callCount - samples.count) }
    }
    public private(set) var samples: [TokenUsageSample] = []
    public private(set) var contextLimit: Int?
    public private(set) var fiveHour: Allowance?
    public private(set) var weekly: Allowance?
    public private(set) var model: String?
    public private(set) var effort: String?
    public private(set) var title: String?
    public private(set) var lastCallModel: String?
    public private(set) var lastCallEffort: String?
    public private(set) var lastEvent: Date?
    public private(set) var callCount = 0
    private var reportedOutput: Int?
    private var reportedReasoning: Int?
    private var summedOutput = 0
    private var summedReasoning = 0
    private var outputComplete = true
    private var reasoningComplete = true
    public var outputTotals: ThreadOutputTotals {
        if let reportedOutput { return ThreadOutputTotals(total: reportedOutput, reasoning: reportedReasoning, source: "reported-cumulative") }
        return ThreadOutputTotals(total: callCount > 0 && outputComplete ? summedOutput : nil,
                                  reasoning: callCount > 0 && reasoningComplete ? summedReasoning : nil,
                                  source: "recorded-calls")
    }
    public let attribution = ContextAttributionEstimator()
    public private(set) var contextAttribution = ContextAttribution()
    private var pendingAttribution: ContextAttribution?
    private var lastIdentity: String?
    public init() {}
    public static func cleanTitle(_ text: String?) -> String? {
        guard let text else { return nil }
        let title = text.split(whereSeparator: { $0.isWhitespace || $0.isNewline }).joined(separator: " ")
        guard !title.isEmpty, !title.hasPrefix("# Files mentioned by the user:"), !title.hasPrefix("<environment_context>"), !title.hasPrefix("<permissions instructions>") else { return nil }
        return String(title.prefix(90))
    }
    public static func date(_ text: String) -> Date? {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f.date(from: text) ?? ISO8601DateFormatter().date(from: text)
    }
    private func timeIsNewCompaction(_ record: [String: Any]) -> Bool {
        guard let stamp = record["timestamp"] as? String, let time = Self.date(stamp) else { return false }
        return compactions.last.map { time > $0.timestamp } ?? true
    }
    public func consume(_ data: Data) {
        guard let r = try? JSONSerialization.jsonObject(with: data) as? [String: Any], let p = r["payload"] as? [String: Any] else { return }
        let recordType = r["type"] as? String ?? ""
        let itemType = p["type"] as? String ?? ""
        if recordType == "compacted", timeIsNewCompaction(r) {
            awaitingPostCompactionCall = true
            compactedContext = nil
            pendingAttribution = nil
            contextAttribution = ContextAttribution()
        }
        // Freeze before the model's response adds calls/results: those belong to the
        // next input, not the usage report for this response (which may arrive later).
        let isModelResponse = ["reasoning", "function_call", "custom_tool_call"].contains(itemType)
            || (itemType == "message" && p["role"] as? String == "assistant")
        if recordType == "response_item", pendingAttribution == nil, isModelResponse {
            pendingAttribution = attribution.snapshot(input: nil)
        }
        attribution.consume(type: r["type"] as? String ?? "", payload: p)
        let time = (r["timestamp"] as? String).flatMap(Self.date)
        if let time { lastEvent = time }
        if recordType == "compacted", let time, compactions.last?.timestamp != time {
            compactions.append(CompactionEvent(timestamp: time, callPosition: Double(callCount) - 0.5))
            if compactions.count > 120 { compactions.removeFirst(compactions.count - 120) }
        }
        if r["type"] as? String == "turn_context" {
            model = p["model"] as? String ?? model
            effort = p["effort"] as? String ?? p["reasoning_effort"] as? String ?? effort
        }
        if r["type"] as? String == "session_meta" { title = p["title"] as? String ?? title }
        guard r["type"] as? String == "event_msg" else { return }
        if p["type"] as? String == "user_message", title == nil, let prompt = p["message"] as? String {
            title = Self.cleanTitle(prompt)
        }
        guard p["type"] as? String == "token_count" else { return }
        if let limits = p["rate_limits"] as? [String: Any] {
            for name in ["primary", "secondary"] {
                guard let a = limits[name] as? [String: Any], let used = a["used_percent"] as? Double, used.isFinite else { continue }
                let value = Allowance(used: used, reset: (a["resets_at"] as? Double).map { Date(timeIntervalSince1970: $0) })
                // Never relabel a different quota window as five hours or a week.
                if a["window_minutes"] as? Int == 300 { fiveHour = value }
                if a["window_minutes"] as? Int == 10080 { weekly = value }
            }
        }
        guard let info = p["info"] as? [String: Any] else { return }
        // Cumulative counters survive the chart's 120-sample cap and compaction.
        // Reasoning is part of output, never an additional charge on top of it.
        var reportedThisRecord = false
        if let cumulative = info["total_token_usage"] as? [String: Any],
           let output = cumulative["output_tokens"] as? Int, output >= 0 {
            reportedThisRecord = true
            reportedOutput = output
            reportedReasoning = (cumulative["reasoning_output_tokens"] as? Int).flatMap { $0 >= 0 && $0 <= output ? $0 : nil }
        }
        if let limit = info["model_context_window"] as? Int, limit > 0 { contextLimit = limit }
        guard let u = info["last_token_usage"] as? [String: Any], let input = u["input_tokens"] as? Int, let time else { return }
        // Compaction bookkeeping reports the reduced context in total_tokens, with
        // zero call usage. It is not a model call and has no cache-hit information.
        if awaitingPostCompactionCall, input == 0,
           (u["cached_input_tokens"] as? Int ?? 0) == 0,
           (u["output_tokens"] as? Int ?? 0) == 0,
           let total = u["total_tokens"] as? Int, total > 0,
           let completed = compactions.last?.timestamp, time >= completed {
            compactedContext = total
            contextAttribution = attribution.snapshot(input: total)
            return
        }
        guard input > 0 else { return }
        let cached = u["cached_input_tokens"] as? Int ?? 0
        guard cached >= 0, cached <= input else { return }
        let s = TokenUsageSample(timestamp: time, input: input, cached: cached, cacheWrite: u["cache_write_input_tokens"] as? Int ?? 0, output: u["output_tokens"] as? Int ?? 0, reasoning: u["reasoning_output_tokens"] as? Int ?? 0, total: u["total_tokens"] as? Int, ordinal: r["ordinal"] as? Int)
        // Replayed identical records are bookkeeping; equal usage at a new timestamp is a new call.
        let identity = "\(r["timestamp"] ?? "")|\(s.input)|\(s.cached)|\(s.output)|\(s.total ?? -1)"
        guard identity != lastIdentity else { return }
        awaitingPostCompactionCall = false
        compactedContext = nil
        contextAttribution = (pendingAttribution ?? attribution.snapshot(input: nil)).bounded(to: input)
        pendingAttribution = nil
        lastIdentity = identity
        lastCallModel = model; lastCallEffort = effort
        callCount += 1
        if !reportedThisRecord, let prior = reportedOutput {
            if let output = u["output_tokens"] as? Int, output >= 0, !prior.addingReportingOverflow(output).overflow {
                reportedOutput = prior + output
            } else { reportedOutput = nil }
            if let priorReasoning = reportedReasoning, let reasoning = u["reasoning_output_tokens"] as? Int,
               reasoning >= 0, reasoning <= s.output, !priorReasoning.addingReportingOverflow(reasoning).overflow {
                reportedReasoning = priorReasoning + reasoning
            } else { reportedReasoning = nil }
        }
        if let output = u["output_tokens"] as? Int, output >= 0, !summedOutput.addingReportingOverflow(output).overflow {
            summedOutput += output
        } else { outputComplete = false }
        if let reasoning = u["reasoning_output_tokens"] as? Int, reasoning >= 0, reasoning <= s.output,
           !summedReasoning.addingReportingOverflow(reasoning).overflow { summedReasoning += reasoning }
        else { reasoningComplete = false }
        samples.append(s)
        if samples.count > 120 { samples.removeFirst(samples.count - 120) }
    }
}
public enum Formatting {
    public static func tokens(_ n: Int) -> String {
        if abs(n) >= 1_000_000 { return String(format: "%.1fM", Double(n) / 1_000_000) }
        if abs(n) >= 1_000 { return String(format: "%.1fk", Double(n) / 1_000) }
        return String(n)
    }
    public static func time(_ date: Date?, expanded: Bool = false) -> String {
        guard let date else { return "No call yet" }
        let f = DateFormatter(); f.dateStyle = expanded ? .medium : .none; f.timeStyle = expanded ? .medium : .short
        return f.string(from: date)
    }
    public static func percent(_ input: Int?, limit: Int?) -> Double? {
        guard let input, let limit, limit > 0 else { return nil }
        return Double(input) / Double(limit) * 100
    }
}
