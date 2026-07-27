import { Router } from 'express';
import { requireAuth, requireCoach } from '../middleware/auth';
import { backupToSheets } from '../services/sheets';

const router = Router();

router.post('/sheets', requireAuth, requireCoach, async (_req, res) => {
  try {
    const url = await backupToSheets();
    res.json({ ok: true, url });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Backup failed' });
  }
});

export default router;
