# iPhone-app "Oude Delft 35" — setup

De app staat in de map `app/` en is een **Expo**-app (zelfde opzet als de TicketFlow-app).
Bouwen, ondertekenen en uploaden gaat via **EAS** in de cloud — er is geen Xcode of
certificaat op deze Mac nodig. Expo-project: `@ticketflowtickets/oude-delft-35`.

Het is de website in een app-jasje, met daarbovenop:

- **Face ID-slot** — na de eerste keer inloggen vraagt de app of je hem wilt beveiligen.
  Wijzigen via het thema-knopje op de site → **App-instellingen** (alleen zichtbaar in de app).
  Na 1 minuut op de achtergrond gaat hij weer op slot.
- **Zet in mijn contacten** — knop op de persoonskaart; opent het iPhone-scherm "Nieuw contact", al ingevuld.
- **Bewaar in fotorol** — knop in de fotoweergave.
- **Pushmeldingen** — bij een nieuw agendapunt (beheerder kiest bij opslaan) en bij de huisauto
  (overgenomen, je bent chauffeur, rit geannuleerd). Aantikken opent het juiste tabblad.
- Bellen/mailen/appen via de iPhone, externe links in een ingebouwde Safari,
  naar beneden trekken = verversen, nette melding zonder internet.

De app laadt altijd de live site, dus wijzigingen aan de site zijn meteen in de app te zien.
De app-knoppen verschijnen alleen in de app (`IN_APP` in de site); in de browser verandert niets.

## 1. Supabase — tabel voor pushmeldingen (eenmalig)

Draai dit in **Supabase → SQL Editor**:

```sql
create table if not exists public.push_tokens (
  token      text primary key,          -- ExponentPushToken[…] van de app
  email      text not null,             -- login-e-mail (kleine letters)
  platform   text not null default 'ios',
  omgeving   text not null default 'production',
  bijgewerkt timestamptz not null default now()
);
create index if not exists push_tokens_email_idx on public.push_tokens (email);

alter table public.push_tokens enable row level security;

-- Je mag alleen je eigen toestel afmelden (bij uitloggen).
drop policy if exists "push eigen verwijderen" on public.push_tokens;
create policy "push eigen verwijderen" on public.push_tokens
  for delete to authenticated
  using (lower(email) = lower(coalesce(auth.email(), '')));

-- Aanmelden gaat via deze functie: koppelt het toestel altijd aan wie nú is ingelogd
-- (ook als er eerder iemand anders op hetzelfde toestel was ingelogd).
create or replace function public.registreer_push_token(p_token text, p_omgeving text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.email() is null or p_token is null or length(p_token) > 200 then
    return;
  end if;
  insert into push_tokens (token, email, platform, omgeving, bijgewerkt)
  values (p_token, lower(auth.email()), 'ios', coalesce(p_omgeving, 'production'), now())
  on conflict (token) do update
    set email = excluded.email, omgeving = excluded.omgeving, bijgewerkt = now();
end;
$$;
revoke all on function public.registreer_push_token(text, text) from public, anon;
grant execute on function public.registreer_push_token(text, text) to authenticated;
```

Lezen en versturen gebeurt alleen door de server (service-role), dus er is geen lees-policy.
Meldingen gaan via de Expo-pushdienst (`lib/push.js`); daarvoor is **geen** Apple-sleutel in
Vercel nodig — EAS koppelt de pushsleutel van Apple bij het bouwen.

## 2. Nieuwe versie bouwen en naar TestFlight sturen

```bash
cd app
npx eas-cli@latest build --platform ios --profile production --auto-submit
```

- Het buildnummer gaat automatisch omhoog (`autoIncrement`).
- De eerste keer vraagt EAS om in te loggen bij Apple en maakt het zelf een
  distributiecertificaat, provisioning profile en pushsleutel aan. Die bewaart EAS; volgende
  keren gaat het vanzelf.
- `--auto-submit` zet de build na het bouwen direct in App Store Connect → TestFlight
  (verwerking bij Apple duurt ±15 minuten).
- Alleen de site aangepast? Dan is geen nieuwe app-versie nodig: de app laadt de live site.

Een TestFlight-build werkt 90 dagen. Voor externe testers (via openbare link) keurt Apple
de eerste build van een versie; geef daarbij een testaccount op (e-mail + wachtwoord via
"Beheerder inloggen met wachtwoord").

## Server-onderdelen

- `lib/push.js` — verstuurt meldingen via de Expo-pushdienst, ruimt verwijderde apps op.
- `lib/huisauto.js` — meldingen bij overname / chauffeur / annulering.
- `api/gmail-send.js` — `type: 'push-agenda'`, alleen voor beheerders.
- Geen extra Vercel-functies (Hobby-plan: max 12). `.vercelignore` houdt `app/` van de website.
