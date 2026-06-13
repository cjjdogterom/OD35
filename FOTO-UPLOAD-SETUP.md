# Foto-uploaden door leden + blokkades

Vanaf nu mogen alle ingelogde leden foto's uploaden. Admins zien bij elke foto
wie hem heeft geüpload en kunnen iemand blokkeren voor verder uploaden.

## SQL — draai dit eenmalig in Supabase → SQL Editor

```sql
-- 1. Bijhouden wie een foto heeft geüpload
ALTER TABLE fotos ADD COLUMN IF NOT EXISTS uploaded_by text;

-- 2. Blokkadelijst voor foto-uploaden
CREATE TABLE IF NOT EXISTS upload_blokkades (
  email text PRIMARY KEY,
  naam text,
  reden text,
  door text,
  aangemaakt_op timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE upload_blokkades ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON upload_blokkades TO authenticated;

-- Hulpfuncties (draaien met verhoogde rechten, los van RLS)
CREATE OR REPLACE FUNCTION is_app_admin() RETURNS boolean AS $$
  SELECT lower(coalesce(auth.email(),'')) = 'cjj.dogterom@gmail.com'
      OR EXISTS (SELECT 1 FROM admins a WHERE lower(a.email) = lower(coalesce(auth.email(),'')));
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_geblokkeerd_voor_upload() RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM upload_blokkades
    WHERE lower(email) = lower(coalesce(auth.email(),''))
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Lezen: je eigen blokkade-status; admins zien de hele lijst
DROP POLICY IF EXISTS "blokkades lezen" ON upload_blokkades;
CREATE POLICY "blokkades lezen" ON upload_blokkades FOR SELECT TO authenticated
  USING (lower(email) = lower(coalesce(auth.email(),'')) OR is_app_admin());

-- Beheren (blokkeren/deblokkeren): alleen admins
DROP POLICY IF EXISTS "admins beheren blokkades" ON upload_blokkades;
CREATE POLICY "admins beheren blokkades" ON upload_blokkades FOR ALL TO authenticated
  USING (is_app_admin()) WITH CHECK (is_app_admin());

-- 3. Ingelogde leden mogen foto-rijen toevoegen, behalve geblokkeerden
GRANT INSERT ON fotos TO authenticated;
DROP POLICY IF EXISTS "leden fotos toevoegen" ON fotos;
CREATE POLICY "leden fotos toevoegen" ON fotos FOR INSERT TO authenticated
  WITH CHECK (NOT is_geblokkeerd_voor_upload());

-- 4. Storage: ingelogde leden mogen bestanden uploaden naar bucket 'fotos',
--    behalve geblokkeerden
DROP POLICY IF EXISTS "leden uploaden naar fotos" ON storage.objects;
CREATE POLICY "leden uploaden naar fotos" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'fotos' AND NOT is_geblokkeerd_voor_upload());

NOTIFY pgrst, 'reload schema';
```

## Hoe het werkt

- **Leden** zien in een album de knop "↑ Foto's uploaden" en kunnen foto's
  toevoegen. Bij elke upload wordt hun e-mailadres opgeslagen.
- **Admins** zien onder elke foto wie hem heeft geüpload, met een knop
  **blokkeer**. Geblokkeerde uploaders kunnen geen foto's meer toevoegen
  (afgedwongen in de database, niet alleen in de site).
- Met de knop **⚙ Geblokkeerde uploaders** (in een album, alleen admin) zie je
  de lijst en kun je blokkades weer opheffen. Deblokkeren kan ook direct via de
  rode "geblokkeerd ✕"-knop onder een foto.
- De hoofdadmin kan niet geblokkeerd worden.

> Werkt vóór het draaien van de SQL: niets blokkeert nog, en uploaden door
> niet-admins faalt op de database tot de policies staan. Draai de SQL om het
> te activeren.
