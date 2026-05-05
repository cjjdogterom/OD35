const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');

const supabase = createClient(
  'https://mxbtmbcgycjqapjzulrp.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14YnRtYmNneWNqcWFwanp1bHJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5MDQ4MzgsImV4cCI6MjA5MzQ4MDgzOH0.6Qowa_mqhH7YtrljF5fZnQzUaG_u4N5TodcnLzRhYSM'
);

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { persoon, aanvrager_naam, aanvrager_email, veld, wijziging, toelichting } = req.body;

  if (!persoon || !aanvrager_naam || !aanvrager_email || !veld || !wijziging) {
    return res.status(400).json({ error: 'Verplichte velden ontbreken' });
  }

  // Sla op in Supabase
  const { error: dbError } = await supabase.from('wijzigingsverzoeken').insert({
    persoon, aanvrager_naam, aanvrager_email, veld, wijziging, toelichting: toelichting || null
  });
  if (dbError) {
    console.error('DB fout:', dbError);
    return res.status(500).json({ error: 'Opslaan mislukt: ' + dbError.message });
  }

  // Haal admin e-mails op
  const { data: admins } = await supabase.from('admin_emails').select('email, naam');
  const adminEmails = (admins || []).map(a => a.email).filter(Boolean);

  // Stuur e-mail via Resend
  if (adminEmails.length > 0 && process.env.RESEND_API_KEY) {
    const resend = new Resend(process.env.RESEND_API_KEY);
    try {
      await resend.emails.send({
        from: 'OD35 Ledenlijst <onboarding@resend.dev>',
        to: adminEmails,
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
  }

  return res.status(200).json({ ok: true });
};
