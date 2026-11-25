import { Prisma } from '@prisma/client';
import { asyncRouter } from '../lib/asyncRouter';
import { requireAuth, requireCoach } from '../middleware/auth';
import { prisma } from '../lib/prisma';

// "מיילים שנשלחו": what the system sent (login codes excepted), one row per content.
// Copies of the same email to many people (a campaign, a reminder step) show once, with a count.
const router = asyncRouter();
router.use(requireAuth, requireCoach);

const PAGE = 50;
const KEY = Prisma.sql`COALESCE("groupKey", kind || '|' || subject)`;

router.get('/', async (req, res) => {
  const kind = String(req.query.kind || '');
  const q = String(req.query.q || '').trim().slice(0, 100);
  const page = Math.max(0, Number(req.query.page) || 0);
  const conds = [Prisma.sql`TRUE`];
  if (kind) conds.push(Prisma.sql`kind = ${kind}`);
  if (q) conds.push(Prisma.sql`(subject ILIKE ${`%${q}%`} OR "to" ILIKE ${`%${q}%`})`);
  const where = Prisma.join(conds, ' AND ');
  const [rows, totals, kinds] = await Promise.all([
    prisma.$queryRaw<{ id: string; subject: string; kind: string; sent: number; people: number; failed: number; first: Date; last: Date }[]>`
      SELECT (array_agg(id ORDER BY "createdAt" DESC))[1] AS id,
             (array_agg(subject ORDER BY "createdAt" DESC))[1] AS subject,
             (array_agg(kind ORDER BY "createdAt" DESC))[1] AS kind,
             count(*) FILTER (WHERE ok)::int AS sent,
             count(DISTINCT "to") FILTER (WHERE ok)::int AS people,
             count(*) FILTER (WHERE NOT ok)::int AS failed,
             min("createdAt") AS first, max("createdAt") AS last
      FROM "SentEmail" WHERE ${where}
      GROUP BY ${KEY} ORDER BY max("createdAt") DESC
      OFFSET ${page * PAGE} LIMIT ${PAGE}`,
    prisma.$queryRaw<{ n: number }[]>`SELECT count(DISTINCT ${KEY})::int AS n FROM "SentEmail" WHERE ${where}`,
    prisma.$queryRaw<{ kind: string; count: number }[]>`
      SELECT kind, count(DISTINCT ${KEY})::int AS count FROM "SentEmail" GROUP BY kind ORDER BY count DESC`,
  ]);
  res.json({ rows, total: totals[0]?.n || 0, pageSize: PAGE, kinds });
});

router.get('/:id', async (req, res) => {
  const row = await prisma.sentEmail.findUnique({ where: { id: req.params.id } });
  if (!row) return res.status(404).json({ error: 'המייל לא נמצא' });
  res.json(row);
});

export default router;
