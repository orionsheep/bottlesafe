import SwiftUI

/// 识别结果下方的一键反馈条：👍/👎，点 👎 可补一句评论，提交到 /api/feedback。
struct FeedbackBar: View {
    @Environment(AppState.self) private var app
    @State private var rating: String?
    @State private var comment = ""
    @State private var submitting = false
    @State private var done = false

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 12) {
                Text("这次识别有帮助吗？")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Theme.ink)
                Spacer()
                rateButton("up", title: "有帮助", icon: "hand.thumbsup")
                rateButton("down", title: "不准确", icon: "hand.thumbsdown")
            }
            if rating == "down", !done {
                HStack(spacing: 8) {
                    TextField("哪里不对？（选填）", text: $comment)
                        .textFieldStyle(.roundedBorder)
                        .font(.subheadline)
                    Button(submitting ? "提交中…" : "提交") {
                        Task { await send(rating: "down", comment: comment) }
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(Theme.green)
                    .disabled(submitting)
                }
            }
            if done {
                Text("感谢反馈，我们会持续改进。")
                    .font(.caption)
                    .foregroundStyle(Theme.green)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.paper, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(Theme.ink.opacity(0.08), lineWidth: 1)
        )
    }

    private func rateButton(_ value: String, title: String, icon: String) -> some View {
        Button {
            if value == "up" {
                Task { await send(rating: "up", comment: "") }
            } else {
                rating = "down"
            }
        } label: {
            Label(title, systemImage: rating == value ? "\(icon).fill" : icon)
                .font(.caption.bold())
        }
        .buttonStyle(.bordered)
        .tint(value == "up" ? Theme.green : Theme.coral)
        .disabled(done || submitting)
    }

    private func send(rating: String, comment: String) async {
        submitting = true
        defer { submitting = false }
        self.rating = rating
        do {
            try await app.client.submitFeedback(
                rating: rating,
                comment: comment,
                audience: app.profile.selectedLabels.joined(separator: "·"),
                page: "scan-ios"
            )
            done = true
        } catch {
            // 反馈失败静默降级，不打扰识别流程
            done = true
        }
    }
}
