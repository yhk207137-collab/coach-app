import { asyncRouter } from '../lib/asyncRouter';
import { requireAuth, requireCoach } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { cancelConsult, ConsultError, DEFAULT_CONSULT_SETTINGS, getConsultSettings, logToCard, placesLeft, plan, saveConsultSettings, setClosedDay } from '../services/consult';
import { isCalendarConnected } from '../services/calendar';

const router = asyncRouter();
router.use(requireAuth, requireCoach);

router.get('/', async (_req, res) => {
  const [bookings, places, google] = await Promise.all([
    prisma.consultBooking.findMany({ orderBy: { start: 'desc' }, include: { lead: { include: { activities: { orderBy: { createdAt: 'asc' } } } } } }),
    placesLeft(),
    isCalendarConnected().catch(() => false),
  ]);
  res.json({
    places,
    google,
    bookings: bookings.map(({ lead, ...b }) => ({
      ...b,
      plan: plan(b),
      // This booking's own log: from a moment before it was made
      log: lead.activities.filter((a) => a.createdAt.getTime() >= b.createdAt.getTime() - 1000),
    })),
  });
});

// Who opened the consult pages: one row per browser, newest first, with the name when it is known
// (signed up for the guide, or booked from that browser).
const CONSULT_PAGE_RE = /\/(thank-you|pgisha|book)(\.html)?$/;
const consultPageLabel = (p: string) => (p.includes('pgisha') ? 'דף הפגישה' : p.includes('thank-you') ? 'דף התודה' : 'בחירת מועד');
router.get('/visits', async (req, res) => {
  const days = [7, 30, 90].includes(Number(req.query.days)) ? Number(req.query.days) : 30;
  const from = new Date(Date.now() - days * 24 * 3600_000);
  const visits = await prisma.pageVisit.findMany({
    where: {
      createdAt: { gte: from },
      OR: ['/thank-you', '/pgisha', '/book'].map((p) => ({ page: { contains: p } })),
      ...(process.env.NODE_ENV === 'production' ? { NOT: { page: { startsWith: 'localhost' } } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 5000,
    include: { contact: { select: { id: true, name: true, email: true } } },
  });
  const ids = [...new Set(visits.map((v) => v.visitorId))];
  const bookings = ids.length ? await prisma.consultBooking.findMany({ where: { visitorId: { in: ids } }, orderBy: { createdAt: 'desc' }, select: { id: true, visitorId: true, name: true, org: true, status: true, start: true, leadId: true } }) : [];
  const people = new Map<string, any>();
  for (const v of visits) {
    if (!CONSULT_PAGE_RE.test(v.page)) continue;
    let p = people.get(v.visitorId);
    if (!p) {
      const b = bookings.find((x) => x.visitorId === v.visitorId) || null;
      p = { visitorId: v.visitorId, last: v.createdAt, first: v.createdAt, views: 0, pages: new Set<string>(), contact: v.contact, booking: b, source: v.source || v.referrer || '' };
      people.set(v.visitorId, p);
    }
    p.views++; p.first = v.createdAt; p.pages.add(consultPageLabel(v.page));
    if (!p.contact && v.contact) p.contact = v.contact;
    if (v.source || v.referrer) p.source = v.source || v.referrer;
  }
  const rows = [...people.values()].map((p) => ({ ...p, pages: [...p.pages] }));
  const byPage: Record<string, number> = {};
  for (const r of rows) for (const pg of r.pages) byPage[pg] = (byPage[pg] || 0) + 1;
  res.json({
    days,
    visitors: rows.length,
    booked: rows.filter((r) => r.booking).length,
    byPage,
    rows: rows.slice(0, 200),
  });
});

router.get('/settings', async (_req, res) => {
  res.json({ settings: await getConsultSettings(), defaults: DEFAULT_CONSULT_SETTINGS });
});

router.put('/settings', async (req, res) => {
  res.json({ settings: await saveConsultSettings(req.body || {}) });
});

// Close a day (mark it full) or open it again: { day: "2026-11-18", closed: true }
router.put('/closed-days', async (req, res) => {
  try {
    res.json({ closedDays: await setClosedDay(String(req.body?.day || ''), !!req.body?.closed) });
  } catch (e) {
    if (e instanceof ConsultError) return res.status(400).json({ error: 'תאריך לא תקין' });
    throw e;
  }
});

router.post('/:id/cancel', async (req, res) => {
  try {
    res.json(await cancelConsult({ id: req.params.id }, 'owner'));
  } catch (e) {
    if (e instanceof ConsultError) return res.status(400).json({ error: 'הפגישה כבר לא פעילה' });
    throw e;
  }
});

const STATUS_LABEL: Record<string, string> = { BOOKED: 'נקבעה', CONFIRMED: 'אישר הגעה', NOT_CONFIRMED: 'לא אישר', DONE: 'התקיימה' };

// The owner sets a status by hand (confirmed on the phone, or held).
router.post('/:id/status', async (req, res) => {
  const status = String(req.body?.status || '');
  if (!STATUS_LABEL[status]) return res.status(400).json({ error: 'סטטוס לא מוכר' });
  const b = await prisma.consultBooking.update({ where: { id: req.params.id }, data: { status: status as any, ...(status === 'CONFIRMED' ? { confirmedAt: new Date() } : {}) } });
  await logToCard(b, 'סטטוס עודכן ידנית', `הסטטוס שונה ל"${STATUS_LABEL[status]}".`);
  res.json(b);
});

export default router;
