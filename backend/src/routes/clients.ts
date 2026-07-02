import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth, requireCoach, AuthRequest } from '../middleware/auth';
import { sendClientWelcomeEmail } from '../services/email';

const router = Router();
const prisma = new PrismaClient();

router.get('/', requireAuth, requireCoach, async (req: AuthRequest, res) => {
  try {
    const { status } = req.query;
    const clients = await prisma.client.findMany({
      where: status ? { status: status as any } : undefined,
      include: {
        _count: { select: { meetings: true, tasks: true } },
        payments: { select: { totalAmount: true, paidAmount: true } },
      },
      orderBy: { fullName: 'asc' },
    });
    res.json(clients);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    if (req.user?.role === 'CLIENT' && req.user.clientId !== id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const client = await prisma.client.findUnique({
      where: { id },
      include: {
        meetings: {
          include: { summary: { include: { tags: true } }, tasks: true },
          orderBy: { date: 'desc' },
        },
        tasks: { orderBy: { createdAt: 'desc' } },
        payments: { include: { history: { orderBy: { date: 'desc' } } } },
        documents: { orderBy: { createdAt: 'desc' } },
        user: { select: { email: true } },
      },
    });

    if (!client) return res.status(404).json({ error: 'Client not found' });
    res.json(client);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', requireAuth, requireCoach, async (req: AuthRequest, res) => {
  try {
    const { fullName, phone, email, businessName, businessField, startDate, status, notes } = req.body;

    const client = await prisma.client.create({
      data: { fullName, phone, email, businessName, businessField, startDate: startDate ? new Date(startDate) : undefined, status, notes },
    });

    try { await sendClientWelcomeEmail(email, fullName); } catch (e) { console.error('Email failed:', e); }

    res.status(201).json(client);
  } catch (err: any) {
    if (err.code === 'P2002') return res.status(400).json({ error: 'Email already exists' });
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id', requireAuth, requireCoach, async (req: AuthRequest, res) => {
  try {
    const client = await prisma.client.update({
      where: { id: req.params.id },
      data: {
        ...req.body,
        startDate: req.body.startDate ? new Date(req.body.startDate) : undefined,
      },
    });
    res.json(client);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', requireAuth, requireCoach, async (req: AuthRequest, res) => {
  try {
    await prisma.client.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
