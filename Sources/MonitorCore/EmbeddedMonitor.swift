import Foundation
import Darwin

/// Local metadata only. All source paths and transcript text stay in MonitorCore.
public struct EmbeddedTask: Codable, Equatable {
    public var id: String
    public var title: String
    public var workspace: String?
}
public struct EmbeddedHook: Codable, Equatable {
    public var sequence: String
    public var session: ActiveSession
}
public enum EmbeddedPaths {
    public static func validID(_ id: String) -> Bool {
        !id.isEmpty && id.count <= 200 && id.range(of: #"^[A-Za-z0-9][A-Za-z0-9_-]*$"#, options: .regularExpression) != nil
    }
    public static func accepts(_ path: String?, id: String, home: URL) -> Bool {
        guard validID(id), let path, path.hasPrefix("/") else { return false }
        let resolved = URL(fileURLWithPath: path).resolvingSymlinksInPath().path
        return resolved.hasPrefix(home.resolvingSymlinksInPath().path + "/") && AutomaticTask.accepts(transcriptPath: resolved, sessionID: id)
    }
}

public final class EmbeddedHookStore {
    public let home: URL
    public var root: URL { home.appendingPathComponent("token-monitor-embedded") }
    public init(home: URL) { self.home = home }
    public func read(_ url: URL) -> EmbeddedHook? {
        guard let data = try? Data(contentsOf: url), data.count < 65536,
              let record = try? JSONDecoder().decode(EmbeddedHook.self, from: data),
              EmbeddedPaths.accepts(record.session.transcript_path, id: record.session.session_id, home: home) else { return nil }
        return record
    }
    public var latest: EmbeddedHook? { read(root.appendingPathComponent("latest-hook.json")) }
    public func task(_ id: String) -> EmbeddedHook? {
        guard EmbeddedPaths.validID(id) else { return nil }
        return read(root.appendingPathComponent("tasks/\(id).json"))
    }
    @discardableResult public func record(_ payload: [String: Any], now: Date = Date()) throws -> Bool {
        guard let id = payload["session_id"] as? String, EmbeddedPaths.validID(id),
              let event = payload["hook_event_name"] as? String, HookConfiguration.events.contains(event) else { return false }
        let candidate = payload["transcript_path"] as? String
            ?? task(id)?.session.transcript_path
            ?? ThreadTitleProvider().recent(home: home, limit: 1, matchingID: id).first?.transcriptPath
        guard EmbeddedPaths.accepts(candidate, id: id, home: home) else { return false }
        try FileManager.default.createDirectory(at: root.appendingPathComponent("tasks"), withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        let fd = open(root.appendingPathComponent("hooks.lock").path, O_CREAT | O_RDWR | O_NOFOLLOW, 0o600)
        guard fd >= 0 else { return false }
        defer { close(fd) }
        guard flock(fd, LOCK_EX) == 0 else { return false }
        defer { flock(fd, LOCK_UN) }
        var session = task(id)?.session ?? ActiveSession(session_id: id)
        session.transcript_path = candidate
        session.cwd = payload["cwd"] as? String ?? session.cwd
        session.model = payload["model"] as? String ?? session.model
        session.title = CodexTelemetryParser.cleanTitle(payload["title"] as? String) ?? session.title
        session.turn_id = payload["turn_id"] as? String
        session.hook_event_name = event; session.ended = event == "SessionEnd"
        let formatter = ISO8601DateFormatter(); formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        session.updated_at = formatter.string(from: now)
        let hook = EmbeddedHook(sequence: UUID().uuidString, session: session)
        let data = try JSONEncoder().encode(hook)
        for url in [root.appendingPathComponent("tasks/\(id).json"), root.appendingPathComponent("latest-hook.json")] {
            try data.write(to: url, options: .atomic)
            try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: url.path)
        }
        return true
    }
}

public struct EmbeddedViewState: Codable {
    public var version = 1
    public var task: EmbeddedTask?
    public var status: String
    public var available: Bool
    public var model: String?
    public var effort: String?
    public var input: Int?
    public var cached: Int?
    public var fresh: Int?
    public var contextLimit: Int?
    public var contextPercent: Double?
    public var callCount: Int
    public var samples: [TokenUsageSample]
    public var compactions: [CompactionEvent]
    public var isCompacting: Bool
    public var awaitingPostCompactionCall: Bool
    public var fiveHour: Allowance?
    public var weekly: Allowance?
    public var attribution: ContextAttribution
    public var outputTotals: ThreadOutputTotals
    public var lastEvent: Date?
    public var lastCall: Date?
    public var cacheTemperature: String?
    public var contextHealth: Double
    public var freshHealth: Double
    public var compactionValue: Estimate?
    public struct Estimate: Codable {
        public var category: String
        public var level: Double
        public var currentInput: Int
        public var estimatedInput: Int
        public var breakEvenCalls: Int?
    }
}

/// Each cached entry owns its parser and tail. Selection never mutates another
/// task's collector. Idle entries are released after 60 seconds.
public final class EmbeddedTelemetryStore {
    private final class Entry {
        var parser = CodexTelemetryParser()
        let tail = JSONLTail()
        let path: String
        var session: ActiveSession
        var touched: Date
        init(path: String, session: ActiveSession, now: Date) { self.path = path; self.session = session; touched = now }
    }
    private var entries: [String: Entry] = [:]
    public let home: URL
    public let hooks: EmbeddedHookStore
    public init(home: URL) { self.home = home; hooks = EmbeddedHookStore(home: home) }
    public func prune(now: Date = Date()) { entries = entries.filter { now.timeIntervalSince($0.value.touched) < 60 } }
    public var activeCollectorCount: Int { entries.count }
    public func resolve(_ id: String) -> ActiveSession? {
        guard EmbeddedPaths.validID(id) else { return nil }
        if let hook = hooks.task(id) { return hook.session }
        guard let thread = ThreadTitleProvider().recent(home: home, limit: 1, matchingID: id).first,
              EmbeddedPaths.accepts(thread.transcriptPath, id: id, home: home) else { return nil }
        return ActiveSession(session_id: thread.id, transcript_path: thread.transcriptPath, cwd: thread.cwd, title: thread.title)
    }
    public func tasks() -> [EmbeddedTask] {
        var sessions = ThreadTitleProvider().recent(home: home, limit: 100).filter {
            EmbeddedPaths.accepts($0.transcriptPath, id: $0.id, home: home)
        }.map { ActiveSession(session_id: $0.id, transcript_path: $0.transcriptPath, cwd: $0.cwd, title: $0.title) }
        if let latest = hooks.latest?.session, !sessions.contains(where: { $0.session_id == latest.session_id }) { sessions.insert(latest, at: 0) }
        return sessions.map { task($0, title: $0.title) }
    }
    private func task(_ session: ActiveSession, title: String?) -> EmbeddedTask {
        let folder = session.cwd.map { URL(fileURLWithPath: $0).lastPathComponent }
        return EmbeddedTask(id: session.session_id, title: CodexTelemetryParser.cleanTitle(title) ?? "\(folder ?? "Task") · \(session.session_id.suffix(8))", workspace: folder)
    }
    public func snapshot(id: String, now: Date = Date()) -> EmbeddedViewState? {
        prune(now: now)
        let session = resolve(id)
        // Preserve cached snapshots if a previously validated transcript disappears.
        guard let source = session?.transcript_path ?? entries[id]?.path else { return nil }
        let entry: Entry
        if let existing = entries[id], existing.path == source { entry = existing }
        else { entry = Entry(path: source, session: session ?? ActiveSession(session_id: id), now: now); entries[id] = entry }
        if let session { entry.session = session }
        entry.touched = now
        var available = session != nil
        do { if session != nil { try entry.tail.read(source, reset: { entry.parser = CodexTelemetryParser() }, line: { entry.parser.consume($0) }) } }
        catch { available = false }
        let p = entry.parser
        let metadata = ThreadTitleProvider().lookup(id: id, home: home)
        let selected = entry.session
        let input = p.awaitingPostCompactionCall ? p.compactedContext : p.samples.last?.input
        let cached = p.awaitingPostCompactionCall ? nil : p.samples.last?.cached
        let fresh = p.awaitingPostCompactionCall ? nil : p.samples.last?.fresh
        let percent = Formatting.percent(input, limit: p.contextLimit)
        let compacting = CompactionStatus.isActive(event: selected.hook_event_name,
            started: selected.updated_at.flatMap(CodexTelemetryParser.date), completed: p.compactions.last?.timestamp, latestCall: p.samples.last?.timestamp)
        let value = CompactionValue.estimate(currentInput: input)
        let estimate = value.map { EmbeddedViewState.Estimate(category: $0.category.rawValue, level: $0.category.colorLevel, currentInput: $0.currentInput, estimatedInput: $0.estimatedInput, breakEvenCalls: $0.breakEvenCalls) }
        return EmbeddedViewState(task: task(selected, title: CodexTelemetryParser.cleanTitle(selected.title) ?? metadata.title ?? p.title),
            status: !available ? "Transcript unavailable · showing last recorded call" : compacting ? "Compacting…" : selected.ended == true ? "Session ended · last recorded call" : "Monitoring selected task",
            available: available, model: p.lastCallModel ?? selected.model ?? metadata.model, effort: p.lastCallEffort ?? metadata.effort,
            input: input, cached: cached, fresh: fresh, contextLimit: p.contextLimit, contextPercent: percent,
            callCount: p.callCount, samples: p.samples, compactions: p.visibleCompactions, isCompacting: compacting,
            awaitingPostCompactionCall: p.awaitingPostCompactionCall, fiveHour: p.fiveHour, weekly: p.weekly,
            attribution: p.contextAttribution, outputTotals: p.outputTotals, lastEvent: p.lastEvent, lastCall: p.samples.last?.timestamp,
            cacheTemperature: CacheTemperature.schedule(lastCall: p.samples.last?.timestamp, now: now).temperature?.rawValue,
            contextHealth: TokenHealth.context(percent: percent), freshHealth: TokenHealth.fresh(tokens: fresh, input: input), compactionValue: estimate)
    }
}
