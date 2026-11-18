// The local trial chat window (http://localhost:<port>/). Plain HTML, no build step.
export const CHAT_PAGE = `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>העוזר שלי</title>
<style>
  :root { --bg:#eae6df; --panel:#fff; --me:#d9fdd3; --text:#111b21; --muted:#667781; --accent:#0f766e; --line:#e2e8f0; }
  @media (prefers-color-scheme: dark) { :root { --bg:#0b141a; --panel:#111b21; --me:#005c4b; --text:#e9edef; --muted:#8696a0; --accent:#2dd4bf; --line:#222d34; } }
  * { box-sizing: border-box; }
  body { margin:0; font-family: system-ui, "Segoe UI", Arial, sans-serif; background:var(--bg); color:var(--text); height:100vh; display:flex; }
  main { flex:1; display:flex; flex-direction:column; min-width:0; }
  header { background:var(--panel); padding:12px 16px; border-bottom:1px solid var(--line); display:flex; align-items:center; gap:10px; }
  header b { font-size:16px; }
  header small { color:var(--muted); }
  #log { flex:1; overflow-y:auto; padding:16px; display:flex; flex-direction:column; gap:6px; }
  .m { max-width:min(80%,640px); padding:8px 11px; border-radius:10px; white-space:pre-wrap; line-height:1.45; font-size:15px; box-shadow:0 1px 1px rgba(0,0,0,.08); }
  .user { align-self:flex-start; background:var(--me); }
  .assistant { align-self:flex-end; background:var(--panel); }
  .t { font-size:11px; color:var(--muted); margin-top:3px; }
  form { display:flex; gap:8px; padding:10px; background:var(--panel); border-top:1px solid var(--line); }
  input { flex:1; padding:11px 14px; border-radius:22px; border:1px solid var(--line); background:var(--bg); color:var(--text); font-size:15px; }
  button { border:0; background:var(--accent); color:#fff; border-radius:22px; padding:0 18px; font-size:15px; cursor:pointer; }
  button:disabled { opacity:.5; }
  aside { width:300px; background:var(--panel); border-inline-start:1px solid var(--line); padding:14px; overflow-y:auto; }
  aside h3 { margin:0 0 8px; font-size:14px; }
  aside li { font-size:13px; margin-bottom:6px; }
  .st { font-size:13px; margin-bottom:14px; color:var(--muted); }
  @media (max-width: 760px) { aside { display:none; } }
</style>
</head>
<body>
<main>
  <header><b>העוזר שלי</b><small id="sub">ניסיון על המחשב</small></header>
  <div id="log"></div>
  <form id="f"><input id="q" placeholder="כתוב לו, למשל: מה יש לי מחר?" autocomplete="off"><button id="b">שלח</button></form>
</main>
<aside>
  <div class="st" id="st"></div>
  <section id="wa" style="display:none;margin-bottom:18px;padding:12px;border:1px solid var(--line);border-radius:10px">
    <h3>חיבור וואטסאפ</h3>
    <div id="waOk" style="display:none;color:var(--accent);font-size:14px">מחובר ✓ אפשר לכתוב לעוזר בוואטסאפ.</div>
    <div id="waSetup">
      <label style="font-size:12px;color:var(--muted)">המספר שלך (רק ממנו הוא יקבל פקודות)</label>
      <input id="own" inputmode="tel" placeholder="05X-XXXXXXX" style="width:100%;margin:4px 0 8px;border-radius:8px">
      <label style="font-size:12px;color:var(--muted)">המספר של העוזר (הפנוי)</label>
      <input id="bot" inputmode="tel" placeholder="05X-XXXXXXX" style="width:100%;margin:4px 0 8px;border-radius:8px">
      <button id="getCode" style="width:100%;padding:9px">קבל קוד חיבור</button>
      <div id="codeBox" style="display:none;margin-top:12px;text-align:center">
        <div style="font-size:12px;color:var(--muted)">הקוד לחיבור:</div>
        <div id="code" style="font-size:30px;font-weight:700;letter-spacing:3px;direction:ltr;margin:4px 0"></div>
        <div style="font-size:12px;color:var(--muted);line-height:1.5;text-align:right">בטלפון של המספר הפנוי: וואטסאפ ← ⋮ / הגדרות ← <b>מכשירים מקושרים</b> ← <b>קישור מכשיר</b> ← <b>קישור באמצעות מספר טלפון</b> ← הקלד את הקוד.<br>הקוד תקף כמה דקות. אם פג, לחץ שוב.</div>
      </div>
      <div id="waErr" style="color:#dc2626;font-size:12px;margin-top:6px"></div>
    </div>
  </section>
  <h3>מה הוא זוכר עליך</h3>
  <ul id="mem"></ul>
</aside>
<script>
const log = document.getElementById('log');
const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[c]));
const fmt = (s) => esc(s).replace(/\\*([^*\\n]+)\\*/g, '<b>$1</b>').replace(/(https?:\\/\\/[^\\s]+)/g, '<a href="$1" target="_blank">$1</a>');
function add(role, text, at) {
  const d = document.createElement('div');
  d.className = 'm ' + role;
  d.innerHTML = fmt(text) + '<div class="t">' + new Date(at || Date.now()).toLocaleTimeString('he-IL', { hour:'2-digit', minute:'2-digit' }) + '</div>';
  log.appendChild(d); log.scrollTop = log.scrollHeight; return d;
}
async function load() {
  const r = await fetch('/api/assistant/chat/history').then((x) => x.json());
  log.innerHTML = '';
  r.messages.forEach((m) => add(m.role, m.text, m.createdAt));
  document.getElementById('mem').innerHTML = r.memories.length ? r.memories.map((m) => '<li>' + esc(m.fact) + '</li>').join('') : '<li style="color:var(--muted)">עוד לא למד כלום</li>';
  document.getElementById('st').textContent = 'מנוי Claude: ' + (r.brain ? 'מחובר ✓' : 'לא מחובר') + ' · וואטסאפ: ' + (r.whatsapp ? 'מחובר ✓' : 'עוד לא');
  showWa(r.wa);
}
function showWa(wa) {
  if (!wa) return;
  document.getElementById('wa').style.display = 'block';
  const ok = wa.state === 'connected';
  document.getElementById('waOk').style.display = ok ? 'block' : 'none';
  document.getElementById('waSetup').style.display = ok ? 'none' : 'block';
  const own = document.getElementById('own'), bot = document.getElementById('bot');
  if (wa.ownerNumber && !own.value) own.value = wa.ownerNumber;
  if (wa.botNumber && !bot.value) bot.value = wa.botNumber;
  document.getElementById('codeBox').style.display = wa.code ? 'block' : 'none';
  document.getElementById('code').textContent = wa.code || '';
  document.getElementById('waErr').textContent = wa.error ? 'שגיאה: ' + wa.error : '';
}
document.getElementById('getCode').onclick = async () => {
  const b = document.getElementById('getCode');
  b.disabled = true; b.textContent = 'מבקש קוד…';
  const wa = await fetch('/api/assistant/wa/numbers', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ owner: document.getElementById('own').value, bot: document.getElementById('bot').value }) }).then((x) => x.json()).catch(() => null);
  b.disabled = false; b.textContent = 'קבל קוד חדש';
  showWa(wa || { state:'off', error:'לא הצלחתי לבקש קוד' });
};
setInterval(async () => {
  const r = await fetch('/api/assistant/chat/history').then((x) => x.json()).catch(() => null);
  if (r && r.wa) { showWa(r.wa); document.getElementById('st').textContent = 'מנוי Claude: ' + (r.brain ? 'מחובר ✓' : 'לא מחובר') + ' · וואטסאפ: ' + (r.whatsapp ? 'מחובר ✓' : 'עוד לא'); }
}, 5000);
document.getElementById('f').onsubmit = async (e) => {
  e.preventDefault();
  const q = document.getElementById('q'), b = document.getElementById('b');
  const text = q.value.trim(); if (!text) return;
  q.value = ''; b.disabled = true; add('user', text);
  const wait = add('assistant', 'חושב…');
  try { await fetch('/api/assistant/chat', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ text }) }); }
  catch { wait.textContent = 'לא הצלחתי להגיע לעוזר. הוא רץ?'; }
  b.disabled = false; await load(); q.focus();
};
load();
</script>
</body>
</html>`;
