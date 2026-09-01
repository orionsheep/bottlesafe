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

struct AnalyzeResponse: Codable, Sendable {
    var analysis: ChemicalAnalysis
    var database_match: [String: JSONValue]?
    var image_path: String

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
}

struct HouseholdItem: Codable, Sendable, Identifiable, Hashable {
    var id: Int
    var observed_name: String?
    var image_path: String?
    var created_at: String?
    var analysis: ChemicalAnalysis?

    var displayName: String {
        analysis?.displayName ?? observed_name?.nilIfEmpty ?? "未命名"
    }
}

struct MixRequestItem: Codable, Sendable {
    var analysis: ChemicalAnalysis
    var name: String?
    var image_path: String?
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
}

struct MixResponse: Codable, Sendable {
    var n_items: Int?
    var items: [MixItemOut]
    var cross_risks: [CrossRisk]
    var has_critical: Bool?
    var verdict: String?
    var unknown_names: [String]?

    var kind: MixVerdict {
        MixVerdict(rawValue: verdict ?? "") ?? (has_critical == true ? .danger : .noEdge)
    }
}

enum MixVerdict: String, Sendable {
    case danger
    case unknown
    case noEdge = "no_edge"
}

struct MixCandidate: Identifiable, Hashable, Sendable {
    var id: String
    var name: String
    var riskLevel: String
    var imagePath: String?
    var localJPEG: Data?
    var analysis: ChemicalAnalysis
}

struct HazardGuide: Identifiable {
    var id: String
    var name: String
    var room: String
    var risk: String
    var note: String
}

extension String {
    var nilIfEmpty: String? {
        let t = trimmingCharacters(in: .whitespacesAndNewlines)
        return t.isEmpty ? nil : t
    }
}
