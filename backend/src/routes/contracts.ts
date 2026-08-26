import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth, requireCoach } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

router.get('/', requireAuth, requireCoach, async (_req, res) => {
  try {
    const contracts = await prisma.contract.findMany({
      include: { client: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(contracts);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id', requireAuth, requireCoach, async (req, res) => {
  try {
    const contract = await prisma.contract.findUnique({
      where: { id: req.params.id },
      include: { client: true },
    });
    if (!contract) return res.status(404).json({ error: 'לא נמצא' });
    res.json(contract);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// Public endpoint — client signs without auth
router.get('/sign/:id', async (req, res) => {
  try {
    const contract = await prisma.contract.findUnique({
      where: { id: req.params.id },
      include: { client: true },
    });
    if (!contract) return res.status(404).json({ error: 'לא נמצא' });
    res.json(contract);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/sign/:id', async (req, res) => {
  try {
    const { signatureData, signerName } = req.body;
    const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '';
    const contract = await prisma.contract.update({
      where: { id: req.params.id },
      data: {
        status: 'SIGNED',
        signedAt: new Date(),
        signatureData,
        signerName,
        signerIp: ip,
      },
    });
    res.json(contract);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', requireAuth, requireCoach, async (req, res) => {
  try {
    const { clientId, title, content, validUntil } = req.body;
    const contract = await prisma.contract.create({
      data: {
        clientId,
        title,
        content,
        validUntil: validUntil ? new Date(validUntil) : null,
      },
      include: { client: true },
    });
    res.json(contract);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id', requireAuth, requireCoach, async (req, res) => {
  try {
    const { title, content, status, validUntil } = req.body;
    const contract = await prisma.contract.update({
      where: { id: req.params.id },
      data: {
        title,
        content,
        status,
        validUntil: validUntil ? new Date(validUntil) : null,
      },
      include: { client: true },
    });
    res.json(contract);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', requireAuth, requireCoach, async (req, res) => {
  try {
    await prisma.contract.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
