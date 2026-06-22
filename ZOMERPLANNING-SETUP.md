# Zomerplanning — eenmalige Supabase-setup

De tab **Zomerplanning** (zichtbaar voor jaargang 2021–2026) laat iedereen in zijn
eigen rij tekenen waar hij deze zomer is. Eén tabel bewaart de tekeningen. Draai
onderstaande SQL één keer in **Supabase → SQL Editor**. Zonder deze tabel meldt de
tab dat hij nog niet is ingericht.

```sql
create table if not exists public.zomerplanning (
  id         uuid primary key default gen_random_uuid(),
  jaar       int  not null,
  email      text not null,
  naam       text,
  start_idx  int  not null,
  eind_idx   int  not null,
  tekening   text,                 -- PNG data-URL van de doodle (voor weergave)
  objecten   text,                 -- JSON van de tekenobjecten (om later te kunnen bewerken)
  bijgewerkt timestamptz not null default now()
);
create index if not exists zomerplanning_jaar_idx on public.zomerplanning (jaar);
-- Bestaat de tabel al van een eerdere versie? Voeg de kolom toe:
alter table public.zomerplanning add column if not exists objecten text;

alter table public.zomerplanning enable row level security;

-- Iedereen die is ingelogd mag de planning LEZEN.
drop policy if exists "zomer lezen" on public.zomerplanning;
create policy "zomer lezen" on public.zomerplanning
  for select to authenticated using (true);

-- Je mag alleen je EIGEN rij toevoegen/bewerken/verwijderen (email = je login).
drop policy if exists "zomer eigen toevoegen" on public.zomerplanning;
create policy "zomer eigen toevoegen" on public.zomerplanning
  for insert to authenticated
  with check (lower(email) = lower(coalesce(auth.email(),'')));

drop policy if exists "zomer eigen wijzigen" on public.zomerplanning;
create policy "zomer eigen wijzigen" on public.zomerplanning
  for update to authenticated
  using (lower(email) = lower(coalesce(auth.email(),'')))
  with check (lower(email) = lower(coalesce(auth.email(),'')));

drop policy if exists "zomer eigen verwijderen" on public.zomerplanning;
create policy "zomer eigen verwijderen" on public.zomerplanning
  for delete to authenticated
  using (lower(email) = lower(coalesce(auth.email(),'')));
```

## Hoe het werkt
- **Rijen** = leden met aankomstjaar 2021–2026. **Kolommen** = halve weken van
  1 juli t/m 1 september (elke week in twee helften).
- Je klikt in **je eigen rij** op een begin-vak en daarna op een eind-vak; dan opent
  een tekenvenster waarin je met muis/vinger een doodle maakt (kleur + dikte).
- De doodle komt over de geselecteerde cellen te staan, zodat iedereen ziet waar je bent.
- Je kunt alleen je eigen tekeningen verwijderen (kruisje op de tekening). De database
  dwingt af dat je alleen je eigen rij bewerkt.
- Het jaar is automatisch het huidige kalenderjaar.
