import { asyncRouter } from '../lib/asyncRouter';
import { requireAuth, requireCoach } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { cancelConsult, ConsultError, DEFAULT_CONSULT_SETTINGS, getConsultSettings, logToCard, placesLeft, plan, saveConsultSettings } from '../services/consult';
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

router.get('/settings', async (_req, res) => {
  res.json({ settings: await getConsultSettings(), defaults: DEFAULT_CONSULT_SETTINGS });
});

router.put('/settings', async (req, res) => {
  res.json({ settings: await saveConsultSettings(req.body || {}) });
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
