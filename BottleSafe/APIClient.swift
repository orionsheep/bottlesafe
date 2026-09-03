import Foundation
import UIKit

struct APIError: LocalizedError {
    var message: String
    var errorDescription: String? { message }
}

final class APIClient {
    var baseURL: URL

    init(baseURL: URL) {
        self.baseURL = baseURL
    }

    func updateBase(_ url: URL) {
        baseURL = url
    }

    func status() async throws -> BackendStatus {
        try await get("/api/status")
    }

    func analyze(jpeg: Data, filename: String = "bottle.jpg", context: [String: Bool] = [:]) async throws -> AnalyzeResponse {
        var req = URLRequest(url: baseURL.appending(path: "/api/analyze"))
        req.httpMethod = "POST"
        req.timeoutInterval = 180
        let boundary = "Boundary-\(UUID().uuidString)"
        req.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        var body = Data()
        body.append(contentsOf: Data("--\(boundary)\r\n".utf8))
        body.append(contentsOf: Data("Content-Disposition: form-data; name=\"image\"; filename=\"\(filename)\"\r\n".utf8))
        body.append(contentsOf: Data("Content-Type: image/jpeg\r\n\r\n".utf8))
        body.append(jpeg)
        body.append(contentsOf: Data("\r\n".utf8))
        if let ctx = try? JSONSerialization.data(withJSONObject: context),
           let ctxStr = String(data: ctx, encoding: .utf8) {
            body.append(contentsOf: Data("--\(boundary)\r\n".utf8))
            body.append(contentsOf: Data("Content-Disposition: form-data; name=\"context\"\r\n\r\n".utf8))
            body.append(contentsOf: Data("\(ctxStr)\r\n".utf8))
        }
        body.append(contentsOf: Data("--\(boundary)--\r\n".utf8))
        req.httpBody = body
        return try await decode(req)
    }

    /// 存档，返回后端分配的物品 id（用于后续补打位置）。
    @discardableResult
    func saveItem(analysis: ChemicalAnalysis, imagePath: String?, location: String? = nil) async throws -> Int {
        struct Body: Codable { var analysis: ChemicalAnalysis; var image_path: String?; var location: String? }
        struct OK: Codable { var id: Int }
        let ok: OK = try await post("/api/household/items", body: Body(analysis: analysis, image_path: imagePath, location: location))
        return ok.id
    }

    /// 更新物品存放位置；传 nil 表示清除。显式编码 null，后端才能区分「清除」与「未提供」。
    func patchLocation(id: Int, location: String?) async throws {
        var req = URLRequest(url: baseURL.appending(path: "/api/household/items/\(id)"))
        req.httpMethod = "PATCH"
        req.timeoutInterval = 30
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONSerialization.data(withJSONObject: ["location": location as Any])
        _ = try await send(req)
    }

    func feedbackStats() async throws -> FeedbackStats {
        try await get("/api/feedback/stats")
    }

    func householdItems() async throws -> [HouseholdItem] {
        struct Wrap: Codable { var items: [HouseholdItem] }
        let wrap: Wrap = try await get("/api/household/items")
        return wrap.items
    }

    func deleteItem(id: Int) async throws {
        var req = URLRequest(url: baseURL.appending(path: "/api/household/items/\(id)"))
        req.httpMethod = "DELETE"
        req.timeoutInterval = 30
        _ = try await send(req)
    }

    func mix(a: MixRequestItem, b: MixRequestItem) async throws -> MixResponse {
        struct Body: Codable { var items: [MixRequestItem] }
        return try await post("/api/mix", body: Body(items: [a, b]))
    }

    func generateReport() async throws -> HomeReport {
        struct Empty: Codable {}
        return try await post("/api/household/report", body: Empty())
    }

    func timeline() async throws -> TimelinePayload {
        try await get("/api/household/timeline")
    }

    func ask(question: String, history: [AskTurn], context: [String: JSONValue]) async throws -> AskResponse {
        struct Body: Codable {
            var question: String
            var mode: String
            var history: [AskTurn]
            var context: [String: JSONValue]
        }
        return try await post("/api/ask", body: Body(question: question, mode: "auto", history: history, context: context), timeout: 180)
    }

    func submitFeedback(rating: String, comment: String, audience: String, page: String) async throws {
        struct Body: Codable {
            var rating: String
            var comment: String
            var audience: String
            var page: String
        }
        struct OK: Codable { var ok: Bool? }
        let _: OK = try await post("/api/feedback", body: Body(rating: rating, comment: comment, audience: audience, page: page))
    }

    func imageURL(_ path: String?) -> URL? {
        guard let path, !path.isEmpty else { return nil }
        if path.hasPrefix("http") { return URL(string: path) }
        return baseURL.appending(path: "/" + path.trimmingCharacters(in: CharacterSet(charactersIn: "/")))
    }

    private func get<T: Decodable>(_ path: String) async throws -> T {
        var req = URLRequest(url: baseURL.appending(path: path))
        req.timeoutInterval = 20
        return try await decode(req)
    }

    private func post<T: Decodable, B: Encodable>(_ path: String, body: B, timeout: TimeInterval = 60) async throws -> T {
        var req = URLRequest(url: baseURL.appending(path: path))
        req.httpMethod = "POST"
        req.timeoutInterval = timeout
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONEncoder().encode(body)
        return try await decode(req)
    }

    private func decode<T: Decodable>(_ req: URLRequest) async throws -> T {
        let (data, _) = try await send(req)
        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            throw APIError(message: Self.detail(from: data) ?? "返回数据无法解析")
        }
    }

    private func send(_ req: URLRequest) async throws -> (Data, HTTPURLResponse) {
        let (data, resp) = try await URLSession.shared.data(for: req)
        guard let http = resp as? HTTPURLResponse else {
            throw APIError(message: "网络响应异常")
        }
        if (200..<300).contains(http.statusCode) {
            return (data, http)
        }
        throw APIError(message: Self.detail(from: data) ?? "HTTP \(http.statusCode)")
    }

    private static func detail(from data: Data) -> String? {
        guard let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
        if let detail = obj["detail"] as? String { return detail }
        if let detail = obj["detail"] as? [[String: Any]] {
            let msg = detail.compactMap { $0["msg"] as? String }.joined(separator: "；")
            return msg.isEmpty ? nil : msg
        }
        return nil
    }
}

enum ImagePrep {
    static func jpegData(from image: UIImage, quality: CGFloat = 0.86) -> Data? {
        let maxEdge: CGFloat = 1600
        let size = image.size
        let longest = max(size.width, size.height)
        let scaled: UIImage
        if longest > maxEdge {
            let r = maxEdge / longest
            let newSize = CGSize(width: size.width * r, height: size.height * r)
            let renderer = UIGraphicsImageRenderer(size: newSize)
            scaled = renderer.image { _ in image.draw(in: CGRect(origin: .zero, size: newSize)) }
        } else {
            scaled = image
        }
        return scaled.jpegData(compressionQuality: quality)
    }
}
