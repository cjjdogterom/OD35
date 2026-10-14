import SwiftUI

/// Oude Delft 35 — de website van de oud-huisgenoten als iPhone-app.
/// De site zelf draait in een WKWebView; de app voegt daar Face ID, pushmeldingen,
/// "Zet in mijn contacten" en "Bewaar in fotorol" aan toe (zie NativeBridge).
@main
struct OD35App: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

    var body: some Scene {
        WindowGroup {
            RootView()
        }
    }
}

enum Config {
    static var startURL: URL {
        #if DEBUG
        // Alleen in ontwikkelversies: start met `-startURL http://localhost:…` voor een testpagina.
        if let tekst = UserDefaults.standard.string(forKey: "startURL"), let url = URL(string: tekst) { return url }
        #endif
        return URL(string: "https://www.oudedelft35.nl/")!
    }
    /// Domeinen die in de app zelf openen; al het andere gaat naar een ingebouwde Safari.
    static var eigenHosts: [String] {
        #if DEBUG
        return ["oudedelft35.nl", "oudedelft35.com", "od-35.vercel.app", "localhost"]
        #else
        return ["oudedelft35.nl", "oudedelft35.com", "od-35.vercel.app"]
        #endif
    }
    static var versie: String {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1.0"
    }
    /// Pushmeldingen: Xcode-builds praten met de test-server van Apple, App Store-builds met de echte.
    static var pushOmgeving: String {
        #if DEBUG
        return "sandbox"
        #else
        return "production"
        #endif
    }
    static let papier = UIColor(red: 0xF4 / 255, green: 0xF1 / 255, blue: 0xE8 / 255, alpha: 1)
    static let marine = UIColor(red: 0x2A / 255, green: 0x4D / 255, blue: 0x82 / 255, alpha: 1)

    static func isEigenHost(_ url: URL) -> Bool {
        guard let host = url.host?.lowercased() else { return false }
        return eigenHosts.contains { host == $0 || host.hasSuffix("." + $0) }
    }
}
