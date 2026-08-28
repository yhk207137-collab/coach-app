import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, requireCoach, AuthRequest } from '../middleware/auth';
import { addToGoogleCalendar, updateGoogleCalendarEvent, deleteFromGoogleCalendar } from '../services/calendar';
import { sendMeetingConfirmation } from '../services/email';

const router = Router();

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
    const data: any = {};
    if (date) data.date = new Date(date);
    if (duration !== undefined && duration !== '') data.duration = parseInt(duration);
    if (type !== undefined) data.type = type;
    if (notes !== undefined) data.notes = notes;

    const meeting = await prisma.meeting.update({
      where: { id: req.params.id },
      data,
      include: { client: { select: { fullName: true, email: true } } },
    });

    // Sync with Google Calendar if event was previously added
    if (meeting.googleEventId) {
      try {
        await updateGoogleCalendarEvent(meeting.googleEventId, meeting, meeting.client);
      } catch (e) { console.error('Google Calendar update failed:', e); }
    }

    res.json(meeting);
  } catch (err: any) {
    console.error('[PUT /meetings/:id]', err?.message || err);
    res.status(500).json({ error: 'שגיאה בעדכון הפגישה' });
  }
});

// One-time fix: subtract 3 hours from all meetings created before the timezone fix was deployed
router.post('/admin/fix-timezone', requireAuth, requireCoach, async (_req: AuthRequest, res) => {
  try {
    // Only fix meetings created before 2025-07-27 18:00 UTC (when the fix was deployed)
    const cutoff = new Date('2025-07-27T18:00:00.000Z');
    const meetings = await prisma.meeting.findMany({ where: { createdAt: { lt: cutoff } } });

    let fixed = 0;
    for (const m of meetings) {
      const corrected = new Date(m.date.getTime() - 3 * 60 * 60 * 1000);
      await prisma.meeting.update({ where: { id: m.id }, data: { date: corrected } });
      fixed++;
    }

    console.log(`[TIMEZONE FIX] Corrected ${fixed} meetings`);
    res.json({ ok: true, fixed });
  } catch (err: any) {
    console.error('[TIMEZONE FIX]', err?.message);
    res.status(500).json({ error: 'שגיאה בתיקון השעות' });
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
