import SwiftUI

struct RootView: View {
    @StateObject private var state = AppState.shared
    @Environment(\.scenePhase) private var scenePhase
    @State private var naarAchtergrond: Date?
    @State private var bezigMetOntgrendelen = false

    var body: some View {
        ZStack {
            Color(Config.papier).ignoresSafeArea()

            WebContainer()

            if let fout = state.laadFout {
                FoutScherm(tekst: fout) {
                    state.laadFout = nil
                    state.webView?.load(URLRequest(url: Config.startURL))
                }
            }

            // Slot: ook als afscherming in het app-overzicht, zodat de ledenlijst niet zichtbaar is.
            if state.isVergrendeld || (AppLock.aan && scenePhase != .active) {
                SlotScherm(bezig: bezigMetOntgrendelen) { Task { await ontgrendel() } }
                    .transition(.opacity)
            }
        }
        .animation(.easeInOut(duration: 0.2), value: state.isVergrendeld)
        .alert("App beveiligen met \(AppLock.methodeNaam)?", isPresented: $state.vraagFaceID) {
            Button("Ja, beveilig de app") { state.faceIDKeuze(true) }
            Button("Nee, liever niet", role: .cancel) { state.faceIDKeuze(false) }
        } message: {
            Text("Dan opent de app pas nadat je \(AppLock.methodeNaam) hebt gebruikt. Zo kan niemand anders zomaar de ledenlijst inzien als hij je telefoon pakt. Je kunt dit later wijzigen via Instellingen → Oude Delft 35.")
        }
        .onChange(of: scenePhase) { fase in
            switch fase {
            case .background:
                naarAchtergrond = Date()
            case .active:
                let lang = naarAchtergrond.map { Date().timeIntervalSince($0) > AppLock.vergrendelNaSeconden } ?? false
                if AppLock.aan && lang { state.isVergrendeld = true }
                naarAchtergrond = nil
                if state.isVergrendeld { Task { await ontgrendel() } }
            default:
                break
            }
        }
        .task {
            if state.isVergrendeld { await ontgrendel() }
        }
    }

    private func ontgrendel() async {
        // Schakelaar intussen uitgezet in Instellingen? Dan niet meer vragen.
        guard AppLock.aan else { state.isVergrendeld = false; return }
        guard !bezigMetOntgrendelen else { return }
        bezigMetOntgrendelen = true
        let gelukt = await AppLock.ontgrendel()
        bezigMetOntgrendelen = false
        if gelukt { state.isVergrendeld = false }
    }
}

/// Scherm dat over de app ligt zolang hij op slot zit.
struct SlotScherm: View {
    let bezig: Bool
    let ontgrendel: () -> Void

    var body: some View {
        ZStack {
            Color(Config.papier).ignoresSafeArea()
            VStack(spacing: 28) {
                Image("LaunchLogo")
                    .resizable()
                    .scaledToFit()
                    .frame(width: 170)
                Text("Oude Delft 35")
                    .font(.system(.title, design: .serif).weight(.semibold))
                    .foregroundColor(Color(Config.marine))
                Button(action: ontgrendel) {
                    Label("Ontgrendel met \(AppLock.methodeNaam)", systemImage: "lock.open.fill")
                        .font(.title3.weight(.semibold))
                        .padding(.horizontal, 24)
                        .padding(.vertical, 14)
                        .frame(minWidth: 260)
                        .background(Color(Config.marine))
                        .foregroundColor(.white)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                }
                .disabled(bezig)
                .opacity(bezig ? 0.6 : 1)
            }
            .padding(32)
        }
    }
}

/// Scherm als de site niet geladen kan worden (geen internet).
struct FoutScherm: View {
    let tekst: String
    let opnieuw: () -> Void

    var body: some View {
        ZStack {
            Color(Config.papier).ignoresSafeArea()
            VStack(spacing: 20) {
                Image(systemName: "wifi.exclamationmark")
                    .font(.system(size: 52))
                    .foregroundColor(Color(Config.marine))
                Text("Geen verbinding")
                    .font(.system(.title2, design: .serif).weight(.semibold))
                Text(tekst)
                    .font(.body)
                    .multilineTextAlignment(.center)
                    .foregroundColor(.secondary)
                Button(action: opnieuw) {
                    Text("Opnieuw proberen")
                        .font(.title3.weight(.semibold))
                        .padding(.horizontal, 28)
                        .padding(.vertical, 14)
                        .background(Color(Config.marine))
                        .foregroundColor(.white)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                }
            }
            .padding(32)
        }
    }
}
