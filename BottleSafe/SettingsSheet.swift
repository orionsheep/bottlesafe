import SwiftUI

struct SettingsSheet: View {
    @Environment(AppState.self) private var app
    @Environment(\.dismiss) private var dismiss
    @State private var draft = ""
    @State private var pinging = false

    var body: some View {
        NavigationStack {
            Form {
                Section("云端 API") {
                    TextField("http://60.204.231.189:8000", text: $draft)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.URL)
                        .autocorrectionDisabled()
                    Text("默认已指向云服务器 http://60.204.231.189:8000，任何网络可用。局域网联调时可改成 Mac 的 IP。")
                        .font(.footnote)
                        .foregroundStyle(Theme.muted)
                    Button("填入云服务器") { draft = AppState.cloudAPIBase }
                    Button("填入本机（联调）") { draft = "http://127.0.0.1:8000" }
                }
                Section("当前状态") {
                    if let b = app.backend {
                        LabeledContent("后端", value: b.status)
                        Text(b.detail).font(.footnote).foregroundStyle(Theme.ink)
                    } else if let err = app.backendError {
                        Text(err).foregroundStyle(Theme.coral)
                    } else {
                        Text("尚未连接").foregroundStyle(Theme.ink)
                    }
                }
                Section {
                    Text("识别走硅基流动云端视觉模型。密钥只放在服务器，不会打进 App。结果仅供安全参考。")
                        .font(.footnote)
                        .foregroundStyle(Theme.muted)
                }
            }
            .navigationTitle("连接服务器")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("关闭") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(pinging ? "检测中…" : "保存并检测") {
                        Task {
                            pinging = true
                            app.apiBaseString = draft
                            await app.applyAPIBase()
                            pinging = false
                        }
                    }
                    .disabled(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || pinging)
                }
            }
            .onAppear { draft = app.apiBaseString }
        }
        .presentationDetents([.medium, .large])
    }
}
