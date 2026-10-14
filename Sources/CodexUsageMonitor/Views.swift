import SwiftUI
import Charts
import MonitorCore

struct HUDView: View {
    @Environment(\.colorScheme) private var colorScheme
    @ObservedObject var state: AppState
    @State private var showTools = false
    let settings: () -> Void
    let toggle: () -> Void
    let hide: () -> Void
    let place: (String) -> Void
    let sizeChanged: (CGSize) -> Void
    var baseWidth: CGFloat { state.expanded ? 440 : 420 }
    var s: Snapshot { state.snapshot }
    var contextColor: Color { healthColor(TokenHealth.context(percent: s.contextPercent), scheme: colorScheme) }
    var freshColor: Color { healthColor(TokenHealth.fresh(tokens: s.fresh, input: s.input), scheme: colorScheme) }
    func quota(_ a: Allowance?) -> String { a.map { String(format: "%.0f%%", min(100, max(0, 100 - $0.used))) } ?? "—" }
    func cacheLabel(_ label: String, fresh: Bool = false) -> String {
        guard !s.awaitingPostCompactionCall, let call = s.last, call.input > 0 else { return label }
        let percent = Double(fresh ? call.fresh : call.cached) / Double(call.input) * 100
        return "\(label) (\(String(format: "%.0f%%", percent)))"
    }
    func metric(_ label: String, _ value: Int?, emphasis: Bool = false, color: Color = .primary) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label).font(.system(size: 11 * state.uiScale)).foregroundStyle(.secondary)
            Text(value.map(Formatting.tokens) ?? "—")
                .font(.system(size: (state.expanded ? 26 : 22) * state.uiScale, weight: emphasis ? .semibold : .medium, design: .rounded)).monospacedDigit().foregroundStyle(color)
        }.frame(maxWidth: .infinity, alignment: .leading)
            .help(value.map { "\(label): \($0) tokens" } ?? "Waiting for telemetry")
    }
    var body: some View {
        VStack(alignment: .leading, spacing: state.expanded ? 14 : 10) {
            HStack(spacing: 10) {
                Image(systemName: "waveform.path").foregroundStyle(.secondary)
                Menu {
                    if state.recentThreads.isEmpty { Text("No recent local tasks available") }
                    Section("Local") {
                        ForEach(state.recentThreads) { thread in
                            Button { state.selectThread(thread) } label: {
                                Text("\(state.selectedSource == "local" && thread.id == s.session?.session_id ? "✓ " : "")\(thread.title) · \(thread.id.suffix(8))")
                            }
                        }
                    }
                    ForEach(state.remotes.filter { $0.enabled }) { remote in
                        Section(remote.label) {
                            ForEach(state.remoteThreads[remote.id] ?? []) { thread in
                                Button { state.selectThread(thread, source: remote.id.uuidString) } label: {
                                    Text("\(state.selectedSource == remote.id.uuidString && thread.id == s.session?.session_id ? "✓ " : "")\(thread.title) · \(thread.id.suffix(8))")
                                }
                            }
                            if (state.remoteThreads[remote.id] ?? []).isEmpty {
                                Text(state.connectionStatus[remote.id] ?? "Waiting for remote")
                            }
                        }
                    }
                    Divider()
                    Button("Refresh tasks") { state.refreshThreads() }
                } label: {
                    Text(state.remotes.isEmpty ? s.title : "\(state.machineLabel) · \(s.title)").font(.system(size: 12 * state.uiScale, weight: .semibold)).lineLimit(1)
                }.menuStyle(.borderlessButton).help("Choose a task to inspect. While unlocked, the next hook event selects its task.").accessibilityLabel("Select monitored task")
                Spacer(minLength: 0)
                Menu {
                    Button(state.isLocked ? "Unlock selected task" : "Lock selected task") { state.toggleLock() }.disabled(s.session == nil)
                    Menu("Layout size") {
                        ForEach([85, 100, 115], id: \.self) { percent in
                            Button("\(percent)%\(Int((state.uiScale * 100).rounded()) == percent ? " ✓" : "")") { state.uiScale = Double(percent) / 100 }
                        }
                    }
                    Divider()
                    Button("Manage remotes…") { settings() }
                } label: {
                    Image(systemName: state.isLocked ? "gearshape.fill" : "gearshape")
                }.menuStyle(.borderlessButton).fixedSize().help("Settings").accessibilityLabel("Settings")
                Menu {
                    ForEach(["Top left", "Top right", "Bottom left", "Bottom right"], id: \.self) { corner in
                        Button(corner) { place(corner) }
                    }
                } label: { Image(systemName: "viewfinder") }
                    .menuStyle(.borderlessButton).fixedSize().help("Snap to screen corner").accessibilityLabel("Snap to screen corner")
                Button(action: toggle) { Image(systemName: state.expanded ? "chevron.up" : "chevron.down").frame(width: 20 * state.uiScale, height: 20 * state.uiScale) }.help("Compact / Expanded (⌘\\)")
                Button(action: hide) { Image(systemName: "xmark").frame(width: 20 * state.uiScale, height: 20 * state.uiScale) }.help("Hide until the next call")
            }.buttonStyle(.plain).foregroundStyle(.secondary)
            HStack(spacing: 16) {
                metric(cacheLabel("Cached"), s.cached)
                metric(cacheLabel("Fresh", fresh: true), s.fresh, color: freshColor)
                metric(s.awaitingPostCompactionCall ? "Input ≈" : "Input", s.input, emphasis: true, color: contextColor)
                    .help(s.awaitingPostCompactionCall ? "Reduced context reported after compaction. Cached and fresh tokens are unknown until the next model call." : "Input tokens in the latest call")
            }
            if !state.expanded {
                HStack(spacing: 16) {
                    cacheStatus.frame(maxWidth: .infinity, alignment: .leading)
                    compactionValue.frame(maxWidth: .infinity, alignment: .center)
                    Text("Context \(s.contextPercent.map { String(format: "%.0f%%", $0) } ?? "—")").foregroundStyle(contextColor)
                        .lineLimit(1).minimumScaleFactor(0.8)
                        .frame(maxWidth: .infinity, alignment: .trailing)
                }.font(.system(size: 11 * state.uiScale)).monospacedDigit().foregroundStyle(.secondary)
            }
            HStack(spacing: 6 * state.uiScale) {
                Text("\(s.model ?? "Model unknown") • \(s.effort ?? "Effort unknown")")
                    .fontWeight(.medium).lineLimit(1).truncationMode(.middle)
                    .help("\(s.model ?? "Model unknown") • \(s.effort ?? "Effort unknown")")
                Text("|").foregroundStyle(.tertiary)
                Text("5h \(quota(s.fiveHour)) • 7d \(quota(s.weekly)) remaining")
                    .monospacedDigit().fixedSize()
                    .help("Account allowance remaining")
            }.font(.system(size: 11 * state.uiScale)).foregroundStyle(.secondary)
            if state.expanded {
                HStack(spacing: 8 * state.uiScale) {
                    cacheStatus.font(.system(size: 11 * state.uiScale)).fixedSize()
                    compactionValue
                }
            }
            skillsAndTools
            if state.expanded {
                Divider()
                VStack(alignment: .leading, spacing: 7) {
                    HStack { Text("Context window · \(s.contextPercent.map { String(format: "%.0f%%", $0) } ?? "—")").foregroundStyle(contextColor); Spacer(); Text("\(s.input.map(Formatting.tokens) ?? "—") / \(s.contextLimit.map(Formatting.tokens) ?? "unknown")") }
                    ProgressView(value: min(1, max(0, (s.contextPercent ?? 0) / 100))).tint(contextColor)
                }.font(.system(size: 11 * state.uiScale)).foregroundStyle(.secondary)
                HStack(alignment: .top) {
                    allowance("5-hour allowance", s.fiveHour)
                    Spacer()
                    allowance("Weekly allowance", s.weekly)
                }
                VStack(alignment: .leading, spacing: 10) {
                    HStack { Text("Recent calls").fontWeight(.medium); Spacer(); Text("Input").foregroundStyle(.blue); Text("Fresh").foregroundStyle(.orange) }.font(.system(size: 11 * state.uiScale))
                    Chart {
                        ForEach(Array(s.samples.enumerated()), id: \.offset) { item in
                            let x = Double(s.callCount - s.samples.count + item.offset)
                            LineMark(x: .value("Call", x), y: .value("Tokens", item.element.input)).foregroundStyle(by: .value("Series", "Input"))
                            LineMark(x: .value("Call", x), y: .value("Tokens", item.element.fresh)).foregroundStyle(by: .value("Series", "Fresh"))
                        }
                        ForEach(s.compactions, id: \.timestamp) { event in
                            RuleMark(x: .value("Call", event.callPosition))
                                .foregroundStyle(Color.secondary.opacity(0.3))
                                .lineStyle(StrokeStyle(lineWidth: 1, dash: [2, 3]))
                                .accessibilityLabel("Context compacted")
                                .accessibilityValue(Formatting.time(event.timestamp, expanded: true))
                        }
                    }.chartXScale(domain: RecentCallsChart.domain(callCount: s.callCount, sampleCount: s.samples.count, compactions: s.compactions))
                        .chartForegroundStyleScale(["Input": Color.blue, "Fresh": Color.orange]).chartLegend(.hidden).chartXAxis(.hidden).frame(height: 85 * state.uiScale)
                        .help("Dotted vertical lines mark completed context compactions between calls.")

                }
                DisclosureGroup("Task details") {
                    VStack(alignment: .leading, spacing: 5) {
                        Text("Session: \(s.session?.session_id ?? "—")")
                        Text("Workspace: \(s.session?.cwd ?? "—")")
                        Text("Transcript: \(s.session?.transcript_path ?? "—")")
                        Text("Last call: \(Formatting.time(s.last?.timestamp, expanded: true))")
                        Text(s.status)
                    }.font(.system(size: 10 * state.uiScale)).foregroundStyle(.secondary).textSelection(.enabled).frame(maxWidth: .infinity, alignment: .leading)
                }.font(.system(size: 11 * state.uiScale))
            }
            HStack {
                Circle().fill(s.isCompacting ? Color.orange.opacity(0.7) : (s.last == nil ? Color.secondary : Color.green.opacity(0.75))).frame(width: 5, height: 5)
                Text("TokenMonitor").fontWeight(.medium)
                Text(s.isCompacting ? "· Compacting…" : (s.awaitingPostCompactionCall ? "· Compacted" : "· Call \(s.callCount)" ))
                Spacer()
                Text(Formatting.time(s.last?.timestamp)).monospacedDigit().help(Formatting.time(s.last?.timestamp, expanded: true))
            }.font(.system(size: 10 * state.uiScale)).foregroundStyle(.tertiary)
        }
        .padding((state.expanded ? 16 : 12) * state.uiScale).frame(width: (baseWidth - 12) * state.uiScale).fixedSize(horizontal: false, vertical: true)
        .background(Color(nsColor: .windowBackgroundColor))
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(Color.primary.opacity(colorScheme == .dark ? 0.12 : 0.09), lineWidth: 1))
        .shadow(color: .black.opacity(colorScheme == .dark ? 0.14 : 0.07), radius: 3 * state.uiScale, x: 0, y: 1 * state.uiScale)
        .padding(6 * state.uiScale)
        .background(GeometryReader { proxy in
            Color.clear
                .onAppear { sizeChanged(proxy.size) }
                .onChange(of: proxy.size) { sizeChanged($0) }
        })
    }
    private var cacheStatus: some View {
        let color: Color = {
            switch state.cacheTemperature {
            case .warm: return Color(nsColor: .systemGreen)
            case .uncertain: return healthColor(1, scheme: colorScheme)
            case .presumedCold: return healthColor(2.5, scheme: colorScheme)
            case nil: return .secondary
            }
        }()
        return (Text("Cache ").foregroundColor(.secondary)
            + Text(state.cacheTemperature?.rawValue ?? "—").foregroundColor(color))
            .lineLimit(1).minimumScaleFactor(0.8)
            .help("Predicted cache availability before the next call, based on time since the last model call. Warm under 30 minutes; uncertain through 120 minutes; presumed cold afterward. Actual cache reuse may differ.")
    }
    private var compactionValue: some View {
        let value = CompactionValue.estimate(currentInput: s.input)
        let category = value?.category
        let costColor: Color = category == nil || category == .low || category == .veryLow
            ? .secondary : healthColor(category?.colorLevel ?? 0, scheme: colorScheme)
        let calls = value?.breakEvenCalls.map { "~\($0) calls" } ?? "No break-even"
        let compactCategory: String = {
            switch category {
            case .veryLow: return "XLOW"
            case .medium: return "MED"
            case .veryHigh: return "XHIGH"
            default: return category?.rawValue ?? "—"
            }
        }()
        let expandedCalls = value?.breakEvenCalls == nil ? calls : "Break-even \(calls)"
        return HStack(spacing: 0) {
            (Text(state.expanded ? "Compaction Value  " : "ComVal: ").foregroundColor(.secondary)
                + Text(state.expanded ? (category?.rawValue ?? "—") : compactCategory).foregroundColor(costColor))
                .fixedSize(horizontal: true, vertical: false)
            Text(value.map {
                state.expanded
                    ? " · Est. \(Formatting.tokens($0.currentInput)) → \(Formatting.tokens($0.estimatedInput)) · \(expandedCalls)"
                    : " · \(calls)"
            } ?? "").foregroundColor(.secondary)
                .lineLimit(1).minimumScaleFactor(0.7)
        }
        .font(.system(size: 11 * state.uiScale)).monospacedDigit()
        .help("Estimates when compacting becomes cheaper than continuing with the current context. Includes estimated compaction output cost; the current-context read common to both choices cancels. Cache temperature does not change this estimate. Cost efficiency only; compacting may discard useful conversational detail.")
    }
    private var attributionHelp: String {
        "Estimate from recorded tool arguments and result text, about 4 characters per token; bounded by latest input. Counts cover retained history, not the entire session. Wrapped calls count once. Images, hidden tool schemas, and skill catalogs are excluded. Compaction summaries cannot be attributed; only surviving tool records are counted."
    }
    private var skillsAndTools: some View {
        DisclosureGroup(isExpanded: $showTools) {
            VStack(alignment: .leading, spacing: 6 * state.uiScale) {
                Text("Top: " + s.attribution.contributors.prefix(3).map {
                    "\($0.name) \(Formatting.tokens($0.tokens))"
                }.joined(separator: " · "))
                    .fixedSize(horizontal: false, vertical: true)
                ScrollView {
                    VStack(alignment: .leading, spacing: 5 * state.uiScale) {
                        ForEach(s.attribution.contributors) { contributor in
                            HStack {
                                Text(contributor.name).lineLimit(1).help(contributor.name)
                                Spacer(minLength: 4)
                                if contributor.calls > 0 { Text("\(contributor.calls) calls") }
                                Text("≈\(Formatting.tokens(contributor.tokens))")
                                Text(Formatting.percent(contributor.tokens, limit: s.input).map { String(format: "%.0f%%", $0) } ?? "—")
                            }
                        }
                    }
                }.frame(height: min(CGFloat(s.attribution.contributors.count) * 20 * state.uiScale, 120 * state.uiScale))
                Text(s.attribution.afterCompaction ? "Estimate since compaction; summary attribution unavailable." : "Text estimate; actual retained context may differ.")
                    .font(.system(size: 9 * state.uiScale)).foregroundStyle(.tertiary)
                    .fixedSize(horizontal: false, vertical: true)
            }.padding(.top, 4 * state.uiScale).monospacedDigit()
        } label: {
            Text("Skills & tools  \(s.attribution.skillCount) skills • \(s.attribution.callCount) calls • ≈\(Formatting.tokens(s.attribution.tokens)) tokens (\(s.attribution.percent(of: s.input).map { String(format: "%.0f%%", $0) } ?? "—") of context)")
                .monospacedDigit().lineLimit(1).minimumScaleFactor(0.7)
                .frame(maxWidth: .infinity, alignment: .leading)
        }.font(.system(size: 11 * state.uiScale)).foregroundStyle(.secondary)
            .help(attributionHelp)
    }
    func allowance(_ title: String, _ value: Allowance?) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Text("\(title) · \(quota(value)) remaining").foregroundStyle(.primary)
            Text("Resets \(Formatting.time(value?.reset, expanded: true))").foregroundStyle(.secondary)
        }.font(.system(size: 10 * state.uiScale))
    }
}
