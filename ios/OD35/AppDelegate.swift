import UIKit
import UserNotifications

/// Regelt de pushmeldingen: het apparaatnummer (token) ophalen bij Apple en
/// meldingen tonen of openen.
final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {

    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        // Al eerder toestemming gegeven? Dan het token meteen (opnieuw) ophalen.
        UNUserNotificationCenter.current().getNotificationSettings { instellingen in
            if instellingen.authorizationStatus == .authorized {
                DispatchQueue.main.async { application.registerForRemoteNotifications() }
            }
        }
        return true
    }

    func application(_ application: UIApplication,
                     didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        let token = deviceToken.map { String(format: "%02x", $0) }.joined()
        Task { @MainActor in AppState.shared.zetPushToken(token) }
    }

    func application(_ application: UIApplication,
                     didFailToRegisterForRemoteNotificationsWithError error: Error) {
        print("Pushmeldingen niet beschikbaar: \(error.localizedDescription)")
    }

    /// Melding terwijl de app open is: gewoon bovenin tonen.
    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .list, .sound])
    }

    /// Melding aangetikt: open het tabblad dat in de melding staat.
    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                didReceive response: UNNotificationResponse,
                                withCompletionHandler completionHandler: @escaping () -> Void) {
        if let tab = response.notification.request.content.userInfo["tab"] as? String {
            Task { @MainActor in AppState.shared.openTab(tab) }
        }
        completionHandler()
    }
}
