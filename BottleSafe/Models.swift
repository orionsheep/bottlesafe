import Foundation

struct BackendStatus: Codable, Sendable {
    var status: String
    var detail: String
    var household_id: String?
}

struct ProductInfo: Codable, Sendable, Hashable {
    var name: String?
    var brand: String?
    var category: String?
    var barcode: String?
    var manufacturer: String?
}

struct HazardItem: Codable, Sendable, Hashable {
    var type: String
    var severity: String
    var evidence: String
    var confidence: Double?
}

struct IngredientItem: Codable, Sendable, Hashable {
    var name: String
    var source: String?
    var confidence: Double?
}

struct FirstAid: Codable, Sendable, Hashable {
    var ingestion: String?
    var inhalation: String?
    var eye_contact: String?
    var skin_contact: String?
}

struct ChemicalAnalysis: Codable, Sendable, Hashable {
    var product: ProductInfo
    var visual_evidence: [String]
    var hazards: [HazardItem]
    var ingredients: [IngredientItem]
    var signal_words: [String]
    var safe_storage: [String]
    var do_not_mix_with: [String]
    var first_aid: FirstAid
    var uncertainties: [String]
    var needs_more_images: [String]
    var risk_level: String
    var summary: String

    var risk: RiskLevel { RiskLevel(rawValue: risk_level) ?? .unknown }
    var displayName: String { product.name?.nilIfEmpty ?? "未命名产品" }
}

/// 规则引擎判定结果，字段全部容错：后端缺任何字段都不崩。
struct RuleFinding: Codable, Sendable, Hashable, Identifiable {
    var rule_id: String?
    var severity: String?
    var title: String?
    var reason: String?
    var action: String?

    var id: String { rule_id ?? "\(title ?? "")-\(severity ?? "")" }
    var risk: RiskLevel { RiskLevel(rawValue: severity ?? "") ?? .unknown }
}

struct RulesResult: Codable, Sendable, Hashable {
    var risk_level: String?
    var findings: [RuleFinding]?
    var ingredient_labels: [String]?
    var engine: String?
    var rule_version: String?

    var risk: RiskLevel { RiskLevel(rawValue: risk_level ?? "") ?? .unknown }
}

/// 证据溯源条目（标准/法规条款）。
struct EvidenceItem: Codable, Sendable, Hashable, Identifiable {
    var id: String?
    var title: String?
    var standard_no: String?
    var source_level: String?
    var source_level_label: String?
    var clause: String?
    var summary: String?
    var note: String?
    var effective_from: String?
    var effective_to: String?
    var next_effective_from: String?
    var url: String?

    var displayTitle: String {
        [title, standard_no].compactMap { $0?.nilIfEmpty }.joined(separator: " ").nilIfEmpty ?? "未命名证据"
    }

    var effectiveText: String? {
        let from = effective_from?.nilIfEmpty
        let to = effective_to?.nilIfEmpty
        switch (from, to) {
        case let (f?, t?): return "\(f) 至 \(t)"
        case let (f?, nil): return "\(f) 起生效"
        case let (nil, t?): return "有效至 \(t)"
        default: return nil
        }
    }

    var nextEffectiveText: String? {
        next_effective_from?.nilIfEmpty.map { "新标准 \($0) 生效" }
    }
}

/// 六维评分之一维。polarity=risk：分高=危险（珊瑚色）；polarity=safe：分高=好（绿）。
struct DimensionScore: Codable, Sendable, Hashable, Identifiable {
    var key: String?
    var label: String?
    var score: Double?
    var polarity: String?

    var id: String { key ?? label ?? UUID().uuidString }
    var displayLabel: String { label?.nilIfEmpty ?? key?.nilIfEmpty ?? "维度" }
    var clampedScore: Double { min(max(score ?? 0, 0), 100) }
    var isRiskPolarity: Bool { polarity != "safe" }
}

/// 知识库覆盖度说明，note 原文展示。
struct Coverage: Codable, Sendable, Hashable {
    var matched: Int?
    var total: Int?
    var note: String?
}

/// 重点成分警示。
struct IngredientWarning: Codable, Sendable, Hashable, Identifiable {
    var name: String?
    var tag: String?
    var text: String?
    var severity: String?

    var id: String { "\(name ?? "")-\(tag ?? "")-\(severity ?? "")" }

    var rank: Int {
        switch severity {
        case "critical": 3
        case "high": 2
        case "medium": 1
        default: 0
        }
    }
}

enum WarningCopy {
    static func title(for warnings: [IngredientWarning]) -> String {
        let top = warnings.map(\.rank).max() ?? 0
        switch top {
        case 3: return "严重成分警示"
        case 2: return "高风险成分警示"
        case 1: return "成分注意提示"
        default: return "成分温和提示"
        }
    }
}

