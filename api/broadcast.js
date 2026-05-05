const { Resend } = require('resend');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { subject, html, recipients, fromName, replyTo } = req.body || {};

  if (!subject || !html || !Array.isArray(recipients) || recipients.length === 0) {
    return res.status(400).json({ error: 'subject, html en recipients[] zijn verplicht' });
  }

  if (!process.env.RESEND_API_KEY) {
    return res.status(500).json({ error: 'Geen RESEND_API_KEY ingesteld in Vercel env vars' });
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const from = `${fromName || 'OD35 Ledenlijst'} <onboarding@resend.dev>`;

  // Verzend per persoon (Resend levert in testmodus alleen aan het account-adres,
  // maar in productie met geverifieerd domein gaat dit naar elke ontvanger)
  const results = { ok: 0, failed: 0, errors: [] };
  const unique = [...new Set(recipients.map(e => (e || '').trim().toLowerCase()).filter(Boolean))];

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
