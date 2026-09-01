import SwiftUI

struct ArchiveView: View {
    @Environment(AppState.self) private var app
    @State private var items: [HouseholdItem] = []
    @State private var openID: Int?
    @State private var error: String?
    @State private var report: HomeReport?
    @State private var timeline: TimelinePayload?
    @State private var reportBusy = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    stats
                    if let error {
                        Text(error).foregroundStyle(Theme.coral).font(.footnote)
                    }
                    if items.isEmpty {
                        ContentUnavailableView("尚无存档", systemImage: "archivebox", description: Text("识别之后点「存入家庭档案」。"))
                        Button("去识别") { app.selectedTab = .scan }
                            .buttonStyle(.borderedProminent)
                            .tint(Theme.ink)
                    } else {
                        ForEach(items) { item in
                            itemCard(item)
                        }
                        reportBlock
                    }
                }
                .padding(16)
            }
            .background(Theme.cream)
            .navigationTitle("家宅档案")
            .toolbar { ToolbarItem(placement: .topBarTrailing) { APIBadge() } }
            .task { await reload() }
            .refreshable { await reload() }
            .onChange(of: app.archiveStamp) { _, _ in
                Task { await reload() }
            }
            .onChange(of: app.selectedTab) { _, tab in
                if tab == .archive { Task { await reload() } }
            }
        }
    }

    private var stats: some View {
        let high = items.filter { let r = $0.analysis?.risk ?? .unknown; return r == .high || r == .critical }.count
        return HStack {
            stat("\(items.count)", "件")
            stat("\(high)", "高危")
            stat("\(items.filter { $0.analysis?.risk == .medium }.count)", "中危")
            stat("\(items.filter { $0.analysis?.risk == .low }.count)", "低危")
        }
        .padding(12)
        .background(Theme.paper, in: RoundedRectangle(cornerRadius: 16))
    }

    private func stat(_ n: String, _ label: String) -> some View {
        VStack {
            Text(n).font(.title2.bold())
            Text(label).font(.caption).foregroundStyle(Theme.muted)
        }
        .frame(maxWidth: .infinity)
    }

    private func itemCard(_ item: HouseholdItem) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Button {
                openID = openID == item.id ? nil : item.id
            } label: {
                HStack(spacing: 12) {
                    BottleImage(url: app.client.imageURL(item.image_path))
                        .frame(width: 72, height: 88)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                    VStack(alignment: .leading, spacing: 4) {
                        Text(item.displayName).font(.headline).foregroundStyle(Theme.ink)
                        RiskChip(level: item.analysis?.risk ?? .unknown)
                        if let cat = item.analysis?.product.category {
                            Text(cat).font(.caption).foregroundStyle(Theme.muted)
                        }
                    }
                    Spacer()
                }
            }
            .buttonStyle(.plain)
            if openID == item.id, let a = item.analysis {
                Text(a.summary).font(.subheadline)
                if !a.ingredients.isEmpty {
                    LabeledBlock(title: "成分", text: a.ingredients.map(\.name).joined(separator: "、"))
                }
                if !a.do_not_mix_with.isEmpty {
                    LabeledBlock(title: "切忌混用", text: a.do_not_mix_with.joined(separator: "、"), danger: true)
                }
                if !a.safe_storage.isEmpty {
                    LabeledBlock(title: "储存", text: a.safe_storage.joined(separator: "、"))
                }
                HStack {
                    Button("去混用") { app.selectedTab = .mix }
                    Button("删除", role: .destructive) {
                        Task { await remove(item.id) }
                    }
                }
                .buttonStyle(.bordered)
            }
        }
        .padding(12)
        .background(Theme.paper, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private var reportBlock: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("全屋安全报告").font(.title3.bold())
            Button {
                Task { await makeReport() }
            } label: {
                Text(reportBusy ? "正在分析你的家…" : "生成全屋报告")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .tint(Theme.ink)
            .disabled(reportBusy || items.isEmpty)

            if let report {
                RiskChip(level: RiskLevel(rawValue: report.overall_risk ?? "") ?? .unknown)
                if let t = report.overall_text { Text(t).font(.headline) }
                if let o = report.overview { Text(o).font(.subheadline) }
                if let pairs = report.cross_risks, !pairs.isEmpty {
                    LabeledBlock(title: "危险组合", text: pairs.map { "\($0.a) × \($0.b)：\($0.reason)" }.joined(separator: "\n"), danger: true)
                }
                if let acts = report.top_actions, !acts.isEmpty {
                    LabeledBlock(title: "先做这几件事", text: acts.enumerated().map { "\($0.offset + 1). \($0.element)" }.joined(separator: "\n"))
                }
                if let r = report.reassure {
                    Text("安心：\(r)").font(.subheadline)
                }
                Text(report.disclaimer ?? "仅供家庭风险筛查参考。")
                    .font(.caption2)
                    .foregroundStyle(Theme.muted)
            }

            if let timeline, !timeline.checkins.isEmpty {
                Text("安全时间线").font(.headline)
                ForEach(timeline.checkins) { c in
                    HStack {
                        Circle().fill(RiskLevel(rawValue: c.overall_risk)?.tint ?? Theme.muted).frame(width: 10, height: 10)
                        Text(String(c.created_at.prefix(10)))
                        Text(RiskLevel(rawValue: c.overall_risk)?.label ?? c.overall_risk)
                        Text("\(c.item_count) 件").foregroundStyle(Theme.muted)
                    }
                    .font(.subheadline)
                }
            }
        }
        .padding(16)
        .background(Theme.paper, in: RoundedRectangle(cornerRadius: 18))
    }

    private func reload() async {
        do {
            items = try await app.client.householdItems()
            timeline = try? await app.client.timeline()
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func makeReport() async {
        reportBusy = true
        defer { reportBusy = false }
        do {
            report = try await app.client.generateReport()
            timeline = try? await app.client.timeline()
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func remove(_ id: Int) async {
        do {
            try await app.client.deleteItem(id: id)
            items.removeAll { $0.id == id }
        } catch {
            self.error = error.localizedDescription
        }
    }
}
