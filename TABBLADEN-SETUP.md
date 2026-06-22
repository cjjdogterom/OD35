# Tabbladen per jaargang — eenmalige Supabase-setup

De hoofdadmin kan op de tab **Tabbladen** per jaargang aan/uitzetten welke tabbladen
leden zien. Die instelling wordt in één tabel bewaard. Draai onderstaande SQL één keer
in **Supabase → SQL Editor**. Zonder deze tabel werkt de site gewoon (alle tabbladen
zichtbaar); de beheerpagina meldt dan dat de tabel nog niet is aangemaakt.

```sql
create table if not exists public.tab_zichtbaarheid (
  id         int primary key default 1,
  config     jsonb not null default '{}'::jsonb,
  bijgewerkt timestamptz not null default now()
);

-- één configregel
insert into public.tab_zichtbaarheid (id, config)
values (1, '{}'::jsonb)
on conflict (id) do nothing;

alter table public.tab_zichtbaarheid enable row level security;

-- Alle ingelogde leden mogen de config LEZEN (nodig om hun eigen tabbladen te bepalen).
drop policy if exists "leden lezen tab-config" on public.tab_zichtbaarheid;
create policy "leden lezen tab-config"
  on public.tab_zichtbaarheid for select
  to authenticated
  using (true);

-- Schrijven gebeurt alleen via de (hoofdadmin-only) beheerpagina.
drop policy if exists "schrijf tab-config" on public.tab_zichtbaarheid;
create policy "schrijf tab-config"
  on public.tab_zichtbaarheid for all
  to authenticated
  using (true)
  with check (true);
```

## Hoe het werkt

- In `config` staat per tab een lijst jaargangen waarvoor die tab **verborgen** is,
  bijvoorbeeld: `{ "klaverjas": [2020, 2021], "fotos": [2019] }`.
- Een lege lijst (of geen vermelding) = de tab is voor iedereen zichtbaar.
- **Admins en de hoofdadmin zien altijd alle tabbladen**, zodat beheer mogelijk blijft.
- Een lid ziet de wijziging zodra het de pagina opnieuw laadt.

> De schrijf-policy staat hierboven open voor alle ingelogde leden, maar de
> beheerpagina zelf is alleen voor de hoofdadmin zichtbaar. Wil je het ook
> server-side dichttimmeren, vervang dan de `using/with check (true)` door een
> check op je admins-tabel (bijv. `exists (select 1 from public.admins
> where lower(email) = lower(auth.jwt() ->> 'email') and rol = 'hoofdadmin')`).
