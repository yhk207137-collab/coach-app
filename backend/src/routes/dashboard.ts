import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth, requireCoach, AuthRequest } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

router.get('/', requireAuth, requireCoach, async (req: AuthRequest, res) => {
  try {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(startOfDay.getTime() + 86400000);
    const nextWeek = new Date(now.getTime() + 7 * 86400000);

    const [
      activeClients,
      todayMeetings,
      upcomingMeetings,
      openTasks,
      pendingPayments,
      clientsWithoutFutureMeeting,
      activeProjects,
      openQuotes,
      pendingContracts,
    ] = await Promise.all([
      prisma.client.count({ where: { status: 'ACTIVE' } }),

      prisma.meeting.findMany({
        where: { date: { gte: startOfDay, lt: endOfDay } },
        include: { client: { select: { fullName: true } } },
        orderBy: { date: 'asc' },
      }),

      prisma.meeting.findMany({
        where: { date: { gte: endOfDay, lt: nextWeek } },
        include: { client: { select: { fullName: true } } },
        orderBy: { date: 'asc' },
        take: 10,
      }),

      prisma.task.findMany({
        where: { status: { not: 'COMPLETED' } },
        include: { client: { select: { fullName: true } } },
        orderBy: { dueDate: 'asc' },
        take: 10,
      }),

      prisma.payment.findMany({
        where: {
          OR: [
            { nextPaymentDate: { lt: now } },
            { paidAmount: { lt: prisma.payment.fields.totalAmount } },
          ],
        },
        include: { client: { select: { fullName: true } } },
      }),

      prisma.client.findMany({
        where: {
          status: 'ACTIVE',
          meetings: { none: { date: { gte: now } } },
        },
        select: { id: true, fullName: true, email: true },
        take: 10,
      }),

      prisma.project.findMany({
        where: { status: 'ACTIVE' },
        include: {
          client: { select: { id: true, fullName: true } },
          tasks: { select: { status: true } },
        },
        orderBy: { updatedAt: 'desc' },
        take: 6,
      }),

      prisma.quote.findMany({
        where: { status: { in: ['DRAFT', 'SENT'] } },
        include: { client: { select: { id: true, fullName: true } } },
        orderBy: { createdAt: 'desc' },
        take: 6,
      }),

      prisma.contract.findMany({
        where: { status: { in: ['DRAFT', 'SENT'] } },
        include: { client: { select: { id: true, fullName: true } } },
        orderBy: { createdAt: 'desc' },
        take: 6,
      }),
    ]);

    res.json({
      activeClients,
      todayMeetings,
      upcomingMeetings,
      openTasks,
      pendingPayments,
      clientsWithoutFutureMeeting,
      activeProjects,
      openQuotes,
      pendingContracts,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
