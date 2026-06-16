# Huisplattegrond (kamers)

Een tab met een miniatuur-dwarsdoorsnede van Oude Delft 35. Per kamer kun je een
naam geven en bijhouden **wie de kamer bewoond heeft**, in volgorde: bovenaan wie
er nú woont, daaronder wie er vroeger zaten.

**Voor nu is deze tab volledig admin-only** — alleen admins zien hem én alleen
admins kunnen lezen/bewerken. De database dwingt dit af (niet alleen de interface).

## SQL — draai dit eenmalig in Supabase → SQL Editor

```sql
CREATE TABLE IF NOT EXISTS kamers (
  kamer_id text PRIMARY KEY,
  naam text,
  bewoners jsonb NOT NULL DEFAULT '[]'::jsonb,
  bijgewerkt_op timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE kamers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON kamers FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON kamers TO authenticated;

-- Admincheck (idempotent; bestaat mogelijk al)
CREATE OR REPLACE FUNCTION is_app_admin() RETURNS boolean AS $$
  SELECT lower(coalesce(auth.email(),'')) = 'cjj.dogterom@gmail.com'
      OR EXISTS (SELECT 1 FROM admins a WHERE lower(a.email) = lower(coalesce(auth.email(),'')));
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Voor nu: ALLES (lezen én beheren) uitsluitend voor admins.
-- (De DROP's halen een eventuele eerdere publieke-leesregel weg.)
DROP POLICY IF EXISTS "kamers leden lezen" ON kamers;
DROP POLICY IF EXISTS "kamers admins beheren" ON kamers;
DROP POLICY IF EXISTS "kamers admins alles" ON kamers;
CREATE POLICY "kamers admins alles" ON kamers FOR ALL TO authenticated
  USING (is_app_admin()) WITH CHECK (is_app_admin());

NOTIFY pgrst, 'reload schema';
```

## Hoe het werkt
- Nieuwe tab **🏠 Huisplattegrond** — alleen zichtbaar voor admins.
- Klik op een kamer → rechts de naam en de lijst **wie de kamer bewoond heeft**
  (bovenaan = nu, met een "nu"-badge; daaronder de vroegere bewoners).
- **✎ Kamer bewerken** (admin): pas de kamernaam aan en beheer de bewonerslijst.
  Met **▲ / ▼** zet je iemand boven of onder een ander — die volgorde ís de
  geschiedenis van wie er gewoond heeft. **+ persoon** voegt een regel toe,
  **✕** verwijdert er een.
- Opslaan bewaart de lijst in DB-volgorde (bovenste = huidige bewoner).

## Later: leden zichzelf laten toevoegen
Nu is alles admin-only. Wil je later dat leden zichzelf in een kamer kunnen
zetten, dan kan de SELECT-policy verruimd worden naar alle leden en een
INSERT/UPDATE-policy worden toegevoegd die alleen het toevoegen van de **eigen
naam** toestaat. Dat is bewust nog niet gedaan.
