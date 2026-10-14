import Foundation
import Darwin
import MonitorCore

/// All controller state and callbacks live on the main queue; pipe reads run off-main.
final class RemoteConnection {
    let configuration: RemoteConfiguration
    private let sshExecutable: URL
    var onStatus: ((String) -> Void)?
    var onMessage: ((RemoteMessage) -> Void)?
    private var process: Process?
    private var input: FileHandle?
    private var generation = UUID()
    private var retry: DispatchWorkItem?
    private var watchdog: Timer?
    private var attempts = 0
    private var enabled = false
    private var greeted = false
    private var lastMessage = Date()
    private var connectedAt: Date?
    private var diagnostic = ""
    private var fatalError: String?
    init(configuration: RemoteConfiguration, sshExecutable: URL = URL(fileURLWithPath: "/usr/bin/ssh")) { self.configuration = configuration; self.sshExecutable = sshExecutable }
    func start() {
        stop(); enabled = true; attempts = 0; connect()
    }
    func stop() {
        enabled = false; generation = UUID(); retry?.cancel(); retry = nil
        watchdog?.invalidate(); watchdog = nil
        try? input?.close(); input = nil
        if let old = process {
            if old.isRunning { old.terminate() }
            DispatchQueue.main.asyncAfter(deadline: .now() + 2) { if old.isRunning { kill(old.processIdentifier, SIGKILL) } }
        }
        process = nil
    }
    private func connect() {
        guard enabled else { return }
        let token = UUID(); generation = token; greeted = false; connectedAt = nil; diagnostic = ""; fatalError = nil; lastMessage = Date()
        do { try configuration.validate() }
        catch { onStatus?(error.localizedDescription); return }
        guard FileManager.default.isReadableFile(atPath: configuration.identityFile) else { onStatus?("Private key unavailable"); return }
        onStatus?("Connecting…")
        let child = Process(); child.executableURL = sshExecutable; child.arguments = configuration.sshArguments
        let stdin = Pipe(), stdout = Pipe(), stderr = Pipe()
        child.standardInput = stdin; child.standardOutput = stdout; child.standardError = stderr
        do { try child.run() }
        catch { onStatus?("Could not start SSH"); return }
        process = child; input = stdin.fileHandleForWriting
        let readers = DispatchGroup()
        readers.enter()
        DispatchQueue.global(qos: .utility).async { [weak self] in
            defer { readers.leave() }
            var decoder = RemoteLineDecoder()
            do {
                while true {
                    let data = try RemotePipe.read(stdout.fileHandleForReading)
                    if data.isEmpty { break }
                    for line in try decoder.consume(data) {
                        let message = try RemoteMessage.decode(line)
                        DispatchQueue.main.async { [weak self] in self?.receive(message, token: token) }
                    }
                }
            } catch {
                DispatchQueue.main.async { [weak self] in
                    guard let self, self.generation == token else { return }
                    self.fatalError = "Invalid or incompatible remote helper. Update TokenMonitor on both machines."
                    if child.isRunning { child.terminate() }
                }
            }
        }
        readers.enter()
        DispatchQueue.global(qos: .utility).async { [weak self] in
            defer { readers.leave() }
            while true {
                guard let data = try? RemotePipe.read(stderr.fileHandleForReading, maximum: 4096), !data.isEmpty else { break }
                let text = String(decoding: data, as: UTF8.self)
                DispatchQueue.main.async { [weak self] in
                    guard let self, self.generation == token else { return }
                    self.diagnostic = String((self.diagnostic + text).suffix(8192))
                }
            }
        }
        DispatchQueue.global(qos: .utility).async { [weak self] in
            child.waitUntilExit(); readers.wait()
            DispatchQueue.main.async { [weak self] in self?.finished(token: token, code: child.terminationStatus) }
        }
        watchdog = Timer.scheduledTimer(withTimeInterval: 5, repeats: true) { [weak self] _ in
            guard let self, self.generation == token else { return }
            if Date().timeIntervalSince(self.lastMessage) > (self.greeted ? 45 : 15) {
                if !self.greeted { self.fatalError = "Remote helper did not respond. Install/update TokenMonitor on the remote." }
                if child.isRunning { child.terminate() }
            }
        }
    }
    private func receive(_ message: RemoteMessage, token: UUID) {
        guard token == generation, enabled else { return }
        guard ["hello", "threads", "snapshot", "hook", "heartbeat", "unavailable"].contains(message.kind), greeted || message.kind == "hello" else {
            fatalError = "Unexpected remote protocol. Update TokenMonitor on both machines."
            if process?.isRunning == true { process?.terminate() }; return
        }
        lastMessage = Date()
        if message.kind == "hello" { greeted = true; connectedAt = Date(); onStatus?("Connected") }
        onMessage?(message)
    }
    func send(_ message: RemoteMessage) {
        guard greeted, process?.isRunning == true, let input else { return }
        do { try input.write(contentsOf: message.encodedLine()) }
        catch { if process?.isRunning == true { process?.terminate() } }
    }
    private func finished(token: UUID, code: Int32) {
        guard token == generation, enabled else { return }
        watchdog?.invalidate(); watchdog = nil; input = nil; process = nil
        if let fatalError { onStatus?(fatalError); return }
        let detail = diagnostic.lowercased()
        if detail.contains("host key verification failed") || detail.contains("remote host identification has changed") {
            onStatus?("Host key needs verification in Terminal"); return
        }
        if detail.contains("permission denied") || detail.contains("sign_and_send_pubkey") {
            onStatus?("Authentication failed. Load the dedicated key into your SSH agent."); return
        }
        if !greeted && (code == 127 || detail.contains("no such file") || detail.contains("unknown option")) {
            onStatus?("Remote helper missing or outdated. Install/update TokenMonitor there."); return
        }
        if let connectedAt, Date().timeIntervalSince(connectedAt) > 30 { attempts = 0 }
        let delay = min(60.0, pow(2.0, Double(min(attempts, 6))))
        attempts += 1
        onStatus?("Disconnected · retrying in \(Int(delay))s")
        let work = DispatchWorkItem { [weak self] in self?.connect() }
        retry = work; DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: work)
    }
}