struct AnalyzeResponse: Codable, Sendable {
    var analysis: ChemicalAnalysis
    var database_match: [String: JSONValue]?
    var image_path: String
    var rules: RulesResult?
    var evidence: [EvidenceItem]?
    var expiring_standards: [EvidenceItem]?
    var cross_risks: [CrossRisk]?
    var dimension_scores: [DimensionScore]?
    var coverage: Coverage?
    var ingredient_warnings: [IngredientWarning]?
    var disposal: ScanDisposal? = nil

    static let contrastFixture = AnalyzeResponse(
        analysis: ChemicalAnalysis(
            product: ProductInfo(name: "和其正凉茶", brand: "和其正", category: "饮料", barcode: nil, manufacturer: nil),
            visual_evidence: ["红色瓶身", "植物饮料"],
            hazards: [],
            ingredients: [IngredientItem(name: "水", source: "标签", confidence: 0.9)],
            signal_words: [],
            safe_storage: ["常温避光"],
            do_not_mix_with: [],
            first_aid: FirstAid(ingestion: nil, inhalation: nil, eye_contact: nil, skin_contact: nil),
            uncertainties: ["完整成分表未拍摄"],
            needs_more_images: [],
            risk_level: "unknown",
            summary: "和其正凉茶是一种植物饮料。根据标签信息，其净含量为1L。该产品为饮料，通常不具有高风险化学品特性，但具体成分和潜在风险需参考完整标签或产品说明书。"
        ),
        database_match: nil,
        image_path: ""
    )
}

/// 问答助手多轮对话。
struct AskTurn: Codable, Sendable, Hashable {
    var role: String
    var content: String
}

struct AskResponse: Codable, Sendable {
    var answer: String
    var graph: [String: JSONValue]?
    var related_items: [JSONValue]?

    var factLines: [String] { graph?["facts"]?.stringArray ?? [] }

    var relatedLines: [String] {
        (related_items ?? []).compactMap { value in
            guard let obj = value.objectValue else { return nil }
            let name = obj["name"]?.stringValue ?? "?"
            if let id = obj["id"]?.intValue { return "#\(id) \(name)" }
            return name
        }
    }
}

/// 单瓶识别的绿色处置（与报告级 DisposalInfo 不同）。
struct ScanDisposal: Codable, Sendable, Hashable {
    var category: String?
    var drain_safe: String?
    var drain_safe_text: String?
    var disposal_route: String?
    var container: String?
    var eco_tip: String?
    var hazardous_waste: Bool?
    var matched: Bool?
}

struct HomeReport: Codable, Sendable {
    var overall_risk: String?
    var overall_text: String?
    var n_items: Int?
    var overview: String?
    var top_actions: [String]?
    var quick_wins: [String]?
    var reassure: String?
    var disclaimer: String?
    var cross_risks: [CrossRisk]?
    var high_items: [HighItem]?
    var risk_count: [String: Int]?
    var radar: [RadarDim]?
    var ingredient_groups: [IngredientGroup]?
    var suggestions: [ReportSuggestion]?
    var disposal: DisposalInfo?
    var prev_risk: String?

    var overallRisk: RiskLevel { RiskLevel(rawValue: overall_risk ?? "") ?? .unknown }
}

/// 五维雷达图的一个轴（value 0-1）。
struct RadarDim: Codable, Sendable, Hashable {
    var dim: String?
    var value: Double?

    var label: String { dim?.nilIfEmpty ?? "维度" }
    var clamped: Double { min(max(value ?? 0, 0), 1) }
}

/// 高频成分分组。
struct IngredientGroup: Codable, Sendable, Hashable, Identifiable {
    var key: String?
    var label: String?
    var count: Int?
    var items: [GroupItem]?
    var hook: String?

    var id: String { key ?? label ?? UUID().uuidString }

    struct GroupItem: Codable, Sendable, Hashable {
        var id: Int?
        var name: String?
    }
}

/// 优化建议。
struct ReportSuggestion: Codable, Sendable, Hashable, Identifiable {
    var kind: String?
    var title: String?
    var detail: String?
    var action: String?

    var id: String { "\(kind ?? "")-\(title ?? "")" }
}

/// 处置建议。
struct DisposalInfo: Codable, Sendable, Hashable {
    var hazardous_count: Int?
    var hazardous_items: [DisposalItem]?
    var no_drain_items: [DisposalItem]?
    var eco_tips: [String]?
    var green_note: String?

    struct DisposalItem: Codable, Sendable, Hashable, Identifiable {
        var id: Int?
        var name: String?
        var category: String?
        var route: String?
    }
}

struct FeedbackStats: Codable, Sendable {
    var total: Int?
    var up: Int?
    var down: Int?
    var recent: [FeedbackEntry]?

