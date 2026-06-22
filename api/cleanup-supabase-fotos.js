// Verwijdert ALLE objecten uit de Supabase Storage-bucket 'fotos' — maar ALLEEN als
// geen enkele foto op de site nog naar Supabase wijst (alles staat dan op R2). Zo
// kan de site nooit stukgaan. Alleen de hoofdadmin mag dit. Idempotent: opnieuw
// draaien gaat verder waar het gebleven was.
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
const STORE_MARK = '/storage/v1/object/public/fotos/';

// Verzamel recursief alle objectpaden onder een prefix in de 'fotos'-bucket.
async function listAll(admin, prefix, out) {
  let offset = 0;
  while (true) {
    const { data, error } = await admin.storage.from('fotos').list(prefix, { limit: 100, offset });
    if (error) throw error;
    if (!data || !data.length) break;
    for (const item of data) {
      const full = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id === null) { await listAll(admin, full, out); } // map -> dieper
      else { out.push(full); }
    }
    if (data.length < 100) break;
    offset += 100;
  }
  return out;
}

module.exports = async function handler(req, res) {
  const origin = req.headers.origin || '';
  res.setHeader('Access-Control-Allow-Origin', originAllowed(origin) ? origin : ALLOWED_ORIGINS[0]);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SERVICE) return res.status(500).json({ error: 'Server niet geconfigureerd (service key)' });

  // Alleen de hoofdadmin
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Niet ingelogd' });
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` } });
    if (!r.ok) return res.status(401).json({ error: 'Ongeldige sessie' });
    const email = ((await r.json()).email || '').toLowerCase();
    if (email !== HOOFDADMIN_EMAIL.toLowerCase()) return res.status(403).json({ error: 'Alleen de hoofdadmin mag opschonen' });
  } catch (_) { return res.status(500).json({ error: 'Sessiecontrole mislukt' }); }

  const admin = createClient(SUPABASE_URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });

  try {
    // VEILIGHEIDSCHECK: wijst nog een foto naar Supabase? Dan NIET verwijderen.
    const { count, error: cErr } = await admin
      .from('fotos').select('id', { count: 'exact', head: true }).like('url', `%${STORE_MARK}%`);
    if (cErr) throw cErr;
    if ((count || 0) > 0) {
      return res.status(409).json({
        error: `Geweigerd: ${count} foto('s) op de site wijzen nog naar Supabase. ` +
               'Migreer die eerst naar R2 (knop "Foto\'s naar R2"); dan is verwijderen pas veilig.',
        stillReferenced: count,
      });
    }

    // Alles staat op R2 -> elk object in de bucket is een rest dat verwijderd mag worden.
    const paths = await listAll(admin, '', []);
    let deleted = 0;
    for (let i = 0; i < paths.length; i += 100) {
      const chunk = paths.slice(i, i + 100);
      const { error: rmErr } = await admin.storage.from('fotos').remove(chunk);
      if (!rmErr) deleted += chunk.length;
    }
    return res.status(200).json({ deleted, scanned: paths.length, safe: true });
  } catch (e) {
    return res.status(500).json({ error: 'Opschonen mislukt: ' + ((e && e.message) || e) });
  }
};
