// Pushmeldingen naar de iPhone-app via Apple Push Notification service (APNs).
// Staat in lib/ zodat het niet als extra Vercel-functie telt (Hobby-plan: max 12).
//
// Nodig in Vercel (Settings → Environment Variables), zie APP-SETUP.md:
//   APNS_KEY       inhoud van het .p8-bestand (mag met \n i.p.v. echte regeleindes)
//   APNS_KEY_ID    10 tekens, staat bij de sleutel in het Apple Developer-portaal
//   APNS_TEAM_ID   10 tekens, rechtsboven in het Apple Developer-portaal
//   APNS_BUNDLE_ID nl.oudedelft35.app (optioneel, dit is de standaard)
// Zonder deze variabelen doet stuurPush niets (en geeft geen fout).
const http2 = require('http2');
const crypto = require('crypto');

const HOSTS = {
  production: 'https://api.push.apple.com',
  sandbox: 'https://api.sandbox.push.apple.com',
};

let _jwt = null;
let _jwtTijd = 0;

// Apple wil een ondertekend token (ES256) dat maximaal een uur oud is; we vernieuwen na 40 min.
function apnsToken() {
  const keyId = process.env.APNS_KEY_ID;
  const teamId = process.env.APNS_TEAM_ID;
  const key = (process.env.APNS_KEY || '').replace(/\\n/g, '\n');
  if (!keyId || !teamId || !key.includes('PRIVATE KEY')) return null;
  if (_jwt && Date.now() - _jwtTijd < 40 * 60 * 1000) return _jwt;
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const ongetekend = b64({ alg: 'ES256', kid: keyId }) + '.' + b64({ iss: teamId, iat: Math.floor(Date.now() / 1000) });
  const handtekening = crypto.sign('sha256', Buffer.from(ongetekend), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  _jwt = ongetekend + '.' + handtekening;
  _jwtTijd = Date.now();
  return _jwt;
}

function verstuurEen(sessie, token, payload, jwt, topic) {
  return new Promise(resolve => {
    const req = sessie.request({
      ':method': 'POST',
      ':path': `/3/device/${token}`,
      authorization: `bearer ${jwt}`,
      'apns-topic': topic,
      'apns-push-type': 'alert',
      'apns-priority': '10',
      'content-type': 'application/json',
    });
    let status = 0, body = '';
    req.setTimeout(10000, () => { req.close(); resolve({ status: 0, reden: 'timeout' }); });
    req.on('response', h => { status = h[':status']; });
    req.on('data', d => { body += d; });
    req.on('end', () => {
      let reden = '';
      try { reden = JSON.parse(body || '{}').reason || ''; } catch (_) {}
      resolve({ status, reden });
    });
    req.on('error', () => resolve({ status: 0, reden: 'netwerkfout' }));
    req.end(JSON.stringify(payload));
  });
}

/**
 * Stuurt een pushmelding naar alle app-toestellen van de opgegeven e-mailadressen.
 * @param admin   Supabase-client met service-role
 * @param emails  lijst e-mailadressen, of '*' voor iedereen met de app
 * @param bericht { titel, tekst, tab } — tab = tabblad dat opent bij aantikken
 * @returns { verstuurd, mislukt, reden? }
 */
async function stuurPush(admin, emails, { titel, tekst, tab }) {
  const jwt = apnsToken();
  if (!jwt) return { verstuurd: 0, mislukt: 0, reden: 'pushmeldingen nog niet ingesteld (APNS_*)' };
  const topic = process.env.APNS_BUNDLE_ID || 'nl.oudedelft35.app';

  let query = admin.from('push_tokens').select('token,omgeving');
  if (emails !== '*') {
    const lijst = [...new Set((emails || []).map(e => String(e || '').trim().toLowerCase()).filter(Boolean))];
    if (!lijst.length) return { verstuurd: 0, mislukt: 0 };
    query = query.in('email', lijst);
  }
  const { data: tokens, error } = await query;
  if (error || !tokens || !tokens.length) return { verstuurd: 0, mislukt: 0 };

  const payload = { aps: { alert: { title: titel, body: tekst }, sound: 'default' } };
  if (tab) payload.tab = tab;

  let verstuurd = 0, mislukt = 0;
  const ongeldig = [];
  for (const [omgeving, host] of Object.entries(HOSTS)) {
    const groep = tokens.filter(t => (t.omgeving || 'production') === omgeving);
    if (!groep.length) continue;
    let sessie;
    try { sessie = http2.connect(host); } catch (_) { mislukt += groep.length; continue; }
    sessie.on('error', () => {});
    const resultaten = await Promise.all(groep.map(t => verstuurEen(sessie, t.token, payload, jwt, topic)));
    sessie.close();
    resultaten.forEach((r, i) => {
      if (r.status === 200) verstuurd++;
      else {
        mislukt++;
        // Toestel heeft de app verwijderd of token hoort niet (meer) bij deze app → opruimen
        if (r.status === 410 || ['BadDeviceToken', 'Unregistered', 'DeviceTokenNotForTopic'].includes(r.reden)) {
          ongeldig.push(groep[i].token);
        }
      }
    });
  }
  if (ongeldig.length) {
    try { await admin.from('push_tokens').delete().in('token', ongeldig); } catch (_) {}
  }
  return { verstuurd, mislukt };
}

module.exports = { stuurPush };