    struct FeedbackEntry: Codable, Sendable, Hashable {
        var rating: String?
        var comment: String?
        var audience: String?
        var page: String?
        var created_at: String?
    }
}

struct HighItem: Codable, Sendable, Identifiable, Hashable {
    var id: Int
    var name: String
    var risk_level: String?
    var why: String?
}

struct TimelinePayload: Codable, Sendable {
    var checkins: [Checkin]
    var reminders: [String]?
    var n_items: Int?
}

struct Checkin: Codable, Sendable, Identifiable, Hashable {
    var id: Int
    var created_at: String
    var overall_risk: String
    var item_count: Int
    var trend: String?
    var n_pairs: Int?
    var item_delta: Int?
}

enum JSONValue: Codable, Sendable, Hashable {
    case string(String)
    case number(Double)
    case bool(Bool)
    case object([String: JSONValue])
    case array([JSONValue])
    case null

    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null; return }
        if let v = try? c.decode(Bool.self) { self = .bool(v); return }
        if let v = try? c.decode(Double.self) { self = .number(v); return }
        if let v = try? c.decode(String.self) { self = .string(v); return }
        if let v = try? c.decode([String: JSONValue].self) { self = .object(v); return }
        if let v = try? c.decode([JSONValue].self) { self = .array(v); return }
        self = .null
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .string(let v): try c.encode(v)
        case .number(let v): try c.encode(v)
        case .bool(let v): try c.encode(v)
        case .object(let v): try c.encode(v)
        case .array(let v): try c.encode(v)
        case .null: try c.encodeNil()
        }
    }

    var stringValue: String? {
        if case .string(let s) = self { return s }
        if case .number(let n) = self { return String(Int(n)) }
        return nil
    }

    var intValue: Int? {
        if case .number(let n) = self { return Int(n) }
        if case .string(let s) = self { return Int(s) }
        return nil
    }

    var objectValue: [String: JSONValue]? {
        if case .object(let o) = self { return o }
        return nil
    }

    var stringArray: [String] {
        guard case .array(let arr) = self else { return [] }
        return arr.compactMap(\.stringValue)
    }
}

struct HouseholdItem: Codable, Sendable, Identifiable, Hashable {
    var id: Int
    var observed_name: String?
    var image_path: String?
    var created_at: String?
    var location: String?
    var analysis: ChemicalAnalysis?

    var displayName: String {
        analysis?.displayName ?? observed_name?.nilIfEmpty ?? "未命名"
    }
}

struct MixRequestItem: Codable, Sendable {
    var analysis: ChemicalAnalysis
    var name: String?
    var image_path: String?
    var location: String?
}

/// 预设存放位置。
enum StorageLocations {
    static let presets = ["厨房", "卫生间", "浴室", "阳台", "客厅", "卧室", "储物间", "车库", "冰箱旁", "儿童可触及处"]
}

struct MixMatched: Codable, Sendable, Hashable {
    var id: String
    var name: String
}

struct MixItemOut: Codable, Sendable, Hashable {
    var id: Int
    var name: String
    var risk_level: String?
    var image_path: String?
    var matched: [MixMatched]?
    var unknown: Bool?
}

struct CrossRisk: Codable, Sendable, Hashable {
    var a: String
    var b: String
    var reason: String
    var severity: String
    var action: String?
    var rule_id: String?
    var source: String?
    var same_location: Bool?
    var location: String?

    var risk: RiskLevel { RiskLevel(rawValue: severity) ?? .unknown }
    /// source 缺省按规则库处理，保守展示。
    var isLLM: Bool { source == "llm" }
}

struct MixResponse: Codable, Sendable {
    var n_items: Int?
    var items: [MixItemOut]
    var cross_risks: [CrossRisk]
    var has_critical: Bool?
    var verdict: String?
    var unknown_names: [String]?
    var llm_used: Bool?
    var verdict_source: String?

    var kind: MixVerdict {
        MixVerdict(rawValue: verdict ?? "") ?? (has_critical == true ? .danger : .noEdge)
    }

    var isLLMVerdict: Bool { verdict_source == "llm" || llm_used == true }
}

enum MixVerdict: String, Sendable {
    case danger
    case caution
    case unknown
    case noEdge = "no_edge"
}

struct MixCandidate: Identifiable, Hashable, Sendable {
    var id: String
    var name: String
    var riskLevel: String
    var imagePath: String?
    var localJPEG: Data?
    var location: String?
    var analysis: ChemicalAnalysis
}

struct HazardGuide: Identifiable {
    var id: String
    var name: String
    var room: String
    var risk: String
    var note: String
    var image: String
}

extension String {
    var nilIfEmpty: String? {
        let t = trimmingCharacters(in: .whitespacesAndNewlines)
        return t.isEmpty ? nil : t
    }
}

extension Array {
    var nilIfEmpty: [Element]? { isEmpty ? nil : self }
}
