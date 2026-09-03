import SwiftUI

enum Theme {
    /// 正文/标题：深墨绿，浅底上保持高对比。
    static let ink = Color(red: 0.07, green: 0.14, blue: 0.11)
    static let cream = Color(red: 0.94, green: 0.93, blue: 0.90)
    static let paper = Color(red: 0.99, green: 0.98, blue: 0.95)
    static let green = Color(red: 0.22, green: 0.45, blue: 0.28)
    static let coral = Color(red: 0.72, green: 0.28, blue: 0.16)
    static let amber = Color(red: 0.62, green: 0.42, blue: 0.08)
    /// 辅助说明：比正文浅，但仍需在米色底上可读。
    static let muted = Color(red: 0.28, green: 0.32, blue: 0.28)
    /// 危急档评分环：比珊瑚更深一档的红。
    static let deepRed = Color(red: 0.55, green: 0.12, blue: 0.10)
}

enum RiskLevel: String, Codable, Sendable {
    case unknown, low, medium, high, critical

    var label: String {
        switch self {
        case .unknown: "暂无法判断"
        case .low: "低危"
        case .medium: "中危"
        case .high: "高危"
        case .critical: "危急"
        }
    }

    /// 识别结果主标，对齐手机 Web `RISK_BAND`。
    var bandLabel: String {
        switch self {
        case .unknown: "暂无法判断"
        case .low: "暂无明显关注"
        case .medium: "建议留意"
        case .high: "建议重点关注"
        case .critical: "建议优先处理"
        }
    }

    var tint: Color {
        switch self {
        case .unknown: Theme.muted
        case .low: Theme.green
        case .medium: Theme.amber
        case .high, .critical: Theme.coral
        }
    }

    /// 安全评分（0-100），与手机 Web `riskScore` 对齐；未知给中间分，不是绿灯。
    var safetyScore: Int {
        switch self {
        case .unknown: 50
        case .low: 88
        case .medium: 68
        case .high: 40
        case .critical: 15
        }
    }

    /// 评分环用五档色（危急比高危更深）。
    var scoreTint: Color {
        switch self {
        case .unknown: Theme.muted
        case .low: Theme.green
        case .medium: Theme.amber
        case .high: Theme.coral
        case .critical: Theme.deepRed
        }
    }
}
