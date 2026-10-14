import UIKit
import Contacts
import ContactsUI
import Photos
import SafariServices

/// De iPhone-functies die de site via window.webkit.messageHandlers.od35 kan aanroepen.
@MainActor
enum NativeBridge {

    // MARK: - Zet in mijn contacten

    /// Opent het iPhone-scherm "Nieuw contact", al ingevuld. Opslaan doet de gebruiker
    /// zelf met "Gereed" — daarvoor hoeft de app geen toegang tot alle contacten te vragen.
    static func zetInContacten(_ d: [String: Any]) {
        func tekst(_ sleutel: String) -> String {
            (d[sleutel] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        }
        func lijst(_ sleutel: String) -> [String] {
            ((d[sleutel] as? [Any]) ?? []).compactMap { ($0 as? String)?.trimmingCharacters(in: .whitespaces) }
                .filter { !$0.isEmpty }
        }
        func getal(_ sleutel: String) -> Int? {
            if let n = d[sleutel] as? Int { return n }
            if let n = d[sleutel] as? Double { return Int(n) }
            if let s = d[sleutel] as? String { return Int(s) }
            return nil
        }

        let c = CNMutableContact()
        c.givenName = tekst("voornaam")
        c.familyName = [tekst("tussenvoegsel"), tekst("achternaam")].filter { !$0.isEmpty }.joined(separator: " ")
        c.namePrefix = tekst("titel")
        c.organizationName = "Oude Delft 35"
        if let jaar = getal("aankomstjaar") { c.jobTitle = "Huisgenoot \(jaar)" }

        c.emailAddresses = lijst("emails").map { CNLabeledValue(label: CNLabelHome, value: $0 as NSString) }
        c.phoneNumbers =
            lijst("mobiel").map { CNLabeledValue(label: CNLabelPhoneNumberMobile, value: CNPhoneNumber(stringValue: $0)) } +
            lijst("vast").map { CNLabeledValue(label: CNLabelHome, value: CNPhoneNumber(stringValue: $0)) }

        let straat = tekst("straat"), postcode = tekst("postcode"), plaats = tekst("plaats"), land = tekst("land")
        if !(straat + postcode + plaats).isEmpty {
            let adres = CNMutablePostalAddress()
            adres.street = straat
            adres.postalCode = postcode
            adres.city = plaats
            adres.country = land
            c.postalAddresses = [CNLabeledValue(label: CNLabelHome, value: adres)]
        }

        if let dag = getal("geboortedag"), let maand = getal("geboortemaand") {
            var datum = DateComponents()
            datum.day = dag
            datum.month = maand
            datum.year = getal("geboortejaar")
            c.birthday = datum
        }

        let scherm = CNContactViewController(forNewContact: c)
        scherm.contactStore = CNContactStore()
        scherm.delegate = ContactSluiter.shared
        let nav = UINavigationController(rootViewController: scherm)
        toon(nav)
    }

    // MARK: - Bewaar in fotorol

    static func bewaarFoto(_ url: URL) async {
        guard url.scheme == "https" else { return }
        do {
            let (data, _) = try await URLSession.shared.data(from: url)
            guard UIImage(data: data) != nil else {
                AppState.shared.toonMelding("Dit bestand is geen foto.")
                return
            }
            let status = await PHPhotoLibrary.requestAuthorization(for: .addOnly)
            guard status == .authorized || status == .limited else {
                AppState.shared.toonMelding("Geen toestemming voor je foto's. Zet dit aan via Instellingen → Oude Delft 35 → Foto's.")
                return
            }
            try await PHPhotoLibrary.shared().performChanges {
                PHAssetCreationRequest.forAsset().addResource(with: .photo, data: data, options: nil)
            }
            AppState.shared.toonMelding("Foto bewaard in je fotorol ✓")
        } catch {
            AppState.shared.toonMelding("Bewaren is niet gelukt. Controleer je internet en probeer het opnieuw.")
        }
    }

    // MARK: - Overig

    static func openInSafari(_ url: URL) {
        guard let scheme = url.scheme?.lowercased(), scheme == "https" || scheme == "http" else {
            UIApplication.shared.open(url)
            return
        }
        let safari = SFSafariViewController(url: url)
        safari.preferredControlTintColor = Config.marine
        toon(safari)
    }

    static func deel(_ items: [Any]) {
        let menu = UIActivityViewController(activityItems: items, applicationActivities: nil)
        if let bron = bovensteScherm()?.view {   // iPad: het menu moet ergens aan vastzitten
            menu.popoverPresentationController?.sourceView = bron
            menu.popoverPresentationController?.sourceRect = CGRect(x: bron.bounds.midX, y: bron.bounds.midY, width: 0, height: 0)
            menu.popoverPresentationController?.permittedArrowDirections = []
        }
        toon(menu)
    }

    /// Toont een scherm boven alles; lukt dat niet, dan wordt `ofAnders` aangeroepen
    /// (belangrijk voor alert/confirm: anders wacht de site eeuwig op een antwoord).
    /// iOS weigert stilletjes te tonen terwijl een ander scherm nog open- of dichtgaat,
    /// daarom controleren we het na een moment en proberen we het zo nodig nog één keer.
    static func toon(_ scherm: UIViewController, ofAnders: (() -> Void)? = nil, poging: Int = 1) {
        guard let boven = bovensteScherm() else { ofAnders?(); return }
        boven.present(scherm, animated: true)
        guard let ofAnders else { return }
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
            guard scherm.presentingViewController == nil, !scherm.isBeingPresented else { return }
            if poging < 2 { toon(scherm, ofAnders: ofAnders, poging: poging + 1) } else { ofAnders() }
        }
    }

    private static func bovensteScherm() -> UIViewController? {
        let venster = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap { $0.windows }
            .first { $0.isKeyWindow }
        var scherm = venster?.rootViewController
        while let volgende = scherm?.presentedViewController, !volgende.isBeingDismissed { scherm = volgende }
        return scherm
    }
}

/// Sluit het contactscherm na "Gereed" of "Annuleer".
final class ContactSluiter: NSObject, CNContactViewControllerDelegate {
    static let shared = ContactSluiter()
    func contactViewController(_ viewController: CNContactViewController, didCompleteWith contact: CNContact?) {
        viewController.dismiss(animated: true)
        if contact != nil {
            Task { @MainActor in AppState.shared.toonMelding("Opgeslagen in je contacten ✓") }
        }
    }
}
