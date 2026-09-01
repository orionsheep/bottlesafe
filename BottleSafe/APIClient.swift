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

    func analyze(jpeg: Data, filename: String = "bottle.jpg") async throws -> AnalyzeResponse {
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
        body.append(contentsOf: Data("\r\n--\(boundary)--\r\n".utf8))
        req.httpBody = body
        return try await decode(req)
    }

    func saveItem(analysis: ChemicalAnalysis, imagePath: String?) async throws {
        struct Body: Codable { var analysis: ChemicalAnalysis; var image_path: String? }
        struct OK: Codable { var id: Int }
        let _: OK = try await post("/api/household/items", body: Body(analysis: analysis, image_path: imagePath))
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

    private func post<T: Decodable, B: Encodable>(_ path: String, body: B) async throws -> T {
        var req = URLRequest(url: baseURL.appending(path: path))
        req.httpMethod = "POST"
        req.timeoutInterval = 60
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONEncoder().encode(body)
        return try await decode(req)
    }

    private func decode<T: Decodable>(_ req: URLRequest) async throws -> T {
        let (data, _) = try await send(req)
        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            if let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let detail = obj["detail"] as? String {
                throw APIError(message: detail)
            }
            throw APIError(message: "返回数据无法解析")
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
        if let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let detail = obj["detail"] as? String {
            throw APIError(message: detail)
        }
        throw APIError(message: "HTTP \(http.statusCode)")
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
