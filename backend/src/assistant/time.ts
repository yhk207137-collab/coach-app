// Israel time helpers and Shabbat / Yom Tov quiet time (the assistant sends nothing then).
const TZ = 'Asia/Jerusalem';
const DAY = 24 * 3600e3;

const partsFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

function israelParts(d: Date) {
  const p = Object.fromEntries(partsFmt.formatToParts(d).map((x) => [x.type, x.value]));
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, s: +p.second };
}

/** "2026-11-20T09:00" in Israel time → the real moment. */
export function fromIsraelLocal(local: string): Date {
  const m = local.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  if (!m) throw new Error(`תאריך לא תקין: ${local}`);
  const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 9), +(m[5] || 0));
  // Find the offset Israel had at that wall-clock time (handles summer/winter time).
  let guess = wall;
  for (let i = 0; i < 2; i++) {
    const p = israelParts(new Date(guess));
    const shown = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi);
    guess += wall - shown;
  }
  return new Date(guess);
}

/** The moment → "2026-11-20T09:00" Israel time. */
export function toIsraelLocal(d: Date) {
  const p = israelParts(d);
  const z = (n: number) => String(n).padStart(2, '0');
  return `${p.y}-${z(p.mo)}-${z(p.d)}T${z(p.h)}:${z(p.mi)}`;
}

export const israelDay = (d: Date) => toIsraelLocal(d).slice(0, 10);
export const israelHHMM = (d: Date) => toIsraelLocal(d).slice(11, 16);

const showFmt = new Intl.DateTimeFormat('he-IL', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
export const showWhen = (d: Date) => showFmt.format(d);

// ── Shabbat and Yom Tov ─────────────────────────────────────────────────────
const weekdayFmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' });
const hebrewFmt = new Intl.DateTimeFormat('en-u-ca-hebrew', { timeZone: TZ, month: 'long', day: 'numeric' });
const YOM_TOV: Record<string, number[]> = { Tishri: [1, 2, 10, 15, 22], Nisan: [15, 21], Sivan: [6] };

function isRestDay(d: Date) {
  if (weekdayFmt.format(d) === 'Sat') return true;
  const parts = hebrewFmt.formatToParts(d);
  const month = parts.find((p) => p.type === 'month')?.value || '';
  const day = Number(parts.find((p) => p.type === 'day')?.value);
  return (YOM_TOV[month] || []).includes(day);
}

/** From 15:00 on the eve until 20:30 at the end of Shabbat / Yom Tov. */
export function isQuietTime(now = new Date()) {
  const t = israelHHMM(now);
  if (isRestDay(now) && t < '20:30') return true;
  return isRestDay(new Date(now.getTime() + DAY)) && t >= '15:00';
}

/** The first moment at or after `d` that is not quiet time. */
export function afterQuiet(d: Date) {
  let t = new Date(d);
  for (let i = 0; i < 400 && isQuietTime(t); i++) t = new Date(t.getTime() + 15 * 60e3);
  return t;
}

/** The next time a repeating reminder is due after `now`, skipping Shabbat and Yom Tov. */
export function nextOccurrence(from: Date, repeat: string, now: Date) {
  let local = toIsraelLocal(from);
  for (let i = 0; i < 1000; i++) {
    const [d, t] = local.split('T');
    const [y, m, day] = d.split('-').map(Number);
    const step = new Date(Date.UTC(y, m - 1, day));
    if (repeat === 'daily') step.setUTCDate(step.getUTCDate() + 1);
    else if (repeat === 'weekly') step.setUTCDate(step.getUTCDate() + 7);
    else step.setUTCMonth(step.getUTCMonth() + 1);
    local = `${step.toISOString().slice(0, 10)}T${t}`;
    const at = fromIsraelLocal(local);
    // A repeating reminder skips Shabbat / Yom Tov and comes back at its usual time.
    if (at > now && !isQuietTime(at)) return at;
  }
  return null;
}
