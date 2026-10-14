// Oude Delft 35 — de website van de oud-huisgenoten als iPhone-app (Expo).
// De site draait in een WebView; de app voegt Face ID, pushmeldingen,
// "Zet in mijn contacten" en "Bewaar in fotorol" toe. De site praat met de app
// via window.ReactNativeWebView.postMessage (zie IN_APP in OH-Lijst_OD35.html).
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import type { ShouldStartLoadRequest } from 'react-native-webview/lib/WebViewTypes';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Contact } from 'expo-contacts';
import * as MediaLibrary from 'expo-media-library';
import { Directory, File, Paths } from 'expo-file-system';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Notifications from 'expo-notifications';
import * as WebBrowser from 'expo-web-browser';

const START_URL = 'https://www.oudedelft35.nl/';
const EIGEN_HOSTS = ['oudedelft35.nl', 'oudedelft35.com', 'od-35.vercel.app'];
const VERSIE = Constants.expoConfig?.version ?? '1.0';
const PAPIER = '#F4F1E8';
const MARINE = '#2A4D82';
const VERGRENDEL_NA_MS = 60_000; // na 1 minuut op de achtergrond weer op slot
const SLEUTEL_FACEID = 'faceIdSlot';
const SLEUTEL_FACEID_GEVRAAGD = 'faceIdGevraagd';

// Vóór de scripts van de site: laat weten dat de site in de app draait.
const VLAG_JS = `window.OD35_APP = { versie: '${VERSIE}', platform: 'ios' }; true;`;

// Meldingen ook tonen als de app open is.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function isEigenHost(url: string) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return EIGEN_HOSTS.some(h => host === h || host.endsWith('.' + h));
  } catch {
    return false;
  }
}

