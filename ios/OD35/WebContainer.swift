import SwiftUI
import WebKit
import SafariServices

/// De website in een WKWebView, met alles wat een app nodig heeft.
struct WebContainer: UIViewRepresentable {

    func makeCoordinator() -> WebCoordinator { WebCoordinator() }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()                 // inlog blijft bewaard
        config.applicationNameForUserAgent = "OD35App/\(Config.versie)"
        config.allowsInlineMediaPlayback = true

        let content = WKUserContentController()
        // Zwakke verwijzing, anders houdt WebKit de coordinator voor altijd vast.
        content.add(ZwakkeBerichtOntvanger(context.coordinator), name: "od35")
        // Vóór de scripts van de site: laat weten dat de site in de app draait.
        let vlag = WKUserScript(
            source: "window.OD35_APP = { versie: '\(Config.versie)', platform: 'ios' };",
            injectionTime: .atDocumentStart, forMainFrameOnly: true)
        content.addUserScript(vlag)
        config.userContentController = content

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        webView.isOpaque = false
        webView.backgroundColor = Config.papier
        webView.scrollView.backgroundColor = Config.papier
        webView.allowsLinkPreview = false
        #if DEBUG
        if #available(iOS 16.4, *) { webView.isInspectable = true }   // Safari → Ontwikkel
        #endif

        let verversen = UIRefreshControl()
        verversen.addTarget(context.coordinator, action: #selector(WebCoordinator.verversen(_:)), for: .valueChanged)
        webView.scrollView.refreshControl = verversen

        context.coordinator.webView = webView
        AppState.shared.webView = webView
        webView.load(URLRequest(url: Config.startURL))
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}
}

/// Houdt een zwakke verwijzing naar de echte ontvanger (voorkomt een geheugenlek).
@MainActor
final class ZwakkeBerichtOntvanger: NSObject, WKScriptMessageHandler {
    private weak var doel: WKScriptMessageHandler?
    init(_ doel: WKScriptMessageHandler) { self.doel = doel }
    func userContentController(_ c: WKUserContentController, didReceive message: WKScriptMessage) {
        doel?.userContentController(c, didReceive: message)
    }
}

@MainActor
final class WebCoordinator: NSObject, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler, WKDownloadDelegate {
    weak var webView: WKWebView?
    private var downloadBestanden: [ObjectIdentifier: URL] = [:]

    @objc func verversen(_ control: UIRefreshControl) {
        if webView?.url == nil { webView?.load(URLRequest(url: Config.startURL)) } else { webView?.reload() }
    }

    // MARK: - Berichten van de site

    func userContentController(_ userContentController: WKUserContentController,
                               didReceive message: WKScriptMessage) {
        guard let bericht = message.body as? [String: Any], let type = bericht["type"] as? String else { return }
        verwerk(type: type, bericht: bericht)
    }

    private func verwerk(type: String, bericht: [String: Any]) {
        switch type {
        case "ingelogd":
            AppState.shared.ingelogd(email: bericht["email"] as? String ?? "")
        case "uitgelogd":
            AppState.shared.uitgelogd()
        case "contact":
            NativeBridge.zetInContacten(bericht)
        case "bewaarFoto":
            if let tekst = bericht["url"] as? String, let url = URL(string: tekst) {
                Task { await NativeBridge.bewaarFoto(url) }
            }
        default:
            break
        }
    }

