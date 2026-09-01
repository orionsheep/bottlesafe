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
                    TextField("http://192.168.3.110:8000", text: $draft)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.URL)
                        .autocorrectionDisabled()
                    Text("真机填电脑局域网地址 http://192.168.3.110:8000（手机和 Mac 同一 Wi-Fi）。模拟器才用 http://127.0.0.1:8000。")
                        .font(.footnote)
                        .foregroundStyle(Theme.muted)
                    Button("填入电脑局域网") { draft = AppState.macLANAPIBase }
                    Button("填入模拟器本机") { draft = AppState.simulatorAPIBase }
                    Button("填入云服务器 80") { draft = "http://218.11.5.249" }
                    Button("填入云服务器 10380") { draft = "http://218.11.5.249:10380" }
                }
                Section("当前状态") {
                    if let b = app.backend {
                        LabeledContent("后端", value: b.status)
                        Text(b.detail).font(.footnote)
                    } else if let err = app.backendError {
                        Text(err).foregroundStyle(Theme.coral)
                    } else {
                        Text("尚未连接")
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
