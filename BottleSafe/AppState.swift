import Foundation
import Observation
import UIKit

@Observable
@MainActor
final class AppState {
    var apiBaseString: String {
        didSet { UserDefaults.standard.set(apiBaseString, forKey: "apiBase") }
    }
    var backend: BackendStatus?
    var backendError: String?
    var drafts: [MixCandidate] = []
    var lastScan: AnalyzeResponse?
    var lastPreview: UIImage?
    var savedLastScan = false
    var pendingMixPrefill = false
    /// 混用不是 Tab，是档案栈上的子页（对齐手机 Web `/m/mix`，tab 高亮在档案）。
    var showMix = false
    var archiveStamp = 0
    var selectedTab: AppTab = .guide
    var profile: HouseholdProfile = .load()
    var tourStep: Int? = nil

    let client: APIClient

    init() {
        let stored = UserDefaults.standard.string(forKey: "apiBase")
        let initial = Self.resolvedAPIBase(stored: stored)
        apiBaseString = initial
        client = APIClient(baseURL: URL(string: initial) ?? URL(string: Self.defaultAPIBase)!)
        loadDrafts()
        let args = ProcessInfo.processInfo.arguments
        if let i = args.firstIndex(of: "-tab"), i + 1 < args.count {
            let raw = args[i + 1]
            if raw == "mix" {
                selectedTab = .archive
                showMix = true
            } else if let tab = AppTab(rawValue: raw) {
                selectedTab = tab
            }
        }
    }

    /// 云服务器后端：模拟器与真机的统一默认地址（任何网络可用）。
    /// 局域网联调时在 App 设置页改回 Mac IP 即可（设置值优先于默认值）。
    static let cloudAPIBase = "http://60.204.231.189:8000"
    static var defaultAPIBase: String { cloudAPIBase }

    static func resolvedAPIBase(stored: String?) -> String {
        guard let value = stored?.nilIfEmpty else { return defaultAPIBase }
        // 旧版本的默认值（本机回环 / Mac 局域网 IP）平滑迁移到云端；用户自定义的其他地址不动
        if value.contains("127.0.0.1") || value.contains("192.168.") { return cloudAPIBase }
        return value
    }

    var apiURL: URL {
        URL(string: apiBaseString.trimmingCharacters(in: .whitespacesAndNewlines))
            ?? URL(string: Self.defaultAPIBase)!
    }

    func applyAPIBase() async {
        client.updateBase(apiURL)
        await ping()
    }

    func ping() async {
        backendError = nil
        do {
            backend = try await client.status()
        } catch {
            backend = nil
            backendError = error.localizedDescription
        }
    }

    func rememberScan(_ response: AnalyzeResponse, jpeg: Data?, preview: UIImage?) {
        lastScan = response
        lastPreview = preview
        savedLastScan = false
        let cand = MixCandidate(
            id: "scan:\(UUID().uuidString)",
            name: response.analysis.displayName,
            riskLevel: response.analysis.risk_level,
            imagePath: response.image_path,
            localJPEG: jpeg,
            analysis: response.analysis
        )
        drafts.removeAll { $0.name == cand.name }
        drafts.insert(cand, at: 0)
        if drafts.count > 8 { drafts = Array(drafts.prefix(8)) }
        persistDrafts()
        pendingMixPrefill = true
    }

    func markSaved() {
        savedLastScan = true
        archiveStamp += 1
    }

    func openMix(prefill: Bool = false) {
        pendingMixPrefill = prefill
        selectedTab = .archive
        showMix = true
    }

    func persistDrafts() {
        struct Disk: Codable {
            var id: String
            var name: String
            var riskLevel: String
            var imagePath: String?
            var location: String?
            var analysis: ChemicalAnalysis
        }
        let payload = drafts.map { Disk(id: $0.id, name: $0.name, riskLevel: $0.riskLevel, imagePath: $0.imagePath, location: $0.location, analysis: $0.analysis) }
        if let data = try? JSONEncoder().encode(payload) {
            UserDefaults.standard.set(data, forKey: "mixDrafts")
        }
    }

    func loadDrafts() {
        struct Disk: Codable {
            var id: String
            var name: String
            var riskLevel: String
            var imagePath: String?
            var location: String?
            var analysis: ChemicalAnalysis
        }
        guard let data = UserDefaults.standard.data(forKey: "mixDrafts"),
              let payload = try? JSONDecoder().decode([Disk].self, from: data) else { return }
        drafts = payload.map {
            MixCandidate(id: $0.id, name: $0.name, riskLevel: $0.riskLevel, imagePath: $0.imagePath, localJPEG: nil, location: $0.location, analysis: $0.analysis)
        }
    }
}

enum AppTab: String, Hashable {
    case guide, scan, assistant, archive, me
}
