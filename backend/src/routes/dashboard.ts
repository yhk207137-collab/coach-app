import { prisma } from '../lib/prisma';
import { asyncRouter } from '../lib/asyncRouter';
import { requireAuth, requireCoach, AuthRequest } from '../middleware/auth';
import { getMarketingSettings, statsByCampaign } from '../services/marketing';
import { Alert, collectAlerts } from '../services/alerts';

const router = asyncRouter();

const TZ = 'Asia/Jerusalem';
const DAY = 86_400_000;
const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const hourFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hour12: false });
const dayKey = (d: Date) => dayFmt.format(d);
const monthKey = (d: Date) => dayKey(d).slice(0, 7);
const MONTHS_HE = ['ינו׳', 'פבר׳', 'מרץ', 'אפר׳', 'מאי', 'יוני', 'יולי', 'אוג׳', 'ספט׳', 'אוק׳', 'נוב׳', 'דצמ׳'];

function shiftMonth(key: string, delta: number) {
  const [y, m] = key.split('-').map(Number);
  const idx = y * 12 + (m - 1) + delta;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`;
}

const STAGES = [
  { key: 'COLD', label: 'קר' },
  { key: 'WARM', label: 'פושר' },
  { key: 'HOT', label: 'חם' },
  { key: 'PROPOSAL', label: 'הצעה נשלחה' },
  { key: 'WON', label: 'נסגר' },
  { key: 'LOST', label: 'לא נסגר' },
] as const;

router.get('/', requireAuth, requireCoach, async (req: AuthRequest, res) => {
  const now = new Date();
  const today = dayKey(now);
  const thisMonth = today.slice(0, 7);
  const lastMonth = shiftMonth(thisMonth, -1);
  const thisYear = today.slice(0, 4);
  const in30 = new Date(now.getTime() + 30 * DAY);
  const in7 = new Date(now.getTime() + 7 * DAY);
  // Whole calendar days from today, by the Israeli date.
  const daysFromToday = (d: Date) => Math.round((Date.parse(dayKey(d)) - Date.parse(today)) / DAY);

  const [
    user, mkt, paidRecords, unpaidRecords, payments, clients, leads, quotes,
    meetings, projects, openTasks, subscribers, newSubscribers, lastCampaign, endingContracts,
  ] = await Promise.all([
    prisma.user.findUnique({ where: { id: req.user!.id }, select: { name: true } }),
    getMarketingSettings(),
    prisma.paymentRecord.findMany({
      where: { isPaid: true },
      select: { amount: true, date: true, payment: { select: { clientId: true } } },
    }),
    prisma.paymentRecord.findMany({
      where: { isPaid: false, scheduledDate: { not: null } },
      select: { id: true, amount: true, scheduledDate: true, note: true, payment: { select: { clientId: true, client: { select: { fullName: true } } } } },
      orderBy: { scheduledDate: 'asc' },
    }),
    prisma.payment.findMany({
      select: { clientId: true, totalAmount: true, paidAmount: true, nextPaymentDate: true, client: { select: { fullName: true } } },
    }),
    prisma.client.findMany({ select: { id: true, fullName: true, status: true, clientType: true, monthlyFee: true, createdAt: true } }),
    prisma.lead.findMany({ select: { id: true, fullName: true, stage: true, estimatedValue: true, updatedAt: true } }),
    prisma.quote.findMany({
      select: { id: true, title: true, status: true, updatedAt: true, validUntil: true, client: { select: { id: true, fullName: true } }, items: { select: { price: true, quantity: true } } },
    }),
    prisma.meeting.findMany({
      where: { date: { gte: new Date(now.getTime() - 62 * DAY), lt: in7 } },
      select: { id: true, date: true, duration: true, type: true, clientId: true, client: { select: { fullName: true } } },
      orderBy: { date: 'asc' },
    }),
    prisma.project.findMany({
      where: { status: { in: ['ACTIVE', 'PLANNING'] } },
      select: { id: true, name: true, status: true, budget: true, startDate: true, endDate: true, client: { select: { id: true, fullName: true } }, tasks: { select: { status: true } } },
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.task.findMany({
      where: { status: { not: 'COMPLETED' } },
      select: { id: true, title: true, dueDate: true, clientId: true, projectId: true, client: { select: { fullName: true } }, project: { select: { name: true } } },
      orderBy: { dueDate: { sort: 'asc', nulls: 'last' } },
    }),
    prisma.contact.count({ where: { status: 'SUBSCRIBED' } }),
    prisma.contact.count({ where: { status: 'SUBSCRIBED', createdAt: { gte: new Date(now.getTime() - 30 * DAY) } } }),
    prisma.campaign.findFirst({ where: { kind: 'BROADCAST', status: 'SENT' }, orderBy: { sentAt: 'desc' }, select: { id: true, name: true, sentAt: true } }),
    prisma.contract.findMany({ where: { status: 'SIGNED', validUntil: { not: null } }, select: { id: true, title: true, validUntil: true, client: { select: { fullName: true } } } }),
  ]);

  // ── Revenue ───────────────────────────────────────────────────────────────
  const collectedByMonth = new Map<string, number>();
  const paidByClient = new Map<string, number>();
  for (const r of paidRecords) {
    const k = monthKey(r.date);
    collectedByMonth.set(k, (collectedByMonth.get(k) || 0) + r.amount);
    paidByClient.set(r.payment.clientId, (paidByClient.get(r.payment.clientId) || 0) + r.amount);
  }
  const scheduledByMonth = new Map<string, number>();
  for (const r of unpaidRecords) {
    if (r.scheduledDate! < now) continue;
    const k = monthKey(r.scheduledDate!);
    scheduledByMonth.set(k, (scheduledByMonth.get(k) || 0) + r.amount);
  }
  const monthly = [];
  for (let i = -11; i <= 3; i++) {
    const key = shiftMonth(thisMonth, i);
    monthly.push({
      key,
      label: MONTHS_HE[Number(key.slice(5)) - 1],
      year: key.slice(0, 4),
      collected: Math.round(collectedByMonth.get(key) || 0),
      scheduled: Math.round(i >= 0 ? scheduledByMonth.get(key) || 0 : 0),
      current: i === 0,
      future: i > 0,
    });
  }
  const sumWhere = (pred: (k: string) => boolean) =>
    [...collectedByMonth.entries()].filter(([k]) => pred(k)).reduce((s, [, v]) => s + v, 0);
  const sameDayLastMonth = `${lastMonth}-${today.slice(8)}`;
  const revenue = {
    thisMonth: Math.round(collectedByMonth.get(thisMonth) || 0),
    lastMonth: Math.round(collectedByMonth.get(lastMonth) || 0),
    lastMonthToDate: Math.round(paidRecords.filter((r) => { const d = dayKey(r.date); return d.startsWith(lastMonth) && d <= sameDayLastMonth; }).reduce((s, r) => s + r.amount, 0)),
    ytd: Math.round(sumWhere((k) => k.startsWith(thisYear))),
    lastYtd: Math.round(paidRecords.filter((r) => { const d = dayKey(r.date); return d.startsWith(String(Number(thisYear) - 1)) && d.slice(5) <= today.slice(5); }).reduce((s, r) => s + r.amount, 0)),
    monthly,
  };

  // ── Receivables & forecast ────────────────────────────────────────────────
  const clientName = new Map(clients.map((c) => [c.id, c.fullName]));
  const owing = payments
    .map((p) => ({ clientId: p.clientId, name: p.client.fullName, balance: Math.max(0, p.totalAmount - p.paidAmount), nextPaymentDate: p.nextPaymentDate }))
    .filter((p) => p.balance > 0.5);
  const overdueRecords = unpaidRecords.filter((r) => dayKey(r.scheduledDate!) < today);
  const clientsWithOverdueRecords = new Set(overdueRecords.map((r) => r.payment.clientId));
  const overduePlans = owing.filter((p) => p.nextPaymentDate && dayKey(p.nextPaymentDate) < today && !clientsWithOverdueRecords.has(p.clientId));
  const upcoming = unpaidRecords.filter((r) => dayKey(r.scheduledDate!) >= today && r.scheduledDate! < in30);
  const receivables = {
    outstanding: Math.round(owing.reduce((s, p) => s + p.balance, 0)),
    clientsOwing: owing.length,
    overdueAmount: Math.round(overdueRecords.reduce((s, r) => s + r.amount, 0) + overduePlans.reduce((s, p) => s + p.balance, 0)),
    overdueCount: overdueRecords.length + overduePlans.length,
  };
  const forecast = {
    next30: Math.round(upcoming.reduce((s, r) => s + r.amount, 0)),
    items: upcoming.slice(0, 6).map((r) => ({ id: r.id, clientId: r.payment.clientId, name: r.payment.client.fullName, amount: r.amount, date: r.scheduledDate, note: r.note })),
  };

  const retainers = clients.filter((c) => c.status === 'ACTIVE' && c.clientType === 'RETAINER');
  const mrr = { amount: Math.round(retainers.reduce((s, c) => s + (c.monthlyFee || 0), 0)), clients: retainers.length };

  // ── Pipeline ──────────────────────────────────────────────────────────────
  const quoteValue = (q: (typeof quotes)[number]) => q.items.reduce((s, i) => s + i.price * i.quantity, 0);
  const stages = STAGES.map((s) => {
    const inStage = leads.filter((l) => l.stage === s.key);
    return { key: s.key, label: s.label, count: inStage.length, value: Math.round(inStage.reduce((sum, l) => sum + (l.estimatedValue || 0), 0)) };
  });
  const won = stages.find((s) => s.key === 'WON')!.count;
  const lost = stages.find((s) => s.key === 'LOST')!.count;
  const openQuotes = quotes.filter((q) => ['DRAFT', 'SENT', 'REVISION'].includes(q.status));
  const accepted = quotes.filter((q) => q.status === 'ACCEPTED').length;
  const rejected = quotes.filter((q) => q.status === 'REJECTED').length;
  const pipeline = {
    stages,
    openLeadsCount: stages.filter((s) => !['WON', 'LOST'].includes(s.key)).reduce((n, s) => n + s.count, 0),
    openLeadsValue: stages.filter((s) => !['WON', 'LOST'].includes(s.key)).reduce((n, s) => n + s.value, 0),
    openQuotesCount: openQuotes.length,
    openQuotesValue: Math.round(openQuotes.reduce((s, q) => s + quoteValue(q), 0)),
    winRate: won + lost > 0 ? Math.round((won / (won + lost)) * 100) : null,
    quoteAcceptance: accepted + rejected > 0 ? Math.round((accepted / (accepted + rejected)) * 100) : null,
  };

  // ── Clients ───────────────────────────────────────────────────────────────
  const owingByClient = new Map(owing.map((o) => [o.clientId, o.balance]));
  const topClients = [...new Set([...paidByClient.keys(), ...owingByClient.keys()])]
    .map((id) => ({ id, name: clientName.get(id) || '—', paid: Math.round(paidByClient.get(id) || 0), outstanding: Math.round(owingByClient.get(id) || 0) }))
    .sort((a, b) => b.paid + b.outstanding - (a.paid + a.outstanding))
    .slice(0, 5);
  const activeClients = clients.filter((c) => c.status === 'ACTIVE');
  const clientStats = {
    active: activeClients.length,
    newThisMonth: clients.filter((c) => monthKey(c.createdAt) === thisMonth).length,
    byType: {
      SESSION: activeClients.filter((c) => c.clientType === 'SESSION').length,
      RETAINER: activeClients.filter((c) => c.clientType === 'RETAINER').length,
      PROJECT: activeClients.filter((c) => c.clientType === 'PROJECT').length,
    },
  };

  // ── Meetings & tasks ──────────────────────────────────────────────────────
  const meetingView = (m: (typeof meetings)[number]) => ({ id: m.id, date: m.date, duration: m.duration, type: m.type, clientId: m.clientId, name: m.client.fullName });
  const todayMeetings = meetings.filter((m) => dayKey(m.date) === today).map(meetingView);
  const weekMeetings = meetings.filter((m) => dayKey(m.date) > today).map(meetingView);
  const meetingStats = {
    thisMonth: meetings.filter((m) => monthKey(m.date) === thisMonth && m.date <= now).length,
    lastMonth: meetings.filter((m) => monthKey(m.date) === lastMonth).length,
  };
  const overdueTasks = openTasks.filter((t) => t.dueDate && dayKey(t.dueDate) < today);
  const weekTasks = openTasks.filter((t) => t.dueDate && dayKey(t.dueDate) >= today && t.dueDate < in7);

  // ── Projects ──────────────────────────────────────────────────────────────
  // Late first, then the nearest end date; a project with no end date comes last.
  const openProjects = projects.map((p) => {
    const total = p.tasks.length;
    const done = p.tasks.filter((t) => t.status === 'COMPLETED').length;
    const daysLeft = p.endDate ? daysFromToday(p.endDate) : null;
    // Same rule as the project page: more of the time has gone than of the work.
    const span = p.startDate && p.endDate ? daysFromToday(p.endDate) - daysFromToday(p.startDate) : 0;
    const timePct = span > 0 ? Math.min(100, Math.max(0, Math.round((-daysFromToday(p.startDate!) / span) * 100))) : null;
    const workPct = total ? Math.round((done / total) * 100) : null;
    const behind = daysLeft !== null && daysLeft >= 0 && timePct !== null && workPct !== null && timePct >= 25 && timePct - workPct >= 25;
    return { id: p.id, name: p.name.trim(), status: p.status, client: p.client, budget: p.budget, endDate: p.endDate, daysLeft, behind, tasksTotal: total, tasksDone: done };
  }).sort((a, b) => (a.daysLeft ?? 1e9) - (b.daysLeft ?? 1e9));

  // ── Money in work ─────────────────────────────────────────────────────────
  // Per active client, the largest of what was charged, the budgets of their open projects and what they paid,
  // so a project already charged never counts twice. A settled client with no open project is left out.
  const budgetByClient = new Map<string, number>();
  for (const p of projects) budgetByClient.set(p.client.id, (budgetByClient.get(p.client.id) || 0) + (p.budget || 0));
  const planByClient = new Map(payments.map((p) => [p.clientId, p]));
  const inWork = activeClients
    .map((c) => {
      const charged = planByClient.get(c.id)?.totalAmount || 0;
      const paid = planByClient.get(c.id)?.paidAmount || 0;
      const total = Math.max(charged, budgetByClient.get(c.id) || 0, paid);
      const owed = Math.max(0, charged - paid);
      return { id: c.id, name: c.fullName, total: Math.round(total), paid: Math.round(paid), owed: Math.round(owed), notCharged: Math.round(total - paid - owed) };
    })
    .filter((x) => x.owed + x.notCharged > 0 || (x.total > 0 && budgetByClient.has(x.id)))
    .sort((a, b) => b.owed + b.notCharged - (a.owed + a.notCharged));
  const sumInWork = (key: 'total' | 'paid' | 'owed' | 'notCharged') => inWork.reduce((s, x) => s + x[key], 0);

  // ── Deadlines ─────────────────────────────────────────────────────────────
  // Anything late, and whatever falls due in the next 30 days. Scheduled payments stay with the money panels.
  const dated = <T,>(list: T[], date: (x: T) => Date | null | undefined) =>
    list.flatMap((x) => { const d = date(x); return d ? [{ x, date: d, daysLeft: daysFromToday(d) }] : []; });
  const deadlines = [
    ...dated(projects, (p) => p.endDate).filter((e) => e.daysLeft <= 30).map(({ x: p, date, daysLeft }) => ({
      key: `project-end:${p.id}`, kind: 'project-end', title: p.name.trim(), who: p.client.fullName, date, daysLeft, href: `/projects?open=${p.id}`,
    })),
    ...dated(projects.filter((p) => p.status === 'PLANNING'), (p) => p.startDate).filter((e) => e.daysLeft <= 30).map(({ x: p, date, daysLeft }) => ({
      key: `project-start:${p.id}`, kind: 'project-start', title: p.name.trim(), who: p.client.fullName, date, daysLeft, href: `/projects?open=${p.id}`,
    })),
    ...dated(openTasks, (t) => t.dueDate).filter((e) => e.daysLeft <= 30).map(({ x: t, date, daysLeft }) => ({
      key: `task:${t.id}`, kind: 'task', title: t.title.trim(), who: t.project ? `${t.client.fullName} · ${t.project.name.trim()}` : t.client.fullName, date, daysLeft, href: t.projectId ? `/projects?open=${t.projectId}` : '/tasks',
    })),
    // An offer or a contract already past its date has nothing left to catch, so these start from today.
    ...dated(quotes.filter((q) => q.status === 'SENT'), (q) => q.validUntil).filter((e) => e.daysLeft >= 0 && e.daysLeft <= 30).map(({ x: q, date, daysLeft }) => ({
      key: `quote:${q.id}`, kind: 'quote', title: q.title.trim(), who: q.client.fullName, date, daysLeft, href: '/quotes',
    })),
    ...dated(endingContracts, (c) => c.validUntil).filter((e) => e.daysLeft >= 0 && e.daysLeft <= 30).map(({ x: c, date, daysLeft }) => ({
      key: `contract:${c.id}`, kind: 'contract', title: c.title.trim(), who: c.client.fullName, date, daysLeft, href: '/contracts',
    })),
  ].sort((a, b) => a.daysLeft - b.daysLeft);

  // ── Needs attention ───────────────────────────────────────────────────────
  // Same engine as the bell and the morning email. Coming-up items stay out of this panel, and late tasks show as one line.
  const alerts = await collectAlerts(now);
  const lateTasks = alerts.filter((a) => a.kind === 'task' && !a.soon);
  const attention: Pick<Alert, 'kind' | 'severity' | 'title' | 'detail' | 'amount' | 'href'>[] = alerts.filter((a) => a.kind !== 'meeting' && a.kind !== 'task' && !a.soon);
  if (lateTasks.length) {
    attention.push({
      kind: 'task', severity: 'warning', href: '/tasks',
      title: lateTasks.length === 1 ? 'משימה אחת באיחור' : `${lateTasks.length} משימות באיחור`,
      detail: lateTasks.slice(0, 2).map((a) => a.title.replace('משימה באיחור · ', '')).join(' · '),
    });
  }
  const rank = { critical: 0, warning: 1, info: 2 };
  attention.sort((a, b) => rank[a.severity] - rank[b.severity] || (b.amount || 0) - (a.amount || 0));

  // ── Marketing ─────────────────────────────────────────────────────────────
  let lastCampaignStats = null;
  if (lastCampaign) {
    const s = (await statsByCampaign([lastCampaign.id])).get(lastCampaign.id);
    if (s && s.sent) {
      lastCampaignStats = { ...lastCampaign, sent: s.sent, openRate: Math.round((s.opened / s.sent) * 100), clickRate: Math.round((s.clicked / s.sent) * 100) };
    }
  }

  const hour = Number(hourFmt.format(now));
  const greeting = hour >= 5 && hour < 12 ? 'בוקר טוב' : hour < 17 && hour >= 12 ? 'צהריים טובים' : hour >= 17 && hour < 21 ? 'ערב טוב' : 'לילה טוב';
  // The seeded account name is a placeholder like "המאמן שלי"; the sender name holds the person's real name.
  const rawName = user?.name && !/^המאמן/.test(user.name.trim()) ? user.name : mkt.senderName;

  res.json({
    greeting,
    firstName: (rawName || '').trim().split(/\s+/)[0] || '',
    today,
    revenue,
    receivables,
    forecast,
    mrr,
    pipeline,
    topClients,
    clients: clientStats,
    meetings: { today: todayMeetings, week: weekMeetings.slice(0, 8), ...meetingStats },
    tasks: { open: openTasks.length, overdue: overdueTasks.length, week: weekTasks.slice(0, 6).map((t) => ({ id: t.id, title: t.title, dueDate: t.dueDate, clientId: t.clientId, name: t.client.fullName })) },
    projects: {
      active: openProjects.slice(0, 5),
      count: openProjects.length,
      planning: openProjects.filter((p) => p.status === 'PLANNING').length,
      budget: Math.round(openProjects.reduce((s, p) => s + (p.budget || 0), 0)),
    },
    moneyInWork: { total: sumInWork('total'), paid: sumInWork('paid'), owed: sumInWork('owed'), notCharged: sumInWork('notCharged'), clients: inWork },
    deadlines: {
      items: deadlines,
      late: deadlines.filter((x) => x.daysLeft < 0).length,
      week: deadlines.filter((x) => x.daysLeft >= 0 && x.daysLeft <= 7).length,
      month: deadlines.filter((x) => x.daysLeft > 7).length,
      undatedProjects: openProjects.filter((p) => !p.endDate).length,
      undatedTasks: openTasks.filter((t) => !t.dueDate).length,
    },
    attention: attention.slice(0, 8),
    attentionTotal: attention.length,
    marketing: { subscribers, newSubscribers, lastCampaign: lastCampaignStats },
  });
});

export default router;
