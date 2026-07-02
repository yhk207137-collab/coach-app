import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth, requireCoach, AuthRequest } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

router.get('/:clientId', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { clientId } = req.params;
    if (req.user?.role === 'CLIENT' && req.user.clientId !== clientId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const payment = await prisma.payment.findUnique({
      where: { clientId },
      include: { history: { orderBy: { date: 'desc' } } },
    });
    res.json(payment);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:clientId', requireAuth, requireCoach, async (req: AuthRequest, res) => {
  try {
    const { totalAmount, nextPaymentDate } = req.body;
    const payment = await prisma.payment.upsert({
      where: { clientId: req.params.clientId },
      update: { totalAmount, nextPaymentDate: nextPaymentDate ? new Date(nextPaymentDate) : undefined },
      create: {
        clientId: req.params.clientId,
        totalAmount,
        nextPaymentDate: nextPaymentDate ? new Date(nextPaymentDate) : undefined,
      },
      include: { history: true },
    });
    res.json(payment);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:clientId/record', requireAuth, requireCoach, async (req: AuthRequest, res) => {
  try {
    const { amount, note, date } = req.body;
    const payment = await prisma.payment.findUnique({ where: { clientId: req.params.clientId } });
    if (!payment) return res.status(404).json({ error: 'Payment plan not found' });

    const record = await prisma.paymentRecord.create({
      data: { paymentId: payment.id, amount, note, date: date ? new Date(date) : new Date() },
    });

    await prisma.payment.update({
      where: { id: payment.id },
      data: { paidAmount: { increment: amount } },
    });

    res.status(201).json(record);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
