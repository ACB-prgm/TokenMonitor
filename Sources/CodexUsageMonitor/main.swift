import AppKit
import SwiftUI
import MonitorCore
import Combine
import Carbon

if CommandLine.arguments == [CommandLine.arguments[0], "--remote-agent"] { RemoteAgent.run() }

if Management.dispatch() { exit(0) }

// A local, read-only diagnostic entry point for real-rollout parity checks.
if CommandLine.arguments.count == 3, CommandLine.arguments[1] == "--inspect" {
    let parser = CodexTelemetryParser()
    try JSONLTail().read(CommandLine.arguments[2], reset: {}, line: { parser.consume($0) })
    if let s = parser.samples.last {
        let report: [String: Any] = ["input": s.input, "cached": s.cached, "fresh": s.fresh, "output": s.output, "reasoning": s.reasoning, "context_limit": parser.contextLimit as Any? ?? NSNull(), "calls": parser.callCount, "display": "Cached \(Formatting.tokens(s.cached)) · Fresh \(Formatting.tokens(s.fresh)) · Input \(Formatting.tokens(s.input))", "timestamp": ISO8601DateFormatter().string(from: s.timestamp)]
        print(String(data: try JSONSerialization.data(withJSONObject: report, options: [.sortedKeys]), encoding: .utf8)!)
    }
    exit(0)
}
// A separate event-driven launcher stays resident without watching transcripts or polling.
// The HUD process itself exits when Codex exits; the launcher waits for the next app launch.
final class LaunchObserver: NSObject, NSApplicationDelegate {
    var observer: NSObjectProtocol?
    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.prohibited)
        observer = NSWorkspace.shared.notificationCenter.addObserver(forName: NSWorkspace.didLaunchApplicationNotification, object: nil, queue: .main) { [weak self] _ in self?.ensureMonitor() }
        ensureMonitor()
    }
    func ensureMonitor() {
        guard let desktop = CodexProcessDetector().running() else { return }
        let suppression = (try? Data(contentsOf: monitorDirectory.appendingPathComponent("suppression.json"))).flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
        if suppression?["suppress_auto_launch_for_codex_pid"] as? Int == Int(desktop.processIdentifier) { return }
        if NSRunningApplication.runningApplications(withBundleIdentifier: "local.codex.usage-monitor").contains(where: { $0.executableURL?.lastPathComponent == "CodexUsageMonitor" }) { return }
        guard let path = CodexProcessDetector().settings["app_path"] as? String else { return }
        let config = NSWorkspace.OpenConfiguration(); config.activates = false
        NSWorkspace.shared.openApplication(at: URL(fileURLWithPath: path), configuration: config)
    }
}
if CommandLine.arguments.contains("--watch-codex") {
    let app = NSApplication.shared
    let observer = LaunchObserver()
    app.delegate = observer
    app.run()
    exit(0)
}
final class HUDHostingView: NSHostingView<HUDView> {
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
}
final class HUDPanel: NSPanel {
    override var canBecomeKey: Bool { false }
    override var canBecomeMain: Bool { false }
}
final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate {
    let state = AppState()
    var settingsWindow: NSWindow?
    var panel: NSPanel!
    var item: NSStatusItem!
    var timer: Timer?
    var absentSince: Date?
    var codexPID: pid_t?
    var subscription: AnyCancellable?
    var lastCall: String?
    var workspaceObservers: [NSObjectProtocol] = []
    var modeHotKey: EventHotKeyRef?
    var modeHotKeyHandler: EventHandlerRef?
    var pendingPresentation = false
    var corner = UserDefaults.standard.string(forKey: "corner")
    var placing = false
    var dragStart: (frame: NSRect, screen: NSRect, corner: String?)?
    var dragDistance: CGFloat = 0
    var dragTimer: Timer?
    var contentSize = CGSize(width: 340, height: 170)
    var hidden = UserDefaults.standard.bool(forKey: "hidden")
    var clickThrough = UserDefaults.standard.bool(forKey: "clickThrough")
    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
        panel = HUDPanel(contentRect: NSRect(x: 100, y: 150, width: 440, height: 170), styleMask: [.nonactivatingPanel, .borderless], backing: .buffered, defer: false)
        panel.title = "TokenMonitor"
        panel.isOpaque = false; panel.backgroundColor = .clear; panel.hasShadow = false
        panel.titleVisibility = .hidden; panel.titlebarAppearsTransparent = true
        panel.standardWindowButton(.closeButton)?.isHidden = true
        panel.standardWindowButton(.miniaturizeButton)?.isHidden = true
        panel.standardWindowButton(.zoomButton)?.isHidden = true
        panel.level = .floating; panel.hidesOnDeactivate = false; panel.isMovableByWindowBackground = true
        panel.collectionBehavior = [.moveToActiveSpace, .fullScreenAuxiliary]
        panel.isReleasedWhenClosed = false; panel.delegate = self
        let hostingView = HUDHostingView(rootView: HUDView(state: state, settings: { [weak self] in self?.showSettings() }, toggle: { [weak self] in self?.toggleMode() }, hide: { [weak self] in self?.hide() }, place: { [weak self] in self?.snap($0) }, sizeChanged: { [weak self] size in
            DispatchQueue.main.async {
                guard let self, size.width.isFinite, size.height.isFinite, size.width > 0, size.height > 0, self.contentSize != size else { return }
                self.contentSize = size; self.resize()
            }
        }))
        // We own window sizing and corner anchoring; AppKit's intrinsic-size
        // propagation otherwise resizes it again after the anchor is calculated.
        hostingView.sizingOptions = []
        panel.contentView = hostingView
        panel.setFrameAutosaveName("UsageMonitorHUD")
        if !NSScreen.screens.contains(where: { $0.visibleFrame.intersects(panel.frame) }) { panel.center() }
        panel.ignoresMouseEvents = clickThrough
        resize()
        item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        item.button?.image = NSImage(systemSymbolName: "gauge.with.dots.needle.33percent", accessibilityDescription: "Codex Usage Monitor")
        installModeShortcut()
        menu()
        if CommandLine.arguments.contains("--show") { show() }
        else if !hidden { requestAutomaticPresentation() }
        if CommandLine.arguments.contains("--verify-ui") {
            verifyUI()
            return
        }
        let center = NSWorkspace.shared.notificationCenter
        for name in [NSWorkspace.didActivateApplicationNotification, NSWorkspace.activeSpaceDidChangeNotification] {
            workspaceObservers.append(center.addObserver(forName: name, object: nil, queue: .main) { [weak self] _ in
                guard let self else { return }
                self.refreshModeShortcut()
                guard self.codexIsForeground, !self.hidden || self.pendingPresentation else { return }
                self.show()
            })
        }
        let codexBundleID = CodexProcessDetector().settings["bundle_id"] as? String ?? "com.openai.codex"
        workspaceObservers.append(center.addObserver(forName: NSWorkspace.didTerminateApplicationNotification, object: nil, queue: .main) { [weak self] notification in
            guard let self,
                  let app = notification.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication,
                  app.bundleIdentifier == codexBundleID else { return }
            // A replacement instance may already be running during an app restart.
            if let replacement = CodexProcessDetector().running() {
                self.codexPID = replacement.processIdentifier
                self.absentSince = nil
                return
            }
            // Automatic shutdown must not set the manual-quit suppression flag.
            NSApp.terminate(nil)
        })
        subscription = state.$snapshot.sink { [weak self] snapshot in
            guard let self, let sample = snapshot.last else { return }
            let key = "\(self.state.selectedSource)/\(snapshot.session?.session_id ?? "")/\(sample.timestamp.timeIntervalSince1970)/\(snapshot.callCount)"
            if let previous = self.lastCall, previous != key { self.requestAutomaticPresentation() }
            self.lastCall = key
        }
        state.start(); lifecycle()
        timer = Timer.scheduledTimer(withTimeInterval: 2, repeats: true) { [weak self] _ in self?.lifecycle() }
    }
    func verifyUI() {
        // Exercise the real window/menu handlers without sending prompts or touching Codex.
        let initialHidden = hidden, initialExpanded = state.expanded, initialClick = clickThrough
        let initialCorner = corner, initialFrame = panel.frame
        let initialSize = contentSize
        defer {
            contentSize = initialSize
            corner = initialCorner; UserDefaults.standard.set(initialCorner, forKey: "corner")
            panel.setFrame(initialFrame, display: false)
            hidden = initialHidden; state.expanded = initialExpanded; clickThrough = initialClick
            UserDefaults.standard.set(initialHidden, forKey: "hidden")
            UserDefaults.standard.set(initialExpanded, forKey: "expanded")
            UserDefaults.standard.set(initialClick, forKey: "clickThrough")
        }
        hide(); precondition(!panel.isVisible && hidden)
        precondition(!handleModeShortcut() && modeHotKey == nil)
        toggleVisibility(); precondition(panel.isVisible && !hidden)
        if panel.isOnActiveSpace {
            precondition(modeHotKey != nil)
            let mode = state.expanded
            precondition(handleModeShortcut() && state.expanded != mode)
            precondition(handleModeShortcut() && state.expanded == mode)
        }
        let before = state.expanded
        toggleMode(); precondition(state.expanded != before && UserDefaults.standard.bool(forKey: "expanded") == state.expanded)
        toggleClickThrough(); precondition(panel.ignoresMouseEvents == clickThrough)
        // Menu remains available with click-through enabled; exercise its recovery handler.
        precondition(item.menu?.items.contains(where: { $0.title == "Click-through" }) == true)
        if !clickThrough { toggleClickThrough() }
        toggleClickThrough(); precondition(!panel.ignoresMouseEvents)
        precondition(panel.level == .floating && !panel.canBecomeKey && !panel.canBecomeMain)
        for value in ["Top left", "Top right", "Bottom left", "Bottom right"] {
            snap(value)
            let visible = panel.screen!.visibleFrame
            precondition(visible.contains(panel.frame))
            if value.contains("right") { precondition(abs(panel.frame.maxX - (visible.maxX - 16)) < 1) }
            if value.contains("Top") { precondition(abs(panel.frame.maxY - (visible.maxY - 16)) < 1) }
        }
        for anchor in ["Bottom left", "Bottom right"] {
            snap(anchor)
            let screen = panel.screen!.visibleFrame
            for size in [CGSize(width: 340, height: 145), CGSize(width: 440, height: 600), CGSize(width: 506, height: 650)] {
                contentSize = size; resize()
                precondition(corner == anchor && screen.contains(panel.frame))
                precondition(abs(panel.frame.minY - screen.minY - 16) < 1)
            }
        }
        snap("Bottom right")
        let snappedFrame = panel.frame
        let dragScreen = panel.screen!.visibleFrame
        dragStart = (snappedFrame, dragScreen, corner); dragDistance = 0
        panel.setFrameOrigin(NSPoint(x: snappedFrame.minX - 8, y: snappedFrame.minY + 6))
        finishDrag()
        precondition(corner == "Bottom right" && panel.frame == snappedFrame)
        dragStart = (panel.frame, dragScreen, corner); dragDistance = 0
        panel.setFrameOrigin(NSPoint(x: snappedFrame.minX - 80, y: snappedFrame.minY + 80))
        finishDrag()
        precondition(corner == nil)
        dragStart = (panel.frame, dragScreen, nil); dragDistance = 0
        panel.setFrameOrigin(NSPoint(x: snappedFrame.minX - 12, y: snappedFrame.minY + 9))
        finishDrag()
        precondition(corner == "Bottom right" && panel.frame == snappedFrame)
        corner = nil
        panel.setFrameOrigin(panel.screen!.visibleFrame.origin)
        contentSize = CGSize(width: 440, height: 600); resize()
        precondition(panel.screen!.visibleFrame.contains(panel.frame))
        precondition(!panel.collectionBehavior.contains(.canJoinAllSpaces))
        precondition(panel.collectionBehavior.contains(.moveToActiveSpace))
        hide()
        requestAutomaticPresentation(foreground: false)
        precondition(!panel.isVisible && hidden && pendingPresentation)
        requestAutomaticPresentation(foreground: true)
        precondition(panel.isVisible && !hidden && !pendingPresentation)
        let visibleFrame = panel.frame
        requestAutomaticPresentation(foreground: false)
        precondition(panel.frame == visibleFrame && panel.isVisible)
        panel.saveFrame(usingName: "UsageMonitorHUD")
        precondition(UserDefaults.standard.string(forKey: "NSWindow Frame UsageMonitorHUD") != nil)
        showSettings()
        precondition(settingsWindow?.isVisible == true && settingsWindow?.canBecomeKey == true)
        precondition(settingsWindow?.contentView != nil)
        settingsWindow?.close()
        precondition(item.menu?.items.contains(where: { $0.title == "Settings…" }) == true)
        print("PASS: hide/show, persisted mode, click-through/recovery, floating nonactivating panel, saved position, bottom-anchor expansion and screen clamping, accidental drag recovery and corner snap-back, foreground-only automatic presentation")
        DispatchQueue.main.async { NSApp.terminate(nil) }
    }
    func applicationWillTerminate(_ notification: Notification) {
        state.stop()
        if let modeHotKey { UnregisterEventHotKey(modeHotKey) }
        if let modeHotKeyHandler { RemoveEventHandler(modeHotKeyHandler) }
        timer?.invalidate()
        dragTimer?.invalidate()
        for observer in workspaceObservers {
            NSWorkspace.shared.notificationCenter.removeObserver(observer)
        }
        workspaceObservers.removeAll()
    }
    // Register only on the panel's active Space, so other desktops keep Cmd+\ intact.
    // Carbon hot keys are event-driven and need no keyboard-monitoring permission.
    func installModeShortcut() {
        var event = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
        InstallEventHandler(GetApplicationEventTarget(), { _, _, context in
            guard let context else { return OSStatus(eventNotHandledErr) }
            let delegate = Unmanaged<AppDelegate>.fromOpaque(context).takeUnretainedValue()
            return delegate.handleModeShortcut() ? noErr : OSStatus(eventNotHandledErr)
        }, 1, &event, Unmanaged.passUnretained(self).toOpaque(), &modeHotKeyHandler)
    }
    func refreshModeShortcut() {
        let enabled = !hidden && panel.isVisible && panel.isOnActiveSpace
        if enabled, modeHotKey == nil {
            let id = EventHotKeyID(signature: OSType(0x544D4F4E), id: 1) // TMON
            RegisterEventHotKey(UInt32(kVK_ANSI_Backslash), UInt32(cmdKey), id,
                                GetApplicationEventTarget(), 0, &modeHotKey)
        } else if !enabled, let key = modeHotKey {
            UnregisterEventHotKey(key)
            modeHotKey = nil
        }
    }
    @discardableResult func handleModeShortcut() -> Bool {
        guard !hidden, panel.isVisible, panel.isOnActiveSpace else { return false }
        toggleMode()
        return true
    }
    func lifecycle() {
        if let app = CodexProcessDetector().running() { codexPID = app.processIdentifier; absentSince = nil }
        else {
            if absentSince == nil { absentSince = Date() }
            if Date().timeIntervalSince(absentSince!) > 5 { NSApp.terminate(nil) }
        }
    }
    func resize() {
        guard panel != nil, dragStart == nil else { return }
        let frame = panel.frame
        // Capture the screen before growing: the new frame may overlap another display.
        let screen = (panel.screen ?? NSScreen.main)?.visibleFrame ?? frame
        placing = true
        defer { placing = false }
        panel.setFrame(NSRect(x: frame.minX, y: frame.maxY - contentSize.height, width: contentSize.width, height: contentSize.height), display: true)
        if let corner { position(corner, in: screen) }
        else {
            panel.setFrameOrigin(NSPoint(
                x: max(screen.minX, min(panel.frame.minX, screen.maxX - panel.frame.width)),
                y: max(screen.minY, min(panel.frame.minY, screen.maxY - panel.frame.height))))
        }
    }
    func position(_ corner: String, in visibleFrame: NSRect? = nil) {
        let screen = visibleFrame ?? (panel.screen ?? NSScreen.main)?.visibleFrame ?? panel.frame
        panel.setFrameOrigin(CornerSnap.origin(corner, size: panel.frame.size, screen: screen))
    }
    func snap(_ value: String) {
        corner = value; UserDefaults.standard.set(value, forKey: "corner")
        placing = true; position(value); placing = false
        panel.saveFrame(usingName: "UsageMonitorHUD")
    }
    func windowWillMove(_ notification: Notification) {
        guard !placing, dragStart == nil, NSEvent.pressedMouseButtons & 1 != 0,
              [.leftMouseDown, .leftMouseDragged].contains(NSApp.currentEvent?.type) else { return }
        dragStart = (panel.frame, (panel.screen ?? NSScreen.main)?.visibleFrame ?? panel.frame, corner)
        dragDistance = 0
        // Native background dragging can consume mouse-up inside AppKit's tracking
        // loop. A common-mode timer also catches release outside our window.
        let timer = Timer(timeInterval: 0.05, repeats: true) { [weak self] _ in
            guard let self else { return }
            self.trackDrag()
            if NSEvent.pressedMouseButtons & 1 == 0 { self.finishDrag() }
        }
        dragTimer = timer
        RunLoop.main.add(timer, forMode: .common)
    }
    func windowDidMove(_ notification: Notification) {
        if !placing { trackDrag() }
    }
    func trackDrag() {
        guard let start = dragStart else { return }
        dragDistance = max(dragDistance, CornerSnap.distance(start.frame.origin, panel.frame.origin))
        if dragDistance > CornerSnap.dragThreshold { corner = nil }
    }
    func finishDrag() {
        guard let start = dragStart else { return }
        trackDrag()
        dragTimer?.invalidate(); dragTimer = nil
        dragStart = nil
        let screen: NSRect
        if let anchor = start.corner, dragDistance <= CornerSnap.dragThreshold {
            corner = anchor
            screen = start.screen
        } else {
            screen = (panel.screen ?? NSScreen.main)?.visibleFrame ?? start.screen
            corner = CornerSnap.nearest(frame: panel.frame, screen: screen)
        }
        UserDefaults.standard.set(corner, forKey: "corner")
        placing = true
        if let corner { position(corner, in: screen) }
        placing = false
        resize()
        panel.saveFrame(usingName: "UsageMonitorHUD")
    }
    func applicationDidChangeScreenParameters(_ notification: Notification) { resize() }
    var codexIsForeground: Bool {
        guard let codex = CodexProcessDetector().running() else { return false }
        return NSWorkspace.shared.frontmostApplication?.processIdentifier == codex.processIdentifier
    }
    // Hooks and telemetry can arrive while the user is working on a different Space.
    // Only foreground Codex may automatically present or relocate the panel.
    func requestAutomaticPresentation(foreground: Bool? = nil) {
        pendingPresentation = true
        guard foreground ?? codexIsForeground else { return }
        show()
    }
    func show() {
        pendingPresentation = false
        // Reorder on the active Space without activating the monitor or stealing focus.
        if !panel.isOnActiveSpace { panel.orderOut(nil) }
        hidden = false; panel.orderFrontRegardless(); UserDefaults.standard.set(false, forKey: "hidden"); menu(); refreshModeShortcut()
    }
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool { requestAutomaticPresentation(); return true }
    func menu() {
        let m = NSMenu()
        func add(_ title: String, _ action: Selector, checked: Bool = false) {
            let i = NSMenuItem(title: title, action: action, keyEquivalent: ""); i.target = self; i.state = checked ? .on : .off; m.addItem(i)
        }
        add(hidden ? "Show HUD" : "Hide HUD", #selector(toggleVisibility))
        add("Expanded (⌘\\)", #selector(toggleMode), checked: state.expanded)
        add("Click-through", #selector(toggleClickThrough), checked: clickThrough)
        add("Settings…", #selector(showSettings))
        m.addItem(.separator()); add("Uninstall TokenMonitor…", #selector(uninstallMonitor)); add("Quit Monitor", #selector(quitMonitor)); item.menu = m
    }
    @objc func showSettings() {
        if settingsWindow == nil {
            let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 660, height: 560), styleMask: [.titled, .closable], backing: .buffered, defer: false)
            window.title = "Token Monitor Settings"; window.isReleasedWhenClosed = false
            window.contentView = NSHostingView(rootView: SettingsView(state: state))
            window.center(); settingsWindow = window
        }
        NSApp.activate(ignoringOtherApps: true); settingsWindow?.makeKeyAndOrderFront(nil)
    }
    @objc func toggleVisibility() { if hidden { show() } else { hide() } }
    func hide() { pendingPresentation = false; hidden = true; panel.orderOut(nil); UserDefaults.standard.set(true, forKey: "hidden"); menu(); refreshModeShortcut() }
    func windowShouldClose(_ sender: NSWindow) -> Bool { hide(); return false }
    @objc func toggleMode() { state.expanded.toggle(); UserDefaults.standard.set(state.expanded, forKey: "expanded"); menu() }
    @objc func toggleClickThrough() { clickThrough.toggle(); panel.ignoresMouseEvents = clickThrough; UserDefaults.standard.set(clickThrough, forKey: "clickThrough"); menu() }
    @objc func uninstallMonitor() {
        let alert = NSAlert()
        alert.messageText = "Uninstall TokenMonitor?"
        alert.informativeText = "Removes the companion app, launch helper, and its six hook registrations. Your monitor preferences and saved state will be kept."
        alert.addButton(withTitle: "Uninstall"); alert.addButton(withTitle: "Cancel")
        guard alert.runModal() == .alertFirstButtonReturn else { return }
        do {
            try Management.installation.uninstall(purge: false, stop: Management.stop)
            NSApp.terminate(nil)
        } catch {
            let failure = NSAlert(); failure.messageText = "Uninstall could not finish"; failure.informativeText = error.localizedDescription; failure.runModal()
        }
    }
    @objc func quitMonitor() {
        if let pid = CodexProcessDetector().running()?.processIdentifier ?? codexPID {
            if let data = try? JSONSerialization.data(withJSONObject: ["suppress_auto_launch_for_codex_pid": pid]) { try? data.write(to: monitorDirectory.appendingPathComponent("suppression.json"), options: .atomic) }
        }
        NSApp.terminate(nil)
    }
}
let application = NSApplication.shared
let delegate = AppDelegate()
application.delegate = delegate
application.run()
