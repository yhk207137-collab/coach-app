import { asyncRouter } from '../lib/asyncRouter';
import { requireAuth, requireCoach } from '../middleware/auth';
import { prisma } from '../lib/prisma';

// "מיילים שנשלחו": every email the system sent (login codes excepted), newest first.
const router = asyncRouter();
router.use(requireAuth, requireCoach);

const PAGE = 50;

router.get('/', async (req, res) => {
  const kind = String(req.query.kind || '');
  const q = String(req.query.q || '').trim().slice(0, 100);
  const page = Math.max(0, Number(req.query.page) || 0);
  const where: any = {
    ...(kind ? { kind } : {}),
    ...(q ? { OR: [{ to: { contains: q, mode: 'insensitive' } }, { subject: { contains: q, mode: 'insensitive' } }] } : {}),
  };
  const [rows, total, kinds] = await Promise.all([
    prisma.sentEmail.findMany({ where, orderBy: { createdAt: 'desc' }, skip: page * PAGE, take: PAGE, select: { id: true, to: true, subject: true, kind: true, ok: true, error: true, createdAt: true } }),
    prisma.sentEmail.count({ where }),
    prisma.sentEmail.groupBy({ by: ['kind'], _count: { _all: true } }),
  ]);
  res.json({ rows, total, pageSize: PAGE, kinds: kinds.map((k) => ({ kind: k.kind, count: k._count._all })).sort((a, b) => b.count - a.count) });
});

router.get('/:id', async (req, res) => {
  const row = await prisma.sentEmail.findUnique({ where: { id: req.params.id } });
  if (!row) return res.status(404).json({ error: 'המייל לא נמצא' });
  res.json(row);
});

export default router;
