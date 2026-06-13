# Wandelgangen (forum)

Een tab waar ingelogde leden berichten kunnen plaatsen en op elkaar reageren.
Iedereen die is ingelogd kan meelezen. Een bericht verwijderen kan alleen de
**plaatser zelf** of een **admin**.

## SQL — draai dit eenmalig in Supabase → SQL Editor

```sql
CREATE TABLE IF NOT EXISTS wandelgangen (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  email text NOT NULL,
  naam text,
  bericht text NOT NULL,
  aangemaakt_op timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE wandelgangen ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, DELETE ON wandelgangen TO authenticated;

-- Admincheck (idempotent; bestaat mogelijk al)
CREATE OR REPLACE FUNCTION is_app_admin() RETURNS boolean AS $$
  SELECT lower(coalesce(auth.email(),'')) = 'cjj.dogterom@gmail.com'
      OR EXISTS (SELECT 1 FROM admins a WHERE lower(a.email) = lower(coalesce(auth.email(),'')));
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Iedereen die ingelogd is mag lezen
DROP POLICY IF EXISTS "wandelgangen lezen" ON wandelgangen;
CREATE POLICY "wandelgangen lezen" ON wandelgangen FOR SELECT TO authenticated USING (true);

-- Plaatsen: alleen onder je eigen e-mailadres
DROP POLICY IF EXISTS "wandelgangen plaatsen" ON wandelgangen;
CREATE POLICY "wandelgangen plaatsen" ON wandelgangen FOR INSERT TO authenticated
  WITH CHECK (lower(email) = lower(coalesce(auth.email(),'')));

-- Verwijderen: eigen bericht OF een admin
DROP POLICY IF EXISTS "wandelgangen verwijderen" ON wandelgangen;
CREATE POLICY "wandelgangen verwijderen" ON wandelgangen FOR DELETE TO authenticated
  USING (lower(email) = lower(coalesce(auth.email(),'')) OR is_app_admin());

NOTIFY pgrst, 'reload schema';
```

## Hoe het werkt
- Nieuwe tab **Wandelgangen** (voor alle ingelogde leden).
- Bovenaan een tekstvak om een bericht te plaatsen.
- Berichten staan eronder, nieuwste eerst, met naam + aankomstjaar van de
  plaatser (gekoppeld via het e-mailadres aan de ledenlijst) en datum/tijd.
- Een **Verwijderen**-knop verschijnt alleen bij je eigen berichten, en bij
  alle berichten als je admin bent. De database dwingt dit ook af.
