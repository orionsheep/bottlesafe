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

                    ZStack(alignment: .bottomTrailing) {
                        if let preview {
                            Image(uiImage: preview)
                                .resizable()
                                .scaledToFit()
                                .frame(maxHeight: 340)
                                .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                        } else {
                            RoundedRectangle(cornerRadius: 18, style: .continuous)
                                .fill(Theme.paper)
                                .frame(height: 220)
                                .overlay {
                                    VStack(spacing: 8) {
                                        Image(systemName: "camera.viewfinder").font(.largeTitle).foregroundStyle(Theme.green)
                                        Text("对准瓶身、标签或成分表").foregroundStyle(Theme.muted)
                                    }
                                }
                        }
                        if busy {
                            ProgressView("正在读标签…")
                                .padding(12)
                                .background(.ultraThinMaterial, in: Capsule())
                                .padding(12)
                        }
                    }
                    .frame(maxWidth: .infinity)

                    HStack {
                        Button { showCamera = true } label: {
                            Label("拍照", systemImage: "camera").frame(maxWidth: .infinity)
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
                    .disabled(jpeg == nil || busy)

                    statusLine

                    if let error {
                        Text(error).foregroundStyle(Theme.coral).font(.footnote)
                    }

                    if let result {
                        resultCard(result.analysis)
                        VStack(spacing: 10) {
                            Button(saved ? "已入档案 ✓" : "存入家庭档案") {
                                Task { await save(result) }
                            }
                            .buttonStyle(.borderedProminent)
                            .tint(Theme.green)
                            .disabled(saved)
                            .frame(maxWidth: .infinity)

                            HStack {
                                Button("去混用") {
                                    app.pendingMixPrefill = true
                                    app.selectedTab = .mix
                                }
                                if saved {
                                    Button("去档案") { app.selectedTab = .archive }
                                }
                            }
                            .buttonStyle(.bordered)
                        }
                    }
                }
                .padding(16)
                .padding(.bottom, 28)
            }
            .background(Theme.cream)
            .navigationTitle("拍照识别")
            .toolbar { ToolbarItem(placement: .topBarTrailing) { APIBadge() } }
            .sheet(isPresented: $showCamera) {
                CameraPicker(onImage: consume).ignoresSafeArea()
            }
            .onAppear {
                if ProcessInfo.processInfo.arguments.contains("-fixture-scan") {
                    result = .contrastFixture
                }
                Task { await app.ping() }
            }
        }
    }

    @ViewBuilder
    private var statusLine: some View {
        if app.backend?.status == "ready" {
            Text(app.backend?.detail ?? "后端已就绪")
                .font(.footnote)
                .foregroundStyle(Theme.green)
        } else {
            Text(app.backendError ?? app.backend?.detail ?? "后端未连接。点右上角填写服务器。真机用 http://192.168.3.110:8000")
                .font(.footnote)
                .foregroundStyle(Theme.coral)
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
        await app.ping()
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
            app.markSaved()
        } catch {
            self.error = error.localizedDescription
        }
    }

    @ViewBuilder
    private func resultCard(_ a: ChemicalAnalysis) -> some View {
        Card {
            VStack(alignment: .leading, spacing: 10) {
                RiskChip(level: a.risk)
                Text(a.displayName)
                    .font(.title2.bold())
                    .foregroundStyle(Theme.ink)
                Text([a.product.brand, a.product.category].compactMap { $0 }.joined(separator: " · "))
                    .font(.caption)
                    .foregroundStyle(Theme.muted)
                Text(a.summary)
                    .font(.subheadline)
                    .foregroundStyle(Theme.ink)
                    .fixedSize(horizontal: false, vertical: true)
                if !a.hazards.isEmpty {
                    LabeledBlock(title: "危害", text: a.hazards.map { "\($0.severity.uppercased()) \($0.type) — \($0.evidence)" }.joined(separator: "\n"), danger: true)
                }
                if !a.ingredients.isEmpty {
                    LabeledBlock(title: "成分", text: a.ingredients.map(\.name).joined(separator: "、"))
                }
                if !a.signal_words.isEmpty {
                    LabeledBlock(title: "信号词", text: a.signal_words.joined(separator: "、"))
                }
                if !a.do_not_mix_with.isEmpty {
                    LabeledBlock(title: "切忌混用", text: a.do_not_mix_with.joined(separator: "、"), danger: true)
                }
                if !a.safe_storage.isEmpty {
                    LabeledBlock(title: "储存", text: a.safe_storage.joined(separator: "、"))
                }
                firstAid(a.first_aid)
                if !a.uncertainties.isEmpty {
                    LabeledBlock(title: "未定之处", text: a.uncertainties.joined(separator: "、"))
                }
                Text("识别结果仅供安全参考，不能替代标签、SDS 或急救电话。")
                    .font(.caption2)
                    .foregroundStyle(Theme.muted)
            }
        }
    }

    @ViewBuilder
    private func firstAid(_ f: FirstAid) -> some View {
        let rows: [(String, String?)] = [
            ("误食", f.ingestion), ("吸入", f.inhalation), ("入眼", f.eye_contact), ("触肤", f.skin_contact),
        ].filter { $0.1 != nil }
        if !rows.isEmpty {
            LabeledBlock(title: "急性暴露（非医疗诊断）", text: rows.map { "\($0.0)：\($0.1!)" }.joined(separator: "\n"))
        }
    }
}
