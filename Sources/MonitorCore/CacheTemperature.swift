import Foundation

public enum CacheTemperature: String {
    case warm = "WARM", uncertain = "UNCERTAIN", presumedCold = "PRES. COLD"
    public static let warmDuration: TimeInterval = 30 * 60
    public static let uncertainDuration: TimeInterval = 120 * 60

    /// A single pending transition; recompute after it fires, on wake, or on a new call.
    public struct Schedule: Equatable {
        public let temperature: CacheTemperature?
        public let nextTransition: Date?
    }
    public static func schedule(lastCall: Date?, now: Date) -> Schedule {
        guard let lastCall else { return Schedule(temperature: nil, nextTransition: nil) }
        let age = now.timeIntervalSince(lastCall)
        if age < warmDuration {
            return Schedule(temperature: .warm, nextTransition: lastCall.addingTimeInterval(warmDuration))
        }
        if age <= uncertainDuration {
            // Exactly 120 minutes is still uncertain. Fire just beyond that boundary.
            return Schedule(temperature: .uncertain, nextTransition: lastCall.addingTimeInterval(uncertainDuration + 0.001))
        }
        return Schedule(temperature: .presumedCold, nextTransition: nil)
    }
}
