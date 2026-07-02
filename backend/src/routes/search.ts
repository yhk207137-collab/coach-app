import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth, requireCoach, AuthRequest } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

router.get('/', requireAuth, requireCoach, async (req: AuthRequest, res) => {
  try {
    const q = (req.query.q as string)?.trim();
    if (!q || q.length < 2) return res.json({ clients: [], summaries: [], tasks: [] });

    const [clients, summaries, tasks] = await Promise.all([
      prisma.client.findMany({
        where: {
          OR: [
            { fullName: { contains: q, mode: 'insensitive' } },
            { email: { contains: q, mode: 'insensitive' } },
            { businessName: { contains: q, mode: 'insensitive' } },
          ],
        },
        take: 5,
        select: { id: true, fullName: true, email: true, businessName: true, status: true },
      }),

      prisma.meetingSummary.findMany({
        where: {
          OR: [
            { goal: { contains: q, mode: 'insensitive' } },
            { decisions: { contains: q, mode: 'insensitive' } },
            { freeText: { contains: q, mode: 'insensitive' } },
            { tags: { some: { name: { contains: q, mode: 'insensitive' } } } },
          ],
        },
        include: {
          meeting: { select: { date: true, client: { select: { fullName: true, id: true } } } },
          tags: true,
        },
        take: 5,
      }),

      prisma.task.findMany({
        where: {
          OR: [
            { title: { contains: q, mode: 'insensitive' } },
            { description: { contains: q, mode: 'insensitive' } },
          ],
        },
        include: { client: { select: { fullName: true, id: true } } },
        take: 5,
      }),
    ]);

    res.json({ clients, summaries, tasks });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
