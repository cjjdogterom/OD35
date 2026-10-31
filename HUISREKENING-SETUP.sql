-- Dit bestand mag je opnieuw uitvoeren; bestaande gegevens blijven staan.
-- Huisrekening Omega Ksi: tabellen voor de OD35-site.
-- Uitvoeren in Supabase → SQL editor (of als migratie in supabase/migrations).

-- De volledige huisrekening staat als één JSON-document in één rij.
-- rev wordt bij elke opslag met 1 verhoogd; zo merkt de app het als twee beheerders tegelijk opslaan.
create table if not exists public.huisrekening (
  id smallint primary key default 1 check (id = 1),
  data jsonb not null,
  rev integer not null default 1,
  updated_at timestamptz not null default now(),
  updated_by text
);

-- Wie de huisrekening mag zien ('lezer'), afkoopmomenten mag invullen ('barman') of alles mag invoeren en opslaan ('beheerder').
-- Staat los van de site-admins. De hoofdadmin heeft altijd toegang en deelt dit uit
-- in het tabblad Huisrekening op de site; je hoeft hier dus niemand handmatig toe te voegen.
create table if not exists public.huisrekening_toegang (
  email text primary key check (email = lower(email)),
  rol text not null check (rol in ('lezer', 'barman', 'beheerder'))
);

-- Alleen de server (service role, via /api/huisrekening) leest en schrijft deze tabellen.
-- Daarom RLS aan en geen policies: de browser kan er niet rechtstreeks bij.
alter table public.huisrekening enable row level security;
-- Jaargangen waarvan iedereen automatisch lezer is (aangevinkt door de hoofdadmin).
create table if not exists public.huisrekening_jaargangen (
  jaar integer primary key
);
alter table public.huisrekening_jaargangen enable row level security;

alter table public.huisrekening_toegang enable row level security;

-- Opslaan met versiecontrole: lukt alleen als niemand anders intussen heeft opgeslagen.
-- Geeft de nieuwe rev terug, of null bij een conflict.
create or replace function public.huisrekening_opslaan(p_data jsonb, p_rev integer, p_email text)
returns integer
language plpgsql
as $$
declare
  new_rev integer;
begin
  update public.huisrekening
     set data = p_data, rev = rev + 1, updated_at = now(), updated_by = p_email
   where id = 1 and rev = p_rev
  returning rev into new_rev;
  return new_rev;
end;
$$;

revoke all on function public.huisrekening_opslaan(jsonb, integer, text) from public, anon, authenticated;

-- Opmerkingen en wijzigingsverzoeken van leden over een post of transactie.
-- Leden maken ze aan via /api/huisrekening?actie=meldingen; beheerders handelen ze af.
create table if not exists public.huisrekening_meldingen (
  id bigserial primary key,
  gemaakt timestamptz not null default now(),
  email text not null,
  naam text,
  maand text,
  onderwerp text,
  tekst text not null,
  status text not null default 'open' check (status in ('open', 'afgehandeld')),
  antwoord text,
  afgehandeld_door text,
  afgehandeld_op timestamptz
);
alter table public.huisrekening_meldingen enable row level security;

-- Rol 'barman' toestaan (voor een bestaande tabel van vóór deze rol).
alter table public.huisrekening_toegang drop constraint if exists huisrekening_toegang_rol_check;
alter table public.huisrekening_toegang add constraint huisrekening_toegang_rol_check check (rol in ('lezer', 'barman', 'beheerder'));

notify pgrst, 'reload schema';
