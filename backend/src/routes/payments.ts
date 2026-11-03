import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, requireCoach, AuthRequest } from '../middleware/auth';

const router = Router();

// What must be said about money that came in: how it came, and whether a receipt was issued.
function receivedDetails(body: any): { paymentMethod: string; receiptIssued: boolean } | string {
  const paymentMethod = String(body.paymentMethod || '').trim();
  if (!paymentMethod) return 'חובה לבחור באיזו דרך התקבל הכסף';
  if (typeof body.receiptIssued !== 'boolean') return 'חובה לסמן אם הופקה קבלה';
  return { paymentMethod, receiptIssued: body.receiptIssued };
}

// Accounting summary — monthly income
router.get('/accounting/summary', requireAuth, requireCoach, async (_req, res) => {
  try {
    const records = await prisma.paymentRecord.findMany({
      where: { isPaid: true },
      select: { amount: true, date: true },
      orderBy: { date: 'asc' },
    });

    const byMonth: Record<string, number> = {};
    for (const r of records) {
      const key = `${r.date.getFullYear()}-${String(r.date.getMonth() + 1).padStart(2, '0')}`;
      byMonth[key] = (byMonth[key] ?? 0) + r.amount;
    }

    // Expected next month: sum of scheduled (not paid) records in the future
    const now = new Date();
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const nextMonthEnd = new Date(now.getFullYear(), now.getMonth() + 2, 1);

    const scheduledNext = await prisma.paymentRecord.aggregate({
      where: {
        isPaid: false,
        scheduledDate: { gte: nextMonthStart, lt: nextMonthEnd },
      },
      _sum: { amount: true },
    });

    const scheduledThisMonth = await prisma.paymentRecord.aggregate({
      where: {
        isPaid: false,
        scheduledDate: { gte: new Date(now.getFullYear(), now.getMonth(), 1), lt: nextMonthStart },
      },
      _sum: { amount: true },
    });

    res.json({
      monthly: byMonth,
      expectedThisMonth: scheduledThisMonth._sum.amount ?? 0,
      expectedNextMonth: scheduledNext._sum.amount ?? 0,
    });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// All the money that came in, newest first
router.get('/accounting/received', requireAuth, requireCoach, async (_req, res) => {
  try {
    const records = await prisma.paymentRecord.findMany({
      where: { isPaid: true },
      select: {
        id: true, amount: true, date: true, note: true, isPaid: true, paymentMethod: true, receiptIssued: true,
        payment: { select: { clientId: true, client: { select: { fullName: true } } } },
      },
      orderBy: { date: 'desc' },
      take: 500,
    });
    res.json(records);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

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

// Adds to what the client owes (e.g. one more meeting) without touching what was already paid.
router.post('/:clientId/charge', requireAuth, requireCoach, async (req: AuthRequest, res) => {
  try {
    const amount = parseFloat(req.body.amount);
    if (isNaN(amount) || amount <= 0) return res.status(400).json({ error: 'סכום לא תקין' });
    const payment = await prisma.payment.upsert({
      where: { clientId: req.params.clientId },
      update: { totalAmount: { increment: amount } },
      create: { clientId: req.params.clientId, totalAmount: amount },
    });
    res.json(payment);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:clientId/record', requireAuth, requireCoach, async (req: AuthRequest, res) => {
  try {
    const { amount, note, date, isPaid = true, scheduledDate } = req.body;
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) return res.status(400).json({ error: 'סכום לא תקין' });

    const details = isPaid ? receivedDetails(req.body) : null;
    if (typeof details === 'string') return res.status(400).json({ error: details });

    // Money can arrive before there is a plan; it then stands as credit against later charges.
    const payment = await prisma.payment.findUnique({ where: { clientId: req.params.clientId } })
      ?? (isPaid ? await prisma.payment.create({ data: { clientId: req.params.clientId, totalAmount: 0 } }) : null);
    if (!payment) return res.status(404).json({ error: 'Payment plan not found' });

    const record = await prisma.paymentRecord.create({
      data: {
        paymentId: payment.id,
        amount: parsedAmount,
        note,
        date: date ? new Date(date) : new Date(),
        isPaid,
        scheduledDate: scheduledDate ? new Date(scheduledDate) : undefined,
        paymentMethod: details?.paymentMethod ?? null,
        receiptIssued: details?.receiptIssued ?? null,
      },
    });

    if (isPaid) {
      await prisma.payment.update({
        where: { id: payment.id },
        data: { paidAmount: { increment: parsedAmount } },
      });
    }

    res.status(201).json(record);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// Edit a payment record
router.put('/record/:recordId', requireAuth, requireCoach, async (req, res) => {
  try {
    const { recordId } = req.params;
    const { amount, note, date, paymentMethod, receiptIssued } = req.body;
    const record = await prisma.paymentRecord.findUnique({ where: { id: recordId } });
    if (!record) return res.status(404).json({ error: 'Record not found' });
    if (record.isPaid && paymentMethod !== undefined && !String(paymentMethod).trim()) return res.status(400).json({ error: 'חובה לבחור באיזו דרך התקבל הכסף' });
    if (receiptIssued !== undefined && (!record.isPaid || typeof receiptIssued !== 'boolean')) return res.status(400).json({ error: 'סימון קבלה לא תקין' });

    const parsedAmount = amount !== undefined ? parseFloat(amount) : undefined;

    // If amount changed and record is paid, update paidAmount delta
    if (parsedAmount !== undefined && parsedAmount !== record.amount && record.isPaid) {
      const delta = parsedAmount - record.amount;
      await prisma.payment.update({
        where: { id: record.paymentId },
        data: { paidAmount: { increment: delta } },
      });
    }

    const updated = await prisma.paymentRecord.update({
      where: { id: recordId },
      data: {
        ...(parsedAmount !== undefined ? { amount: parsedAmount } : {}),
        ...(note !== undefined ? { note } : {}),
        ...(date ? { date: new Date(date) } : {}),
        ...(paymentMethod !== undefined ? { paymentMethod } : {}),
        ...(receiptIssued !== undefined ? { receiptIssued } : {}),
      },
    });
    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete a payment record
router.delete('/record/:recordId', requireAuth, requireCoach, async (req, res) => {
  try {
    const { recordId } = req.params;
    const record = await prisma.paymentRecord.findUnique({ where: { id: recordId } });
    if (!record) return res.status(404).json({ error: 'Record not found' });

    if (record.isPaid) {
      await prisma.payment.update({
        where: { id: record.paymentId },
        data: { paidAmount: { decrement: record.amount } },
      });
    }

    await prisma.paymentRecord.delete({ where: { id: recordId } });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// Mark a scheduled record as paid
router.post('/record/:recordId/pay', requireAuth, requireCoach, async (_req, res) => {
  try {
    const { recordId } = _req.params;
    const record = await prisma.paymentRecord.findUnique({ where: { id: recordId } });
    if (!record) return res.status(404).json({ error: 'Record not found' });
    if (record.isPaid) return res.status(400).json({ error: 'Already paid' });
    const details = receivedDetails(_req.body);
    if (typeof details === 'string') return res.status(400).json({ error: details });

    await prisma.paymentRecord.update({ where: { id: recordId }, data: { isPaid: true, date: _req.body.date ? new Date(_req.body.date) : new Date(), ...details } });
    await prisma.payment.update({
      where: { id: record.paymentId },
      data: { paidAmount: { increment: record.amount } },
    });

    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
