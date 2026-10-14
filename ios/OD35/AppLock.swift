import LocalAuthentication

/// Face ID-slot. Aan/uit staat in UserDefaults onder "faceIdSlot", dezelfde sleutel
/// als de schakelaar in Instellingen → Oude Delft 35 (Settings.bundle).
enum AppLock {
    private static let sleutelAan = "faceIdSlot"
    private static let sleutelGevraagd = "faceIdGevraagd"
    /// Zo lang mag de app op de achtergrond staan voordat hij weer op slot gaat.
    static let vergrendelNaSeconden: TimeInterval = 60

    static var aan: Bool {
        get { UserDefaults.standard.bool(forKey: sleutelAan) }
        set { UserDefaults.standard.set(newValue, forKey: sleutelAan) }
    }

    static var gevraagd: Bool {
        get { UserDefaults.standard.bool(forKey: sleutelGevraagd) }
        set { UserDefaults.standard.set(newValue, forKey: sleutelGevraagd) }
    }

    /// Kan dit toestel ontgrendelen met Face ID, Touch ID of de toegangscode?
    static var beschikbaar: Bool {
        LAContext().canEvaluatePolicy(.deviceOwnerAuthentication, error: nil)
    }

    /// "Face ID", "Touch ID" of "je toegangscode" — voor de teksten op het scherm.
    static var methodeNaam: String {
        let context = LAContext()
        _ = context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: nil)
        switch context.biometryType {
        case .faceID: return "Face ID"
        case .touchID: return "Touch ID"
        default: return "je toegangscode"
        }
    }

    /// Vraagt Face ID / Touch ID, met de toegangscode als terugval.
    static func ontgrendel() async -> Bool {
        let context = LAContext()
        context.localizedCancelTitle = "Annuleer"
        do {
            return try await context.evaluatePolicy(.deviceOwnerAuthentication,
                                                    localizedReason: "Ontgrendel Oude Delft 35")
        } catch {
            return false
        }
    }
}
