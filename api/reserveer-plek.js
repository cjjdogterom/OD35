const { createClient } = require('@supabase/supabase-js');
const nodemailer = require('nodemailer');

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

// Toegestane plekken + leesbare labels
const SEAT_LABELS = {
  'vbank-1': 'Hoekbank links · plek 1', 'vbank-2': 'Hoekbank links · plek 2', 'vbank-3': 'Hoekbank links · plek 3',
  'stoel-1': 'Stoel 1', 'stoel-2': 'Stoel 2',
  'a-1': 'Bank A · plek 1', 'a-2': 'Bank A · plek 2', 'a-3': 'Bank A · plek 3',
  'b-1': 'Bank B · plek 1', 'b-2': 'Bank B · plek 2', 'b-3': 'Bank B · plek 3',
  'c-1': 'Bank C · plek 1', 'c-2': 'Bank C · plek 2', 'c-3': 'Bank C · plek 3',
  'd-1': 'Bank D · plek 1', 'd-2': 'Bank D · plek 2', 'd-3': 'Bank D · plek 3',
};

// Lichte rate-limit per cold start
const recentCalls = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const arr = (recentCalls.get(ip) || []).filter(t => now - t < 60_000);
  arr.push(now);
  recentCalls.set(ip, arr);
  return arr.length > 20;
}

function naamVan(p) {
  return [p.voorletters, p.tussenvoegsel, p.achternaam].filter(Boolean).join(' ').trim();
}

module.exports = async function handler(req, res) {
  const origin = req.headers.origin || '';
  const isAllowed = originAllowed(origin);
  res.setHeader('Access-Control-Allow-Origin', isAllowed ? origin : ALLOWED_ORIGINS[0]);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!isAllowed) return res.status(403).json({ error: 'Origin not allowed' });

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'onbekend';
  if (rateLimited(ip)) return res.status(429).json({ error: 'Te veel verzoeken, wacht even.' });

  // Identiteit uit token
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Niet ingelogd' });
  let email = null;
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return res.status(401).json({ error: 'Ongeldige sessie' });
    email = ((await r.json()).email || '').toLowerCase();
  } catch (_) { return res.status(500).json({ error: 'Sessiecontrole mislukt' }); }
  if (!email) return res.status(400).json({ error: 'Geen e-mail in sessie' });

  const { wedstrijd, wedstrijdNaam, plek, actie } = req.body || {};
  if (!wedstrijd) return res.status(400).json({ error: 'wedstrijd ontbreekt' });

  const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SERVICE) return res.status(500).json({ error: 'Server niet geconfigureerd' });
  const admin = createClient(SUPABASE_URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });

  // Wie is de aanvrager? (bewoner jaar 2017–2026)
  let caller;
  try {
    const { data } = await admin.from('personen')
      .select('voorletters,tussenvoegsel,achternaam,aankomstjaar,email_1,email_2,email_3')
      .or(`email_1.ilike.${email},email_2.ilike.${email},email_3.ilike.${email}`)
      .limit(1);
    caller = data && data[0];
  } catch (_) { return res.status(500).json({ error: 'Kon bewoner niet opzoeken' }); }
  if (!caller) return res.status(403).json({ error: 'Je staat niet als bewoner in de lijst' });
  const jaar = Number(caller.aankomstjaar);
  if (!(jaar >= 2017 && jaar <= 2026)) {
    return res.status(403).json({ error: 'Alleen huidige bewoners (jaar 2017–2026) kunnen reserveren' });
  }
  const callerNaam = naamVan(caller) || email;

  // Plek verlaten
  if (actie === 'verlaat') {
    try { await admin.from('bankreserveringen').delete().eq('wedstrijd', wedstrijd).eq('email', email); }
    catch (e) { return res.status(500).json({ error: 'Verlaten mislukt' }); }
    return res.status(200).json({ ok: true, actie: 'verlaten' });
  }

  // Reserveren
  if (!plek || !SEAT_LABELS[plek]) return res.status(400).json({ error: 'Ongeldige plek' });

  // Huidige bezetter van deze plek?
  let bezetter = null;
  try {
    const { data } = await admin.from('bankreserveringen')
      .select('*').eq('wedstrijd', wedstrijd).eq('plek', plek).limit(1);
    bezetter = data && data[0];
  } catch (_) { return res.status(500).json({ error: 'Kon plek niet controleren' }); }

  let verdrongen = null;
  if (bezetter) {
    if ((bezetter.email || '').toLowerCase() === email) {
      return res.status(200).json({ ok: true, actie: 'al-van-jou' });
    }
    const bezetJaar = Number(bezetter.aankomstjaar);
    // Verdringen mag alleen als de aanvrager strikt ouder (lager jaar) is
    if (!(jaar < bezetJaar)) {
      return res.status(409).json({
        error: `Deze plek is bezet door ${bezetter.naam || 'iemand'} (jaar ${bezetter.aankomstjaar || '?'}). Je kunt alleen plekken van jongere bewoners overnemen.`,
      });
    }
    // Bezetter verdringen
    try { await admin.from('bankreserveringen').delete().eq('id', bezetter.id); }
    catch (_) { return res.status(500).json({ error: 'Verdringen mislukt' }); }
    verdrongen = bezetter;
  }

  // Eigen bestaande reservering voor deze wedstrijd opheffen (max 1 plek)
  try { await admin.from('bankreserveringen').delete().eq('wedstrijd', wedstrijd).eq('email', email); }
  catch (_) { /* niet kritiek */ }

  // Nieuwe reservering plaatsen
  try {
    const { error } = await admin.from('bankreserveringen').insert({
      wedstrijd, plek, email, naam: callerNaam, aankomstjaar: jaar,
    });
    if (error) {
      if (String(error.message || '').toLowerCase().includes('duplicate')) {
        return res.status(409).json({ error: 'Net te laat — iemand was je voor. Probeer opnieuw.' });
      }
      throw error;
    }
  } catch (e) { return res.status(500).json({ error: 'Reserveren mislukt: ' + (e.message || e) }); }

  // Mail naar de verdrongen bewoner (best effort)
  let mailVerstuurd = false;
  if (verdrongen && verdrongen.email) {
    const GMAIL_USER = process.env.GMAIL_USER;
    const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;
    if (GMAIL_USER && GMAIL_APP_PASSWORD) {
      try {
        const transporter = nodemailer.createTransport({
          service: 'gmail', auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
        });
        const wLabel = wedstrijdNaam || 'de eerstvolgende Oranje-wedstrijd';
        const plekLabel = SEAT_LABELS[plek] || plek;
        const tekst =
`Hoi ${verdrongen.naam || ''},

${callerNaam} (jaar ${jaar}) heeft op basis van anciënniteit jouw bankplek (${plekLabel}) overgenomen voor ${wLabel}.

Je kunt in de app (tab "Nestor") een andere vrije plek reserveren.

Hup Holland,
Nestor — Oude Delft 35`;
        await transporter.sendMail({
          from: `Nestor — Oude Delft 35 <${GMAIL_USER}>`,
          to: verdrongen.email,
          subject: `Je bankplek voor ${wedstrijdNaam || 'de Oranje-wedstrijd'} is overgenomen`,
          text: tekst,
          replyTo: GMAIL_USER,
        });
        mailVerstuurd = true;
      } catch (_) { /* mail niet kritiek voor de reservering */ }
    }
  }

  return res.status(200).json({
    ok: true,
    actie: 'gereserveerd',
    verdrongen: verdrongen ? { naam: verdrongen.naam, aankomstjaar: verdrongen.aankomstjaar } : null,
    mailVerstuurd,
  });
};
