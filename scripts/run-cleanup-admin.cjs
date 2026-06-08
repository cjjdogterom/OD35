#!/usr/bin/env node
/**
 * Voert bounce-opschoning uit via admin Supabase-sessie.
 * Gebruik: ADMIN_EMAIL=... ADMIN_PASSWORD=... node scripts/run-cleanup-admin.cjs
 */
const { createClient } = require('@supabase/supabase-js');
const {
  BOUNCED_EMAILS_JUN2026,
  SUPABASE_URL,
  findBouncedMatches,
  groupMatchesByPerson,
} = require('../lib/bounced-emails-jun2026');

const anon = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14YnRtYmNneWNqcWFwanp1bHJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5MDQ4MzgsImV4cCI6MjA5MzQ4MDgzOH0.6Qowa_mqhH7YtrljF5fZnQzUaG_u4N5TodcnLzRhYSM';

async function cleanupWithServiceRole(serviceKey) {
  const db = createClient(SUPABASE_URL, serviceKey);
  return runCleanup(db);
}

async function cleanupWithAdmin(email, password) {
  const authClient = createClient(SUPABASE_URL, anon);
  const { data, error } = await authClient.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error('Admin login mislukt: ' + (error?.message || 'geen sessie'));
  const db = createClient(SUPABASE_URL, anon, {
    global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
  });
  return runCleanup(db);
}

async function runCleanup(db) {
  const bouncedSet = new Set(BOUNCED_EMAILS_JUN2026);
  const { data: people, error } = await db
    .from('personen')
    .select('id, achternaam, voorletters, tussenvoegsel, email_1, email_2, email_3');
  if (error) throw error;

  const matches = findBouncedMatches(people || [], bouncedSet);
  if (matches.length === 0) {
    console.log('Geen bounce-adressen meer in de database.');
    return { removed: 0, persons: 0, notInDb: BOUNCED_EMAILS_JUN2026 };
  }

  const perPerson = groupMatchesByPerson(matches);
  let ok = 0;
  let fail = 0;

  for (const [id, patch] of Object.entries(perPerson)) {
    const { data: updated, error: updateError } = await db.from('personen').update(patch).eq('id', id).select('id');
    if (updateError || !updated?.length) {
      console.error(`Fout bij ${id}:`, updateError?.message || 'geen rijen bijgewerkt (RLS?)');
      fail += Object.keys(patch).length;
    } else {
      ok += Object.keys(patch).length;
    }
  }

  const notInDb = BOUNCED_EMAILS_JUN2026.filter((email) => !matches.some((m) => m.email === email));
  return { removed: ok, failed: fail, persons: Object.keys(perPerson).length, notInDb };
}

async function main() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;

  let result;
  if (serviceKey) {
    console.log('Opschoning via service role key…');
    result = await cleanupWithServiceRole(serviceKey);
  } else if (adminEmail && adminPassword) {
    console.log('Opschoning via admin login…');
    result = await cleanupWithAdmin(adminEmail, adminPassword);
  } else {
    console.error('Zet SUPABASE_SERVICE_ROLE_KEY of ADMIN_EMAIL + ADMIN_PASSWORD.');
    process.exit(1);
  }

  console.log(`Klaar: ${result.removed} velden gewist bij ${result.persons} personen${result.failed ? `, ${result.failed} mislukt` : ''}.`);
  if (result.notInDb?.length) console.log('Niet in DB:', result.notInDb.join(', '));
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
