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
            Tab("AI 助手", systemImage: "bubble.left.and.bubble.right.fill", value: .assistant) {
                NavigationStack {
                    AssistantView()
                        .toolbar { ToolbarItem(placement: .topBarTrailing) { APIBadge() } }
                }
            }
            Tab("档案", systemImage: "archivebox.fill", value: .archive) {
                ArchiveView()
            }
            Tab("我的", systemImage: "person.crop.circle.fill", value: .me) {
                MeView()
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
        .overlay {
            if app.tourStep != nil {
                TourOverlay(step: Binding(
                    get: { app.tourStep ?? 0 },
                    set: { app.tourStep = $0 }
                ), skip: { app.tourStep = nil })
            }
        }
        .onChange(of: app.tourStep) { _, step in
            guard let step else { return }
            // 对齐 Web TourGuide 8 步：图鉴 / 小知识 / 识别 / 混用(档案栈) / 档案 / AI助手 / 我的 / 收尾
            let tabs: [AppTab] = [.guide, .guide, .scan, .archive, .archive, .assistant, .me, .guide]
            if tabs.indices.contains(step) {
                app.selectedTab = tabs[step]
            }
            app.showMix = (step == 3)
        }
        .task(id: app.tourStep) {
            guard app.tourStep != nil else { return }
            let seconds: [Double] = [12, 10, 12, 14, 11, 12, 8, 11]
            while let step = app.tourStep {
                let wait = seconds.indices.contains(step) ? seconds[step] : 10
                try? await Task.sleep(for: .seconds(wait))
                guard app.tourStep == step else { return }
                if step >= 7 {
                    app.tourStep = nil
                    return
                }
                app.tourStep = step + 1
            }
        }
    }
}
