// App Store-gegevens voor "Oude Delft 35" (EAS Metadata).
// Uploaden naar App Store Connect:   npx eas-cli@latest metadata:push
//
// Gevoelige gegevens staan bewust NIET in dit bestand (dat staat in Git):
//   OD35_REVIEW_WACHTWOORD  wachtwoord van het testaccount voor Apple (appreview@oudedelft35.nl)
//   OD35_REVIEW_TELEFOON    telefoonnummer voor vragen van Apple, met +31
// Zet ze alleen in je terminal vlak voor het uploaden. Zie app/store/APP-STORE.md.
const SITE = 'https://www.oudedelft35.nl';

const beschrijving = `Het adresboek van alle oud-huisgenoten van Oude Delft 35 — sinds 1891 — nu als app op je iPhone.

Deze app is alleen voor (oud-)huisgenoten en bewoners van Oude Delft 35. Je logt in met het e-mailadres dat in de ledenlijst staat; je krijgt dan een persoonlijke inlogcode per mail. Daarna blijf je gewoon ingelogd.

WAT KUN JE ERMEE?
• Huisgenoten opzoeken op naam, jaargang of woonplaats — met adres, telefoon en e-mail
• In één tik een huisgenoot in je iPhone-contacten zetten
• Foto’s en albums uit 135 jaar huisgeschiedenis bekijken en in je fotorol bewaren
• De agenda met reünies, lustra en huisborrels — en je aanmelden
• De huisauto boeken (voor bewoners vanaf jaargang 2017), met chauffeur en overzicht per maand
• Het forum Wandelgangen, klaverjassen, de huisplattegrond en de geschiedenis van het huis

GEMAK EN VEILIGHEID
• Pushmeldingen bij een nieuw agendapunt of als er iets verandert aan je huisauto-boeking
• Beveilig de app met Face ID, zodat alleen jij de ledenlijst kunt openen
• Overzichtelijke menubalk onderin en alle instellingen achter het tandwiel
• De ledenlijst is niet openbaar: alleen ingelogde huisgenoten kunnen hem zien

Klopt er iets niet in je gegevens? Dien in de app een wijziging in. Vragen? Mail naar omegaksiod35@gmail.com.`;

const reviewNotities = `Oude Delft 35 is a private address book and community app for the current and former residents ("huisgenoten") of the student house at Oude Delft 35 in Delft, the Netherlands (founded 1891). Access is limited to people listed in the member register. The app is in Dutch.

HOW TO SIGN IN FOR REVIEW
On the sign-in screen, scroll down and tap "Beheerder inloggen met wachtwoord" (sign in with password), then use the demo account provided in the App Review Information. Regular members sign in with a one-time code sent by e-mail, which is why a password account is provided for review.

NATIVE FEATURES
- Bottom tab bar (Personen, Agenda, Foto's, Huisauto, Meer) and a settings sheet behind the gear icon (top right).
- Face ID lock: offered after the first sign-in; can be changed under gear icon > "Face ID-slot".
- "Zet in mijn contacten" (add to contacts) on an expanded person card opens the system "New Contact" form.
- "Bewaar in fotorol" (save to photo library) in the photo viewer.
- Push notifications for new agenda items and for car bookings.

USER-GENERATED CONTENT
Members can post photos and forum messages ("Wandelgangen"). Every message and photo by another member has a "Melden" (report) button. Administrators review reports within 24 hours and can remove content and block users from posting or from the app. Users agree to the terms of use on the sign-in screen; the terms state there is no tolerance for objectionable content: ${SITE}/voorwaarden.html

ACCOUNT DELETION
Gear icon > "Account verwijderen" sends a deletion request to the administrators, who delete the account and personal data within one month.`;

module.exports = () => {
  const review = {
    firstName: 'Chris',
    lastName: 'Dogterom',
    email: 'cjj.dogterom@gmail.com',
    demoUsername: 'appreview@oudedelft35.nl',
    demoRequired: true,
    notes: reviewNotities,
  };
  if (process.env.OD35_REVIEW_WACHTWOORD) review.demoPassword = process.env.OD35_REVIEW_WACHTWOORD;
  if (process.env.OD35_REVIEW_TELEFOON) review.phone = process.env.OD35_REVIEW_TELEFOON;

  return {
    configVersion: 0,
    apple: {
      copyright: `${new Date().getFullYear()} Oude Delft 35`,
      categories: ['SOCIAL_NETWORKING', 'LIFESTYLE'],
      info: {
        'nl-NL': {
          title: 'Oude Delft 35',
          subtitle: 'Adresboek van oud-huisgenoten',
          promoText: 'Het adresboek van alle oud-huisgenoten van Oude Delft 35, sinds 1891. Zoek huisgenoten op, bekijk foto’s en de agenda en boek de huisauto.',
          description: beschrijving,
          keywords: ['oude delft 35', 'od35', 'delft', 'huisgenoten', 'studentenhuis', 'reunie', 'adresboek', 'ledenlijst'],
          releaseNotes: 'Eerste versie van de app Oude Delft 35.',
          marketingUrl: `${SITE}/`,
          supportUrl: `${SITE}/support.html`,
          privacyPolicyUrl: `${SITE}/privacy.html`,
        },
      },
      advisory: {
        alcoholTobaccoOrDrugUseOrReferences: 'NONE',
        contests: 'NONE',
        gamblingSimulated: 'NONE',
        horrorOrFearThemes: 'NONE',
        matureOrSuggestiveThemes: 'NONE',
        medicalOrTreatmentInformation: 'NONE',
        profanityOrCrudeHumor: 'NONE',
        sexualContentGraphicAndNudity: 'NONE',
        sexualContentOrNudity: 'NONE',
        violenceCartoonOrFantasy: 'NONE',
        violenceRealistic: 'NONE',
        violenceRealisticProlongedGraphicOrSadistic: 'NONE',
        gambling: false,
        unrestrictedWebAccess: false,
        kidsAgeBand: null,
        ageRatingOverride: 'NONE',
        koreaAgeRatingOverride: 'NONE',
      },
      release: {
        automaticRelease: false, // na goedkeuring zelf op "Publiceer" drukken
        phasedRelease: false,
      },
      review,
    },
  };
};
