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
        .preferredColorScheme(.light)
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
