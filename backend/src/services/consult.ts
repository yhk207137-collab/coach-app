// Free consult meetings ("פגישת הקפצה"): availability from Google Calendar, booking, the reminder
// sequence (warm-up email, confirmation request, last reminder) and the counter of places left.
// Every time is Israel time.
import { google } from 'googleapis';
import { ConsultBooking, ConsultStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { sendEmail } from '../lib/email';
import { getAuthorizedClient } from './calendar';
import { dayKey, isQuietTime, getAlertSettings, ownerEmailFrame, ownerEmailSection, ownerAppUrl, OWNER_SENDER_NAME, whatsappLink } from './alerts';
import { sendTextMessage, phoneDigits, messagingConnected } from './messaging';

const TZ = 'Asia/Jerusalem';
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// ── Settings (all editable from the settings screen) ────────────────────────

export interface ConsultHours { day: number; on: boolean; from: string; to: string } // day: 0 = Sunday
export interface ConsultSettings {
  open: boolean;
  maxMeetings: number;
  duration: number;
  step: number;          // minutes between possible start times
  minNoticeHours: number;
  horizonDays: number;
  hours: ConsultHours[];
  meetingLink: string;   // fixed link (Zoom etc.); empty = a Google Meet link per meeting
  bookingPageUrl: string;
  warmSubject: string;
  warmBody: string;
  confirmText: string;
  finalText: string;
}

export const DEFAULT_CONSULT_SETTINGS: ConsultSettings = {
  open: true,
  maxMeetings: 15,
  duration: 40,
  step: 60,
  minNoticeHours: 3,
  horizonDays: 21,
  hours: [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, on: day <= 4, from: '09:00', to: '17:00' })),
  meetingLink: '',
  bookingPageUrl: 'https://yehoshua.co.il/book.html',
  warmSubject: 'לפני שאנחנו נפגשים, הדבר האחד שמשנה כל פגישה עם תורם',
  warmBody: [
    'שלום {שם},',
    'שמח שקבעת. לפני שנשב יחד, רציתי לשתף אותך בדבר אחד מהמדריך, שאני רואה שוב ושוב אצל מנהלי עמותות.',
    'רוב המנהלים נכנסים לשיחה עם תורם עם מחשבה קטנה בראש: "אולי אני מפריע לו? אולי הוא כבר תרם מספיק?". ומהרגע הזה, כל השיחה נשמעת כמו בקשת טובה.',
    'אבל אתה לא מגיע לבקש טובה. אתה מגיע להעניק לתורם הזדמנות להיות שותף בעשייה גדולה. לו יש את הכסף, ולך יש את השליחות ואת היכולת להפוך אותו לחיים טובים יותר.',
    'כלי קטן ליישום כבר השבוע: לפני השיחה הבאה עם תורם, כתוב משפט אחד שמתחיל במילים "אני מציע לך להיות שותף ב...". קרא אותו לעצמך לפני שאתה מרים טלפון, ושים לב איך הטון שלך משתנה.',
    'ושאלה אחת לחשוב עליה לקראת הפגישה: מה הדבר שהכי תוקע היום את {שם_העמותה}, ואם הוא היה נפתר מחר בבוקר, מה היה משתנה?',
    'נתראה ב{יום} ב-{שעה}. 40 דקות שיכולות לשנות את הכיוון של {שם_העמותה}.',
    'יהושע כהן',
  ].join('\n\n'),
  confirmText: 'שלום {שם}, {מתי} ב-{שעה} אנחנו נפגשים, ואני כבר מחכה! 40 דקות שבהן נבנה יחד את הצעד הבא שיקפיץ את {שם_העמותה} קדימה.\nמגיעים? השיבו 1 לאישור.\nצריך להזיז? לחצו כאן: {קישור_לשינוי}',
  finalText: '{שם}, עוד שעתיים נפגשים! 🙌 {שעה}. הקישור לפגישה: {קישור_לפגישה}. כדאי להגיע עם השאלה שהכי מעסיקה אתכם כרגע בעמותה.',
};

const SETTINGS_KEY = 'consult_settings';
const clean = (v: unknown, max: number) => String(v ?? '').slice(0, max);
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const int = (v: unknown, min: number, max: number, dflt: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt;
};

