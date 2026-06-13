const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://mxbtmbcgycjqapjzulrp.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14YnRtYmNneWNqcWFwanp1bHJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5MDQ4MzgsImV4cCI6MjA5MzQ4MDgzOH0.6Qowa_mqhH7YtrljF5fZnQzUaG_u4N5TodcnLzRhYSM';
const HOOFDADMIN_EMAIL = 'cjj.dogterom@gmail.com';

const ALLOWED_ORIGINS = [
  'https://oudedelft35.com', 'https://www.oudedelft35.com',
  'https://oudedelft35.nl', 'https://www.oudedelft35.nl',
];
function originAllowed(origin) {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  try { return new URL(origin).hostname.endsWith('.vercel.app'); } catch (_) { return false; }
}

module.exports = async function handler(req, res) {
  const origin = req.headers.origin || '';
  const isAllowed = originAllowed(origin);
  res.setHeader('Access-Control-Allow-Origin', isAllowed ? origin : ALLOWED_ORIGINS[0]);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!isAllowed) return res.status(403).json({ error: 'Origin not allowed' });

  // Alleen de hoofdadmin mag admins aanmaken — verifieer het meegestuurde token
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Geen token' });
  let callerEmail = null;
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return res.status(401).json({ error: 'Ongeldig token' });
    callerEmail = ((await r.json()).email || '').toLowerCase();
  } catch (e) {
    return res.status(500).json({ error: 'Token-check mislukt' });
  }
  if (callerEmail !== HOOFDADMIN_EMAIL) {
    return res.status(403).json({ error: 'Alleen de hoofdadmin mag admins aanmaken' });
  }

  const email = ((req.body && req.body.email) || '').trim().toLowerCase();
  const password = (req.body && req.body.password) || '';
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(400).json({ error: 'Ongeldig e-mailadres' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Wachtwoord moet minstens 6 tekens zijn' });
  }

  const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SERVICE) return res.status(500).json({ error: 'Server niet geconfigureerd (service key ontbreekt)' });
  const admin = createClient(SUPABASE_URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });

  // Bestaat de gebruiker al? Zoek 'm op (paginerend).
  let existingId = null, page = 1;
  while (!existingId && page <= 15) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) return res.status(500).json({ error: 'Zoeken mislukt: ' + error.message });
    const u = (data.users || []).find(x => (x.email || '').toLowerCase() === email);
    if (u) existingId = u.id;
    if (!data.users || data.users.length < 200) break;
    page++;
  }

  if (existingId) {
    // Bestaat al → wachtwoord (her)instellen zodat hij met dit wachtwoord kan inloggen
    const { error: upErr } = await admin.auth.admin.updateUserById(existingId, { password, email_confirm: true });
    if (upErr) return res.status(500).json({ error: 'Wachtwoord instellen mislukt: ' + upErr.message });
    return res.status(200).json({ ok: true, updated: true });
  }

  // Nieuw account met wachtwoord (bevestigd, geen e-mailverificatie nodig)
  const { error: cErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (cErr) return res.status(500).json({ error: 'Aanmaken mislukt: ' + cErr.message });
  return res.status(200).json({ ok: true, created: true });
};
