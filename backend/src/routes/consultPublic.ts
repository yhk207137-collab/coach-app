// Public: the free consult meeting ("פגישת הקפצה") from the landing site. Counter, free times,
// booking, moving, canceling, confirming (button in the email) and the waiting list.
import { prisma } from '../lib/prisma';
import { asyncRouter } from '../lib/asyncRouter';
import { normalizeEmail } from './marketing';
import { bookConsult, cancelConsult, ConsultError, dateLabel, dayName, freeSlots, confirmByToken, hhmm, phoneDigits, placesLeft, rescheduleConsult } from '../services/consult';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;
const str = (v: unknown, max: number) => {
  const s = String(v ?? '').replace(/[​-‏‪-‮⁦-⁩﻿]/g, '').trim();
  return s ? s.slice(0, max) : null;
};
const ACTIVE = ['BOOKED', 'CONFIRMED', 'NOT_CONFIRMED'];

const view = (b: { token: string; name: string; org: string; start: Date; duration: number; status: string; meetLink: string | null }) => ({
  token: b.token, name: b.name, org: b.org, start: b.start, duration: b.duration, status: b.status, meetLink: b.meetLink,
  label: `${dayName(b.start)}, ${dateLabel(b.start)} בשעה ${hhmm(b.start)}`,
});
const MESSAGES: Record<string, string> = {
  full: 'כל המקומות נתפסו',
  'slot-taken': 'המועד הזה נתפס הרגע. כדאי לבחור מועד אחר',
  'not-found': 'הפגישה לא נמצאה או שכבר בוטלה',
};
const fail = (res: any, e: unknown) => {
  if (e instanceof ConsultError) return res.status(409).json({ ok: false, error: e.code, message: MESSAGES[e.code] || e.code });
  throw e;
};

export const consultPublicRouter = asyncRouter();

consultPublicRouter.get('/status', async (_req, res) => {
  const p = await placesLeft();
  res.json({ ok: true, open: p.open, left: p.left, max: p.max, duration: p.duration });
});

consultPublicRouter.get('/slots', async (_req, res) => {
  const p = await placesLeft();
  const r = p.open ? await freeSlots(new Date()) : { slots: [] as Date[] };
  res.json({ ok: true, open: p.open, left: p.left, max: p.max, duration: p.duration, slots: r.slots.map((t) => t.toISOString()) });
});

consultPublicRouter.post('/book', async (req, res) => {
  const b = req.body || {};
  if (b.website) return res.json({ ok: true }); // honeypot
  const name = str(b.name, 80);
  const phone = str(b.phone, 30) || '';
  const email = normalizeEmail(b.email);
  const org = str(b.org, 120);
  const role = str(b.role, 80);
  const about = str(b.about, 1000) || null;
  const start = new Date(String(b.start || ''));
  if (!name || !org || !role || !EMAIL_RE.test(email) || phoneDigits(phone).length < 9 || Number.isNaN(start.getTime())) {
    return res.status(400).json({ ok: false, error: 'invalid', message: 'חסרים פרטים' });
  }
  try {
    const booking = await bookConsult({ name, phone, email, org, role, about, start, source: str(b.source, 60), visitorId: /^[A-Za-z0-9_-]{8,40}$/.test(String(b.vid || '')) ? String(b.vid) : null });
    res.json({ ok: true, booking: view(booking) });
  } catch (e) { fail(res, e); }
});

consultPublicRouter.get('/manage/:token', async (req, res) => {
  const b = await prisma.consultBooking.findUnique({ where: { token: req.params.token } });
  if (!b) return res.status(404).json({ ok: false, error: 'not-found', message: MESSAGES['not-found'] });
  const slots = ACTIVE.includes(b.status) && b.start > new Date() ? (await freeSlots(new Date(), { ignoreBookingId: b.id })).slots.map((t) => t.toISOString()) : [];
  res.json({ ok: true, booking: view(b), slots });
});

consultPublicRouter.post('/reschedule', async (req, res) => {
  const start = new Date(String(req.body?.start || ''));
  if (Number.isNaN(start.getTime())) return res.status(400).json({ ok: false, error: 'invalid' });
  try {
    res.json({ ok: true, booking: view(await rescheduleConsult(String(req.body?.token || ''), start)) });
  } catch (e) { fail(res, e); }
});

consultPublicRouter.post('/cancel', async (req, res) => {
  try {
    res.json({ ok: true, booking: view(await cancelConsult({ token: String(req.body?.token || '') }, 'client')) });
  } catch (e) { fail(res, e); }
});

// When every place is taken: a waiting list, kept as leads.
consultPublicRouter.post('/waitlist', async (req, res) => {
  const b = req.body || {};
  if (b.website) return res.json({ ok: true });
  const name = str(b.name, 80);
  const phone = str(b.phone, 30);
  const email = b.email ? normalizeEmail(b.email) : '';
  const org = str(b.org, 120);
  if (!name || (!EMAIL_RE.test(email) && phoneDigits(phone).length < 9)) return res.status(400).json({ ok: false, error: 'invalid', message: 'חסרים פרטים' });
  const lead = await prisma.lead.create({ data: { fullName: name, email: email || null, phone, company: org, source: 'רשימת המתנה לפגישת הקפצה', stage: 'WARM' } });
  await prisma.leadActivity.create({ data: { leadId: lead.id, type: 'רשימת המתנה', notes: 'נרשם/ה לרשימת ההמתנה לפגישת הקפצה אחרי שכל המקומות נתפסו.', done: false } });
  res.json({ ok: true });
});

// The "מגיע/ה" button in the confirmation email.
consultPublicRouter.post('/confirm', async (req, res) => {
  try {
    res.json({ ok: true, booking: view(await confirmByToken(String(req.body?.token || ''))) });
  } catch (e) { fail(res, e); }
});