export async function getConsultSettings(): Promise<ConsultSettings> {
  const row = await prisma.setting.findUnique({ where: { key: SETTINGS_KEY } });
  const saved = row ? JSON.parse(row.value) : {};
  return { ...DEFAULT_CONSULT_SETTINGS, ...saved };
}

export async function saveConsultSettings(patch: Partial<ConsultSettings>) {
  const cur = await getConsultSettings();
  const next: ConsultSettings = {
    open: patch.open !== undefined ? !!patch.open : cur.open,
    maxMeetings: patch.maxMeetings !== undefined ? int(patch.maxMeetings, 0, 1000, cur.maxMeetings) : cur.maxMeetings,
    duration: patch.duration !== undefined ? int(patch.duration, 10, 240, cur.duration) : cur.duration,
    step: patch.step !== undefined ? int(patch.step, 10, 240, cur.step) : cur.step,
    minNoticeHours: patch.minNoticeHours !== undefined ? int(patch.minNoticeHours, 0, 168, cur.minNoticeHours) : cur.minNoticeHours,
    horizonDays: patch.horizonDays !== undefined ? int(patch.horizonDays, 1, 90, cur.horizonDays) : cur.horizonDays,
    hours: Array.isArray(patch.hours)
      ? DEFAULT_CONSULT_SETTINGS.hours.map((d) => {
        const h: any = patch.hours!.find((x: any) => Number(x?.day) === d.day) || {};
        const from = TIME_RE.test(h.from) ? h.from : d.from;
        const to = TIME_RE.test(h.to) ? h.to : d.to;
        return { day: d.day, on: !!h.on, from, to };
      })
      : cur.hours,
    meetingLink: patch.meetingLink !== undefined ? clean(patch.meetingLink, 300).trim() : cur.meetingLink,
    bookingPageUrl: patch.bookingPageUrl !== undefined ? clean(patch.bookingPageUrl, 300).trim() || DEFAULT_CONSULT_SETTINGS.bookingPageUrl : cur.bookingPageUrl,
    warmSubject: patch.warmSubject !== undefined ? clean(patch.warmSubject, 200) : cur.warmSubject,
    warmBody: patch.warmBody !== undefined ? clean(patch.warmBody, 6000) : cur.warmBody,
    confirmText: patch.confirmText !== undefined ? clean(patch.confirmText, 1000) : cur.confirmText,
    finalText: patch.finalText !== undefined ? clean(patch.finalText, 1000) : cur.finalText,
  };
  await prisma.setting.upsert({ where: { key: SETTINGS_KEY }, create: { key: SETTINGS_KEY, value: JSON.stringify(next) }, update: { value: JSON.stringify(next) } });
  slotCache = null;
  return next;
}

// ── Israel-time helpers ─────────────────────────────────────────────────────

const partsFmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
function tzOffset(d: Date) {
  const p = Object.fromEntries(partsFmt.formatToParts(d).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(d.getTime() / 1000) * 1000;
}
// "2026-11-17" + "10:00" in Israel → the moment
export function israelTime(day: string, time: string) {
  const [y, m, d] = day.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  let t = guess - tzOffset(new Date(guess));
  t = guess - tzOffset(new Date(t));
  return new Date(t);
}
const hhmmFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
export const hhmm = (d: Date) => hhmmFmt.format(d);
const HEB_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const weekdayOf = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay();
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);
export const dateLabel = (d: Date) => { const k = dayKey(d); return `${Number(k.slice(8))}/${Number(k.slice(5, 7))}`; };
export const dayName = (d: Date) => `יום ${HEB_DAYS[weekdayOf(dayKey(d))]}`;
// "מחר", "היום" or "ביום ראשון", from the moment the message goes out
function relativeDay(start: Date, now: Date) {
  const diff = Math.round((Date.parse(dayKey(start)) - Date.parse(dayKey(now))) / DAY);
  if (diff === 0) return 'היום';
  if (diff === 1) return 'מחר';
  return `ב${dayName(start)}`;
}

// A planned send that falls on Shabbat or Yom Tov goes out before it starts.
export function beforeRest(t: Date) {
  let x = t.getTime();
  for (let i = 0; i < 4 * 24 * 4 && isQuietTime(new Date(x)); i++) x -= 15 * MIN;
  return new Date(x);
}

// ── Availability ────────────────────────────────────────────────────────────

