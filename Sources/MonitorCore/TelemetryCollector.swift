import Foundation

public struct ActiveSession: Codable, Equatable {
    public var session_id: String
    public var transcript_path: String?
    public var cwd: String?
    public var model: String?
    public var turn_id: String?
    public var hook_event_name: String?
    public var title: String?
    public var ended: Bool?
    public var updated_at: String?
    public init(session_id: String, transcript_path: String? = nil, cwd: String? = nil, model: String? = nil, title: String? = nil) {
        self.session_id = session_id; self.transcript_path = transcript_path; self.cwd = cwd; self.model = model; self.title = title
    }
}
public struct Snapshot: Codable {
    public init() {}
    public var session: ActiveSession?
    public var title = "Waiting for Codex telemetry…"
    public var model: String?
    public var effort: String?
    public var samples: [TokenUsageSample] = []
    public var compactions: [CompactionEvent] = []
    public var isCompacting = false
    public var awaitingPostCompactionCall = false
    public var compactedContext: Int?
    public var input: Int? { awaitingPostCompactionCall ? compactedContext : last?.input }
    public var cached: Int? { awaitingPostCompactionCall ? nil : last?.cached }
    public var fresh: Int? { awaitingPostCompactionCall ? nil : last?.fresh }
    public var callCount = 0
    public var outputTotals: ThreadOutputTotals?
    public var attribution = ContextAttribution()
    public var contextLimit: Int?
    public var fiveHour: Allowance?
    public var weekly: Allowance?
    public var lastEvent: Date?
    public var status = "Waiting for a trusted SessionStart or prompt hook"
    public var last: TokenUsageSample? { samples.last }
    public var contextPercent: Double? { Formatting.percent(input, limit: contextLimit) }
}

