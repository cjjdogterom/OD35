const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://mxbtmbcgycjqapjzulrp.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14YnRtYmNneWNqcWFwanp1bHJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5MDQ4MzgsImV4cCI6MjA5MzQ4MDgzOH0.6Qowa_mqhH7YtrljF5fZnQzUaG_u4N5TodcnLzRhYSM';

const ALLOWED_ORIGINS = [
  'https://oudedelft35.com', 'https://www.oudedelft35.com',
  'https://oudedelft35.nl', 'https://www.oudedelft35.nl',
];
function originAllowed(origin) {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  try { return new URL(origin).hostname.endsWith('.vercel.app'); } catch (_) { return false; }
}

// Engelse provincienamen van ip-api → Nederlandse namen
const PROV_MAP = {
  'groningen': 'Groningen', 'friesland': 'Friesland', 'fryslan': 'Friesland', 'fryslân': 'Friesland',
  'drenthe': 'Drenthe', 'overijssel': 'Overijssel', 'flevoland': 'Flevoland', 'gelderland': 'Gelderland',
  'utrecht': 'Utrecht', 'north holland': 'Noord-Holland', 'noord-holland': 'Noord-Holland',
  'south holland': 'Zuid-Holland', 'zuid-holland': 'Zuid-Holland', 'zeeland': 'Zeeland',
  'north brabant': 'Noord-Brabant', 'noord-brabant': 'Noord-Brabant', 'limburg': 'Limburg',
};
function normalizeProvince(regionName) {
  if (!regionName) return 'Onbekend';
  const key = String(regionName).trim().toLowerCase();
  return PROV_MAP[key] || regionName;
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

  // Identiteit bepalen uit het meegestuurde sessie-token
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Geen token' });
  let email = null;
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return res.status(401).json({ error: 'Ongeldig token' });
    email = ((await r.json()).email || '').toLowerCase();
  } catch (e) {
    return res.status(500).json({ error: 'Token-check mislukt' });
  }
  if (!email) return res.status(400).json({ error: 'Geen e-mail in token' });

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
          || req.socket?.remoteAddress || 'onbekend';

  // Provincie bepalen via gratis IP-geolocatie (best effort)
  let provincie = 'Onbekend', land = 'Onbekend';
  try {
    const geo = await fetch(`http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,regionName`);
    if (geo.ok) {
      const g = await geo.json();
      if (g.status === 'success') {
        land = g.country || 'Onbekend';
        provincie = (land === 'Netherlands' || land === 'Nederland')
          ? normalizeProvince(g.regionName) : (g.regionName || 'Buitenland');
      }
    }
  } catch (_) { /* geolocatie niet kritiek */ }

  const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SERVICE) return res.status(500).json({ error: 'Server niet geconfigureerd' });
  const admin = createClient(SUPABASE_URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });

  try {
    await admin.from('bezoeken').insert({ email, ip, provincie, land });
  } catch (e) {
    return res.status(500).json({ error: 'Opslaan mislukt' });
  }
  return res.status(200).json({ ok: true });
};
