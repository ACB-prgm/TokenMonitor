import Foundation
import SQLite3

public struct ThreadMetadata {
    public var title: String?
    public var model: String?
    public var effort: String?
}
public struct ThreadTitleProvider {
    public init() {}
    public func lookup(id: String, home: URL = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".codex")) -> ThreadMetadata {
        let paths = ((try? FileManager.default.contentsOfDirectory(at: home, includingPropertiesForKeys: nil)) ?? []).filter { $0.lastPathComponent.hasPrefix("state_") && $0.pathExtension == "sqlite" }.sorted { $0.lastPathComponent.compare($1.lastPathComponent, options: .numeric) == .orderedDescending }
        for path in paths {
            var db: OpaquePointer?
            guard sqlite3_open_v2(path.path, &db, SQLITE_OPEN_READONLY | SQLITE_OPEN_NOMUTEX, nil) == SQLITE_OK else { sqlite3_close(db); continue }
            defer { sqlite3_close(db) }
            sqlite3_busy_timeout(db, 100)
            var schema: OpaquePointer?
            var columns = Set<String>()
            if sqlite3_prepare_v2(db, "PRAGMA table_info(threads)", -1, &schema, nil) == SQLITE_OK {
                while sqlite3_step(schema) == SQLITE_ROW { if let c = sqlite3_column_text(schema, 1) { columns.insert(String(cString: c)) } }
            }
            sqlite3_finalize(schema)
            guard columns.contains("id"), columns.contains("title") else { continue }
            let model = columns.contains("model") ? "model" : "NULL"
            let effort = columns.contains("reasoning_effort") ? "reasoning_effort" : "NULL"
            let title = columns.contains("name") ? "COALESCE(NULLIF(name, ''), title)" : "title"
            var stmt: OpaquePointer?
            guard sqlite3_prepare_v2(db, "SELECT \(title), \(model), \(effort) FROM threads WHERE id = ? LIMIT 1", -1, &stmt, nil) == SQLITE_OK else { continue }
            defer { sqlite3_finalize(stmt) }
            let transient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)
            sqlite3_bind_text(stmt, 1, id, -1, transient)
            if sqlite3_step(stmt) == SQLITE_ROW {
                func field(_ i: Int32) -> String? { sqlite3_column_text(stmt, i).map { String(cString: $0) }.flatMap { $0.isEmpty ? nil : $0 } }
                return ThreadMetadata(title: CodexTelemetryParser.cleanTitle(field(0)), model: field(1), effort: field(2))
            }
        }
        return ThreadMetadata()
    }
}

public struct RecentThread: Codable, Identifiable, Equatable {
    public let id: String
    public let title: String
    public let transcriptPath: String
    public let cwd: String?
    public init(id: String, title: String, transcriptPath: String, cwd: String? = nil) {
        self.id = id; self.title = title; self.transcriptPath = transcriptPath; self.cwd = cwd
    }
}

extension ThreadTitleProvider {
    /// Read only local, unarchived tasks with accessible transcripts. No Codex state is modified.
    public func recent(home: URL = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".codex"), limit: Int = 30) -> [RecentThread] {
        let paths = ((try? FileManager.default.contentsOfDirectory(at: home, includingPropertiesForKeys: nil)) ?? [])
            .filter { $0.lastPathComponent.hasPrefix("state_") && $0.pathExtension == "sqlite" }
            .sorted { $0.lastPathComponent.compare($1.lastPathComponent, options: .numeric) == .orderedDescending }
        for path in paths {
            var db: OpaquePointer?
            guard sqlite3_open_v2(path.path, &db, SQLITE_OPEN_READONLY | SQLITE_OPEN_NOMUTEX, nil) == SQLITE_OK else { sqlite3_close(db); continue }
            defer { sqlite3_close(db) }
            sqlite3_busy_timeout(db, 100)
            var schema: OpaquePointer?
            var columns = Set<String>()
            if sqlite3_prepare_v2(db, "PRAGMA table_info(threads)", -1, &schema, nil) == SQLITE_OK {
                while sqlite3_step(schema) == SQLITE_ROW {
                    if let c = sqlite3_column_text(schema, 1) { columns.insert(String(cString: c)) }
                }
            }
            sqlite3_finalize(schema)
            guard Set(["id", "title", "rollout_path"]).isSubset(of: columns) else { continue }
            let title = columns.contains("name") ? "COALESCE(NULLIF(name, ''), title)" : "title"
            let cwd = columns.contains("cwd") ? "cwd" : "NULL"
            let filter = columns.contains("archived") ? "WHERE archived = 0" : ""
            let order = columns.contains("updated_at") ? "updated_at DESC, id" : "id"
            var stmt: OpaquePointer?
            guard sqlite3_prepare_v2(db, "SELECT id, \(title), rollout_path, \(cwd) FROM threads \(filter) ORDER BY \(order)", -1, &stmt, nil) == SQLITE_OK else { continue }
            defer { sqlite3_finalize(stmt) }
            var result: [RecentThread] = []
            while result.count < max(0, min(limit, 100)), sqlite3_step(stmt) == SQLITE_ROW {
                func field(_ i: Int32) -> String? { sqlite3_column_text(stmt, i).map { String(cString: $0) } }
                guard let id = field(0), !id.isEmpty, let transcript = field(2), transcript.hasPrefix("/"), FileManager.default.isReadableFile(atPath: transcript) else { continue }
                let folder = field(3).map { URL(fileURLWithPath: $0).lastPathComponent } ?? "Task"
                let label = CodexTelemetryParser.cleanTitle(field(1)) ?? "\(folder) · \(id.suffix(8))"
                result.append(RecentThread(id: id, title: label, transcriptPath: transcript, cwd: field(3)))
            }
            return result
        }
        return []
    }
}
