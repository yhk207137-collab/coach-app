import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth, requireCoach } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

router.get('/', requireAuth, requireCoach, async (_req, res) => {
  try {
    const quotes = await prisma.quote.findMany({
      include: { client: true, items: { orderBy: { order: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(quotes);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id', requireAuth, requireCoach, async (req, res) => {
  try {
    const quote = await prisma.quote.findUnique({
      where: { id: req.params.id },
      include: { client: true, items: { orderBy: { order: 'asc' } } },
    });
    if (!quote) return res.status(404).json({ error: 'לא נמצא' });
    res.json(quote);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', requireAuth, requireCoach, async (req, res) => {
  try {
    const { clientId, title, notes, validUntil, items } = req.body;
    const quote = await prisma.quote.create({
      data: {
        clientId,
        title,
        notes,
        validUntil: validUntil ? new Date(validUntil) : null,
        items: {
          create: (items || []).map((item: { description: string; duration?: string; price: number; quantity?: number }, i: number) => ({
            description: item.description,
            duration: item.duration,
            price: item.price,
            quantity: item.quantity ?? 1,
            order: i,
          })),
        },
      },
      include: { client: true, items: { orderBy: { order: 'asc' } } },
    });
    res.json(quote);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id', requireAuth, requireCoach, async (req, res) => {
  try {
    const { title, notes, validUntil, status, items } = req.body;
    await prisma.quoteItem.deleteMany({ where: { quoteId: req.params.id } });
    const quote = await prisma.quote.update({
      where: { id: req.params.id },
      data: {
        title,
        notes,
        status,
        validUntil: validUntil ? new Date(validUntil) : null,
        items: {
          create: (items || []).map((item: { description: string; duration?: string; price: number; quantity?: number }, i: number) => ({
            description: item.description,
            duration: item.duration,
            price: item.price,
            quantity: item.quantity ?? 1,
            order: i,
          })),
        },
      },
      include: { client: true, items: { orderBy: { order: 'asc' } } },
    });
    res.json(quote);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', requireAuth, requireCoach, async (req, res) => {
  try {
    await prisma.quote.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
