# Klaverjas-ranglijst — eenmalige Supabase-setup

De ranglijst (gewonnen potjes per lid) bewaart elk uitgespeeld potje in één tabel.
Draai onderstaande SQL één keer in **Supabase → SQL Editor**. Zonder deze tabel werkt
het spel gewoon, maar toont de ranglijst de melding dat hij nog niet is ingericht.

```sql
-- Tabel: één rij per uitgespeeld potje
create table if not exists public.klaverjas_potjes (
  id          uuid primary key default gen_random_uuid(),
  gespeeld_op timestamptz not null default now(),
  data        jsonb not null
);

create index if not exists klaverjas_potjes_tijd_idx
  on public.klaverjas_potjes (gespeeld_op desc);

-- Row Level Security: ingelogde leden mogen lezen en een potje toevoegen.
alter table public.klaverjas_potjes enable row level security;

drop policy if exists "leden lezen potjes" on public.klaverjas_potjes;
create policy "leden lezen potjes"
  on public.klaverjas_potjes for select
  to authenticated
  using (true);

drop policy if exists "leden voegen potje toe" on public.klaverjas_potjes;
create policy "leden voegen potje toe"
  on public.klaverjas_potjes for insert
  to authenticated
  with check (true);
```

## Wat er wordt opgeslagen

Per potje één rij met in `data` o.a.:

```json
{
  "gespeeld_op": "2026-06-21T19:30:00.000Z",
  "score_a": 1840,
  "score_b": 1620,
  "winnaar": "A",
  "spelers": [
    { "email": "...", "naam": "...", "team": 0, "won": true }
  ]
}
```

Alleen **echte spelers** komen in `spelers` (bots niet). De ranglijst telt client-side
per e-mailadres hoeveel potjes gespeeld en gewonnen zijn. De host van de tafel schrijft
de rij weg zodra het potje (16 ronden) is uitgespeeld.
