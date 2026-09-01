import SwiftUI

struct ProfileCard: View {
    @Binding var profile: HouseholdProfile
    @State private var open = false

    var body: some View {
        Button { open = true } label: {
            HStack {
                Text("家庭画像")
                    .font(.caption.bold())
                    .foregroundStyle(Theme.green)
                Text(profile.selectedLabels.isEmpty ? "未设置 · 结论按普通家庭" : profile.selectedLabels.joined(separator: " · "))
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Theme.ink)
                    .lineLimit(1)
                Spacer()
                Text("修改").font(.caption.bold()).foregroundStyle(Theme.ink)
            }
            .padding(12)
            .background(Theme.paper, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .buttonStyle(.plain)
        .sheet(isPresented: $open) {
            NavigationStack {
                ScrollView {
                    Text("存在这台手机本地，不上传、不注册。画像会改写提示，并驱动规则引擎（儿童/猫/孕妇）。")
                        .font(.footnote)
                        .foregroundStyle(Theme.muted)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 92), spacing: 8)], spacing: 8) {
                        chip("婴幼儿", $profile.infant)
                        chip("儿童", $profile.child)
                        chip("老人", $profile.elderly)
                        chip("孕妇", $profile.pregnant)
                        chip("备孕", $profile.tryingConceive)
                        chip("宠物猫", $profile.petCat)
                        chip("宠物狗", $profile.petDog)
                        chip("过敏体质", $profile.allergy)
                        chip("哮喘", $profile.asthma)
                        chip("高血压", $profile.hypertension)
                    }
                    Text("安全判定仍走规则库。未知一律「暂无法判断」，不是安全。")
                        .font(.caption)
                        .foregroundStyle(Theme.muted)
                }
                .padding(16)
                .background(Theme.cream)
                .navigationTitle("这户人家里有谁")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("好") { open = false }
                    }
                }
            }
            .presentationDetents([.medium, .large])
            .preferredColorScheme(.light)
        }
        .onChange(of: profile) { _, next in next.save() }
    }

    private func chip(_ title: String, _ on: Binding<Bool>) -> some View {
        Button {
            on.wrappedValue.toggle()
        } label: {
            Text(title)
                .font(.subheadline.weight(.bold))
                .foregroundStyle(on.wrappedValue ? Color.white : Theme.ink)
                .padding(.vertical, 8)
                .frame(maxWidth: .infinity)
                .background(on.wrappedValue ? Theme.ink : Theme.paper, in: Capsule())
                .overlay(Capsule().stroke(Theme.ink.opacity(0.12), lineWidth: 1))
        }
        .buttonStyle(.plain)
    }
}

struct TourOverlay: View {
    @Binding var step: Int
    var skip: () -> Void
    private let lines = [
        "家宅危害图鉴：含氯漂白剂绝不能碰上酸性洁厕剂。",
        "今日小知识会跟家庭画像走。家里有猫，会优先讲菊酯和酚。",
        "识别页可点相册或拍照。关键安全判定由规则引擎兜底。",
        "混用页选出两瓶。84 × 洁厕灵会预警氯气——基于规则库，不是大模型猜的。",
        "档案留下每一次排查。家庭画像存在本机，不用注册。",
        "瓶安不做医疗诊断、不下致癌结论、不替代实验室。",
    ]

    var body: some View {
        VStack {
            GeometryReader { geo in
                Rectangle()
                    .fill(Theme.green)
                    .frame(width: geo.size.width * CGFloat(step + 1) / CGFloat(max(lines.count, 1)), height: 3)
            }
            .frame(height: 3)
            Spacer()
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text("自动演示 \(step + 1)/\(lines.count)").font(.caption.bold())
                    Spacer()
                    Button("跳过", action: skip).font(.caption.bold())
                }
                .foregroundStyle(Color.white.opacity(0.8))
                Text(lines[min(step, lines.count - 1)])
                    .foregroundStyle(Color.white)
                    .font(.subheadline)
            }
            .padding(14)
            .background(Theme.ink, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .padding(.horizontal, 12)
            .padding(.bottom, 8)
        }
        .allowsHitTesting(true)
    }
}
