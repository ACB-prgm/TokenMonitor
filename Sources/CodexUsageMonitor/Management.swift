import AppKit
import MonitorCore

/// All management modes run before constructing AppState or the HUD.
enum Management {
    static let installation = MonitorInstallation(home: FileManager.default.homeDirectoryForCurrentUser)
    @discardableResult static func run(_ executable: String, _ arguments: [String], required: Bool = true) throws -> String {
        let process = Process(); process.executableURL = URL(fileURLWithPath: executable); process.arguments = arguments
        let output = Pipe(); process.standardOutput = output; process.standardError = output
        try process.run()
        let data = output.fileHandleForReading.readDataToEndOfFile(); process.waitUntilExit()
        let text = String(decoding: data, as: UTF8.self)
        if required && process.terminationStatus != 0 { throw MonitorSetupError.invalid("\(URL(fileURLWithPath: executable).lastPathComponent) failed (\(process.terminationStatus)): \(text.prefix(600))") }
        return text
    }
    static func desktop() throws -> URL {
        let fm = FileManager.default
        var candidates = NSWorkspace.shared.runningApplications.filter { $0.bundleIdentifier == "com.openai.codex" }.compactMap(\.bundleURL)
        candidates += [URL(fileURLWithPath: "/Applications/ChatGPT.app"), URL(fileURLWithPath: "/Applications/Codex.app"), fm.homeDirectoryForCurrentUser.appendingPathComponent("Applications/ChatGPT.app"), fm.homeDirectoryForCurrentUser.appendingPathComponent("Applications/Codex.app")]
        if let located = NSWorkspace.shared.urlForApplication(withBundleIdentifier: "com.openai.codex") { candidates.append(located) }
        guard let match = candidates.first(where: { (try? MonitorInstallation.plist($0.appendingPathComponent("Contents/Info.plist"))["CFBundleIdentifier"] as? String) == "com.openai.codex" }) else { throw MonitorSetupError.invalid("Could not locate Codex Desktop. Install and open Codex first.") }
        return match
    }
    static func serviceLoaded() -> Bool {
        let process = Process(); process.executableURL = URL(fileURLWithPath: "/bin/launchctl"); process.arguments = ["print", "gui/\(getuid())/\(MonitorInstallation.agentLabel)"]
        process.standardOutput = FileHandle.nullDevice; process.standardError = FileHandle.nullDevice
        do { try process.run(); process.waitUntilExit(); return process.terminationStatus == 0 } catch { return false }
    }
    static func stop() throws {
        if serviceLoaded() { try run("/bin/launchctl", ["bootout", "gui/\(getuid())/\(MonitorInstallation.agentLabel)"]) }
        let installedExecutable = installation.app.appendingPathComponent("Contents/MacOS/CodexUsageMonitor").path
        let helperExecutable = installation.helper.path
        func pids() throws -> [pid_t] {
            let listing = try run("/bin/ps", ["-axo", "pid=,comm="])
            return listing.split(separator: "\n").compactMap { line in
                let parts = line.trimmingCharacters(in: .whitespaces).split(maxSplits: 1, whereSeparator: \.isWhitespace)
                guard parts.count == 2, let pid = Int32(parts[0]), pid != getpid(),
                      [installedExecutable, helperExecutable, installation.app.appendingPathComponent("Contents/MacOS/CodexUsageLauncher").path].contains(String(parts[1])) else { return nil }
                return pid
            }
        }
        for pid in try pids() { kill(pid, SIGTERM) }
        for _ in 0..<30 { if try pids().isEmpty { return }; Thread.sleep(forTimeInterval: 0.1) }
        throw MonitorSetupError.invalid("Monitor did not stop; its installed bundle was not replaced.")
    }
    static func activate() throws { try run("/bin/launchctl", ["bootstrap", "gui/\(getuid())", installation.agent.path]) }
    static func recover() throws { if !serviceLoaded(), FileManager.default.fileExists(atPath: installation.agent.path) { try activate() } }
    static func hook() {
        do {
            let data = FileHandle.standardInput.readDataToEndOfFile()
            guard let payload = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }
            let pid = CodexProcessDetector().running().map { Int($0.processIdentifier) }
            try NativeHookBridge.process(payload, root: installation.root, pid: pid) {
                let settings = NativeHookBridge.read(installation.root.appendingPathComponent("installation.json"))
                guard let path = settings["app_path"] as? String, path == installation.app.path else { return }
                let p = Process(); p.executableURL = URL(fileURLWithPath: "/usr/bin/open"); p.arguments = ["-g", path]
                p.standardOutput = FileHandle.nullDevice; p.standardError = FileHandle.nullDevice; try? p.run()
            }
        } catch {
            let logs = installation.root.appendingPathComponent("logs")
            try? FileManager.default.createDirectory(at: logs, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
            let file = logs.appendingPathComponent("hook.log")
            var data = (try? Data(contentsOf: file)) ?? Data()
            if data.count > 32768 { data = Data() }
            // No error details: input may contain prompts, paths, or tool output.
            data.append(Data("\(ISO8601DateFormatter().string(from: Date())) HookBridgeError\n".utf8))
            try? data.write(to: file, options: .atomic)
        }
    }
    static func doctor() -> [String: Any] {
        let settings = NativeHookBridge.read(installation.root.appendingPathComponent("installation.json"))
        let bridge = NativeHookBridge.read(installation.root.appendingPathComponent("active-session.json"))
        var report: [String: Any] = ["app_installed": FileManager.default.fileExists(atPath: installation.app.path), "installed_version": settings["version"] ?? "unknown", "helper_loaded": serviceLoaded(), "codex_found": (try? desktop()) != nil, "hook_trust": "Review in Codex Settings > Hooks; not inspected", "bridge_updated_at": bridge["updated_at"] ?? NSNull(), "automatic_following": "Next trusted lifecycle hook selects the task unless locked"]
        let formatter = ISO8601DateFormatter(); formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let stamp = bridge["updated_at"] as? String, let date = formatter.date(from: stamp) { report["bridge_age_seconds"] = max(0, Int(Date().timeIntervalSince(date))) }
        do {
            try installation.checkOwnership()
            report["owned_files_valid"] = true
            let data = try Data(contentsOf: installation.hooks)
            _ = try HookConfiguration.merge(data, home: installation.home)
            let object = try JSONSerialization.jsonObject(with: data) as? [String: Any]
            let hooks = object?["hooks"] as? [String: Any] ?? [:]
            var counts = [String: Int]()
            for event in HookConfiguration.events {
                let groups = hooks[event] as? [[String: Any]] ?? []
                counts[event] = groups.flatMap { $0["hooks"] as? [[String: Any]] ?? [] }.filter { $0["command"] as? String == HookConfiguration.command(home: installation.home) }.count
            }
            report["native_hook_counts"] = counts
            report["hooks_registered"] = counts.values.allSatisfy { $0 == 1 }
        } catch { report["configuration_health"] = "Missing, malformed, or unrecognized files; run setup/repair after reviewing configuration." }
        report["remote_protocol_version"] = RemoteMessage.protocolVersion
        report["configured_remotes"] = RemoteConfiguration.load().count
        report["enabled_remotes"] = RemoteConfiguration.load().filter { $0.enabled }.count
        report["remote_mode"] = "Optional SSH; connection health is shown in Settings"
        return report
    }
    static func dispatch() -> Bool {
        let arguments = CommandLine.arguments
        if arguments.contains("--hook") { hook(); return true }
        let assets = Bundle.main.bundleURL.deletingLastPathComponent()
        let staged = FileManager.default.fileExists(atPath: assets.appendingPathComponent("release.json").path)
        let setup = arguments.contains("--setup") || (staged && arguments.count == 1)
        guard setup || arguments.contains("--doctor") || arguments.contains("--uninstall") else { return false }
        do {
            if arguments.contains("--doctor") {
                print(String(decoding: try JSONSerialization.data(withJSONObject: doctor(), options: [.prettyPrinted, .sortedKeys]), as: UTF8.self)); return true
            }
            if setup {
                #if arch(arm64)
                let architecture = "arm64"
                #else
                let architecture = "unsupported"
                #endif
                try MonitorInstallation.checkPlatform(architecture: architecture, majorOS: ProcessInfo.processInfo.operatingSystemVersion.majorVersion)
                try run("/usr/bin/codesign", ["--verify", "--deep", "--strict", assets.appendingPathComponent("Codex Usage Monitor.app").path])
                try installation.install(assets: assets, desktop: desktop(), stop: stop, activate: activate, recover: recover, copyApp: { source, destination in
                    try run("/usr/bin/ditto", [source.path, destination.path])
                })
                var launchNote = ""
                do { try run("/usr/bin/open", ["-n", "-g", installation.app.path]) }
                catch { launchNote = " Installation succeeded, but the HUD did not open; open the installed app manually." }
                let result: [String: Any] = ["success": true, "message": "Installed TokenMonitor. Review and trust its six hooks in Codex Settings > Hooks, then restart/resume a task. Hook trust was not changed." + launchNote]
                try NativeHookBridge.write(result, to: assets.appendingPathComponent("setup-result.json"))
                print(result["message"]!)
            } else {
                try installation.uninstall(purge: arguments.contains("--purge"), stop: stop)
                if arguments.contains("--purge") { UserDefaults.standard.removePersistentDomain(forName: MonitorInstallation.bundleID) }
                print("Removed TokenMonitor app, helper and owned hook registrations. " + (arguments.contains("--purge") ? "Monitor state and preferences purged." : "State and preferences retained."))
            }
        } catch {
            if setup { try? NativeHookBridge.write(["success": false, "message": error.localizedDescription], to: assets.appendingPathComponent("setup-result.json")) }
            FileHandle.standardError.write(Data((error.localizedDescription + "\n").utf8))
            exit(1)
        }
        return true
    }
}
