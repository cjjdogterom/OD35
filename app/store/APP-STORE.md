# App Store-publicatie — "Oude Delft 35"

Alles wat nodig is om de app in de App Store te krijgen. Wat automatisch kan, gaat via EAS;
de rest vul je één keer in op [App Store Connect](https://appstoreconnect.apple.com).

| Onderdeel | Waar | Status |
|---|---|---|
| Privacybeleid | https://www.oudedelft35.nl/privacy.html | klaar |
| Gebruiksvoorwaarden | https://www.oudedelft35.nl/voorwaarden.html | klaar |
| Supportpagina | https://www.oudedelft35.nl/support.html | klaar |
| Naam, ondertitel, beschrijving, trefwoorden, categorie, leeftijd, review-info | `app/store.config.js` → `eas metadata:push` | klaar om te uploaden |
| Screenshots (6,9 inch, 1290×2796) | `app/store/screenshots/` → handmatig uploaden | klaar |
| Meldknop, voorwaarden-akkoord, account verwijderen | in de site/app | klaar |
| Testaccount voor Apple | Supabase (stap 1) | **zelf doen** |
| App-privacy (“privacylabel”) | App Store Connect (stap 4) | **zelf invullen** |

## 1. Testaccount voor de keurders van Apple

Apple moet kunnen inloggen. Maak een apart account met wachtwoord (geen beheerder):

1. Supabase → **Authentication → Users → Add user → Create new user**
2. E-mail: `appreview@oudedelft35.nl` — Wachtwoord: kies een sterk wachtwoord —
   vink **Auto Confirm User** aan → Create user.
3. Zet het **niet** in de tabel `admins`. Het account hoeft ook niet in de ledenlijst.

Inloggen gaat via “Beheerder inloggen met wachtwoord” onderaan het inlogscherm (staat in de
review-notities). Laat het account bestaan tot de app is goedgekeurd.

## 2. Teksten en review-info uploaden

```bash
cd app
OD35_REVIEW_WACHTWOORD='het-wachtwoord-uit-stap-1' OD35_REVIEW_TELEFOON='+316xxxxxxxx' npx eas-cli@latest metadata:push
```

Vraagt om in te loggen bij Apple. Zet naam, ondertitel, beschrijving, trefwoorden, categorie
(Sociale netwerken / Lifestyle), leeftijdsvragen, links en de review-info (met testaccount) in
App Store Connect. Het wachtwoord en telefoonnummer staan niet in Git.

## 3. Screenshots

App Store Connect → je app → versie 1.0 → **iPhone 6,9-inch-display** → sleep de vijf bestanden
uit `app/store/screenshots/` erin (op volgorde 1 t/m 5). Ze tonen **verzonnen** huisgenoten;
er staan geen echte persoonsgegevens op. De app is alleen voor iPhone, dus iPad-screenshots zijn
niet nodig.

## 4. App-privacy (privacylabel)

App Store Connect → **App-privacy** → **Aan de slag**. “Verzamel je gegevens?” → **Ja**.
Vink deze gegevenstypen aan en beantwoord per type: *gekoppeld aan de gebruiker* = **Ja**,
*gebruikt voor tracking* = **Nee**.

| Gegevenstype (Apple) | Wat het bij ons is | Doel |
|---|---|---|
| Contactgegevens → Naam | naam in de ledenlijst | Appfunctionaliteit |
| Contactgegevens → E-mailadres | e-mail, inloggen | Appfunctionaliteit |
| Contactgegevens → Telefoonnummer | telefoon in de ledenlijst | Appfunctionaliteit |
| Contactgegevens → Fysiek adres | adres in de ledenlijst | Appfunctionaliteit |
| Gebruikersinhoud → Foto’s of video’s | geüploade foto’s | Appfunctionaliteit |
| Gebruikersinhoud → Overige gebruikersinhoud | berichten, boekingen, wijzigingsverzoeken | Appfunctionaliteit |
| ID’s → Gebruikers-ID | account (e-mailadres) | Appfunctionaliteit |
| ID’s → Apparaat-ID | pushtoken | Appfunctionaliteit |
| Locatie → Globale locatie | gemeente/provincie afgeleid uit IP-adres | Analyse |
| Gebruiksgegevens → Productinteractie | bezoekmomenten (bezoekersoverzicht) | Analyse |
| Overige gegevens → Overige gegevenstypen | geboortedatum, aankomstjaar | Appfunctionaliteit |

Niet aanvinken: financiële gegevens, gezondheid, precieze locatie, contacten (we lezen je
contacten niet uit), browsegeschiedenis, zoekgeschiedenis, diagnostiek, gevoelige gegevens.
Face ID wordt alleen op de telefoon verwerkt en hoeft niet vermeld te worden.

## 5. Leeftijdsclassificatie — extra vragen

De standaardvragen (geweld, seks, gokken …) staan op **Geen** via `store.config.js`. App Store
Connect stelt ook vragen over communicatie tussen gebruikers; antwoord naar waarheid:
- **Door gebruikers gegenereerde inhoud**: Ja (foto’s en het forum Wandelgangen)
- **Berichten/chat tussen gebruikers**: Ja (forum; alleen voor ingelogde huisgenoten)
- **Moderatie**: meldknop bij elk bericht en elke foto, beheerders kunnen verwijderen en blokkeren
- **Onbeperkte toegang tot het web**: Nee

## 6. Advies: “niet-vermelde” app (unlisted)

De app is alleen bruikbaar voor (oud-)huisgenoten. Apple keurt apps voor een besloten groep
soms af als “te beperkt publiek”, of vraagt om **niet-vermelde distributie**: de app staat dan
wél in de App Store, maar is alleen te vinden via een directe link (die je kunt mailen naar de
huisgenoten). Aanvragen kan na het aanmaken van de app via
[developer.apple.com/support/unlisted/request](https://developer.apple.com/support/unlisted/request/).
Geef daarbij als reden: “Private address book app for the members of a student house
community; only usable with an account in our member register.”

## 7. Indienen

1. Bouwen en naar TestFlight (eerst zelf testen op je iPhone):
   `cd app && npx eas-cli@latest build --platform ios --profile production --auto-submit`
2. In App Store Connect bij versie 1.0 de build kiezen (na ±15 min verwerking).
3. Exportcompliance: wordt automatisch beantwoord (geen eigen versleuteling).
4. **Ter beoordeling indienen.** Keuring duurt meestal 1–2 dagen. Na goedkeuring zelf op
   **Publiceer** drukken (`automaticRelease: false`).
