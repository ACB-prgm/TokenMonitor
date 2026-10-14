/// Continuous semantic health: 0 = neutral, 1 = amber, 2 = orange, 3 = red.
/// Independent of UI frameworks so thresholds and color interpolation are testable.
public enum TokenHealth {
    public static func context(percent: Double?) -> Double {
        guard let percent, percent.isFinite else { return 0 }
        return ramp(percent, stops: [40, 50, 65, 75])
    }

    public static func fresh(tokens: Int?, input: Int?) -> Double {
        guard let tokens, let input, tokens >= 2_000, input > 0, tokens <= input else { return 0 }
        // Reach red at 50% continuously, passing orange halfway through 25–50%.
        return ramp(Double(tokens) / Double(input) * 100, stops: [10, 25, 37.5, 50])
    }

    private static func ramp(_ value: Double, stops: [Double]) -> Double {
        if value <= stops[0] { return 0 }
        for index in 1..<stops.count where value < stops[index] {
            return Double(index - 1) + (value - stops[index - 1]) / (stops[index] - stops[index - 1])
        }
        return 3
    }

    public struct RGB: Equatable {
        public let red: Double
        public let green: Double
        public let blue: Double
        public init(_ red: Double, _ green: Double, _ blue: Double) {
            self.red = red; self.green = green; self.blue = blue
        }
        fileprivate func mixed(with other: RGB, amount: Double) -> RGB {
            RGB(red + (other.red - red) * amount,
                green + (other.green - green) * amount,
                blue + (other.blue - blue) * amount)
        }
    }

    /// Darker warning inks on light surfaces; lighter inks on dark surfaces.
    /// The caller supplies the system's resolved primary text color for neutral.
    public static func color(level: Double, dark: Bool, neutral: RGB) -> RGB {
        let stops = dark
            ? [neutral, RGB(0.90, 0.72, 0.32), RGB(0.96, 0.57, 0.30), RGB(1.00, 0.43, 0.41)]
            : [neutral, RGB(0.55, 0.36, 0.02), RGB(0.72, 0.28, 0.04), RGB(0.78, 0.16, 0.14)]
        guard level.isFinite, level > 0 else { return neutral }
        let bounded = min(3, level)
        let lower = min(2, Int(bounded))
        return stops[lower].mixed(with: stops[lower + 1], amount: bounded - Double(lower))
    }
}
