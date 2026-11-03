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

const positiveAmount = (value: unknown) => {
  const amount = parseFloat(String(value));
  return amount > 0 ? amount : null;
};

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
    if (!payment || req.user?.role === 'CLIENT') return res.json(payment);

    // For the owner: what makes up the total.
    const [charges, meetingCharges] = await Promise.all([
      prisma.paymentCharge.findMany({ where: { paymentId: payment.id }, orderBy: { date: 'desc' } }),
      prisma.meeting.findMany({
        where: { clientId, chargeStatus: 'CHARGED' },
        select: { id: true, date: true, type: true, chargedAmount: true },
        orderBy: { date: 'desc' },
      }),
    ]);
    res.json({ ...payment, charges, meetingCharges });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// Sets the total and the next payment date. An empty date clears it.
router.post('/:clientId', requireAuth, requireCoach, async (req: AuthRequest, res) => {
  try {
    const { nextPaymentDate } = req.body;
    const totalAmount = parseFloat(req.body.totalAmount);
    if (isNaN(totalAmount) || totalAmount < 0) return res.status(400).json({ error: 'סכום לא תקין' });
    const next = nextPaymentDate ? new Date(nextPaymentDate) : null;
    const payment = await prisma.payment.upsert({
      where: { clientId: req.params.clientId },
      update: { totalAmount, ...(nextPaymentDate !== undefined ? { nextPaymentDate: next } : {}) },
      create: { clientId: req.params.clientId, totalAmount, nextPaymentDate: next },
      include: { history: true },
    });
    res.json(payment);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// Adds to what the client owes, and keeps a line saying what for. What was already paid stays as it is.
router.post('/:clientId/charge', requireAuth, requireCoach, async (req: AuthRequest, res) => {
  try {
    const amount = positiveAmount(req.body.amount);
    if (!amount) return res.status(400).json({ error: 'סכום לא תקין' });
    const { note, date } = req.body;
    const payment = await prisma.$transaction(async (tx) => {
      const updated = await tx.payment.upsert({
        where: { clientId: req.params.clientId },
        update: { totalAmount: { increment: amount } },
        create: { clientId: req.params.clientId, totalAmount: amount },
      });
      await tx.paymentCharge.create({ data: { paymentId: updated.id, amount, note: note || null, date: date ? new Date(date) : new Date() } });
      return updated;
    });
    res.json(payment);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/charge/:chargeId', requireAuth, requireCoach, async (req, res) => {
  try {
    const { chargeId } = req.params;
    const charge = await prisma.paymentCharge.findUnique({ where: { id: chargeId } });
    if (!charge) return res.status(404).json({ error: 'Charge not found' });
    const amount = positiveAmount(req.body.amount);
    if (!amount) return res.status(400).json({ error: 'סכום לא תקין' });
    const { note, date } = req.body;
    const updated = await prisma.$transaction(async (tx) => {
      await tx.payment.update({ where: { id: charge.paymentId }, data: { totalAmount: { increment: amount - charge.amount } } });
      return tx.paymentCharge.update({
        where: { id: chargeId },
        data: { amount, ...(note !== undefined ? { note: note || null } : {}), ...(date ? { date: new Date(date) } : {}) },
      });
    });
    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/charge/:chargeId', requireAuth, requireCoach, async (req, res) => {
  try {
    const { chargeId } = req.params;
    const charge = await prisma.paymentCharge.findUnique({ where: { id: chargeId } });
    if (!charge) return res.status(404).json({ error: 'Charge not found' });
    await prisma.$transaction([
      prisma.payment.update({ where: { id: charge.paymentId }, data: { totalAmount: { decrement: charge.amount } } }),
      prisma.paymentCharge.delete({ where: { id: chargeId } }),
    ]);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:clientId/record', requireAuth, requireCoach, async (req: AuthRequest, res) => {
  try {
    const { note, date, isPaid = true, scheduledDate } = req.body;
    const amount = positiveAmount(req.body.amount);
    if (!amount) return res.status(400).json({ error: 'סכום לא תקין' });
    if (!isPaid && !scheduledDate) return res.status(400).json({ error: 'חובה לבחור תאריך' });

    const details = isPaid ? receivedDetails(req.body) : null;
    if (typeof details === 'string') return res.status(400).json({ error: details });

    const record = await prisma.$transaction(async (tx) => {
      // Money can arrive, or be expected, before anything was charged; it then stands against later charges.
      const payment = await tx.payment.upsert({
        where: { clientId: req.params.clientId },
        update: isPaid ? { paidAmount: { increment: amount } } : {},
        create: { clientId: req.params.clientId, totalAmount: 0, paidAmount: isPaid ? amount : 0 },
      });
      return tx.paymentRecord.create({
        data: {
          paymentId: payment.id,
          amount,
          note,
          date: date ? new Date(date) : new Date(),
          isPaid,
          scheduledDate: scheduledDate ? new Date(scheduledDate) : undefined,
          paymentMethod: details?.paymentMethod ?? null,
          receiptIssued: details?.receiptIssued ?? null,
        },
      });
    });

    res.status(201).json(record);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// Edit a payment record
router.put('/record/:recordId', requireAuth, requireCoach, async (req, res) => {
  try {
    const { recordId } = req.params;
    const { amount, note, date, scheduledDate, paymentMethod, receiptIssued } = req.body;
    const record = await prisma.paymentRecord.findUnique({ where: { id: recordId } });
    if (!record) return res.status(404).json({ error: 'Record not found' });
    if (record.isPaid && paymentMethod !== undefined && !String(paymentMethod).trim()) return res.status(400).json({ error: 'חובה לבחור באיזו דרך התקבל הכסף' });
    if (receiptIssued !== undefined && (!record.isPaid || typeof receiptIssued !== 'boolean')) return res.status(400).json({ error: 'סימון קבלה לא תקין' });
    if (!record.isPaid && scheduledDate !== undefined && !scheduledDate) return res.status(400).json({ error: 'חובה לבחור תאריך' });

    const parsedAmount = amount !== undefined ? positiveAmount(amount) : undefined;
    if (parsedAmount === null) return res.status(400).json({ error: 'סכום לא תקין' });

    const updated = await prisma.$transaction(async (tx) => {
      // If the amount of money already received changed, the balance moves with it
      if (parsedAmount !== undefined && parsedAmount !== record.amount && record.isPaid) {
        await tx.payment.update({
          where: { id: record.paymentId },
          data: { paidAmount: { increment: parsedAmount - record.amount } },
        });
      }
      return tx.paymentRecord.update({
        where: { id: recordId },
        data: {
          ...(parsedAmount !== undefined ? { amount: parsedAmount } : {}),
          ...(note !== undefined ? { note } : {}),
          ...(date ? { date: new Date(date) } : {}),
          ...(scheduledDate && !record.isPaid ? { scheduledDate: new Date(scheduledDate) } : {}),
          ...(paymentMethod !== undefined ? { paymentMethod } : {}),
          ...(receiptIssued !== undefined ? { receiptIssued } : {}),
        },
      });
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

    await prisma.$transaction(async (tx) => {
      if (record.isPaid) {
        await tx.payment.update({
          where: { id: record.paymentId },
          data: { paidAmount: { decrement: record.amount } },
        });
      }
      await tx.paymentRecord.delete({ where: { id: recordId } });
    });
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

    const marked = await prisma.$transaction(async (tx) => {
      // The status check stops a second click from counting the money twice.
      const { count } = await tx.paymentRecord.updateMany({
        where: { id: recordId, isPaid: false },
        data: { isPaid: true, date: _req.body.date ? new Date(_req.body.date) : new Date(), ...details },
      });
      if (count) await tx.payment.update({ where: { id: record.paymentId }, data: { paidAmount: { increment: record.amount } } });
      return count;
    });
    if (!marked) return res.status(400).json({ error: 'Already paid' });

    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
