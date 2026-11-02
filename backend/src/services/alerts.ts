import { prisma } from '../lib/prisma';
import { sendEmail } from '../lib/email';
import { getBaseUrl, getMarketingSettings } from './marketing';

// ── Dates (always Israel time) ──────────────────────────────────────────────

const TZ = 'Asia/Jerusalem';
const DAY = 86_400_000;
const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const timeFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
const weekdayFmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' });
const hebrewFmt = new Intl.DateTimeFormat('en-u-ca-hebrew', { timeZone: TZ, month: 'long', day: 'numeric' });

export const dayKey = (d: Date) => dayFmt.format(d);
const hhmm = (d: Date) => timeFmt.format(d).replace(/^24/, '00');
const shortDate = (d: Date) => { const [, m, day] = dayKey(d).split('-'); return `${Number(day)}/${Number(m)}`; };
// Whole calendar days from a to b, by the Israeli date.
const dayDiff = (a: Date, b: Date) => Math.round((Date.parse(dayKey(b)) - Date.parse(dayKey(a))) / DAY);
const startOfDay = (d: Date) => {
  const [h, m] = hhmm(d).split(':').map(Number);
  return new Date(d.getTime() - (h * 3600 + m * 60) * 1000 - d.getSeconds() * 1000 - d.getMilliseconds());
};

const ago = (n: number) => (n <= 0 ? 'היום' : n === 1 ? 'אתמול' : n === 2 ? 'לפני יומיים' : `לפני ${n} ימים`);
const inDays = (n: number) => (n <= 0 ? 'היום' : n === 1 ? 'מחר' : n === 2 ? 'בעוד יומיים' : `בעוד ${n} ימים`);
const forDays = (n: number) => (n <= 1 ? 'יום אחד' : n === 2 ? 'יומיים' : `${n} ימים`);
const money = (n: number) => `₪${Math.round(n).toLocaleString('he-IL')}`;

// Shabbat and Yom Tov (Israel): the civil day itself, from 15:00 on the eve until 20:30 at the end.
const YOM_TOV: Record<string, number[]> = { Tishri: [1, 2, 10, 15, 22], Nisan: [15, 21], Sivan: [6] };
function isRestDay(d: Date) {
  if (weekdayFmt.format(d) === 'Sat') return true;
  const parts = hebrewFmt.formatToParts(d);
  const month = parts.find((p) => p.type === 'month')?.value || '';
  const day = Number(parts.find((p) => p.type === 'day')?.value);
  return (YOM_TOV[month] || []).includes(day);
}
export function isQuietTime(now = new Date()) {
  const time = hhmm(now);
  if (isRestDay(now) && time < '20:30') return true;
  return isRestDay(new Date(now.getTime() + DAY)) && time >= '15:00';
}

// ── Settings ────────────────────────────────────────────────────────────────

export interface AlertSettings {
  brief: boolean;
  briefTime: string;
  email: string;
  meetingMinutes: number;
}

const SETTINGS_KEY = 'alert_settings';
const LAST_BRIEF_KEY = 'alert_last_brief';
const OWNER_ORIGIN_KEY = 'alert_owner_origin';

export async function getAlertSettings(): Promise<AlertSettings> {
  const [row, coach] = await Promise.all([
    prisma.setting.findUnique({ where: { key: SETTINGS_KEY } }),
    prisma.user.findFirst({ where: { role: 'COACH' }, select: { email: true } }),
  ]);
  const saved = row ? (JSON.parse(row.value) as Partial<AlertSettings>) : {};
  return {
    brief: saved.brief ?? true,
    briefTime: saved.briefTime ?? '07:30',
    email: saved.email || coach?.email || '',
    meetingMinutes: saved.meetingMinutes ?? 60,
  };
}

export async function saveAlertSettings(patch: Partial<AlertSettings>) {
  const current = await getAlertSettings();
  const email = String(patch.email ?? current.email).trim().toLowerCase();
  const next: AlertSettings = {
    brief: patch.brief !== undefined ? !!patch.brief : current.brief,
    briefTime: /^([01]\d|2[0-3]):[0-5]\d$/.test(String(patch.briefTime)) ? String(patch.briefTime) : current.briefTime,
    email: /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email) ? email : current.email,
    meetingMinutes: [0, 30, 60, 120].includes(Number(patch.meetingMinutes)) ? Number(patch.meetingMinutes) : current.meetingMinutes,
  };
  await prisma.setting.upsert({ where: { key: SETTINGS_KEY }, create: { key: SETTINGS_KEY, value: JSON.stringify(next) }, update: { value: JSON.stringify(next) } });
  return next;
}

