// Huisrekening: één JSON-document in tabel `huisrekening` (rij id = 1), met versienummer.
// Bereikbaar als /api/huisrekening (vercel.json stuurt dat door naar api/reserveer-plek.js,
// omdat het Hobby-plan maximaal 12 serverfuncties toestaat).
//
// Toegang staat los van de site-admins: alleen de hoofdadmin ziet de huisrekening standaard,
// en deelt toegang uit: per jaargang (tabel `huisrekening_jaargangen`, iedereen daaruit is lezer)
// en per persoon (tabel `huisrekening_toegang`, rol 'lezer' of 'beheerder').
// Een huisrekening-beheerder mag alleen de huisrekening opslaan, verder niets op de site.
//
// GET                    → { data, rev, canEdit }        (403 zonder toegang, 404 zonder gegevens)
// PUT { data, rev }      → { rev }                       (409 bij conflict, 403 zonder beheerrecht)
// GET  ?actie=status     → { toegang, canEdit, hoofdadmin }
// GET  ?actie=toegang    → { lijst: [{ email, rol }], jaargangen: [jaar] }   (alleen hoofdadmin)
// POST ?actie=toegang { email, rol }  rol = 'lezer' | 'beheerder' | null (= intrekken)
// POST ?actie=toegang { jaargangen: [jaar] }  vervangt de aangevinkte jaargangen
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

module.exports = async function huisrekening(req, res, { admin, email }) {
  res.setHeader('Cache-Control', 'no-store');
  const actie = String((req.query && req.query.actie) || '');
  const hoofdadmin = email === HOOFDADMIN_EMAIL;

  let rol = hoofdadmin ? 'beheerder' : null;
  if (!rol) {
    // Alle e-mailadressen van deze persoon tellen mee, en zijn of haar aankomstjaar.
    let emails = [email], jaar = null;
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
    else if (rijen && rijen.length) rol = 'lezer';
    else if (jaar) {
      const { data: j } = await admin.from('huisrekening_jaargangen').select('jaar').eq('jaar', jaar).maybeSingle();
      if (j) rol = 'lezer';
    }
  }
  const toegang = !!rol;
  const canEdit = rol === 'beheerder';

  if (actie === 'status') return res.status(200).json({ toegang, canEdit, hoofdadmin });

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
        ? (['lezer', 'beheerder'].includes(nieuweRol)
            ? await admin.from('huisrekening_toegang').upsert({ email: doel, rol: nieuweRol })
            : { error: 'rol' })
        : await admin.from('huisrekening_toegang').delete().eq('email', doel);
      if (error) return res.status(error === 'rol' ? 400 : 500).json({ error: 'Opslaan van de toegang mislukt' });
      return res.status(200).json({ ok: true });
    }
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!toegang) return res.status(403).json({ error: 'Je hebt geen toegang tot de huisrekening' });

  if (req.method === 'GET') {
    const { data, error } = await admin.from('huisrekening').select('data,rev').eq('id', 1).maybeSingle();
    if (error) return res.status(500).json({ error: 'Kon de huisrekening niet laden' });
    if (!data) return res.status(404).json({ error: 'nog geen gegevens' });
    return res.status(200).json({ data: data.data, rev: data.rev, canEdit, beheerders: await beheerderNamen(admin) });
  }

  if (req.method === 'PUT') {
    if (!canEdit) return res.status(403).json({ error: 'Alleen beheerders van de huisrekening kunnen opslaan' });
    const { data, rev } = req.body || {};
    if (!data || typeof data !== 'object' || !Number.isInteger(rev)) {
      return res.status(400).json({ error: 'data of rev ontbreekt' });
    }
    const { data: nieuw, error } = await admin.rpc('huisrekening_opslaan', { p_data: data, p_rev: rev, p_email: email });
    if (error) return res.status(500).json({ error: 'Opslaan mislukt' });
    if (nieuw === null || nieuw === undefined) return res.status(409).json({ error: 'Iemand anders heeft intussen opgeslagen' });
    return res.status(200).json({ rev: nieuw });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
