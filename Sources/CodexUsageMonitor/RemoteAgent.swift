import Foundation
import Darwin
import MonitorCore

/// This mode has no AppKit lifecycle dependency and never starts a GUI or changes hooks.
enum RemoteAgent {
    static func run() -> Never {
        signal(SIGPIPE, SIG_IGN)
        let collector = TelemetryCollector(restrictToCodexHome: true)
        let writeLock = NSLock()
        func emit(_ message: RemoteMessage) {
            writeLock.lock(); defer { writeLock.unlock() }
            do { try FileHandle.standardOutput.write(contentsOf: message.encodedLine()) }
            catch { exit(1) }
        }
        emit(RemoteMessage(kind: "hello"))
        collector.onThreads = { threads in
            emit(RemoteMessage(kind: "threads", threads: threads.map { thread in
                RecentThread(id: thread.id, title: thread.title, transcriptPath: "", cwd: thread.cwd.map { URL(fileURLWithPath: $0).lastPathComponent })
            }))
        }
        collector.onUnavailable = { emit(RemoteMessage(kind: "unavailable", taskID: $0)) }
        collector.onSnapshot = { emit(RemoteMessage(kind: "snapshot", snapshot: $0.remoteSafe)) }
        collector.onHook = { session, baseline in
            if baseline { collector.selectBaseline(session) }
            else { emit(RemoteMessage(kind: "hook", taskID: session.session_id)) }
        }
        collector.start()
        let heartbeat = DispatchSource.makeTimerSource(queue: DispatchQueue.global(qos: .utility))
        heartbeat.schedule(deadline: .now() + 15, repeating: 15)
        heartbeat.setEventHandler { emit(RemoteMessage(kind: "heartbeat")) }; heartbeat.resume()
        DispatchQueue.global(qos: .utility).async {
            var decoder = RemoteLineDecoder()
            do {
                while true {
                    let data = try RemotePipe.read(FileHandle.standardInput)
                    if data.isEmpty { break }
                    for line in try decoder.consume(data) {
                        let message = try RemoteMessage.decode(line)
                        switch message.kind {
                        case "select":
                            guard let id = message.taskID, !id.isEmpty, id.count <= 200 else { exit(2) }
                            collector.selectDiscovered(id: id)
                        case "refresh": collector.refresh()
                        default: exit(2)
                        }
                    }
                }
                exit(0)
            } catch { exit(2) }
        }
        dispatchMain()
    }
}
