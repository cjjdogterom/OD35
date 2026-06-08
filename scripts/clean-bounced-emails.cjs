#!/usr/bin/env node
/**
 * Verwijdert bounce-adressen uit Supabase personen-tabel.
 * Gebruik: SUPABASE_SERVICE_ROLE_KEY=... node scripts/clean-bounced-emails.cjs
 */
const { createClient } = require('@supabase/supabase-js');
const {
  BOUNCED_EMAILS_JUN2026,
  SUPABASE_URL,
  findBouncedMatches,
  groupMatchesByPerson,
} = require('../lib/bounced-emails-jun2026');

async function main() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    console.error('SUPABASE_SERVICE_ROLE_KEY ontbreekt.');
    process.exit(1);
  }

  const db = createClient(SUPABASE_URL, serviceKey);
  const bouncedSet = new Set(BOUNCED_EMAILS_JUN2026);

  const { data: people, error } = await db
    .from('personen')
    .select('id, achternaam, voorletters, tussenvoegsel, email_1, email_2, email_3');

  if (error) {
    console.error('Ophalen personen mislukt:', error.message);
    process.exit(1);
  }

  const matches = findBouncedMatches(people || [], bouncedSet);
  console.log(`Gevonden: ${matches.length} bounce-adressen in ${Object.keys(groupMatchesByPerson(matches)).length} personen`);

  if (matches.length === 0) {
    console.log('Niets te doen.');
    return;
  }

  const perPerson = groupMatchesByPerson(matches);
  let ok = 0;
  let fail = 0;

  for (const [id, patch] of Object.entries(perPerson)) {
    const { error: updateError } = await db.from('personen').update(patch).eq('id', id);
    if (updateError) {
      console.error(`Fout bij ${id}:`, updateError.message);
      fail += Object.keys(patch).length;
    } else {
      ok += Object.keys(patch).length;
    }
  }

  const notInDb = BOUNCED_EMAILS_JUN2026.filter(
    (email) => !matches.some((m) => m.email === email)
  );

  console.log(`Klaar: ${ok} velden gewist, ${fail} mislukt.`);
  if (notInDb.length) {
    console.log(`Niet in DB (${notInDb.length}):`, notInDb.join(', '));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
