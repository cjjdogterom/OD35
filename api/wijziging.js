const { Resend } = require('resend');

const ALLOWED_ORIGINS = [
  'https://oudedelft35.com',
  'https://www.oudedelft35.com',
  'https://od-35.vercel.app',
];

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

  const { persoon, aanvrager_naam, aanvrager_email, veld, wijziging, toelichting, adminEmails } = req.body;

  if (!persoon || !aanvrager_naam || !veld || !wijziging) {
    return res.status(400).json({ error: 'Verplichte velden ontbreken' });
  }

  if (!process.env.RESEND_API_KEY) {
    return res.status(200).json({
      ok: true,
      warn: 'Geen RESEND_API_KEY',
      vercel_env: process.env.VERCEL_ENV || 'unknown',
      vercel_url: process.env.VERCEL_URL || 'unknown',
      vercel_project: process.env.VERCEL_PROJECT_PRODUCTION_URL || 'unknown',
      env_keys_starting_with_R: Object.keys(process.env).filter(k => k.startsWith('R')),
    });
  }

  const to = Array.isArray(adminEmails) && adminEmails.length > 0 ? adminEmails : ['omegaksiod35@gmail.com'];

  const resend = new Resend(process.env.RESEND_API_KEY);
  try {
    await resend.emails.send({
      from: 'OD35 Ledenlijst <onboarding@resend.dev>',
      to,
      subject: `Wijzigingsverzoek: ${persoon}`,
      html: `
        <div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#1a1812;">
          <div style="border-top:4px solid #3a7cc1;padding:2rem 0 1rem;">
            <h2 style="margin:0 0 0.25rem;font-size:1.6rem;color:#3a7cc1;">Wijzigingsverzoek</h2>
            <p style="margin:0;color:#6b6358;font-style:italic;">Oude Delft 35 — Ledenlijst</p>
          </div>
          <table style="width:100%;border-collapse:collapse;margin-top:1.5rem;">
            <tr><td style="padding:0.5rem 0;border-bottom:1px solid #eee;width:140px;color:#6b6358;font-size:0.9rem;">Persoon</td><td style="padding:0.5rem 0;border-bottom:1px solid #eee;font-weight:bold;">${persoon}</td></tr>
            <tr><td style="padding:0.5rem 0;border-bottom:1px solid #eee;color:#6b6358;font-size:0.9rem;">Aangevraagd door</td><td style="padding:0.5rem 0;border-bottom:1px solid #eee;">${aanvrager_naam} &lt;<a href="mailto:${aanvrager_email}" style="color:#3a7cc1;">${aanvrager_email}</a>&gt;</td></tr>
            <tr><td style="padding:0.5rem 0;border-bottom:1px solid #eee;color:#6b6358;font-size:0.9rem;">Te wijzigen veld</td><td style="padding:0.5rem 0;border-bottom:1px solid #eee;">${veld}</td></tr>
            <tr><td style="padding:0.5rem 0;border-bottom:1px solid #eee;color:#6b6358;font-size:0.9rem;">Nieuwe waarde</td><td style="padding:0.5rem 0;border-bottom:1px solid #eee;">${wijziging}</td></tr>
            ${toelichting ? `<tr><td style="padding:0.5rem 0;color:#6b6358;font-size:0.9rem;">Toelichting</td><td style="padding:0.5rem 0;font-style:italic;">${toelichting}</td></tr>` : ''}
          </table>
          <p style="margin-top:2rem;font-size:0.8rem;color:#a89e8e;">Dit bericht is automatisch verzonden via de OD35 ledenlijst.</p>
        </div>
      `
    });
  } catch (emailErr) {
    console.error('E-mail fout:', emailErr);
  }

  return res.status(200).json({ ok: true });
};
