import { prisma } from '../lib/prisma';
import { asyncRouter } from '../lib/asyncRouter';
import { requireAuth, requireCoach, AuthRequest } from '../middleware/auth';
import { getMarketingSettings, statsByCampaign } from '../services/marketing';

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

const daysBetween = (from: Date, to: Date) => Math.floor((to.getTime() - from.getTime()) / DAY);

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

  const [
    user, mkt, paidRecords, unpaidRecords, payments, clients, leads, quotes, contracts,
    meetings, futureMeetingClientIds, lastMeetings, projects, openTasks, subscribers, newSubscribers, lastCampaign,
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
      select: { id: true, title: true, status: true, updatedAt: true, client: { select: { id: true, fullName: true } }, items: { select: { price: true, quantity: true } } },
    }),
    prisma.contract.findMany({
      where: { status: 'SENT' },
      select: { id: true, title: true, updatedAt: true, client: { select: { id: true, fullName: true } } },
    }),
    prisma.meeting.findMany({
      where: { date: { gte: new Date(now.getTime() - 62 * DAY), lt: in7 } },
      select: { id: true, date: true, duration: true, type: true, clientId: true, client: { select: { fullName: true } } },
      orderBy: { date: 'asc' },
    }),
    prisma.meeting.findMany({ where: { date: { gte: now } }, select: { clientId: true }, distinct: ['clientId'] }),
    prisma.meeting.groupBy({ by: ['clientId'], _max: { date: true } }),
    prisma.project.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, name: true, budget: true, endDate: true, client: { select: { id: true, fullName: true } }, tasks: { select: { status: true } } },
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.task.findMany({
      where: { status: { not: 'COMPLETED' } },
      select: { id: true, title: true, dueDate: true, clientId: true, client: { select: { fullName: true } } },
      orderBy: { dueDate: { sort: 'asc', nulls: 'last' } },
    }),
    prisma.contact.count({ where: { status: 'SUBSCRIBED' } }),
    prisma.contact.count({ where: { status: 'SUBSCRIBED', createdAt: { gte: new Date(now.getTime() - 30 * DAY) } } }),
    prisma.campaign.findFirst({ where: { kind: 'BROADCAST', status: 'SENT' }, orderBy: { sentAt: 'desc' }, select: { id: true, name: true, sentAt: true } }),
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
  const activeProjects = projects.map((p) => {
    const total = p.tasks.length;
    const done = p.tasks.filter((t) => t.status === 'COMPLETED').length;
    return { id: p.id, name: p.name, client: p.client, budget: p.budget, endDate: p.endDate, tasksTotal: total, tasksDone: done };
  });

  // ── Needs attention ───────────────────────────────────────────────────────
  type Attention = { kind: string; severity: 'critical' | 'warning' | 'info'; title: string; detail: string; amount?: number; href: string };
  const attention: Attention[] = [];
  for (const r of overdueRecords) {
    attention.push({
      kind: 'payment', severity: 'critical', amount: r.amount, href: `/clients/${r.payment.clientId}`,
      title: `תשלום באיחור · ${r.payment.client.fullName}`,
      detail: `היה אמור להיכנס לפני ${daysBetween(r.scheduledDate!, now)} ימים`,
    });
  }
  for (const p of overduePlans) {
    attention.push({
      kind: 'payment', severity: 'critical', amount: p.balance, href: `/clients/${p.clientId}`,
      title: `יתרה פתוחה · ${p.name}`, detail: `מועד התשלום עבר לפני ${daysBetween(p.nextPaymentDate!, now)} ימים`,
    });
  }
  for (const q of quotes.filter((q) => q.status === 'SENT' && daysBetween(q.updatedAt, now) >= 5)) {
    attention.push({
      kind: 'quote', severity: 'warning', amount: Math.round(quoteValue(q)) || undefined, href: '/quotes',
      title: `הצעת מחיר בלי תשובה · ${q.client.fullName}`, detail: `"${q.title}" נשלחה לפני ${daysBetween(q.updatedAt, now)} ימים. כדאי לעשות פולואפ`,
    });
  }
  for (const c of contracts.filter((c) => daysBetween(c.updatedAt, now) >= 3)) {
    attention.push({
      kind: 'contract', severity: 'warning', href: '/contracts',
      title: `חוזה לא נחתם · ${c.client.fullName}`, detail: `"${c.title}" ממתין לחתימה ${daysBetween(c.updatedAt, now)} ימים`,
    });
  }
  for (const l of leads.filter((l) => ['HOT', 'PROPOSAL'].includes(l.stage) && daysBetween(l.updatedAt, now) >= 7)) {
    attention.push({
      kind: 'lead', severity: 'warning', amount: l.estimatedValue || undefined, href: '/leads',
      title: `ליד ${l.stage === 'HOT' ? 'חם' : 'בשלב הצעה'} מתקרר · ${l.fullName}`, detail: `אין עדכון כבר ${daysBetween(l.updatedAt, now)} ימים`,
    });
  }
  if (overdueTasks.length) {
    attention.push({
      kind: 'task', severity: 'warning', href: '/tasks',
      title: `${overdueTasks.length} משימות באיחור`, detail: overdueTasks.slice(0, 2).map((t) => t.title).join(' · '),
    });
  }
  const hasFuture = new Set(futureMeetingClientIds.map((m) => m.clientId));
  const lastMeetingAt = new Map(lastMeetings.map((m) => [m.clientId, m._max.date]));
  for (const c of activeClients.filter((c) => !hasFuture.has(c.id))) {
    const last = lastMeetingAt.get(c.id);
    const days = last ? daysBetween(last, now) : null;
    if (days !== null && days < 10) continue;
    attention.push({
      kind: 'client', severity: 'info', href: `/clients/${c.id}`,
      title: `אין פגישה מתוכננת · ${c.fullName}`, detail: days === null ? 'עוד לא נקבעה פגישה ראשונה' : `הפגישה האחרונה הייתה לפני ${days} ימים`,
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
  const rawName = user?.name && user.name !== 'המאמן' ? user.name : mkt.senderName;

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
    projects: { active: activeProjects.slice(0, 5), count: activeProjects.length, budget: Math.round(activeProjects.reduce((s, p) => s + (p.budget || 0), 0)) },
    attention: attention.slice(0, 8),
    attentionTotal: attention.length,
    marketing: { subscribers, newSubscribers, lastCampaign: lastCampaignStats },
  });
});

export default router;
