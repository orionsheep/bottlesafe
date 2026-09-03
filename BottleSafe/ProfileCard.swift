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
            ProfileEditor(profile: $profile)
        }
        .onChange(of: profile) { _, next in next.save() }
    }
}

/// 五维画像编辑：人群（默认展开）+ 健康关注/过敏原/饮食/运动四个标签维度，自动保存。
struct ProfileEditor: View {
    @Binding var profile: HouseholdProfile
    @Environment(\.dismiss) private var dismiss
    @State private var expanded: Set<String> = ["people"]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    HStack(alignment: .firstTextBaseline) {
                        Text("存在这台手机本地，不上传、不注册。画像会改写提示，并驱动规则引擎（儿童/猫/孕妇）。")
                            .font(.footnote)
                            .foregroundStyle(Theme.muted)
                        Spacer()
                        Text("共 \(profile.selectedCount) 项已选")
                            .font(.caption.bold())
                            .foregroundStyle(Theme.green)
                    }

                    sectionCard(id: "people", title: "家里有谁", count: peopleCount) {
                        LazyVGrid(columns: [GridItem(.adaptive(minimum: 92), spacing: 8)], spacing: 8) {
                            boolChip("婴幼儿", $profile.infant)
                            boolChip("儿童", $profile.child)
                            boolChip("老人", $profile.elderly)
                            boolChip("孕妇", $profile.pregnant)
                            boolChip("备孕", $profile.tryingConceive)
                            boolChip("宠物猫", $profile.petCat)
                            boolChip("宠物狗", $profile.petDog)
                            boolChip("过敏体质", $profile.allergy)
                            boolChip("哮喘", $profile.asthma)
                            boolChip("高血压", $profile.hypertension)
                        }
                    }

                    sectionCard(id: "health", title: "健康关注", subtitle: "仅用于生成成分提示，不构成医疗建议", count: profile.doctorFlags.count) {
                        TagPicker(presets: ProfileDimensions.doctorFlags, values: $profile.doctorFlags)
                    }
                    sectionCard(id: "allergens", title: "过敏原", count: profile.allergens.count) {
                        TagPicker(presets: ProfileDimensions.allergens, values: $profile.allergens)
                    }
                    sectionCard(id: "diet", title: "饮食偏好", count: profile.diet.count) {
                        TagPicker(presets: ProfileDimensions.diet, values: $profile.diet)
                    }
                    sectionCard(id: "fitness", title: "运动状态", count: profile.fitness.count) {
                        TagPicker(presets: ProfileDimensions.fitness, values: $profile.fitness)
                    }

