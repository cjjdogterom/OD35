// Huisrekening: één JSON-document in tabel `huisrekening` (rij id = 1), met versienummer.
// Bereikbaar als /api/huisrekening (vercel.json stuurt dat door naar api/reserveer-plek.js,
// omdat het Hobby-plan maximaal 12 serverfuncties toestaat).
//
// Toegang staat los van de site-admins: alleen de hoofdadmin ziet de huisrekening standaard,
// en deelt toegang uit via tabel `huisrekening_toegang` (rol 'lezer' of 'beheerder').
// Een huisrekening-beheerder mag alleen de huisrekening opslaan, verder niets op de site.
//
// GET                    → { data, rev, canEdit }        (403 zonder toegang, 404 zonder gegevens)
// PUT { data, rev }      → { rev }                       (409 bij conflict, 403 zonder beheerrecht)
// GET  ?actie=status     → { toegang, canEdit, hoofdadmin }
// GET  ?actie=toegang    → { lijst: [{ email, rol }] }   (alleen hoofdadmin)
// POST ?actie=toegang { email, rol }  rol = 'lezer' | 'beheerder' | null (= intrekken)
const HOOFDADMIN_EMAIL = 'cjj.dogterom@gmail.com';

module.exports = async function huisrekening(req, res, { admin, email }) {
  res.setHeader('Cache-Control', 'no-store');
  const actie = String((req.query && req.query.actie) || '');
  const hoofdadmin = email === HOOFDADMIN_EMAIL;

  let rol = hoofdadmin ? 'beheerder' : null;
  if (!rol) {
    const { data } = await admin.from('huisrekening_toegang').select('rol').eq('email', email).maybeSingle();
    rol = (data && data.rol) || null;
  }
  const toegang = !!rol;
  const canEdit = rol === 'beheerder';

  if (actie === 'status') return res.status(200).json({ toegang, canEdit, hoofdadmin });

  if (actie === 'toegang') {
    if (!hoofdadmin) return res.status(403).json({ error: 'Alleen de hoofdadmin beheert de toegang' });
    if (req.method === 'GET') {
      const { data, error } = await admin.from('huisrekening_toegang').select('email,rol').order('email');
      if (error) return res.status(500).json({ error: 'Kon de toegang niet laden' });
      return res.status(200).json({ lijst: data || [] });
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
    return res.status(200).json({ data: data.data, rev: data.rev, canEdit });
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
