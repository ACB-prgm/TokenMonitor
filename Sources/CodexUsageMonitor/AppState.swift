import AppKit
import SwiftUI
import MonitorCore

let monitorDirectory = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".codex/usage-monitor")
final class AppState: ObservableObject {
    @Published var snapshot = Snapshot()
    @Published private(set) var cacheTemperature: CacheTemperature?
    private var cacheTimer: Timer?
    private var cacheObservers: [(NotificationCenter, NSObjectProtocol)] = []

    /// Main-thread only; one timer is replaced when a new call/task changes its deadline.
    private func refreshCacheTemperature() {
        let schedule = CacheTemperature.schedule(lastCall: snapshot.last?.timestamp, now: Date())
        cacheTemperature = schedule.temperature
        if cacheTimer?.isValid == true, cacheTimer?.fireDate == schedule.nextTransition { return }
        cacheTimer?.invalidate()
        cacheTimer = nil
        if let next = schedule.nextTransition {
            let timer = Timer(fire: next, interval: 0, repeats: false) { [weak self] _ in
                self?.refreshCacheTemperature()
            }
            cacheTimer = timer
            RunLoop.main.add(timer, forMode: .common)
        }
    }
    deinit {
        cacheTimer?.invalidate()
        for (center, observer) in cacheObservers { center.removeObserver(observer) }
    }
    @Published private(set) var recentThreads: [RecentThread] = []
    @Published private(set) var isLocked = false
    private var selection = SourceSelection()
    @Published var uiScale: Double = {
        let saved = UserDefaults.standard.double(forKey: "uiScale")
        return saved > 0 ? min(1.15, max(0.85, saved)) : 1
    }() {
        didSet { UserDefaults.standard.set(uiScale, forKey: "uiScale") }
    }
    @Published var expanded = UserDefaults.standard.bool(forKey: "expanded")
    @Published private(set) var remoteThreads: [UUID: [RecentThread]] = [:]
    @Published private(set) var connectionStatus: [UUID: String] = [:]
    @Published var remotes: [RemoteConfiguration] = RemoteConfiguration.load()
    @Published private(set) var selectedSource = "local"
    private let collector = TelemetryCollector()
    private var connections: [UUID: RemoteConnection] = [:]
    private var snapshots: [String: Snapshot] = [:]
    var machineLabel: String {
        selectedSource == "local" ? "Local" : remotes.first(where: { $0.id.uuidString == selectedSource })?.label ?? "Remote"
    }
    func start() {
        for (center, name) in [
            (NSWorkspace.shared.notificationCenter, NSWorkspace.didWakeNotification),
            (NSWorkspace.shared.notificationCenter, NSWorkspace.sessionDidBecomeActiveNotification),
            (NotificationCenter.default, NSApplication.didBecomeActiveNotification),
            (NotificationCenter.default, Notification.Name.NSSystemClockDidChange)
        ] {
            let observer = center.addObserver(forName: name, object: nil, queue: .main) { [weak self] _ in
                self?.refreshCacheTemperature()
            }
            cacheObservers.append((center, observer))
        }
        collector.onThreads = { [weak self] threads in DispatchQueue.main.async { self?.recentThreads = threads } }
        collector.onSnapshot = { [weak self] snapshot in DispatchQueue.main.async { self?.receive(snapshot, source: "local") } }
        collector.onHook = { [weak self] session, _ in
            DispatchQueue.main.async {
                guard let self, self.selection.receiveHook(source: "local", id: session.session_id) else { return }
                self.selectedSource = "local"
                self.collector.selectSession(session)
            }
        }
        try? FileManager.default.createDirectory(at: monitorDirectory, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        collector.start()
        reconcileRemotes()
    }
    private func receive(_ value: Snapshot, source: String) {
        snapshots[source] = value
        guard selection.source == source, selection.currentID == value.session?.session_id else { return }
        selectedSource = source; snapshot = value; refreshCacheTemperature()
    }
    func refreshThreads() { collector.refresh(); for connection in connections.values { connection.send(RemoteMessage(kind: "refresh")) } }
    func selectThread(_ thread: RecentThread, source: String = "local") {
        selection.select(source: source, id: thread.id); selectedSource = source
        if source == "local" { collector.select(thread) }
        else if let id = UUID(uuidString: source) { connections[id]?.send(RemoteMessage(kind: "select", taskID: thread.id)) }
        if let saved = snapshots[source], saved.session?.session_id == thread.id { snapshot = saved; refreshCacheTemperature() }
        else { var pending = Snapshot(); pending.title = thread.title; pending.session = ActiveSession(session_id: thread.id); pending.status = "Loading task…"; snapshot = pending; refreshCacheTemperature() }
        if let id = UUID(uuidString: source), connectionStatus[id] != "Connected" {
            snapshot.status = "\(machineLabel): \(connectionStatus[id] ?? "Disconnected") · showing last recorded call"
        }
    }
    func toggleLock() { selection.toggleLock(); isLocked = selection.isLocked }
    func saveRemotes(_ values: [RemoteConfiguration]) throws {
        try RemoteConfiguration.save(values); remotes = values; reconcileRemotes()
    }
    func reconnect(_ id: UUID) { connections[id]?.start() }
    private func reconcileRemotes() {
        if selectedSource != "local", !remotes.contains(where: { $0.id.uuidString == selectedSource && $0.enabled }) {
            if let local = snapshots["local"], let session = local.session {
                selection.select(source: "local", id: session.session_id)
                selectedSource = "local"; snapshot = local; refreshCacheTemperature()
            } else {
                selection = SourceSelection(); isLocked = false; selectedSource = "local"; snapshot = Snapshot(); refreshCacheTemperature()
            }
        }
        for (id, connection) in connections where !remotes.contains(where: { $0.id == id && $0.enabled && $0 == connection.configuration }) {
            connection.stop(); connections.removeValue(forKey: id)
            connectionStatus[id] = "Disabled"; remoteThreads.removeValue(forKey: id)
        }
        for configuration in remotes where configuration.enabled && connections[configuration.id] == nil {
            let connection = RemoteConnection(configuration: configuration)
            connection.onStatus = { [weak self] status in
                guard let self else { return }
                self.connectionStatus[configuration.id] = status
                if self.selectedSource == configuration.id.uuidString, status != "Connected" {
                    self.snapshot.status = "\(configuration.label): \(status) · showing last recorded call"
                }
            }
            connection.onMessage = { [weak self, weak connection] message in
                guard let self else { return }
                let source = configuration.id.uuidString
                if let threads = message.threads { self.remoteThreads[configuration.id] = threads }
                if message.kind == "hook", let taskID = message.taskID,
                   self.selection.receiveHook(source: source, id: taskID) {
                    self.selectedSource = source
                    connection?.send(RemoteMessage(kind: "select", taskID: taskID))
                }
                if message.kind == "unavailable", self.selection.source == source, self.selection.currentID == message.taskID {
                    self.snapshot.status = "Task unavailable · refresh tasks"
                }
                if let value = message.snapshot { self.receive(value, source: source) }
                if message.kind == "hello", self.selection.source == source, let taskID = self.selection.currentID {
                    connection?.send(RemoteMessage(kind: "select", taskID: taskID))
                }
            }
            connections[configuration.id] = connection; connection.start()
        }
    }
    func stop() { for connection in connections.values { connection.stop() } }
}
struct CodexProcessDetector {
    var settings: [String: Any] { (try? Data(contentsOf: monitorDirectory.appendingPathComponent("installation.json"))).flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] } ?? [:] }
    func running() -> NSRunningApplication? {
        let id = settings["bundle_id"] as? String ?? "com.openai.codex"
        return NSWorkspace.shared.runningApplications.first { $0.bundleIdentifier == id && !$0.isTerminated }
    }
}
