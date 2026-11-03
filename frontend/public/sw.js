// Lets older phone browsers treat the software as installable, and says so clearly when there is no connection.
// Nothing is stored, so every page always comes fresh from the server.
const OFFLINE_PAGE = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>אין חיבור</title></head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0a1e3c;font-family:Arial,sans-serif;text-align:center;padding:24px;box-sizing:border-box">
<div style="background:#fff;border-radius:16px;padding:28px;max-width:320px"><p style="font-size:18px;font-weight:700;color:#0a1e3c;margin:0 0 8px">לא הצלחנו להתחבר לתוכנה</p><p style="font-size:14px;color:#475569;margin:0 0 18px">כדאי לבדוק שיש אינטרנט ולנסות שוב.</p><a href="/" style="display:inline-block;background:#007f91;color:#fff;font-weight:700;text-decoration:none;padding:10px 22px;border-radius:10px">לנסות שוב</a></div>
</body></html>`;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// A connection that drops for a moment is tried again first, so a brief hiccup never looks like an outage.
async function openPage(request) {
  for (const pause of [300, 1000]) {
    try {
      return await fetch(request);
    } catch {
      await wait(pause);
    }
  }
  return fetch(request);
}

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate' || event.request.method !== 'GET') return;
  event.respondWith(openPage(event.request).catch(() => new Response(OFFLINE_PAGE, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } })));
});
