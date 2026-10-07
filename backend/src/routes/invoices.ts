import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, requireCoach } from '../middleware/auth';

const router = Router();

router.get('/', requireAuth, requireCoach, async (_req, res) => {
  try {
    const invoices = await prisma.invoice.findMany({
      include: {
        client: { select: { fullName: true, email: true } },
        items: { orderBy: { order: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(invoices);
  } catch { res.status(500).json({ error: 'Server error' }); }
});

router.get('/receivables', requireAuth, requireCoach, async (_req, res) => {
  try {
    const clients = await prisma.client.findMany({
      where: { status: 'ACTIVE' },
      include: {
        payments: { include: { history: { where: { isPaid: false } } } },
        invoices: { where: { status: { not: 'PAID' } }, include: { items: true } },
      },
      orderBy: { fullName: 'asc' },
    });

    const receivables = clients
      .map(c => {
        const paymentDebt = c.payments[0]
          ? c.payments[0].totalAmount - c.payments[0].paidAmount
          : 0;
        const invoiceDebt = c.invoices.reduce((sum, inv) => {
          const total = inv.items.reduce((s, item) => s + item.price * item.quantity, 0);
          return sum + total;
        }, 0);
        const totalDebt = paymentDebt + invoiceDebt;
        return {
          id: c.id,
          fullName: c.fullName,
          email: c.email,
          phone: c.phone,
          clientType: c.clientType,
          paymentDebt,
          invoiceDebt,
          totalDebt,
          nextPaymentDate: c.payments[0]?.nextPaymentDate ?? null,
          openInvoices: c.invoices.length,
        };
      })
      .filter(c => c.totalDebt > 0)
      .sort((a, b) => b.totalDebt - a.totalDebt);

    res.json(receivables);
  } catch { res.status(500).json({ error: 'Server error' }); }
});

router.get('/:id', requireAuth, requireCoach, async (req, res) => {
  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id: req.params.id },
      include: {
        client: { select: { fullName: true, email: true, phone: true, businessName: true } },
        items: { orderBy: { order: 'asc' } },
      },
    });
    if (!invoice) return res.status(404).json({ error: 'Not found' });
    res.json(invoice);
  } catch { res.status(500).json({ error: 'Server error' }); }
});

router.post('/', requireAuth, requireCoach, async (req, res) => {
  try {
    const { clientId, dueDate, notes, items } = req.body;
    const invoice = await prisma.invoice.create({
      data: {
        clientId,
        dueDate: dueDate ? new Date(dueDate) : undefined,
        notes,
        items: {
          create: (items || []).map((item: any, i: number) => ({
            description: item.description,
            quantity: item.quantity ?? 1,
            price: parseFloat(item.price),
            order: i,
          })),
        },
      },
      include: { client: { select: { fullName: true } }, items: { orderBy: { order: 'asc' } } },
    });
    res.status(201).json(invoice);
  } catch { res.status(500).json({ error: 'Server error' }); }
});

router.put('/:id', requireAuth, requireCoach, async (req, res) => {
  try {
    const { status, dueDate, notes, items } = req.body;
    await prisma.invoiceItem.deleteMany({ where: { invoiceId: req.params.id } });
    const invoice = await prisma.invoice.update({
      where: { id: req.params.id },
      data: {
        status,
        dueDate: dueDate ? new Date(dueDate) : undefined,
        notes,
        items: {
          create: (items || []).map((item: any, i: number) => ({
            description: item.description,
            quantity: item.quantity ?? 1,
            price: parseFloat(item.price),
            order: i,
          })),
        },
      },
      include: { client: { select: { fullName: true } }, items: { orderBy: { order: 'asc' } } },
    });
    res.json(invoice);
  } catch { res.status(500).json({ error: 'Server error' }); }
});

router.patch('/:id/status', requireAuth, requireCoach, async (req, res) => {
  try {
    const invoice = await prisma.invoice.update({
      where: { id: req.params.id },
      data: { status: req.body.status },
    });
    res.json(invoice);
  } catch { res.status(500).json({ error: 'Server error' }); }
});

router.delete('/:id', requireAuth, requireCoach, async (req, res) => {
  try {
    await prisma.invoice.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'Server error' }); }
});

export default router;
