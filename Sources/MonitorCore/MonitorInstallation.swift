import Foundation
import CryptoKit
import Security
import Darwin

public struct MonitorRelease: Codable {
    public struct File: Codable { public let path: String; public let sha256: String }
    public let version: String
    public let architecture: String
    public let minimumOS: String
    public let fileCount: Int
    public let files: [File]
    public static func digest(_ url: URL) throws -> String { SHA256.hash(data: try Data(contentsOf: url)).map { String(format: "%02x", $0) }.joined() }
    public static func validate(assets sourceAssets: URL) throws -> MonitorRelease {
        let assets = sourceAssets.resolvingSymlinksInPath()
        let release = try JSONDecoder().decode(Self.self, from: Data(contentsOf: assets.appendingPathComponent("release.json")))
        guard release.architecture == "arm64", release.minimumOS == "13.0", !release.version.isEmpty,
              release.fileCount == release.files.count, release.fileCount > 0 else { throw MonitorSetupError.invalid("Unsupported release metadata.") }
        var paths = Set<String>()
        for file in release.files {
            let parts = file.path.split(separator: "/", omittingEmptySubsequences: false)
            guard file.path.hasPrefix("Codex Usage Monitor.app/"), !parts.contains(".."), !parts.contains("."), !parts.contains(""), paths.insert(file.path).inserted,
                  file.sha256.count == 64 else { throw MonitorSetupError.invalid("Invalid release inventory path: \(file.path)") }
            let url = assets.appendingPathComponent(file.path)
            let values = try url.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey])
            guard values.isRegularFile == true, values.isSymbolicLink != true, try digest(url) == file.sha256 else { throw MonitorSetupError.invalid("Release checksum mismatch: \(file.path)") }
        }
        let app = assets.appendingPathComponent("Codex Usage Monitor.app")
        guard let enumerator = FileManager.default.enumerator(at: app, includingPropertiesForKeys: [.isRegularFileKey, .isSymbolicLinkKey]) else { throw MonitorSetupError.invalid("Missing release app.") }
        var actual = Set<String>()
        for case let url as URL in enumerator {
            let values = try url.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey])
            guard values.isSymbolicLink != true else { throw MonitorSetupError.invalid("Symlinks are not supported in the app package.") }
            if values.isRegularFile == true { actual.insert(String(url.resolvingSymlinksInPath().path.dropFirst(assets.path.count + 1))) }
        }
        guard actual == paths else { throw MonitorSetupError.invalid("Release contains missing or unlisted files.") }
        let info = try MonitorInstallation.plist(app.appendingPathComponent("Contents/Info.plist"))
        guard info["CFBundleIdentifier"] as? String == MonitorInstallation.bundleID,
              info["CFBundleShortVersionString"] as? String == release.version else { throw MonitorSetupError.invalid("Release app identity/version mismatch.") }
        return release
    }
}

