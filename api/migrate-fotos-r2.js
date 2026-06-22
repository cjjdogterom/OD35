// Verhuist bestaande foto's van Supabase Storage naar Cloudflare R2 en werkt de
// fotos.url in de database bij. Daarna wordt het origineel uit Supabase verwijderd
// (zo daalt zowel Storage als toekomstige egress). Werkt in batches; de client roept
// 'm herhaaldelijk aan tot 'remaining' 0 is. Alleen de hoofdadmin mag dit.
const { createClient } = require('@supabase/supabase-js');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

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
function ctFromExt(ext) {
  return ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
    gif: 'image/gif', pdf: 'application/pdf' })[ext] || 'application/octet-stream';
}

module.exports = async function handler(req, res) {
  const origin = req.headers.origin || '';
  res.setHeader('Access-Control-Allow-Origin', originAllowed(origin) ? origin : ALLOWED_ORIGINS[0]);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // R2-config (account-ID + publieke URL in code; keys + bucket uit env)
  const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || 'a812c3bc95a103b7d66ac7fc4d62cd07';
  const R2_PUBLIC_BASE = (process.env.R2_PUBLIC_BASE || 'https://pub-24a34539f8c14c81b0ca344ad888d9e2.r2.dev').replace(/\/+$/, '');
  const { R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env;
  if (!R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) {
    return res.status(503).json({ error: 'R2 niet geconfigureerd' });
  }
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
    if (email !== HOOFDADMIN_EMAIL.toLowerCase()) return res.status(403).json({ error: 'Alleen de hoofdadmin mag migreren' });
  } catch (_) { return res.status(500).json({ error: 'Sessiecontrole mislukt' }); }

  const batch = Math.min(Math.max(parseInt((req.body && req.body.batch) || 8, 10) || 8, 1), 15);
  const admin = createClient(SUPABASE_URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });
  const s3 = new S3Client({
    region: 'auto', endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
  });

  try {
    const { data: rows, error: selErr } = await admin
      .from('fotos').select('id,url').like('url', `%${STORE_MARK}%`).limit(batch);
    if (selErr) throw selErr;

    let processed = 0; const fouten = [];
    for (const row of (rows || [])) {
      try {
        const path = row.url.split(STORE_MARK)[1];
        if (!path) { fouten.push(`#${row.id}: pad onleesbaar`); continue; }
        const ext = (path.split('.').pop() || '').toLowerCase();
        // 1. download van Supabase
        const { data: blob, error: dlErr } = await admin.storage.from('fotos').download(path);
        if (dlErr || !blob) throw new Error('download mislukt: ' + (dlErr && dlErr.message || '?'));
        const buf = Buffer.from(await blob.arrayBuffer());
        // 2. upload naar R2
        await s3.send(new PutObjectCommand({
          Bucket: R2_BUCKET, Key: path, Body: buf, ContentType: ctFromExt(ext),
          CacheControl: 'public, max-age=31536000, immutable',
        }));
        // 3. URL in db bijwerken
        const nieuweUrl = `${R2_PUBLIC_BASE}/${path}`;
        const { error: updErr } = await admin.from('fotos').update({ url: nieuweUrl }).eq('id', row.id);
        if (updErr) throw new Error('db-update mislukt: ' + updErr.message);
        // 4. origineel uit Supabase verwijderen (faalt dit, geen ramp: db wijst al naar R2)
        await admin.storage.from('fotos').remove([path]);
        processed++;
      } catch (e) {
        fouten.push(`#${row.id}: ${(e && e.message) || e}`);
      }
    }

    const { count } = await admin.from('fotos').select('id', { count: 'exact', head: true }).like('url', `%${STORE_MARK}%`);
    return res.status(200).json({ processed, remaining: count || 0, fouten });
  } catch (e) {
    return res.status(500).json({ error: 'Migratie mislukt: ' + ((e && e.message) || e) });
  }
};