                    VStack(alignment: .leading, spacing: 10) {
                        Text("这瓶当前怎么放")
                            .font(.subheadline.weight(.bold))
                            .foregroundStyle(Theme.ink)
                        Text("点按切换：是 / 否 / 未填。储存会改变结论（如「儿童可触及」+ 有儿童 → 风险升级）。")
                            .font(.caption2)
                            .foregroundStyle(Theme.muted)
                        VStack(spacing: 8) {
                            storageChip("儿童可触及", $profile.childAccessible)
                            storageChip("靠近食品", $profile.nearFood)
                            storageChip("保留原包装", $profile.originalContainer)
                        }
                    }
                    .padding(14)
                    .background(Theme.paper, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: 16, style: .continuous)
                            .stroke(Theme.ink.opacity(0.08), lineWidth: 1)
                    )

                    Text("安全判定仍走规则库。未知一律「暂无法判断」，不是安全。")
                        .font(.caption)
                        .foregroundStyle(Theme.muted)
                }
                .padding(16)
            }
            .background(Theme.cream)
            .navigationTitle("家庭画像")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("好") { dismiss() }
                }
            }
        }
        .presentationDetents([.medium, .large])
        .preferredColorScheme(.light)
    }

    private var peopleCount: Int {
        [profile.infant, profile.child, profile.elderly, profile.pregnant, profile.tryingConceive,
         profile.petCat, profile.petDog, profile.allergy, profile.asthma, profile.hypertension]
            .filter { $0 }.count
    }

    @ViewBuilder
    private func sectionCard<Content: View>(id: String, title: String, subtitle: String? = nil, count: Int, @ViewBuilder content: () -> Content) -> some View {
        let isOpen = expanded.contains(id)
        VStack(alignment: .leading, spacing: 10) {
            Button {
                withAnimation(.easeInOut(duration: 0.2)) {
                    if isOpen { expanded.remove(id) } else { expanded.insert(id) }
                }
            } label: {
                HStack(spacing: 8) {
                    Text(title)
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(Theme.ink)
                    if count > 0 {
                        Text("\(count)")
                            .font(.caption2.bold())
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Theme.green.opacity(0.14), in: Capsule())
                            .foregroundStyle(Theme.green)
                    }
                    Spacer()
                    Image(systemName: "chevron.down")
                        .font(.caption.bold())
                        .foregroundStyle(Theme.muted)
                        .rotationEffect(.degrees(isOpen ? 180 : 0))
                }
            }
            .buttonStyle(.plain)
            if isOpen {
                if let subtitle {
                    Text(subtitle)
                        .font(.caption2)
                        .foregroundStyle(Theme.muted)
                }
                content()
            }
        }
        .padding(14)
        .background(Theme.paper, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(Theme.ink.opacity(0.08), lineWidth: 1)
        )
    }

    private func storageChip(_ title: String, _ value: Binding<Bool?>) -> some View {
        let state = value.wrappedValue
        let caption = state == true ? "是" : state == false ? "否" : "—"
        let fill = state == true ? Theme.ink : state == false ? Theme.coral.opacity(0.14) : Theme.cream
        let fg = state == true ? Color.white : Theme.ink
        return Button {
            switch value.wrappedValue {
            case nil: value.wrappedValue = true
            case true?: value.wrappedValue = false
            case false?: value.wrappedValue = nil
            }
        } label: {
            HStack {
                Text(title)
                    .font(.subheadline.weight(.bold))
                Spacer()
                Text(caption)
                    .font(.caption.bold())
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(state == true ? Color.white.opacity(0.18) : Theme.ink.opacity(0.08), in: Capsule())
            }
            .foregroundStyle(fg)
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(fill, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(Theme.ink.opacity(0.12), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }

    private func boolChip(_ title: String, _ on: Binding<Bool>) -> some View {
        Button {
            on.wrappedValue.toggle()
        } label: {
            Text(title)
                .font(.subheadline.weight(.bold))
                .foregroundStyle(on.wrappedValue ? Color.white : Theme.ink)
                .padding(.vertical, 8)
                .frame(maxWidth: .infinity)
                .background(on.wrappedValue ? Theme.ink : Theme.cream, in: Capsule())
                .overlay(Capsule().stroke(Theme.ink.opacity(0.12), lineWidth: 1))
        }
        .buttonStyle(.plain)
    }
}

/// 单个标签维度：预设 chips 多选 + 自定义标签（≤12 字，每维 ≤5 个）。
struct TagPicker: View {
    var presets: [String]
    @Binding var values: [String]
    @State private var draft = ""

    private var customs: [String] {
        values.filter { !presets.contains($0) }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            FlowLayout(spacing: 8) {
                ForEach(presets, id: \.self) { tag in
                    chip(tag, selected: values.contains(tag)) { toggle(tag) }
                }
                ForEach(customs, id: \.self) { tag in
                    Button { values.removeAll { $0 == tag } } label: {
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
            }
            if customs.count < ProfileDimensions.customMaxCount {
                HStack(spacing: 8) {
                    TextField("自定义标签（≤12 字）", text: $draft)
                        .textFieldStyle(.roundedBorder)
                        .font(.caption)
                        .onChange(of: draft) { _, next in
                            if next.count > ProfileDimensions.customMaxLength {
                                draft = String(next.prefix(ProfileDimensions.customMaxLength))
                            }
                        }
                    Button("添加") { addCustom() }
                        .font(.caption.bold())
                        .buttonStyle(.bordered)
                        .tint(Theme.green)
                        .disabled(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
    }

    private func chip(_ title: String, selected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.caption.bold())
                .foregroundStyle(selected ? Color.white : Theme.ink)
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(selected ? Theme.ink : Theme.cream, in: Capsule())
                .overlay(Capsule().stroke(Theme.ink.opacity(0.12), lineWidth: 1))
        }
        .buttonStyle(.plain)
    }

    private func toggle(_ tag: String) {
        if values.contains(tag) {
            values.removeAll { $0 == tag }
        } else {
            values.append(tag)
        }
    }

    private func addCustom() {
        let t = String(draft.trimmingCharacters(in: .whitespacesAndNewlines).prefix(ProfileDimensions.customMaxLength))
        guard !t.isEmpty, !values.contains(t), customs.count < ProfileDimensions.customMaxCount else { return }
        values.append(t)
        draft = ""
    }
}

/// 横向不够就换行的流式布局。
struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxWidth = proposal.width ?? .infinity
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowHeight: CGFloat = 0
        var usedWidth: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x > 0, x + size.width > maxWidth {
                usedWidth = max(usedWidth, x - spacing)
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
        usedWidth = max(usedWidth, x > 0 ? x - spacing : 0)
        return CGSize(width: usedWidth, height: y + rowHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX
        var y = bounds.minY
        var rowHeight: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x > bounds.minX, x + size.width > bounds.maxX {
                x = bounds.minX
                y += rowHeight + spacing
                rowHeight = 0
            }
            subview.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
    }
}

struct TourOverlay: View {
    @Binding var step: Int
    var skip: () -> Void
    private let lines = [
        "家宅危害图鉴：先记住最常见的几瓶。含氯漂白剂绝不能碰上酸性洁厕剂。",
        "今日小知识会跟家庭画像走。家里有猫，会优先讲菊酯和酚。",
        "没有现成照片？点示例一键试用。识别走视觉模型，关键安全判定由规则引擎兜底。",
        "混用页：选出两瓶再点。84 × 洁厕灵会主动预警氯气——基于规则库，不是大模型猜的。",
        "档案留下每一次排查。家庭画像存在本机，不用注册。",
        "语音问答：不识字也能开口问「能不能一起倒」。小安记得你扫过的瓶子。",
        "系统设置在「我的」。真机填电脑局域网地址，模拟器才用本机回环。",
        "瓶安不做医疗诊断、不下致癌结论、不替代实验室。拍一下，让瓶瓶罐罐安放妥当。",
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
