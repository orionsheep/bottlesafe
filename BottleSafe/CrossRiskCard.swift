import SwiftUI

/// 混用卡片上一侧瓶子的展示信息。
struct CrossRiskBottle {
    var name: String
    var category: String?
    var recognized: [String]
    var jpeg: Data?
    var imagePath: String?
}

/// 混用组合关注卡（五件套）：双瓶并列 + 来源徽章 + 同位提醒 + 原因/后果 + 两条行动卡 + 保守声明 + 依据。
/// 混用页与全屋报告共用。
struct CrossRiskCard: View {
    @Environment(AppState.self) private var app
    var risk: CrossRisk
    var bottleA: CrossRiskBottle?
    var bottleB: CrossRiskBottle?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                sourceBadge
                RiskChip(level: risk.risk)
                Spacer()
            }

            if risk.same_location == true {
                Text("📍 这两瓶放在同一位置（\(risk.location?.nilIfEmpty ?? "同一处")），现在就分开")
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(.white)
                    .padding(10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Theme.coral, in: RoundedRectangle(cornerRadius: 12))
            }

            if bottleA != nil || bottleB != nil {
                HStack(alignment: .top, spacing: 10) {
                    bottleView(bottleA, fallback: risk.a)
                    Image(systemName: "xmark")
                        .font(.headline.bold())
                        .foregroundStyle(Theme.coral)
                        .padding(.top, 22)
                    bottleView(bottleB, fallback: risk.b)
                }
                Text("同时存在")
                    .font(.caption2.bold())
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(Theme.amber.opacity(0.16), in: Capsule())
                    .foregroundStyle(Theme.amber)
                    .frame(maxWidth: .infinity)
            }

            if let why = whyText {
                LabeledBlock(title: "为什么被识别为组合关注", text: why)
            }
            LabeledBlock(title: "可能发生什么", text: risk.reason, danger: risk.risk == .critical || risk.risk == .high)

            HStack(spacing: 10) {
                actionCard(icon: "hand.raised.fill", title: "避免混用", text: avoidText)
                actionCard(icon: "square.split.2x1.fill", title: "分开存放", text: separateText)
            }

            VStack(alignment: .leading, spacing: 3) {
                Text("提示偏保守：宁可多提醒，也不漏掉危险组合。")
                if risk.isLLM {
                    Text("此组合由 AI 推断，非规则库结论，请以产品标签为准。")
                }
                Text(risk.isLLM ? "依据：AI 推断（非规则库）" : "依据：产品安全技术说明书（SDS）与规则库")
            }
            .font(.caption2)
            .foregroundStyle(Theme.muted)
        }
        .padding(14)
        .background(Theme.paper, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(risk.isLLM ? Theme.amber.opacity(0.35) : Theme.ink.opacity(0.08), lineWidth: 1)
        )
    }

    private var sourceBadge: some View {
        Text(risk.isLLM ? "AI推测" : "基于规则库")
            .font(.caption2.bold())
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background((risk.isLLM ? Theme.amber : Theme.green).opacity(0.16), in: Capsule())
            .foregroundStyle(risk.isLLM ? Theme.amber : Theme.green)
    }

    private var whyText: String? {
        var parts: [String] = []
        for bottle in [bottleA, bottleB] {
            if let bottle, !bottle.recognized.isEmpty {
                parts.append("「\(bottle.name)」含 \(bottle.recognized.joined(separator: "、"))")
            }
        }
        if !parts.isEmpty { return parts.joined(separator: "；") + "。" }
        return nil
    }

    private var avoidText: String {
        risk.action?.nilIfEmpty ?? "两瓶不要倒进同一容器，不要先后紧邻使用；用完充分冲水。"
    }

    private func actionCard(icon: String, title: String, text: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Label(title, systemImage: icon)
                .font(.caption.bold())
                .foregroundStyle(Theme.green)
            Text(text)
                .font(.caption2)
                .foregroundStyle(Theme.ink)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(10)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(Theme.green.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
    }

    private var separateText: String {
        if risk.same_location == true {
            return "现在就移到不同柜子，保持原瓶原标。"
        }
        return "放进不同柜子，远离儿童与宠物；使用后开窗通风。"
    }

    private func bottleView(_ bottle: CrossRiskBottle?, fallback: String) -> some View {
        VStack(spacing: 6) {
            if let bottle {
                BottleImage(jpeg: bottle.jpeg, url: app.client.imageURL(bottle.imagePath))
                    .frame(width: 56, height: 56)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                Text(bottle.name)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Theme.ink)
                    .lineLimit(2)
                    .multilineTextAlignment(.center)
                if let cat = bottle.category?.nilIfEmpty {
                    Text(cat)
                        .font(.caption2)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Theme.ink.opacity(0.06), in: Capsule())
                        .foregroundStyle(Theme.muted)
                        .lineLimit(1)
                }
                if !bottle.recognized.isEmpty {
                    Text("识别到：\(bottle.recognized.joined(separator: "、"))")
                        .font(.caption2)
                        .foregroundStyle(Theme.muted)
                        .multilineTextAlignment(.center)
                }
            } else {
                Text(fallback)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Theme.ink)
                    .multilineTextAlignment(.center)
            }
        }
        .frame(maxWidth: .infinity)
    }
}
