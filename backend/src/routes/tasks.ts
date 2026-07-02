import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth, requireCoach, AuthRequest } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

router.get('/', requireAuth, requireCoach, async (req: AuthRequest, res) => {
  try {
    const { clientId, status } = req.query;
    const tasks = await prisma.task.findMany({
      where: {
        ...(clientId ? { clientId: clientId as string } : {}),
        ...(status ? { status: status as any } : {}),
      },
      include: { client: { select: { fullName: true } } },
      orderBy: [{ status: 'asc' }, { dueDate: 'asc' }],
    });
    res.json(tasks);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', requireAuth, requireCoach, async (req: AuthRequest, res) => {
  try {
    const { clientId, meetingId, title, description, dueDate, status } = req.body;
    const task = await prisma.task.create({
      data: { clientId, meetingId, title, description, dueDate: dueDate ? new Date(dueDate) : undefined, status },
    });
    res.status(201).json(task);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const task = await prisma.task.findUnique({ where: { id: req.params.id } });
    if (!task) return res.status(404).json({ error: 'Not found' });

    if (req.user?.role === 'CLIENT') {
      if (req.user.clientId !== task.clientId) return res.status(403).json({ error: 'Forbidden' });
      const updated = await prisma.task.update({
        where: { id: req.params.id },
        data: { status: req.body.status },
      });
      return res.json(updated);
    }

    const { title, description, dueDate, status } = req.body;
    const updated = await prisma.task.update({
      where: { id: req.params.id },
      data: { title, description, dueDate: dueDate ? new Date(dueDate) : undefined, status },
    });
    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', requireAuth, requireCoach, async (req: AuthRequest, res) => {
  try {
    await prisma.task.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
