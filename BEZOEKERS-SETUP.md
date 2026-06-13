# Bezoekers-dashboard (alleen hoofdadmin)

De hoofdadmin krijgt een tab **Bezoekers** met: hoeveel leden hebben ingelogd,
wie dat zijn, het aantal unieke IP-adressen, en een kaart van Nederland met per
provincie het aantal bezoekers.

## SQL — draai dit eenmalig in Supabase → SQL Editor

```sql
CREATE TABLE IF NOT EXISTS bezoeken (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  email text,
  ip text,
  provincie text,
  land text,
  ingelogd_op timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE bezoeken ENABLE ROW LEVEL SECURITY;

-- Alleen de hoofdadmin mag het dashboard lezen
GRANT SELECT ON bezoeken TO authenticated;
DROP POLICY IF EXISTS "hoofdadmin leest bezoeken" ON bezoeken;
CREATE POLICY "hoofdadmin leest bezoeken" ON bezoeken FOR SELECT TO authenticated
  USING (lower(coalesce(auth.email(),'')) = 'cjj.dogterom@gmail.com');

NOTIFY pgrst, 'reload schema';
```

> Het registreren van bezoeken gebeurt via de serverfunctie `/api/log-visit`,
> die met de service-role-sleutel schrijft. Daarvoor is geen extra recht nodig
> (de service-role omzeilt RLS). Zorg dat `SUPABASE_SERVICE_ROLE_KEY` in Vercel
> staat (die staat er al voor de inlogcodes).

## Hoe het werkt

- Bij elk **eerste bezoek per browsersessie** registreert de site, via de
  serverfunctie, het e-mailadres van de ingelogde gebruiker, het IP-adres en —
  via gratis IP-geolocatie — de provincie.
- De tab **Bezoekers** (alleen voor de hoofdadmin) toont:
  - aantal unieke leden dat heeft ingelogd, totaal aantal bezoeken, unieke IP's
  - een tegelkaart van Nederland, per provincie gekleurd naar aantal bezoekers
  - een lijst met wie heeft ingelogd, hun provincie, aantal bezoeken en laatste keer

## Privacy (AVG)

Dit slaat IP-adressen en bij benadering de provincie van leden op — dat zijn
persoonsgegevens. Het dashboard is uitsluitend voor de hoofdadmin bedoeld voor
beheer en gebruiksinzicht. Bewaar niet langer dan nodig; je kunt de tabel
periodiek leegmaken met `DELETE FROM bezoeken WHERE ingelogd_op < now() - interval '1 year';`
