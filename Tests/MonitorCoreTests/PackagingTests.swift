import XCTest
@testable import MonitorCore

final class PackagingTests: XCTestCase {
    var directory: URL!
    var home: URL!
    var assets: URL!
    var desktop: URL!
    var installer: MonitorInstallation { MonitorInstallation(home: home) }
    override func setUpWithError() throws {
        directory = FileManager.default.temporaryDirectory.resolvingSymlinksInPath().appendingPathComponent("Token Monitor Tests ' " + UUID().uuidString)
        home = directory.appendingPathComponent("Home Space")
        assets = directory.appendingPathComponent("Assets")
        desktop = directory.appendingPathComponent("Codex Desktop.app")
        try writePlist(["CFBundleIdentifier": "com.openai.codex", "CFBundleExecutable": "Codex"], desktop.appendingPathComponent("Contents/Info.plist"))
        let app = assets.appendingPathComponent("Codex Usage Monitor.app")
        try writePlist(["CFBundleIdentifier": MonitorInstallation.bundleID, "CFBundleShortVersionString": "1.1.0"], app.appendingPathComponent("Contents/Info.plist"))
        try write("monitor", app.appendingPathComponent("Contents/MacOS/CodexUsageMonitor"))
        try write("launcher", app.appendingPathComponent("Contents/MacOS/CodexUsageLauncher"))
        try inventory()
    }
    override func tearDownWithError() throws { try FileManager.default.removeItem(at: directory) }
    func write(_ text: String, _ url: URL) throws {
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try Data(text.utf8).write(to: url)
    }
    func writePlist(_ object: [String: Any], _ url: URL) throws {
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try PropertyListSerialization.data(fromPropertyList: object, format: .xml, options: 0).write(to: url)
    }
    func inventory() throws {
        let files = try FileManager.default.enumerator(at: assets.appendingPathComponent("Codex Usage Monitor.app"), includingPropertiesForKeys: [.isRegularFileKey])!.compactMap { item -> [String: String]? in
            let url = item as! URL
            guard try url.resourceValues(forKeys: [.isRegularFileKey]).isRegularFile == true else { return nil }
            return ["path": String(url.resolvingSymlinksInPath().path.dropFirst(assets.resolvingSymlinksInPath().path.count + 1)), "sha256": try MonitorRelease.digest(url)]
        }
        try JSONSerialization.data(withJSONObject: ["version": "1.1.0", "architecture": "arm64", "minimumOS": "13.0", "fileCount": files.count, "files": files]).write(to: assets.appendingPathComponent("release.json"))
    }
    func install(checkpoint: (String) throws -> Void = { _ in }) throws {
        try installer.install(assets: assets, desktop: desktop, stop: {}, activate: {}, recover: {}, checkpoint: checkpoint)
    }
    func testFreshRepeatedSetupAndRepairPreserveState() throws {
        try write("user state", installer.root.appendingPathComponent("suppression.json"))
        try write("{\"other\":true}", installer.hooks)
        try install()
        let first = try Data(contentsOf: installer.hooks)
        try install()
        XCTAssertEqual(first, try Data(contentsOf: installer.hooks))
        XCTAssertEqual(try String(contentsOf: installer.root.appendingPathComponent("suppression.json")), "user state")
        try FileManager.default.removeItem(at: installer.agent)
        try install()
        XCTAssertTrue(FileManager.default.fileExists(atPath: installer.agent.path))
        XCTAssertEqual(NativeHookBridge.read(installer.root.appendingPathComponent("installation.json"))["version"] as? String, "1.1.0")
        XCTAssertTrue((try FileManager.default.contentsOfDirectory(atPath: installer.hooks.deletingLastPathComponent().path)).contains { $0.hasPrefix("hooks.json.usage-monitor-backup-") })
    }
    func testLegacyMigrationOnlyRemovesExactCommands() throws {
        let old = "/usr/bin/python3 " + HookConfiguration.quote(home.appendingPathComponent(".codex/hooks/TokenMonitor.py").path)
        let keep = "echo " + old
        let input: [String: Any] = ["description": "keep", "hooks": ["Stop": [["matcher": "*", "hooks": [["type": "command", "command": old], ["type": "command", "command": keep]]]]]]
        try FileManager.default.createDirectory(at: installer.hooks.deletingLastPathComponent(), withIntermediateDirectories: true)
        try JSONSerialization.data(withJSONObject: input).write(to: installer.hooks)
        try install()
        let hooks = NativeHookBridge.read(installer.hooks)
        XCTAssertEqual(hooks["description"] as? String, "keep")
        let groups = (hooks["hooks"] as! [String: Any])["Stop"] as! [[String: Any]]
        XCTAssertEqual(groups.count, 2)
        XCTAssertEqual((groups[0]["hooks"] as! [[String: Any]])[0]["command"] as? String, keep)
        XCTAssertEqual(HookConfiguration.words(HookConfiguration.command(home: home)), [installer.app.appendingPathComponent("Contents/MacOS/CodexUsageMonitor").path, "--hook"])
        XCTAssertFalse(HookConfiguration.isOwned(old + " ; echo extra", home: home))
        XCTAssertFalse(HookConfiguration.isOwned("echo " + old, home: home))
    }
    func testRollbackAfterEveryMutationRestoresPreviousInstall() throws {
        try install()
        let originals = try [installer.hooks, installer.agent, installer.helper, installer.root.appendingPathComponent("installation.json")].map { try Data(contentsOf: $0) }
        try write("new version", assets.appendingPathComponent("Codex Usage Monitor.app/Contents/MacOS/CodexUsageMonitor"))
        try inventory()
        for step in ["app", "config", "activated"] {
            XCTAssertThrowsError(try install { if $0 == step { throw MonitorSetupError.invalid("injected failure") } })
            XCTAssertEqual(try String(contentsOf: installer.app.appendingPathComponent("Contents/MacOS/CodexUsageMonitor")), "monitor")
            for (url, data) in zip([installer.hooks, installer.agent, installer.helper, installer.root.appendingPathComponent("installation.json")], originals) { XCTAssertEqual(try Data(contentsOf: url), data) }
        }
    }
    func testFreshInstallRollbackLeavesNoAppOrHooks() throws {
        XCTAssertThrowsError(try install { if $0 == "config" { throw MonitorSetupError.invalid("failure") } })
        for url in [installer.app, installer.agent, installer.hooks, installer.helper] { XCTAssertFalse(FileManager.default.fileExists(atPath: url.path)) }
    }
    func testUninstallPreservesUnrelatedHooksAndStateThenPurge() throws {
        try write("{\"hooks\":{\"Stop\":[{\"hooks\":[{\"type\":\"command\",\"command\":\"echo unrelated\"}]}]}}", installer.hooks)
        try install()
        try write("state", installer.root.appendingPathComponent("active-session.json"))
        try installer.uninstall(purge: false, stop: {})
        XCTAssertTrue(FileManager.default.fileExists(atPath: installer.root.appendingPathComponent("active-session.json").path))
        XCTAssertTrue(try String(contentsOf: installer.hooks).contains("echo unrelated"))
        XCTAssertFalse(FileManager.default.fileExists(atPath: installer.app.path))
        try installer.uninstall(purge: true, stop: {})
        XCTAssertFalse(FileManager.default.fileExists(atPath: installer.root.path))
    }
    func testMalformedConfigAndUnrelatedAppRefuseBeforeStop() throws {
        for config in ["[]", "{\"hooks\":42}", "{\"hooks\":{\"Stop\":[{}]}}", "not json"] {
            try write(config, installer.hooks)
            XCTAssertThrowsError(try installer.install(assets: assets, desktop: desktop, stop: { XCTFail("must not stop") }, activate: {}, recover: {}))
            XCTAssertEqual(try String(contentsOf: installer.hooks), config)
        }
        try write("{}", installer.hooks)
        try writePlist(["CFBundleIdentifier": "other.app"], installer.app.appendingPathComponent("Contents/Info.plist"))
        XCTAssertThrowsError(try install())
        XCTAssertThrowsError(try installer.uninstall(purge: false, stop: { XCTFail("must not stop") }))
    }
    func testUnrelatedHelperAndAgentRefuse() throws {
        try write("unrelated", installer.helper)
        XCTAssertThrowsError(try install())
        try FileManager.default.removeItem(at: installer.helper)
        try writePlist(["Label": "other"], installer.agent)
        XCTAssertThrowsError(try install())
    }
    func testMissingCodexAndUnsupportedPlatform() throws {
        try FileManager.default.removeItem(at: desktop)
        XCTAssertThrowsError(try install())
        XCTAssertFalse(FileManager.default.fileExists(atPath: home.path))
        XCTAssertThrowsError(try MonitorInstallation.checkPlatform(architecture: "x86_64", majorOS: 15))
        XCTAssertThrowsError(try MonitorInstallation.checkPlatform(architecture: "arm64", majorOS: 12))
        XCTAssertNoThrow(try MonitorInstallation.checkPlatform(architecture: "arm64", majorOS: 13))
    }
    func testCorruptedAndExtraAssetsRejectBeforeMutation() throws {
        try write("extra", assets.appendingPathComponent("Codex Usage Monitor.app/extra"))
        XCTAssertThrowsError(try install())
        try FileManager.default.removeItem(at: assets.appendingPathComponent("Codex Usage Monitor.app/extra"))
        try write("corrupt", assets.appendingPathComponent("Codex Usage Monitor.app/Contents/MacOS/CodexUsageMonitor"))
        XCTAssertThrowsError(try install())
        XCTAssertFalse(FileManager.default.fileExists(atPath: home.path))
    }
    func testConcurrentSetupIsRejectedAndOuterTransactionCompletes() throws {
        try install { step in
            if step == "app" {
                XCTAssertThrowsError(try self.install()) { error in
                    XCTAssertTrue(error.localizedDescription.contains("Another TokenMonitor"))
                }
            }
        }
        XCTAssertTrue(FileManager.default.fileExists(atPath: installer.agent.path))
    }
    func testStagedCopyIsVerifiedBeforeStoppingInstalledApp() throws {
        XCTAssertThrowsError(try installer.install(assets: assets, desktop: desktop,
            stop: { XCTFail("must not stop") }, activate: {}, recover: {}, copyApp: { source, target in
                try FileManager.default.copyItem(at: source, to: target)
                try self.write("changed during staging", target.appendingPathComponent("Contents/MacOS/CodexUsageMonitor"))
            }))
        XCTAssertFalse(FileManager.default.fileExists(atPath: installer.app.path))
    }
    func testRollbackFailureRetainsRecoveryFiles() throws {
        try install()
        var stops = 0
        XCTAssertThrowsError(try installer.install(assets: assets, desktop: desktop,
            stop: { stops += 1; if stops > 1 { throw MonitorSetupError.invalid("cannot stop new helper") } },
            activate: {}, recover: {}, checkpoint: { if $0 == "config" { throw MonitorSetupError.invalid("injected failure") } })) { error in
                XCTAssertTrue(error.localizedDescription.contains("Recovery files"))
            }
        let transactions = try FileManager.default.contentsOfDirectory(at: installer.app.deletingLastPathComponent(), includingPropertiesForKeys: nil).filter { $0.lastPathComponent.hasPrefix(".TokenMonitor-transaction-") }
        XCTAssertEqual(transactions.count, 1)
        XCTAssertTrue(FileManager.default.fileExists(atPath: transactions[0].appendingPathComponent("previous.app").path))
        XCTAssertTrue(FileManager.default.fileExists(atPath: transactions[0].appendingPathComponent("original-0.backup").path))
    }
    func testRedirectedInstallDestinationIsRefused() throws {
        let unrelated = directory.appendingPathComponent("Unrelated")
        try FileManager.default.createDirectory(at: unrelated, withIntermediateDirectories: true)
        try FileManager.default.createDirectory(at: home, withIntermediateDirectories: true)
        try FileManager.default.createSymbolicLink(at: home.appendingPathComponent("Applications"), withDestinationURL: unrelated)
        XCTAssertThrowsError(try install())
        XCTAssertEqual(try FileManager.default.contentsOfDirectory(atPath: unrelated.path), [])
    }
    func testHookBridgeSelectionSuppressionAndCompaction() throws {
        var launches = [Int]()
        func send(_ session: String, _ event: String, _ pid: Int = 123) throws {
            try NativeHookBridge.process(["session_id": session, "transcript_path": "/tmp/" + session, "hook_event_name": event], root: installer.root, pid: pid) { launches.append(pid) }
        }
        try send("a", "SessionStart"); try send("b", "UserPromptSubmit"); try send("a", "Stop")
        XCTAssertEqual(NativeHookBridge.read(installer.root.appendingPathComponent("active-session.json"))["session_id"] as? String, "a")
        try NativeHookBridge.write(["suppress_auto_launch_for_codex_pid": 123], to: installer.root.appendingPathComponent("suppression.json"))
        try send("b", "SessionStart"); try send("b", "Stop")
        XCTAssertEqual(launches, [123, 123, 123])
        try send("c", "PreCompact", 456); try send("c", "PostCompact", 456); try send("c", "SessionEnd", 456)
        XCTAssertEqual(launches, [123, 123, 123, 456, 456])
        XCTAssertEqual(NativeHookBridge.read(installer.root.appendingPathComponent("active-session.json"))["ended"] as? Bool, true)
    }
    func testBridgeRejectsInvalidAndPreservesTranscript() throws {
        for payload: [String: Any] in [["session_id": "a", "hook_event_name": "Stop", "transcript_path": "relative"], ["session_id": "", "hook_event_name": "Stop"], ["session_id": "a", "hook_event_name": "unknown"]] {
            try NativeHookBridge.process(payload, root: installer.root, pid: 1) { XCTFail("launch") }
        }
        XCTAssertFalse(FileManager.default.fileExists(atPath: installer.root.path))
        try NativeHookBridge.process(["session_id": "a", "hook_event_name": "Stop", "transcript_path": "/tmp/a"], root: installer.root, pid: nil) { XCTFail("launch") }
        try NativeHookBridge.process(["session_id": "a", "hook_event_name": "SessionEnd", "transcript_path": NSNull()], root: installer.root, pid: nil) { XCTFail("launch") }
        XCTAssertEqual(NativeHookBridge.read(installer.root.appendingPathComponent("active-session.json"))["transcript_path"] as? String, "/tmp/a")
    }
}
