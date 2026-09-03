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

    /// 新增五维画像（健康关注/过敏原/饮食/运动），预设之外允许自定义标签。
    var doctorFlags: [String] = []
    var allergens: [String] = []
    var diet: [String] = []
    var fitness: [String] = []

    /// 这瓶当前怎么放。三态：true / false / 未填(nil)。仅非 nil 才进规则引擎 context。
    var childAccessible: Bool? = nil
    var nearFood: Bool? = nil
    var originalContainer: Bool? = nil

    static let storageKey = "householdProfile"

    /// 自定义解码：旧版本 UserDefaults 数据没有新维度键，decodeIfPresent 兜底兼容。
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        infant = try c.decodeIfPresent(Bool.self, forKey: .infant) ?? false
        child = try c.decodeIfPresent(Bool.self, forKey: .child) ?? false
        elderly = try c.decodeIfPresent(Bool.self, forKey: .elderly) ?? false
        pregnant = try c.decodeIfPresent(Bool.self, forKey: .pregnant) ?? false
        tryingConceive = try c.decodeIfPresent(Bool.self, forKey: .tryingConceive) ?? false
        petCat = try c.decodeIfPresent(Bool.self, forKey: .petCat) ?? false
        petDog = try c.decodeIfPresent(Bool.self, forKey: .petDog) ?? false
        allergy = try c.decodeIfPresent(Bool.self, forKey: .allergy) ?? false
        asthma = try c.decodeIfPresent(Bool.self, forKey: .asthma) ?? false
        hypertension = try c.decodeIfPresent(Bool.self, forKey: .hypertension) ?? false
        doctorFlags = try c.decodeIfPresent([String].self, forKey: .doctorFlags) ?? []
        allergens = try c.decodeIfPresent([String].self, forKey: .allergens) ?? []
        diet = try c.decodeIfPresent([String].self, forKey: .diet) ?? []
        fitness = try c.decodeIfPresent([String].self, forKey: .fitness) ?? []
        childAccessible = try c.decodeIfPresent(Bool.self, forKey: .childAccessible)
        nearFood = try c.decodeIfPresent(Bool.self, forKey: .nearFood)
        originalContainer = try c.decodeIfPresent(Bool.self, forKey: .originalContainer)
    }

    init() {}

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

    /// 规则引擎 context：人群布尔 + 已填的储存三态。新维度（健康/过敏原/饮食/运动）不进 context，
    /// 仅用于本地提示文案与反馈 audience；过敏原列表会合并进 allergy 布尔。
    var apiContext: [String: Bool] {
        var ctx: [String: Bool] = [
            "child": infant || child,
            "infant": infant,
            "elderly": elderly,
            "pregnant": pregnant || tryingConceive,
            "trying_conceive": tryingConceive,
            "pet_cat": petCat,
            "pet_dog": petDog,
            "allergy": allergy || !allergens.isEmpty,
            "asthma": asthma,
            "hypertension": hypertension,
        ]
        if let childAccessible { ctx["child_accessible"] = childAccessible }
        if let nearFood { ctx["near_food"] = nearFood }
        if let originalContainer { ctx["original_container"] = originalContainer }
        return ctx
    }

    var storageFilledCount: Int {
        [childAccessible, nearFood, originalContainer].compactMap { $0 }.count
    }

    /// 问答管家 context：规则布尔 + 健康/过敏原等标签数组。
    var askContext: [String: JSONValue] {
        var out: [String: JSONValue] = [:]
        for (key, value) in apiContext {
            out[key] = .bool(value)
        }
        if !doctorFlags.isEmpty { out["doctor_flags"] = .array(doctorFlags.map { .string($0) }) }
        if !allergens.isEmpty { out["allergens"] = .array(allergens.map { .string($0) }) }
        if !diet.isEmpty { out["diet"] = .array(diet.map { .string($0) }) }
        if !fitness.isEmpty { out["fitness"] = .array(fitness.map { .string($0) }) }
        return out
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
        out.append(contentsOf: doctorFlags)
        out.append(contentsOf: allergens)
        out.append(contentsOf: diet)
        out.append(contentsOf: fitness)
        return out
    }

    /// 已选项总数（10 布尔 + 四维标签）。
    var selectedCount: Int {
        selectedLabels.count
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
        let skinSensitive = allergy || !allergens.isEmpty || doctorFlags.contains { $0.contains("湿疹") || $0.contains("特应性皮炎") }
        let hasFragrance = names.contains("香精") || names.contains("香料") || names.contains("防腐剂")
            || names.contains("fragrance") || names.contains("parfum")
        if skinSensitive && hasFragrance {
            out.append("过敏/皮肤敏感：本品含香精、香料或防腐剂，可能诱发接触性过敏。留意成分表中的香料、MIT/CMIT；先在手臂内侧小面积试用，出现红痒立即停用。")
        }
        return out
    }
}

/// 五维画像的预设标签。
enum ProfileDimensions {
    static let doctorFlags = ["高血压", "糖尿病", "高血脂", "痛风·高尿酸", "脂肪肝", "慢性肾病", "甲状腺疾病", "湿疹·特应性皮炎", "乳糖不耐受", "便秘", "蛀牙", "肠道敏感"]
    static let allergens = ["牛奶·乳糖", "鸡蛋", "花生·坚果", "海鲜", "花粉", "尘螨"]
    static let diet = ["素食", "纯素", "清真", "低糖", "低盐", "低脂", "生酮", "低碳水", "无麸质", "控卡减脂", "高蛋白", "忌辛辣"]
    static let fitness = ["增肌期", "减脂期", "日常健身", "耐力训练", "康复训练", "久坐少动", "备赛·需查兴奋剂"]

    /// 自定义标签上限：每条 ≤12 字，每维 ≤5 个。
    static let customMaxLength = 12
    static let customMaxCount = 5
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
        .init(id: "mothball-candy", title: "萘丸长得像糖果", body: "樟脑丸、萘丸是防蛀化学品，不是零食。放到儿童够不到的地方，也不要和米面同柜。", tags: ["infant", "child"]),
        .init(id: "paint-nursery", title: "未干的涂料房不要放婴儿床", body: "内墙漆会挥发。新刷的房间先通风，干透再让婴幼儿长时间停留。", tags: ["infant", "child", "pregnant"]),
        .init(id: "food-vs-spray", title: "杀虫剂不要和米同柜", body: "食品本身不是化学品。杀虫喷雾、萘丸不要和米面、零食放在同一层。", tags: []),
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
