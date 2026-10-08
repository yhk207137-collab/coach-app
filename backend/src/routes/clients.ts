import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, requireCoach, AuthRequest } from '../middleware/auth';
import { sendClientWelcomeEmail } from '../services/email';

const router = Router();

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
        projects: { include: { subProjects: true, tasks: true }, orderBy: { createdAt: 'desc' } },
        user: { select: { email: true } },
      },
    });

    if (!client) return res.status(404).json({ error: 'Client not found' });
    res.json(client);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// Strips invisible bidi/zero-width marks that Hebrew keyboards and copy-paste insert into emails/phones.
const INVISIBLE = /[​-‏‪-‮⁦-⁩﻿\s]/g;
const cleanEmail = (v: unknown) => String(v ?? '').replace(INVISIBLE, '').toLowerCase();
const cleanText = (v: unknown) => {
  const s = String(v ?? '').replace(/[​-‏‪-‮⁦-⁩﻿]/g, '').trim();
  return s || null;
};

function clientData(body: any) {
  const fee = parseFloat(body.monthlyFee);
  return {
    fullName: String(body.fullName ?? '').trim(),
    email: cleanEmail(body.email),
    phone: cleanText(body.phone),
    businessName: cleanText(body.businessName),
    businessField: cleanText(body.businessField),
    notes: cleanText(body.notes),
    status: body.status || undefined,
    clientType: body.clientType || undefined,
    monthlyFee: isNaN(fee) ? null : fee,
    startDate: body.startDate ? new Date(body.startDate) : undefined,
  };
}

router.post('/', requireAuth, requireCoach, async (req: AuthRequest, res) => {
  try {
    const data = clientData(req.body);
    if (!data.fullName || !data.email) return res.status(400).json({ error: 'שם ומייל הם שדות חובה' });

    const client = await prisma.client.create({ data });

    sendClientWelcomeEmail(client.email, client.fullName)
      .catch((e) => console.error('[EMAIL] Client welcome failed:', e?.message || e));

    res.status(201).json(client);
  } catch (err: any) {
    if (err.code === 'P2002') return res.status(400).json({ error: 'כבר קיים לקוח עם המייל הזה' });
    console.error('[CLIENTS] create failed:', err?.message || err);
    res.status(500).json({ error: 'שגיאה בשמירת הלקוח' });
  }
});

router.put('/:id', requireAuth, requireCoach, async (req: AuthRequest, res) => {
  try {
    const data = clientData(req.body);
    if (!data.fullName || !data.email) return res.status(400).json({ error: 'שם ומייל הם שדות חובה' });
    const client = await prisma.client.update({ where: { id: req.params.id }, data });
    res.json(client);
  } catch (err: any) {
    if (err.code === 'P2002') return res.status(400).json({ error: 'כבר קיים לקוח עם המייל הזה' });
    console.error('[CLIENTS] update failed:', err?.message || err);
    res.status(500).json({ error: 'שגיאה בשמירת הלקוח' });
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
