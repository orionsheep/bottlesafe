import SwiftUI

struct RootView: View {
    @Environment(AppState.self) private var app
    @State private var showSettings = false

    var body: some View {
        @Bindable var app = app
        TabView(selection: $app.selectedTab) {
            Tab("图鉴", systemImage: "house.fill", value: .guide) {
                GuideView()
            }
            Tab("识别", systemImage: "camera.viewfinder", value: .scan) {
                ScanView()
            }
            Tab("混用", systemImage: "flask.fill", value: .mix) {
                MixView()
            }
            Tab("档案", systemImage: "archivebox.fill", value: .archive) {
                ArchiveView()
            }
        }
        .tint(Theme.green)
        .task { await app.ping() }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("服务器", systemImage: "cloud") { showSettings = true }
            }
        }
        .sheet(isPresented: $showSettings) {
            SettingsSheet()
        }
    }
}

struct SettingsSheet: View {
    @Environment(AppState.self) private var app
    @Environment(\.dismiss) private var dismiss
    @State private var draft = ""
    @State private var pinging = false

    var body: some View {
        NavigationStack {
            Form {
                Section("云端 API") {
                    TextField("https://your-server.example", text: $draft)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.URL)
                        .autocorrectionDisabled()
                    Text("比赛前改成你的 HTTPS 地址。模拟器可先用本机 http://127.0.0.1:8000。")
                        .font(.footnote)
                        .foregroundStyle(Theme.muted)
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
            }
            .navigationTitle("连接服务器")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("关闭") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("保存并检测") {
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
