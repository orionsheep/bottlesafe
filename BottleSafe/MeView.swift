import SwiftUI

/// 「我的」页：账号概览 + 健康偏好摘要 + 家庭报告/反馈/隐私入口。
struct MeView: View {
    @Environment(AppState.self) private var app
    @State private var itemCount: Int?
    @State private var showProfile = false
    @State private var showPrivacy = false
    @State private var showSettings = false
    @State private var firstOpen: Date = Self.loadFirstOpen()

    private static let firstOpenKey = "bottlesafe-first-open"

    private static func loadFirstOpen() -> Date {
        let defaults = UserDefaults.standard
        if let ts = defaults.object(forKey: firstOpenKey) as? Double {
            return Date(timeIntervalSince1970: ts)
        }
        let now = Date()
        defaults.set(now.timeIntervalSince1970, forKey: firstOpenKey)
        return now
    }

    var body: some View {
        @Bindable var app = app
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    header
                    preferenceCard
                    VStack(spacing: 10) {
                        Button {
                            app.selectedTab = .archive
                        } label: {
                            row(icon: "clock.arrow.circlepath", title: "分析历史", subtitle: "查看家庭档案")
                        }
                        .buttonStyle(.plain)
                        NavigationLink {
                            ReportView()
                        } label: {
                            row(icon: "doc.text.magnifyingglass", title: "家庭报告", subtitle: "全屋风险一览")
                        }
                        NavigationLink {
                            FeedbackView()
                        } label: {
                            row(icon: "bubble.left.and.exclamationmark.bubble.right", title: "反馈建议", subtitle: "告诉我们哪里做得不好")
                        }
                        Button {
                            withAnimation(.easeInOut(duration: 0.2)) { showPrivacy.toggle() }
                        } label: {
                            VStack(alignment: .leading, spacing: 8) {
                                rowContent(icon: "lock.shield", title: "隐私政策", subtitle: showPrivacy ? "收起" : "展开")
                                if showPrivacy {
                                    Text("所有画像与档案数据仅保存在本机与你自己的后端服务中：不注册账号、不上传任何第三方。删除本机数据即可彻底清除。")
                                        .font(.caption)
                                        .foregroundStyle(Theme.ink)
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                }
                            }
                        }
                        .buttonStyle(.plain)
                        Button {
                            showSettings = true
                        } label: {
                            row(icon: "gearshape", title: "系统设置", subtitle: "连接家里的识别服务器")
                        }
                        .buttonStyle(.plain)
                    }
                    Text("结果仅供健康参考，不构成医疗建议")
                        .font(.caption)
                        .foregroundStyle(Theme.muted)
                        .frame(maxWidth: .infinity)
                        .padding(.top, 8)
                }
                .padding(16)
                .padding(.bottom, 28)
            }
            .background(Theme.cream)
            .navigationTitle("我的")
            .toolbar { ToolbarItem(placement: .topBarTrailing) { APIBadge() } }
            .sheet(isPresented: $showProfile) {
                ProfileEditor(profile: $app.profile)
            }
            .sheet(isPresented: $showSettings) {
                SettingsSheet()
            }
            .task {
                itemCount = (try? await app.client.householdItems())?.count
            }
        }
    }

    private var header: some View {
        HStack(spacing: 14) {
            Image("mascot")
                .resizable()
                .scaledToFill()
                .frame(width: 60, height: 60)
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            VStack(alignment: .leading, spacing: 4) {
                Text("瓶安用户")
                    .font(.title3.bold())
                    .foregroundStyle(Theme.ink)
                Text("首次使用：\(firstOpen.formatted(date: .abbreviated, time: .omitted))")
                    .font(.caption)
                    .foregroundStyle(Theme.muted)
                Text("家庭档案 \(itemCount.map(String.init) ?? "—") 件")
                    .font(.caption.bold())
                    .foregroundStyle(Theme.green)
            }
            Spacer()
        }
        .padding(16)
        .background(Theme.paper, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(Theme.ink.opacity(0.08), lineWidth: 1)
        )
    }

    private var preferenceCard: some View {
        Button { showProfile = true } label: {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text("我的健康偏好")
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(Theme.ink)
                    Spacer()
                    Text("已选 \(app.profile.selectedCount) 项")
                        .font(.caption.bold())
                        .foregroundStyle(Theme.green)
                    Image(systemName: "chevron.right")
                        .font(.caption.bold())
                        .foregroundStyle(Theme.muted)
                }
                Text(app.profile.selectedLabels.isEmpty
                     ? "未设置 · 点这里完善家庭画像，提示会更准"
                     : app.profile.selectedLabels.joined(separator: " · "))
                    .font(.caption)
                    .foregroundStyle(Theme.muted)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(14)
            .background(Theme.paper, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(Theme.ink.opacity(0.08), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }

    private func row(icon: String, title: String, subtitle: String) -> some View {
        rowContent(icon: icon, title: title, subtitle: subtitle)
    }

    private func rowContent(icon: String, title: String, subtitle: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.headline)
                .foregroundStyle(Theme.green)
                .frame(width: 28)
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Theme.ink)
                Text(subtitle)
                    .font(.caption2)
                    .foregroundStyle(Theme.muted)
            }
            Spacer()
            Image(systemName: showPrivacy && title == "隐私政策" ? "chevron.down" : "chevron.right")
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
}
