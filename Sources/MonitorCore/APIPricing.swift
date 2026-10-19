import Foundation

/// USD per million tokens. Verified 2026-10-19, not historical invoice rates.
/// Updating this table never requires changing the visualization.
public enum APIPricing {
    public static let source = "https://developers.openai.com/api/docs/pricing"
    public static let verifiedAt = "2026-10-19"
    public static let configurationEffectiveDate = "2026-10-19"
    public struct Rates: Codable, Equatable {
        public var input: Double
        public var cached: Double
        public var write: Double?
        public var output: Double
    }
    private static let standard: [String: Rates] = [
        "gpt-6.1-sol": Rates(input: 2, cached: 0.1, write: 2.5, output: 10),
        "gpt-6-astra": Rates(input: 10, cached: 1, write: 12.5, output: 50),
        "gpt-6-sol": Rates(input: 2, cached: 0.2, write: 2.5, output: 10),
        "gpt-6-luna": Rates(input: 0.1, cached: 0.01, write: 0.125, output: 0.5),
        "gpt-5.6-sol": Rates(input: 4, cached: 0.4, write: 5, output: 20),
        "gpt-5.6-terra": Rates(input: 2, cached: 0.2, write: 2.5, output: 12),
        "gpt-5.6-luna": Rates(input: 0.2, cached: 0.02, write: 0.25, output: 1.2),
        "gpt-5.5": Rates(input: 5, cached: 0.5, write: nil, output: 30),
        "gpt-5.4": Rates(input: 2.5, cached: 0.25, write: nil, output: 15),
        "gpt-5.4-mini": Rates(input: 0.75, cached: 0.075, write: nil, output: 4.5),
        "gpt-5.4-nano": Rates(input: 0.2, cached: 0.02, write: nil, output: 1.25),
        "gpt-5.3-codex": Rates(input: 1.75, cached: 0.175, write: nil, output: 14),
        "gpt-5.2": Rates(input: 1.75, cached: 0.175, write: nil, output: 14),
        "gpt-5.1": Rates(input: 1.25, cached: 0.125, write: nil, output: 10),
        "gpt-5": Rates(input: 1.25, cached: 0.125, write: nil, output: 10)
    ]
    public static func rates(model: String?, tier: String?, input: Int, regional: Bool = false) -> Rates? {
        guard let model, var r = standard[model] else { return nil }
        let modern = model.hasPrefix("gpt-6") || model.hasPrefix("gpt-5.6-")
        let tier = tier ?? "default"
        var multiplier = 1.0
        switch tier {
        case "default", "standard", "auto": break
        case "priority", "fast":
            if model == "gpt-5.5" { multiplier = 2.5 }
            else if modern || ["gpt-5.4", "gpt-5.4-mini", "gpt-5.3-codex", "gpt-5.2", "gpt-5.1", "gpt-5"].contains(model) { multiplier = 2 }
            else { return nil }
        case "flex", "batch":
            guard modern || !model.hasPrefix("gpt-5.3") else { return nil }
            multiplier = 0.5
        case "ultrafast":
            guard ["gpt-6.1-sol", "gpt-6-astra"].contains(model) else { return nil }
            multiplier = 6
        default: return nil
        }
        if input > 272000, modern || ["gpt-5.5", "gpt-5.4"].contains(model) {
            // Older Fast tables do not publish long-context rates.
            if !modern && ["priority", "fast"].contains(tier) { return nil }
            r.input *= 2; r.cached *= 2; r.write = r.write.map { $0 * 2 }; r.output *= 1.5
        }
        if regional {
            guard modern || ["gpt-5.5", "gpt-5.4", "gpt-5.4-mini", "gpt-5.4-nano"].contains(model) else { return nil }
            multiplier *= 1.1
        }
        return Rates(input: r.input * multiplier, cached: r.cached * multiplier, write: r.write.map { $0 * multiplier }, output: r.output * multiplier)
    }
    public static func price(_ s: TokenUsageSample) -> CallPrice {
        let assumed = s.serviceTier == nil || s.serviceTier == "auto"
        guard let r = rates(model: s.model, tier: s.serviceTier, input: s.input, regional: s.regionalProcessing == true) else {
            return CallPrice(assumedTier: assumed, issue: "No verified rate for model/tier")
        }
        guard s.input >= 0, s.cached >= 0, s.cached <= s.input,
              s.cachedRecorded != false, s.cacheWriteRecorded != false,
              s.cacheWrite >= 0, s.cacheWrite <= s.input - s.cached,
              s.outputRecorded != false, s.output >= 0,
              s.cacheWrite == 0 || r.write != nil else {
            return CallPrice(assumedTier: assumed, rates: r, issue: "Missing or invalid input/output/cache accounting")
        }
        let ordinary = Double(s.input - s.cached - s.cacheWrite) * r.input / 1e6
        let read = Double(s.cached) * r.cached / 1e6
        let write = Double(s.cacheWrite) * (r.write ?? 0) / 1e6
        let output = Double(s.output) * r.output / 1e6
        let reasoning = s.reasoningRecorded != false && s.reasoning >= 0 && s.reasoning <= s.output ? Double(s.reasoning) * r.output / 1e6 : nil
        return CallPrice(total: ordinary + read + write + output,
                         categories: [ordinary, read, write, reasoning ?? 0, reasoning.map { output - $0 } ?? 0, reasoning == nil ? output : 0],
                         cacheSavings: Double(s.input) * r.input / 1e6 - ordinary - read - write,
                         assumedTier: assumed, rates: r)
    }
    /// Same retention/output assumptions and strict break-even as the native
    /// heuristic, evaluated using verified call-level rates for both contexts.
    public static func compactionBreakEven(input: Int?, model: String?, tier: String?) -> Int? {
        guard let input, input > 0 else { return nil }
        let reduced = max(Int((Double(input) * 0.3).rounded()), 40000)
        guard reduced < input,
              let current = rates(model: model, tier: tier, input: input),
              let compact = rates(model: model, tier: tier, input: reduced) else { return nil }
        let saving = Double(input) * current.cached - Double(reduced) * compact.cached
        guard saving > 0 else { return nil }
        let raw = 1 + (Double(reduced) * compact.input + 3600 * current.output) / saving
        return raw.isFinite && raw < Double(Int.max - 1) ? Int(floor(raw)) + 1 : nil
    }
}
public struct CallPrice: Codable, Equatable {
    public var total: Double? = nil
    /// Ordinary input, cache read, cache write, reasoning, other output, unsplit output.
    public var categories: [Double]? = nil
    public var cacheSavings: Double? = nil
    public var assumedTier: Bool
    public var rates: APIPricing.Rates? = nil
    public var issue: String? = nil
}
public struct ThreadUsage: Codable {
    public var input = 0
    public var cached = 0
    public var cacheWrite = 0
    public var output = 0
    public var reasoning = 0
    public var inputComplete = true
    public var outputComplete = true
    public var reasoningComplete = true
    public var cacheComplete = true
    public var pricedCalls = 0
    public var unpricedCalls = 0
    public var assumedTierCalls = 0
    public var cost = 0.0
    public var cacheSavings = 0.0
    public var costCategories = [Double](repeating: 0, count: 6)
    public var models: [String] = []
    public var issues: [String] = []
    public var source = APIPricing.source
    public var verifiedAt = APIPricing.verifiedAt
    public var configurationEffectiveDate = APIPricing.configurationEffectiveDate
    public var coverage = "Recorded unique calls; historical completeness cannot be guaranteed"
    public var cumulativeMismatch = false
    mutating func add(_ s: TokenUsageSample) {
        input += s.input; cached += s.cached; cacheWrite += max(0, s.cacheWrite)
        if s.outputRecorded != false { output += max(0, s.output) } else { outputComplete = false }
        if s.reasoningRecorded != false { reasoning += max(0, s.reasoning) } else { reasoningComplete = false }
        cacheComplete = cacheComplete && s.cachedRecorded != false && s.cacheWriteRecorded != false && s.cacheWrite >= 0 && s.cacheWrite <= s.input - s.cached
        let model = s.model ?? "Unknown model"
        if !models.contains(model) { models.append(model) }
        let p = s.price ?? APIPricing.price(s)
        if p.assumedTier { assumedTierCalls += 1 }
        if let total = p.total {
            pricedCalls += 1; cost += total; cacheSavings += p.cacheSavings ?? 0
            for (i, value) in (p.categories ?? []).enumerated() { costCategories[i] += value }
        } else {
            unpricedCalls += 1
            let issue = "\(model): \(p.issue ?? "Unavailable")"
            if !issues.contains(issue) { issues.append(issue) }
        }
    }
}
