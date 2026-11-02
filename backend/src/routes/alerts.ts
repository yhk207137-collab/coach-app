import { asyncRouter } from '../lib/asyncRouter';
import { requireAuth, requireCoach } from '../middleware/auth';
import { collectAlerts, getAlertSettings, rememberOwnerOrigin, saveAlertSettings, sendBrief, snoozeAlert } from '../services/alerts';

const router = asyncRouter();
router.use(requireAuth, requireCoach);

router.get('/', async (req, res) => {
  void rememberOwnerOrigin(`${req.protocol}://${req.get('host')}`).catch(() => {});
  const alerts = await collectAlerts();
  res.json({
    alerts,
    // The red badge counts what needs doing; "coming up" items wait quietly in the list.
    urgent: alerts.filter((a) => a.severity === 'critical' || (a.severity === 'warning' && !a.soon)).length,
  });
});

router.post('/snooze', async (req, res) => {
  const key = String(req.body?.key || '').slice(0, 120);
  if (!key) return res.status(400).json({ error: 'חסר מזהה' });
  res.json({ until: await snoozeAlert(key, Number(req.body?.days) || 1) });
});

router.get('/settings', async (_req, res) => {
  res.json(await getAlertSettings());
});

router.put('/settings', async (req, res) => {
  res.json(await saveAlertSettings(req.body || {}));
});

// "Send me the morning email now", from the alerts page.
router.post('/send-brief', async (_req, res) => {
  res.json(await sendBrief());
});

export default router;
