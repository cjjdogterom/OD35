const { createClient } = require('@supabase/supabase-js');
const convert = require('heic-convert');

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

// Alleen paden van de vorm <albumId>/<uuid>.heic toestaan (geen willekeurige bestanden)
const PATH_RE = /^[0-9a-f-]{6,}\/[0-9a-z_-]{6,}\.(heic|heif)$/i;

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

  // Ingelogd lid vereist
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Niet ingelogd' });
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return res.status(401).json({ error: 'Ongeldige sessie' });
  } catch (_) { return res.status(500).json({ error: 'Sessiecontrole mislukt' }); }

  const { path } = req.body || {};
  if (!path || !PATH_RE.test(path)) return res.status(400).json({ error: 'Ongeldig pad' });

  const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SERVICE) return res.status(500).json({ error: 'Server niet geconfigureerd' });
  const admin = createClient(SUPABASE_URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });

  try {
    // 1. HEIC ophalen uit storage
    const { data: blob, error: dlErr } = await admin.storage.from('fotos').download(path);
    if (dlErr || !blob) return res.status(404).json({ error: 'Bestand niet gevonden' });
    const inputBuffer = Buffer.from(await blob.arrayBuffer());

    // 2. Omzetten naar JPEG (pure JS — geen native afhankelijkheden)
    let jpegBuffer;
    try {
      jpegBuffer = await convert({ buffer: inputBuffer, format: 'JPEG', quality: 0.85 });
    } catch (e) {
      return res.status(422).json({ error: 'HEIC omzetten mislukt: ' + (e.message || String(e)) });
    }

    // 3. JPEG terugzetten en de HEIC opruimen
    const jpegPath = path.replace(/\.(heic|heif)$/i, '.jpg');
    const { error: upErr } = await admin.storage.from('fotos').upload(jpegPath, jpegBuffer, {
      contentType: 'image/jpeg', cacheControl: '3600', upsert: true,
    });
    if (upErr) return res.status(500).json({ error: 'Opslaan JPEG mislukt: ' + upErr.message });

    await admin.storage.from('fotos').remove([path]).catch(() => {});

    const { data: urlData } = admin.storage.from('fotos').getPublicUrl(jpegPath);
    return res.status(200).json({ ok: true, url: urlData?.publicUrl, path: jpegPath });
  } catch (e) {
    return res.status(500).json({ error: 'Onverwachte fout: ' + (e.message || String(e)) });
  }
};
