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
    /// 分析四步进度：0-3 进行中，4 完成。
    @State private var analyzeStep = 0
    @State private var analyzeTask: Task<Void, Never>?
    @State private var progressTask: Task<Void, Never>?
    /// 存档成功后补打存放位置。
    @State private var savedItemID: Int?
    @State private var pickedLocation: String?
    @State private var locationSkipped = false
    @State private var recentItems: [HouseholdItem] = []

    var body: some View {
        @Bindable var app = app
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    ProfileCard(profile: $app.profile)
                    Text("拍一张瓶身或标签，识别成分、风险与安全处置建议。")
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

                    HStack(spacing: 8) {
                        Text("试试示例")
                            .font(.caption)
                            .foregroundStyle(Theme.muted)
                        sampleButton("84消毒液", asset: "sample-bleach")
                        sampleButton("洁厕灵", asset: "sample-toilet")
                        sampleButton("日用品", asset: "sample-goods")
                    }

                    Button {
                        startAnalyze()
                    } label: {
                        Text(busy ? "正在分析…" : "开始识别")
                            .font(.headline)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(Theme.green)
                    .disabled(jpeg == nil || busy)

                    if busy {
                        analyzeProgressCard
                    }

                    statusLine

                    if !recentItems.isEmpty, result == nil, !busy {
                        recentBox
                    }

                    if result == nil, !busy, preview == nil {
                        placeholderCard
                    }

                    if let error {
                        Text(error).foregroundStyle(Theme.coral).font(.footnote)
                    }

                    if let result {
                        resultCard(result)
                        FeedbackBar()
                        VStack(spacing: 10) {
                            Button(saved ? "已入档案 ✓" : "存入家庭档案") {
                                Task { await save(result) }
                            }
                            .buttonStyle(.borderedProminent)
                            .tint(Theme.green)
                            .disabled(saved)
                            .frame(maxWidth: .infinity)

                            locationRow

                            HStack {
                                Button("去混用 →") { app.openMix(prefill: true) }
                                if saved {
                                    Button("去档案 →") { app.selectedTab = .archive }
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
            .task { await loadRecent() }
        }
    }

    private func loadRecent() async {
        recentItems = (try? await app.client.householdItems()) ?? []
    }

    private var recentBox: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("最近分析")
                .font(.caption.bold())
                .foregroundStyle(Theme.muted)
            ForEach(Array(recentItems.suffix(3).reversed())) { item in
                HStack(spacing: 8) {
                    Text("\(item.analysis?.risk.safetyScore ?? 50)")
                        .font(.caption2.bold())
                        .padding(.horizontal, 8)
                        .padding(.vertical, 2)
                        .background((item.analysis?.risk.scoreTint ?? Theme.muted).opacity(0.16), in: Capsule())
                        .foregroundStyle(item.analysis?.risk.scoreTint ?? Theme.muted)
                    Text("#\(item.id) · \(item.displayName)")
                        .font(.caption)
                        .foregroundStyle(Theme.ink)
                        .lineLimit(1)
                    Spacer()
                }
            }
        }
        .padding(12)
        .background(Theme.paper, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private var placeholderCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("识别结果会出现在这里")
                .font(.headline)
                .foregroundStyle(Theme.ink)
            ForEach([
                "产品名 / 品牌 / 品类 / 条码",
                "危害类型与严重度、成分与信号词",
                "储存、切忌混用、急救与绿色处置",
                "不确定处与建议补拍的照片",
            ], id: \.self) { line in
                Text("· \(line)")
                    .font(.caption)
                    .foregroundStyle(Theme.muted)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.paper, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
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
        savedItemID = nil
        pickedLocation = nil
        locationSkipped = false
    }

    private func sampleButton(_ title: String, asset: String) -> some View {
        Button {
            guard !busy, let image = UIImage(named: asset) else { return }
            consume(image)
            startAnalyze()
        } label: {
            Text(title)
                .font(.caption.bold())
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(Theme.green.opacity(0.12), in: Capsule())
                .foregroundStyle(Theme.green)
        }
        .disabled(busy)
    }

    // MARK: - 分析四步进度

    private static let stepTitles = ["识别商品", "提取成分信息", "成分安全分析", "综合评估"]

    private var analyzeProgressCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            ForEach(Self.stepTitles.indices, id: \.self) { i in
                HStack(spacing: 10) {
                    stepIcon(i)
                    Text("\(i + 1). \(Self.stepTitles[i])")
                        .font(.subheadline.weight(i == analyzeStep ? .semibold : .regular))
                        .foregroundStyle(i < analyzeStep ? Theme.green : (i == analyzeStep ? Theme.ink : Theme.muted.opacity(0.7)))
                    Spacer()
                }
            }
            Button("取消分析") { cancelAnalyze() }
                .font(.caption.bold())
                .foregroundStyle(Theme.coral)
                .frame(maxWidth: .infinity, alignment: .trailing)
        }
        .padding(14)
        .background(Theme.paper, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(Theme.ink.opacity(0.08), lineWidth: 1)
        )
    }

    @ViewBuilder
    private func stepIcon(_ i: Int) -> some View {
        if i < analyzeStep {
            Image(systemName: "checkmark.circle.fill")
                .foregroundStyle(Theme.green)
        } else if i == analyzeStep {
            ProgressView()
                .controlSize(.small)
                .tint(Theme.green)
        } else {
            Image(systemName: "circle")
                .foregroundStyle(Theme.muted.opacity(0.5))
        }
    }

    private func startAnalyze() {
        guard let jpeg, !busy else { return }
        busy = true
        error = nil
        analyzeStep = 0
        // 按时间推进步骤：1.2s → 提取成分，2.8s → 安全分析，5s → 综合评估。
        progressTask = Task { @MainActor in
            for (delay, step) in [(1.2, 1), (1.6, 2), (2.2, 3)] {
                try? await Task.sleep(for: .seconds(delay))
                if Task.isCancelled { return }
                analyzeStep = step
            }
        }
        analyzeTask = Task { @MainActor in
            await app.ping()
            do {
                let res = try await app.client.analyze(jpeg: jpeg, context: app.profile.apiContext)
                try Task.checkCancellation()
                progressTask?.cancel()
                analyzeStep = 4
                result = res
                app.rememberScan(res, jpeg: jpeg, preview: preview)
                busy = false
            } catch is CancellationError {
                // 用户主动取消：静默复位。
                busy = false
            } catch {
                progressTask?.cancel()
                self.error = error.localizedDescription
                busy = false
            }
        }
    }

    private func cancelAnalyze() {
        analyzeTask?.cancel()
        progressTask?.cancel()
        analyzeStep = 0
        busy = false
    }

    private func save(_ res: AnalyzeResponse) async {
        do {
            savedItemID = try await app.client.saveItem(analysis: res.analysis, imagePath: res.image_path)
            saved = true
            app.markSaved()
            await loadRecent()
        } catch {
            self.error = error.localizedDescription
        }
    }

    /// 存档成功后的可选位置标记行（可跳过）。
    @ViewBuilder
    private var locationRow: some View {
        if saved, !locationSkipped {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text(pickedLocation == nil ? "标记存放位置（选填）" : "已标记：\(pickedLocation!)")
                        .font(.caption.bold())
                        .foregroundStyle(pickedLocation == nil ? Theme.muted : Theme.green)
                    Spacer()
                    Button("跳过") { locationSkipped = true }
                        .font(.caption.bold())
                        .foregroundStyle(Theme.muted)
                }
                if pickedLocation == nil {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(StorageLocations.presets, id: \.self) { loc in
                                Button {
                                    Task { await pickLocation(loc) }
                                } label: {
                                    Text(loc)
                                        .font(.caption.bold())
                                        .padding(.horizontal, 10)
                                        .padding(.vertical, 6)
                                        .background(Theme.green.opacity(0.12), in: Capsule())
                                        .foregroundStyle(Theme.green)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                }
            }
            .padding(12)
            .background(Theme.paper, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
    }

    private func pickLocation(_ loc: String) async {
        guard let id = savedItemID else { return }
        do {
            try await app.client.patchLocation(id: id, location: loc)
            pickedLocation = loc
        } catch {
            self.error = "位置标记失败：\(error.localizedDescription)"
        }
    }

    @ViewBuilder
    private func resultCard(_ r: AnalyzeResponse) -> some View {
        let a = r.analysis
        Card {
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .center, spacing: 14) {
                    ScoreRing(level: a.risk)
                    VStack(alignment: .leading, spacing: 6) {
                        RiskChip(level: a.risk, useBandLabel: true)
                        Text(a.displayName)
                            .font(.title2.bold())
                            .foregroundStyle(Theme.ink)
                        Text([a.product.brand, a.product.category, a.product.barcode].compactMap { $0?.nilIfEmpty }.joined(separator: " · "))
                            .font(.caption)
                            .foregroundStyle(Theme.muted)
                    }
                    Spacer(minLength: 0)
                }
                if let note = r.coverage?.note?.nilIfEmpty {
                    Text(note)
                        .font(.caption2)
                        .foregroundStyle(Theme.muted)
                }
                dimensionScoresSection(r.dimension_scores)
                Text("评分为参考均值，非统一标准；末档「暂无法判断」不是「安全」。")
                    .font(.caption2)
                    .foregroundStyle(Theme.muted)
                if a.risk == .unknown {
                    Text("信息不足 ≠ 安全。请补拍瓶身标签与成分表，确认前按高风险存放。")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(Theme.amber)
                }
                Text("本结论基于包装识别与结构校验，非实验室成分检测。")
                    .font(.caption2)
                    .foregroundStyle(Theme.muted)
                warningsSection(r.ingredient_warnings)
                Text(a.summary)
                    .font(.subheadline)
                    .foregroundStyle(Theme.ink)
                    .fixedSize(horizontal: false, vertical: true)
                ForEach(app.profile.hints(for: a), id: \.self) { hint in
                    VStack(alignment: .leading, spacing: 6) {
                        Text("规则命中")
                            .font(.caption2.bold())
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Theme.coral, in: Capsule())
                            .foregroundStyle(.white)
                        Text(hint)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(Theme.coral)
                    }
                    .padding(10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Theme.coral.opacity(0.12), in: RoundedRectangle(cornerRadius: 12))
                }
                if !a.hazards.isEmpty {
                    LabeledBlock(title: "危害", text: a.hazards.map { h in
                        let pct = h.confidence.map { "（\(Int(($0 * 100).rounded()))%）" } ?? ""
                        return "\(h.severity.uppercased()) \(h.type) — \(h.evidence)\(pct)"
                    }.joined(separator: "\n"), danger: true)
                }
                if !a.ingredients.isEmpty {
                    LabeledBlock(title: "成分", text: a.ingredients.map { g in
                        g.source?.nilIfEmpty.map { "\(g.name)（\($0)）" } ?? g.name
                    }.joined(separator: "、"))
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
                disposalSection(r.disposal)
                firstAid(a.first_aid)
                if !a.uncertainties.isEmpty {
                    LabeledBlock(title: "未定之处", text: a.uncertainties.joined(separator: "、"))
                }
                if !a.needs_more_images.isEmpty {
                    LabeledBlock(title: "建议补拍", text: a.needs_more_images.joined(separator: "、"))
                }
                if let match = r.database_match, let id = match["id"]?.intValue {
                    Text("已匹配安全数据库 #\(id)")
                        .font(.caption)
                        .foregroundStyle(Theme.green)
                }
                rulesSection(r.rules)
                evidenceSection(r.evidence, expiring: r.expiring_standards)
                crossRisksSection(r.cross_risks)
                Text("识别结果仅供安全参考，不能替代标签、SDS 或急救电话。")
                    .font(.caption2)
                    .foregroundStyle(Theme.muted)
            }
        }
    }

    @ViewBuilder
    private func dimensionScoresSection(_ dims: [DimensionScore]?) -> some View {
        let items = dims ?? []
        if !items.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                Text("六维安全评分")
                    .font(.caption.bold())
                    .foregroundStyle(Theme.muted)
                ForEach(items) { dim in
                    DimensionBar(dim: dim)
                }
                Text("珊瑚色为风险维度（分越高越危险），绿色为安全维度（分越高越好）。")
                    .font(.caption2)
                    .foregroundStyle(Theme.muted)
            }
            .padding(12)
            .background(Theme.ink.opacity(0.03), in: RoundedRectangle(cornerRadius: 12))
        }
    }

    private static let circledNumbers = ["①", "②", "③", "④", "⑤"]

    @ViewBuilder
    private func warningsSection(_ warnings: [IngredientWarning]?) -> some View {
        let items = warnings ?? []
        if !items.isEmpty {
            let severe = items.contains { ($0.rank) >= 2 }
            VStack(alignment: .leading, spacing: 8) {
                Text(WarningCopy.title(for: items))
                    .font(.caption.bold())
                    .foregroundStyle(severe ? Theme.coral : Theme.amber)
                ForEach(Array(items.enumerated()), id: \.element.id) { index, w in
                    HStack(alignment: .top, spacing: 8) {
                        Text(Self.circledNumbers[min(index, Self.circledNumbers.count - 1)])
                            .font(.subheadline)
                            .foregroundStyle(severe ? Theme.coral : Theme.amber)
                        VStack(alignment: .leading, spacing: 2) {
                            let heading = [w.name, w.tag.map { "（\($0)）" }].compactMap { $0?.nilIfEmpty }.joined()
                            if !heading.isEmpty {
                                Text(heading)
                                    .font(.subheadline.weight(.bold))
                                    .foregroundStyle(Theme.ink)
                            }
                            if let text = w.text?.nilIfEmpty {
                                Text(text)
                                    .font(.caption)
                                    .foregroundStyle(Theme.ink)
                            }
                        }
                    }
                }
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background((severe ? Theme.coral : Theme.amber).opacity(0.10), in: RoundedRectangle(cornerRadius: 12))
        }
    }

    @ViewBuilder
    private func rulesSection(_ rules: RulesResult?) -> some View {
        if let rules {
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 8) {
                    Text("规则判定").font(.caption.bold()).foregroundStyle(Theme.muted)
                    RiskChip(level: rules.risk)
                }
                ForEach(rules.findings ?? []) { finding in
                    VStack(alignment: .leading, spacing: 2) {
                        if let title = finding.title?.nilIfEmpty {
                            Text(title)
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(finding.risk.tint)
                        }
                        if let reason = finding.reason?.nilIfEmpty {
                            Text(reason).font(.caption).foregroundStyle(Theme.ink)
                        }
                        if let action = finding.action?.nilIfEmpty {
                            Text("建议：\(action)").font(.caption).foregroundStyle(Theme.muted)
                        }
                    }
                }
                Text("本组合判定基于规则库\(rules.rule_version.map { " v\($0)" } ?? "")，随标准更新而调整。")
                    .font(.caption2)
                    .foregroundStyle(Theme.muted)
            }
        }
    }

    @ViewBuilder
    private func evidenceSection(_ evidence: [EvidenceItem]?, expiring: [EvidenceItem]?) -> some View {
        let items = evidence ?? []
        let expiringItems = expiring ?? []
        if !items.isEmpty || !expiringItems.isEmpty {
            VStack(alignment: .leading, spacing: 6) {
                Text("证据溯源").font(.caption.bold()).foregroundStyle(Theme.muted)
                ForEach(Array(items.enumerated()), id: \.offset) { _, item in
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(spacing: 6) {
                            Text(item.displayTitle)
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(Theme.ink)
                            if let level = item.source_level_label?.nilIfEmpty {
                                Text(level)
                                    .font(.caption2.bold())
                                    .padding(.horizontal, 6)
                                    .padding(.vertical, 2)
                                    .background(Theme.green.opacity(0.14), in: Capsule())
                                    .foregroundStyle(Theme.green)
                            }
                        }
                        if let clause = item.clause?.nilIfEmpty {
                            Text(clause).font(.caption).foregroundStyle(Theme.ink)
                        }
                        if let summary = item.summary?.nilIfEmpty {
                            Text(summary).font(.caption).foregroundStyle(Theme.ink)
                        }
                        if let note = item.note?.nilIfEmpty {
                            Text(note).font(.caption2).foregroundStyle(Theme.muted)
                        }
                        if let effective = item.effectiveText {
                            Text("生效期：\(effective)").font(.caption2).foregroundStyle(Theme.muted)
                        }
                        if let url = item.url?.nilIfEmpty, let link = URL(string: url) {
                            Link("查看原文", destination: link)
                                .font(.caption.bold())
                                .foregroundStyle(Theme.green)
                        }
                    }
                }
                ForEach(Array(expiringItems.enumerated()), id: \.offset) { _, item in
                    Text("标准即将换代：\(item.displayTitle)\(item.nextEffectiveText.map { "（\($0)）" } ?? "")")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(Theme.amber)
                        .padding(8)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Theme.amber.opacity(0.12), in: RoundedRectangle(cornerRadius: 10))
                }
            }
        }
    }

    @ViewBuilder
    private func crossRisksSection(_ crossRisks: [CrossRisk]?) -> some View {
        let risks = crossRisks ?? []
        if !risks.isEmpty {
            VStack(alignment: .leading, spacing: 6) {
                Text("主动混用预警").font(.caption.bold()).foregroundStyle(Theme.coral)
                Text("基于规则库判定，非大模型推测")
                    .font(.caption2)
                    .foregroundStyle(Theme.muted)
                ForEach(Array(risks.prefix(3).enumerated()), id: \.offset) { _, risk in
                    VStack(alignment: .leading, spacing: 6) {
                        HStack(spacing: 8) {
                            Text(risk.isLLM ? "AI推测" : "基于规则库")
                                .font(.caption2.bold())
                                .padding(.horizontal, 8)
                                .padding(.vertical, 3)
                                .background((risk.isLLM ? Theme.amber : Theme.green).opacity(0.16), in: Capsule())
                                .foregroundStyle(risk.isLLM ? Theme.amber : Theme.green)
                            RiskChip(level: risk.risk)
                        }
                        Text("本品 + 档案中的「\(risk.b)」：\(risk.reason)")
                            .font(.subheadline)
                            .foregroundStyle(Theme.ink)
                        if let action = risk.action?.nilIfEmpty {
                            Text("建议：\(action)")
                                .font(.caption)
                                .foregroundStyle(Theme.muted)
                        }
                        if risk.same_location == true {
                            Text("📍 同一位置（\(risk.location?.nilIfEmpty ?? "同一处")），请分开")
                                .font(.caption2.bold())
                                .foregroundStyle(Theme.coral)
                        }
                    }
                    .padding(10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Theme.coral.opacity(0.12), in: RoundedRectangle(cornerRadius: 12))
                }
                if risks.count > 3 {
                    Button("查看全部 \(risks.count) 组 →") { app.openMix(prefill: true) }
                        .font(.caption.bold())
                        .foregroundStyle(Theme.green)
                }
            }
        }
    }

    @ViewBuilder
    private func disposalSection(_ d: ScanDisposal?) -> some View {
        if let d {
            VStack(alignment: .leading, spacing: 6) {
                Text(d.hazardous_waste == true ? "绿色处置 · 有害垃圾" : "绿色处置")
                    .font(.caption.bold())
                    .foregroundStyle(d.hazardous_waste == true ? Theme.coral : Theme.green)
                if let text = d.drain_safe_text?.nilIfEmpty {
                    Text(text)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(d.drain_safe == "no" ? Theme.coral : Theme.ink)
                }
                if let route = d.disposal_route?.nilIfEmpty {
                    Text("投放去向：\(route)").font(.caption).foregroundStyle(Theme.ink)
                }
                if let container = d.container?.nilIfEmpty {
                    Text("空容器：\(container)").font(.caption).foregroundStyle(Theme.ink)
                }
                if let tip = d.eco_tip?.nilIfEmpty {
                    Text("环保提示：\(tip)").font(.caption).foregroundStyle(Theme.green)
                }
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background((d.hazardous_waste == true ? Theme.coral : Theme.green).opacity(0.10), in: RoundedRectangle(cornerRadius: 12))
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