async function faceIDBeschikbaar() {
  return (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
}

type Bericht = { type?: string; [sleutel: string]: unknown };

function tekst(v: unknown) { return typeof v === 'string' ? v.trim() : ''; }
function lijst(v: unknown) { return Array.isArray(v) ? v.map(tekst).filter(Boolean) : []; }
function getal(v: unknown) { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : undefined; }

export default function App() {
  const webRef = useRef<WebView>(null);
  const [vergrendeld, setVergrendeld] = useState<boolean | null>(null); // null = nog aan het laden
  const [afgeschermd, setAfgeschermd] = useState(false); // ledenlijst verbergen in het app-overzicht
  const [laadFout, setLaadFout] = useState(false);
  const [bezigOntgrendelen, setBezigOntgrendelen] = useState(false);
  const naarAchtergrond = useRef<number | null>(null);
  const ingelogd = useRef(false);
  const wachtendTab = useRef<string | null>(null);

  // ---------- Berichten naar de site ----------
  const stuurNaarWeb = useCallback((bericht: Record<string, unknown>) => {
    webRef.current?.injectJavaScript(`window.od35App && window.od35App.ontvang(${JSON.stringify(bericht)}); true;`);
  }, []);
  const toonMelding = useCallback((t: string) => stuurNaarWeb({ type: 'melding', tekst: t }), [stuurNaarWeb]);

  const openTab = useCallback((tab: string) => {
    if (!ingelogd.current) { wachtendTab.current = tab; return; }
    stuurNaarWeb({ type: 'openTab', tab });
  }, [stuurNaarWeb]);

  // ---------- Face ID-slot ----------
  const ontgrendel = useCallback(async () => {
    if (bezigOntgrendelen) return;
    if ((await AsyncStorage.getItem(SLEUTEL_FACEID)) !== '1') { setVergrendeld(false); return; }
    setBezigOntgrendelen(true);
    const r = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Ontgrendel Oude Delft 35',
      cancelLabel: 'Annuleer',
    });
    setBezigOntgrendelen(false);
    if (r.success) setVergrendeld(false);
  }, [bezigOntgrendelen]);

  useEffect(() => {
    (async () => {
      const aan = (await AsyncStorage.getItem(SLEUTEL_FACEID)) === '1';
      setVergrendeld(aan);
      if (aan) ontgrendel();
    })();
    const sub = AppState.addEventListener('change', async fase => {
      const aan = (await AsyncStorage.getItem(SLEUTEL_FACEID)) === '1';
      if (fase === 'background') naarAchtergrond.current = Date.now();
      setAfgeschermd(aan && fase !== 'active');
      if (fase === 'active') {
        const lang = naarAchtergrond.current !== null && Date.now() - naarAchtergrond.current > VERGRENDEL_NA_MS;
        naarAchtergrond.current = null;
        if (aan && lang) { setVergrendeld(true); ontgrendel(); }
      }
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- Pushmeldingen ----------
  const regelPushmeldingen = useCallback(async () => {
    if (!Device.isDevice) return; // simulator heeft geen echte pushmeldingen
    let { status } = await Notifications.getPermissionsAsync();
    if (status === 'undetermined') status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return;
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    try {
      const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
      stuurNaarWeb({ type: 'pushToken', token: data, omgeving: 'expo' });
    } catch {
      /* geen token: dan geen meldingen, de app werkt verder gewoon */
    }
  }, [stuurNaarWeb]);

  useEffect(() => {
    const tabUit = (r: Notifications.NotificationResponse | null) => {
      const tab = r?.notification.request.content.data?.tab;
      if (typeof tab === 'string') openTab(tab);
    };
    Notifications.getLastNotificationResponseAsync().then(tabUit);
    const sub = Notifications.addNotificationResponseReceivedListener(tabUit);
    return () => sub.remove();
  }, [openTab]);

  // ---------- Na inloggen: eenmalig Face ID voorstellen, daarna pushmeldingen ----------
  const naInloggen = useCallback(async () => {
    ingelogd.current = true;
    if (wachtendTab.current) { const t = wachtendTab.current; wachtendTab.current = null; openTab(t); }
    const gevraagd = (await AsyncStorage.getItem(SLEUTEL_FACEID_GEVRAAGD)) === '1';
    if (gevraagd || !(await faceIDBeschikbaar())) { regelPushmeldingen(); return; }
    const keuze = async (aan: boolean) => {
      await AsyncStorage.multiSet([[SLEUTEL_FACEID_GEVRAAGD, '1'], [SLEUTEL_FACEID, aan ? '1' : '0']]);
      if (aan) toonMelding('Face ID-slot staat aan. Wijzigen kan via het thema-knopje → App-instellingen.');
      regelPushmeldingen();
    };
    Alert.alert(
      'App beveiligen met Face ID?',
      'Dan opent de app pas nadat je Face ID hebt gebruikt. Zo kan niemand anders zomaar de ledenlijst inzien als hij je telefoon pakt.',
      [
        { text: 'Nee, liever niet', style: 'cancel', onPress: () => keuze(false) },
        { text: 'Ja, beveilig de app', onPress: () => keuze(true) },
      ],
    );
  }, [openTab, regelPushmeldingen, toonMelding]);

  // ---------- App-instellingen (vanuit de site) ----------
  const toonInstellingen = useCallback(async () => {
    const aan = (await AsyncStorage.getItem(SLEUTEL_FACEID)) === '1';
    if (!(await faceIDBeschikbaar())) {
      Alert.alert('App-instellingen', 'Face ID (of Touch ID) is niet ingesteld op deze telefoon.');
      return;
    }
    Alert.alert('App-instellingen', `Face ID-slot staat nu ${aan ? 'aan' : 'uit'}.`, [
      { text: 'Sluiten', style: 'cancel' },
      {
        text: aan ? 'Zet Face ID-slot uit' : 'Zet Face ID-slot aan',
        onPress: async () => {
          await AsyncStorage.multiSet([[SLEUTEL_FACEID, aan ? '0' : '1'], [SLEUTEL_FACEID_GEVRAAGD, '1']]);
          toonMelding(aan ? 'Face ID-slot staat uit.' : 'Face ID-slot staat aan.');
        },
      },
    ]);
  }, [toonMelding]);

  // ---------- Zet in mijn contacten ----------
  const zetInContacten = useCallback(async (d: Bericht) => {
    const dag = getal(d.geboortedag), maand = getal(d.geboortemaand), jaar = getal(d.geboortejaar);
    const straat = tekst(d.straat), postcode = tekst(d.postcode), plaats = tekst(d.plaats);
    const aankomst = getal(d.aankomstjaar);
    try {
      const opgeslagen = await Contact.presentCreateForm({
        givenName: tekst(d.voornaam),
        familyName: [tekst(d.tussenvoegsel), tekst(d.achternaam)].filter(Boolean).join(' '),
        prefix: tekst(d.titel) || undefined,
        company: 'Oude Delft 35',
        jobTitle: aankomst ? `Huisgenoot ${aankomst}` : undefined,
        emails: lijst(d.emails).map(address => ({ label: 'home', address })),
        phones: [
          ...lijst(d.mobiel).map(number => ({ label: 'mobile', number })),
          ...lijst(d.vast).map(number => ({ label: 'home', number })),
        ],
        addresses: straat || postcode || plaats
          ? [{ label: 'home', street: straat, postcode, city: plaats, country: tekst(d.land) }]
          : undefined,
        birthday: dag && maand ? { day: dag, month: maand, year: jaar } : undefined,
      });
      if (opgeslagen) toonMelding('Opgeslagen in je contacten ✓');
    } catch {
      toonMelding('Het contactscherm kon niet worden geopend.');
    }
  }, [toonMelding]);

  // ---------- Bewaar in fotorol ----------
  const bewaarFoto = useCallback(async (url: string) => {
    if (!url.startsWith('https://')) return;
    try {
      const toestemming = await MediaLibrary.requestPermissionsAsync(true);
      if (!toestemming.granted) {
        toonMelding("Geen toestemming voor je foto's. Zet dit aan via Instellingen → Oude Delft 35 → Foto's.");
        return;
      }
      const map = new Directory(Paths.cache, 'fotos');
      if (!map.exists) map.create();
      const bestand = await File.downloadFileAsync(url, map, { idempotent: true });
      await MediaLibrary.Asset.create(bestand.uri);
      toonMelding('Foto bewaard in je fotorol ✓');
    } catch {
      toonMelding('Bewaren is niet gelukt. Controleer je internet en probeer het opnieuw.');
    }
  }, [toonMelding]);

  // ---------- Berichten van de site ----------
  const onMessage = useCallback((e: WebViewMessageEvent) => {
    let b: Bericht;
    try { b = JSON.parse(e.nativeEvent.data); } catch { return; }
    switch (b.type) {
      case 'ingelogd': naInloggen(); break;
      case 'uitgelogd': ingelogd.current = false; break;
      case 'contact': zetInContacten(b); break;
      case 'bewaarFoto': bewaarFoto(tekst(b.url)); break;
      case 'instellingen': toonInstellingen(); break;
    }
  }, [naInloggen, zetInContacten, bewaarFoto, toonInstellingen]);

  // ---------- Navigatie: eigen site in de app, de rest erbuiten ----------
  const onShouldStartLoadWithRequest = useCallback((req: ShouldStartLoadRequest) => {
    const url = req.url;
    const scheme = url.split(':')[0].toLowerCase();
    if (['tel', 'mailto', 'sms', 'facetime', 'facetime-audio', 'maps', 'whatsapp'].includes(scheme)) {
      Linking.openURL(url).catch(() => {});
      return false;
    }
    if (['about', 'blob', 'data', 'javascript'].includes(scheme)) return true;
    if (req.isTopFrame === false) return true; // ingesloten inhoud (bv. een kaart)
    if (isEigenHost(url)) return true;
    WebBrowser.openBrowserAsync(url, { controlsColor: MARINE }).catch(() => {});
    return false;
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.scherm} edges={['top', 'left', 'right']}>
        <WebView
          ref={webRef}
          source={{ uri: START_URL }}
          style={styles.web}
          containerStyle={styles.web}
          originWhitelist={['*']}
          applicationNameForUserAgent={`OD35App/${VERSIE}`}
          injectedJavaScriptBeforeContentLoaded={VLAG_JS}
          sharedCookiesEnabled
          pullToRefreshEnabled
          allowsBackForwardNavigationGestures={false}
          allowsInlineMediaPlayback
          setSupportMultipleWindows
          onMessage={onMessage}
          onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
          onOpenWindow={e => {
            const url = e.nativeEvent.targetUrl;
            if (isEigenHost(url) && !/\.pdf($|\?)/i.test(url)) webRef.current?.injectJavaScript(`location.href=${JSON.stringify(url)}; true;`);
            else WebBrowser.openBrowserAsync(url, { controlsColor: MARINE }).catch(() => {});
          }}
          onLoadEnd={() => setLaadFout(false)}
          onError={() => setLaadFout(true)}
          onContentProcessDidTerminate={() => webRef.current?.reload()}
        />
      </SafeAreaView>

      {laadFout && (
        <View style={styles.overlay}>
          <Text style={styles.titel}>Geen verbinding</Text>
          <Text style={styles.uitleg}>
            De site kon niet worden geladen. Controleer of je internet hebt en probeer het opnieuw.
          </Text>
          <Pressable style={styles.knop} onPress={() => { setLaadFout(false); webRef.current?.reload(); }}>
            <Text style={styles.knopTekst}>Opnieuw proberen</Text>
          </Pressable>
        </View>
      )}

      {(vergrendeld !== false || afgeschermd) && (
        <View style={styles.overlay}>
          <Image source={require('./assets/splash-logo.png')} style={styles.logo} resizeMode="contain" />
          <Text style={styles.titel}>Oude Delft 35</Text>
          {vergrendeld && (
            <Pressable style={[styles.knop, bezigOntgrendelen && styles.knopBezig]} onPress={ontgrendel} disabled={bezigOntgrendelen}>
              <Text style={styles.knopTekst}>Ontgrendel met Face ID</Text>
            </Pressable>
          )}
        </View>
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  scherm: { flex: 1, backgroundColor: PAPIER },
  web: { flex: 1, backgroundColor: PAPIER },
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: PAPIER,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 20,
  },
  logo: { width: 170, height: 136 },
  titel: { fontFamily: 'Georgia', fontSize: 28, fontWeight: '600', color: MARINE },
  uitleg: { fontSize: 17, color: '#6b6258', textAlign: 'center', lineHeight: 24 },
  knop: { backgroundColor: MARINE, paddingVertical: 15, paddingHorizontal: 28, borderRadius: 10, minWidth: 260, alignItems: 'center' },
  knopBezig: { opacity: 0.6 },
  knopTekst: { color: '#fff', fontSize: 18, fontWeight: '600' },
});
