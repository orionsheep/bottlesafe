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
}

enum RiskLevel: String, Codable, Sendable {
    case unknown, low, medium, high, critical

    var label: String {
        switch self {
        case .unknown: "未知"
        case .low: "低危"
        case .medium: "中危"
        case .high: "高危"
        case .critical: "危急"
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
}