/// Serial, source-local telemetry collector, shared by the HUD and SSH helper.
public final class TelemetryCollector {
    public var onSnapshot: ((Snapshot) -> Void)?
    public var onThreads: (([RecentThread]) -> Void)?
    public var onUnavailable: ((String) -> Void)?
    public var onHook: ((ActiveSession, Bool) -> Void)?
    private let home: URL
    private let root: URL
    private let restrictToCodexHome: Bool
    private let queue = DispatchQueue(label: "local.tokenmonitor.collector", qos: .utility)
    private var activeWatcher: FileWatcher?
    private var transcriptWatcher: FileWatcher?
    private var active: ActiveSession?
    private var lastHook: ActiveSession?
    private var parser = CodexTelemetryParser()
    private var tail = JSONLTail()
    private var metadata = ThreadMetadataCache()
    private struct ThreadMetadataCache { var title: String?; var model: String?; var effort: String? }
    public init(home: URL = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".codex"), restrictToCodexHome: Bool = false) {
        self.restrictToCodexHome = restrictToCodexHome
        self.home = home; root = home.appendingPathComponent("usage-monitor")
    }
    public func start() {
        queue.async {
            self.loadRecentThreads()
            self.activeWatcher = FileWatcher(path: self.root.appendingPathComponent("active-session.json").path, queue: self.queue) { [weak self] in self?.readActive() }
        }
    }
    public func refresh() { queue.async { self.loadRecentThreads(); self.readTranscript() } }
    public func select(_ thread: RecentThread) {
        selectSession(ActiveSession(session_id: thread.id, transcript_path: thread.transcriptPath, cwd: thread.cwd, title: thread.title))
    }
    public func selectBaseline(_ session: ActiveSession) { queue.async { if self.active == nil { self.follow(session) } } }
    public func selectSession(_ session: ActiveSession) { queue.async { self.follow(session) } }
    /// Remote requests may select only discovered tasks; no client-supplied paths are accepted.
    public func selectDiscovered(id: String) {
        queue.async {
            // The current observed hook is selectable even if its task was just archived
            // or has not reached the database's recent-task list yet.
            if let session = self.lastHook, session.session_id == id, self.acceptsPath(session.transcript_path) {
                self.follow(session); return
            }
            guard let thread = self.discoveredThreads().first(where: { $0.id == id }) else {
                self.onUnavailable?(id); return
            }
            self.follow(ActiveSession(session_id: thread.id, transcript_path: thread.transcriptPath, cwd: thread.cwd, title: thread.title))
        }
    }
    private func acceptsPath(_ path: String?) -> Bool {
        guard restrictToCodexHome else { return true }
        guard let path else { return false }
        return URL(fileURLWithPath: path).resolvingSymlinksInPath().path.hasPrefix(home.resolvingSymlinksInPath().path + "/")
    }
    private func discoveredThreads() -> [RecentThread] {
        ThreadTitleProvider().recent(home: home).filter { acceptsPath($0.transcriptPath) }
    }
    private func loadRecentThreads() { onThreads?(discoveredThreads()) }
    private func readActive() {
        guard let data = try? Data(contentsOf: root.appendingPathComponent("active-session.json")),
              let session = try? JSONDecoder().decode(ActiveSession.self, from: data), !session.session_id.isEmpty,
              session != lastHook, acceptsPath(session.transcript_path),
              AutomaticTask.accepts(transcriptPath: session.transcript_path, sessionID: session.session_id) else { return }
        let baseline = lastHook == nil
        lastHook = session
        loadRecentThreads()
        onHook?(session, baseline)
    }
    private func follow(_ session: ActiveSession) {
        let switchFile = session.session_id != active?.session_id || session.transcript_path != active?.transcript_path
        guard switchFile || session != active else { return }
        active = session
        let m = ThreadTitleProvider().lookup(id: session.session_id, home: home)
        metadata = ThreadMetadataCache(title: m.title, model: m.model, effort: m.effort)
        if switchFile {
            transcriptWatcher = nil; parser = CodexTelemetryParser(); tail = JSONLTail()
            if let path = session.transcript_path {
                transcriptWatcher = FileWatcher(path: path, queue: queue) { [weak self] in self?.readTranscript() }
            } else { publish(status: "Transcript unavailable") }
        } else { readTranscript() }
    }
    private func readTranscript() {
        guard let path = active?.transcript_path else { publish(status: "Transcript unavailable"); return }
        do {
            try tail.read(path, reset: { self.parser = CodexTelemetryParser() }, line: { self.parser.consume($0) })
            publish(status: active?.ended == true ? "Session ended · last recorded call" : "Monitoring selected task")
        } catch { publish(status: "Transcript unavailable · showing last recorded call") }
    }
    private func publish(status: String) {
        var s = Snapshot()
        s.session = active
        let folder = active?.cwd.map { URL(fileURLWithPath: $0).lastPathComponent } ?? "Thread"
        let short = String(active?.session_id.suffix(8) ?? "")
        s.title = CodexTelemetryParser.cleanTitle(active?.title) ?? metadata.title ?? parser.title ?? "\(folder) · \(short)"
        s.model = parser.lastCallModel ?? active?.model ?? metadata.model
        s.effort = parser.lastCallEffort ?? metadata.effort
        s.attribution = parser.contextAttribution
        s.compactions = parser.visibleCompactions
        s.awaitingPostCompactionCall = parser.awaitingPostCompactionCall
        s.compactedContext = parser.compactedContext
        s.isCompacting = CompactionStatus.isActive(
            event: active?.hook_event_name,
            started: active?.updated_at.flatMap(CodexTelemetryParser.date),
            completed: parser.compactions.last?.timestamp,
            latestCall: parser.samples.last?.timestamp)

        s.samples = parser.samples; s.callCount = parser.callCount; s.outputTotals = parser.outputTotals; s.contextLimit = parser.contextLimit
        s.fiveHour = parser.fiveHour; s.weekly = parser.weekly; s.lastEvent = parser.lastEvent; s.status = s.isCompacting ? "Compacting…" : status
        onSnapshot?(s)
    }
}
