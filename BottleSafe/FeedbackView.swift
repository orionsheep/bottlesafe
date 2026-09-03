import SwiftUI

/// 反馈页：总体评价（必选）+ 500 字意见 + 人群标签（画像预填可改）+ 反馈统计。
struct FeedbackView: View {
    @Environment(AppState.self) private var app
    @State private var rating: String?
    @State private var comment = ""
    @State private var tags: Set<String> = []
    @State private var customTag = ""
    @State private var submitting = false
    @State private var done = false
    @State private var error: String?
    @State private var stats: FeedbackStats?

    private let maxComment = 500

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if done {
                    thanksCard
                } else {
                    ratingSection
                    commentSection
                    tagsSection
                    if let error {
                        Text(error)
                            .font(.footnote)
                            .foregroundStyle(Theme.coral)
                    }
                    Button {
                        Task { await submit() }
                    } label: {
                        Text(submitting ? "提交中…" : (rating == nil ? "先选总体评价" : "提交反馈"))
                            .font(.headline)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(Theme.green)
                    .disabled(rating == nil || submitting)
                }
                statsLine
            }
            .padding(16)
            .padding(.bottom, 28)
        }
        .background(Theme.cream)
        .navigationTitle("反馈建议")
        .toolbar { ToolbarItem(placement: .topBarTrailing) { APIBadge() } }
        .onAppear {
            if tags.isEmpty {
                tags = Set(app.profile.selectedLabels)
            }
        }
        .task {
            stats = try? await app.client.feedbackStats()
        }
    }

    private var ratingSection: some View {
        Card {
            VStack(alignment: .leading, spacing: 10) {
                Text("总体评价（必选）")
                    .font(.caption.bold())
                    .foregroundStyle(Theme.muted)
                HStack(spacing: 10) {
                    rateButton("up", title: "有帮助", icon: "hand.thumbsup.fill", tint: Theme.green)
                    rateButton("down", title: "有待改进", icon: "hand.raised.fill", tint: Theme.amber)
                }
            }
        }
    }

    private func rateButton(_ value: String, title: String, icon: String, tint: Color) -> some View {
        Button {
            rating = value
        } label: {
            Label(title, systemImage: icon)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(rating == value ? Color.white : tint)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
                .background(rating == value ? tint : tint.opacity(0.12), in: RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(.plain)
    }

    private var commentSection: some View {
        Card {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text("你的意见")
                        .font(.caption.bold())
                        .foregroundStyle(Theme.muted)
                    Spacer()
                    Text("\(comment.count)/\(maxComment)")
                        .font(.caption2)
                        .foregroundStyle(Theme.muted)
                }
                TextEditor(text: $comment)
                    .frame(minHeight: 110)
                    .scrollContentBackground(.hidden)
                    .background(Theme.cream, in: RoundedRectangle(cornerRadius: 10))
                    .onChange(of: comment) { _, next in
                        if next.count > maxComment {
                            comment = String(next.prefix(maxComment))
                        }
                    }
            }
        }
    }

    private var tagsSection: some View {
        Card {
            VStack(alignment: .leading, spacing: 10) {
                Text("人群标签（按画像预填，可改）")
                    .font(.caption.bold())
                    .foregroundStyle(Theme.muted)
                FlowLayout(spacing: 8) {
                    ForEach(Array(tags).sorted(), id: \.self) { tag in
                        Button { tags.remove(tag) } label: {
                            HStack(spacing: 4) {
                                Text(tag)
                                Image(systemName: "xmark")
                                    .font(.caption2.bold())
                            }
                            .font(.caption.bold())
                            .foregroundStyle(Color.white)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 6)
                            .background(Theme.green, in: Capsule())
                        }
                        .buttonStyle(.plain)
                    }
                    ForEach(addablePresets, id: \.self) { tag in
                        Button { tags.insert(tag) } label: {
                            Text("+ \(tag)")
                                .font(.caption.bold())
                                .foregroundStyle(Theme.ink)
                                .padding(.horizontal, 10)
                                .padding(.vertical, 6)
                                .background(Theme.cream, in: Capsule())
                                .overlay(Capsule().stroke(Theme.ink.opacity(0.12), lineWidth: 1))
                        }
                        .buttonStyle(.plain)
                    }
                }
                HStack(spacing: 8) {
                    TextField("自定义标签（≤12 字）", text: $customTag)
                        .textFieldStyle(.roundedBorder)
                        .font(.caption)
                        .onChange(of: customTag) { _, next in
                            if next.count > 12 { customTag = String(next.prefix(12)) }
                        }
                    Button("添加") {
                        let t = customTag.trimmingCharacters(in: .whitespacesAndNewlines)
                        guard !t.isEmpty else { return }
                        tags.insert(t)
                        customTag = ""
                    }
                    .font(.caption.bold())
                    .buttonStyle(.bordered)
                    .tint(Theme.green)
                    .disabled(customTag.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
    }

    /// 画像里没选上的常用标签，可一键补进来。
    private var addablePresets: [String] {
        let all = ProfileDimensions.doctorFlags.prefix(4) + ProfileDimensions.allergens.prefix(3)
        return all.filter { !tags.contains($0) }
    }

    private var thanksCard: some View {
        Card {
            VStack(spacing: 10) {
                Image(systemName: "checkmark.seal.fill")
                    .font(.largeTitle)
                    .foregroundStyle(Theme.green)
                Text("感谢反馈")
                    .font(.title3.bold())
                    .foregroundStyle(Theme.ink)
                Text("你的意见会直接进入产品改进清单。")
                    .font(.subheadline)
                    .foregroundStyle(Theme.muted)
                Button("再写一条") {
                    done = false
                    rating = nil
                    comment = ""
                }
                .font(.caption.bold())
                .foregroundStyle(Theme.green)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 10)
        }
    }

    @ViewBuilder
    private var statsLine: some View {
        if let total = stats?.total, total > 0 {
            Text("已收到 \(total) 条真实用户反馈")
                .font(.caption)
                .foregroundStyle(Theme.muted)
                .frame(maxWidth: .infinity)
        }
    }

    private func submit() async {
        guard let rating else { return }
        submitting = true
        error = nil
        defer { submitting = false }
        do {
            try await app.client.submitFeedback(
                rating: rating,
                comment: comment.trimmingCharacters(in: .whitespacesAndNewlines),
                audience: tags.sorted().joined(separator: "·"),
                page: "ios-feedback"
            )
            done = true
            stats = try? await app.client.feedbackStats()
        } catch {
            self.error = "提交失败：\(error.localizedDescription)"
        }
    }
}
