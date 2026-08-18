// Keep-alive voor het Supabase-project.
// Een gratis Supabase-project pauzeert na ~1 week zonder activiteit; als het
// gepauzeerd raakt valt de hele site om (login, ledenlijst, wijzigingen).
// Deze functie doet dagelijks één lichte database-query zodat het project
// actief blijft. Aangeroepen door de Vercel Cron (zie vercel.json → "crons").
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://mxbtmbcgycjqapjzulrp.supabase.co';

module.exports = async function handler(req, res) {
  // Als CRON_SECRET is ingesteld, alleen de Vercel Cron toestaan.
  // Vercel stuurt automatisch "Authorization: Bearer <CRON_SECRET>" mee.
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SERVICE) {
    return res.status(500).json({ error: 'Server niet geconfigureerd (service key ontbreekt).' });
  }

  const admin = createClient(SUPABASE_URL, SERVICE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    // Lichte query die Postgres echt aanspreekt → telt als activiteit.
    const { error } = await admin.from('personen').select('id').limit(1);
    if (error) throw error;
    return res.status(200).json({ ok: true, pinged: new Date().toISOString() });
  } catch (e) {
    console.error('Keepalive-query mislukt:', e);
    return res.status(500).json({ error: 'Keepalive-query mislukt.', detail: String((e && e.message) || e) });
  }
};
