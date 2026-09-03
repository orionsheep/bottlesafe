import SwiftUI

struct ArchiveView: View {
    @Environment(AppState.self) private var app
    @State private var items: [HouseholdItem] = []
    @State private var openID: Int?
    @State private var error: String?
    @State private var locationDraft = ""
    @State private var query = ""
    @State private var riskFilter: RiskLevel?
    @State private var lastDiff: Int?
    @State private var sort: ArchiveSort = .newest

    private enum ArchiveSort { case newest, risk, name }

    var body: some View {
        @Bindable var app = app
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Text("全家化学品台账 · 一眼看清风险分布")
                        .font(.subheadline)
                        .foregroundStyle(Theme.muted)
                    ProfileCard(profile: $app.profile)
                    if let lastDiff, lastDiff != 0 {
                        Text(lastDiff > 0 ? "相比上次查看，新增 \(lastDiff) 件" : "相比上次查看，减少 \(-lastDiff) 件")
                            .font(.caption.bold())
                            .foregroundStyle(Theme.green)
                    }
                    stats
                    Button {
                        app.openMix(prefill: false)
                    } label: {
                        HStack(spacing: 12) {
                            Image(systemName: "flask.fill")
                                .font(.title3)
                                .foregroundStyle(Theme.coral)
                            VStack(alignment: .leading, spacing: 2) {
                                Text("混用检查")
                                    .font(.headline)
                                    .foregroundStyle(Theme.ink)
                                Text("任选两瓶，查能不能放在一起")
                                    .font(.caption)
                                    .foregroundStyle(Theme.muted)
                            }
                            Spacer()
                            Image(systemName: "chevron.right")
                                .font(.caption.bold())
                                .foregroundStyle(Theme.muted)
                        }
                        .padding(14)
                        .background(Theme.paper, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                        .overlay(
                            RoundedRectangle(cornerRadius: 16, style: .continuous)
                                .stroke(Theme.ink.opacity(0.08), lineWidth: 1)
                        )
                    }
                    .buttonStyle(.plain)
                    TextField("按名称 / 品类搜索", text: $query)
                        .textFieldStyle(.roundedBorder)
                    HStack(spacing: 8) {
                        sortChip("最新", .newest)
                        sortChip("按风险", .risk)
                        sortChip("按名称", .name)
                    }
                    if !topRisk.isEmpty {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("最需关注")
                                .font(.caption.bold())
                                .foregroundStyle(Theme.muted)
                            ForEach(topRisk) { item in
                                Button { openID = item.id } label: {
                                    HStack {
                                        Circle()
                                            .fill((item.analysis?.risk ?? .unknown).scoreTint)
                                            .frame(width: 8, height: 8)
                                        Text(item.displayName)
                                            .font(.subheadline.weight(.semibold))
                                            .foregroundStyle(Theme.ink)
                                        Spacer()
                                        Text((item.analysis?.risk ?? .unknown).label)
                                            .font(.caption.bold())
                                            .foregroundStyle((item.analysis?.risk ?? .unknown).tint)
                                    }
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .padding(12)
                        .background(Theme.paper, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    }
                    NavigationLink {
                        ReportView()
                    } label: {
                        HStack {
                            Label("打开全屋安全报告", systemImage: "doc.text.magnifyingglass")
                                .font(.headline)
                            Spacer()
                            Image(systemName: "chevron.right")
                                .font(.caption.bold())
                        }
                        .foregroundStyle(.white)
                        .padding(14)
                        .background(Theme.ink, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                    }
                    .buttonStyle(.plain)
                    if let error {
                        Text(error).foregroundStyle(Theme.coral).font(.footnote)
                    }
                    if items.isEmpty {
                        ContentUnavailableView("尚无存档", systemImage: "archivebox", description: Text("识别之后，点「存入家庭档案」即可。"))
                        Button("去识别") { app.selectedTab = .scan }
                            .buttonStyle(.borderedProminent)
                            .tint(Theme.ink)
                    } else {
                        ForEach(visibleItems) { item in
                            itemCard(item)
                        }
                    }
                }
                .padding(16)
                .padding(.bottom, 28)
            }
            .background(Theme.cream)
            .navigationTitle("家庭档案")
            .toolbar { ToolbarItem(placement: .topBarTrailing) { APIBadge() } }
            .navigationDestination(isPresented: $app.showMix) {
                MixView()
            }
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

    private var topRisk: [HouseholdItem] {
        items
            .filter { let r = $0.analysis?.risk ?? .unknown; return r == .high || r == .critical }
            .sorted { rank($0) > rank($1) }
            .prefix(3)
            .map { $0 }
    }

    private func rank(_ item: HouseholdItem) -> Int {
        switch item.analysis?.risk {
        case .critical: 4
        case .high: 3
        case .medium: 2
        case .low: 1
        default: 0
        }
    }

    private func sortChip(_ title: String, _ value: ArchiveSort) -> some View {
        Button {
            sort = value
        } label: {
            Text(title)
                .font(.caption.bold())
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(sort == value ? Theme.ink : Theme.paper, in: Capsule())
                .foregroundStyle(sort == value ? Color.white : Theme.ink)
        }
        .buttonStyle(.plain)
    }

    private var visibleItems: [HouseholdItem] {
        var list = items.filter { item in
            if let riskFilter {
                if (item.analysis?.risk ?? .unknown) != riskFilter { return false }
            }
            let q = query.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !q.isEmpty else { return true }
            let hay = [
                item.displayName,
                item.analysis?.product.category,
            ].compactMap { $0 }.joined(separator: " ")
            return hay.localizedCaseInsensitiveContains(q)
        }
        switch sort {
        case .newest: list.sort { $0.id > $1.id }
        case .risk: list.sort { rank($0) > rank($1) }
        case .name: list.sort { $0.displayName.localizedStandardCompare($1.displayName) == .orderedAscending }
        }
        return list
    }

    private var stats: some View {
        HStack(spacing: 4) {
            statButton("\(items.count)", "档案总数", nil)
            statButton("\(items.filter { $0.analysis?.risk == .critical }.count)", "危急", .critical)
            statButton("\(items.filter { $0.analysis?.risk == .high }.count)", "高危", .high)
            statButton("\(items.filter { $0.analysis?.risk == .medium }.count)", "中危", .medium)
            statButton("\(items.filter { $0.analysis?.risk == .low }.count)", "低危", .low)
        }
        .padding(10)
        .background(Theme.paper, in: RoundedRectangle(cornerRadius: 16))
    }

    private func statButton(_ n: String, _ label: String, _ filter: RiskLevel?) -> some View {
        let on = riskFilter == filter
        return Button {
            riskFilter = on ? nil : filter
        } label: {
            VStack {
                Text(n).font(.title2.bold()).foregroundStyle(on ? Theme.green : Theme.ink)
                Text(label).font(.caption).foregroundStyle(on ? Theme.green : Theme.muted)
            }
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.plain)
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
                        if let created = item.created_at?.nilIfEmpty {
                            Text("入档 \(String(created.prefix(10)).replacingOccurrences(of: "-", with: "/"))")
                                .font(.caption2)
                                .foregroundStyle(Theme.muted)
                        }
                        if let loc = item.location?.nilIfEmpty {
                            Text("📍 \(loc)")
                                .font(.caption2.bold())
                                .foregroundStyle(Theme.green)
                        }
                    }
                    Spacer()
                }
            }
            .buttonStyle(.plain)
            if openID == item.id, let a = item.analysis {
                locationEditor(item)
                Text(a.summary).font(.subheadline).foregroundStyle(Theme.ink)
                if !a.hazards.isEmpty {
                    LabeledBlock(title: "危害", text: a.hazards.map { "\($0.severity.uppercased()) \($0.type) — \($0.evidence)" }.joined(separator: "\n"), danger: true)
                }
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
                    Button("去混用") { app.openMix(prefill: false) }
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

    /// 存放位置编辑：预设 chips + 自定义 + 清除，改动即时 PATCH 到后端。
    @ViewBuilder
    private func locationEditor(_ item: HouseholdItem) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("存放位置")
                    .font(.caption.bold())
                    .foregroundStyle(Theme.muted)
                if let loc = item.location?.nilIfEmpty {
                    Text("当前：\(loc)")
                        .font(.caption.bold())
                        .foregroundStyle(Theme.green)
                    Button("清除") {
                        Task { await setLocation(item, nil) }
                    }
                    .font(.caption.bold())
                    .foregroundStyle(Theme.coral)
                }
            }
            FlowLayout(spacing: 6) {
                ForEach(StorageLocations.presets, id: \.self) { loc in
                    Button {
                        Task { await setLocation(item, loc) }
                    } label: {
                        Text(loc)
                            .font(.caption2.bold())
                            .padding(.horizontal, 8)
                            .padding(.vertical, 5)
                            .background(item.location == loc ? Theme.green : Theme.green.opacity(0.12), in: Capsule())
                            .foregroundStyle(item.location == loc ? Color.white : Theme.green)
                    }
                    .buttonStyle(.plain)
                }
            }
            HStack(spacing: 8) {
                TextField("自定义位置", text: $locationDraft)
                    .textFieldStyle(.roundedBorder)
                    .font(.caption)
                Button("设定") {
                    let loc = locationDraft.trimmingCharacters(in: .whitespacesAndNewlines)
                    guard !loc.isEmpty else { return }
                    locationDraft = ""
                    Task { await setLocation(item, loc) }
                }
                .font(.caption.bold())
                .buttonStyle(.bordered)
                .tint(Theme.green)
                .disabled(locationDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
        .padding(10)
        .background(Theme.ink.opacity(0.03), in: RoundedRectangle(cornerRadius: 12))
    }

    private func setLocation(_ item: HouseholdItem, _ location: String?) async {
        do {
            try await app.client.patchLocation(id: item.id, location: location)
            if let idx = items.firstIndex(where: { $0.id == item.id }) {
                items[idx].location = location
            }
        } catch {
            self.error = "位置更新失败：\(error.localizedDescription)"
        }
    }

    private func reload() async {
        do {
            items = try await app.client.householdItems()
            error = nil
            if lastDiff == nil {
                let key = "bottlesafe-archive-last-count"
                let prev = UserDefaults.standard.object(forKey: key) as? Int
                if let prev, prev != items.count {
                    lastDiff = items.count - prev
                }
                UserDefaults.standard.set(items.count, forKey: key)
            }
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
