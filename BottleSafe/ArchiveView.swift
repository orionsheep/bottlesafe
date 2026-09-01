import SwiftUI

struct ArchiveView: View {
    @Environment(AppState.self) private var app
    @State private var items: [HouseholdItem] = []
    @State private var openID: Int?
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Group {
                if items.isEmpty {
                    ContentUnavailableView("尚无存档", systemImage: "archivebox", description: Text("识别之后点「存入家庭档案」。"))
                } else {
                    List {
                        Section {
                            HStack {
                                stat("\(items.count)", "件")
                                stat("\(items.filter { ($0.analysis?.risk ?? .unknown) == .high || ($0.analysis?.risk ?? .unknown) == .critical }.count)", "高危")
                            }
                        }
                        ForEach(items) { item in
                            DisclosureGroup(isExpanded: expanded(item.id)) {
                                if let a = item.analysis {
                                    Text(a.summary).font(.subheadline)
                                    if !a.ingredients.isEmpty {
                                        Text("成分 \(a.ingredients.map(\.name).joined(separator: "、"))")
                                    }
                                    if !a.do_not_mix_with.isEmpty {
                                        Text("切忌混用 \(a.do_not_mix_with.joined(separator: "、"))")
                                            .foregroundStyle(Theme.coral)
                                    }
                                    Button("去混用") { app.selectedTab = .mix }
                                    Button("删除", role: .destructive) {
                                        Task { await remove(item.id) }
                                    }
                                }
                            } label: {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(item.displayName).font(.headline)
                                    Text(item.analysis?.risk.label ?? "未知")
                                        .font(.caption)
                                        .foregroundStyle(item.analysis?.risk.tint ?? Theme.muted)
                                }
                            }
                        }
                    }
                }
            }
            .background(Theme.cream)
            .navigationTitle("家宅档案")
            .toolbar { ToolbarItem(placement: .topBarTrailing) { APIBadge() } }
            .task { await reload() }
            .refreshable { await reload() }
            .overlay { if let error { Text(error).foregroundStyle(Theme.coral) } }
        }
    }

    private func expanded(_ id: Int) -> Binding<Bool> {
        Binding(
            get: { openID == id },
            set: { openID = $0 ? id : nil }
        )
    }

    private func stat(_ n: String, _ label: String) -> some View {
        VStack {
            Text(n).font(.title.bold())
            Text(label).font(.caption).foregroundStyle(Theme.muted)
        }
        .frame(maxWidth: .infinity)
    }

    private func reload() async {
        do {
            items = try await app.client.householdItems()
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
