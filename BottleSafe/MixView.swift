import SwiftUI

struct MixView: View {
    @Environment(AppState.self) private var app
    @State private var house: [HouseholdItem] = []
    @State private var slotA: MixCandidate?
    @State private var slotB: MixCandidate?
    @State private var lastFilled = "a"
    @State private var busy = false
    @State private var error: String?
    @State private var result: MixResponse?

    var tray: [MixCandidate] {
        var seen = Set<String>()
        var out: [MixCandidate] = []
        for c in app.drafts + house.map({ Self.candidate(from: $0) }) {
            if seen.contains(c.id) || seen.contains("name:\(c.name)") { continue }
            seen.insert(c.id)
            seen.insert("name:\(c.name)")
            out.append(c)
        }
        return out
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                Text("选出两瓶，只在这一页「混合」。不要真的倒在一起。")
                    .foregroundStyle(Theme.muted)
                    .frame(maxWidth: .infinity, alignment: .leading)

                    VStack(alignment: .leading, spacing: 6) {
                        Text("演示组合 · 规则库")
                            .font(.caption.bold())
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                            .foregroundStyle(.white)
                            .background(Theme.coral, in: Capsule())
                        Text("84 消毒液 × 洁厕灵 → 氯气")
                            .font(.headline)
                            .foregroundStyle(Theme.ink)
                        Text("马桶是这两瓶最容易先后相遇的地方。分开存放，绝不同时倒。本组合判定基于规则库，非大模型推测。")
                            .font(.subheadline)
                            .foregroundStyle(Theme.ink)
                    }
                    .padding(14)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Theme.coral.opacity(0.12), in: RoundedRectangle(cornerRadius: 16))

                    slotCard(slotA, title: "槽 A") {
                        slotA = nil
                        result = nil
                    }
                    Image(systemName: "xmark")
                        .font(.title.bold())
                        .foregroundStyle(Theme.coral)
                    slotCard(slotB, title: "槽 B") {
                        slotB = nil
                        result = nil
                    }

