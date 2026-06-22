# Huisplattegrond (kamers)

Een tab met een miniatuur-dwarsdoorsnede van Oude Delft 35. Per kamer kun je een
naam geven en bijhouden **wie de kamer bewoond heeft**, in volgorde: bovenaan wie
er nú woont, daaronder wie er vroeger zaten.

**De huisplattegrond is zichtbaar voor alle leden en door alle ingelogde leden te
bewerken.** De database staat daarom lezen én schrijven toe voor elke ingelogde
gebruiker.

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

-- Iedere ingelogde gebruiker mag lezen én beheren.
DROP POLICY IF EXISTS "kamers admins alles" ON kamers;
DROP POLICY IF EXISTS "kamers admins beheren" ON kamers;
DROP POLICY IF EXISTS "kamers leden lezen" ON kamers;
DROP POLICY IF EXISTS "kamers leden beheren" ON kamers;
CREATE POLICY "kamers leden lezen"   ON kamers FOR SELECT TO authenticated USING (true);
CREATE POLICY "kamers leden beheren" ON kamers FOR ALL    TO authenticated USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
```

> Draaide je eerder de admin-only versie? Dan volstaat het bovenstaande blok —
> het vervangt de oude admin-policy door de open variant.

## Hoe het werkt
- Tab **Huisplattegrond** — zichtbaar voor alle leden (en regelbaar via Tabbladen).
- Klik op een kamer → rechts de naam en de lijst **wie de kamer bewoond heeft**
  (bovenaan = nu, met een "nu"-badge; daaronder de vroegere bewoners).
- **✎ Kamer bewerken** (elk ingelogd lid): pas de kamernaam aan en beheer de
  bewonerslijst. Vul naast elke naam het jaar in; het hoogste jaar staat bovenaan
  als huidige bewoner. **+ persoon** voegt een regel toe, **✕** verwijdert er een.
- Klik op een bewonernaam → een pop-up met diens **route** door het huis.
