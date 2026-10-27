import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, Link } from 'react-router-dom';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';
import clsx from 'clsx';
import {
  TrendingUp, TrendingDown, Wallet, CalendarClock, Repeat, Target, AlertTriangle, Clock, Info, ArrowLeft,
  Calendar, FolderKanban, Users, Mail, CheckCircle2, Plus, Table2, BarChart3, ChevronLeft, MailOpen,
} from 'lucide-react';
import api from '../../services/api';
import { C_COLLECTED, C_EXPECTED, HBar, Legend, MonthPoint, RevenueChart, RevenueTable, Sparkline, StackedHBar, ils } from './charts';

interface Attention { kind: string; severity: 'critical' | 'warning' | 'info'; title: string; detail: string; amount?: number; href: string }
interface MeetingItem { id: string; date: string; duration: number; type: string; clientId: string; name: string }
interface DashboardData {
  greeting: string;
  firstName: string;
  revenue: { thisMonth: number; lastMonth: number; lastMonthToDate: number; ytd: number; lastYtd: number; monthly: MonthPoint[] };
  receivables: { outstanding: number; clientsOwing: number; overdueAmount: number; overdueCount: number };
  forecast: { next30: number; items: { id: string; clientId: string; name: string; amount: number; date: string; note: string | null }[] };
  mrr: { amount: number; clients: number };
  pipeline: {
    stages: { key: string; label: string; count: number; value: number }[];
    openLeadsCount: number; openLeadsValue: number; openQuotesCount: number; openQuotesValue: number;
    winRate: number | null; quoteAcceptance: number | null;
  };
  topClients: { id: string; name: string; paid: number; outstanding: number }[];
  clients: { active: number; newThisMonth: number; byType: { SESSION: number; RETAINER: number; PROJECT: number } };
  meetings: { today: MeetingItem[]; week: MeetingItem[]; thisMonth: number; lastMonth: number };
  tasks: { open: number; overdue: number; week: { id: string; title: string; dueDate: string; clientId: string; name: string }[] };
  projects: { active: { id: string; name: string; client: { id: string; fullName: string }; budget: number | null; endDate: string | null; tasksTotal: number; tasksDone: number }[]; count: number; budget: number };
  attention: Attention[];
  attentionTotal: number;
  marketing: { subscribers: number; newSubscribers: number; lastCampaign: { id: string; name: string; sentAt: string; sent: number; openRate: number; clickRate: number } | null };
}

const SEVERITY = {
  critical: { icon: AlertTriangle, label: 'דחוף', cls: 'text-red-600 bg-red-50' },
  warning: { icon: Clock, label: 'לטיפול', cls: 'text-amber-700 bg-amber-50' },
  info: { icon: Info, label: 'כדאי', cls: 'text-slate-600 bg-slate-100' },
};

function Delta({ now, before, suffix }: { now: number; before: number; suffix: string }) {
  if (before <= 0) return null;
  const pct = Math.round(((now - before) / before) * 100);
  const up = pct >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <p className={clsx('text-xs flex items-center gap-1', up ? 'text-emerald-700' : 'text-red-600')}>
      <Icon className="w-3.5 h-3.5" /> {up ? '+' : ''}{pct}% <span className="text-slate-400">{suffix}</span>
    </p>
  );
}

function Tile({ icon: Icon, label, value, sub, tone, onClick }: { icon: any; label: string; value: string; sub?: React.ReactNode; tone: string; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} className="card text-right p-5 hover:shadow-card-hover hover:-translate-y-0.5 transition-all flex flex-col justify-start">
      <div className="flex items-center gap-2 mb-3">
        <span className={clsx('w-8 h-8 rounded-lg flex items-center justify-center', tone)}><Icon className="w-4 h-4" /></span>
        <span className="text-sm text-slate-600">{label}</span>
      </div>
      <p className="text-2xl font-bold text-slate-900 leading-tight">{value}</p>
      <div className="mt-1 min-h-[16px] text-xs text-slate-400">{sub}</div>
    </button>
  );
}

