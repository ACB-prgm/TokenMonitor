import XCTest
@testable import MonitorCore

final class EmbeddedMonitorTests: XCTestCase {
    func usage(_ index: Int, cumulative: Bool = false, reasoning: Bool = true) throws -> Data {
        var last: [String: Any] = ["input_tokens": 100000 + index, "cached_input_tokens": 80000, "output_tokens": 20]
        if reasoning { last["reasoning_output_tokens"] = 8 }
        var info: [String: Any] = ["last_token_usage": last, "model_context_window": 200000]
        if cumulative { info["total_token_usage"] = ["output_tokens": 1000000 + index * 20, "reasoning_output_tokens": 400000 + index * 8] }
        return try JSONSerialization.data(withJSONObject: ["type": "event_msg", "timestamp": "2026-10-19T12:\(String(format: "%02d", index / 60)):\(String(format: "%02d", index % 60))Z", "payload": ["type": "token_count", "info": info]])
    }
    func fixture(_ home: URL, id: String) throws -> URL {
        let url = home.appendingPathComponent("\(id).jsonl")
        let header = try JSONSerialization.data(withJSONObject: ["type": "session_meta", "payload": ["id": id, "source": "cli"]])
        try (header + Data([10]) + usage(1, cumulative: true) + Data([10])).write(to: url)
        XCTAssertTrue(try EmbeddedHookStore(home: home).record(["hook_event_name": "Stop", "session_id": id, "transcript_path": url.path, "cwd": "/PRIVATE/workspace", "title": "Test task"]))
        return url
    }
    func testTotalsSurviveHistoryCapAndCompactionWithoutDoubleCountingThinking() throws {
        let p = CodexTelemetryParser()
        for i in 0..<130 { p.consume(try usage(i)) }
        XCTAssertEqual(p.samples.count, 120)
        XCTAssertEqual(p.outputTotals.total, 2600)
        XCTAssertEqual(p.outputTotals.reasoning, 1040)
        XCTAssertEqual(p.outputTotals.nonReasoning, 1560)
        p.consume(try usage(129))
        XCTAssertEqual(p.outputTotals.total, 2600)
        p.consume(Data(#"{"type":"compacted","timestamp":"2026-10-19T12:03:00Z","payload":{}}"#.utf8))
        XCTAssertEqual(p.outputTotals.total, 2600)
        p.consume(try usage(200, cumulative: true))
        XCTAssertEqual(p.outputTotals.total, 1004000)
        XCTAssertEqual(p.outputTotals.reasoning, 401600)
        p.consume(try usage(201))
        XCTAssertEqual(p.outputTotals.total, 1004020)
        XCTAssertEqual(p.outputTotals.reasoning, 401608)
    }
    func testMissingReasoningIsUnknownAndCumulativeOnlyEventsAreAccepted() throws {
        let p = CodexTelemetryParser(); p.consume(try usage(1, reasoning: false))
        XCTAssertEqual(p.samples.last?.reasoningRecorded, false)
        XCTAssertNil(p.outputTotals.reasoning); XCTAssertNil(p.outputTotals.nonReasoning)
        p.consume(Data(#"{"type":"event_msg","payload":{"type":"token_count","info":{"total_token_usage":{"output_tokens":500,"reasoning_output_tokens":600}}}}"#.utf8))
        XCTAssertEqual(p.outputTotals.total, 500); XCTAssertNil(p.outputTotals.reasoning)
        p.consume(Data(#"{"type":"event_msg","payload":{"type":"token_count","info":{"total_token_usage":{"output_tokens":800,"reasoning_output_tokens":200}}}}"#.utf8))
        XCTAssertEqual(p.outputTotals.nonReasoning, 600); XCTAssertEqual(p.callCount, 1)
    }
    func testEmbeddedSnapshotMatchesParserAndNeverExportsSourcePathsOrText() throws {
        let home = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: home, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: home) }
        let file = try fixture(home, id: "a")
        let store = EmbeddedTelemetryStore(home: home)
        let s = try XCTUnwrap(store.snapshot(id: "a"))
        let p = CodexTelemetryParser(); p.consume(try usage(1, cumulative: true))
        XCTAssertEqual(s.samples, p.samples); XCTAssertEqual(s.callCount, p.callCount)
        XCTAssertEqual(s.outputTotals, p.outputTotals); XCTAssertEqual(s.attribution, p.contextAttribution)
        XCTAssertEqual(s.fresh, p.samples.last?.fresh)
        XCTAssertEqual(s.contextHealth, TokenHealth.context(percent: 50.0005))
        XCTAssertEqual(s.compactionValue?.breakEvenCalls, CompactionValue.estimate(currentInput: 100001)?.breakEvenCalls)
        XCTAssertEqual(s.task?.workspace, "workspace")
        let json = String(decoding: try JSONEncoder().encode(s), as: UTF8.self)
        XCTAssertFalse(json.contains(home.path)); XCTAssertFalse(json.contains("PRIVATE")); XCTAssertFalse(json.contains("transcript"))
        XCTAssertNil(store.snapshot(id: "../a")); XCTAssertNil(store.snapshot(id: file.path))
        try FileManager.default.removeItem(at: file)
        let unavailable = try XCTUnwrap(store.snapshot(id: "a"))
        XCTAssertFalse(unavailable.available); XCTAssertEqual(unavailable.samples, s.samples)
    }
    func testIndependentCollectorsPartialWritesReplacementAndIdleRelease() throws {
        let home = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: home, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: home) }
        let a = try fixture(home, id: "a"); _ = try fixture(home, id: "b")
        let store = EmbeddedTelemetryStore(home: home), now = Date()
        XCTAssertEqual(store.snapshot(id: "a", now: now)?.callCount, 1)
        XCTAssertEqual(store.snapshot(id: "b", now: now)?.callCount, 1)
        let append = try usage(2)
        let f = try FileHandle(forWritingTo: a); try f.seekToEnd()
        try f.write(contentsOf: append.prefix(append.count / 2))
        XCTAssertEqual(store.snapshot(id: "a", now: now)?.callCount, 1)
        try f.write(contentsOf: append.dropFirst(append.count / 2) + Data([10])); try f.close()
        XCTAssertEqual(store.snapshot(id: "a", now: now)?.callCount, 2)
        XCTAssertEqual(store.snapshot(id: "b", now: now)?.callCount, 1)
        _ = try fixture(home, id: "a") // atomic/truncation tail reset
        XCTAssertEqual(store.snapshot(id: "a", now: now)?.callCount, 1)
        XCTAssertEqual(store.activeCollectorCount, 2)
        store.prune(now: now.addingTimeInterval(60)); XCTAssertEqual(store.activeCollectorCount, 0)
    }
    func testHookRejectsMismatchedOutsideAndInternalSessionsAndPreservesPerTaskState() throws {
        let home = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: home, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: home) }
        let a = try fixture(home, id: "a"); _ = try fixture(home, id: "b")
        let hooks = EmbeddedHookStore(home: home)
        XCTAssertEqual(hooks.latest?.session.session_id, "b")
        XCTAssertEqual(hooks.task("a")?.session.transcript_path, a.path)
        XCTAssertTrue(try hooks.record(["hook_event_name": "PreCompact", "session_id": "a"]))
        XCTAssertEqual(hooks.latest?.session.hook_event_name, "PreCompact")
        XCTAssertEqual(hooks.task("b")?.session.hook_event_name, "Stop")
        XCTAssertFalse(try hooks.record(["hook_event_name": "Stop", "session_id": "wrong", "transcript_path": a.path]))
        XCTAssertFalse(try hooks.record(["hook_event_name": "Stop", "session_id": "../bad", "transcript_path": a.path]))
        XCTAssertFalse(EmbeddedPaths.accepts("/etc/passwd", id: "a", home: home))
        let internalFile = home.appendingPathComponent("internal.jsonl")
        try Data(#"{"type":"session_meta","payload":{"id":"internal","source":{"subagent":{}}}}"#.utf8 + [10]).write(to: internalFile)
        XCTAssertFalse(try hooks.record(["hook_event_name": "Stop", "session_id": "internal", "transcript_path": internalFile.path]))
    }
}
