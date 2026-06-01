# Security audit — OD35 Ledenlijst

Datum: 2026-05-21

## Wat ik DIRECT heb gefixt (in deze commit)

### Server-side
- **API Origin-check**: `/api/broadcast` en `/api/wijziging` accepteren nu alleen requests van `oudedelft35.com` / `www.oudedelft35.com` / `od-35.vercel.app`. Vóórheen kon iedereen de mailing-API misbruiken om gratis spam via jouw Resend-account te versturen.
- **Rate-limit op `/api/broadcast`**: max 5 calls per minuut per IP, max 500 ontvangers per call.
- **Security headers** in `vercel.json`: HSTS, X-Frame-Options (clickjacking), X-Content-Type-Options, Referrer-Policy, Permissions-Policy (geen camera/microfoon/etc).

### Client-side
- **Content-Security-Policy** meta-tag toegevoegd: scripts mogen alleen van `self`, `jsdelivr.net`, `cdnjs.cloudflare.com`. Connecties alleen naar Supabase en Resend. Iframe-embedden geblokkeerd.
- **Site-password gehashed** (SHA-256) i.p.v. plaintext in JS-source. `View Source` levert nu alleen de hash op, niet het wachtwoord `OmegaKsi35`.
- **Anti-self-XSS console-waarschuwing**: gebruikers die DevTools openen krijgen een groot **STOP!** te zien — voorkomt social-engineering trucs ("plak dit in de console").

## Wat JIJ moet doen — VIEWER ACCOUNT INRICHTEN

De code voor viewer-only toegang staat klaar. Doe deze 3 stappen, dan is alles dicht.

### A. Maak het viewer-account in Supabase Auth
1. Supabase dashboard → **Authentication → Users → Add user → Create new user**
2. Vul in:
   - E-mail: `viewer@oudedelft35.local` (mag fake zijn — geen mail nodig)
   - Wachtwoord: **genereer een lange random string** (32 chars) — bv via [passwordsgenerator.net](https://passwordsgenerator.net)
   - **Auto Confirm User** ✓ aanvinken
   - Create user

### B. Zet 2 env-vars in Vercel
Voor élk Vercel-project (`od-35`, `od-35-oh-lijst`, `od-35-5jju`):
- **Settings → Environment Variables → Add New** (× 2)
- `VIEWER_EMAIL` = `viewer@oudedelft35.local`
- `VIEWER_PASSWORD` = (de random string uit stap A)
- Environments: **Production** ✓
- **Redeploy** triggeren via Deployments tab (3 puntjes op laatste deploy → Redeploy)

### C. RLS aanscherpen in Supabase SQL Editor
```sql
-- 1. Drop bestaande anon SELECT policies (namen kunnen variëren — check Table Editor)
DROP POLICY IF EXISTS "anon mag personen lezen" ON personen;
DROP POLICY IF EXISTS "Enable read access for all users" ON personen;
DROP POLICY IF EXISTS "Public read" ON personen;

-- 2. Voeg authenticated SELECT toe (viewer + admins)
CREATE POLICY "Auth mag personen lezen"
  ON personen FOR SELECT TO authenticated USING (true);

-- 3. Doe hetzelfde voor evenementen, contactpersonen, huis_oudste,
--    aanwezigheid, albums, fotos, admin_emails:
DROP POLICY IF EXISTS "anon read" ON evenementen;
CREATE POLICY "Auth read" ON evenementen FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "anon read" ON contactpersonen;
CREATE POLICY "Auth read" ON contactpersonen FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "anon read" ON huis_oudste;
CREATE POLICY "Auth read" ON huis_oudste FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "anon read" ON aanwezigheid;
CREATE POLICY "Auth read" ON aanwezigheid FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "anon read" ON albums;
CREATE POLICY "Auth read" ON albums FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "anon read" ON fotos;
CREATE POLICY "Auth read" ON fotos FOR SELECT TO authenticated USING (true);

-- 4. Behoud anon INSERT op wijzigingsverzoeken — voor publiek inschrijfformulier!
-- (Deze policy bestaat al, niet droppen)

-- 5. Schemarefresh
NOTIFY pgrst, 'reload schema';
```

### Verificatie
Na deze 3 stappen test je:
```bash
# Mag NIET meer werken (404 of 401)
curl "https://mxbtmbcgycjqapjzulrp.supabase.co/rest/v1/personen?select=*" \
  -H "apikey: <anon-key>"
```
En in de browser: ververs de site → vul site-wachtwoord in → leden zouden zichtbaar moeten zijn. Als data niet laadt: check je Vercel env vars + dat viewer-account de juiste creds heeft.

### 🟠 HOOG — Plaintext wachtwoorden in `admins.wachtwoord`

**Probleem**: alle admin-wachtwoorden staan leesbaar in de DB. Bij een lek van de Supabase database zijn ze direct misbruikbaar voor andere websites (mensen hergebruiken wachtwoorden).

**Oplossing**:
```sql
-- Verwijder het wachtwoord-veld
ALTER TABLE admins DROP COLUMN wachtwoord;
```

Daarna moet ik de admin-uitnodig-flow herbouwen: i.p.v. wachtwoord opslaan, gebruikt hoofdadmin Supabase's password-reset link voor het herstellen.

### 🟠 HOOG — Email-confirmatie in Supabase Auth

**Probleem**: nieuwe accounts kunnen zonder e-mailverificatie inloggen — iemand kan een Auth-user maken op een e-mailadres dat ze niet bezitten.

**Oplossing**: Supabase dashboard → Authentication → Providers → Email → "Confirm email" → **AAN**

### 🟡 MIDDEL — Storage bucket policies (`fotos`)

Controleer in Supabase dashboard → Storage → fotos → Policies dat alleen admins kunnen uploaden/verwijderen. Anon mag wel READ (anders zien gebruikers geen foto's), maar niet WRITE.

### 🟡 MIDDEL — Verwijder ongebruikte tabellen

Als de `inschrijvingen`-tabel niet meer gebruikt wordt (we sturen alles naar `wijzigingsverzoeken`), kan die weg:
```sql
DROP TABLE IF EXISTS inschrijvingen;
```

### 🟢 LAAG — Roteer de Supabase anon-key na audit

Niet kritiek (anon-key is meant to be public), maar als je de oude testkey wilt rouleren: Supabase dashboard → Settings → API → "Roll anon key". Daarna nieuwe key in de HTML zetten.

## Threat model

| Aanvaller | Wat kunnen ze nu? | Wat kunnen ze NA bovenstaande fixes? |
|---|---|---|
| Random bezoeker zonder password | Site openen via password-prompt | Idem |
| Random bezoeker MET site-password | Alles zien | Idem |
| Random bezoeker die curl naar Supabase doet | **Alle persoondata scrapen** | Geblokkeerd (RLS) |
| Random bezoeker met ASCII-skills | API misbruiken voor spam | Geblokkeerd (Origin check + rate limit) |
| Lek van Supabase DB | **Alle admin-wachtwoorden bekend** | Alleen gehashte pwds van Supabase Auth |
| XSS via member input | Geen — alles escaped | Idem + CSP als extra laag |
| Compromised admin | Kan alles wat admin kan | Idem (per role-permissions) |
| Iemand die HTML view-source doet | Site-password zichtbaar (`OmegaKsi35`) | Alleen SHA-256 hash zichtbaar |
