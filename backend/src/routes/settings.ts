import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth, requireCoach } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// Public: get a single setting by key (e.g. logo for client-facing pages)
router.get('/public/:key', async (req, res) => {
  try {
    const setting = await prisma.setting.findUnique({ where: { key: req.params.key } });
    res.json({ value: setting?.value ?? null });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:key', requireAuth, requireCoach, async (req, res) => {
  try {
    const setting = await prisma.setting.findUnique({ where: { key: req.params.key } });
    res.json({ value: setting?.value ?? null });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:key', requireAuth, requireCoach, async (req, res) => {
  try {
    const { value } = req.body;
    if (value === null || value === undefined) {
      await prisma.setting.deleteMany({ where: { key: req.params.key } });
      return res.json({ ok: true });
    }
    const setting = await prisma.setting.upsert({
      where: { key: req.params.key },
      update: { value },
      create: { key: req.params.key, value },
    });
    res.json(setting);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
