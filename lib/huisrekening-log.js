// Maakt van het verschil tussen twee standen van de huisrekening leesbare regels voor het logboek,
// bijvoorbeeld "September 2026 · Pilsrekening · Bar · turven · Bonjer: 5 → 6".
const WOORD = {
  months: '', pils: 'Pilsrekening', bar: 'Bar', nestor: 'Nestor', turven: 'turven', ho: 'HO-turven', fust: 'Fusten', krat: 'Kratten',
  begin20: 'begin 20L', begin50: 'begin 50L', bought20: 'gekocht 20L', bought50: 'gekocht 50L', end20: 'eind 20L', end50: 'eind 50L',
  begin: 'begin', bought: 'gekocht', end: 'eind', afkoop: 'Afkopen', participants: 'deelnemers', payers: 'meebetalers', shared: 'Gedeelde kosten',
  impAanp: 'Aanpassing', pilsAanp: 'Pilsaanpassing', afkoopAanp: 'Afkoopaanpassing', scAanp: 'Servicekosten', transactions: 'Transacties',
  events: 'Extra correcties', people: 'Personen', huislasten: 'Huislasten', rooms: 'Kamers', kas: 'Huiskas', stat: 'Statiegeld', leeg: 'leeg',
  terug: 'teruggenomen', statAfr: 'Statiegeld op de rekening', statiegeld: 'Statiegeldbedragen', pilsSettings: 'Pilsinstellingen',
  sanctions: 'Sancties', categories: 'Kostenposten', bankRules: 'Bankregels', recurring: 'Vaste kosten', house: 'Huisgegevens',
  tabelPersonen: 'Personen in de tabellen', wie: 'wie', vast: 'vast bedrag', totaal: 'totaal', amount: 'bedrag', label: 'naam', name: 'naam',
  count: 'aantal', price: 'prijs', type: 'soort', date: 'datum', status: 'status', kind: 'soort', cfg: 'Instellingen van de maand', check: 'Checklist', mailVerstuurd: 'Mail verstuurd',
};
const OVERSLAAN = new Set(['savedAt', 'rev', 'schema', 'saldoMeldingen', 'snapshot']);
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const metId = a => Array.isArray(a) && a.length > 0 && a.every(x => isObj(x) && x.id != null);
const naamVan = x => (x && (x.label || x.name || x.titel || x.id)) || '';

function gelijk(a, b) {
  if (a === b) return true;
  if ((a == null) || (b == null)) return a == null && b == null;
  if (Array.isArray(a)) return Array.isArray(b) && a.length === b.length && a.every((x, i) => gelijk(x, b[i]));
  if (typeof a !== 'object' || typeof b !== 'object' || Array.isArray(b)) return false;
  const k = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const x of k) if (!gelijk(a[x], b[x])) return false;
  return true;
}

function wijzigingen(oud, nieuw, max = 40) {
  const mensen = {};
  for (const p of [...((oud && oud.people) || []), ...((nieuw && nieuw.people) || [])]) if (p && p.id) mensen[p.id] = p.name;
  const toon = v => (v == null || v === '' ? 'leeg' : typeof v === 'object' ? 'aangepast' : mensen[v] || String(v));
  const regels = [];
  const zeg = (pad, tekst) => regels.push([...pad.filter(Boolean), tekst].join(' · '));
  const sleutel = k => (mensen[k] != null ? mensen[k] : Object.prototype.hasOwnProperty.call(WOORD, k) ? WOORD[k] : k);

  function loop(a, b, pad) {
    if (gelijk(a, b)) return;
    if (metId(a) || metId(b)) {
      const A = new Map((a || []).filter(isObj).map(x => [x.id, x])), B = new Map((b || []).filter(isObj).map(x => [x.id, x]));
      for (const [id, x] of B) if (!A.has(id)) zeg(pad, `toegevoegd: ${naamVan(x)}`);
      for (const [id, x] of A) if (!B.has(id)) zeg(pad, `verwijderd: ${naamVan(x)}`);
      for (const [id, x] of B) if (A.has(id)) loop(A.get(id), x, [...pad, naamVan(x)]);
      return;
    }
    if (Array.isArray(a) || Array.isArray(b)) {
      const A = Array.isArray(a) ? a : [], B = Array.isArray(b) ? b : [];
      if ([...A, ...B].every(x => typeof x !== 'object')) {
        const bij = B.filter(x => !A.includes(x)), weg = A.filter(x => !B.includes(x));
        if (bij.length) zeg(pad, `${bij.map(toon).join(', ')} aangevinkt`);
        if (weg.length) zeg(pad, `${weg.map(toon).join(', ')} uitgevinkt`);
        return;
      }
      zeg(pad, 'aangepast');
      return;
    }
    if (isObj(a) && isObj(b)) {
      for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
        if (OVERSLAAN.has(k)) continue;
        loop(a[k], b[k], [...pad, sleutel(k)]);
      }
      return;
    }
    if (isObj(b) && a == null) {
      if (pad[pad.length - 1] === WOORD.cfg) return; // kopie van de instellingen bij het openen van een maand
      const n = naamVan(b); zeg(pad, n ? `toegevoegd: ${n}` : 'toegevoegd');
      return;
    }
    if (isObj(a) && b == null) { zeg(pad, 'verwijderd'); return; }
    zeg(pad.slice(0, -1).concat(pad[pad.length - 1]), `${toon(a)} → ${toon(b)}`);
  }
  loop(oud || {}, nieuw || {}, []);
  if (regels.length > max) return [...regels.slice(0, max), `en nog ${regels.length - max} wijzigingen`];
  return regels;
}

module.exports = { wijzigingen };
