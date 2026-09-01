import Foundation
import SwiftUI

struct HouseholdProfile: Codable, Equatable {
    var infant = false
    var child = false
    var elderly = false
    var pregnant = false
    var tryingConceive = false
    var petCat = false
    var petDog = false
    var allergy = false
    var asthma = false
    var hypertension = false

    static let storageKey = "householdProfile"

    static func load() -> HouseholdProfile {
        guard let data = UserDefaults.standard.data(forKey: storageKey),
              let decoded = try? JSONDecoder().decode(HouseholdProfile.self, from: data) else {
            return HouseholdProfile()
        }
        return decoded
    }

    func save() {
        if let data = try? JSONEncoder().encode(self) {
            UserDefaults.standard.set(data, forKey: Self.storageKey)
        }
    }

    var apiContext: [String: Bool] {
        [
            "child": infant || child,
            "infant": infant,
            "elderly": elderly,
            "pregnant": pregnant || tryingConceive,
            "trying_conceive": tryingConceive,
            "pet_cat": petCat,
            "pet_dog": petDog,
            "allergy": allergy,
            "asthma": asthma,
            "hypertension": hypertension,
        ]
    }

    var selectedLabels: [String] {
        var out: [String] = []
        if infant { out.append("婴幼儿") }
        if child { out.append("儿童") }
        if elderly { out.append("老人") }
        if pregnant { out.append("孕妇") }
        if tryingConceive { out.append("备孕") }
        if petCat { out.append("宠物猫") }
        if petDog { out.append("宠物狗") }
        if allergy { out.append("过敏体质") }
        if asthma { out.append("哮喘") }
        if hypertension { out.append("高血压") }
        return out
    }

    func hints(for analysis: ChemicalAnalysis) -> [String] {
        let names = analysis.ingredients.map(\.name).joined(separator: " ").lowercased()
        let hazards = analysis.hazards.map { "\($0.type) \($0.severity)" }.joined(separator: " ").lowercased()
        let high = analysis.risk == .high || analysis.risk == .critical
        let corrosive = hazards.contains("corrosive") || hazards.contains("腐蚀") || hazards.contains("毒")
        var out: [String] = []
        if (infant || child) && (high || corrosive) {
            out.append("家有小孩：这件外观可能被当成饮料。请上锁或放到够不到的高处，保持原瓶原标。")
        }
        if petCat && (names.contains("菊酯") || names.contains("pyrethroid") || names.contains("酚") || names.contains("phenol")) {
            out.append("家有猫：酚类 / 拟除虫菊酯对猫特异性高毒。使用后隔离通风，优先换宠物专用配方。")
        }
        if (pregnant || tryingConceive) && (high || corrosive) {
            out.append("家有孕妇/备孕：避免在密闭卫生间使用强挥发清洁剂，用完开窗。")
        }
        if asthma && (names.contains("喷雾") || hazards.contains("inhal")) {
            out.append("家有哮喘：喷雾/挥发物先开窗，人离开房间再使用。")
        }
        if elderly && (high || corrosive) {
            out.append("家有老人：原瓶原标、不要倒进饮料瓶；误食立即打 120，并带上包装。")
        }
        return out
    }
}

struct KnowledgeItem: Identifiable {
    var id: String
    var title: String
    var body: String
    var tags: [String]
}

enum DailyKnowledge {
    static let items: [KnowledgeItem] = [
        .init(id: "mix-84-toilet", title: "84 + 洁厕灵 = 氯气", body: "含氯消毒液遇上酸性洁厕剂会放氯气。马桶是这两瓶最容易先后相遇的地方。分开存放，绝不同时倒。", tags: ["mix"]),
        .init(id: "cat-pyrethroid", title: "猫对氯菊酯特别敏感", body: "猫缺少代谢拟除虫菊酯的酶。普通杀虫喷雾对猫可致中毒。家有猫请选宠物专用配方。", tags: ["petCat"]),
        .init(id: "cat-phenol", title: "酚类消毒剂伤猫", body: "来苏水等酚类对猫高毒。家有猫避免酚类，改宠物可接触的消毒方式。", tags: ["petCat"]),
        .init(id: "child-lookalike", title: "疏通剂长得像饮料", body: "彩色瓶子、甜味香精，是儿童误食高发组合。高危品上锁或放到够不到的高处。", tags: ["infant", "child"]),
        .init(id: "pregnant-volatile", title: "孕期少用密闭卫生间的强挥发剂", body: "洁厕灵、油烟净在小空间浓度高。孕期/备孕时开窗再用。", tags: ["pregnant"]),
        .init(id: "mix-bleach-ammonia", title: "含氯不要碰含氨", body: "84 遇上氨水/部分玻璃水会生成氯胺，刺激眼鼻。", tags: ["mix"]),
        .init(id: "lye-acid", title: "强碱疏通剂不要再倒酸", body: "管道疏通剂再倒洁厕灵会剧烈放热溅射。堵了先用物理方法。", tags: ["mix"]),
        .init(id: "original-bottle", title: "不要倒进饮料瓶", body: "标签是安全系统的一部分。倒进矿泉水瓶，误食风险陡增。", tags: ["elderly", "child"]),
        .init(id: "asthma-aerosol", title: "哮喘遇上喷雾", body: "空气清新剂、杀虫气雾剂会诱发喘息。先开窗、人离开再喷。", tags: ["asthma"]),
        .init(id: "unknown-not-safe", title: "暂无法判断 ≠ 安全", body: "拍不清时瓶安会说「暂无法判断」。这不是绿灯。确认前按危险品存放。", tags: []),
    ]

    static func pick(profile: HouseholdProfile, date: Date = Date()) -> KnowledgeItem {
        let day = Int(date.timeIntervalSince1970 / 86400)
        var weighted: [KnowledgeItem] = []
        for item in items {
            var w = 1
            if item.tags.contains("petCat") && profile.petCat { w += 3 }
            if item.tags.contains("child") && (profile.child || profile.infant) { w += 3 }
            if item.tags.contains("infant") && profile.infant { w += 3 }
            if item.tags.contains("pregnant") && (profile.pregnant || profile.tryingConceive) { w += 3 }
            if item.tags.contains("asthma") && profile.asthma { w += 3 }
            if item.tags.contains("elderly") && profile.elderly { w += 2 }
            for _ in 0..<w { weighted.append(item) }
        }
        return weighted[abs(day) % max(weighted.count, 1)]
    }
}
