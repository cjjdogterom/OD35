// Huisauto boeken — aangeroepen vanuit api/reserveer-plek.js (body.type === 'auto').
// Staat in lib/ zodat het niet als extra Vercel-functie telt (Hobby-plan: max 12).
//
// Regels:
//  - Alleen bewoners met aankomstjaar 2017 t/m het huidige jaar (gecontroleerd in reserveer-plek.js).
//  - Boeking = begin- en eindtijd; boekingen mogen niet overlappen.
//  - Anciënniteit: een ouder (lager) jaar mag een overlappende boeking van een jonger
//    jaar altijd overnemen, behalve als die rit al begonnen is. De verdrongen boeker en
//    diens chauffeur krijgen een mail.
//  - Maximaal 3 maanden vooruit, een boeking duurt maximaal 7 dagen.
//  - De chauffeur krijgt een bevestigingsmail (en een mail bij overname/annulering).
const nodemailer = require('nodemailer');

const MIN_JAAR = 2017;
const MAANDEN_VOORUIT = 3;
const MAX_DAGEN = 7;
const TZ = 'Europe/Amsterdam';

function lc(s) { return String(s || '').trim().toLowerCase(); }

function naamVan(p) {
  const voor = p.roepnaam || p.voornaam || p.voorletters;
  return [voor, p.tussenvoegsel, p.achternaam].filter(Boolean).join(' ').trim();
}

