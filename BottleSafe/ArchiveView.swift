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

    var body: some View {
        @Bindable var app = app
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    ProfileCard(profile: $app.profile)
                    if let lastDiff, lastDiff != 0 {
                        Text(lastDiff > 0 ? "相比上次查看，新增 \(lastDiff) 件" : "相比上次查看，减少 \(-lastDiff) 件")
                            .font(.caption.bold())
                            .foregroundStyle(Theme.green)
                    }
                    stats
                    Button {
                        app.selectedTab = .mix
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
                    TextField("搜索名称或成分", text: $query)
                        .textFieldStyle(.roundedBorder)
                    NavigationLink {
                        ReportView()
                    } label: {
                        HStack {
                            Label("全屋安全报告", systemImage: "doc.text.magnifyingglass")
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
                        ContentUnavailableView("尚无存档", systemImage: "archivebox", description: Text("识别之后点「存入家庭档案」。"))
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

    private var visibleItems: [HouseholdItem] {
        items.filter { item in
            if let riskFilter {
                let r = item.analysis?.risk ?? .unknown
                if riskFilter == .high {
                    if r != .high && r != .critical { return false }
                } else if r != riskFilter {
                    return false
                }
            }
            let q = query.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !q.isEmpty else { return true }
            let hay = [
                item.displayName,
                item.analysis?.product.brand,
                item.analysis?.product.category,
                item.location,
                item.analysis?.ingredients.map(\.name).joined(separator: " "),
            ].compactMap { $0 }.joined(separator: " ")
            return hay.localizedCaseInsensitiveContains(q)
        }
    }

    private var stats: some View {
        let high = items.filter { let r = $0.analysis?.risk ?? .unknown; return r == .high || r == .critical }.count
        return HStack {
            statButton("\(items.count)", "件", nil)
            statButton("\(high)", "高危", .high)
            statButton("\(items.filter { $0.analysis?.risk == .medium }.count)", "中危", .medium)
            statButton("\(items.filter { $0.analysis?.risk == .low }.count)", "低危", .low)
        }
        .padding(12)
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
