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

    /// 模拟器走电脑回环；真机必须走 Mac 局域网 IP，127.0.0.1 是手机自己。
    static let macLANAPIBase = "http://192.168.3.110:8000"
    static let simulatorAPIBase = "http://127.0.0.1:8000"
    static var defaultAPIBase: String {
        #if targetEnvironment(simulator)
        simulatorAPIBase
        #else
        macLANAPIBase
        #endif
    }

    static func resolvedAPIBase(stored: String?) -> String {
        let value = stored?.nilIfEmpty ?? defaultAPIBase
        #if targetEnvironment(simulator)
        return value
        #else
        if value.contains("127.0.0.1") { return macLANAPIBase }
        return value
        #endif
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