function Panel({ title, icon: Icon, action, children, className }: { title: string; icon: any; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={clsx('card p-5 min-w-0', className)}>
      <div className="flex items-center justify-between mb-4 gap-2">
        <h2 className="font-semibold text-slate-900 flex items-center gap-2"><Icon className="w-4 h-4 text-slate-400" />{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

const MoreLink = ({ to, label = 'הכל' }: { to: string; label?: string }) => (
  <Link to={to} className="text-xs text-primary-600 hover:underline flex items-center gap-0.5">{label}<ChevronLeft className="w-3.5 h-3.5" /></Link>
);

// Hebrew reads '1 לקוחות' as wrong, so a count of one gets its own phrase.
const count = (n: number, one: string, many: string) => (n === 1 ? one : `${n} ${many}`);

const Empty = ({ children }: { children: React.ReactNode }) => <p className="text-sm text-slate-400 text-center py-6">{children}</p>;

function dayLabel(iso: string) {
  const d = new Date(iso);
  return format(d, 'EEEE d/M', { locale: he });
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [tableView, setTableView] = useState(false);
  const { data: d, isLoading, isError } = useQuery<DashboardData>({
    queryKey: ['dashboard'],
    queryFn: () => api.get('/dashboard').then((r) => r.data),
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" /></div>;
  }
  if (isError || !d) return <Empty>לא הצלחנו לטעון את לוח הבקרה. נסו לרענן את הדף.</Empty>;

  const currentIdx = d.revenue.monthly.findIndex((m) => m.current);
  const past12 = d.revenue.monthly.slice(0, currentIdx + 1).map((m) => m.collected);
  const stageMax = Math.max(...d.pipeline.stages.filter((s) => s.key !== 'LOST').map((s) => s.count), 1);
  const clientMax = Math.max(...d.topClients.map((c) => c.paid + c.outstanding), 1);
  const nothingThisMonth = d.revenue.thisMonth === 0 && d.forecast.next30 === 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{d.greeting}{d.firstName ? `, ${d.firstName}` : ''}</h1>
          <p className="page-subtitle">{format(new Date(), 'EEEE, d בMMMM yyyy', { locale: he })}{d.attentionTotal > 0 ? ` · ${count(d.attentionTotal, 'דבר אחד מחכה לטיפול', 'דברים מחכים לטיפול')}` : ' · הכל מטופל'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => navigate('/clients')} className="btn-secondary text-sm"><Plus className="w-4 h-4" /> לקוח</button>
          <button onClick={() => navigate('/meetings')} className="btn-secondary text-sm"><Plus className="w-4 h-4" /> פגישה</button>
          <button onClick={() => navigate('/quotes')} className="btn-secondary text-sm"><Plus className="w-4 h-4" /> הצעת מחיר</button>
          <button onClick={() => navigate('/marketing/campaigns')} className="btn-primary text-sm"><Mail className="w-4 h-4" /> דיוור</button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5 gap-4">
        <button type="button" onClick={() => navigate('/accounting')} className="card col-span-2 lg:col-span-1 lg:row-span-2 2xl:row-span-1 p-6 text-right hover:shadow-card-hover transition-all flex flex-col">
          <p className="text-sm text-slate-600 flex items-center gap-2"><Wallet className="w-4 h-4 text-slate-400" /> הכנסות החודש</p>
          <p className="text-5xl font-bold text-slate-900 mt-3 tracking-tight">{ils(d.revenue.thisMonth)}</p>
          <div className="mt-2 space-y-1">
            <Delta now={d.revenue.thisMonth} before={d.revenue.lastMonthToDate} suffix="מול התקופה המקבילה בחודש שעבר" />
            <p className="text-sm text-slate-500">מתחילת השנה <strong className="text-slate-800">{ils(d.revenue.ytd)}</strong>
              {d.revenue.lastYtd > 0 && <span className="text-xs text-slate-400"> · אשתקד {ils(d.revenue.lastYtd)}</span>}
            </p>
          </div>
          <div className="mt-auto pt-4">
            <Sparkline values={past12} currentIndex={currentIdx} w={300} h={56} className="w-full h-auto" />
            <p className="text-[11px] text-slate-400 mt-1">12 החודשים האחרונים</p>
          </div>
        </button>
        <Tile icon={AlertTriangle} label="לגבייה" value={ils(d.receivables.outstanding)} tone="bg-red-50 text-red-600"
          onClick={() => navigate('/payments')}
          sub={d.receivables.overdueAmount > 0
            ? <span className="text-red-600 font-medium">{ils(d.receivables.overdueAmount)} באיחור</span>
            : d.receivables.clientsOwing ? count(d.receivables.clientsOwing, 'לקוח אחד', 'לקוחות') : 'אין חובות פתוחים'} />
        <Tile icon={CalendarClock} label="צפוי ב-30 יום" value={ils(d.forecast.next30)} tone="bg-primary-50 text-primary-700"
          onClick={() => navigate('/payments')} sub={d.forecast.items.length ? count(d.forecast.items.length, 'תשלום אחד מתוכנן', 'תשלומים מתוכננים') : 'אין תשלומים מתוכננים'} />
        <Tile icon={Repeat} label="הכנסה חודשית קבועה" value={ils(d.mrr.amount)} tone="bg-navy-50 text-navy-700"
          onClick={() => navigate('/clients')} sub={d.mrr.clients ? count(d.mrr.clients, 'לקוח ריטיינר אחד', 'לקוחות ריטיינר') : 'עדיין אין לקוחות ריטיינר'} />
        <Tile icon={Target} label="פוטנציאל מכירות" value={ils(d.pipeline.openLeadsValue + d.pipeline.openQuotesValue)} tone="bg-blue-50 text-blue-700"
          onClick={() => navigate('/leads')} sub={`${count(d.pipeline.openLeadsCount, 'ליד אחד', 'לידים')} · ${count(d.pipeline.openQuotesCount, 'הצעה פתוחה אחת', 'הצעות פתוחות')}`} />
      </div>

      {/* Revenue + attention */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Panel title="הכנסות לפי חודש" icon={BarChart3} className="lg:col-span-2"
          action={
            <div className="flex items-center gap-4">
              <Legend items={[{ color: C_COLLECTED, label: 'נגבה' }, { color: C_EXPECTED, label: 'צפוי (תשלומים מתוכננים)' }]} />
              <button onClick={() => setTableView((v) => !v)} className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1" title={tableView ? 'הצגה כגרף' : 'הצגה כטבלה'}>
                {tableView ? <BarChart3 className="w-4 h-4" /> : <Table2 className="w-4 h-4" />}
              </button>
            </div>
          }>
          {tableView ? <div className="max-h-64 overflow-y-auto"><RevenueTable data={d.revenue.monthly} /></div> : <RevenueChart data={d.revenue.monthly} />}
          {nothingThisMonth && d.revenue.ytd > 0 && <p className="text-xs text-slate-400 mt-2">החודש עוד לא נכנסו תשלומים ואין תשלומים מתוכננים. כדאי לתזמן גבייה בכרטיסי הלקוחות.</p>}
        </Panel>

        <Panel title="דורש טיפול" icon={AlertTriangle} action={d.attentionTotal > d.attention.length ? <span className="text-xs text-slate-400">עוד {d.attentionTotal - d.attention.length}</span> : undefined}>
          {d.attention.length === 0 ? (
            <div className="text-center py-8">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
              <p className="text-sm font-medium text-slate-700">אין כרגע משהו דחוף</p>
              <p className="text-xs text-slate-400">תשלומים, הצעות וחוזים במעקב</p>
            </div>
          ) : (
            <div className="space-y-2 -mx-1">
              {d.attention.map((a, i) => {
                const s = SEVERITY[a.severity];
                return (
                  <button key={i} type="button" onClick={() => navigate(a.href)} className="w-full flex items-start gap-3 p-2.5 rounded-xl hover:bg-slate-50 text-right transition-colors">
                    <span className={clsx('flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg flex-shrink-0', s.cls)}>
                      <s.icon className="w-3.5 h-3.5" />{s.label}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium text-slate-800 truncate">{a.title}</span>
                      <span className="block text-xs text-slate-500 truncate">{a.detail}</span>
                    </span>
                    {a.amount ? <span className="text-sm font-semibold text-slate-900 tabular-nums flex-shrink-0">{ils(a.amount)}</span> : null}
                  </button>
                );
              })}
            </div>
          )}
        </Panel>
      </div>

      {/* Pipeline / top clients / upcoming collections */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Panel title="משפך מכירות" icon={Target} action={<MoreLink to="/leads" label="ללידים" />}>
          {d.pipeline.stages.every((s) => s.count === 0) ? (
            <Empty>עדיין אין לידים. הוסיפו לידים כדי לראות את המשפך.</Empty>
          ) : (
            <>
              <div className="space-y-3">
                {d.pipeline.stages.filter((s) => s.key !== 'LOST').map((s) => (
                  <HBar key={s.key} label={s.label} value={s.count} max={stageMax} right={`${s.count}`} sub={s.value ? ils(s.value) : undefined} onClick={() => navigate('/leads')} />
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3 mt-5 pt-4 border-t border-slate-100">
                <div><p className="text-xs text-slate-500">אחוז סגירה</p><p className="text-lg font-bold text-slate-900">{d.pipeline.winRate !== null ? `${d.pipeline.winRate}%` : '—'}</p></div>
                <div><p className="text-xs text-slate-500">הצעות שאושרו</p><p className="text-lg font-bold text-slate-900">{d.pipeline.quoteAcceptance !== null ? `${d.pipeline.quoteAcceptance}%` : '—'}</p></div>
              </div>
            </>
          )}
        </Panel>

        <Panel title="לקוחות מובילים" icon={Users} action={<Legend items={[{ color: C_COLLECTED, label: 'שולם' }, { color: C_EXPECTED, label: 'יתרה' }]} />}>
          {d.topClients.length === 0 ? <Empty>עדיין אין תשלומים מלקוחות</Empty> : (
            <div className="space-y-4">
              {d.topClients.map((c) => (
                <button key={c.id} type="button" onClick={() => navigate(`/clients/${c.id}`)} className="w-full text-right group">
                  <div className="flex items-baseline justify-between gap-3 mb-1">
                    <span className="text-sm text-slate-700 group-hover:text-slate-900 truncate">{c.name}</span>
                    <span className="text-sm font-semibold text-slate-900 tabular-nums">{ils(c.paid)}{c.outstanding > 0 && <span className="text-xs font-normal text-slate-500"> + {ils(c.outstanding)} פתוח</span>}</span>
                  </div>
                  <StackedHBar max={clientMax} parts={[{ value: c.paid, color: C_COLLECTED }, { value: c.outstanding, color: C_EXPECTED }]} />
                </button>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="גבייה צפויה" icon={CalendarClock} action={<MoreLink to="/payments" label="לתשלומים" />}>
          {d.forecast.items.length === 0 ? (
            <Empty>אין תשלומים מתוכננים ל-30 הימים הקרובים. אפשר לתזמן תשלום עתידי בכרטיס הלקוח ← תשלומים.</Empty>
          ) : (
            <div className="space-y-1 -mx-1">
              {d.forecast.items.map((f) => (
                <button key={f.id} type="button" onClick={() => navigate(`/clients/${f.clientId}`)} className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-50 text-right">
                  <span className="w-10 text-center flex-shrink-0">
                    <span className="block text-lg font-bold text-slate-900 leading-none">{format(new Date(f.date), 'd')}</span>
                    <span className="block text-[11px] text-slate-400">{format(new Date(f.date), 'MMM', { locale: he })}</span>
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium text-slate-800 truncate">{f.name}</span>
                    {f.note && <span className="block text-xs text-slate-400 truncate">{f.note}</span>}
                  </span>
                  <span className="text-sm font-semibold text-slate-900 tabular-nums">{ils(f.amount)}</span>
                </button>
              ))}
            </div>
          )}
        </Panel>
      </div>

      {/* Agenda / projects / clients & marketing */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Panel title="השבוע שלי" icon={Calendar} action={<MoreLink to="/calendar" label="ליומן" />}>
          <p className="text-xs font-semibold text-slate-500 mb-2">היום</p>
          {d.meetings.today.length === 0 ? <p className="text-sm text-slate-400 mb-4">אין פגישות היום</p> : (
            <div className="space-y-1 mb-4 -mx-1">
              {d.meetings.today.map((m) => (
                <button key={m.id} type="button" onClick={() => navigate(`/clients/${m.clientId}`)} className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-slate-50 text-right">
                  <span className="text-sm font-bold text-primary-700 tabular-nums w-12">{format(new Date(m.date), 'HH:mm')}</span>
                  <span className="flex-1 min-w-0 text-sm text-slate-800 truncate">{m.name}</span>
                  <span className="text-xs text-slate-400">{m.duration} דק׳</span>
                </button>
              ))}
            </div>
          )}
          <p className="text-xs font-semibold text-slate-500 mb-2">בהמשך השבוע</p>
          {d.meetings.week.length === 0 && d.tasks.week.length === 0 ? <p className="text-sm text-slate-400">השבוע פנוי</p> : (
            <div className="space-y-1 -mx-1">
              {d.meetings.week.map((m) => (
                <button key={m.id} type="button" onClick={() => navigate(`/clients/${m.clientId}`)} className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-slate-50 text-right">
                  <Calendar className="w-4 h-4 text-slate-300 flex-shrink-0" />
                  <span className="flex-1 min-w-0 text-sm text-slate-800 truncate">{m.name}</span>
                  <span className="text-xs text-slate-500">{dayLabel(m.date)} {format(new Date(m.date), 'HH:mm')}</span>
                </button>
              ))}
              {d.tasks.week.map((t) => (
                <button key={t.id} type="button" onClick={() => navigate('/tasks')} className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-slate-50 text-right">
                  <CheckCircle2 className="w-4 h-4 text-slate-300 flex-shrink-0" />
                  <span className="flex-1 min-w-0 text-sm text-slate-800 truncate">{t.title}</span>
                  <span className="text-xs text-slate-500">{dayLabel(t.dueDate)}</span>
                </button>
              ))}
            </div>
          )}
          <p className="text-xs text-slate-400 mt-4 pt-3 border-t border-slate-100">
            {count(d.meetings.thisMonth, 'פגישה אחת', 'פגישות')} החודש · {d.meetings.lastMonth} בחודש שעבר · {count(d.tasks.open, 'משימה פתוחה אחת', 'משימות פתוחות')}{d.tasks.overdue ? ` (${d.tasks.overdue} באיחור)` : ''}
          </p>
        </Panel>

        <Panel title="פרויקטים פעילים" icon={FolderKanban} action={<MoreLink to="/projects" />}>
          {d.projects.active.length === 0 ? <Empty>אין פרויקטים פעילים</Empty> : (
            <>
              <div className="space-y-4">
                {d.projects.active.map((p) => {
                  const pctDone = p.tasksTotal ? Math.round((p.tasksDone / p.tasksTotal) * 100) : 0;
                  return (
                    <button key={p.id} type="button" onClick={() => navigate(`/clients/${p.client.id}`)} className="w-full text-right group">
                      <div className="flex items-baseline justify-between gap-3 mb-1">
                        <span className="text-sm text-slate-800 group-hover:text-slate-900 truncate">{p.name} <span className="text-xs text-slate-400">· {p.client.fullName}</span></span>
                        <span className="text-xs text-slate-500 tabular-nums flex-shrink-0">{p.budget ? ils(p.budget) : ''}</span>
                      </div>
                      <div className="h-2 rounded-full bg-primary-100 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${pctDone}%`, background: C_COLLECTED }} /></div>
                      <p className="text-[11px] text-slate-400 mt-1">{p.tasksTotal ? `${p.tasksDone}/${p.tasksTotal} משימות הושלמו` : 'אין משימות בפרויקט'}{p.endDate ? ` · יעד ${format(new Date(p.endDate), 'd/M/yy')}` : ''}</p>
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-slate-400 mt-4 pt-3 border-t border-slate-100">{count(d.projects.count, 'פרויקט אחד', 'פרויקטים')} · תקציב כולל {ils(d.projects.budget)}</p>
            </>
          )}
        </Panel>

        <Panel title="לקוחות ודיוור" icon={Users}>
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={() => navigate('/clients')} className="rounded-xl bg-slate-50 p-3 text-right hover:bg-slate-100">
              <p className="text-2xl font-bold text-slate-900">{d.clients.active}</p>
              <p className="text-xs text-slate-500">לקוחות פעילים</p>
              {d.clients.newThisMonth > 0 && <p className="text-[11px] text-emerald-700 mt-0.5">+{d.clients.newThisMonth} החודש</p>}
            </button>
            <button type="button" onClick={() => navigate('/marketing/contacts')} className="rounded-xl bg-slate-50 p-3 text-right hover:bg-slate-100">
              <p className="text-2xl font-bold text-slate-900">{d.marketing.subscribers}</p>
              <p className="text-xs text-slate-500">נרשמים לדיוור</p>
              {d.marketing.newSubscribers > 0 && <p className="text-[11px] text-emerald-700 mt-0.5">+{d.marketing.newSubscribers} ב-30 יום</p>}
            </button>
          </div>
          <div className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between text-slate-600"><span>לפי פגישות</span><span className="font-medium text-slate-900">{d.clients.byType.SESSION}</span></div>
            <div className="flex justify-between text-slate-600"><span>ריטיינר חודשי</span><span className="font-medium text-slate-900">{d.clients.byType.RETAINER}</span></div>
            <div className="flex justify-between text-slate-600"><span>פרויקט</span><span className="font-medium text-slate-900">{d.clients.byType.PROJECT}</span></div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100">
            {d.marketing.lastCampaign ? (
              <Link to={`/marketing/campaigns/${d.marketing.lastCampaign.id}/report`} className="flex items-center gap-3 rounded-xl hover:bg-slate-50 -mx-1 p-1.5">
                <MailOpen className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm text-slate-800 truncate">{d.marketing.lastCampaign.name}</span>
                  <span className="block text-xs text-slate-500">נפתח {d.marketing.lastCampaign.openRate}% · הקלקות {d.marketing.lastCampaign.clickRate}%</span>
                </span>
                <ArrowLeft className="w-4 h-4 text-slate-300" />
              </Link>
            ) : (
              <Link to="/marketing/campaigns" className="text-sm text-primary-600 hover:underline flex items-center gap-1"><Mail className="w-4 h-4" /> עוד לא נשלח קמפיין. ליצירת ניוזלטר ראשון</Link>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}
