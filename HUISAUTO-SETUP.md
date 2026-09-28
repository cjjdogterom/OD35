# Huisauto — eenmalige Supabase-setup

De tab **Huisauto** (zichtbaar voor jaargang 2017 t/m het huidige jaar) laat bewoners
de huisauto boeken met een begin- en eindtijd. Eén tabel bewaart de boekingen. Draai
onderstaande SQL één keer in **Supabase → SQL Editor**. Zonder deze tabel meldt de tab
dat de boekingen niet geladen kunnen worden.

```sql
create table if not exists public.autoboekingen (
  id             uuid primary key default gen_random_uuid(),
  email          text not null,          -- wie heeft geboekt (login-e-mail, kleine letters)
  naam           text,
  aankomstjaar   int  not null,          -- voor de anciënniteit
  start_tijd     timestamptz not null,
  eind_tijd      timestamptz not null,
  chauffeur_naam text,
  chauffeur_email text,                  -- leeg bij "iemand anders"
  notitie        text,                   -- "waar ga je heen?" (optioneel)
  aangemaakt     timestamptz not null default now(),
  constraint autoboeking_tijd_ok check (eind_tijd > start_tijd),
  -- De database zelf voorkomt dubbele boekingen, ook als twee mensen tegelijk klikken.
  constraint autoboeking_geen_overlap
    exclude using gist (tstzrange(start_tijd, eind_tijd, '[)') with &&)
);
create index if not exists autoboekingen_start_idx on public.autoboekingen (start_tijd);

alter table public.autoboekingen enable row level security;

-- Iedereen die is ingelogd mag het overzicht LEZEN.
drop policy if exists "auto lezen" on public.autoboekingen;
create policy "auto lezen" on public.autoboekingen
  for select to authenticated using (true);

-- Géén schrijf-policies: boeken en annuleren gaat uitsluitend via de server
-- (/api/reserveer-plek met type 'auto'), die de anciënniteit controleert.
```

## Hoe het werkt

- **Wie:** alleen bewoners met aankomstjaar 2017 t/m het huidige jaar zien de tab en kunnen boeken.
- **Boeken:** dag kiezen in de maandkalender → begin- en eindtijd (per half uur) → chauffeur
  kiezen (zelf, een huisgenoot 2017+, of iemand anders) → optioneel een notitie.
  Meerdaags kan ("Ik ben meerdere dagen weg"), maximaal 7 dagen, maximaal 3 maanden vooruit.
- **Anciënniteit:** overlapt je boeking met die van een **jonger** jaar, dan kun je die
  overnemen (na bevestiging), zolang die rit nog niet begonnen is. De verdrongen boeker en
  diens chauffeur krijgen een mail. Boekingen van een ouder of gelijk jaar kun je niet overnemen.
- **Mails** (via de bestaande Gmail-instelling `GMAIL_USER` / `GMAIL_APP_PASSWORD`):
  - chauffeur (huisgenoot) krijgt een bevestiging bij het boeken;
  - bij overname: de verdrongen boeker + diens chauffeur;
  - bij annuleren: de chauffeur.
- **Kalenderkleuren:** licht = deels geboekt, donker = (bijna) de hele dag bezet
  (≥ 70% van 08:00–22:00), groen = jouw rit.
- **Annuleren:** alleen je eigen boekingen, via de dag in de kalender.

De server-logica staat in `lib/huisauto.js` en wordt aangeroepen vanuit
`api/reserveer-plek.js`. Dat is bewust: het Vercel Hobby-plan staat maximaal
12 serverless-functies toe, en die zitten allemaal vol.