                    Button {
                        Task { await runMix() }
                    } label: {
                        Text(busy ? "正在比对成分…" : (slotA != nil && slotB != nil ? "混合" : "先选出两瓶"))
                            .font(.headline)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(Theme.ink)
                    .disabled(slotA == nil || slotB == nil || busy)

                    if let error { Text(error).foregroundStyle(Theme.coral).font(.footnote) }
                    if let result { outcome(result) }

                    Text("候选瓶子").font(.headline).foregroundStyle(Theme.ink).frame(maxWidth: .infinity, alignment: .leading)
                    if tray.isEmpty {
                        Text("先去识别拍两瓶，再回来混合")
                            .foregroundStyle(Theme.muted)
                        Button("去识别 →") {
                            app.showMix = false
                            app.selectedTab = .scan
                        }
                    } else {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 10) {
                                ForEach(tray) { c in
                                    Button { pick(c) } label: { chip(c) }
                                        .buttonStyle(.plain)
                                }
                            }
                        }
                    }
                }
                .padding(16)
                .padding(.bottom, 28)
            }
        .background(Theme.cream)
        .navigationTitle("合在一起，会怎样？")
        .toolbar { ToolbarItem(placement: .topBarTrailing) { APIBadge() } }
        .task { await refresh() }
        .onChange(of: app.showMix) { _, on in
            if on { Task { await refresh() } }
        }
        .onChange(of: app.pendingMixPrefill) { _, flag in
            if flag { applyPrefill(); app.pendingMixPrefill = false }
        }
    }

    private func refresh() async {
        house = (try? await app.client.householdItems()) ?? []
        if app.pendingMixPrefill || (slotA == nil && slotB == nil) {
            applyPrefill()
            app.pendingMixPrefill = false
        }
    }

    private func applyPrefill() {
        guard app.drafts.count >= 1 else { return }
        slotA = app.drafts[0]
        slotB = app.drafts.count >= 2 ? app.drafts[1] : nil
        result = nil
    }

    private func pick(_ c: MixCandidate) {
        result = nil
        error = nil
        if slotA?.id == c.id { slotA = nil; return }
        if slotB?.id == c.id { slotB = nil; return }
        if slotA == nil { slotA = c; lastFilled = "a"; return }
        if slotB == nil { slotB = c; lastFilled = "b"; return }
        if lastFilled == "b" { slotA = c; lastFilled = "a" }
        else { slotB = c; lastFilled = "b" }
    }

    private func runMix() async {
        guard let slotA, let slotB else { return }
        busy = true
        error = nil
        result = nil
        defer { busy = false }
        do {
            result = try await app.client.mix(
                a: .init(analysis: slotA.analysis, name: slotA.name, image_path: slotA.imagePath, location: slotA.location),
                b: .init(analysis: slotB.analysis, name: slotB.name, image_path: slotB.imagePath, location: slotB.location)
            )
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func severityRank(_ risk: CrossRisk) -> Int {
        switch risk.severity {
        case "critical": 0
        case "high": 1
        case "medium": 2
        case "low": 3
        default: 4
        }
    }

    private func bottle(for out: MixItemOut?, slot: MixCandidate?) -> CrossRiskBottle {
        let recognized = out?.matched?.map(\.name).nilIfEmpty
            ?? slot.map { Array($0.analysis.ingredients.prefix(3)).map(\.name) }
            ?? []
        return CrossRiskBottle(
            name: slot?.name ?? out?.name ?? "未命名",
            category: slot?.analysis.product.category,
            recognized: recognized,
            jpeg: slot?.localJPEG,
            imagePath: slot?.imagePath ?? out?.image_path
        )
    }

    @ViewBuilder
    private func outcome(_ r: MixResponse) -> some View {
        let titleA = slotA?.name ?? ""
        let titleB = slotB?.name ?? ""
        let sorted = r.cross_risks.sorted { severityRank($0) < severityRank($1) }
        let bA = bottle(for: r.items.first, slot: slotA)
        let bB = bottle(for: r.items.count > 1 ? r.items[1] : nil, slot: slotB)
        switch r.kind {
        case .danger:
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 8) {
                    Text(gasTitle(sorted.first?.reason ?? ""))
                        .font(.caption.bold())
                        .padding(6)
                        .background(Theme.coral, in: Capsule())
                        .foregroundStyle(.white)
                    Text((sorted.first?.isLLM == true || r.verdict_source == "llm") ? "AI推测" : "基于规则库")
                        .font(.caption2.bold())
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(((sorted.first?.isLLM == true) ? Theme.amber : Theme.green).opacity(0.16), in: Capsule())
                        .foregroundStyle(sorted.first?.isLLM == true ? Theme.amber : Theme.green)
                }
                Text("\(titleA)  ×  \(titleB)").font(.title3.bold()).foregroundStyle(Theme.ink)
                if let locRisk = sorted.first(where: { $0.same_location == true }) {
                    Text("📍 这两瓶放在同一位置（\(locRisk.location?.nilIfEmpty ?? "同一处")），现在就分开")
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(Theme.coral)
                }
                Text("· 立刻把两瓶分开放进不同柜子").foregroundStyle(Theme.ink)
                Text("· 开窗，离开这个房间").foregroundStyle(Theme.ink)
                Text("· 不要倒进同一下水道").foregroundStyle(Theme.ink)
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.coral.opacity(0.12), in: RoundedRectangle(cornerRadius: 18))
            riskCards(sorted, bA: bA, bB: bB)
        case .caution:
            VStack(alignment: .leading, spacing: 8) {
                Text("需注意的组合（非急性危险）")
                    .font(.caption.bold())
                    .padding(6)
                    .background(Theme.amber, in: Capsule())
                    .foregroundStyle(.white)
                Text("\(titleA)  ×  \(titleB)").font(.title3.bold()).foregroundStyle(Theme.ink)
                if let locRisk = sorted.first(where: { $0.same_location == true }) {
                    Text("📍 这两瓶放在同一位置（\(locRisk.location?.nilIfEmpty ?? "同一处")），现在就分开")
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(Theme.coral)
                }
                Text("这对组合没有命中强禁忌，但有保守档的关注点。仍建议分开存放、以产品标签为准。")
                    .font(.subheadline)
                    .foregroundStyle(Theme.ink)
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.amber.opacity(0.16), in: RoundedRectangle(cornerRadius: 18))
            riskCards(sorted, bA: bA, bB: bB)
        case .unknown:
            VStack(alignment: .leading, spacing: 8) {
                Text("混用结果未知")
                    .font(.caption.bold())
                    .padding(6)
                    .background(Theme.amber, in: Capsule())
                    .foregroundStyle(.white)
                Text("\(titleA)  ×  \(titleB)").font(.title3.bold()).foregroundStyle(Theme.ink)
                Text("至少有一瓶对不上已知成分，无法判断合在一起会怎样。不要混合。这不是安全许可。")
                    .foregroundStyle(Theme.ink)
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.amber.opacity(0.18), in: RoundedRectangle(cornerRadius: 18))
        case .noEdge:
            VStack(alignment: .leading, spacing: 8) {
                Text("已知禁忌表里没有这一对").font(.title3.bold()).foregroundStyle(Theme.ink)
                Text("两瓶都对上了成分，但这一对比没有反应边。仍不要混合使用，分开放置。")
                    .foregroundStyle(Theme.ink)
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.green.opacity(0.15), in: RoundedRectangle(cornerRadius: 18))
        }
    }

    /// 最严重的一条用五件套卡展开，其余紧凑列出。
    @ViewBuilder
    private func riskCards(_ sorted: [CrossRisk], bA: CrossRiskBottle, bB: CrossRiskBottle) -> some View {
        if let first = sorted.first {
            CrossRiskCard(risk: first, bottleA: bA, bottleB: bB)
        }
        if sorted.count > 1 {
            VStack(alignment: .leading, spacing: 8) {
                Text("其他关注点")
                    .font(.caption.bold())
                    .foregroundStyle(Theme.muted)
                ForEach(Array(sorted.dropFirst().enumerated()), id: \.offset) { _, risk in
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
                        Text(risk.reason)
                            .font(.caption)
                            .foregroundStyle(Theme.ink)
                        if let action = risk.action?.nilIfEmpty {
                            Text("建议：\(action)")
                                .font(.caption2)
                                .foregroundStyle(Theme.muted)
                        }
                        if risk.same_location == true {
                            Text("📍 同一位置（\(risk.location?.nilIfEmpty ?? "同一处")），请分开")
                                .font(.caption2.bold())
                                .foregroundStyle(Theme.coral)
                        }
                    }
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Theme.paper, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .stroke(Theme.ink.opacity(0.08), lineWidth: 1)
                    )
                }
            }
        }
    }

    private func gasTitle(_ reason: String) -> String {
        if reason.contains("氯气") { return "氯气" }
        let part = reason.split(separator: "：").last.map(String.init) ?? "禁忌反应"
        return String(part.prefix(18))
    }

    private func slotCard(_ cand: MixCandidate?, title: String, clear: @escaping () -> Void) -> some View {
        HStack(spacing: 12) {
            BottleImage(jpeg: cand?.localJPEG, url: app.client.imageURL(cand?.imagePath))
                .frame(width: 64, height: 64)
                .clipShape(RoundedRectangle(cornerRadius: 12))
            VStack(alignment: .leading) {
                Text(title).font(.caption).foregroundStyle(Theme.muted)
                Text(cand?.name ?? "点选一瓶").font(.headline).foregroundStyle(Theme.ink)
                if let cand { RiskChip(level: RiskLevel(rawValue: cand.riskLevel) ?? .unknown) }
                if let loc = cand?.location?.nilIfEmpty {
                    Text("📍 \(loc)")
                        .font(.caption2)
                        .foregroundStyle(Theme.muted)
                }
            }
            Spacer()
            if cand != nil { Button("换掉", action: clear).font(.caption) }
        }
        .padding(14)
        .frame(maxWidth: .infinity)
        .background(Theme.paper, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private func chip(_ c: MixCandidate) -> some View {
        VStack(spacing: 6) {
            BottleImage(jpeg: c.localJPEG, url: app.client.imageURL(c.imagePath))
                .frame(width: 88, height: 72)
                .clipShape(RoundedRectangle(cornerRadius: 10))
            Text(c.name).font(.caption.bold()).foregroundStyle(Theme.ink).lineLimit(2).frame(width: 88)
            Text(RiskLevel(rawValue: c.riskLevel)?.label ?? c.riskLevel)
                .font(.caption2)
                .foregroundStyle(Theme.muted)
        }
        .padding(8)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .stroke(slotA?.id == c.id || slotB?.id == c.id ? Theme.ink : Theme.muted.opacity(0.3), lineWidth: 2)
        )
    }

    private static func candidate(from item: HouseholdItem) -> MixCandidate {
        MixCandidate(
            id: "house:\(item.id)",
            name: item.displayName,
            riskLevel: item.analysis?.risk_level ?? "unknown",
            imagePath: item.image_path,
            localJPEG: nil,
            location: item.location,
            analysis: item.analysis ?? ChemicalAnalysis(
                product: ProductInfo(name: item.observed_name, brand: nil, category: nil, barcode: nil, manufacturer: nil),
                visual_evidence: [], hazards: [], ingredients: [], signal_words: [],
                safe_storage: [], do_not_mix_with: [], first_aid: FirstAid(ingestion: nil, inhalation: nil, eye_contact: nil, skin_contact: nil),
                uncertainties: [], needs_more_images: [], risk_level: "unknown", summary: ""
            )
        )
    }
}
