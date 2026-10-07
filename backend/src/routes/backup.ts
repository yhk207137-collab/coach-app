import { Router } from 'express';
import { requireAuth, requireCoach } from '../middleware/auth';
import { backupToSheets } from '../services/sheets';
import { prisma } from '../lib/prisma';

const router = Router();

router.post('/sheets', requireAuth, requireCoach, async (_req, res) => {
  try {
    const url = await backupToSheets();
    res.json({ ok: true, url });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Backup failed' });
  }
});

router.get('/export', requireAuth, requireCoach, async (_req, res) => {
  try {
    const [clients, meetings, payments, tasks, projects, leads, quotes, contracts] = await Promise.all([
      prisma.client.findMany({ include: { payments: { include: { history: true } } }, orderBy: { fullName: 'asc' } }),
      prisma.meeting.findMany({ include: { client: { select: { fullName: true } }, summary: true }, orderBy: { date: 'desc' } }),
      prisma.payment.findMany({ include: { client: { select: { fullName: true } }, history: true } }),
      prisma.task.findMany({ include: { client: { select: { fullName: true } } }, orderBy: { createdAt: 'desc' } }),
      prisma.project.findMany({ include: { client: { select: { fullName: true } }, subProjects: true, tasks: true }, orderBy: { createdAt: 'desc' } }),
      prisma.lead.findMany({ include: { activities: true }, orderBy: { createdAt: 'desc' } }),
      prisma.quote.findMany({ include: { client: { select: { fullName: true } }, items: true }, orderBy: { createdAt: 'desc' } }),
      prisma.contract.findMany({ include: { client: { select: { fullName: true } } }, orderBy: { createdAt: 'desc' } }),
    ]);

    const exportData = {
      exportedAt: new Date().toISOString(),
      counts: { clients: clients.length, meetings: meetings.length, tasks: tasks.length, projects: projects.length, leads: leads.length },
      clients, meetings, payments, tasks, projects, leads, quotes, contracts,
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="backup-${new Date().toISOString().slice(0, 10)}.json"`);
    res.json(exportData);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Export failed' });
  }
});

export default router;
