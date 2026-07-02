import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth, requireCoach, AuthRequest } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

router.post('/', requireAuth, requireCoach, async (req: AuthRequest, res) => {
  try {
    const { meetingId, type, goal, progress, challenges, decisions, conclusions, freeText, notes, tags } = req.body;

    const tagRecords = tags?.length
      ? await Promise.all(
          (tags as string[]).map((name: string) =>
            prisma.tag.upsert({ where: { name }, update: {}, create: { name } })
          )
        )
      : [];

    const summary = await prisma.meetingSummary.create({
      data: {
        meetingId,
        type,
        goal,
        progress,
        challenges,
        decisions,
        conclusions,
        freeText,
        notes,
        tags: { connect: tagRecords.map((t) => ({ id: t.id })) },
      },
      include: { tags: true },
    });

    res.status(201).json(summary);
  } catch (err: any) {
    if (err.code === 'P2002') return res.status(400).json({ error: 'Summary already exists for this meeting' });
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id', requireAuth, requireCoach, async (req: AuthRequest, res) => {
  try {
    const { type, goal, progress, challenges, decisions, conclusions, freeText, notes, tags } = req.body;

    const tagRecords = tags?.length
      ? await Promise.all(
          (tags as string[]).map((name: string) =>
            prisma.tag.upsert({ where: { name }, update: {}, create: { name } })
          )
        )
      : [];

    const summary = await prisma.meetingSummary.update({
      where: { id: req.params.id },
      data: {
        type, goal, progress, challenges, decisions, conclusions, freeText, notes,
        tags: { set: tagRecords.map((t) => ({ id: t.id })) },
      },
      include: { tags: true, documents: true },
    });

    res.json(summary);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/client/:clientId', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { clientId } = req.params;
    if (req.user?.role === 'CLIENT' && req.user.clientId !== clientId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const summaries = await prisma.meetingSummary.findMany({
      where: { meeting: { clientId } },
      include: { meeting: { select: { date: true, type: true } }, tags: true, documents: true },
      orderBy: { meeting: { date: 'desc' } },
    });

    res.json(summaries);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
