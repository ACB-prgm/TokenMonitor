import XCTest
@testable import MonitorCore

final class CacheTemperatureTests: XCTestCase {
    let call = Date(timeIntervalSince1970: 1_000_000)
    func testThresholds() {
        for (minutes, expected) in [(29.0, CacheTemperature.warm), (30.0, .uncertain), (120.0, .uncertain), (120.001, .presumedCold)] {
            XCTAssertEqual(CacheTemperature.schedule(lastCall: call, now: call.addingTimeInterval(minutes * 60)).temperature, expected)
        }
        XCTAssertNil(CacheTemperature.schedule(lastCall: nil, now: call).temperature)
        XCTAssertNil(CacheTemperature.schedule(lastCall: nil, now: call).nextTransition)
    }
    func testOneShotTransitionsAndRefreshAfterNewCall() throws {
        let warm = CacheTemperature.schedule(lastCall: call, now: call.addingTimeInterval(29 * 60))
        XCTAssertEqual(warm.nextTransition, call.addingTimeInterval(30 * 60))
        let uncertain = CacheTemperature.schedule(lastCall: call, now: try XCTUnwrap(warm.nextTransition))
        XCTAssertEqual(uncertain.temperature, .uncertain)
        XCTAssertGreaterThan(try XCTUnwrap(uncertain.nextTransition), call.addingTimeInterval(120 * 60))
        let cold = CacheTemperature.schedule(lastCall: call, now: try XCTUnwrap(uncertain.nextTransition))
        XCTAssertEqual(cold.temperature, .presumedCold)
        XCTAssertNil(cold.nextTransition)
        let newCall = call.addingTimeInterval(150 * 60)
        let reset = CacheTemperature.schedule(lastCall: newCall, now: newCall)
        XCTAssertEqual(reset.temperature, .warm)
        XCTAssertEqual(reset.nextTransition, newCall.addingTimeInterval(30 * 60))
        XCTAssertNotEqual(reset.nextTransition, warm.nextTransition)
        // Wake skips missed transitions instead of replaying stale warm/uncertain state.
        XCTAssertEqual(CacheTemperature.schedule(lastCall: call, now: newCall), cold)
        XCTAssertEqual(CacheTemperature.schedule(lastCall: newCall, now: newCall.addingTimeInterval(45 * 60)).temperature, .uncertain)
    }
}
