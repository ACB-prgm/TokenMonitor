import XCTest
@testable import MonitorCore

final class TokenHealthTests: XCTestCase {
    func testContextBoundariesAndMidpoints() {
        for (percent, expected) in [(0.0, 0.0), (40, 0), (45, 0.5), (50, 1), (57.5, 1.5), (65, 2), (70, 2.5), (75, 3), (100, 3), (150, 3)] {
            XCTAssertEqual(TokenHealth.context(percent: percent), expected, accuracy: 1e-10)
        }
        for boundary in [40.0, 50, 65, 75] {
            XCTAssertEqual(TokenHealth.context(percent: boundary - 0.000001), TokenHealth.context(percent: boundary + 0.000001), accuracy: 0.000001)
        }
    }

    func testFreshFloorBoundariesAndInterpolation() {
        XCTAssertEqual(TokenHealth.fresh(tokens: 1_999, input: 1_999), 0)
        XCTAssertEqual(TokenHealth.fresh(tokens: 2_000, input: 2_000), 3)
        for (tokens, expected) in [(2_000, 0.0), (10_000, 0), (17_500, 0.5), (25_000, 1), (31_250, 1.5), (37_500, 2), (43_750, 2.5), (50_000, 3), (50_001, 3), (100_000, 3)] {
            XCTAssertEqual(TokenHealth.fresh(tokens: tokens, input: 100_000), expected, accuracy: 1e-10)
        }
        for boundary in [10_000, 25_000, 37_500, 50_000] {
            XCTAssertEqual(TokenHealth.fresh(tokens: boundary - 1, input: 100_000), TokenHealth.fresh(tokens: boundary + 1, input: 100_000), accuracy: 0.001)
        }
    }

    func testMissingAndInvalidTelemetryStaysNeutral() {
        for percent: Double? in [nil, .nan, .infinity, -.infinity, -10] {
            XCTAssertEqual(TokenHealth.context(percent: percent), 0)
        }
        for (tokens, input): (Int?, Int?) in [(nil, 10_000), (2_000, nil), (2_000, 0), (-2_000, 5_000), (6_000, 5_000)] {
            XCTAssertEqual(TokenHealth.fresh(tokens: tokens, input: input), 0)
        }
    }

    func testExamplesAndContextDenominator() {
        XCTAssertEqual(TokenHealth.fresh(tokens: 1_100, input: 29_000), 0)
        XCTAssertEqual(TokenHealth.context(percent: 11), 0)
        XCTAssertEqual(TokenHealth.fresh(tokens: 235, input: 176_747), 0)
        let context = TokenHealth.context(percent: Formatting.percent(176_747, limit: 258_000))
        XCTAssertGreaterThan(context, 2); XCTAssertLessThan(context, 3)
        XCTAssertEqual(TokenHealth.fresh(tokens: 172_200, input: 172_200), 3)
        XCTAssertGreaterThan(TokenHealth.context(percent: Formatting.percent(172_200, limit: 258_000)), 2)
        XCTAssertEqual(TokenHealth.context(percent: Formatting.percent(172_200, limit: 1_000_000)), 0)
        XCTAssertEqual(TokenHealth.context(percent: Formatting.percent(172_200, limit: nil)), 0)
    }

    func testPaletteInterpolationAndClampingInBothAppearances() {
        for dark in [false, true] {
            let neutral = TokenHealth.RGB(dark ? 1 : 0, dark ? 1 : 0, dark ? 1 : 0)
            func color(_ level: Double) -> TokenHealth.RGB { TokenHealth.color(level: level, dark: dark, neutral: neutral) }
            XCTAssertEqual(color(0), neutral)
            XCTAssertEqual(color(-1), neutral)
            XCTAssertEqual(color(.nan), neutral)
            XCTAssertEqual(color(4), color(3))
            for level in 0..<3 {
                let a = color(Double(level)), b = color(Double(level + 1)), mid = color(Double(level) + 0.5)
                XCTAssertEqual(mid.red, (a.red + b.red) / 2, accuracy: 1e-10)
                XCTAssertEqual(mid.green, (a.green + b.green) / 2, accuracy: 1e-10)
                XCTAssertEqual(mid.blue, (a.blue + b.blue) / 2, accuracy: 1e-10)
            }
            for boundary in [1.0, 2, 3] {
                let a = color(boundary - 0.000001), b = color(boundary + 0.000001)
                XCTAssertEqual(a.red, b.red, accuracy: 0.00001)
                XCTAssertEqual(a.green, b.green, accuracy: 0.00001)
                XCTAssertEqual(a.blue, b.blue, accuracy: 0.00001)
            }
        }
        let neutral = TokenHealth.RGB(0, 0, 0)
        XCTAssertNotEqual(TokenHealth.color(level: 1, dark: true, neutral: neutral), TokenHealth.color(level: 1, dark: false, neutral: neutral))
    }
}
