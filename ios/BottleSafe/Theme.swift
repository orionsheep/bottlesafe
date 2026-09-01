import SwiftUI

enum Theme {
    static let ink = Color(red: 0.12, green: 0.24, blue: 0.18)
    static let cream = Color(red: 0.95, green: 0.94, blue: 0.92)
    static let paper = Color(red: 1.0, green: 0.99, blue: 0.96)
    static let green = Color(red: 0.44, green: 0.66, blue: 0.38)
    static let coral = Color(red: 0.85, green: 0.42, blue: 0.24)
    static let amber = Color(red: 0.79, green: 0.64, blue: 0.23)
    static let muted = Color(red: 0.42, green: 0.44, blue: 0.40)
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
