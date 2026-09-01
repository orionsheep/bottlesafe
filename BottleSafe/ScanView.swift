import SwiftUI
import PhotosUI

struct ScanView: View {
    @Environment(AppState.self) private var app
    @State private var pickerItem: PhotosPickerItem?
    @State private var showCamera = false
    @State private var preview: UIImage?
    @State private var jpeg: Data?
    @State private var busy = false
    @State private var error: String?
    @State private var result: AnalyzeResponse?
    @State private var saved = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Text("拍一张瓶身或标签，识别成分、风险与禁忌。")
                        .foregroundStyle(Theme.muted)

                    if let preview {
                        Image(uiImage: preview)
                            .resizable()
                            .scaledToFit()
                            .frame(maxHeight: 320)
                            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                    } else {
                        RoundedRectangle(cornerRadius: 18, style: .continuous)
                            .fill(Theme.paper)
                            .frame(height: 220)
                            .overlay {
                                VStack(spacing: 8) {
                                    Image(systemName: "camera.viewfinder").font(.largeTitle)
                                    Text("对准瓶身、标签或成分表").foregroundStyle(Theme.muted)
                                }
                            }
                    }

                    HStack {
                        Button { showCamera = true } label: {
                            Label("拍照", systemImage: "camera")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(Theme.ink)

                        LibraryPicker(item: $pickerItem, onImage: consume)
                            .buttonStyle(.bordered)
                    }

                    Button {
                        Task { await analyze() }
                    } label: {
                        Text(busy ? "正在读标签…" : "开始识别")
                            .font(.headline)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(Theme.green)
                    .disabled(jpeg == nil || busy || app.backend?.status != "ready")

                    if app.backend?.status != "ready" {
                        Text(app.backendError ?? app.backend?.detail ?? "后端未连接，先在右上角填写服务器地址。")
                            .font(.footnote)
                            .foregroundStyle(Theme.coral)
                    }

                    if let error {
                        Text(error).foregroundStyle(Theme.coral).font(.footnote)
                    }

                    if let result {
                        resultCard(result.analysis)
                        HStack {
                            Button(saved ? "已入档案" : "存入家庭档案") {
                                Task { await save(result) }
                            }
                            .disabled(saved)
                            Button("去混用") {
                                app.selectedTab = .mix
                            }
                            if saved {
                                Button("去档案") { app.selectedTab = .archive }
                            }
                        }
                        .buttonStyle(.bordered)
                    }
                }
                .padding(16)
            }
            .background(Theme.cream)
            .navigationTitle("拍照识别")
            .toolbar { ToolbarItem(placement: .topBarTrailing) { APIBadge() } }
            .sheet(isPresented: $showCamera) {
                CameraPicker(onImage: consume)
                    .ignoresSafeArea()
            }
        }
    }

    private func consume(_ image: UIImage) {
        preview = image
        jpeg = ImagePrep.jpegData(from: image)
        result = nil
        saved = false
        error = nil
    }

    private func analyze() async {
        guard let jpeg else { return }
        busy = true
        error = nil
        defer { busy = false }
        do {
            let res = try await app.client.analyze(jpeg: jpeg)
            result = res
            app.rememberScan(res, jpeg: jpeg, preview: preview)
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func save(_ res: AnalyzeResponse) async {
        do {
            try await app.client.saveItem(analysis: res.analysis, imagePath: res.image_path)
            saved = true
            app.savedLastScan = true
        } catch {
            self.error = error.localizedDescription
        }
    }

    @ViewBuilder
    private func resultCard(_ a: ChemicalAnalysis) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(a.risk.label)
                .font(.caption.bold())
                .padding(.horizontal, 10)
                .padding(.vertical, 4)
                .background(a.risk.tint.opacity(0.2), in: Capsule())
            Text(a.displayName).font(.title2.bold())
            Text([a.product.brand, a.product.category].compactMap { $0 }.joined(separator: " · "))
                .font(.caption)
                .foregroundStyle(Theme.muted)
            Text(a.summary).font(.subheadline)
            if !a.ingredients.isEmpty {
                labeled("成分", a.ingredients.map(\.name).joined(separator: "、"))
            }
            if !a.do_not_mix_with.isEmpty {
                labeled("切忌混用", a.do_not_mix_with.joined(separator: "、"))
            }
            if !a.safe_storage.isEmpty {
                labeled("储存", a.safe_storage.joined(separator: "、"))
            }
            Text("识别结果仅供安全参考，不能替代标签、SDS 或急救电话。")
                .font(.caption2)
                .foregroundStyle(Theme.muted)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.paper, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    private func labeled(_ title: String, _ body: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).font(.caption.bold()).foregroundStyle(Theme.muted)
            Text(body).font(.subheadline)
        }
    }
}
