const { createClient } = require('@supabase/supabase-js');
const {
  BOUNCED_EMAILS_JUN2026,
  SUPABASE_URL,
  findBouncedMatches,
  groupMatchesByPerson,
} = require('../lib/bounced-emails-jun2026');

const ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14YnRtYmNneWNqcWFwanp1bHJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5MDQ4MzgsImV4cCI6MjA5MzQ4MDgzOH0.6Qowa_mqhH7YtrljF5fZnQzUaG_u4N5TodcnLzRhYSM';

const ALLOWED_ORIGINS = [
  'https://oudedelft35.com',
  'https://www.oudedelft35.com',
  'https://od-35.vercel.app',
];

function isAllowedOrigin(origin) {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  return /^https:\/\/od-35[a-z0-9-]*\.vercel\.app$/.test(origin);
}

module.exports = async function handler(req, res) {
  const origin = req.headers.origin || '';
  const isAllowed = isAllowedOrigin(origin);
  res.setHeader('Access-Control-Allow-Origin', isAllowed ? origin : ALLOWED_ORIGINS[0]);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Clean-Secret');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // Admin JWT of eenmalig geheim (CLEAN_BOUNCED_SECRET) vereist
  const secret = req.headers['x-clean-secret'];
  const expectedSecret = process.env.CLEAN_BOUNCED_SECRET;
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  let authorized = false;
  let adminToken = null;
  if (expectedSecret && secret === expectedSecret && serviceKey) {
    authorized = true;
  } else if (token) {
    try {
      const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: {
          apikey: ANON_KEY,
          Authorization: `Bearer ${token}`,
        },
      });
      if (r.ok) {
        const u = await r.json();
        const email = (u?.email || '').toLowerCase();
        if (email && !email.startsWith('viewer@') && !email.includes('viewer')) {
          authorized = true;
          adminToken = token;
        }
      }
    } catch (_) {}
  }

  if (!authorized) {
    return res.status(401).json({ error: 'Geen admin-toegang' });
  }

  const db = adminToken
    ? createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${adminToken}` } },
      })
    : createClient(SUPABASE_URL, serviceKey);
  const bouncedSet = new Set(BOUNCED_EMAILS_JUN2026);

  const { data: people, error } = await db
    .from('personen')
    .select('id, achternaam, voorletters, tussenvoegsel, email_1, email_2, email_3');

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  const matches = findBouncedMatches(people || [], bouncedSet);
  const perPerson = groupMatchesByPerson(matches);

  let ok = 0;
  let fail = 0;
  const errors = [];

  for (const [id, patch] of Object.entries(perPerson)) {
    const { data: updated, error: updateError } = await db.from('personen').update(patch).eq('id', id).select('id');
    if (updateError || !updated?.length) {
      fail += Object.keys(patch).length;
      if (errors.length < 5) {
        errors.push({ id, message: updateError?.message || 'geen rijen bijgewerkt (RLS?)' });
      }
    } else {
      ok += Object.keys(patch).length;
    }
  }

  const notInDb = BOUNCED_EMAILS_JUN2026.filter(
    (email) => !matches.some((m) => m.email === email)
  );

  return res.status(200).json({
    ok: true,
    removed: ok,
    failed: fail,
    persons: Object.keys(perPerson).length,
    notInDb,
    errors,
  });
};
