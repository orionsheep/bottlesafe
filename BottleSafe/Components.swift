import SwiftUI

struct Card<Content: View>: View {
    @ViewBuilder var content: Content
    var body: some View {
        content
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .foregroundStyle(Theme.ink)
            .background(Theme.paper, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .stroke(Theme.ink.opacity(0.08), lineWidth: 1)
            )
    }
}

struct RiskChip: View {
    var level: RiskLevel
    var useBandLabel = false
    var body: some View {
        let onDark = level == .critical || level == .high || level == .medium
        Text(useBandLabel ? level.bandLabel : level.label)
            .font(.caption.bold())
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
            .foregroundStyle(onDark ? Color.white : Theme.ink)
            .background(chipFill, in: Capsule())
    }

    private var chipFill: Color {
        switch level {
        case .unknown: Theme.muted.opacity(0.18)
        case .low: Theme.green.opacity(0.18)
        case .medium: Theme.amber
        case .high, .critical: Theme.coral
        }
    }
}

struct BottleImage: View {
    var jpeg: Data?
    var url: URL?
    var body: some View {
        Group {
            if let jpeg, let ui = UIImage(data: jpeg) {
                Image(uiImage: ui).resizable().scaledToFill()
            } else if let url {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let img): img.resizable().scaledToFill()
                    default: placeholder
                    }
                }
            } else {
                placeholder
            }
        }
    }

    private var placeholder: some View {
        ZStack {
            Theme.cream
            Image(systemName: "flask.fill").foregroundStyle(Theme.green)
        }
    }
}

struct LabeledBlock: View {
    var title: String
    var text: String
    var danger = false
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).font(.caption.bold()).foregroundStyle(danger ? Theme.coral : Theme.muted)
            Text(text).font(.subheadline).foregroundStyle(Theme.ink)
        }
    }
}

/// 安全评分圆环：Circle trim 自绘，未知显示「?」。
struct ScoreRing: View {
    var level: RiskLevel
    var body: some View {
        ZStack {
            Circle()
                .stroke(Theme.ink.opacity(0.08), lineWidth: 9)
            Circle()
                .trim(from: 0, to: CGFloat(level.safetyScore) / 100)
                .stroke(level.scoreTint, style: StrokeStyle(lineWidth: 9, lineCap: .round))
                .rotationEffect(.degrees(-90))
            VStack(spacing: 0) {
                Text("\(level.safetyScore)")
                    .font(.title.bold())
                    .foregroundStyle(level.scoreTint)
                Text("/100")
                    .font(.caption2)
                    .foregroundStyle(Theme.muted)
            }
        }
        .frame(width: 92, height: 92)
    }
}

/// 六维评分条形：risk 极性珊瑚色、safe 极性绿色。
struct DimensionBar: View {
    var dim: DimensionScore
    private var barColor: Color { dim.isRiskPolarity ? Theme.coral : Theme.green }
    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack {
                Text(dim.displayLabel)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Theme.ink)
                Spacer()
                Text("\(Int(dim.clampedScore.rounded()))")
                    .font(.caption.bold())
                    .foregroundStyle(barColor)
            }
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(Theme.ink.opacity(0.07))
                    Capsule()
                        .fill(barColor)
                        .frame(width: max(geo.size.width * dim.clampedScore / 100, 4))
                }
            }
            .frame(height: 8)
        }
    }
}
