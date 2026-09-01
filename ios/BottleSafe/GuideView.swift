import SwiftUI

struct GuideView: View {
    @Environment(AppState.self) private var app
    @State private var openID: String? = "01"

    private let hazards: [HazardGuide] = [
        .init(id: "01", name: "含氯漂白剂", room: "洗衣房", risk: "腐蚀性", note: "切勿与酸或氨水同用。"),
        .init(id: "02", name: "酸性洁厕剂", room: "浴室", risk: "毒气", note: "与含氯产品相遇会生成氯气。"),
        .init(id: "03", name: "管道疏通剂", room: "浴室", risk: "化学灼伤", note: "强碱腐蚀，优先物理疏通替代。"),
        .init(id: "04", name: "杀虫喷雾", room: "厨房", risk: "吸入", note: "远离儿童、宠物与食物。"),
        .init(id: "05", name: "日用洗涤剂", room: "全屋", risk: "低风险", note: "按量使用，减少不必要排放。"),
    ]

    var body: some View {
        @Bindable var app = app
        let tip = DailyKnowledge.pick(profile: app.profile)
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("家庭化学品安全 AI")
                            .font(.caption.weight(.bold))
                            .foregroundStyle(Theme.green)
                        Text("拍一下，让瓶瓶罐罐安放妥当")
                            .font(.title.bold())
                            .foregroundStyle(Theme.ink)
                        Text("读标签、辨风险、查禁忌混用，把一次排查变成长期家庭安全档案。")
                            .foregroundStyle(Theme.muted)
                        Button {
                            app.selectedTab = .scan
                        } label: {
                            Text("开始识别")
                                .font(.headline)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 14)
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(Theme.ink)
                        Button {
                            app.tourStep = 0
                        } label: {
                            Text("90 秒自动演示")
                                .font(.subheadline.weight(.bold))
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 10)
                        }
                        .buttonStyle(.bordered)
                    }
                    .padding(20)
                    .background(Theme.paper, in: RoundedRectangle(cornerRadius: 22, style: .continuous))

                    VStack(alignment: .leading, spacing: 6) {
                        Text("今日小知识").font(.caption.bold()).foregroundStyle(Theme.green)
                        Text(tip.title).font(.headline).foregroundStyle(Theme.ink)
                        Text(tip.body).font(.subheadline).foregroundStyle(Theme.muted)
                        Text("按家庭画像加权轮换 · 不是医疗建议").font(.caption).foregroundStyle(Theme.muted)
                    }
                    .padding(16)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Theme.paper, in: RoundedRectangle(cornerRadius: 18, style: .continuous))

                    Text("家宅危害图鉴").font(.headline).foregroundStyle(Theme.ink)

                    ForEach(hazards) { item in
                        Button {
                            openID = openID == item.id ? nil : item.id
                        } label: {
                            VStack(alignment: .leading, spacing: 8) {
                                HStack {
                                    Text(item.id).font(.caption.monospaced()).foregroundStyle(Theme.muted)
                                    Text(item.room).font(.caption).foregroundStyle(Theme.muted)
                                    Spacer()
                                    Text(item.risk)
                                        .font(.caption.bold())
                                        .foregroundStyle(item.risk == "低风险" ? Theme.green : Theme.coral)
                                }
                                Text(item.name).font(.title3.bold()).foregroundStyle(Theme.ink)
                                if openID == item.id {
                                    Text(item.note).font(.subheadline).foregroundStyle(Theme.muted)
                                }
                            }
                            .padding(16)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(Theme.paper, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                        }
                        .buttonStyle(.plain)
                    }

                    VStack(alignment: .leading, spacing: 12) {
                        Text("日光三法则").font(.headline).foregroundStyle(Theme.ink)
                        rule("01", "读标", "让每件产品留在原瓶原罐。标签，是安全系统的一部分。")
                        rule("02", "分置", "相克的化学品，分处而藏。切勿随手调配混合物——尤其是漂白剂。")
                        rule("03", "通风", "挥发之物，当于通风处使用；远热源，远孩童，远宠物。")
                    }
                }
                .padding(16)
                .padding(.bottom, 28)
            }
            .background(Theme.cream)
            .navigationTitle("瓶安")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) { APIBadge() }
            }
        }
    }

    private func rule(_ no: String, _ title: String, _ body: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Text(no).font(.caption.bold()).foregroundStyle(Theme.green)
            VStack(alignment: .leading, spacing: 4) {
                Text(title).font(.headline).foregroundStyle(Theme.ink)
                Text(body).font(.subheadline).foregroundStyle(Theme.muted)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.paper, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}

struct APIBadge: View {
    @Environment(AppState.self) private var app
    @State private var showSettings = false

    var body: some View {
        Button {
            showSettings = true
        } label: {
            HStack(spacing: 6) {
                Circle()
                    .fill(app.backend?.status == "ready" ? Theme.green : Theme.coral)
                    .frame(width: 8, height: 8)
                Text(app.backend?.status == "ready" ? "已连接" : "未连接")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Theme.ink)
            }
        }
        .sheet(isPresented: $showSettings) { SettingsSheet() }
    }
}
