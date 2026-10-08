import { Router } from 'express';
import { requireAuth, requireCoach } from '../middleware/auth';
import { backupToSheets } from '../services/sheets';
import { buildFullBackup, backupFileName, emailBackup } from '../services/backup';
import { lastSentEmail, getResendDeliveryStatus } from '../lib/email';

const router = Router();

router.post('/sheets', requireAuth, requireCoach, async (_req, res) => {
  try {
    const url = await backupToSheets();
    res.json({ ok: true, url });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Backup failed' });
  }
});

router.post('/email', requireAuth, requireCoach, async (_req, res) => {
  try {
    res.json({ ok: true, ...(await emailBackup()) });
  } catch (err: any) {
    console.error('[BACKUP] Manual email backup failed:', err?.message || err);
    res.status(500).json({ error: 'שליחת הגיבוי למייל נכשלה. נסה שוב בעוד דקה.' });
  }
});

router.get('/email-status', requireAuth, requireCoach, async (_req, res) => {
  if (!lastSentEmail?.id) return res.json({ lastSentEmail });
  try {
    res.json({ lastSentEmail, delivery: await getResendDeliveryStatus(lastSentEmail.id) });
  } catch (err: any) {
    res.json({ lastSentEmail, deliveryError: err?.message || String(err) });
  }
});

router.get('/export', requireAuth, requireCoach, async (_req, res) => {
  try {
    const backup = await buildFullBackup();
    res.setHeader('Content-Disposition', `attachment; filename="${backupFileName()}"`);
    res.json(backup);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Export failed' });
  }
});

export default router;