function dagTijd(d) {
  return new Date(d).toLocaleString('nl-NL', {
    timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
  });
}
function tijd(d) {
  return new Date(d).toLocaleTimeString('nl-NL', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
}
function dagKey(d) {
  return new Date(d).toLocaleDateString('nl-NL', { timeZone: TZ });
}
// "zaterdag 4 oktober 10:00 tot 16:00" of, bij meerdere dagen, beide datums voluit.
function periode(b) {
  const zelfdeDag = dagKey(b.start_tijd) === dagKey(b.eind_tijd);
  return `${dagTijd(b.start_tijd)} tot ${zelfdeDag ? tijd(b.eind_tijd) : dagTijd(b.eind_tijd)}`;
}

let _transporter = null;
async function mail(to, subject, text) {
  const GMAIL_USER = process.env.GMAIL_USER;
  const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;
  if (!to || !GMAIL_USER || !GMAIL_APP_PASSWORD) return false;
  try {
    if (!_transporter) {
      _transporter = nodemailer.createTransport({
        service: 'gmail', auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
      });
    }
    await _transporter.sendMail({
      from: `Huisauto — Oude Delft 35 <${GMAIL_USER}>`,
      to, subject, text, replyTo: GMAIL_USER,
    });
    return true;
  } catch (_) { return false; } // mail is nooit kritiek voor de boeking
}

module.exports = async function huisauto(req, res, { admin, email, jaar, caller }) {
  const body = req.body || {};
  const callerNaam = naamVan(caller) || email;

  // ---------- Annuleren (alleen je eigen boeking) ----------
  if (body.actie === 'annuleer') {
    let b;
    try {
      const { data } = await admin.from('autoboekingen').select('*').eq('id', body.id).limit(1);
      b = data && data[0];
    } catch (_) { return res.status(500).json({ error: 'Kon de boeking niet opzoeken' }); }
    if (!b) return res.status(404).json({ error: 'Deze boeking bestaat niet meer.' });
    if (lc(b.email) !== email) return res.status(403).json({ error: 'Je kunt alleen je eigen boekingen annuleren.' });
    try { await admin.from('autoboekingen').delete().eq('id', b.id); }
    catch (_) { return res.status(500).json({ error: 'Annuleren mislukt' }); }

    if (b.chauffeur_email && lc(b.chauffeur_email) !== email) {
      await mail(b.chauffeur_email, 'Rit met de huisauto geannuleerd',
`Hoi ${b.chauffeur_naam || ''},

${callerNaam} heeft de rit met de huisauto geannuleerd waarvoor jij als chauffeur stond:
${periode(b)}.

Je hoeft dus niet te rijden.

Groet,
Oude Delft 35`);
    }
    return res.status(200).json({ ok: true, actie: 'geannuleerd' });
  }

  if (body.actie !== 'boek') return res.status(400).json({ error: 'Onbekende actie' });

  // ---------- Tijden controleren ----------
  const start = new Date(body.start);
  const eind = new Date(body.eind);
  if (isNaN(start) || isNaN(eind)) return res.status(400).json({ error: 'Kies een geldige datum en tijd.' });
  if (eind <= start) return res.status(400).json({ error: 'De eindtijd moet na de begintijd liggen.' });
  const nu = Date.now();
  if (start.getTime() < nu - 10 * 60 * 1000) {
    return res.status(400).json({ error: 'Je kunt niet in het verleden boeken.' });
  }
  const grens = new Date();
  grens.setMonth(grens.getMonth() + MAANDEN_VOORUIT);
  grens.setDate(grens.getDate() + 1); // ruimte voor tijdzoneverschil
  if (start > grens) {
    return res.status(400).json({ error: `Je kunt maximaal ${MAANDEN_VOORUIT} maanden vooruit boeken.` });
  }
  if (eind - start > MAX_DAGEN * 24 * 3600 * 1000) {
    return res.status(400).json({ error: `Een boeking mag maximaal ${MAX_DAGEN} dagen duren.` });
  }
  const notitie = String(body.notitie || '').trim().slice(0, 200) || null;

  // ---------- Chauffeur ----------
  // De server zoekt het e-mailadres zelf op (nooit een adres uit de browser overnemen).
  let chauffeurNaam = callerNaam;
  let chauffeurEmail = email;
  const ch = body.chauffeur || {};
  if (ch.type === 'huisgenoot') {
    let p;
    try {
      const { data } = await admin.from('personen')
        .select('roepnaam,voornaam,voorletters,tussenvoegsel,achternaam,aankomstjaar,email_1')
        .eq('id', ch.id).limit(1);
      p = data && data[0];
    } catch (_) { return res.status(500).json({ error: 'Kon de chauffeur niet opzoeken' }); }
    const pj = p ? Number(p.aankomstjaar) : 0;
    if (!p || !(pj >= MIN_JAAR && pj <= new Date().getFullYear())) {
      return res.status(400).json({ error: 'Kies een chauffeur uit de lijst.' });
    }
    chauffeurNaam = naamVan(p);
    chauffeurEmail = lc(p.email_1) || null;
  } else if (ch.type === 'anders') {
    chauffeurNaam = String(ch.naam || '').trim().slice(0, 80);
    if (!chauffeurNaam) return res.status(400).json({ error: 'Vul de naam van de chauffeur in.' });
    chauffeurEmail = null;
  }

  // ---------- Overlap + anciënniteit ----------
  let overlap;
  try {
    const { data, error } = await admin.from('autoboekingen').select('*')
      .lt('start_tijd', eind.toISOString())
      .gt('eind_tijd', start.toISOString());
    if (error) throw error;
    overlap = data || [];
  } catch (e) {
    return res.status(500).json({ error: 'Kon de agenda niet controleren: ' + (e.message || e) });
  }

  if (overlap.some(b => lc(b.email) === email)) {
    return res.status(409).json({ error: 'Je hebt zelf al een boeking die hiermee overlapt. Annuleer die eerst of kies een andere tijd.' });
  }
  const onderweg = overlap.find(b => new Date(b.start_tijd).getTime() <= nu);
  if (onderweg) {
    return res.status(409).json({ error: `De auto is op dat moment al onderweg met ${onderweg.naam || 'iemand'} (tot ${tijd(onderweg.eind_tijd)}).` });
  }
  const blokkeert = overlap.find(b => !(jaar < Number(b.aankomstjaar)));
  if (blokkeert) {
    return res.status(409).json({
      error: `De auto is dan al geboekt door ${blokkeert.naam || 'iemand'} (jaar ${blokkeert.aankomstjaar}): ${periode(blokkeert)}. ` +
             'Je kunt alleen boekingen van jongere jaren overnemen.',
    });
  }
  if (overlap.length && body.overnemen !== true) {
    return res.status(409).json({
      error: 'Dit tijdvak overlapt met een boeking van een jonger jaar.',
      overnemen: overlap.map(b => ({ naam: b.naam, aankomstjaar: b.aankomstjaar, periode: periode(b) })),
    });
  }

  // Jongere boekingen verdringen
  if (overlap.length) {
    try { await admin.from('autoboekingen').delete().in('id', overlap.map(b => b.id)); }
    catch (_) { return res.status(500).json({ error: 'Overnemen mislukt' }); }
  }

  const nieuw = {
    email, naam: callerNaam, aankomstjaar: jaar,
    start_tijd: start.toISOString(), eind_tijd: eind.toISOString(),
    chauffeur_naam: chauffeurNaam, chauffeur_email: chauffeurEmail, notitie,
  };
  const { error: insErr } = await admin.from('autoboekingen').insert(nieuw);
  if (insErr) {
    // Terugzetten wat we net verdrongen hebben (best effort)
    if (overlap.length) {
      try { await admin.from('autoboekingen').insert(overlap); } catch (_) {}
    }
    const overlapFout = insErr.code === '23P01' || /overlap|exclu/i.test(insErr.message || '');
    return res.status(409).json({
      error: overlapFout ? 'Net te laat — iemand anders heeft dit tijdvak zojuist geboekt. Ververs en probeer opnieuw.'
                         : 'Boeken mislukt: ' + (insErr.message || insErr),
    });
  }

  // ---------- Mails (best effort) ----------
  let mailsVerstuurd = 0;
  for (const b of overlap) {
    if (await mail(b.email, 'Je boeking van de huisauto is overgenomen',
`Hoi ${b.naam || ''},

${callerNaam} (jaar ${jaar}) heeft op basis van anciënniteit jouw boeking van de huisauto overgenomen:
${periode(b)}.

Je kunt in de app (tab "Huisauto") een ander moment kiezen.

Groet,
Oude Delft 35`)) mailsVerstuurd++;

    if (b.chauffeur_email && lc(b.chauffeur_email) !== lc(b.email)) {
      await mail(b.chauffeur_email, 'Rit met de huisauto vervalt',
`Hoi ${b.chauffeur_naam || ''},

De rit met de huisauto waarvoor jij als chauffeur stond (${periode(b)}, geboekt door ${b.naam || 'een huisgenoot'})
is overgenomen door ${callerNaam}. Je hoeft voor die rit dus niet te rijden.

Groet,
Oude Delft 35`);
    }
  }

  if (chauffeurEmail && chauffeurEmail !== email) {
    await mail(chauffeurEmail, 'Je bent chauffeur voor de huisauto',
`Hoi ${chauffeurNaam},

${callerNaam} heeft de huisauto geboekt en jou als chauffeur opgegeven:
${periode(nieuw)}.${notitie ? `\nNotitie: ${notitie}` : ''}

Kun je niet? Neem dan contact op met ${callerNaam}.

Groet,
Oude Delft 35`);
  }

  return res.status(200).json({
    ok: true,
    actie: 'geboekt',
    verdrongen: overlap.map(b => ({ naam: b.naam, aankomstjaar: b.aankomstjaar })),
    mailsVerstuurd,
  });
};
