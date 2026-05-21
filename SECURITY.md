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

## Wat JIJ moet doen (vereist Supabase-toegang)

### 🔴 KRITIEK — RLS op `personen` tabel verstrakken

**Probleem**: iedereen die de site-URL kent kan met de publieke anon-key álle personeelsdata scrapen (e-mails, mobiele nummers, adressen) zonder ooit het site-wachtwoord in te vullen. Test:
```bash
curl "https://mxbtmbcgycjqapjzulrp.supabase.co/rest/v1/personen?select=*" \
  -H "apikey: <anon-key uit HTML>"
# → 200 OK met alle 399 records
```

**Oplossing A (snel, beperkt)**: maak SELECT alleen voor admins toegankelijk. Nadeel: niet-admins kunnen de site niet meer gebruiken.
```sql
DROP POLICY IF EXISTS "anon mag personen lezen" ON personen;
CREATE POLICY "auth mag personen lezen" ON personen FOR SELECT TO authenticated USING (true);
```

**Oplossing B (aanbevolen)**: maak een gedeeld "viewer"-account in Supabase Auth, sla het wachtwoord op in een Vercel env var, en log automatisch in als die viewer na het site-wachtwoord. Vereist code-aanpassing — zeg het als je dit wilt, dan bouw ik het.

**Oplossing C (zwaarder)**: geef elk lid een eigen Supabase Auth account. Meer onderhoud maar volledig veilig.

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
