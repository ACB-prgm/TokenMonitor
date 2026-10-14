import Foundation

/// Cost-only comparison including estimated compaction output. The common
/// current-context read cancels; cache temperature does not affect the estimate.
public struct CompactionValue: Equatable {
    public static let cachedToFreshCostRatio = 0.10
    public static let estimatedCompactionOutputTokens = 3_600
    public static let minimumPostCompactContext = 40_000
    public static let retainedContextRatio = 0.30
    public static let compactionOutputCostWeight = 1.0

    public enum Category: String {
        case veryLow = "VERY LOW", low = "LOW", medium = "MEDIUM", high = "HIGH", veryHigh = "VERY HIGH"
        public var colorLevel: Double {
            switch self {
            case .veryLow, .low: return 0
            case .medium: return 1
            case .high: return 2
            case .veryHigh: return 3
            }
        }
    }
    public let currentInput: Int
    /// Rounded only for display; the cost calculation uses the unrounded estimate.
    public let estimatedInput: Int
    public let breakEvenCalls: Int?
    public var category: Category { Self.classify(calls: breakEvenCalls) }

    public static func classify(calls: Int?) -> Category {
        guard let calls else { return .veryLow }
        switch calls {
        case ...2: return .veryHigh
        case 3...4: return .high
        case 5...7: return .medium
        case 8...12: return .low
        default: return .veryLow
        }
    }

    /// An override keeps the calculation useful for future compaction estimates.
    /// Cache temperature is accepted for compatibility but intentionally ignored.
    /// A nil break-even means the estimate cannot make compaction cheaper.
    public static func estimate(currentInput: Int?, postCompactionInput: Int? = nil, cacheTemperature _: CacheTemperature? = nil) -> Self? {
        guard let currentInput, currentInput > 0,
              postCompactionInput.map({ $0 >= 0 }) ?? true else { return nil }
        let current = Double(currentInput)
        let reduced = postCompactionInput.map(Double.init) ?? max(current * retainedContextRatio, Double(minimumPostCompactContext))
        let display = postCompactionInput ?? Int(reduced.rounded())
        var calls: Int?
        if current > reduced {
            // Do not charge the current-context read shared by both choices.
            let outputCost = compactionOutputCostWeight * Double(estimatedCompactionOutputTokens)
            let raw = 1 + (reduced + outputCost) / (cachedToFreshCostRatio * (current - reduced))
            // Strictly greater, including exact integral break-even values.
            let whole = floor(raw) + 1
            if whole.isFinite, whole < Double(Int.max) { calls = Int(whole) }
        }
        return Self(currentInput: currentInput, estimatedInput: display, breakEvenCalls: calls)
    }
}