const ACTIVE: ConsultStatus[] = ['BOOKED', 'CONFIRMED', 'NOT_CONFIRMED'];
let slotCache: { at: number; slots: Date[]; google: boolean } | null = null;

async function googleBusy(from: Date, to: Date): Promise<{ start: number; end: number }[] | null> {
  if (!process.env.GOOGLE_CLIENT_ID) return null;
  const auth = await getAuthorizedClient().catch(() => null);
  if (!auth) return null;
  try {
    const cal = google.calendar({ version: 'v3', auth });
    const r = await cal.freebusy.query({ requestBody: { timeMin: from.toISOString(), timeMax: to.toISOString(), timeZone: TZ, items: [{ id: 'primary' }] } });
    return (r.data.calendars?.primary?.busy || []).map((b) => ({ start: Date.parse(b.start!), end: Date.parse(b.end!) }));
  } catch (e: any) {
    console.error('[CONSULT] Google free/busy failed:', e?.message || e);
    return null;
  }
}

export async function freeSlots(now = new Date(), opts: { fresh?: boolean; ignoreBookingId?: string } = {}) {
  if (!opts.fresh && !opts.ignoreBookingId && slotCache && Date.now() - slotCache.at < 60_000) return slotCache;
  const s = await getConsultSettings();
  const today = dayKey(now);
  const until = new Date(now.getTime() + (s.horizonDays + 1) * DAY);
  const [busyGoogle, bookings] = await Promise.all([
    googleBusy(now, until),
    prisma.consultBooking.findMany({ where: { status: { in: ACTIVE }, start: { gte: new Date(now.getTime() - 4 * HOUR) } }, select: { id: true, start: true, duration: true, googleEventId: true } }),
  ]);
  const busy = [
    ...(busyGoogle || []),
    // Our own bookings count even when Google is unreachable.
    ...bookings.filter((b) => b.id !== opts.ignoreBookingId).map((b) => ({ start: b.start.getTime(), end: b.start.getTime() + b.duration * MIN })),
  ];
  // A booking being moved still sits in Google; free its old time.
  const own = opts.ignoreBookingId ? bookings.find((b) => b.id === opts.ignoreBookingId) : null;
  const busyFinal = own ? busy.filter((b) => !(b.start === own.start.getTime() && b.end === own.start.getTime() + own.duration * MIN)) : busy;

  const earliest = now.getTime() + s.minNoticeHours * HOUR;
  const slots: Date[] = [];
  for (let i = 0; i <= s.horizonDays; i++) {
    const day = addDays(today, i);
    const h = s.hours.find((x) => x.day === weekdayOf(day));
    if (!h?.on) continue;
    const [fh, fm] = h.from.split(':').map(Number);
    const [th, tm] = h.to.split(':').map(Number);
    for (let m = fh * 60 + fm; m + s.duration <= th * 60 + tm; m += s.step) {
      const t = israelTime(day, `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
      const end = t.getTime() + s.duration * MIN;
      if (t.getTime() < earliest) continue;
      if (isQuietTime(t) || isQuietTime(new Date(end))) continue;
      if (busyFinal.some((b) => b.start < end && b.end > t.getTime())) continue;
      slots.push(t);
    }
  }
  const result = { at: Date.now(), slots, google: busyGoogle !== null };
  if (!opts.ignoreBookingId) slotCache = result;
  return result;
}

export async function placesLeft() {
  const s = await getConsultSettings();
  const taken = await prisma.consultBooking.count({ where: { status: { not: 'CANCELED' } } });
  const left = Math.max(0, s.maxMeetings - taken);
  return { max: s.maxMeetings, taken, left, open: s.open && left > 0, duration: s.duration };
}

// ── Google Calendar event ───────────────────────────────────────────────────

async function calendarApi() {
  if (!process.env.GOOGLE_CLIENT_ID) return null;
  const auth = await getAuthorizedClient().catch(() => null);
  return auth ? google.calendar({ version: 'v3', auth }) : null;
}

const eventBody = (b: { name: string; phone: string; email: string; org: string; start: Date; duration: number }, link: string) => ({
  summary: `פגישת הקפצה – ${b.org} (${b.name})`,
  description: [`פגישת ייעוץ חינם, ${b.duration} דקות`, `שם: ${b.name}`, `עמותה: ${b.org}`, `טלפון: ${b.phone}`, `מייל: ${b.email}`, link ? `קישור: ${link}` : ''].filter(Boolean).join('\n'),
  start: { dateTime: b.start.toISOString(), timeZone: TZ },
  end: { dateTime: new Date(b.start.getTime() + b.duration * MIN).toISOString(), timeZone: TZ },
  attendees: [{ email: b.email, displayName: b.name }],
  ...(link ? { location: link } : {}),
});

async function createEvent(b: { name: string; phone: string; email: string; org: string; start: Date; duration: number }, fixedLink: string) {
  const cal = await calendarApi();
  if (!cal) return { eventId: null as string | null, meetLink: fixedLink || null };
  try {
    const r = await cal.events.insert({
      calendarId: 'primary',
      sendUpdates: 'all',
      conferenceDataVersion: fixedLink ? 0 : 1,
      requestBody: {
        ...eventBody(b, fixedLink),
        ...(fixedLink ? {} : { conferenceData: { createRequest: { requestId: `consult-${Date.now()}-${Math.random().toString(36).slice(2)}`, conferenceSolutionKey: { type: 'hangoutsMeet' } } } }),
      },
    });
    return { eventId: r.data.id || null, meetLink: fixedLink || r.data.hangoutLink || null };
  } catch (e: any) {
    console.error('[CONSULT] Google event failed:', e?.message || e);
    return { eventId: null, meetLink: fixedLink || null };
  }
}

// ── Lead card log ───────────────────────────────────────────────────────────

export async function logToCard(booking: Pick<ConsultBooking, 'leadId'>, type: string, notes: string, done = true) {
  await prisma.leadActivity.create({ data: { leadId: booking.leadId, type, notes: notes.slice(0, 4000), done } });
}

// ── Texts ───────────────────────────────────────────────────────────────────

export function fillText(text: string, b: ConsultBooking, s: ConsultSettings, now: Date) {
  const first = b.name.trim().split(/\s+/)[0];
  const values: Record<string, string> = {
    'שם': first,
    'שם_מלא': b.name,
    'שם_העמותה': b.org,
    'יום': dayName(b.start),
    'תאריך': dateLabel(b.start),
    'שעה': hhmm(b.start),
    'מתי': relativeDay(b.start, now),
    'קישור_לשינוי': manageUrl(b, s),
    'קישור_לפגישה': b.meetLink || 'יישלח אליך בנפרד',
    'משך': String(b.duration),
  };
  return text.replace(/\{([^{}]+)\}/g, (m, k) => (k in values ? values[k] : m));
}
export const manageUrl = (b: Pick<ConsultBooking, 'token'>, s: ConsultSettings) => `${s.bookingPageUrl}${s.bookingPageUrl.includes('?') ? '&' : '?'}r=${b.token}`;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
function warmEmailHtml(body: string, b: ConsultBooking, s: ConsultSettings) {
  const paras = body.split(/\n{2,}/).map((p) => `<p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#1e293b;">${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
  return `<!doctype html><html lang="he" dir="rtl"><body style="margin:0;padding:0;background:#f4f1ea;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ea;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" dir="rtl" style="max-width:600px;background:#ffffff;border-radius:16px;font-family:Arial,Helvetica,sans-serif;">
<tr><td style="background:#0A1E3C;border-radius:16px 16px 0 0;padding:20px 28px;text-align:right;color:#ffffff;font-size:15px;"><b>יהושע כהן</b> <span style="color:#5CE1E6;">· אסטרטגיה וליווי לעמותות</span></td></tr>
<tr><td style="padding:28px 28px 12px;text-align:right;">${paras}</td></tr>
<tr><td style="padding:0 28px 26px;text-align:right;font-size:13px;color:#64748b;line-height:1.6;border-top:1px solid #eef2f7;padding-top:16px;">
הפגישה שלך: ${esc(dayName(b.start))}, ${esc(dateLabel(b.start))} בשעה ${esc(hhmm(b.start))}, ${b.duration} דקות.${b.meetLink ? ` <a href="${esc(b.meetLink)}" style="color:#007f91;">הקישור לפגישה</a>.` : ''}<br>
צריך להזיז או לבטל? <a href="${esc(manageUrl(b, s))}" style="color:#007f91;">לחצו כאן</a>.</td></tr>
</table></td></tr></table></body></html>`;
}

// ── Owner notices ───────────────────────────────────────────────────────────

async function tellOwner(title: string, intro: string, rows: [string, string][], href: string) {
  const settings = await getAlertSettings();
  if (!settings.email) return;
  const base = await ownerAppUrl();
  const body = ownerEmailSection('פרטים', rows.map(([k, v]) => `<tr><td style="padding:9px 0;border-bottom:1px solid #e2e8f0;text-align:right;font-size:14px;"><span style="color:#64748b;">${esc(k)}:</span> <b>${esc(v)}</b></td></tr>`).join(''));
  await sendEmail(settings.email, title, ownerEmailFrame(title, intro, body, { href: `${base}${href}`, label: 'לרשימת הפגישות' }), [], { fromName: OWNER_SENDER_NAME });
}
const ownerRows = (b: ConsultBooking): [string, string][] => [['עמותה', b.org], ['מועד', `${dayName(b.start)} ${dateLabel(b.start)} ${hhmm(b.start)}`], ['טלפון', b.phone], ['מייל', b.email]];

// ── Booking, moving, canceling ──────────────────────────────────────────────

export class ConsultError extends Error { constructor(public code: string) { super(code); } }

export interface BookingInput { name: string; phone: string; email: string; org: string; start: Date; source?: string | null }

export async function bookConsult(input: BookingInput, now = new Date()) {
  const s = await getConsultSettings();
  const places = await placesLeft();
  if (!places.open) throw new ConsultError('full');
  const { slots } = await freeSlots(now, { fresh: true });
  if (!slots.some((t) => t.getTime() === input.start.getTime())) throw new ConsultError('slot-taken');

  // One lead per person: the same email or phone joins the existing lead.
  const digits = phoneDigits(input.phone);
  const leads = await prisma.lead.findMany({ where: { OR: [{ email: { equals: input.email, mode: 'insensitive' } }, { phone: { not: null } }] }, select: { id: true, email: true, phone: true, company: true } });
  let lead = leads.find((l) => (l.email && l.email.toLowerCase() === input.email.toLowerCase()) || (l.phone && phoneDigits(l.phone) === digits));
  if (!lead) {
    lead = await prisma.lead.create({ data: { fullName: input.name, email: input.email, phone: input.phone, company: input.org, source: input.source || 'פגישת הקפצה', stage: 'WARM' } });
  } else {
    await prisma.lead.update({ where: { id: lead.id }, data: { phone: lead.phone || input.phone, company: lead.company || input.org, stage: 'WARM' } });
  }

  const created = await prisma.$transaction(async (tx) => {
    // Re-check inside the transaction so two people can't take the last place or the same time.
    const taken = await tx.consultBooking.count({ where: { status: { not: 'CANCELED' } } });
    if (taken >= s.maxMeetings) throw new ConsultError('full');
    const clash = await tx.consultBooking.findFirst({ where: { status: { in: ACTIVE }, start: input.start } });
    if (clash) throw new ConsultError('slot-taken');
    return tx.consultBooking.create({ data: { leadId: lead!.id, name: input.name, phone: input.phone, email: input.email, org: input.org, start: input.start, duration: s.duration, source: input.source || null } });
  });
  slotCache = null;

  const ev = await createEvent({ ...created }, s.meetingLink);
  const booking = await prisma.consultBooking.update({ where: { id: created.id }, data: { googleEventId: ev.eventId, meetLink: ev.meetLink } });
  await logToCard(booking, 'פגישת הקפצה נקבעה', `${dayName(booking.start)} ${dateLabel(booking.start)} בשעה ${hhmm(booking.start)} · ${booking.duration} דקות · ${booking.org}${ev.eventId ? ' · נוסף ליומן גוגל' : ' · לא נוסף ליומן גוגל (היומן לא מחובר)'}`);
  await tellOwner(`נקבעה פגישת הקפצה: ${booking.org}`, `${booking.name} שריין/ה מקום. נשארו ${Math.max(0, places.left - 1)} מקומות.`, ownerRows(booking), '/consults').catch((e) => console.error('[CONSULT] owner email failed:', e?.message || e));
  // The warm-up email goes out at once when the meeting is less than 50 hours away.
  await runSequence(booking, now);
  return prisma.consultBooking.findUniqueOrThrow({ where: { id: booking.id } });
}

export async function rescheduleConsult(token: string, start: Date, now = new Date()) {
  const b = await prisma.consultBooking.findUnique({ where: { token } });
  if (!b || !ACTIVE.includes(b.status)) throw new ConsultError('not-found');
  const s = await getConsultSettings();
  const { slots } = await freeSlots(now, { fresh: true, ignoreBookingId: b.id });
  if (!slots.some((t) => t.getTime() === start.getTime())) throw new ConsultError('slot-taken');
  const old = b.start;
  // The sequence starts over for the new time; the warm-up email is not sent twice.
  const moved = await prisma.consultBooking.update({ where: { id: b.id }, data: { start, status: 'BOOKED', confirmSentAt: null, finalSentAt: null, noReplyAt: null, confirmedAt: null, rescheduledAt: now } });
  slotCache = null;
  const cal = await calendarApi();
  if (cal && b.googleEventId) {
    await cal.events.patch({ calendarId: 'primary', eventId: b.googleEventId, sendUpdates: 'all', requestBody: { start: { dateTime: start.toISOString(), timeZone: TZ }, end: { dateTime: new Date(start.getTime() + b.duration * MIN).toISOString(), timeZone: TZ } } })
      .catch((e: any) => console.error('[CONSULT] Google move failed:', e?.message || e));
  }
  await logToCard(moved, 'פגישת הקפצה הוזזה', `מ${dayName(old)} ${dateLabel(old)} ${hhmm(old)} ל${dayName(start)} ${dateLabel(start)} ${hhmm(start)}. רצף התזכורות חושב מחדש.`);
  await tellOwner(`פגישת הקפצה הוזזה: ${moved.org}`, `${moved.name} בחר/ה מועד חדש.`, ownerRows(moved), '/consults').catch(() => {});
  await runSequence(moved, now);
  return prisma.consultBooking.findUniqueOrThrow({ where: { id: b.id } });
}

export async function cancelConsult(where: { token?: string; id?: string }, by: 'client' | 'owner' | 'google', now = new Date()) {
  const b = where.token ? await prisma.consultBooking.findUnique({ where: { token: where.token } }) : await prisma.consultBooking.findUnique({ where: { id: where.id! } });
  if (!b || !ACTIVE.includes(b.status)) throw new ConsultError('not-found');
  // Canceled = no further reminders (the sequence only runs on active bookings) and the place returns to the counter.
  const canceled = await prisma.consultBooking.update({ where: { id: b.id }, data: { status: 'CANCELED', canceledAt: now } });
  slotCache = null;
  if (by !== 'google' && b.googleEventId) {
    const cal = await calendarApi();
    await cal?.events.delete({ calendarId: 'primary', eventId: b.googleEventId, sendUpdates: 'all' }).catch((e: any) => console.error('[CONSULT] Google delete failed:', e?.message || e));
  }
  const who = by === 'client' ? 'בוטלה על ידי הפונה' : by === 'owner' ? 'בוטלה מהמערכת' : 'האירוע נמחק מיומן גוגל';
  await logToCard(canceled, 'פגישת הקפצה בוטלה', `${who}. התזכורות שנותרו בוטלו והמקום חזר למונה.`);
  if (by !== 'owner') await tellOwner(`פגישת הקפצה בוטלה: ${b.org}`, `${who}. המקום חזר למונה.`, ownerRows(b), '/consults').catch(() => {});
  return canceled;
}

// ── The reminder sequence ───────────────────────────────────────────────────

export const plan = (b: Pick<ConsultBooking, 'start'>) => ({
  warm: beforeRest(new Date(b.start.getTime() - 50 * HOUR)),
  confirm: beforeRest(new Date(b.start.getTime() - 24 * HOUR)),
  noReply: new Date(b.start.getTime() - 4 * HOUR),
  final: beforeRest(new Date(b.start.getTime() - 2 * HOUR)),
});

async function sendMessageStep(b: ConsultBooking, field: 'confirmSentAt' | 'finalSentAt', label: string, text: string, now: Date) {
  // Claim the step first so two ticks never send it twice.
  const { count } = await prisma.consultBooking.updateMany({ where: { id: b.id, [field]: null }, data: { [field]: now } });
  if (!count) return;
  const r = await sendTextMessage(b.phone, text, now);
  if (r.ok) {
    await logToCard(b, `${label} נשלחה`, `נשלח ל-${b.phone} (${r.provider}):\n${text}`);
  } else {
    // No provider yet: the owner gets the message ready to send in WhatsApp (bell + alerts page).
    await logToCard(b, `${label} לא נשלחה`, `${r.error}. ההודעה מחכה לשליחה ידנית:\n${text}`, false);
  }
}

export async function runSequence(b: ConsultBooking, now = new Date()) {
  if (!ACTIVE.includes(b.status) || b.start.getTime() <= now.getTime()) return;
  const s = await getConsultSettings();
  const p = plan(b);
  const quiet = isQuietTime(now);
  const left = b.start.getTime() - now.getTime();

  // ① 50 hours before: the warm-up email (at once if booked later than that).
  if (!b.warmSentAt && now >= p.warm && !quiet) {
    const { count } = await prisma.consultBooking.updateMany({ where: { id: b.id, warmSentAt: null }, data: { warmSentAt: now } });
    if (count) {
      const subject = fillText(s.warmSubject, b, s, now);
      const body = fillText(s.warmBody, b, s, now);
      try {
        await sendEmail(b.email, subject, warmEmailHtml(body, b, s), [], { fromName: 'יהושע כהן', idempotencyKey: `consult-warm-${b.id}` });
        await logToCard(b, 'מייל חימום נשלח', `אל ${b.email}\nנושא: ${subject}\n\n${body}`);
      } catch (e: any) {
        await prisma.consultBooking.update({ where: { id: b.id }, data: { warmSentAt: null } });
        console.error('[CONSULT] warm email failed:', e?.message || e);
      }
    }
  }

  // ② 24 hours before: a message asking to confirm. Not sent if the meeting is already under 4 hours away.
  if (!b.confirmSentAt && b.status !== 'CONFIRMED' && now >= p.confirm && left > 4 * HOUR && !quiet) {
    await sendMessageStep(b, 'confirmSentAt', 'בקשת אישור הגעה', fillText(s.confirmText, b, s, now), now);
  }

  // No reply by 4 hours before → "לא אישר" and the owner hears about it.
  const fresh = await prisma.consultBooking.findUniqueOrThrow({ where: { id: b.id } });
  if (fresh.status === 'BOOKED' && fresh.confirmSentAt && !fresh.noReplyAt && now >= p.noReply) {
    const { count } = await prisma.consultBooking.updateMany({ where: { id: b.id, status: 'BOOKED', noReplyAt: null }, data: { status: 'NOT_CONFIRMED', noReplyAt: now } });
    if (count) {
      await logToCard(fresh, 'לא אישר הגעה', 'לא התקבלה תשובה עד 4 שעות לפני הפגישה. הסטטוס עודכן ל"לא אישר".');
      await tellOwner(`לא אישר הגעה: ${fresh.org}`, `${fresh.name} לא השיב/ה לבקשת האישור. כדאי להתקשר.`, ownerRows(fresh), '/consults').catch(() => {});
    }
  }

  // ③ 2 hours before: the last reminder, message only.
  if (!fresh.finalSentAt && now >= p.final && !quiet) {
    await sendMessageStep(fresh, 'finalSentAt', 'תזכורת שעתיים לפני', fillText(s.finalText, fresh, s, now), now);
  }
}

// A reply to the confirmation message ("1" = coming).
export async function handleReply(from: string, text: string, now = new Date()) {
  const digits = phoneDigits(from);
  if (!digits) return { matched: false };
  const candidates = await prisma.consultBooking.findMany({ where: { status: { in: ['BOOKED', 'NOT_CONFIRMED', 'CONFIRMED'] }, start: { gt: now } }, orderBy: { start: 'asc' } });
  const b = candidates.find((c) => phoneDigits(c.phone) === digits);
  if (!b) return { matched: false };
  const answer = text.trim();
  if (/^1[.!]?$/.test(answer) && b.status !== 'CONFIRMED') {
    await prisma.consultBooking.update({ where: { id: b.id }, data: { status: 'CONFIRMED', confirmedAt: now } });
    await logToCard(b, 'אישר הגעה', `השיב/ה "${answer}".`);
    return { matched: true, confirmed: true };
  }
  await logToCard(b, 'תשובה להודעה', answer, false);
  return { matched: true, confirmed: false };
}

// Meetings deleted or moved by hand in Google Calendar follow here too.
let lastGoogleSync = 0;
async function syncFromGoogle(now: Date) {
  if (Date.now() - lastGoogleSync < 5 * MIN) return;
  lastGoogleSync = Date.now();
  const cal = await calendarApi();
  if (!cal) return;
  const upcoming = await prisma.consultBooking.findMany({ where: { status: { in: ACTIVE }, start: { gt: now }, googleEventId: { not: null } } });
  for (const b of upcoming) {
    try {
      const ev = await cal.events.get({ calendarId: 'primary', eventId: b.googleEventId! });
      if (ev.data.status === 'cancelled') { await cancelConsult({ id: b.id }, 'google', now); continue; }
      const start = ev.data.start?.dateTime ? new Date(ev.data.start.dateTime) : null;
      if (start && start.getTime() !== b.start.getTime()) {
        const moved = await prisma.consultBooking.update({ where: { id: b.id }, data: { start, status: 'BOOKED', confirmSentAt: null, finalSentAt: null, noReplyAt: null, confirmedAt: null, rescheduledAt: now } });
        await logToCard(moved, 'פגישת הקפצה הוזזה ביומן גוגל', `למועד ${dayName(start)} ${dateLabel(start)} ${hhmm(start)}. רצף התזכורות חושב מחדש.`);
      }
    } catch (e: any) {
      if (e?.code === 404 || e?.response?.status === 404 || e?.response?.status === 410) await cancelConsult({ id: b.id }, 'google', now).catch(() => {});
    }
  }
}

let ticking = false;
export async function consultTick(now = new Date()) {
  if (ticking) return;
  ticking = true;
  try {
    await syncFromGoogle(now).catch((e) => console.error('[CONSULT] Google sync failed:', e?.message || e));
    const due = await prisma.consultBooking.findMany({ where: { status: { in: ACTIVE }, start: { gt: now, lte: new Date(now.getTime() + 51 * HOUR) } } });
    for (const b of due) await runSequence(b, now).catch((e) => console.error('[CONSULT] sequence failed:', b.id, e?.message || e));
    // Past meetings that were held stop counting as upcoming.
    await prisma.consultBooking.updateMany({ where: { status: { in: ['BOOKED', 'CONFIRMED'] }, start: { lt: new Date(now.getTime() - 2 * HOUR) } }, data: { status: 'DONE' } });
  } finally {
    ticking = false;
  }
}

// For the owner's alerts: messages waiting to be sent by hand, and people who didn't confirm.
export async function consultAlerts(now = new Date()) {
  const out: { key: string; severity: 'critical' | 'warning'; title: string; detail: string; whatsapp?: string }[] = [];
  const upcoming = await prisma.consultBooking.findMany({ where: { status: { in: ACTIVE }, start: { gt: now } }, include: { lead: { include: { activities: { where: { done: false, type: { endsWith: 'לא נשלחה' } }, orderBy: { createdAt: 'desc' } } } } } });
  for (const b of upcoming) {
    if (b.status === 'NOT_CONFIRMED') out.push({ key: `consult-noreply:${b.id}:${b.start.getTime()}`, severity: 'critical', title: `לא אישר הגעה · ${b.org}`, detail: `${b.name}, ${dayName(b.start)} ${hhmm(b.start)} · ${b.phone}`, whatsapp: whatsappLink(b.phone, `שלום ${b.name.split(/\s+/)[0]}, רק מוודא שאנחנו נפגשים ${relativeDay(b.start, now)} ב-${hhmm(b.start)}. מגיעים?`) });
    for (const a of b.lead.activities) {
      const msg = a.notes.split('\n').slice(1).join('\n');
      out.push({ key: `consult-manual:${a.id}`, severity: 'warning', title: `${a.type.replace(' לא נשלחה', '')} · ${b.org}`, detail: `אין עדיין ספק הודעות. ההודעה מוכנה לשליחה בוואטסאפ.`, whatsapp: whatsappLink(b.phone, msg) });
    }
  }
  return out;
}

export const messagingStatus = () => ({ connected: messagingConnected() });
