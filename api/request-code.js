const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://mxbtmbcgycjqapjzulrp.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14YnRtYmNneWNqcWFwanp1bHJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5MDQ4MzgsImV4cCI6MjA5MzQ4MDgzOH0.6Qowa_mqhH7YtrljF5fZnQzUaG_u4N5TodcnLzRhYSM';

const ALLOWED_ORIGINS = [
  'https://oudedelft35.com',
  'https://www.oudedelft35.com',
  'https://oudedelft35.nl',
  'https://www.oudedelft35.nl',
];
// Sta ook alle Vercel-deploys van dit project toe (*.vercel.app)
function originAllowed(origin) {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  try {
    const host = new URL(origin).hostname;
    return host.endsWith('.vercel.app')
        || host === 'oudedelft35.com' || host === 'www.oudedelft35.com'
        || host === 'oudedelft35.nl'  || host === 'www.oudedelft35.nl';
  } catch (_) { return false; }
}

// Eenvoudige rate-limit per cold start
const recent = new Map();
function rateLimited(key, maxPerMin) {
  const now = Date.now();
  const arr = (recent.get(key) || []).filter(t => now - t < 60_000);
  arr.push(now);
  recent.set(key, arr);
  return arr.length > maxPerMin;
}

module.exports = async function handler(req, res) {
  const origin = req.headers.origin || '';
  const isAllowed = originAllowed(origin);
  res.setHeader('Access-Control-Allow-Origin', isAllowed ? origin : ALLOWED_ORIGINS[0]);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!isAllowed) return res.status(403).json({ error: 'Origin not allowed' });

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (rateLimited('ip:' + ip, 8)) {
    return res.status(429).json({ error: 'Te veel pogingen. Wacht een minuut en probeer opnieuw.' });
  }

  const email = ((req.body && req.body.email) || '').trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(400).json({ error: 'Vul een geldig e-mailadres in.' });
  }
  // Per-email rate-limit (voorkomt mailbox-spam)
  if (rateLimited('email:' + email, 4)) {
    return res.status(429).json({ error: 'Er is net een code aangevraagd. Wacht even voor je het opnieuw probeert.' });
  }

  // Geblokkeerde adressen: geen toegang meer tot de site (krijgen nooit een inlogcode,
  // ook niet als ze nog in de ledenlijst staan). Adres in kleine letters.
  const GEBLOKKEERD = [
    'boele@cdehg.nl',
  ];
  if (GEBLOKKEERD.includes(email)) {
    return res.status(403).json({ error: 'Dit account heeft geen toegang meer tot de site.' });
  }

  const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SERVICE) {
    return res.status(500).json({ error: 'Server niet geconfigureerd (service key ontbreekt).' });
  }

  const admin = createClient(SUPABASE_URL, SERVICE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1. Staat dit e-mailadres in de ledenlijst (of is het een admin)?
  let allowed = false;
  try {
    const { data: persons, error: pErr } = await admin
      .from('personen')
      .select('email_1,email_2,email_3');
    if (pErr) throw pErr;
    allowed = (persons || []).some(p =>
      [p.email_1, p.email_2, p.email_3].some(e => (e || '').trim().toLowerCase() === email)
    );
    if (!allowed) {
      const { data: adm } = await admin.from('admins').select('email');
      allowed = (adm || []).some(a => (a.email || '').trim().toLowerCase() === email);
    }
  } catch (e) {
    console.error('Allowlist check fout:', e);
    return res.status(500).json({ error: 'Controle mislukt. Probeer het later opnieuw.' });
  }

  if (!allowed) {
    return res.status(403).json({
      error: 'Dit e-mailadres staat niet in de ledenlijst. Neem contact op met het bestuur als je toegang wilt.',
    });
  }

  // 2. Zorg dat er een (bevestigd) auth-account bestaat voor dit e-mailadres
  try {
    await admin.auth.admin.createUser({ email, email_confirm: true });
  } catch (e) {
    // Bestaat al → prima, negeren
  }

  // 3. Verstuur de 6-cijferige inlogcode (via de in Supabase ingestelde SMTP)
  const pub = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { error: otpErr } = await pub.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false },
  });
  if (otpErr) {
    console.error('OTP-fout:', otpErr);
    const msg = /seconds|rate|after/i.test(otpErr.message || '')
      ? 'Er is net een code verstuurd. Wacht even voor je een nieuwe aanvraagt.'
      : 'Kon geen code versturen. Probeer het later opnieuw.';
    return res.status(429).json({ error: msg });
  }

  return res.status(200).json({ ok: true });
};
