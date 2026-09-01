import SwiftUI

struct Card<Content: View>: View {
    @ViewBuilder var content: Content
    var body: some View {
        content
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.paper, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}

struct RiskChip: View {
    var level: RiskLevel
    var body: some View {
        Text(level.label)
            .font(.caption.bold())
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
            .foregroundStyle(level == .critical || level == .high ? Color.white : Theme.ink)
            .background(level.tint.opacity(level == .low ? 0.25 : 0.9), in: Capsule())
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
