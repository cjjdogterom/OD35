// Geeft een presigned PUT-URL terug zodat de browser een foto rechtstreeks naar
// Cloudflare R2 kan uploaden (gratis egress). Vereist een geldige Supabase-sessie.
// Niet geconfigureerd (env-vars ontbreken) -> 503 zodat de client op Supabase terugvalt.
const { createClient } = require('@supabase/supabase-js');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const crypto = require('crypto');

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

module.exports = async function handler(req, res) {
  const origin = req.headers.origin || '';
  res.setHeader('Access-Control-Allow-Origin', originAllowed(origin) ? origin : ALLOWED_ORIGINS[0]);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Account-ID en publieke URL zijn niet geheim (in de code); alleen de keys + bucketnaam
  // komen uit Vercel env-vars.
  const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || 'a812c3bc95a103b7d66ac7fc4d62cd07';
  const R2_PUBLIC_BASE = process.env.R2_PUBLIC_BASE || 'https://pub-24a34539f8c14c81b0ca344ad888d9e2.r2.dev';
  const { R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env;
  if (!R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) {
    return res.status(503).json({ error: 'R2 niet geconfigureerd', notConfigured: true });
  }

  // Alleen ingelogde leden mogen een upload-URL krijgen.
  const authz = req.headers.authorization || '';
  const token = authz.startsWith('Bearer ') ? authz.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'niet ingelogd' });
  try {
    const sb = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
    const { data, error } = await sb.auth.getUser(token);
    if (error || !data || !data.user) return res.status(401).json({ error: 'sessie ongeldig' });
  } catch (_) { return res.status(401).json({ error: 'sessie-check mislukt' }); }

  const body = req.body || {};
  const albumId = String(body.albumId || '');
  if (!/^[0-9a-f-]{6,}$/i.test(albumId)) return res.status(400).json({ error: 'ongeldig album' });
  const ext = (String(body.ext || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5)) || 'jpg';
  const contentType = String(body.contentType || 'image/jpeg').slice(0, 80);
  const key = `${albumId}/${crypto.randomUUID()}.${ext}`;

  try {
    const s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
    });
    const cmd = new PutObjectCommand({
      Bucket: R2_BUCKET, Key: key, ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable',
    });
    const uploadUrl = await getSignedUrl(s3, cmd, { expiresIn: 600 });
    const publicUrl = `${R2_PUBLIC_BASE.replace(/\/+$/, '')}/${key}`;
    return res.status(200).json({ uploadUrl, publicUrl, key });
  } catch (e) {
    return res.status(500).json({ error: 'Kon upload-URL niet maken: ' + (e.message || e) });
  }
};
