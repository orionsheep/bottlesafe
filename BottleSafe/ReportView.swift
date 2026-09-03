import SwiftUI

/// 全屋安全报告：总体风险 + 三指标 + 五维雷达 + 混用组合卡 + 高危清单 + 高频关注项 + 优化建议 + 时间线。
struct ReportView: View {
    @Environment(AppState.self) private var app
    @State private var report: HomeReport?
    @State private var timeline: TimelinePayload?
    @State private var busy = false
    @State private var error: String?
    @State private var adopted: Set<String> = []
    @State private var showPlanAlert = false
    @State private var expandedGroups: Set<String> = []

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("根据家庭档案自动生成：整体怎么样、哪些优先、具体哪几件、下一步怎么办。")
                    .font(.subheadline)
                    .foregroundStyle(Theme.muted)
                if busy {
                    HStack {
                        ProgressView()
                        Text("正在分析你的家…")
                            .foregroundStyle(Theme.muted)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.top, 40)
                }
                if let error {
                    Text(error)
                        .foregroundStyle(Theme.coral)
                        .font(.footnote)
                }
                if let report {
                    overallSection(report)
                    metricsSection(report)
                    radarSection(report)
                    crossRisksSection(report)
                    highItemsSection(report)
                    groupsSection(report)
                    actionsSection(report)
                    suggestionsSection(report)
                    disposalSection(report)
                    if let reassure = report.reassure?.nilIfEmpty {
                        Text(reassure)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(Theme.green)
                            .padding(12)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(Theme.green.opacity(0.10), in: RoundedRectangle(cornerRadius: 12))
                    }
                    Text(report.disclaimer ?? "仅供家庭风险筛查参考。")
                        .font(.caption2)
                        .foregroundStyle(Theme.muted)
                }
                timelineSection
            }
            .padding(16)
            .padding(.bottom, 28)
        }
        .background(Theme.cream)
        .navigationTitle("家庭成分报告")
        .toolbar { ToolbarItem(placement: .topBarTrailing) { APIBadge() } }
        .task { await load() }
        .refreshable { await load() }
        .alert("改进方案已领取", isPresented: $showPlanAlert) {
            Button("好") {}
        } message: {
            Text("已采纳 \(adopted.count) 条建议。按「先做这几件事」的顺序执行，就能让家里更安全。")
        }
    }

    private func load() async {
        busy = true
        error = nil
        defer { busy = false }
        do {
            report = try await app.client.generateReport()
            timeline = try? await app.client.timeline()
        } catch {
            self.error = "报告生成失败：\(error.localizedDescription)"
        }
    }

    // MARK: - 各分区

    private func overallSection(_ r: HomeReport) -> some View {
        Card {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 10) {
                    ScoreRing(level: r.overallRisk)
                    VStack(alignment: .leading, spacing: 6) {
                        RiskChip(level: r.overallRisk)
                        if let t = r.overall_text?.nilIfEmpty {
                            Text(t)
                                .font(.headline)
                                .foregroundStyle(Theme.ink)
                        }
                        if let prev = r.prev_risk?.nilIfEmpty,
                           let prevLevel = RiskLevel(rawValue: prev), prev != r.overall_risk {
                            Text("上次：\(prevLevel.label)")
                                .font(.caption)
                                .foregroundStyle(Theme.muted)
                        }
                    }
                    Spacer(minLength: 0)
                }
                if let o = r.overview?.nilIfEmpty {
                    Text(o)
                        .font(.subheadline)
                        .foregroundStyle(Theme.ink)
                }
            }
        }
    }

    private func metricsSection(_ r: HomeReport) -> some View {
        let counts = r.risk_count ?? [:]
        let attention = (counts["high"] ?? 0) + (counts["critical"] ?? 0)
        return HStack(spacing: 10) {
            metric("\(r.n_items ?? 0)", "已分析", Theme.ink)
            metric("\(attention)", "需关注", attention > 0 ? Theme.coral : Theme.ink)
            metric("\(r.cross_risks?.count ?? 0)", "混用组合", (r.cross_risks?.count ?? 0) > 0 ? Theme.coral : Theme.ink)
        }
    }

    private func metric(_ value: String, _ label: String, _ color: Color) -> some View {
        VStack(spacing: 4) {
            Text(value).font(.title2.bold()).foregroundStyle(color)
            Text(label).font(.caption).foregroundStyle(Theme.muted)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
        .background(Theme.paper, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(Theme.ink.opacity(0.08), lineWidth: 1)
        )
    }

    @ViewBuilder
    private func radarSection(_ r: HomeReport) -> some View {
        let dims = r.radar ?? []
        if !dims.isEmpty {
            Card {
                VStack(alignment: .leading, spacing: 8) {
                    Text("五维风险雷达")
                        .font(.caption.bold())
                        .foregroundStyle(Theme.muted)
                    RadarChart(dims: dims, tint: r.overallRisk.scoreTint)
                        .frame(height: 230)
                }
            }
        }
    }

    @ViewBuilder
    private func crossRisksSection(_ r: HomeReport) -> some View {
        let risks = r.cross_risks ?? []
        if !risks.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                Text("混用组合")
                    .font(.headline)
                    .foregroundStyle(Theme.ink)
                ForEach(Array(risks.enumerated()), id: \.offset) { _, risk in
                    CrossRiskCard(
                        risk: risk,
                        bottleA: CrossRiskBottle(name: Self.stripIndex(risk.a), category: nil, recognized: []),
                        bottleB: CrossRiskBottle(name: Self.stripIndex(risk.b), category: nil, recognized: [])
                    )
                }
            }
        }
    }

    /// 「#1 84消毒液」→「84消毒液」。
    private static func stripIndex(_ s: String) -> String {
        var t = s
        if t.hasPrefix("#"), let space = t.firstIndex(of: " ") {
            t = String(t[t.index(after: space)...])
        }
        return t.nilIfEmpty ?? s
    }

    @ViewBuilder
    private func highItemsSection(_ r: HomeReport) -> some View {
        let items = r.high_items ?? []
        if !items.isEmpty {
            Card {
                VStack(alignment: .leading, spacing: 10) {
                    Text("高危清单")
                        .font(.caption.bold())
                        .foregroundStyle(Theme.coral)
                    ForEach(items) { item in
                        HStack(spacing: 10) {
                            RiskChip(level: RiskLevel(rawValue: item.risk_level ?? "") ?? .unknown)
                            Text(item.name)
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(Theme.ink)
                            Spacer()
                            if let why = item.why?.nilIfEmpty {
                                Text(why)
                                    .font(.caption2)
                                    .foregroundStyle(Theme.muted)
                            }
                        }
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func groupsSection(_ r: HomeReport) -> some View {
        let groups = r.ingredient_groups ?? []
        if !groups.isEmpty {
            Card {
                VStack(alignment: .leading, spacing: 10) {
                    Text("高频关注项")
                        .font(.caption.bold())
                        .foregroundStyle(Theme.muted)
                    ForEach(groups) { group in
                        let isOpen = expandedGroups.contains(group.id)
                        VStack(alignment: .leading, spacing: 6) {
                            Button {
                                withAnimation(.easeInOut(duration: 0.2)) {
                                    if isOpen { expandedGroups.remove(group.id) } else { expandedGroups.insert(group.id) }
                                }
                            } label: {
                                HStack {
                                    Text(group.label ?? "成分分组")
                                        .font(.subheadline.weight(.semibold))
                                        .foregroundStyle(Theme.ink)
                                    Text("\(group.count ?? group.items?.count ?? 0)")
                                        .font(.caption2.bold())
                                        .padding(.horizontal, 6)
                                        .padding(.vertical, 2)
                                        .background(Theme.amber.opacity(0.16), in: Capsule())
                                        .foregroundStyle(Theme.amber)
                                    Spacer()
                                    Image(systemName: "chevron.down")
                                        .font(.caption.bold())
                                        .foregroundStyle(Theme.muted)
                                        .rotationEffect(.degrees(isOpen ? 180 : 0))
                                }
                            }
                            .buttonStyle(.plain)
                            if isOpen {
                                if let hook = group.hook?.nilIfEmpty {
                                    Text(hook)
                                        .font(.caption)
                                        .foregroundStyle(Theme.ink)
                                }
                                let names = (group.items ?? []).compactMap { $0.name?.nilIfEmpty }
                                if !names.isEmpty {
                                    Text("涉及：\(names.joined(separator: "、"))")
                                        .font(.caption2)
                                        .foregroundStyle(Theme.muted)
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func actionsSection(_ r: HomeReport) -> some View {
        let actions = r.top_actions ?? []
        let wins = r.quick_wins ?? []
        if !actions.isEmpty || !wins.isEmpty {
            Card {
                VStack(alignment: .leading, spacing: 10) {
                    if !actions.isEmpty {
                        LabeledBlock(
                            title: "先做这几件事",
                            text: actions.enumerated().map { "\($0.offset + 1). \($0.element)" }.joined(separator: "\n")
                        )
                    }
                    if !wins.isEmpty {
                        LabeledBlock(
                            title: "快速见效",
                            text: wins.map { "· \($0)" }.joined(separator: "\n")
                        )
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func suggestionsSection(_ r: HomeReport) -> some View {
        let suggestions = r.suggestions ?? []
        if !suggestions.isEmpty {
            Card {
                VStack(alignment: .leading, spacing: 10) {
                    Text("优化建议")
                        .font(.caption.bold())
                        .foregroundStyle(Theme.muted)
                    ForEach(suggestions) { s in
                        let isOn = adopted.contains(s.id)
                        Button {
                            if isOn { adopted.remove(s.id) } else { adopted.insert(s.id) }
                        } label: {
                            HStack(alignment: .top, spacing: 10) {
                                Image(systemName: isOn ? "checkmark.circle.fill" : "circle")
                                    .foregroundStyle(isOn ? Theme.green : Theme.muted.opacity(0.5))
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(s.title ?? "建议")
                                        .font(.subheadline.weight(.semibold))
                                        .foregroundStyle(Theme.ink)
                                    if let detail = s.detail?.nilIfEmpty {
                                        Text(detail)
                                            .font(.caption)
                                            .foregroundStyle(Theme.ink)
                                    }
                                    if let action = s.action?.nilIfEmpty {
                                        Text("行动：\(action)")
                                            .font(.caption2)
                                            .foregroundStyle(Theme.muted)
                                    }
                                }
                            }
                        }
                        .buttonStyle(.plain)
                    }
                    Button {
                        showPlanAlert = true
                    } label: {
                        Text(adopted.isEmpty ? "先勾选要采纳的建议" : "领取改进方案（已选 \(adopted.count) 条）")
                            .font(.subheadline.weight(.semibold))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 10)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(Theme.green)
                    .disabled(adopted.isEmpty)
                }
            }
        }
    }

    @ViewBuilder
    private func disposalSection(_ r: HomeReport) -> some View {
        let items = r.disposal?.hazardous_items ?? []
        let noDrain = r.disposal?.no_drain_items ?? []
        let tips = r.disposal?.eco_tips ?? []
        if items.isEmpty && noDrain.isEmpty && tips.isEmpty && r.disposal?.green_note == nil {
            EmptyView()
        } else {
            Card {
                VStack(alignment: .leading, spacing: 8) {
                    Text("绿色处置方案")
                        .font(.caption.bold())
                        .foregroundStyle(Theme.muted)
                    if let note = r.disposal?.green_note?.nilIfEmpty {
                        Text(note)
                            .font(.subheadline)
                            .foregroundStyle(Theme.ink)
                    }
                    if !items.isEmpty {
                        Text("有害垃圾 · 需单独投放（\(r.disposal?.hazardous_count ?? items.count)）")
                            .font(.caption.bold())
                            .foregroundStyle(Theme.coral)
                        ForEach(items) { item in
                            VStack(alignment: .leading, spacing: 2) {
                                Text([item.name, item.category.map { "（\($0)）" }].compactMap { $0?.nilIfEmpty }.joined())
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundStyle(Theme.ink)
                                if let route = item.route?.nilIfEmpty {
                                    Text(route)
                                        .font(.caption)
                                        .foregroundStyle(Theme.ink)
                                }
                            }
                        }
                    }
                    if !noDrain.isEmpty {
                        Text("严禁倒入下水道")
                            .font(.caption.bold())
                            .foregroundStyle(Theme.coral)
                        Text(noDrain.compactMap { $0.name?.nilIfEmpty }.joined(separator: "、"))
                            .font(.caption)
                            .foregroundStyle(Theme.ink)
                    }
                    if !tips.isEmpty {
                        Text("减量与环境保护")
                            .font(.caption.bold())
                            .foregroundStyle(Theme.green)
                        ForEach(Array(tips.enumerated()), id: \.offset) { _, tip in
                            Text("· \(tip)")
                                .font(.caption)
                                .foregroundStyle(Theme.ink)
                        }
                    }
                    if items.isEmpty && noDrain.isEmpty {
                        Text("暂未发现需特殊处置的高危废弃物。")
                            .font(.caption)
                            .foregroundStyle(Theme.green)
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var timelineSection: some View {
        let checkins = timeline?.checkins ?? []
        if !checkins.isEmpty {
            Card {
                VStack(alignment: .leading, spacing: 8) {
                    Text("安全时间线")
                        .font(.caption.bold())
                        .foregroundStyle(Theme.muted)
                    ForEach(checkins) { c in
                        HStack(spacing: 10) {
                            Circle()
                                .fill(RiskLevel(rawValue: c.overall_risk)?.tint ?? Theme.muted)
                                .frame(width: 10, height: 10)
                            Text(String(c.created_at.prefix(10)))
                                .foregroundStyle(Theme.ink)
                            Text(RiskLevel(rawValue: c.overall_risk)?.label ?? c.overall_risk)
                                .foregroundStyle(Theme.ink)
                            Text("\(c.item_count) 件")
                                .foregroundStyle(Theme.muted)
                            if let delta = c.item_delta, delta != 0 {
                                Text(delta > 0 ? "+\(delta)" : "\(delta)")
                                    .foregroundStyle(delta > 0 ? Theme.coral : Theme.green)
                            }
                            if let pairs = c.n_pairs, pairs > 0 {
                                Text("\(pairs) 组")
                                    .foregroundStyle(Theme.muted)
                            }
                            Spacer()
                            trendArrow(c.trend)
                        }
                        .font(.subheadline)
                    }
                    if let reminders = timeline?.reminders?.nilIfEmpty {
                        ForEach(reminders, id: \.self) { r in
                            Text("提醒：\(r)")
                                .font(.caption)
                                .foregroundStyle(Theme.amber)
                        }
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func trendArrow(_ trend: String?) -> some View {
        switch trend {
        case "up", "worse", "上升":
            Label("变差", systemImage: "arrow.up.right")
                .font(.caption.bold())
                .foregroundStyle(Theme.coral)
        case "down", "better", "下降":
            Label("好转", systemImage: "arrow.down.right")
                .font(.caption.bold())
                .foregroundStyle(Theme.green)
        default:
            Label("持平", systemImage: "arrow.right")
                .font(.caption)
                .foregroundStyle(Theme.muted)
        }
    }
}

/// 五维雷达图：SwiftUI Path 自绘五角网格 + 取值多边形。
struct RadarChart: View {
    var dims: [RadarDim]
    var tint: Color

    var body: some View {
        GeometryReader { geo in
            let center = CGPoint(x: geo.size.width / 2, y: geo.size.height / 2)
            let radius = min(geo.size.width, geo.size.height) / 2 - 26
            ZStack {
                ForEach([0.33, 0.66, 1.0], id: \.self) { frac in
                    polygonPath(frac: frac, center: center, radius: radius)
                        .stroke(Theme.ink.opacity(0.10), lineWidth: 1)
                }
                ForEach(dims.indices, id: \.self) { i in
                    Path { p in
                        p.move(to: center)
                        p.addLine(to: point(i, 1, center: center, radius: radius))
                    }
                    .stroke(Theme.ink.opacity(0.10), lineWidth: 1)
                }
                valuePath(center: center, radius: radius)
                    .fill(tint.opacity(0.22))
                valuePath(center: center, radius: radius)
                    .stroke(tint, lineWidth: 2)
                ForEach(dims.indices, id: \.self) { i in
                    Text(dims[i].label)
                        .font(.caption2)
                        .foregroundStyle(Theme.muted)
                        .position(labelPoint(i, center: center, radius: radius))
                }
            }
        }
    }

    private func point(_ i: Int, _ frac: Double, center: CGPoint, radius: CGFloat) -> CGPoint {
        let n = max(dims.count, 1)
        let angle = -CGFloat.pi / 2 + CGFloat(i) * 2 * .pi / CGFloat(n)
        return CGPoint(
            x: center.x + radius * CGFloat(frac) * cos(angle),
            y: center.y + radius * CGFloat(frac) * sin(angle)
        )
    }

    private func labelPoint(_ i: Int, center: CGPoint, radius: CGFloat) -> CGPoint {
        point(i, 1.22, center: center, radius: radius)
    }

    private func polygonPath(frac: Double, center: CGPoint, radius: CGFloat) -> Path {
        Path { p in
            for i in dims.indices {
                let pt = point(i, frac, center: center, radius: radius)
                if i == 0 { p.move(to: pt) } else { p.addLine(to: pt) }
            }
            p.closeSubpath()
        }
    }

    private func valuePath(center: CGPoint, radius: CGFloat) -> Path {
        Path { p in
            for i in dims.indices {
                let pt = point(i, max(dims[i].clamped, 0.04), center: center, radius: radius)
                if i == 0 { p.move(to: pt) } else { p.addLine(to: pt) }
            }
            p.closeSubpath()
        }
    }
}
