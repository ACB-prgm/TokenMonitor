import XCTest
@testable import MonitorCore

final class CompactionValueTests: XCTestCase {
    func testBaselineFloorAndReduction() {
        for (input, reduced) in [(60_000, 40_000), (100_000, 40_000), (133_333, 40_000), (150_000, 45_000), (200_000, 60_000)] {
            XCTAssertEqual(CompactionValue.estimate(currentInput: input)?.estimatedInput, reduced)
        }
    }
    func testRepresentativeContexts() {
        for (input, calls, category) in [(60_000, 23, CompactionValue.Category.veryLow), (77_000, 13, .veryLow), (100_000, 9, .low), (120_000, 7, .medium), (150_000, 6, .medium)] {
            let value = CompactionValue.estimate(currentInput: input)
            XCTAssertEqual(value?.breakEvenCalls, calls)
            XCTAssertEqual(value?.category, category)
        }
    }
    func testStrictBreakEvenAndGenericEstimates() {
        // 1 + (40,000 + 3,600) / (0.1 * (84,000 - 40,000)) is 10.909...
        XCTAssertEqual(CompactionValue.estimate(currentInput: 84_000)?.breakEvenCalls, 11)
        // Exactly 11: strict break-even requires 12 calls, not 11.
        XCTAssertEqual(CompactionValue.estimate(currentInput: 83_600)?.breakEvenCalls, 12)
        XCTAssertEqual(CompactionValue.estimate(currentInput: 83_601)?.breakEvenCalls, 11)
        // Future estimates can still reach VERY HIGH.
        XCTAssertEqual(CompactionValue.estimate(currentInput: 500_001, postCompactionInput: 40_000)?.breakEvenCalls, 2)
        // Output cost remains even when the reduced input is zero.
        XCTAssertEqual(CompactionValue.estimate(currentInput: 36_000, postCompactionInput: 0)?.breakEvenCalls, 3)
    }
    func testCategoryBoundaries() {
        for (calls, category) in [(1, CompactionValue.Category.veryHigh), (2, .veryHigh), (3, .high), (4, .high), (5, .medium), (7, .medium), (8, .low), (12, .low), (13, .veryLow)] {
            XCTAssertEqual(CompactionValue.classify(calls: calls), category)
        }
        XCTAssertEqual(CompactionValue.classify(calls: nil), .veryLow)
        XCTAssertEqual(CompactionValue.Category.veryLow.colorLevel, 0)
    }
    func testNoSavingsAndInvalidOrExtremeInput() {
        for input in [1, 39_999, 40_000] {
            let value = CompactionValue.estimate(currentInput: input)
            XCTAssertEqual(value?.category, .veryLow)
            XCTAssertNil(value?.breakEvenCalls)
        }
        XCTAssertNil(CompactionValue.estimate(currentInput: nil))
        XCTAssertNil(CompactionValue.estimate(currentInput: 0))
        XCTAssertNil(CompactionValue.estimate(currentInput: -1))
        XCTAssertNil(CompactionValue.estimate(currentInput: 100, postCompactionInput: -1))
        XCTAssertNil(CompactionValue.estimate(currentInput: 100, postCompactionInput: 200)?.breakEvenCalls)
        XCTAssertEqual(CompactionValue.estimate(currentInput: Int.max)?.breakEvenCalls, 6)
        XCTAssertNil(CompactionValue.estimate(currentInput: Int.max, postCompactionInput: Int.max - 1)?.breakEvenCalls)
    }
    func testCacheTemperatureDoesNotChangeEconomics() {
        for input in [40_000, 60_000, 77_000, 100_000, 120_000, 150_000] {
            let baseline = CompactionValue.estimate(currentInput: input)
            for temperature in [CacheTemperature.warm, .uncertain, .presumedCold] {
                XCTAssertEqual(CompactionValue.estimate(currentInput: input, cacheTemperature: temperature), baseline)
            }
        }
    }
}
