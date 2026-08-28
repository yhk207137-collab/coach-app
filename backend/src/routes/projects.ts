import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, requireCoach } from '../middleware/auth';

const router = Router();

router.get('/', requireAuth, requireCoach, async (_req, res) => {
  try {
    const projects = await prisma.project.findMany({
      include: {
        client: true,
        subProjects: { include: { tasks: true } },
        tasks: { where: { subProjectId: null } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(projects);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id', requireAuth, requireCoach, async (req, res) => {
  try {
    const project = await prisma.project.findUnique({
      where: { id: req.params.id },
      include: {
        client: true,
        subProjects: { include: { tasks: true } },
        tasks: true,
      },
    });
    if (!project) return res.status(404).json({ error: 'לא נמצא' });
    res.json(project);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', requireAuth, requireCoach, async (req, res) => {
  try {
    const { clientId, name, description, status, startDate, endDate, budget, strategy, goals } = req.body;
    const project = await prisma.project.create({
      data: {
        clientId,
        name,
        description,
        status,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        budget: budget ? Number(budget) : null,
        strategy,
        goals,
      },
      include: { client: true, subProjects: true, tasks: true },
    });
    res.json(project);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id', requireAuth, requireCoach, async (req, res) => {
  try {
    const { name, description, status, startDate, endDate, budget, strategy, goals } = req.body;
    const project = await prisma.project.update({
      where: { id: req.params.id },
      data: {
        name,
        description,
        status,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        budget: budget ? Number(budget) : null,
        strategy,
        goals,
      },
      include: { client: true, subProjects: true, tasks: true },
    });
    res.json(project);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', requireAuth, requireCoach, async (req, res) => {
  try {
    await prisma.project.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// Sub-projects
router.post('/:id/subprojects', requireAuth, requireCoach, async (req, res) => {
  try {
    const { name, description, status } = req.body;
    const sub = await prisma.subProject.create({
      data: { projectId: req.params.id, name, description, status },
      include: { tasks: true },
    });
    res.json(sub);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/subprojects/:subId', requireAuth, requireCoach, async (req, res) => {
  try {
    const { name, description, status } = req.body;
    const sub = await prisma.subProject.update({
      where: { id: req.params.subId },
      data: { name, description, status },
      include: { tasks: true },
    });
    res.json(sub);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/subprojects/:subId', requireAuth, requireCoach, async (req, res) => {
  try {
    await prisma.subProject.delete({ where: { id: req.params.subId } });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