    // MARK: - Navigatie

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping @MainActor (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { return decisionHandler(.allow) }
        let scheme = url.scheme?.lowercased() ?? ""

        // Bellen, mailen, sms'en, kaarten: door de iPhone zelf laten afhandelen.
        if ["tel", "mailto", "sms", "facetime", "facetime-audio", "maps", "whatsapp"].contains(scheme) {
            UIApplication.shared.open(url)
            return decisionHandler(.cancel)
        }
        if ["about", "blob", "data", "javascript"].contains(scheme) { return decisionHandler(.allow) }
        if navigationAction.shouldPerformDownload { return decisionHandler(.download) }

        // Inhoud binnen de pagina (bv. een ingesloten kaart) gewoon laden.
        if let frame = navigationAction.targetFrame, !frame.isMainFrame { return decisionHandler(.allow) }

        // Eigen site in de app; al het andere in een ingebouwde Safari.
        if Config.isEigenHost(url) { return decisionHandler(.allow) }
        NativeBridge.openInSafari(url)
        decisionHandler(.cancel)
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationResponse: WKNavigationResponse,
                 decisionHandler: @escaping @MainActor (WKNavigationResponsePolicy) -> Void) {
        let isBijlage = (navigationResponse.response as? HTTPURLResponse)?
            .value(forHTTPHeaderField: "Content-Disposition")?.lowercased().hasPrefix("attachment") ?? false
        if isBijlage || !navigationResponse.canShowMIMEType { return decisionHandler(.download) }
        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        AppState.shared.paginaVerlaten()
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        webView.scrollView.refreshControl?.endRefreshing()
        AppState.shared.paginaGeladen()
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        toonFout(error)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        toonFout(error)
    }

    /// iOS heeft de webpagina uit het geheugen gehaald: opnieuw laden.
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        webView.reload()
    }

    private func toonFout(_ error: Error) {
        webView?.scrollView.refreshControl?.endRefreshing()
        let fout = error as NSError
        if fout.code == NSURLErrorCancelled { return }                  // afgebroken door een nieuwe navigatie
        if fout.domain == "WebKitErrorDomain" && fout.code == 102 { return } // overgenomen door download
        AppState.shared.laadFout = "De site kon niet worden geladen. Controleer of je internet hebt en probeer het opnieuw."
    }

    // MARK: - Downloads (bv. Excel-export) → deelmenu

    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
        download.delegate = self
    }

    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
        download.delegate = self
    }

    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse,
                  suggestedFilename: String, completionHandler: @escaping @MainActor (URL?) -> Void) {
        let map = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try? FileManager.default.createDirectory(at: map, withIntermediateDirectories: true)
        let doel = map.appendingPathComponent(suggestedFilename.isEmpty ? "bestand" : suggestedFilename)
        downloadBestanden[ObjectIdentifier(download)] = doel
        completionHandler(doel)
    }

    func downloadDidFinish(_ download: WKDownload) {
        guard let bestand = downloadBestanden.removeValue(forKey: ObjectIdentifier(download)) else { return }
        NativeBridge.deel([bestand])
    }

    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        downloadBestanden.removeValue(forKey: ObjectIdentifier(download))
        AppState.shared.toonMelding("Downloaden is niet gelukt.")
    }

    // MARK: - Pop-ups van de site (alert, confirm, prompt, nieuw venster)

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        // window.open / target=_blank: eigen pagina's in de app, de rest (bv. een PDF) in Safari.
        if let url = navigationAction.request.url {
            if Config.isEigenHost(url) && !url.pathExtension.lowercased().hasPrefix("pdf") {
                webView.load(navigationAction.request)
            } else {
                NativeBridge.openInSafari(url)
            }
        }
        return nil
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping @MainActor () -> Void) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() })
        NativeBridge.toon(alert, ofAnders: completionHandler)
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping @MainActor (Bool) -> Void) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Annuleer", style: .cancel) { _ in completionHandler(false) })
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(true) })
        NativeBridge.toon(alert) { completionHandler(false) }
    }

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String,
                 defaultText: String?, initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping @MainActor (String?) -> Void) {
        let alert = UIAlertController(title: nil, message: prompt, preferredStyle: .alert)
        alert.addTextField { $0.text = defaultText }
        alert.addAction(UIAlertAction(title: "Annuleer", style: .cancel) { _ in completionHandler(nil) })
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(alert.textFields?.first?.text) })
        NativeBridge.toon(alert) { completionHandler(nil) }
    }
}
