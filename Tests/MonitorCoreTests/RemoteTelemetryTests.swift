import XCTest
@testable import MonitorCore

final class RemoteTelemetryTests: XCTestCase {
    func testSelectionScopesLocksByMachine() {
        var selection = SourceSelection()
        XCTAssertTrue(selection.receiveHook(source: "local", id: "same"))
        selection.toggleLock()
        XCTAssertFalse(selection.receiveHook(source: "studio", id: "same"))
        XCTAssertTrue(selection.receiveHook(source: "local", id: "same"))
        selection.select(source: "studio", id: "other")
        XCTAssertTrue(selection.isLocked)
        XCTAssertFalse(selection.receiveHook(source: "local", id: "other"))
        selection.toggleLock()
        XCTAssertTrue(selection.receiveHook(source: "local", id: "new"))
    }
    func testFrameSplitAndMultipleMessages() throws {
        let first = try RemoteMessage(kind: "hello").encodedLine()
        let second = try RemoteMessage(kind: "select", taskID: "task").encodedLine()
        var decoder = RemoteLineDecoder()
        XCTAssertTrue(try decoder.consume(first.prefix(5)).isEmpty)
        let lines = try decoder.consume(Data(first.dropFirst(5)) + second)
        XCTAssertEqual(lines.count, 2)
        XCTAssertEqual(try RemoteMessage.decode(lines[0]).kind, "hello")
        XCTAssertEqual(try RemoteMessage.decode(lines[1]).taskID, "task")
    }
    func testOversizedMalformedAndIncompatibleMessagesFail() throws {
        var decoder = RemoteLineDecoder()
        XCTAssertThrowsError(try decoder.consume(Data(repeating: 65, count: RemoteLineDecoder.maximumBytes + 1)))
        XCTAssertThrowsError(try RemoteMessage.decode(Data("invalid".utf8)))
        var message = RemoteMessage(kind: "hello"); message.version = 999
        XCTAssertThrowsError(try RemoteMessage.decode(JSONEncoder().encode(message)))
    }
    func testSnapshotParityAndPrivacy() throws {
        let parser = CodexTelemetryParser()
        parser.consume(Data(#"{"type":"event_msg","timestamp":"2026-10-11T12:00:00Z","payload":{"type":"token_count","info":{"last_token_usage":{"input_tokens":1000,"cached_input_tokens":750,"output_tokens":30,"reasoning_output_tokens":10,"total_tokens":1030},"model_context_window":10000}}}"#.utf8))
        var snapshot = Snapshot()
        snapshot.session = ActiveSession(session_id: "session", transcript_path: "/secret/transcript.jsonl", cwd: "/secret/workspace", title: "unsafe original")
        snapshot.title = "Derived title"; snapshot.samples = parser.samples; snapshot.callCount = parser.callCount
        snapshot.contextLimit = parser.contextLimit
        let message = RemoteMessage(kind: "snapshot", snapshot: snapshot.remoteSafe)
        let data = try JSONEncoder().encode(message)
        let text = String(decoding: data, as: UTF8.self)
        XCTAssertFalse(text.contains("secret")); XCTAssertFalse(text.contains("unsafe original"))
        let restored = try XCTUnwrap(RemoteMessage.decode(data).snapshot)
        XCTAssertEqual(restored.samples, snapshot.samples)
        XCTAssertEqual(restored.last?.fresh, 250)
        XCTAssertEqual(restored.contextPercent, snapshot.contextPercent)
        XCTAssertNil(restored.session?.transcript_path)
        XCTAssertEqual(restored.session?.cwd, "workspace")
    }
    func testSSHArgumentsCannotInjectCommands() throws {
        var config = RemoteConfiguration()
        config.label = "Studio"; config.host = "mac-studio.local"; config.user = "aaronbastian"
        config.identityFile = "/tmp/identity with spaces"
        try config.validate()
        XCTAssertTrue(config.sshArguments.contains(config.identityFile))
        XCTAssertTrue(config.sshArguments.contains("StrictHostKeyChecking=yes"))
        XCTAssertTrue(config.sshArguments.contains("BatchMode=yes"))
        config.host = "host; touch /tmp/pwned"
        XCTAssertThrowsError(try config.validate())
        config.host = "-oProxyCommand=bad"
        XCTAssertThrowsError(try config.validate())
    }
    func testCollectorBaselineCannotUndoSelectedTask() throws {
        let temp = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: temp, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: temp) }
        let selectedFile = temp.appendingPathComponent("selected.jsonl")
        let baselineFile = temp.appendingPathComponent("baseline.jsonl")
        try Data().write(to: selectedFile); try Data().write(to: baselineFile)
        let collector = TelemetryCollector(home: temp)
        let published = expectation(description: "selected snapshot")
        collector.onSnapshot = { snapshot in
            XCTAssertEqual(snapshot.session?.session_id, "selected")
            published.fulfill()
        }
        collector.selectSession(ActiveSession(session_id: "selected", transcript_path: selectedFile.path))
        collector.selectBaseline(ActiveSession(session_id: "baseline", transcript_path: baselineFile.path))
        wait(for: [published], timeout: 2)
    }
    func testRemoteSelectionPreservesCurrentCompactionHookWithoutRecentRow() throws {
        let home = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let root = home.appendingPathComponent("usage-monitor")
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: home) }
        let transcript = home.appendingPathComponent("session.jsonl")
        try Data(#"{"type":"session_meta","payload":{"id":"task"}}"#.utf8).appendingNewline().write(to: transcript)
        try NativeHookBridge.write(["session_id": "task", "transcript_path": transcript.path, "hook_event_name": "PreCompact", "updated_at": "2026-10-11T12:00:00Z"], to: root.appendingPathComponent("active-session.json"))
        let collector = TelemetryCollector(home: home, restrictToCodexHome: true)
        let published = expectation(description: "compaction hook retained")
        collector.onHook = { session, _ in collector.selectDiscovered(id: session.session_id) }
        collector.onSnapshot = { snapshot in
            XCTAssertTrue(snapshot.isCompacting)
            XCTAssertEqual(snapshot.session?.hook_event_name, "PreCompact")
            published.fulfill()
        }
        collector.start()
        wait(for: [published], timeout: 2)
    }
    func testMissingRemoteTaskReportsUnavailable() {
        let collector = TelemetryCollector(home: FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString), restrictToCodexHome: true)
        let unavailable = expectation(description: "missing task reported")
        collector.onUnavailable = { id in XCTAssertEqual(id, "missing"); unavailable.fulfill() }
        collector.selectDiscovered(id: "missing")
        wait(for: [unavailable], timeout: 2)
    }
    func testRemoteCollectorRejectsOutsideTranscript() throws {
        let base = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let home = base.appendingPathComponent("codex")
        let root = home.appendingPathComponent("usage-monitor")
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: base) }
        let outside = base.appendingPathComponent("outside.jsonl")
        try Data(#"{"type":"session_meta","payload":{"id":"task"}}"#.utf8).appendingNewline().write(to: outside)
        try NativeHookBridge.write(["session_id": "task", "transcript_path": outside.path], to: root.appendingPathComponent("active-session.json"))
        let collector = TelemetryCollector(home: home, restrictToCodexHome: true)
        let rejected = expectation(description: "outside task is never followed"); rejected.isInverted = true
        collector.onHook = { _, _ in rejected.fulfill() }
        collector.start()
        wait(for: [rejected], timeout: 0.2)
    }

}

private extension Data {
    func appendingNewline() -> Data { self + Data([10]) }
}