/// Filesystem transaction with injected process operations so tests never change launchd or kill apps.
public struct MonitorInstallation {
    public static let bundleID = "local.codex.usage-monitor"
    public static let agentLabel = "local.codex.usage-monitor.launcher"
    public let home: URL
    public var root: URL { home.appendingPathComponent(".codex/usage-monitor") }
    public var app: URL { home.appendingPathComponent("Applications/Codex Usage Monitor.app") }
    public var hooks: URL { home.appendingPathComponent(".codex/hooks.json") }
    public var agent: URL { home.appendingPathComponent("Library/LaunchAgents/\(Self.agentLabel).plist") }
    public var helper: URL { root.appendingPathComponent("CodexUsageLauncher") }
    public init(home: URL) { self.home = home }
    public static func plist(_ url: URL) throws -> [String: Any] {
        guard let value = try PropertyListSerialization.propertyList(from: Data(contentsOf: url), format: nil) as? [String: Any] else { throw MonitorSetupError.invalid("Invalid property list.") }
        return value
    }
    private func exists(_ url: URL) -> Bool { FileManager.default.fileExists(atPath: url.path) }
    public static func checkPlatform(architecture: String, majorOS: Int) throws {
        guard architecture == "arm64", majorOS >= 13 else { throw MonitorSetupError.invalid("TokenMonitor requires Apple silicon and macOS 13 or later.") }
    }
    private func checkPaths() throws {
        // Refuse redirected install destinations, including symlinked parent folders.
        for target in [app, root, hooks, agent, helper, root.appendingPathComponent("installation.json")] {
            var url = target
            while url.path != home.path && url.path != "/" {
                if (try? url.resourceValues(forKeys: [.isSymbolicLinkKey]).isSymbolicLink) == true { throw MonitorSetupError.invalid("Refusing a symlinked installation path: \(url.path)") }
                url.deleteLastPathComponent()
            }
        }
    }
    public func checkOwnership() throws {
        try checkPaths()
        if exists(app) {
            guard try Self.plist(app.appendingPathComponent("Contents/Info.plist"))["CFBundleIdentifier"] as? String == Self.bundleID else { throw MonitorSetupError.invalid("Refusing to replace an unrelated app.") }
        }
        if exists(agent) {
            let value = try Self.plist(agent)
            let allowed = [helper.path, app.appendingPathComponent("Contents/MacOS/CodexUsageLauncher").path]
            guard value["Label"] as? String == Self.agentLabel, let args = value["ProgramArguments"] as? [String], args.count == 2,
                  allowed.contains(args[0]), args[1] == "--watch-codex" else { throw MonitorSetupError.invalid("Refusing to change an unrelated launch agent.") }
        }
        if exists(helper) {
            let bundled = app.appendingPathComponent("Contents/MacOS/CodexUsageLauncher")
            let receipt = NativeHookBridge.read(root.appendingPathComponent("installation.json"))
            let digest = try MonitorRelease.digest(helper)
            let knownLegacyReceipt = receipt["helper_sha256"] == nil && receipt["bundle_id"] as? String == "com.openai.codex" && receipt["app_path"] as? String == app.path && exists(agent) && exists(app)
            guard (try? MonitorRelease.digest(bundled)) == digest || receipt["helper_sha256"] as? String == digest || (knownLegacyReceipt && Self.legacyHelperSignature(helper)) else { throw MonitorSetupError.invalid("Cannot verify ownership of existing launch helper.") }
        }
    }
    private static func legacyHelperSignature(_ url: URL) -> Bool {
        // Old UI-only updates did not replace the standalone launcher. Its valid
        // linker signature plus the matching legacy receipt/agent identify it.
        var code: SecStaticCode?
        guard SecStaticCodeCreateWithPath(url as CFURL, SecCSFlags(rawValue: 0), &code) == errSecSuccess, let code,
              SecStaticCodeCheckValidity(code, SecCSFlags(rawValue: 0), nil) == errSecSuccess else { return false }
        var information: CFDictionary?
        guard SecCodeCopySigningInformation(code, SecCSFlags(rawValue: kSecCSSigningInformation), &information) == errSecSuccess,
              let info = information as? [String: Any] else { return false }
        return info[kSecCodeInfoIdentifier as String] as? String == "CodexUsageMonitor"
    }
    public func hookData(uninstall: Bool = false) throws -> Data {
        try HookConfiguration.merge(exists(hooks) ? Data(contentsOf: hooks) : Data("{}".utf8), home: home, uninstall: uninstall)
    }
    private func parent(_ url: URL) throws { try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700]) }
    private func save(_ data: Data, to url: URL) throws {
        try parent(url); try data.write(to: url, options: .atomic)
        try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: url.path)
    }
    private func backupHooks() throws {
        if exists(hooks) { try save(Data(contentsOf: hooks), to: hooks.deletingLastPathComponent().appendingPathComponent("hooks.json.usage-monitor-backup-" + UUID().uuidString)) }
    }
    private func acquireLock() throws -> Int32 {
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        let fd = open(root.appendingPathComponent("setup.lock").path, O_CREAT | O_RDWR | O_NOFOLLOW, 0o600)
        guard fd >= 0 else { throw MonitorSetupError.invalid("Cannot open setup lock.") }
        guard flock(fd, LOCK_EX | LOCK_NB) == 0 else { close(fd); throw MonitorSetupError.invalid("Another TokenMonitor setup or uninstall is running.") }
        return fd
    }
    public func install(assets: URL, desktop: URL, stop: () throws -> Void, activate: () throws -> Void,
                        recover: () throws -> Void, copyApp: (URL, URL) throws -> Void = { try FileManager.default.copyItem(at: $0, to: $1) },
                        checkpoint: (String) throws -> Void = { _ in }) throws {
        let release = try MonitorRelease.validate(assets: assets)
        let desktopInfo = try Self.plist(desktop.appendingPathComponent("Contents/Info.plist"))
        guard desktopInfo["CFBundleIdentifier"] as? String == "com.openai.codex", let executable = desktopInfo["CFBundleExecutable"] as? String,
              !executable.contains("/"), !executable.isEmpty else { throw MonitorSetupError.invalid("Could not locate Codex Desktop; configuration was not changed.") }
        try checkOwnership()
        _ = try hookData()
        let lock = try acquireLock(); defer { flock(lock, LOCK_UN); close(lock) }
        try checkOwnership()
        let merged = try hookData()
        let fm = FileManager.default
        try parent(app)
        let transaction = app.deletingLastPathComponent().appendingPathComponent(".TokenMonitor-transaction-" + UUID().uuidString)
        try fm.createDirectory(at: transaction, withIntermediateDirectories: false)
        var preserveTransaction = false
        defer { if !preserveTransaction { try? fm.removeItem(at: transaction) } }
        let staged = transaction.appendingPathComponent("Codex Usage Monitor.app")
        try copyApp(assets.appendingPathComponent("Codex Usage Monitor.app"), staged)
        try fm.copyItem(at: assets.appendingPathComponent("release.json"), to: transaction.appendingPathComponent("release.json"))
        _ = try MonitorRelease.validate(assets: transaction)
        let managed = [hooks, root.appendingPathComponent("installation.json"), helper, agent]
        let originals = try managed.map { exists($0) ? try Data(contentsOf: $0) : nil }
        let oldApp = transaction.appendingPathComponent("previous.app")
        let hadApp = exists(app)
        var stopped = false, swapped = false, oldMoved = false
        do {
            try backupHooks()
            // If stop fails partway, recovery still needs to restart the previous helper.
            stopped = true; try stop()
            if hadApp { try fm.moveItem(at: app, to: oldApp); oldMoved = true }
            try fm.moveItem(at: staged, to: app); swapped = true
            try checkpoint("app")
            try save(merged, to: hooks)
            try parent(helper)
            if exists(helper) { try fm.removeItem(at: helper) }
            try fm.copyItem(at: app.appendingPathComponent("Contents/MacOS/CodexUsageLauncher"), to: helper)
            try fm.setAttributes([.posixPermissions: 0o755], ofItemAtPath: helper.path)
            let settings: [String: Any] = ["bundle_id": "com.openai.codex", "desktop_path": desktop.path,
                "executable_path": desktop.appendingPathComponent("Contents/MacOS/" + executable).path,
                "app_path": app.path, "version": release.version, "helper_sha256": try MonitorRelease.digest(helper), "managed_by": "token-monitor"]
            try save(JSONSerialization.data(withJSONObject: settings, options: [.prettyPrinted, .sortedKeys]), to: root.appendingPathComponent("installation.json"))
            let agentInfo: [String: Any] = ["Label": Self.agentLabel, "ProgramArguments": [helper.path, "--watch-codex"], "RunAtLoad": true, "KeepAlive": true, "ThrottleInterval": 10]
            try save(PropertyListSerialization.data(fromPropertyList: agentInfo, format: .xml, options: 0), to: agent)
            try checkpoint("config")
            try activate()
            try checkpoint("activated")
        } catch {
            let originalError = error
            do {
                if stopped { try stop() }
                if swapped { try fm.removeItem(at: app) }
                if oldMoved { try fm.moveItem(at: oldApp, to: app) }
                for (url, data) in zip(managed, originals) {
                    if let data { try save(data, to: url) } else if exists(url) { try fm.removeItem(at: url) }
                }
                if originals[2] != nil { try fm.setAttributes([.posixPermissions: 0o755], ofItemAtPath: helper.path) }
                if stopped { try recover() }
            } catch {
                preserveTransaction = true
                // Keep the previous bundle and configuration bytes for manual recovery.
                for (index, data) in originals.enumerated() {
                    if let data { try? data.write(to: transaction.appendingPathComponent("original-\(index).backup")) }
                }
                throw MonitorSetupError.invalid("Setup failed and rollback could not finish. Recovery files are in \(transaction.path). Original error: \(originalError.localizedDescription)")
            }
            throw originalError
        }
    }

    public func uninstall(purge: Bool, stop: () throws -> Void) throws {
        try checkOwnership()
        _ = try hookData(uninstall: true)
        let lock = try acquireLock(); defer { flock(lock, LOCK_UN); close(lock) }
        try checkOwnership()
        let merged = try hookData(uninstall: true)
        try stop(); try backupHooks()
        if exists(hooks) { try save(merged, to: hooks) }
        for url in [agent, helper, app, root.appendingPathComponent("installation.json")] { if exists(url) { try FileManager.default.removeItem(at: url) } }
        // Preserve unrecognized scripts at legacy paths; only delete a known bridge implementation.
        let legacy = home.appendingPathComponent(".codex/hooks/TokenMonitor.py")
        if (try? MonitorRelease.digest(legacy)) == Self.legacyBridgeDigest { try FileManager.default.removeItem(at: legacy) }
        if purge, exists(root) { try FileManager.default.removeItem(at: root) }
    }
    public static let legacyBridgeDigest = "b628a268800762f540ecc2703b29eff360168bb358ad3bc41b8dabca9fb005e2"
}
