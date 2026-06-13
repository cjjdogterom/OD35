# Persoonlijke login (e-mailcode) — instelgids

De universele wachtwoordtoegang is vervangen door persoonlijke login: elk lid
logt in met zijn **e-mailadres** en een **6-cijferige code** die per mail komt.
Toegang = je e-mailadres staat in de ledenlijst (`personen`) of bij de admins.

## Stap C — Mailsjabloon met de code

Supabase → **Authentication → Emails → Templates → "Magic Link"**.
Vervang de inhoud door (zodat de **code** getoond wordt i.p.v. een link):

```html
<h2>Inlogcode Oude Delft 35</h2>
<p>Hallo,</p>
<p>Je persoonlijke inlogcode voor de oud-huisgenotenlijst is:</p>
<p style="font-size:30px; font-weight:bold; letter-spacing:8px; color:#2a4d82;">{{ .Token }}</p>
<p>Vul deze 6 cijfers in op de website. De code is 1 uur geldig.</p>
<p style="color:#888; font-size:13px;">Heb je dit niet aangevraagd? Dan kun je deze e-mail negeren — er gebeurt niets.</p>
```

> Belangrijk: het is het **"Magic Link"** sjabloon dat bij `signInWithOtp` hoort.
> De variabele `{{ .Token }}` is de 6-cijferige code.

Stel bij **Authentication → Providers → Email** ook in:
- "Allow new users to sign up" → **UIT**
- (optioneel) "OTP Expiry" → 3600 (1 uur)

## Stap E — Vercel environment variable

`SUPABASE_SERVICE_ROLE_KEY` = de **service_role** sleutel
(Supabase → Settings → API → Project API keys → `service_role`, secret).
Zet 'm in Vercel (project → Settings → Environment Variables → Production) en
**redeploy**.

## Stap 3 — Database op slot (DIT is het echte beveiligingsmoment)

Voer dit uit in Supabase → **SQL Editor**. Hierna kan niemand zonder
persoonlijke login nog gegevens lezen (ook niet via de publieke sleutel):

```sql
-- 1. Niet-ingelogde (anon) toegang tot gevoelige tabellen volledig intrekken.
--    Dit blokkeert op privilege-niveau, los van welke policies er staan.
REVOKE SELECT ON personen        FROM anon;
REVOKE SELECT ON evenementen     FROM anon;
REVOKE SELECT ON contactpersonen FROM anon;
REVOKE SELECT ON huis_oudste     FROM anon;
REVOKE SELECT ON aanwezigheid    FROM anon;
REVOKE SELECT ON albums          FROM anon;
REVOKE SELECT ON fotos           FROM anon;
REVOKE SELECT ON admins          FROM anon;
REVOKE SELECT ON wijzigingsverzoeken FROM anon;

-- 2. Ingelogde leden mogen WEL lezen.
GRANT SELECT ON personen, evenementen, contactpersonen, huis_oudste,
                aanwezigheid, albums, fotos TO authenticated;

-- 3. Zorg dat er een SELECT-policy bestaat voor ingelogde leden (RLS).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['personen','evenementen','contactpersonen',
        'huis_oudste','aanwezigheid','albums','fotos'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE tablename = t AND policyname = 'leden mogen lezen'
    ) THEN
      EXECUTE format(
        'CREATE POLICY "leden mogen lezen" ON %I FOR SELECT TO authenticated USING (true);', t);
    END IF;
  END LOOP;
END $$;

-- 4. Het publieke inschrijfformulier blijft werken (anon mag alleen INSERT
--    op wijzigingsverzoeken, niet lezen).
GRANT INSERT ON wijzigingsverzoeken TO anon;

-- 5. Foto-bestanden (storage) alleen voor ingelogde leden.
--    (Pas aan als je albums openbaar wilt houden.)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE schemaname='storage' AND tablename='objects'
                 AND policyname='fotos lezen ingelogd') THEN
    CREATE POLICY "fotos lezen ingelogd" ON storage.objects
      FOR SELECT TO authenticated USING (bucket_id = 'fotos');
  END IF;
END $$;
-- En anon leestoegang tot de fotos-bucket intrekken:
DROP POLICY IF EXISTS "Public read fotos" ON storage.objects;

NOTIFY pgrst, 'reload schema';
```

## Veilige uitrolvolgorde

1. C + E klaar (mailsjabloon + service key + signups uit) → redeploy.
2. **Test eerst zelf**: ga naar de site, log in met je eigen e-mailadres, check
   of de code aankomt (ook spam) en of je binnenkomt.
   - Lukt de code niet? De hoofdadmin kan altijd binnen via
     **"Beheerder inloggen met wachtwoord"** onderaan het inlogscherm
     (`cjj.dogterom@gmail.com`).
3. Werkt het? Voer dan **stap 3** (de SQL hierboven) uit → gegevens zijn nu
   afgeschermd.
4. Test nog één keer met een tweede (test)lid.
5. Mail de leden dat ze voortaan inloggen met hun e-mailadres + code.

## Iemand zonder e-mail / verkeerd e-mailadres

- Lid meldt zich via een huisgenoot bij de superadmin.
- Superadmin voegt de persoon toe (of werkt het e-mailadres bij) in de app.
- Klaar — dat e-mailadres kan meteen een code aanvragen op de inlogpagina.
