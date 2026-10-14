import XCTest
@testable import MonitorCore

final class ContextAttributionTests: XCTestCase {
    func call(_ estimator: ContextAttributionEstimator, _ id: String, _ name: String, _ args: String = "") {
        estimator.consume(type: "response_item", payload: ["type": "function_call", "call_id": id, "name": name, "arguments": args])
    }
    func output(_ estimator: ContextAttributionEstimator, _ id: String, _ text: String) {
        estimator.consume(type: "response_item", payload: ["type": "function_call_output", "call_id": id, "output": text])
    }
    func testAggregationDeduplicationAndDenominator() {
        let e = ContextAttributionEstimator()
        call(e, "a", "read_file"); call(e, "a", "read_file")
        call(e, "b", "search"); call(e, "c", "shell")
        output(e, "a", String(repeating: "a", count: 400))
        output(e, "a", String(repeating: "a", count: 400))
        output(e, "b", String(repeating: "b", count: 200))
        output(e, "c", String(repeating: "c", count: 100))
        let s = e.snapshot(input: 1000)
        XCTAssertEqual(s.callCount, 3)
        XCTAssertEqual(s.tokens, 175)
        XCTAssertEqual(s.contributors.first?.name, "Read/Search")
        XCTAssertEqual(s.contributors.first?.calls, 2)
        XCTAssertEqual(s.percent(of: 1000), 17.5)
        XCTAssertNil(s.percent(of: nil))
        XCTAssertNil(s.percent(of: 0))
        XCTAssertLessThanOrEqual(e.snapshot(input: 10).tokens, 10)
    }
    func testSkillsRequireReadAndResultAndCatalogDoesNotCount() {
        let e = ContextAttributionEstimator()
        e.consume(type: "response_item", payload: ["type": "message", "content": "Available skills: example/SKILL.md"])
        call(e, "s", "exec", "cat /skills/example/SKILL.md")
        XCTAssertEqual(e.snapshot(input: nil).skillCount, 0)
        output(e, "s", "Skill instructions")
        XCTAssertEqual(e.snapshot(input: nil).skillCount, 1)
        XCTAssertEqual(e.snapshot(input: nil).contributors.first?.name, "Skills / example")
    }
    func testCompactionRebuildsOnlySurvivingRecords() {
        let e = ContextAttributionEstimator()
        call(e, "old", "shell"); output(e, "old", "removed")
        e.consume(type: "compacted", payload: ["replacement_history": [
            ["type": "compaction", "summary": "unattributable summary"],
            ["type": "function_call", "call_id": "kept", "name": "search", "arguments": ""],
            ["type": "function_call_output", "call_id": "kept", "output": "12345678"]
        ]])
        let s = e.snapshot(input: 100)
        XCTAssertTrue(s.afterCompaction)
        XCTAssertEqual(s.callCount, 1)
        XCTAssertEqual(s.tokens, 2)
        XCTAssertEqual(s.contributors.first?.name, "Read/Search")
    }
    func testUsageExcludesResultsProducedAfterThatInput() throws {
        let p = CodexTelemetryParser()
        func feed(_ type: String, _ payload: [String: Any], _ time: String = "2026-09-19T10:00:00Z") throws {
            p.consume(try JSONSerialization.data(withJSONObject: ["type": type, "timestamp": time, "payload": payload]))
        }
        try feed("response_item", ["type": "function_call", "call_id": "a", "name": "shell", "arguments": ""])
        try feed("response_item", ["type": "function_call_output", "call_id": "a", "output": "12345678"])
        let usage: [String: Any] = ["type": "token_count", "info": ["last_token_usage": ["input_tokens": 100]]]
        try feed("event_msg", usage)
        XCTAssertEqual(p.contextAttribution.tokens, 0)
        try feed("response_item", ["type": "message", "role": "assistant"])
        try feed("event_msg", usage, "2026-09-19T10:01:00Z")
        XCTAssertEqual(p.contextAttribution.tokens, 2)
        XCTAssertEqual(p.contextAttribution.callCount, 1)
    }
    func testParserIntegrationAndCustomWrappedCalls() throws {
        let p = CodexTelemetryParser()
        for payload: [String: Any] in [
            ["type": "custom_tool_call", "call_id": "x", "name": "exec", "input": "text(await tools.exec_command({cmd:'ls'}))"],
            ["type": "custom_tool_call_output", "call_id": "x", "output": "abcd"],
            ["type": "function_call_output", "call_id": "image", "output": [["type": "image", "data": "DO NOT COUNT BASE64"]]]
        ] {
            p.consume(try JSONSerialization.data(withJSONObject: ["type": "response_item", "payload": payload]))
        }
        let s = p.attribution.snapshot(input: 100)
        XCTAssertEqual(s.callCount, 1)
        XCTAssertEqual(s.contributors.first?.name, "Shell")
        XCTAssertEqual(ContextAttributionEstimator.estimate("abcde"), 2)
    }
}
