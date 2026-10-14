# iPhone-app "Oude Delft 35" — setup

De app staat in de map `ios/` (Xcode-project `ios/OD35.xcodeproj`). Het is de website
in een app-jasje, met daarbovenop:

- **Face ID-slot** — na de eerste keer inloggen vraagt de app of je hem wilt beveiligen.
  Aan/uit later via Instellingen → Oude Delft 35. Na 1 minuut op de achtergrond gaat hij weer op slot.
- **Zet in mijn contacten** — knop op de persoonskaart; opent het iPhone-scherm "Nieuw contact", al ingevuld.
- **Bewaar in fotorol** — knop in de fotoweergave.
- **Pushmeldingen** — bij een nieuw agendapunt (beheerder kiest bij opslaan) en bij de huisauto
  (overgenomen, je bent chauffeur, rit geannuleerd). Aantikken opent het juiste tabblad.
- Bellen/mailen/appen via de iPhone, downloads (Excel) via het deelmenu, externe links in een ingebouwde Safari,
  naar beneden trekken = verversen, nette melding zonder internet.

De app laadt altijd de live site, dus wijzigingen aan de site zijn meteen in de app te zien.
De app-knoppen verschijnen alleen in de app (`IN_APP` in de site); in de browser verandert niets.

## 1. Supabase — tabel voor pushmeldingen (eenmalig)

Draai dit in **Supabase → SQL Editor**:

```sql
create table if not exists public.push_tokens (
  token      text primary key,          -- apparaatnummer van Apple
  email      text not null,             -- login-e-mail (kleine letters)
  platform   text not null default 'ios',
  omgeving   text not null default 'production',  -- 'sandbox' voor builds uit Xcode
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
  values (p_token, lower(auth.email()), 'ios',
          case when p_omgeving = 'sandbox' then 'sandbox' else 'production' end, now())
  on conflict (token) do update
    set email = excluded.email, omgeving = excluded.omgeving, bijgewerkt = now();
end;
$$;
revoke all on function public.registreer_push_token(text, text) from public, anon;
grant execute on function public.registreer_push_token(text, text) to authenticated;
```

Lezen en versturen gebeurt alleen door de server (service-role), dus er is geen lees-policy.

## 2. Apple — sleutel voor pushmeldingen (eenmalig)

1. Ga naar [developer.apple.com/account/resources/authkeys](https://developer.apple.com/account/resources/authkeys/list) → **+**.
2. Naam: `OD35 push`, vink **Apple Push Notifications service (APNs)** aan → Continue → Register.
3. **Download** het `.p8`-bestand (kan maar één keer!) en noteer de **Key ID**.
4. Je **Team ID** staat op [developer.apple.com/account](https://developer.apple.com/account) → Membership details.

Zet in **Vercel → Settings → Environment Variables** (Production):

| Naam | Waarde |
|---|---|
| `APNS_KEY` | de hele inhoud van het `.p8`-bestand (inclusief `-----BEGIN PRIVATE KEY-----`) |
| `APNS_KEY_ID` | de Key ID (10 tekens) |
| `APNS_TEAM_ID` | je Team ID (10 tekens) |
| `APNS_BUNDLE_ID` | `nl.oudedelft35.app` |

Daarna opnieuw deployen. Zonder deze variabelen doet de server niets met pushmeldingen (geen fout).

## 3. Nieuwe versie naar TestFlight

1. Verhoog in Xcode bij het target **OD35 → General** het **Build**-nummer (1, 2, 3 …).
2. **Product → Archive** (bovenin "Any iOS Device" kiezen).
3. In de Organizer: **Distribute App → App Store Connect → Upload**.
4. Na ±15 minuten verschijnt de build in App Store Connect → TestFlight.

Een TestFlight-build werkt 90 dagen. Voor externe testers (via openbare link) keurt Apple
de eerste build van een versie; geef daarbij een testaccount op (e-mail + wachtwoord via
"Beheerder inloggen met wachtwoord").

## Server-onderdelen

- `lib/push.js` — verstuurt meldingen via APNs (HTTP/2 + ES256-token), ruimt ongeldige toestellen op.
- `lib/huisauto.js` — meldingen bij overname / chauffeur / annulering.
- `api/gmail-send.js` — `type: 'push-agenda'`, alleen voor beheerders.
- Geen extra Vercel-functies (Hobby-plan: max 12).
