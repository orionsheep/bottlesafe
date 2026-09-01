import SwiftUI

@main
struct BottleSafeApp: App {
    @State private var appState = AppState()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(appState)
                .preferredColorScheme(.light)
                .tint(Theme.green)
        }
    }
}
