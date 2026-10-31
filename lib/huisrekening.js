// Huisrekening: één JSON-document in tabel `huisrekening` (rij id = 1), met versienummer.
// Bereikbaar als /api/huisrekening (vercel.json stuurt dat door naar api/reserveer-plek.js,
// omdat het Hobby-plan maximaal 12 serverfuncties toestaat).
//
// Toegang staat los van de site-admins: alleen de hoofdadmin ziet de huisrekening standaard,
// en deelt toegang uit: per jaargang (tabel `huisrekening_jaargangen`, iedereen daaruit is lezer)
// en per persoon (tabel `huisrekening_toegang`, rol 'lezer', 'barman' of 'beheerder').
// Een barman leest mee en mag alleen de afkoopmomenten van de pilsrekening invullen en aanpassen.
// Een huisrekening-beheerder mag alleen de huisrekening opslaan, verder niets op de site.
//
// GET                    → { data, rev, canEdit }        (403 zonder toegang, 404 zonder gegevens)
// PUT { data, rev }      → { rev }                       (409 bij conflict, 403 zonder beheerrecht)
// GET  ?actie=status     → { toegang, canEdit, hoofdadmin }
// GET  ?actie=toegang    → { lijst: [{ email, rol }], jaargangen: [jaar] }   (alleen hoofdadmin)
// POST ?actie=toegang { email, rol }  rol = 'lezer' | 'barman' | 'beheerder' | null (= intrekken)
// POST ?actie=toegang { jaargangen: [jaar] }  vervangt de aangevinkte jaargangen
// GET  ?actie=leden      → { leden: [{ id, naam, jaar, email }] }   (beheerders; om personen te koppelen)
// GET  ?actie=meldingen → { meldingen: [...] }   beheerders alles, leden alleen hun eigen
// POST ?actie=meldingen { maand, onderwerp, tekst }        → nieuwe opmerking (iedereen met toegang)
// POST ?actie=meldingen { id, status, antwoord }           → afhandelen (beheerders)
// POST ?actie=mail { onderwerp, tekst, items: [{ siteId, naam, samenvatting, bestandsnaam, pdf }] }
//                        → { ok, verstuurd, mislukt: [{ naam, fout }] }   (beheerders; max 5 per keer)
const HOOFDADMIN_EMAIL = 'cjj.dogterom@gmail.com';

// Namen van wie de huisrekening echt mag beheren: de hoofdadmin plus rol 'beheerder'.
async function beheerderNamen(admin) {
  try {
    const { data: rijen } = await admin.from('huisrekening_toegang').select('email').eq('rol', 'beheerder');
    const emails = [HOOFDADMIN_EMAIL, ...(rijen || []).map(r => r.email)];
    const namen = [];
    for (const e of emails) {
      const { data } = await admin.from('personen').select('roepnaam,voornaam,voorletters,tussenvoegsel,achternaam')
        .or(`email_1.ilike.${e},email_2.ilike.${e},email_3.ilike.${e}`).limit(1);
      const p = data && data[0];
      namen.push(p ? [p.roepnaam || p.voornaam || p.voorletters, p.tussenvoegsel, p.achternaam].filter(Boolean).join(' ') : e);
    }
    return namen;
  } catch (_) { return []; }
}

const persNaam = p => [p.roepnaam || p.voornaam || p.voorletters, p.tussenvoegsel, p.achternaam].filter(Boolean).join(' ');
const persEmail = p => [p.email_1, p.email_2, p.email_3].map(e => String(e || '').trim()).find(e => /@/.test(e)) || null;
const escHtml = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Mail in de stijl van de site (zelfde opmaak als de inlogmail), met het eigen PDF-overzicht als bijlage.
function mailHtml({ naam, tekst, samenvatting }) {
  const alinea = escHtml(tekst).replace(/\r?\n/g, '<br>');
  return `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f1e8;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f1e8;"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#fbf9f3;border:1px solid #ddd6c4;border-top:4px solid #2a4d82;">
<tr><td align="center" style="padding:28px 32px 4px;">
<img src="https://www.oudedelft35.nl/logo_od35.png" width="64" alt="Oude Delft 35" style="display:block;width:64px;height:auto;border:0;">
<p style="margin:14px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#857058;">Oude Delft 35 &middot; Huisrekening</p>
</td></tr>
<tr><td style="padding:18px 32px 0;font-family:Georgia,'Times New Roman',serif;font-size:16px;line-height:1.6;color:#2a2620;">
Beste ${escHtml(naam)},<br><br>${alinea}
</td></tr>
${samenvatting ? `<tr><td style="padding:20px 32px 0;"><div style="padding:14px 18px;background:#f4f1e8;border:1px solid #ddd6c4;border-radius:8px;font-family:Georgia,'Times New Roman',serif;font-size:15px;line-height:1.6;color:#2a4d82;">${escHtml(samenvatting).replace(/\n/g, '<br>')}</div></td></tr>` : ''}
<tr><td style="padding:18px 32px 26px;font-family:Georgia,'Times New Roman',serif;font-size:14px;line-height:1.6;color:#857058;border-bottom:1px solid #e9e4d6;">
Je volledige overzicht van deze maand zit als PDF in de bijlage. Je kunt het ook altijd bekijken op <a href="https://www.oudedelft35.nl/huisrekening/huisrekening.html" style="color:#2a4d82;">de huisrekening op de site</a>.
</td></tr>
<tr><td align="center" style="padding:18px 32px 26px;font-family:Georgia,'Times New Roman',serif;font-size:12px;line-height:1.6;color:#857058;">
Oude Delft 35 &middot; Delft &middot; Vragen? Beantwoord deze mail.
</td></tr></table></td></tr></table></body></html>`;
}

