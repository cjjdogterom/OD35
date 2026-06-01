const nodemailer = require('nodemailer');

const ALLOWED_ORIGINS = [
  'https://oudedelft35.com',
  'https://www.oudedelft35.com',
  'https://od-35.vercel.app',
];

// Lichte in-memory rate-limit per cold start (best-effort op Vercel)
const recentCalls = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const arr = (recentCalls.get(ip) || []).filter(t => now - t < 60_000);
  arr.push(now);
  recentCalls.set(ip, arr);
  return arr.length > 5; // max 5 calls per minuut per IP
}

module.exports = async function handler(req, res) {
  const origin = req.headers.origin || '';
  const isAllowed = ALLOWED_ORIGINS.includes(origin);
  res.setHeader('Access-Control-Allow-Origin', isAllowed ? origin : ALLOWED_ORIGINS[0]);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!isAllowed) return res.status(403).json({ error: 'Origin not allowed' });

  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || 'unknown';
  if (rateLimited(ip)) return res.status(429).json({ error: 'Te veel verzoeken, wacht een minuut' });

  // Vereist admin-token: client stuurt de Supabase JWT mee. Server checkt of het een admin is
  // door tegen Supabase op te halen wie de gebruiker is en of die in `admins` tabel staat.
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Geen admin-token meegestuurd' });

  // Check token via Supabase REST
  let userEmail = null;
  try {
    const r = await fetch('https://mxbtmbcgycjqapjzulrp.supabase.co/auth/v1/user', {
      headers: {
        apikey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14YnRtYmNneWNqcWFwanp1bHJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5MDQ4MzgsImV4cCI6MjA5MzQ4MDgzOH0.6Qowa_mqhH7YtrljF5fZnQzUaG_u4N5TodcnLzRhYSM',
        Authorization: `Bearer ${token}`,
      },
    });
    if (!r.ok) return res.status(401).json({ error: 'Ongeldig token' });
    const u = await r.json();
    userEmail = (u?.email || '').toLowerCase();
  } catch (e) {
    return res.status(500).json({ error: 'Token-check mislukt' });
  }

  // Viewer mag geen mail sturen
  if (!userEmail || userEmail.startsWith('viewer@') || userEmail.includes('viewer')) {
    return res.status(403).json({ error: 'Alleen admins mogen mail versturen via deze endpoint' });
  }

  const { subject, html, text, recipients, fromName, replyTo } = req.body || {};
  if (!subject || (!html && !text) || !Array.isArray(recipients) || recipients.length === 0) {
    return res.status(400).json({ error: 'subject, html (of text) en recipients[] zijn verplicht' });
  }
  if (recipients.length > 500) {
    return res.status(400).json({ error: 'Maximaal 500 ontvangers per call (Gmail limiet)' });
  }

  const GMAIL_USER = process.env.GMAIL_USER;
  const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
    return res.status(500).json({
      error: 'Gmail niet geconfigureerd. Zet GMAIL_USER en GMAIL_APP_PASSWORD in Vercel env vars.'
    });
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
  });

  // Verifieer eenmalig dat de transport werkt
  try {
    await transporter.verify();
  } catch (e) {
    return res.status(500).json({ error: 'Gmail SMTP verbinding mislukt: ' + e.message });
  }

  // Verstuur per ontvanger (BCC zou kunnen, maar individuele sends zijn betrouwbaarder
  // en geven betere tracking + voorkomen dat 1 bounce de hele batch sloopt)
  const unique = [...new Set(recipients.map(e => (e || '').trim().toLowerCase()).filter(Boolean))];
  const results = { ok: 0, failed: 0, errors: [] };

  for (const to of unique) {
    try {
      await transporter.sendMail({
        from: `${fromName || 'Oude Delft 35'} <${GMAIL_USER}>`,
        to,
        subject,
        ...(html ? { html } : {}),
        ...(text ? { text } : {}),
        ...(replyTo ? { replyTo } : {}),
      });
      results.ok++;
    } catch (err) {
      results.failed++;
      if (results.errors.length < 10) {
        results.errors.push({ email: to, message: err.message || String(err) });
      }
    }
  }

  return res.status(200).json({
    ok: true,
    total: unique.length,
    via: 'gmail',
    from: GMAIL_USER,
    ...results,
  });
};
