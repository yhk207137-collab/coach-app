import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, requireCoach } from '../middleware/auth';

const router = Router();

router.get('/', requireAuth, requireCoach, async (_req, res) => {
  try {
    const leads = await prisma.lead.findMany({
      include: { activities: { orderBy: { createdAt: 'desc' }, take: 5 } },
      orderBy: { updatedAt: 'desc' },
    });
    res.json(leads);
  } catch { res.status(500).json({ error: 'Server error' }); }
});

router.post('/', requireAuth, requireCoach, async (req, res) => {
  try {
    const { fullName, email, phone, company, source, stage, notes, estimatedValue } = req.body;
    const lead = await prisma.lead.create({
      data: { fullName, email, phone, company, source, stage, notes, estimatedValue: estimatedValue ? parseFloat(estimatedValue) : undefined },
      include: { activities: true },
    });
    res.status(201).json(lead);
  } catch { res.status(500).json({ error: 'Server error' }); }
});

router.put('/:id', requireAuth, requireCoach, async (req, res) => {
  try {
    const { fullName, email, phone, company, source, stage, notes, estimatedValue } = req.body;
    const lead = await prisma.lead.update({
      where: { id: req.params.id },
      data: { fullName, email, phone, company, source, stage, notes, estimatedValue: estimatedValue !== undefined ? parseFloat(estimatedValue) : undefined },
      include: { activities: true },
    });
    res.json(lead);
  } catch { res.status(500).json({ error: 'Server error' }); }
});

router.delete('/:id', requireAuth, requireCoach, async (req, res) => {
  try {
    await prisma.lead.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'Server error' }); }
});

router.get('/:id/activities', requireAuth, requireCoach, async (req, res) => {
  try {
    const activities = await prisma.leadActivity.findMany({
      where: { leadId: req.params.id },
      orderBy: { createdAt: 'desc' },
    });
    res.json(activities);
  } catch { res.status(500).json({ error: 'Server error' }); }
});

router.post('/:id/activities', requireAuth, requireCoach, async (req, res) => {
  try {
    const { type, notes, dueDate } = req.body;
    const activity = await prisma.leadActivity.create({
      data: { leadId: req.params.id, type, notes, dueDate: dueDate ? new Date(dueDate) : undefined },
    });
    await prisma.lead.update({ where: { id: req.params.id }, data: { updatedAt: new Date() } });
    res.status(201).json(activity);
  } catch { res.status(500).json({ error: 'Server error' }); }
});

router.patch('/activities/:actId/done', requireAuth, requireCoach, async (req, res) => {
  try {
    const activity = await prisma.leadActivity.update({
      where: { id: req.params.actId },
      data: { done: true },
    });
    res.json(activity);
  } catch { res.status(500).json({ error: 'Server error' }); }
});

export default router;
