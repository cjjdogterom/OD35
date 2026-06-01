const { createClient } = require('@supabase/supabase-js');

const ALLOWED_ORIGINS = [
  'https://oudedelft35.com',
  'https://www.oudedelft35.com',
  'https://od-35.vercel.app',
];

// SHA-256 van het site-wachtwoord. Override via env SITE_PWD_HASH in Vercel.
const DEFAULT_SITE_PWD_HASH = '86967edd971fb490904869f32ffe3383db9c19315ba08513e8288f1b3a11e295';

// Eenvoudige in-memory rate-limit per cold start
const attempts = new Map();
function tooManyAttempts(ip) {
  const now = Date.now();
  const arr = (attempts.get(ip) || []).filter(t => now - t < 60_000);
  arr.push(now);
  attempts.set(ip, arr);
  return arr.length > 8; // max 8 pogingen per minuut per IP
}

module.exports = async function handler(req, res) {
  const origin = req.headers.origin || '';
  const isAllowed = ALLOWED_ORIGINS.includes(origin);
  res.setHeader('Access-Control-Allow-Origin', isAllowed ? origin : ALLOWED_ORIGINS[0]);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!isAllowed) return res.status(403).json({ error: 'Origin not allowed' });

  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || 'unknown';
  if (tooManyAttempts(ip)) return res.status(429).json({ error: 'Te veel pogingen — wacht een minuut.' });

  const { pwd_hash } = req.body || {};
  if (typeof pwd_hash !== 'string') return res.status(400).json({ error: 'pwd_hash required' });

  const expected = process.env.SITE_PWD_HASH || DEFAULT_SITE_PWD_HASH;
  if (pwd_hash.toLowerCase() !== expected.toLowerCase()) {
    return res.status(401).json({ error: 'Onjuist wachtwoord' });
  }

  // Check viewer credentials
  const VIEWER_EMAIL = process.env.VIEWER_EMAIL;
  const VIEWER_PASSWORD = process.env.VIEWER_PASSWORD;
  if (!VIEWER_EMAIL || !VIEWER_PASSWORD) {
    return res.status(500).json({ error: 'Viewer-account niet geconfigureerd. Zet VIEWER_EMAIL en VIEWER_PASSWORD in Vercel env vars.' });
  }

  const supabase = createClient(
    'https://mxbtmbcgycjqapjzulrp.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14YnRtYmNneWNqcWFwanp1bHJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5MDQ4MzgsImV4cCI6MjA5MzQ4MDgzOH0.6Qowa_mqhH7YtrljF5fZnQzUaG_u4N5TodcnLzRhYSM'
  );

  const { data, error } = await supabase.auth.signInWithPassword({
    email: VIEWER_EMAIL,
    password: VIEWER_PASSWORD,
  });
  if (error || !data?.session) {
    console.error('Viewer login fail:', error);
    return res.status(500).json({ error: 'Viewer login mislukt: ' + (error?.message || 'geen sessie') });
  }

  return res.status(200).json({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });
};
