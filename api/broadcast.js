const { Resend } = require('resend');

const ALLOWED_ORIGINS = [
  'https://oudedelft35.com',
  'https://www.oudedelft35.com',
  'https://od-35.vercel.app',
];

// Lichte in-memory rate-limit per cold start (best-effort op Vercel)
const recentCalls = new Map(); // ip -> [timestamps]
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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Origin moet kloppen — voorkomt cross-site misbruik
  if (!isAllowed) return res.status(403).json({ error: 'Origin not allowed' });

  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || 'unknown';
  if (rateLimited(ip)) return res.status(429).json({ error: 'Te veel verzoeken, probeer over een minuut opnieuw' });

  const { subject, html, recipients, fromName, replyTo } = req.body || {};
  if (!subject || !html || !Array.isArray(recipients) || recipients.length === 0) {
    return res.status(400).json({ error: 'subject, html en recipients[] zijn verplicht' });
  }
  // Limiet: max 500 ontvangers per call
  if (recipients.length > 500) return res.status(400).json({ error: 'Maximaal 500 ontvangers per call' });

  if (!process.env.RESEND_API_KEY) {
    return res.status(500).json({ error: 'Geen RESEND_API_KEY ingesteld in Vercel env vars' });
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const from = `${fromName || 'OD35 Ledenlijst'} <onboarding@resend.dev>`;

  const unique = [...new Set(recipients.map(e => (e || '').trim().toLowerCase()).filter(Boolean))];
  const results = { ok: 0, failed: 0, errors: [] };

  for (const email of unique) {
    try {
      const params = { from, to: [email], subject, html };
      if (replyTo) params.reply_to = replyTo;
      await resend.emails.send(params);
      results.ok++;
    } catch (err) {
      results.failed++;
      if (results.errors.length < 10) {
        results.errors.push({ email, message: err.message || String(err) });
      }
    }
  }
  return res.status(200).json({ ok: true, total: unique.length, ...results });
};
