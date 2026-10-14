// Pushmeldingen naar de iPhone-app via de Expo-pushdienst.
// Staat in lib/ zodat het niet als extra Vercel-functie telt (Hobby-plan: max 12).
//
// De app (Expo) meldt een "ExponentPushToken[…]" aan in de tabel push_tokens.
// Expo stuurt de melding door naar Apple; de Apple-sleutel daarvoor beheert EAS
// (ingesteld bij het bouwen met `eas build`). Hier is dus geen Apple-sleutel nodig.
// Optioneel: EXPO_ACCESS_TOKEN in Vercel als je in Expo "enhanced push security" aanzet.
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

function isExpoToken(t) {
  return /^Expo(nent)?PushToken\[.+\]$/.test(String(t || ''));
}

/**
 * Stuurt een pushmelding naar alle app-toestellen van de opgegeven e-mailadressen.
 * @param admin   Supabase-client met service-role
 * @param emails  lijst e-mailadressen, of '*' voor iedereen met de app
 * @param bericht { titel, tekst, tab } — tab = tabblad dat opent bij aantikken
 * @returns { verstuurd, mislukt }
 */
async function stuurPush(admin, emails, { titel, tekst, tab }) {
  let query = admin.from('push_tokens').select('token');
  if (emails !== '*') {
    const lijst = [...new Set((emails || []).map(e => String(e || '').trim().toLowerCase()).filter(Boolean))];
    if (!lijst.length) return { verstuurd: 0, mislukt: 0 };
    query = query.in('email', lijst);
  }
  const { data, error } = await query;
  if (error || !data) return { verstuurd: 0, mislukt: 0 };
  const tokens = [...new Set(data.map(r => r.token).filter(isExpoToken))];
  if (!tokens.length) return { verstuurd: 0, mislukt: 0 };

  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  if (process.env.EXPO_ACCESS_TOKEN) headers.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;

  let verstuurd = 0, mislukt = 0;
  const ongeldig = [];
  // Expo accepteert maximaal 100 meldingen per verzoek
  for (let i = 0; i < tokens.length; i += 100) {
    const deel = tokens.slice(i, i + 100);
    const berichten = deel.map(to => ({ to, title: titel, body: tekst, sound: 'default', data: tab ? { tab } : {} }));
    try {
      const r = await fetch(EXPO_PUSH_URL, { method: 'POST', headers, body: JSON.stringify(berichten) });
      const json = await r.json().catch(() => ({}));
      const tickets = Array.isArray(json.data) ? json.data : [];
      deel.forEach((token, j) => {
        const t = tickets[j];
        if (t && t.status === 'ok') verstuurd++;
        else {
          mislukt++;
          // App verwijderd of token verlopen → opruimen
          if (t && t.details && t.details.error === 'DeviceNotRegistered') ongeldig.push(token);
        }
      });
    } catch (_) {
      mislukt += deel.length;
    }
  }
  if (ongeldig.length) {
    try { await admin.from('push_tokens').delete().in('token', ongeldig); } catch (_) {}
  }
  return { verstuurd, mislukt };
}

module.exports = { stuurPush };
