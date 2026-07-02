import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth, requireCoach, AuthRequest } from '../middleware/auth';
import { addToGoogleCalendar, deleteFromGoogleCalendar } from '../services/calendar';
import { sendMeetingConfirmation } from '../services/email';

const router = Router();
const prisma = new PrismaClient();

router.get('/', requireAuth, requireCoach, async (req: AuthRequest, res) => {
  try {
    const { clientId, from, to } = req.query;
    const meetings = await prisma.meeting.findMany({
      where: {
        ...(clientId ? { clientId: clientId as string } : {}),
        ...(from || to ? {
          date: {
            ...(from ? { gte: new Date(from as string) } : {}),
            ...(to ? { lte: new Date(to as string) } : {}),
          }
        } : {}),
      },
      include: { client: { select: { fullName: true, email: true } }, summary: true },
      orderBy: { date: 'asc' },
    });
    res.json(meetings);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const meeting = await prisma.meeting.findUnique({
      where: { id: req.params.id },
      include: {
        client: { select: { fullName: true, email: true, phone: true } },
        summary: { include: { tags: true, documents: true } },
        tasks: true,
      },
    });
    if (!meeting) return res.status(404).json({ error: 'Not found' });

    if (req.user?.role === 'CLIENT' && req.user.clientId !== meeting.clientId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    res.json(meeting);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', requireAuth, requireCoach, async (req: AuthRequest, res) => {
  try {
    const { clientId, date, duration, type, notes } = req.body;

    const client = await prisma.client.findUnique({ where: { id: clientId } });
    if (!client) return res.status(404).json({ error: 'Client not found' });

    const meeting = await prisma.meeting.create({
      data: { clientId, date: new Date(date), duration: parseInt(duration), type, notes },
    });

    let googleEventId: string | undefined;
    try {
      googleEventId = await addToGoogleCalendar(meeting, client);
      if (googleEventId) {
        await prisma.meeting.update({ where: { id: meeting.id }, data: { googleEventId } });
      }
    } catch (e) { console.error('Google Calendar failed:', e); }

    try {
      await sendMeetingConfirmation(client.email, client.fullName, meeting);
    } catch (e) { console.error('Email failed:', e); }

    res.status(201).json({ ...meeting, googleEventId });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id', requireAuth, requireCoach, async (req: AuthRequest, res) => {
  try {
    const { date, duration, type, notes } = req.body;
    const meeting = await prisma.meeting.update({
      where: { id: req.params.id },
      data: { ...(date ? { date: new Date(date) } : {}), ...(duration ? { duration: parseInt(duration) } : {}), type, notes },
    });
    res.json(meeting);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', requireAuth, requireCoach, async (req: AuthRequest, res) => {
  try {
    const meeting = await prisma.meeting.findUnique({ where: { id: req.params.id } });
    if (meeting?.googleEventId) {
      try { await deleteFromGoogleCalendar(meeting.googleEventId); } catch (e) { console.error(e); }
    }
    await prisma.meeting.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
