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
    var body: some View {
        let onDark = level == .critical || level == .high || level == .medium
        Text(level.label)
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
