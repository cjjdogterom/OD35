// Koppeling tussen de huisrekening-app en de OD35-site.
// Wordt in huisrekening.html geladen vóór de app. De app roept alleen deze functies aan.
// Alles loopt via /api/huisrekening op dezelfde site. De site logt in met Supabase en bewaart
// de sessie in localStorage (zelfde domein), dus we sturen dat token als Bearer mee.
(function () {
  const API = '/api/huisrekening';
  const SESSIE_SLEUTEL = 'sb-mxbtmbcgycjqapjzulrp-auth-token';
  let canEdit = false;
  let barman = false;

  function token() {
    try {
      const s = JSON.parse(localStorage.getItem(SESSIE_SLEUTEL) || 'null');
      return (s && (s.access_token || (s.currentSession && s.currentSession.access_token))) || null;
    } catch (e) { return null; }
  }
  function kop(extra) {
    const h = Object.assign({}, extra || {});
    const t = token();
    if (t) h.Authorization = 'Bearer ' + t;
    return h;
  }
  async function fout(res) {
    let msg = 'serverfout ' + res.status;
    try { const j = await res.json(); if (j && j.error) msg = j.error; } catch (e) {}
    return msg;
  }

  window.HUIS_BACKEND = {
    // → { data: <huisrekening-JSON>, rev: <nummer> }
    async load() {
      if (!token()) throw new Error('je bent niet ingelogd');
      const res = await fetch(API, { headers: kop(), cache: 'no-store' });
      if (res.status === 401) throw new Error('je bent niet ingelogd');
      if (!res.ok) throw new Error(await fout(res));
      const j = await res.json();
      canEdit = !!j.canEdit;
      barman = !!j.barman;
      window.HUIS_BEHEERDERS = j.beheerders || null;
      window.HUIS_HOOFDADMIN = !!j.hoofdadmin;
      window.HUIS_MIJN_ID = j.mijnId == null ? null : j.mijnId;
      return { data: j.data, rev: j.rev, actief: j.actief || [], laatsteDoor: j.laatsteDoor || null };
    },

    // → true als de ingelogde gebruiker beheerder is
    async canEdit() {
      return canEdit;
    },

    // → true als de ingelogde gebruiker barman is (mag alleen afkoopmomenten invullen en aanpassen)
    async isBarman() {
      return barman;
    },

    // Slaat de hele huisrekening op. rev = de versie waarop de beheerder verder werkte.
    // Gooit { code: 'conflict' } als iemand anders intussen opsloeg, { code: 'not_writer' } zonder rechten.
    async save(data, rev) {
      const res = await fetch(API, {
        method: 'PUT',
        cache: 'no-store',
        headers: kop({ 'content-type': 'application/json' }),
        body: JSON.stringify({ data, rev }),
      });
      if (res.status === 409) throw { code: 'conflict' };
      if (res.status === 401 || res.status === 403) throw { code: 'not_writer' };
      if (!res.ok) throw new Error(await fout(res));
      return await res.json(); // { rev: <nieuwe versie> }
    },

    async afschriften() {
      const res = await fetch(API + '?actie=afschriften', { headers: kop(), cache: 'no-store' });
      if (!res.ok) throw new Error(await fout(res));
      return (await res.json()).afschriften || [];
    },
    async afschrift(id) {
      const res = await fetch(API + '?actie=afschrift&id=' + encodeURIComponent(id), { headers: kop(), cache: 'no-store' });
      if (!res.ok) throw new Error(await fout(res));
      return await res.json(); // { naam, pdf (base64) }
    },
    async afschriftUpload(body) {
      const res = await fetch(API + '?actie=afschriften', { method: 'POST', cache: 'no-store', headers: kop({ 'content-type': 'application/json' }), body: JSON.stringify(body) });
      if (!res.ok) throw new Error(await fout(res));
      return await res.json();
    },
    async afschriftWeg(id) {
      const res = await fetch(API + '?actie=afschriften&id=' + encodeURIComponent(id), { method: 'DELETE', cache: 'no-store', headers: kop() });
      if (!res.ok) throw new Error(await fout(res));
      return await res.json();
    },
    async logboek() {
      const res = await fetch(API + '?actie=logboek', { headers: kop(), cache: 'no-store' });
      if (!res.ok) throw new Error(await fout(res));
      return (await res.json()).logboek || [];
    },
    async backups() {
      const res = await fetch(API + '?actie=backups', { headers: kop(), cache: 'no-store' });
      if (!res.ok) throw new Error(await fout(res));
      return (await res.json()).backups || [];
    },
    async terugzetten(id) {
      const res = await fetch(API + '?actie=terugzetten', { method: 'POST', cache: 'no-store', headers: kop({ 'content-type': 'application/json' }), body: JSON.stringify({ id }) });
      if (!res.ok) throw new Error(await fout(res));
      return await res.json();
    },
    // Pushmelding naar wie geraakt is door een aanpassing achteraf. items: [{ pid, d, maand }]
    async saldoPush(items) {
      const res = await fetch(API + '?actie=saldopush', { method: 'POST', cache: 'no-store', headers: kop({ 'content-type': 'application/json' }), body: JSON.stringify({ items }) });
      if (!res.ok) throw new Error(await fout(res));
      return await res.json();
    },

    // → [{ id, naam, jaar, email }] — leden van de site, om huisrekening-personen aan te koppelen
    async leden() {
      const res = await fetch(API + '?actie=leden', { headers: kop(), cache: 'no-store' });
      if (!res.ok) throw new Error(await fout(res));
      return (await res.json()).leden || [];
    },

    // Opmerkingen: beheerders krijgen ze allemaal, leden alleen hun eigen.
    async meldingen() {
      const res = await fetch(API + '?actie=meldingen', { headers: kop(), cache: 'no-store' });
      if (!res.ok) throw new Error(await fout(res));
      return (await res.json()).meldingen || [];
    },
    // Nieuw: { maand, onderwerp, tekst }. Afhandelen (beheerder): { id, status, antwoord }.
    async meld(body) {
      const res = await fetch(API + '?actie=meldingen', {
        method: 'POST',
        cache: 'no-store',
        headers: kop({ 'content-type': 'application/json' }),
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await fout(res));
      return await res.json();
    },

    // Verstuurt maximaal 5 mails met PDF. items: [{ siteId, naam, samenvatting, bestandsnaam, pdf (base64) }]
    async mail(onderwerp, tekst, items) {
      const res = await fetch(API + '?actie=mail', {
        method: 'POST',
        cache: 'no-store',
        headers: kop({ 'content-type': 'application/json' }),
        body: JSON.stringify({ onderwerp, tekst, items }),
      });
      if (!res.ok) throw new Error(await fout(res));
      return await res.json(); // { verstuurd, mislukt: [{ naam, fout }] }
    },
  };
})();
