import SwiftUI
import WebKit
@preconcurrency import UserNotifications

/// Gedeelde toestand van de app: de webview, het slot, pushmeldingen en de
/// eenmalige vragen na het inloggen.
@MainActor
final class AppState: ObservableObject {
    static let shared = AppState()

    @Published var isVergrendeld = AppLock.aan
    @Published var laadFout: String?
    @Published var vraagFaceID = false

    weak var webView: WKWebView?
    private(set) var ingelogdEmail: String?
    private var pushToken: String?
    private var paginaKlaar = false
    private var wachtendTab: String?

    // MARK: - Berichten naar de website

    /// Stuurt een bericht naar de site (window.od35App.ontvang).
    func stuurNaarWeb(_ bericht: [String: Any]) {
        guard let webView,
              let data = try? JSONSerialization.data(withJSONObject: bericht),
              let json = String(data: data, encoding: .utf8) else { return }
        webView.evaluateJavaScript("window.od35App && window.od35App.ontvang(\(json));", completionHandler: nil)
    }

    func toonMelding(_ tekst: String) {
        stuurNaarWeb(["type": "melding", "tekst": tekst])
    }

    // MARK: - Levenscyclus van de pagina

    func paginaGeladen() {
        paginaKlaar = true
        laadFout = nil
    }

    func paginaVerlaten() {
        paginaKlaar = false
    }

    /// De site meldt dat iemand is ingelogd en de ledenlijst is geladen.
    func ingelogd(email: String) {
        ingelogdEmail = email
        if let pushToken { stuurPushTokenNaarWeb(pushToken) }
        if let tab = wachtendTab { wachtendTab = nil; openTab(tab) }
        // Eenmalig na de eerste keer inloggen: eerst Face ID voorstellen, daarna pushmeldingen.
        if !AppLock.gevraagd && AppLock.beschikbaar {
            vraagFaceID = true
        } else {
            vraagPushToestemming()
        }
    }

    func uitgelogd() {
        ingelogdEmail = nil
    }

    /// Antwoord op de eenmalige Face ID-vraag.
    func faceIDKeuze(_ aan: Bool) {
        AppLock.gevraagd = true
        AppLock.aan = aan
        vraagFaceID = false
        if aan { toonMelding("Face ID-slot staat aan. Uitzetten kan via Instellingen → Oude Delft 35.") }
        vraagPushToestemming()
    }

    // MARK: - Pushmeldingen

    func vraagPushToestemming() {
        UNUserNotificationCenter.current().getNotificationSettings { instellingen in
            switch instellingen.authorizationStatus {
            case .notDetermined:
                UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { toegestaan, _ in
                    if toegestaan {
                        DispatchQueue.main.async { UIApplication.shared.registerForRemoteNotifications() }
                    }
                }
            case .authorized, .provisional, .ephemeral:
                DispatchQueue.main.async { UIApplication.shared.registerForRemoteNotifications() }
            default:
                break
            }
        }
    }

    func zetPushToken(_ token: String) {
        pushToken = token
        if ingelogdEmail != nil { stuurPushTokenNaarWeb(token) }
    }

    private func stuurPushTokenNaarWeb(_ token: String) {
        stuurNaarWeb(["type": "pushToken", "token": token, "omgeving": Config.pushOmgeving])
    }

    /// Een aangetikte pushmelding opent het juiste tabblad (bv. "huisauto").
    func openTab(_ tab: String) {
        guard paginaKlaar, ingelogdEmail != nil else { wachtendTab = tab; return }
        stuurNaarWeb(["type": "openTab", "tab": tab])
    }
}
