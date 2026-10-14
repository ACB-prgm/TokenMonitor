import XCTest
import SQLite3
@testable import MonitorCore

final class ThreadSelectionTests: XCTestCase {
    func testManualInspectionRemainsAutomatic() {
        var selection = ThreadSelection()
        XCTAssertFalse(selection.isLocked)
        XCTAssertTrue(selection.receiveHook("b"))
        selection.select("a")
        XCTAssertFalse(selection.isLocked)
        XCTAssertEqual(selection.currentID, "a")
        XCTAssertTrue(selection.receiveHook("b"))
        XCTAssertEqual(selection.currentID, "b")
    }
    func testOnlyExplicitToggleChangesLock() {
        var selection = ThreadSelection()
        selection.toggleLock()
        XCTAssertFalse(selection.isLocked)
        selection.select("a")
        selection.toggleLock()
        XCTAssertTrue(selection.isLocked)
        XCTAssertFalse(selection.receiveHook("b"))
        XCTAssertEqual(selection.currentID, "a")
        XCTAssertTrue(selection.receiveHook("a"))
        selection.select("c")
        XCTAssertTrue(selection.isLocked)
        XCTAssertFalse(selection.receiveHook("a"))
        XCTAssertEqual(selection.currentID, "c")
        selection.toggleLock()
        XCTAssertEqual(selection.currentID, "c")
        XCTAssertTrue(selection.receiveHook("b"))
        XCTAssertEqual(selection.currentID, "b")
        XCTAssertFalse(ThreadSelection().isLocked)
    }
    func testRecentTasksUseNamesOrderAndReadableLocalTranscripts() throws {
        let home = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: home, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: home) }
        let transcript = home.appendingPathComponent("rollout.jsonl")
        try Data().write(to: transcript)
        var db: OpaquePointer?
        XCTAssertEqual(sqlite3_open(home.appendingPathComponent("state_5.sqlite").path, &db), SQLITE_OK)
        defer { sqlite3_close(db) }
        let schema = "CREATE TABLE threads (id TEXT, title TEXT, name TEXT, rollout_path TEXT, cwd TEXT, archived INTEGER, updated_at INTEGER)"
        XCTAssertEqual(sqlite3_exec(db, schema, nil, nil, nil), SQLITE_OK)
        let path = transcript.path.replacingOccurrences(of: "'", with: "''")
        for sql in [
            "INSERT INTO threads VALUES ('a','Old title','Renamed task','\(path)','/work/one',0,1)",
            "INSERT INTO threads VALUES ('b','Recent task',NULL,'\(path)','/work/two',0,2)",
            "INSERT INTO threads VALUES ('c','Archived',NULL,'\(path)','/work',1,3)",
            "INSERT INTO threads VALUES ('d','Missing',NULL,'/nonexistent/rollout','/work',0,4)"
        ] { XCTAssertEqual(sqlite3_exec(db, sql, nil, nil, nil), SQLITE_OK) }
        let provider = ThreadTitleProvider()
        let threads = provider.recent(home: home)
        XCTAssertEqual(threads.map(\.id), ["b", "a"])
        XCTAssertEqual(threads.map(\.title), ["Recent task", "Renamed task"])
        XCTAssertEqual(threads[0].transcriptPath, transcript.path)
        XCTAssertEqual(provider.recent(home: home, limit: 1).count, 1)
    }
}
