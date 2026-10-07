import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, requireCoach } from '../middleware/auth';

const router = Router();

router.get('/', requireAuth, async (_req, res) => {
  try {
    const services = await prisma.service.findMany({ orderBy: { name: 'asc' } });
    res.json(services);
  } catch { res.status(500).json({ error: 'Server error' }); }
});

router.post('/', requireAuth, requireCoach, async (req, res) => {
  try {
    const { name, description, price, unit } = req.body;
    const service = await prisma.service.create({
      data: { name, description, price: parseFloat(price), unit: unit || 'חד-פעמי' },
    });
    res.status(201).json(service);
  } catch { res.status(500).json({ error: 'Server error' }); }
});

router.put('/:id', requireAuth, requireCoach, async (req, res) => {
  try {
    const { name, description, price, unit, isActive } = req.body;
    const service = await prisma.service.update({
      where: { id: req.params.id },
      data: { name, description, price: price !== undefined ? parseFloat(price) : undefined, unit, isActive },
    });
    res.json(service);
  } catch { res.status(500).json({ error: 'Server error' }); }
});

router.delete('/:id', requireAuth, requireCoach, async (req, res) => {
  try {
    await prisma.service.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'Server error' }); }
});

export default router;
