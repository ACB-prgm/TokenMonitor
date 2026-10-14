import XCTest
@testable import MonitorCore

final class TelemetryTests: XCTestCase {
    func event(input: Int = 176747, cached: Int = 176512, output: Int = 63, stamp: String = "2026-09-19T05:29:08.462Z", extras: [String: Any] = [:]) -> Data {
        var usage: [String: Any] = ["input_tokens": input, "cached_input_tokens": cached, "output_tokens": output]
        usage.merge(extras) { _, new in new }
        return try! JSONSerialization.data(withJSONObject: ["timestamp": stamp, "type": "event_msg", "payload": ["type": "token_count", "info": ["last_token_usage": usage, "model_context_window": 258400]]])
    }
    func testCompactionRefreshesContextWithoutInventingCallUsage() {
        let p = CodexTelemetryParser()
        p.consume(event())
        let compact = Data(#"{"timestamp":"2026-09-19T05:29:09Z","type":"compacted","payload":{}}"#.utf8)
        p.consume(compact)
        XCTAssertTrue(p.awaitingPostCompactionCall)
        XCTAssertNil(p.compactedContext)
        let bookkeeping = event(input: 0, cached: 0, output: 0, stamp: "2026-09-19T05:29:10Z", extras: ["total_tokens": 22984])
        p.consume(bookkeeping)
        XCTAssertEqual(p.compactedContext, 22984)
        XCTAssertEqual(p.callCount, 1)
        XCTAssertEqual(p.samples.last?.input, 176747)
        p.consume(compact) // A replay must not erase the reduced context.
        XCTAssertEqual(p.compactedContext, 22984)
        p.consume(event(input: 30000, cached: 20000, stamp: "2026-09-19T05:30:00Z"))
        XCTAssertFalse(p.awaitingPostCompactionCall)
        XCTAssertNil(p.compactedContext)
        XCTAssertEqual(p.samples.last?.fresh, 10000)
        XCTAssertEqual(p.callCount, 2)
        p.consume(bookkeeping)
        XCTAssertFalse(p.awaitingPostCompactionCall)
        XCTAssertNil(p.compactedContext)
    }
    func testAutomaticTasksRejectInternalAndUnknownSessions() throws {
        func header(_ source: Any, id: String = "task") throws -> Data {
            try JSONSerialization.data(withJSONObject: ["type": "session_meta", "payload": ["id": id, "source": source, "cwd": "/"]])
        }
        XCTAssertTrue(AutomaticTask.accepts(header: try header("vscode"), sessionID: "task"))
        XCTAssertTrue(AutomaticTask.accepts(header: try header("cli"), sessionID: "task"))
        XCTAssertFalse(AutomaticTask.accepts(header: try header(["subagent": ["other": "guardian"]]), sessionID: "task"))
        XCTAssertFalse(AutomaticTask.accepts(header: try header(["subagent": ["thread_spawn": ["parent_thread_id": "parent"]]]), sessionID: "task"))
        XCTAssertFalse(AutomaticTask.accepts(header: try header("vscode", id: "other"), sessionID: "task"))
        XCTAssertFalse(AutomaticTask.accepts(header: Data("{}".utf8), sessionID: "task"))
        XCTAssertFalse(AutomaticTask.accepts(transcriptPath: nil, sessionID: "task"))
        let file = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: file) }
        try (header("vscode") + Data([10])).write(to: file)
        XCTAssertTrue(AutomaticTask.accepts(transcriptPath: file.path, sessionID: "task"))
    }
    func testCompactionMarkersAndHistoryWindow() {
        let p = CodexTelemetryParser()
        p.consume(event())
        let compact = Data(#"{"timestamp":"2026-09-19T05:29:09Z","type":"compacted","payload":{}}"#.utf8)
        p.consume(compact); p.consume(compact)
        XCTAssertEqual(p.compactions.count, 1)
        XCTAssertEqual(p.visibleCompactions.first?.callPosition, 0.5)
        XCTAssertEqual(p.callCount, 1)
        p.consume(event(input: 100, cached: 0, stamp: "2026-09-19T05:30:00Z"))
        XCTAssertEqual(p.visibleCompactions.first?.callPosition, 0.5)
        for n in 1...130 {
            p.consume(event(input: n, cached: 0, stamp: "2026-09-19T06:\(String(format: "%02d", n / 60)):\(String(format: "%02d", n % 60))Z"))
        }
        XCTAssertTrue(p.visibleCompactions.isEmpty)
        p.consume(Data(#"{"type":"compacted","payload":{}}"#.utf8))
        XCTAssertEqual(p.compactions.count, 1)
    }
    func testRecentChartDomainExcludesDiscardedCalls() {
        XCTAssertEqual(RecentCallsChart.domain(callCount: 233, sampleCount: 120, compactions: []), 113...232)
        let marker = CompactionEvent(timestamp: Date(), callPosition: 232.5)
        XCTAssertEqual(RecentCallsChart.domain(callCount: 233, sampleCount: 120, compactions: [marker]), 113...232.5)
        XCTAssertEqual(RecentCallsChart.domain(callCount: 1, sampleCount: 1, compactions: []), 0...1)
        XCTAssertEqual(RecentCallsChart.domain(callCount: 0, sampleCount: 0, compactions: []), 0...1)
    }
    func testCompactionStatus() {
        let start = Date(timeIntervalSince1970: 100)
        let before = start.addingTimeInterval(-1), after = start.addingTimeInterval(1)
        XCTAssertTrue(CompactionStatus.isActive(event: "PreCompact", started: start, completed: before, latestCall: before))
        XCTAssertFalse(CompactionStatus.isActive(event: "PreCompact", started: start, completed: after, latestCall: before))
        XCTAssertFalse(CompactionStatus.isActive(event: "PreCompact", started: start, completed: before, latestCall: after))
        for event in ["PostCompact", "Stop", "UserPromptSubmit", "SessionEnd"] {
            XCTAssertFalse(CompactionStatus.isActive(event: event, started: start, completed: nil, latestCall: nil))
        }
        XCTAssertFalse(CompactionStatus.isActive(event: "PreCompact", started: nil, completed: nil, latestCall: nil))
    }
    func testUsageAndExamples() {
        let p = CodexTelemetryParser(); p.consume(event())
        let s = p.samples.last!
        XCTAssertEqual(s.fresh, 235); XCTAssertEqual(s.reasoning, 0)
        XCTAssertEqual("Cached \(Formatting.tokens(s.cached)) > Fresh \(Formatting.tokens(s.fresh)) > Input \(Formatting.tokens(s.input))", "Cached 176.5k > Fresh 235 > Input 176.7k")
        XCTAssertNil(p.fiveHour); XCTAssertNil(p.weekly)
        p.consume(event(input: 28072, cached: 20352, output: 5, stamp: "2026-09-19T05:29:10Z"))
        XCTAssertEqual(p.samples.last!.fresh, 7720)
        XCTAssertEqual(Formatting.tokens(p.samples.last!.cached), "20.4k")
        XCTAssertEqual(Formatting.tokens(p.samples.last!.input), "28.1k")
    }
    func testZeroMalformedMissingAndInvalid() {
        let p = CodexTelemetryParser(); p.consume(event(input: 20, cached: 0))
        p.consume(event(input: 0, cached: 0)); p.consume(Data("bad".utf8)); p.consume(Data("{}".utf8))
        p.consume(event(input: 10, cached: 11))
        XCTAssertEqual(p.samples.count, 1); XCTAssertEqual(p.samples[0].fresh, 20)
        XCTAssertEqual(p.samples[0].cacheHit, 0)
    }
    func testHistoryCompactionAndDeduplication() {
        let p = CodexTelemetryParser()
        let first = event(); p.consume(first); p.consume(first)
        p.consume(event(input: 100, cached: 90, stamp: "2026-09-19T05:30:00Z"))
        XCTAssertEqual(p.samples.map(\.input), [176747, 100])
        XCTAssertEqual(p.callCount, 2)
        for n in 1...130 { p.consume(event(input: n, cached: 0, stamp: "2026-09-19T06:\(String(format: "%02d", n / 60)):\(String(format: "%02d", n % 60))Z")) }
        XCTAssertEqual(p.samples.count, 120)
    }
    func testAllowanceOnBookkeepingEvent() {
        let p = CodexTelemetryParser()
        let d: [String: Any] = ["type": "event_msg", "payload": ["type": "token_count", "info": NSNull(), "rate_limits": ["primary": ["used_percent": 48.0, "window_minutes": 300, "resets_at": 1790000000], "secondary": ["used_percent": 71.0, "window_minutes": 10080]]]]
        p.consume(try! JSONSerialization.data(withJSONObject: d))
        XCTAssertEqual(p.fiveHour?.used, 48); XCTAssertEqual(p.weekly?.used, 71)
        XCTAssertEqual(p.fiveHour?.reset?.timeIntervalSince1970, 1790000000)
        XCTAssertTrue(p.samples.isEmpty)
    }
    func testTitleSanitization() {
        XCTAssertNil(CodexTelemetryParser.cleanTitle("# Files mentioned by the user: attachment"))
        XCTAssertEqual(CodexTelemetryParser.cleanTitle("  A task\nwith spaces  "), "A task with spaces")
        XCTAssertEqual(CodexTelemetryParser.cleanTitle(String(repeating: "a", count: 200))?.count, 90)
    }
    func testQuotaWindowIsNotAssumed() {
        let p = CodexTelemetryParser()
        p.consume(Data(#"{"type":"event_msg","payload":{"type":"token_count","rate_limits":{"primary":{"used_percent":50,"window_minutes":60}}}}"#.utf8))
        XCTAssertNil(p.fiveHour)
    }
    func testTruncateAndRegrowPastOldOffset() throws {
        let path = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: path) }
        let tail = JSONLTail(); var p = CodexTelemetryParser()
        func read() throws { try tail.read(path.path, reset: { p = CodexTelemetryParser() }, line: { p.consume($0) }) }
        try (event(input: 10, cached: 0) + Data([10])).write(to: path)
        try read()
        let f = try FileHandle(forWritingTo: path)
        try f.truncate(atOffset: 0)
        try f.write(contentsOf: event(input: 100000, cached: 0) + Data([10]) + Data("{}\n".utf8)); try f.close()
        try read()
        XCTAssertEqual(p.samples.map(\.input), [100000])
    }
    func testFormatting() {
        XCTAssertEqual(Formatting.tokens(250), "250"); XCTAssertEqual(Formatting.tokens(1200000), "1.2M")
        XCTAssertEqual(Formatting.percent(100, limit: 400), 25)
        XCTAssertNil(Formatting.percent(100, limit: nil)); XCTAssertNil(Formatting.percent(100, limit: 0))
        let date = Date(timeIntervalSince1970: 1790000000)
        let f = DateFormatter(); f.dateStyle = .none; f.timeStyle = .short
        XCTAssertEqual(Formatting.time(date), f.string(from: date))
    }
    func testTailPartialAppendTruncateAndReplacement() throws {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: dir) }
        let path = dir.appendingPathComponent("rollout.jsonl")
        let tail = JSONLTail(); var p = CodexTelemetryParser()
        func read() throws { try tail.read(path.path, reset: { p = CodexTelemetryParser() }, line: { p.consume($0) }) }
        let a = event()
        try a.prefix(a.count / 2).write(to: path); try read(); XCTAssertTrue(p.samples.isEmpty)
        let f = try FileHandle(forWritingTo: path); try f.seekToEnd(); try f.write(contentsOf: a.suffix(a.count - a.count / 2) + Data([10])); try f.close()
        try read(); XCTAssertEqual(p.samples.count, 1)
        try read(); XCTAssertEqual(p.samples.count, 1)
        try Data("{}\n".utf8).write(to: path); try read(); XCTAssertTrue(p.samples.isEmpty)
        try (event(input: 200, cached: 0) + Data([10])).write(to: path, options: .atomic)
        try read(); XCTAssertEqual(p.samples.last?.input, 200)
    }
    func testWatcherDeliversAppendAndAtomicReplacement() throws {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: dir) }
        let path = dir.appendingPathComponent("active.json")
        try Data("first".utf8).write(to: path)
        let changed = expectation(description: "atomic replacement delivered")
        let q = DispatchQueue(label: "test.watch")
        var fulfilled = false
        let watcher = FileWatcher(path: path.path, queue: q) {
            if (try? String(contentsOf: path)) == "second", !fulfilled { fulfilled = true; changed.fulfill() }
        }
        try Data("second".utf8).write(to: path, options: .atomic)
        wait(for: [changed], timeout: 2)
        withExtendedLifetime(watcher) {}
    }
}