// Neemt uit `van` alleen de afkoopmomenten over (pils.afkoop van lopende maanden, afkoopAanp van Excel-maanden).
function metAfkopen(basis, van) {
  const uit = JSON.parse(JSON.stringify(basis || {}));
  const bron = new Map(((van && van.months) || []).filter(m => m && m.id).map(m => [m.id, m]));
  for (const m of uit.months || []) {
    const b = bron.get(m.id);
    if (!b) continue;
    if (m.pils && b.pils && Array.isArray(b.pils.afkoop)) m.pils.afkoop = b.pils.afkoop.slice(0, 200);
    if (m.afkoopHist && b.afkoopAanp && typeof b.afkoopAanp === 'object') m.afkoopAanp = b.afkoopAanp;
    else if (m.afkoopHist && !b.afkoopAanp) delete m.afkoopAanp;
  }
  return uit;
}

module.exports = async function huisrekening(req, res, { admin, email }) {
  res.setHeader('Cache-Control', 'no-store');
  const actie = String((req.query && req.query.actie) || '');
  const hoofdadmin = email === HOOFDADMIN_EMAIL;

  let rol = hoofdadmin ? 'beheerder' : null;
  let emails = [email];
  if (!rol) {
    // Alle e-mailadressen van deze persoon tellen mee, en zijn of haar aankomstjaar.
    let jaar = null;
    try {
      const { data } = await admin.from('personen')
        .select('aankomstjaar,email_1,email_2,email_3')
        .or(`email_1.ilike.${email},email_2.ilike.${email},email_3.ilike.${email}`).limit(1);
      const p = data && data[0];
      if (p) {
        jaar = parseInt(String(p.aankomstjaar || ""), 10) || null; // ook "2020" of "2020/21"
        emails = [...new Set([email, p.email_1, p.email_2, p.email_3]
          .map(e => String(e || '').trim().toLowerCase()).filter(Boolean))];
      }
    } catch (_) { /* alleen op het inlogadres controleren */ }
    const { data: rijen } = await admin.from('huisrekening_toegang').select('rol').in('email', emails);
    if (rijen && rijen.some(r => r.rol === 'beheerder')) rol = 'beheerder';
    else if (rijen && rijen.some(r => r.rol === 'barman')) rol = 'barman';
    else if (rijen && rijen.length) rol = 'lezer';
    else if (jaar) {
      const { data: j } = await admin.from('huisrekening_jaargangen').select('jaar').eq('jaar', jaar).maybeSingle();
      if (j) rol = 'lezer';
    }
  }
  const toegang = !!rol;
  const canEdit = rol === 'beheerder';
  const barman = rol === 'barman';

  if (actie === 'status') return res.status(200).json({ toegang, canEdit, barman, hoofdadmin });

  if (actie === 'toegang') {
    if (!hoofdadmin) return res.status(403).json({ error: 'Alleen de hoofdadmin beheert de toegang' });
    if (req.method === 'GET') {
      const { data, error } = await admin.from('huisrekening_toegang').select('email,rol').order('email');
      const { data: jg, error: e2 } = await admin.from('huisrekening_jaargangen').select('jaar').order('jaar');
      if (error || e2) {
        const fout = (error || e2).message || '';
        const ontbreekt = /does not exist|relation|schema cache/i.test(fout);
        return res.status(500).json({ error: ontbreekt
          ? 'De tabellen voor de huisrekening ontbreken nog in Supabase. Voer HUISREKENING-SETUP.sql uit in de SQL editor.'
          : 'Kon de toegang niet laden: ' + fout });
      }
      return res.status(200).json({ lijst: data || [], jaargangen: (jg || []).map(r => r.jaar) });
    }
    if (req.method === 'POST' && Array.isArray(req.body && req.body.jaargangen)) {
      const jaren = [...new Set(req.body.jaargangen.map(Number))].filter(j => Number.isInteger(j) && j >= 1891 && j <= 2100);
      const { error: e1 } = await admin.from('huisrekening_jaargangen').delete().gte('jaar', 0);
      const { error: e2 } = jaren.length
        ? await admin.from('huisrekening_jaargangen').insert(jaren.map(jaar => ({ jaar })))
        : { error: null };
      if (e1 || e2) return res.status(500).json({ error: 'Opslaan van de jaargangen mislukt' });
      return res.status(200).json({ ok: true });
    }
    if (req.method === 'POST') {
      const doel = String((req.body && req.body.email) || '').trim().toLowerCase();
      const nieuweRol = req.body && req.body.rol;
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(doel)) return res.status(400).json({ error: 'Ongeldig e-mailadres' });
      if (doel === HOOFDADMIN_EMAIL) return res.status(400).json({ error: 'De hoofdadmin heeft altijd toegang' });
      const { error } = nieuweRol
        ? (['lezer', 'barman', 'beheerder'].includes(nieuweRol)
            ? await admin.from('huisrekening_toegang').upsert({ email: doel, rol: nieuweRol })
            : { error: 'rol' })
        : await admin.from('huisrekening_toegang').delete().eq('email', doel);
      if (error) return res.status(error === 'rol' ? 400 : 500).json({ error: 'Opslaan van de toegang mislukt' });
      return res.status(200).json({ ok: true });
    }
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!toegang) return res.status(403).json({ error: 'Je hebt geen toegang tot de huisrekening' });

  if (actie === 'leden') {
    if (!canEdit) return res.status(403).json({ error: 'Alleen beheerders van de huisrekening' });
    const { data, error } = await admin.from('personen')
      .select('id,roepnaam,voornaam,voorletters,tussenvoegsel,achternaam,aankomstjaar,email_1,email_2,email_3')
      .range(0, 4999);
    if (error) return res.status(500).json({ error: 'Kon de leden van de site niet laden' });
    const leden = (data || []).map(p => ({ id: p.id, naam: persNaam(p), jaar: parseInt(String(p.aankomstjaar || ''), 10) || null, email: persEmail(p) }))
      .filter(l => l.naam);
    return res.status(200).json({ leden });
  }

  if (actie === 'meldingen') {
    const tabel = admin.from('huisrekening_meldingen');
    const ontbreekt = e => /does not exist|relation|schema cache/i.test((e && e.message) || '')
      ? 'De tabel voor opmerkingen ontbreekt nog in Supabase. Voer HUISREKENING-SETUP.sql opnieuw uit in de SQL editor.'
      : 'Opmerkingen: ' + ((e && e.message) || 'onbekende fout');
    if (req.method === 'GET') {
      let q = tabel.select('*').order('gemaakt', { ascending: false }).limit(500);
      if (!canEdit) q = q.in('email', emails);
      const { data, error } = await q;
      if (error) return res.status(500).json({ error: ontbreekt(error) });
      return res.status(200).json({ meldingen: data || [] });
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const b = req.body || {};
    if (b.id != null) {
      if (!canEdit) return res.status(403).json({ error: 'Alleen beheerders handelen opmerkingen af' });
      const klaar = b.status === 'afgehandeld';
      const { error } = await admin.from('huisrekening_meldingen').update({
        status: klaar ? 'afgehandeld' : 'open',
        antwoord: String(b.antwoord || '').slice(0, 2000) || null,
        afgehandeld_door: klaar ? email : null,
        afgehandeld_op: klaar ? new Date().toISOString() : null,
      }).eq('id', b.id);
      if (error) return res.status(500).json({ error: ontbreekt(error) });
      return res.status(200).json({ ok: true });
    }
    const tekst = String(b.tekst || '').trim();
    if (!tekst) return res.status(400).json({ error: 'Schrijf eerst je opmerking' });
    const { count } = await admin.from('huisrekening_meldingen').select('id', { count: 'exact', head: true }).eq('email', email).eq('status', 'open');
    if ((count || 0) >= 30) return res.status(429).json({ error: 'Je hebt al veel openstaande opmerkingen; wacht tot de beheerder ze heeft afgehandeld' });
    let naam = null;
    try {
      const { data } = await admin.from('personen').select('roepnaam,voornaam,voorletters,tussenvoegsel,achternaam')
        .or(`email_1.ilike.${email},email_2.ilike.${email},email_3.ilike.${email}`).limit(1);
      if (data && data[0]) naam = persNaam(data[0]);
    } catch (_) {}
    const { error } = await admin.from('huisrekening_meldingen').insert({
      email, naam, maand: String(b.maand || '').slice(0, 20) || null,
      onderwerp: String(b.onderwerp || '').slice(0, 300) || null, tekst: tekst.slice(0, 2000),
    });
    if (error) return res.status(500).json({ error: ontbreekt(error) });
    return res.status(200).json({ ok: true });
  }

  if (actie === 'mail') {
    if (!canEdit) return res.status(403).json({ error: 'Alleen beheerders van de huisrekening mogen mailen' });
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const { onderwerp, tekst, items } = req.body || {};
    if (!onderwerp || !Array.isArray(items) || !items.length) return res.status(400).json({ error: 'onderwerp en items zijn verplicht' });
    if (items.length > 5) return res.status(400).json({ error: 'Maximaal 5 mails per keer' });
    const GMAIL_USER = process.env.GMAIL_USER, GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;
    if (!GMAIL_USER || !GMAIL_APP_PASSWORD) return res.status(500).json({ error: 'Gmail is niet ingesteld (GMAIL_USER en GMAIL_APP_PASSWORD in Vercel)' });
    // Alleen mailen naar site-leden die in de huisrekening aan een persoon gekoppeld zijn.
    const { data: hr } = await admin.from('huisrekening').select('data').eq('id', 1).maybeSingle();
    const gekoppeld = new Set(((hr && hr.data && hr.data.people) || []).map(p => p.siteId).filter(Boolean).map(String));
    const ids = items.map(it => String(it.siteId || ''));
    if (ids.some(id => !gekoppeld.has(id))) return res.status(400).json({ error: 'Iemand in de lijst is niet aan de huisrekening gekoppeld' });
    const { data: pers } = await admin.from('personen').select('id,email_1,email_2,email_3').in('id', ids);
    const adres = Object.fromEntries((pers || []).map(p => [String(p.id), persEmail(p)]));
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD } });
    let verstuurd = 0; const mislukt = [];
    for (const it of items) {
      const naar = adres[String(it.siteId)];
      if (!naar) { mislukt.push({ naam: it.naam, fout: 'geen e-mailadres op de site' }); continue; }
      const pdf = String(it.pdf || '');
      if (!/^[A-Za-z0-9+/=]+$/.test(pdf) || pdf.length > 2_000_000) { mislukt.push({ naam: it.naam, fout: 'PDF ontbreekt of is te groot' }); continue; }
      try {
        await transporter.sendMail({
          from: `Huisrekening Oude Delft 35 <${GMAIL_USER}>`,
          to: naar,
          replyTo: email,
          subject: String(onderwerp).slice(0, 200),
          html: mailHtml({ naam: it.naam, tekst: String(tekst || '').slice(0, 5000), samenvatting: String(it.samenvatting || '').slice(0, 500) }),
          text: `Beste ${it.naam},\n\n${tekst || ''}\n\n${it.samenvatting || ''}\n\nJe volledige overzicht zit als PDF in de bijlage.`,
          attachments: [{ filename: String(it.bestandsnaam || 'huisrekening.pdf').replace(/[\\/:*?"<>|]+/g, '').slice(0, 120), content: pdf, encoding: 'base64', contentType: 'application/pdf' }],
        });
        verstuurd++;
      } catch (e) { mislukt.push({ naam: it.naam, fout: e.message || String(e) }); }
    }
    return res.status(200).json({ ok: true, verstuurd, mislukt });
  }

  if (req.method === 'GET') {
    const { data, error } = await admin.from('huisrekening').select('data,rev').eq('id', 1).maybeSingle();
    if (error) return res.status(500).json({ error: 'Kon de huisrekening niet laden' });
    if (!data) return res.status(404).json({ error: 'nog geen gegevens' });
    return res.status(200).json({ data: data.data, rev: data.rev, canEdit, barman, beheerders: await beheerderNamen(admin) });
  }

  if (req.method === 'PUT') {
    if (!canEdit && !barman) return res.status(403).json({ error: 'Alleen beheerders van de huisrekening kunnen opslaan' });
    let { data, rev } = req.body || {};
    if (!data || typeof data !== 'object' || !Number.isInteger(rev)) {
      return res.status(400).json({ error: 'data of rev ontbreekt' });
    }
    if (!canEdit) {
      // Barman: alleen de afkoopmomenten per maand worden overgenomen, de rest blijft zoals het op de server staat.
      const { data: huidig, error: e1 } = await admin.from('huisrekening').select('data,rev').eq('id', 1).maybeSingle();
      if (e1 || !huidig) return res.status(500).json({ error: 'Opslaan mislukt' });
      if (huidig.rev !== rev) return res.status(409).json({ error: 'Iemand anders heeft intussen opgeslagen' });
      data = metAfkopen(huidig.data, data);
    }
    const { data: nieuw, error } = await admin.rpc('huisrekening_opslaan', { p_data: data, p_rev: rev, p_email: email });
    if (error) return res.status(500).json({ error: 'Opslaan mislukt' });
    if (nieuw === null || nieuw === undefined) return res.status(409).json({ error: 'Iemand anders heeft intussen opgeslagen' });
    return res.status(200).json({ rev: nieuw });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
