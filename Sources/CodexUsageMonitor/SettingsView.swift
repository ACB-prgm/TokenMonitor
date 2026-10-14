import AppKit
import SwiftUI
import MonitorCore

struct SettingsView: View {
    @ObservedObject var state: AppState
    @State private var draft = RemoteConfiguration()
    @State private var editing = false
    @State private var error = ""
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Token Monitor Settings").font(.title2)
            HStack {
                Toggle("Lock selected task", isOn: Binding(get: { state.isLocked }, set: { _ in state.toggleLock() })).disabled(state.snapshot.session == nil)
                Spacer()
                Picker("Layout size", selection: $state.uiScale) {
                    Text("85%").tag(0.85); Text("100%").tag(1.0); Text("115%").tag(1.15)
                }.frame(width: 180)
            }
            Divider()
            Text("Remote machines").font(.headline)
            Text("Optional SSH connections. Without a connection, monitoring stays local.").foregroundStyle(.secondary)
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    ForEach(state.remotes) { remote in
                        HStack {
                            VStack(alignment: .leading) {
                                Text(remote.label).fontWeight(.medium)
                                Text(remote.enabled ? state.connectionStatus[remote.id] ?? "Waiting" : "Disabled")
                                    .font(.caption).foregroundStyle(.secondary).textSelection(.enabled)
                            }
                            Spacer()
                            Button(remote.enabled ? "Disable" : "Enable") {
                                var values = state.remotes
                                if let i = values.firstIndex(where: { $0.id == remote.id }) { values[i].enabled.toggle() }
                                save(values)
                            }
                            Button("Test / Reconnect") { state.reconnect(remote.id) }.disabled(!remote.enabled)
                            Button("Edit") { draft = remote; editing = true; error = "" }
                            Button("Remove") { save(state.remotes.filter { $0.id != remote.id }) }
                        }
                    }
                }
            }.frame(maxHeight: 130)
            Button("Add remote…") { draft = RemoteConfiguration(); editing = true; error = "" }
            if editing {
                GroupBox("SSH connection") {
                    VStack(alignment: .leading, spacing: 8) {
                        TextField("Machine label", text: $draft.label)
                        HStack { TextField("Hostname or SSH alias", text: $draft.host); TextField("Username (optional for alias)", text: $draft.user) }
                        HStack {
                            TextField("Port", value: $draft.port, formatter: NumberFormatter()).frame(width: 90)
                            TextField("Private-key path", text: $draft.identityFile)
                            Button("Choose key…") {
                                let picker = NSOpenPanel(); picker.canChooseDirectories = false; picker.showsHiddenFiles = true
                                picker.directoryURL = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".ssh")
                                if picker.runModal() == .OK, let url = picker.url { draft.identityFile = url.path }
                            }
                        }
                        HStack {
                            Button("Save and connect") {
                                do {
                                    try draft.validate()
                                    var values = state.remotes.filter { $0.id != draft.id }; values.append(draft)
                                    try state.saveRemotes(values); editing = false; error = ""
                                } catch { self.error = error.localizedDescription }
                            }
                            Button("Cancel") { editing = false; error = "" }
                        }
                    }.padding(6)
                }
            }
            if !error.isEmpty { Text(error).foregroundStyle(.red).textSelection(.enabled) }
            Divider()
            Text("Remote setup").font(.headline)
            Text("Install the current TokenMonitor plugin and run setup on the remote Mac. Enable Remote Login, authorize your dedicated public key, and load its private key into your laptop’s SSH agent. The key stays on your laptop; task titles, workspace labels, and parsed metrics travel over SSH.")
                .font(.caption).foregroundStyle(.secondary)
            Text("For a new host, verify its SSH host-key fingerprint in Terminal before connecting. Unknown or changed host keys are never accepted automatically. Remote removal does not revoke its authorized key. Use a separate SSH identity for administration after restricting the monitoring key.")
                .font(.caption).foregroundStyle(.secondary)
            Button("Copy restricted-key setup instructions") {
                let instructions = """
                On the source Mac, update TokenMonitor first. Replace only this dedicated key's existing authorized_keys line with:
                restrict,command="\\\"$HOME/Applications/Codex Usage Monitor.app/Contents/MacOS/CodexUsageMonitor\\\" --remote-agent" ssh-ed25519 YOUR_PUBLIC_KEY TokenMonitor

                Keep all unrelated keys. 'restrict' disables forwarding, PTY and user rc scripts. The forced command permits only the telemetry protocol, without a general shell. The private key stays on the viewing Mac. Do not restrict this key until the new helper is installed.
                """
                NSPasteboard.general.clearContents(); NSPasteboard.general.setString(instructions, forType: .string)
            }
        }.padding(20).frame(width: 620).fixedSize(horizontal: false, vertical: true)
    }
    private func save(_ values: [RemoteConfiguration]) {
        do { try state.saveRemotes(values); error = "" } catch { self.error = error.localizedDescription }
    }
}
