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
    var selectedTab: AppTab = .guide

    let client: APIClient

    init() {
        let stored = UserDefaults.standard.string(forKey: "apiBase")
        let initial = stored?.nilIfEmpty ?? "http://127.0.0.1:8000"
        apiBaseString = initial
        client = APIClient(baseURL: URL(string: initial) ?? URL(string: "http://127.0.0.1:8000")!)
        loadDrafts()
    }

    var apiURL: URL {
        URL(string: apiBaseString.trimmingCharacters(in: .whitespacesAndNewlines))
            ?? URL(string: "http://127.0.0.1:8000")!
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
    }

    func persistDrafts() {
        struct Disk: Codable {
            var id: String
            var name: String
            var riskLevel: String
            var imagePath: String?
            var analysis: ChemicalAnalysis
        }
        let payload = drafts.map { Disk(id: $0.id, name: $0.name, riskLevel: $0.riskLevel, imagePath: $0.imagePath, analysis: $0.analysis) }
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
            var analysis: ChemicalAnalysis
        }
        guard let data = UserDefaults.standard.data(forKey: "mixDrafts"),
              let payload = try? JSONDecoder().decode([Disk].self, from: data) else { return }
        drafts = payload.map {
            MixCandidate(id: $0.id, name: $0.name, riskLevel: $0.riskLevel, imagePath: $0.imagePath, localJPEG: nil, analysis: $0.analysis)
        }
    }
}

enum AppTab: Hashable {
    case guide, scan, mix, archive
}