// Links in the owner's emails open on the address they actually use the app from.
let ownerOrigin: string | null = null;
export async function rememberOwnerOrigin(origin: string) {
  if (!/^https:\/\//.test(origin) || origin === ownerOrigin) return;
  ownerOrigin = origin;
  await prisma.setting.upsert({ where: { key: OWNER_ORIGIN_KEY }, create: { key: OWNER_ORIGIN_KEY, value: origin }, update: { value: origin } });
}
async function appUrl() {
  if (ownerOrigin) return ownerOrigin;
  const row = await prisma.setting.findUnique({ where: { key: OWNER_ORIGIN_KEY } });
  return row?.value || getBaseUrl();
}

// ── WhatsApp drafts: open the chat with the message written, the owner presses send ──

function whatsappLink(phone: string | null | undefined, text: string) {
  let digits = String(phone || '').replace(/\D/g, '');
  if (digits.startsWith('0')) digits = `972${digits.slice(1)}`;
  if (digits.length < 11) return undefined;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
const firstName = (name: string) => name.trim().split(/\s+/)[0];

// ── What needs attention right now ──────────────────────────────────────────

export type Severity = 'critical' | 'warning' | 'info';
export interface Alert {
  key: string;
  kind: 'payment' | 'invoice' | 'task' | 'meeting' | 'quote' | 'contract' | 'lead' | 'project' | 'client';
  severity: Severity;
  title: string;
  detail: string;
  href: string;
  amount?: number;
  at?: Date;
  // Coming up, not late yet; the dashboard's "needs attention" panel leaves these out.
  soon?: boolean;
  whatsapp?: string;
  action?: { type: 'task-done' | 'payment-paid'; id: string };
}

const RANK: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };

export async function collectAlerts(now = new Date()): Promise<Alert[]> {
  const today = dayKey(now);
  const in3 = new Date(startOfDay(now).getTime() + 4 * DAY);
  const [mkt, unpaid, paidThisPeriod, payments, invoices, tasks, meetings, futureMeetings, lastMeetings, quotes, contracts, leads, activities, projects, clients, snoozed, unbilled] = await Promise.all([
    getMarketingSettings(),
    prisma.paymentRecord.findMany({
      where: { isPaid: false, scheduledDate: { not: null, lt: in3 } },
      select: { id: true, amount: true, scheduledDate: true, note: true, payment: { select: { clientId: true, client: { select: { fullName: true, phone: true } } } } },
      orderBy: { scheduledDate: 'asc' },
    }),
    prisma.paymentRecord.findMany({
      where: { OR: [{ date: { gte: new Date(now.getTime() - 32 * DAY) } }, { scheduledDate: { gte: new Date(now.getTime() - 32 * DAY) } }] },
      select: { isPaid: true, date: true, scheduledDate: true, payment: { select: { clientId: true } } },
    }),
    prisma.payment.findMany({
      where: { nextPaymentDate: { not: null, lt: in3 } },
      select: { clientId: true, totalAmount: true, paidAmount: true, nextPaymentDate: true, client: { select: { fullName: true, phone: true } } },
    }),
    prisma.invoice.findMany({
      where: { status: { in: ['SENT', 'OVERDUE'] }, dueDate: { not: null, lt: startOfDay(now) } },
      select: { id: true, number: true, dueDate: true, client: { select: { id: true, fullName: true, phone: true } }, items: { select: { price: true, quantity: true } } },
    }),
    prisma.task.findMany({
      where: { status: { not: 'COMPLETED' }, dueDate: { not: null, lt: in3 } },
      select: { id: true, title: true, dueDate: true, projectId: true, client: { select: { fullName: true } }, project: { select: { name: true } } },
      orderBy: { dueDate: 'asc' },
    }),
    prisma.meeting.findMany({
      where: { date: { gte: now, lt: new Date(startOfDay(now).getTime() + DAY) } },
      select: { id: true, date: true, type: true, clientId: true, client: { select: { fullName: true } } },
      orderBy: { date: 'asc' },
    }),
    prisma.meeting.findMany({ where: { date: { gte: now } }, select: { clientId: true }, distinct: ['clientId'] }),
    prisma.meeting.groupBy({ by: ['clientId'], _max: { date: true } }),
    prisma.quote.findMany({
      where: { status: 'SENT' },
      select: { id: true, title: true, updatedAt: true, validUntil: true, client: { select: { fullName: true, phone: true } }, items: { select: { price: true, quantity: true } } },
    }),
    prisma.contract.findMany({
      where: { status: { in: ['SENT', 'SIGNED'] } },
      select: { id: true, title: true, status: true, updatedAt: true, validUntil: true, client: { select: { fullName: true } } },
    }),
    prisma.lead.findMany({
      where: { stage: { notIn: ['WON', 'LOST'] } },
      select: { id: true, fullName: true, phone: true, stage: true, estimatedValue: true, createdAt: true, updatedAt: true, _count: { select: { activities: true } } },
    }),
    prisma.leadActivity.findMany({
      where: { done: false, dueDate: { not: null, lt: new Date(startOfDay(now).getTime() + DAY) }, lead: { stage: { notIn: ['WON', 'LOST'] } } },
      select: { id: true, notes: true, dueDate: true, lead: { select: { fullName: true, phone: true } } },
    }),
    prisma.project.findMany({
      where: { status: { in: ['PLANNING', 'ACTIVE'] } },
      select: { id: true, name: true, status: true, startDate: true, endDate: true, client: { select: { fullName: true } }, tasks: { select: { status: true, dueDate: true } } },
    }),
    prisma.client.findMany({ where: { status: 'ACTIVE' }, select: { id: true, fullName: true, clientType: true, monthlyFee: true, phone: true, startDate: true } }),
    prisma.alertSnooze.findMany({ where: { until: { gt: now } }, select: { key: true } }),
    prisma.meeting.findMany({
      where: { chargeStatus: null, date: { lte: now }, client: { status: 'ACTIVE', clientType: 'SESSION', sessionPrice: { not: null } } },
      select: { clientId: true, client: { select: { fullName: true } } },
    }),
  ]);

  const signature = mkt.senderName ? firstName(mkt.senderName) : '';
  const paymentNudge = (name: string, amount: number, when: Date) =>
    `שלום ${firstName(name)}, תזכורת קטנה לגבי התשלום על סך ${money(amount)} שנקבע ל-${shortDate(when)}. אשמח לעדכון מתי הוא יוסדר. תודה, ${signature}`;

  const alerts: Alert[] = [];

  // Scheduled payments
  const clientsWithRecords = new Set(unpaid.map((r) => r.payment.clientId));
  for (const r of unpaid) {
    const when = r.scheduledDate!;
    const late = dayDiff(when, now);
    const { clientId, client } = r.payment;
    const base = {
      kind: 'payment' as const, key: `payment:${r.id}`, amount: r.amount, href: `/clients/${clientId}`, at: when,
      action: { type: 'payment-paid' as const, id: r.id },
    };
    if (late > 0) {
      alerts.push({ ...base, severity: 'critical', title: `תשלום באיחור · ${client.fullName}`, detail: `היה אמור להיכנס ${ago(late)}${r.note ? ` · ${r.note}` : ''}`, whatsapp: whatsappLink(client.phone, paymentNudge(client.fullName, r.amount, when)) });
    } else if (late === 0) {
      alerts.push({ ...base, severity: 'warning', soon: true, title: `תשלום להיום · ${client.fullName}`, detail: r.note || 'אמור להיכנס היום' });
    } else {
      alerts.push({ ...base, severity: 'info', soon: true, title: `תשלום ${inDays(-late)} · ${client.fullName}`, detail: `${shortDate(when)}${r.note ? ` · ${r.note}` : ''}` });
    }
  }

  // Payment plans with a next-payment date and no scheduled record behind it
  for (const p of payments) {
    const balance = p.totalAmount - p.paidAmount;
    if (balance <= 0.5 || clientsWithRecords.has(p.clientId)) continue;
    const when = p.nextPaymentDate!;
    const late = dayDiff(when, now);
    const base = { kind: 'payment' as const, key: `plan:${p.clientId}`, amount: balance, href: `/clients/${p.clientId}`, at: when };
    if (late > 0) {
      alerts.push({ ...base, severity: 'critical', title: `יתרה פתוחה · ${p.client.fullName}`, detail: `מועד התשלום עבר ${ago(late)}`, whatsapp: whatsappLink(p.client.phone, paymentNudge(p.client.fullName, balance, when)) });
    } else {
      alerts.push({ ...base, severity: late === 0 ? 'warning' : 'info', soon: true, title: `יתרה לתשלום ${inDays(-late)} · ${p.client.fullName}`, detail: shortDate(when) });
    }
  }

  // Retainers: from the 10th, flag a month with no payment recorded or scheduled
  const dayOfMonth = Number(today.slice(8));
  if (dayOfMonth >= 10) {
    const month = today.slice(0, 7);
    const covered = new Set(paidThisPeriod.filter((r) => dayKey(r.isPaid ? r.date : r.scheduledDate || r.date).startsWith(month)).map((r) => r.payment.clientId));
    for (const c of clients) {
      if (c.clientType !== 'RETAINER' || !c.monthlyFee || covered.has(c.id) || clientsWithRecords.has(c.id)) continue;
      if (dayKey(c.startDate).startsWith(month)) continue;
      alerts.push({
        kind: 'payment', key: `retainer:${c.id}:${month}`, severity: 'warning', amount: c.monthlyFee, href: `/clients/${c.id}`,
        title: `ריטיינר בלי תשלום החודש · ${c.fullName}`, detail: 'לא נרשם ולא תוזמן תשלום לחודש הזה',
      });
    }
  }

  // Meetings that took place and were neither charged nor marked free
  const unbilledByClient = new Map<string, { name: string; count: number }>();
  for (const m of unbilled) {
    const row = unbilledByClient.get(m.clientId) || { name: m.client.fullName, count: 0 };
    row.count++;
    unbilledByClient.set(m.clientId, row);
  }
  for (const [clientId, { name, count: n }] of unbilledByClient) {
    alerts.push({
      kind: 'payment', key: `unbilled:${clientId}:${n}`, severity: 'warning', href: `/clients/${clientId}`,
      title: `${n === 1 ? 'פגישה שעוד לא חויבה' : `${n} פגישות שעוד לא חויבו`} · ${name}`, detail: 'בדף הלקוח בוחרים אם לחייב',
    });
  }

  // Invoices past due
  for (const i of invoices) {
    alerts.push({
      kind: 'invoice', key: `invoice:${i.id}`, severity: 'critical', href: '/accounting', at: i.dueDate!,
      amount: i.items.reduce((s, x) => s + x.price * x.quantity, 0) || undefined,
      title: `חשבונית ${i.number} לא שולמה · ${i.client.fullName}`, detail: `מועד התשלום עבר ${ago(dayDiff(i.dueDate!, now))}`,
    });
  }

  // Tasks
  for (const t of tasks) {
    const late = dayDiff(t.dueDate!, now);
    const where = t.project ? `${t.client.fullName} · ${t.project.name}` : t.client.fullName;
    const base = { kind: 'task' as const, key: `task:${t.id}`, href: t.projectId ? `/projects?open=${t.projectId}` : '/tasks', at: t.dueDate!, action: { type: 'task-done' as const, id: t.id } };
    if (late > 0) alerts.push({ ...base, severity: 'warning', title: `משימה באיחור · ${t.title.trim()}`, detail: `${where} · הייתה לתאריך ${shortDate(t.dueDate!)}` });
    else if (late === 0) alerts.push({ ...base, severity: 'warning', soon: true, title: `משימה להיום · ${t.title.trim()}`, detail: where });
    else alerts.push({ ...base, severity: 'info', soon: true, title: `משימה ${late === -1 ? 'למחר' : inDays(-late)} · ${t.title.trim()}`, detail: `${where} · ${shortDate(t.dueDate!)}` });
  }

  // Meetings left today
  for (const m of meetings) {
    alerts.push({
      kind: 'meeting', key: `meeting:${m.id}`, severity: 'info', soon: true, href: `/clients/${m.clientId}`, at: m.date,
      title: `פגישה היום ב-${hhmm(m.date)} · ${m.client.fullName}`, detail: m.type,
    });
  }

  // Quotes
  for (const q of quotes) {
    const silent = dayDiff(q.updatedAt, now);
    const amount = Math.round(q.items.reduce((s, x) => s + x.price * x.quantity, 0)) || undefined;
    const left = q.validUntil ? dayDiff(now, q.validUntil) : null;
    if (left !== null && left >= 0 && left <= 3) {
      alerts.push({ kind: 'quote', key: `quote-end:${q.id}`, severity: 'warning', amount, href: '/quotes', title: `הצעת מחיר פגה ${inDays(left)} · ${q.client.fullName}`, detail: `"${q.title}"`, whatsapp: whatsappLink(q.client.phone, `שלום ${firstName(q.client.fullName)}, רציתי לבדוק מה חשבת על ההצעה ששלחתי. היא בתוקף עד ${shortDate(q.validUntil!)}. תודה, ${signature}`) });
    } else if (silent >= 5) {
      alerts.push({ kind: 'quote', key: `quote:${q.id}`, severity: 'warning', amount, href: '/quotes', title: `הצעת מחיר בלי תשובה · ${q.client.fullName}`, detail: `"${q.title}" נשלחה ${ago(silent)}. כדאי לעשות פולואפ`, whatsapp: whatsappLink(q.client.phone, `שלום ${firstName(q.client.fullName)}, רציתי לבדוק מה חשבת על ההצעה ששלחתי. תודה, ${signature}`) });
    }
  }

  // Contracts
  for (const c of contracts) {
    if (c.status === 'SENT') {
      const waiting = dayDiff(c.updatedAt, now);
      if (waiting >= 3) alerts.push({ kind: 'contract', key: `contract:${c.id}`, severity: 'warning', href: '/contracts', title: `חוזה לא נחתם · ${c.client.fullName}`, detail: `"${c.title}" ממתין לחתימה ${forDays(waiting)}` });
    } else if (c.validUntil) {
      const left = dayDiff(now, c.validUntil);
      if (left >= 0 && left <= 30) alerts.push({ kind: 'contract', key: `contract-end:${c.id}`, severity: left <= 7 ? 'warning' : 'info', href: '/contracts', title: `חוזה מסתיים ${inDays(left)} · ${c.client.fullName}`, detail: `"${c.title}". זה הזמן לדבר על המשך` });
    }
  }

  // Leads
  for (const l of leads) {
    const quiet = dayDiff(l.updatedAt, now);
    if ((l.stage === 'HOT' || l.stage === 'PROPOSAL') && quiet >= 7) {
      alerts.push({ kind: 'lead', key: `lead:${l.id}`, severity: 'warning', amount: l.estimatedValue || undefined, href: '/leads', title: `ליד ${l.stage === 'HOT' ? 'חם' : 'בשלב הצעה'} מתקרר · ${l.fullName}`, detail: `אין עדכון כבר ${forDays(quiet)}` });
    } else if (l._count.activities === 0 && quiet >= 2 && dayDiff(l.createdAt, now) <= 14) {
      alerts.push({ kind: 'lead', key: `lead-new:${l.id}`, severity: 'warning', amount: l.estimatedValue || undefined, href: '/leads', title: `ליד חדש בלי טיפול · ${l.fullName}`, detail: `נכנס ${ago(dayDiff(l.createdAt, now))} ועוד לא נרשם שדיברתם`, whatsapp: whatsappLink(l.phone, `שלום ${firstName(l.fullName)}, כאן ${signature}. קיבלתי את הפנייה שלך ואשמח לדבר.`) });
    }
  }
  for (const a of activities) {
    const late = dayDiff(a.dueDate!, now);
    alerts.push({ kind: 'lead', key: `activity:${a.id}`, severity: 'warning', soon: late === 0, href: '/leads', at: a.dueDate!, title: `${late > 0 ? 'מעקב ליד באיחור' : 'מעקב ליד להיום'} · ${a.lead.fullName}`, detail: a.notes.slice(0, 90) });
  }

  // Projects: reminders grow stronger as the end date comes closer. The key changes with each stage,
  // so snoozing an early reminder never hides a later, more urgent one.
  for (const p of projects) {
    const href = `/projects?open=${p.id}`;
    const total = p.tasks.length;
    const done = p.tasks.filter((t) => t.status === 'COMPLETED').length;
    const open = total - done;
    const left = p.endDate ? dayDiff(now, p.endDate) : null;
    const progress = !total ? 'עדיין אין בו משימות' : open === 0 ? 'כל המשימות הושלמו. אפשר לסמן אותו כהושלם' : `${count(open, 'נשארה משימה אחת פתוחה', 'משימות פתוחות')} מתוך ${total}`;
    const base = { kind: 'project' as const, href, at: p.endDate ?? undefined };

    if (p.status === 'PLANNING' && p.startDate) {
      const toStart = dayDiff(now, p.startDate);
      if (toStart < 0) alerts.push({ kind: 'project', href, key: `project-start:${p.id}`, severity: 'warning', title: `פרויקט היה אמור להתחיל · ${p.name}`, detail: `${p.client.fullName} · מועד ההתחלה היה ${shortDate(p.startDate)}, והוא עדיין מסומן בתכנון` });
      else if (toStart <= 3) alerts.push({ kind: 'project', href, key: `project-start:${p.id}`, severity: toStart === 0 ? 'warning' : 'info', soon: true, title: `פרויקט מתחיל ${inDays(toStart)} · ${p.name}`, detail: `${p.client.fullName} · ${shortDate(p.startDate)}` });
    }

    if (left !== null) {
      const who = `${p.client.fullName} · ${progress}`;
      if (left < 0) alerts.push({ ...base, key: `project-end:${p.id}:late`, severity: 'critical', title: `פרויקט עבר את תאריך הסיום · ${p.name}`, detail: `היה אמור להסתיים ${ago(-left)} (${shortDate(p.endDate!)}) · ${who}` });
      else if (left <= 2) alerts.push({ ...base, key: `project-end:${p.id}:${left}`, severity: 'critical', title: `פרויקט מסתיים ${inDays(left)} · ${p.name}`, detail: who });
      else if (left <= 7) alerts.push({ ...base, key: `project-end:${p.id}:week`, severity: 'warning', title: `פרויקט מסתיים ${inDays(left)} · ${p.name}`, detail: who });
      else if (left <= 14) alerts.push({ ...base, key: `project-end:${p.id}:two-weeks`, severity: 'info', soon: true, title: `פרויקט מסתיים ${inDays(left)} · ${p.name}`, detail: who });
    }

    // More of the time has gone than of the work: say so while there is still time to catch up.
    if (p.startDate && p.endDate && left !== null && left > 7 && total > 0) {
      const span = dayDiff(p.startDate, p.endDate);
      const timePct = span > 0 ? Math.round((dayDiff(p.startDate, now) / span) * 100) : 0;
      const workPct = Math.round((done / total) * 100);
      if (timePct >= 25 && timePct - workPct >= 25) {
        alerts.push({ ...base, key: `project-behind:${p.id}`, severity: 'warning', title: `פרויקט מאחור בלוח הזמנים · ${p.name}`, detail: `${p.client.fullName} · עברו ${timePct}% מהזמן והושלמו ${workPct}% מהמשימות` });
      }
    }

    // With no end date there is nothing to remind about, so the project asks for one.
    if (left === null) {
      alerts.push({ kind: 'project', href, key: `project-no-end:${p.id}`, severity: 'info', title: `פרויקט בלי תאריך סיום · ${p.name}`, detail: `${p.client.fullName} · בלי תאריך סיום אין תזכורות. קובעים אותו בעריכת הפרויקט` });
    }

    // A task with no date gets no reminder, so the project asks for one.
    const undated = p.tasks.filter((t) => t.status !== 'COMPLETED' && !t.dueDate).length;
    if (p.endDate && undated > 0) {
      alerts.push({ kind: 'project', href, key: `project-undated:${p.id}:${undated}`, severity: 'info', title: `${undated === 1 ? 'משימה בלי תאריך' : `${undated} משימות בלי תאריך`} · ${p.name}`, detail: 'בלי תאריך אין תזכורת. כדאי לקבוע לכל משימה מתי היא צריכה להסתיים' });
    }
  }

  // Active clients with nothing on the calendar
  const hasFuture = new Set(futureMeetings.map((m) => m.clientId));
  const lastAt = new Map(lastMeetings.map((m) => [m.clientId, m._max.date]));
  for (const c of clients) {
    if (hasFuture.has(c.id)) continue;
    const last = lastAt.get(c.id);
    const days = last ? dayDiff(last, now) : null;
    if (days !== null && days < 10) continue;
    alerts.push({ kind: 'client', key: `client:${c.id}`, severity: 'info', href: `/clients/${c.id}`, title: `אין פגישה מתוכננת · ${c.fullName}`, detail: days === null ? 'עוד לא נקבעה פגישה ראשונה' : `הפגישה האחרונה הייתה ${ago(days)}` });
  }

  const hidden = new Set(snoozed.map((s) => s.key));
  return alerts
    .filter((a) => !hidden.has(a.key))
    .sort((a, b) => RANK[a.severity] - RANK[b.severity] || (b.amount || 0) - (a.amount || 0));
}

export async function snoozeAlert(key: string, days: number, now = new Date()) {
  const until = new Date(startOfDay(now).getTime() + Math.max(1, Math.min(30, days)) * DAY);
  await prisma.alertSnooze.upsert({ where: { key }, create: { key, until }, update: { until } });
  await prisma.alertSnooze.deleteMany({ where: { until: { lt: now } } });
  return until;
}

// ── Emails to the owner ─────────────────────────────────────────────────────

const NAVY = '#0a1e3c';
const TEAL = '#007f91';
const SENDER_NAME = 'המערכת שלי';
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const count = (n: number, one: string, many: string) => (n === 1 ? one : `${n} ${many}`);

const frame = (title: string, intro: string, body: string, cta: { href: string; label: string }) => `<!doctype html><html lang="he" dir="rtl"><body style="margin:0;padding:0;background:#f1f5f9;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;"><tr><td align="center" style="padding:20px 10px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" dir="rtl" style="max-width:600px;background:#ffffff;border-radius:14px;font-family:Arial,Helvetica,sans-serif;color:#1e293b;">
<tr><td style="background:${NAVY};border-radius:14px 14px 0 0;padding:22px 24px;text-align:right;">
<div style="font-size:21px;font-weight:700;color:#ffffff;">${esc(title)}</div>
<div style="font-size:14px;color:#a5d8e0;margin-top:5px;line-height:1.5;">${esc(intro)}</div></td></tr>
${body}
<tr><td style="padding:18px 24px 24px;text-align:center;">
<a href="${esc(cta.href)}" style="display:inline-block;background:${TEAL};color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:12px 26px;border-radius:10px;">${esc(cta.label)}</a>
<div style="font-size:12px;color:#94a3b8;margin-top:14px;">את השעה ואת סוגי התזכורות משנים בדף ההתראות במערכת.</div></td></tr>
</table></td></tr></table></body></html>`;

const section = (title: string, rows: string) => (rows
  ? `<tr><td style="padding:20px 24px 2px;text-align:right;font-size:13px;font-weight:700;color:${TEAL};">${esc(title)}</td></tr><tr><td style="padding:0 24px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table></td></tr>`
  : '');

function row(a: Alert, base: string) {
  const links = [
    `<a href="${esc(base)}${esc(a.href)}" style="color:${TEAL};text-decoration:none;font-weight:700;">פתיחה</a>`,
    a.whatsapp ? `<a href="${esc(a.whatsapp)}" style="color:#15803d;text-decoration:none;font-weight:700;">הודעה מוכנה בוואטסאפ</a>` : '',
  ].filter(Boolean).join(' &nbsp;·&nbsp; ');
  return `<tr><td style="padding:11px 0;border-bottom:1px solid #e2e8f0;text-align:right;">
<div style="font-size:15px;font-weight:700;color:#0f172a;">${esc(a.title)}${a.amount ? ` <span style="color:${a.severity === 'critical' ? '#b91c1c' : '#334155'};white-space:nowrap;">${money(a.amount)}</span>` : ''}</div>
<div style="font-size:13px;color:#64748b;margin-top:3px;line-height:1.45;">${esc(a.detail)}</div>
<div style="font-size:13px;margin-top:5px;">${links}</div></td></tr>`;
}

export async function buildBrief(now = new Date()) {
  const [alerts, mkt, base, allMeetings, collected, newLeads, newContacts] = await Promise.all([
    collectAlerts(now),
    getMarketingSettings(),
    appUrl(),
    prisma.meeting.findMany({
      where: { date: { gte: startOfDay(now), lt: new Date(startOfDay(now).getTime() + DAY) } },
      select: { date: true, type: true, clientId: true, client: { select: { fullName: true } } },
      orderBy: { date: 'asc' },
    }),
    prisma.paymentRecord.aggregate({ where: { isPaid: true, date: { gte: new Date(startOfDay(now).getTime() - DAY), lt: startOfDay(now) } }, _sum: { amount: true } }),
    prisma.lead.count({ where: { createdAt: { gte: new Date(startOfDay(now).getTime() - DAY), lt: startOfDay(now) } } }),
    prisma.contact.count({ where: { createdAt: { gte: new Date(startOfDay(now).getTime() - DAY), lt: startOfDay(now) } } }),
  ]);

  const moneyAlerts = alerts.filter((a) => a.kind === 'payment' || a.kind === 'invoice');
  const late = moneyAlerts.filter((a) => a.severity === 'critical');
  const tasks = alerts.filter((a) => a.kind === 'task');
  const lateTasks = tasks.filter((a) => !a.soon);
  const todayTasks = tasks.filter((a) => a.soon && a.severity === 'warning');
  const followUps = alerts.filter((a) => ['quote', 'contract', 'lead'].includes(a.kind));
  const projectAlerts = alerts.filter((a) => a.kind === 'project');
  const urgentProjects = projectAlerts.filter((a) => a.severity === 'critical');
  const lateSum = late.reduce((s, a) => s + (a.amount || 0), 0);

  const parts = [
    late.length ? `${count(late.length, 'תשלום אחד באיחור', 'תשלומים באיחור')}${lateSum ? ` (${money(lateSum)})` : ''}` : '',
    allMeetings.length ? count(allMeetings.length, 'פגישה אחת היום', 'פגישות היום') : '',
    lateTasks.length + todayTasks.length ? count(lateTasks.length + todayTasks.length, 'משימה אחת לטפל בה', 'משימות לטפל בהן') : '',
    urgentProjects.length ? count(urgentProjects.length, 'פרויקט אחד דחוף', 'פרויקטים דחופים') : '',
    !late.length && followUps.length ? count(followUps.length, 'דבר אחד למעקב', 'דברים למעקב') : '',
  ].filter(Boolean);

  const name = firstName(mkt.senderName || '');
  const title = `בוקר טוב${name ? ` ${name}` : ''}`;
  const intro = parts.length ? `היום אצלך: ${parts.join(', ')}.` : 'היום נקי. אין תשלומים, משימות או פגישות שמחכים לך.';
  const subject = `${title}: ${parts.length ? parts.slice(0, 2).join(', ') : 'היום נקי'}`;

  const meetingRows = allMeetings.map((m) => `<tr><td style="padding:10px 0;border-bottom:1px solid #e2e8f0;text-align:right;font-size:15px;"><b>${hhmm(m.date)}</b> &nbsp;<a href="${esc(base)}/clients/${esc(m.clientId)}" style="color:#0f172a;text-decoration:none;font-weight:700;">${esc(m.client.fullName)}</a> <span style="color:#64748b;font-size:13px;">· ${esc(m.type)}</span></td></tr>`).join('');
  const news = [
    collected._sum.amount ? `נכנסו ${money(collected._sum.amount)}` : '',
    newLeads ? count(newLeads, 'ליד חדש', 'לידים חדשים') : '',
    newContacts ? count(newContacts, 'נרשם חדש לדיוור', 'נרשמים חדשים לדיוור') : '',
  ].filter(Boolean);

  const rows = (list: Alert[], max: number) => list.slice(0, max).map((a) => row(a, base)).join('');
  const more = (list: Alert[], max: number) => (list.length > max ? `<tr><td style="padding:9px 0;font-size:13px;color:#64748b;text-align:right;">ועוד ${list.length - max} בדף ההתראות</td></tr>` : '');
  const body = [
    section('פגישות היום', meetingRows),
    section('תשלומים', rows(moneyAlerts, 8) + more(moneyAlerts, 8)),
    section('משימות', rows(tasks, 8) + more(tasks, 8)),
    section('פרויקטים', rows(projectAlerts, 6) + more(projectAlerts, 6)),
    section('למעקב', rows(followUps, 6) + more(followUps, 6)),
    news.length ? `<tr><td style="padding:20px 24px 0;"><div style="background:#ecfdf5;border-radius:10px;padding:12px 14px;font-size:14px;color:#065f46;text-align:right;"><b>מאתמול:</b> ${esc(news.join(' · '))}</div></td></tr>` : '',
  ].join('');

  return { subject, html: frame(title, intro, body, { href: `${base}/alerts`, label: 'לכל ההתראות במערכת' }), alerts };
}

export async function sendBrief(now = new Date()) {
  const settings = await getAlertSettings();
  const brief = await buildBrief(now);
  await sendEmail(settings.email, brief.subject, brief.html, [], { fromName: SENDER_NAME });
  return { to: settings.email, subject: brief.subject };
}

async function sendMeetingHeadsUp(meeting: { id: string; date: Date; type: string; notes: string | null; clientId: string; client: { fullName: string; phone: string | null } }, settings: AlertSettings) {
  const base = await appUrl();
  const [openTasks, payment] = await Promise.all([
    prisma.task.findMany({ where: { clientId: meeting.clientId, status: { not: 'COMPLETED' } }, select: { title: true }, orderBy: { dueDate: { sort: 'asc', nulls: 'last' } }, take: 5 }),
    prisma.payment.findFirst({ where: { clientId: meeting.clientId }, select: { totalAmount: true, paidAmount: true } }),
  ]);
  const balance = payment ? payment.totalAmount - payment.paidAmount : 0;
  const line = (label: string, value: string) => `<tr><td style="padding:9px 0;border-bottom:1px solid #e2e8f0;text-align:right;font-size:14px;"><span style="color:#64748b;">${esc(label)}:</span> <b>${value}</b></td></tr>`;
  const rows = [
    line('סוג הפגישה', esc(meeting.type)),
    meeting.client.phone ? line('טלפון', `<a href="tel:${esc(meeting.client.phone)}" style="color:${TEAL};text-decoration:none;" dir="ltr">${esc(meeting.client.phone)}</a>`) : '',
    meeting.notes ? line('הערות', esc(meeting.notes)) : '',
    balance > 0.5 ? line('יתרה לתשלום', money(balance)) : '',
    openTasks.length ? line('משימות פתוחות', esc(openTasks.map((t) => t.title.trim()).join(' · '))) : '',
  ].join('');
  const title = `פגישה ב-${hhmm(meeting.date)} עם ${meeting.client.fullName}`;
  const html = frame(title, 'כמה פרטים שיעזרו לך להגיע מוכן.', section('לפני הפגישה', rows), { href: `${base}/clients/${meeting.clientId}`, label: 'לכרטיס הלקוח' });
  await sendEmail(settings.email, title, html, [], { fromName: SENDER_NAME });
}

// ── The clock: one tick a minute, safe across restarts and deploys ──────────

const RETRY_MS = 15 * 60_000;
const minutes = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
let lastBriefAttempt = 0;
let ticking = false;

export async function alertsTick(now = new Date()) {
  if (ticking) return;
  ticking = true;
  try {
    if (isQuietTime(now)) return;
    const settings = await getAlertSettings();

    // Morning brief: sent once, and caught up for four hours if the server was down at the set time.
    const sinceSet = minutes(hhmm(now)) - minutes(settings.briefTime);
    if (settings.brief && sinceSet >= 0 && sinceSet < 240 && Date.now() - lastBriefAttempt > RETRY_MS) {
      const today = dayKey(now);
      const last = await prisma.setting.findUnique({ where: { key: LAST_BRIEF_KEY } });
      if (last?.value !== today) {
        lastBriefAttempt = Date.now();
        const sent = await sendBrief(now);
        await prisma.setting.upsert({ where: { key: LAST_BRIEF_KEY }, create: { key: LAST_BRIEF_KEY, value: today }, update: { value: today } });
        console.log('[ALERTS] Morning brief sent:', sent.subject);
      }
    }

    // Heads-up before each meeting.
    if (settings.meetingMinutes > 0) {
      const meetings = await prisma.meeting.findMany({
        where: { date: { gt: now, lte: new Date(now.getTime() + settings.meetingMinutes * 60_000) } },
        select: { id: true, date: true, type: true, notes: true, clientId: true, client: { select: { fullName: true, phone: true } } },
      });
      for (const m of meetings) {
        const key = `meeting:${m.id}:${m.date.getTime()}`;
        const { count: fresh } = await prisma.alertSent.createMany({ data: [{ key }], skipDuplicates: true });
        if (!fresh) continue;
        await sendMeetingHeadsUp(m, settings).catch(async (e) => {
          await prisma.alertSent.deleteMany({ where: { key } });
          throw e;
        });
      }
    }
  } catch (e: any) {
    console.error('[ALERTS] tick failed:', e?.message || e);
  } finally {
    ticking = false;
  }
}
