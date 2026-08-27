import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Users, Calendar, CheckSquare, CreditCard,
  AlertCircle, Clock, TrendingUp, ArrowLeft, Sheet, ExternalLink,
  FolderKanban, FileText, FileSignature, ChevronRight,
} from 'lucide-react';
import api from '../services/api';
import { DashboardData } from '../types';
import { format, isToday, isTomorrow } from 'date-fns';
import { he } from 'date-fns/locale';
import clsx from 'clsx';
import toast from 'react-hot-toast';

function StatCard({ icon: Icon, label, value, sub, color, onClick }: any) {
  return (
    <div onClick={onClick} className={clsx('stat-card', onClick && 'cursor-pointer hover:shadow-card-hover')}>
      <div className={clsx('stat-icon', color)}>
        <Icon className="w-6 h-6" />
      </div>
      <div>
        <p className="text-2xl font-bold text-slate-900">{value}</p>
        <p className="text-sm text-slate-500 mt-0.5">{label}</p>
        {sub != null && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function SectionHeader({ icon: Icon, title, color, linkTo, onNav }: any) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="font-semibold text-slate-900 flex items-center gap-2">
        <Icon className={clsx('w-4 h-4', color)} />
        {title}
      </h2>
      {linkTo && (
        <button onClick={() => onNav(linkTo)} className="text-xs text-primary-600 hover:underline flex items-center gap-1">
          הכל <ArrowLeft className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  if (isToday(d)) return `היום ${format(d, 'HH:mm')}`;
  if (isTomorrow(d)) return `מחר ${format(d, 'HH:mm')}`;
  return format(d, "d בMMM, HH:mm", { locale: he });
}

const statusLabelQ: Record<string, string> = { DRAFT: 'טיוטה', SENT: 'נשלח', ACCEPTED: 'אושר', REJECTED: 'נדחה' };
const statusColorQ: Record<string, string> = { DRAFT: 'bg-gray-100 text-gray-600', SENT: 'bg-blue-100 text-blue-700', ACCEPTED: 'bg-green-100 text-green-700', REJECTED: 'bg-red-100 text-red-700' };
const statusLabelC: Record<string, string> = { DRAFT: 'טיוטה', SENT: 'נשלח', SIGNED: 'חתום', EXPIRED: 'פג תוקף' };
const statusColorC: Record<string, string> = { DRAFT: 'bg-gray-100 text-gray-600', SENT: 'bg-blue-100 text-blue-700', SIGNED: 'bg-green-100 text-green-700', EXPIRED: 'bg-red-100 text-red-700' };

export default function Dashboard() {
  const navigate = useNavigate();
  const [backingUp, setBackingUp] = useState(false);
  const [backupUrl, setBackupUrl] = useState<string | null>(null);

  const runBackup = async () => {
    setBackingUp(true);
    try {
      const { data } = await api.post('/backup/sheets');
      setBackupUrl(data.url);
      toast.success('גיבוי הושלם בהצלחה!');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'שגיאה בגיבוי');
    } finally {
      setBackingUp(false);
    }
  };

  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ['dashboard'],
    queryFn: () => api.get('/dashboard').then(r => r.data),
    refetchInterval: 60000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const d = data!;
  const overduePayments = d?.pendingPayments?.filter(p => p.paidAmount < p.totalAmount) ?? [];
  const activeProjects = (d as any)?.activeProjects ?? [];
  const openQuotes = (d as any)?.openQuotes ?? [];
  const pendingContracts = (d as any)?.pendingContracts ?? [];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title">לוח בקרה</h1>
          <p className="page-subtitle">{format(new Date(), "EEEE, d בMMMM yyyy", { locale: he })}</p>
        </div>
        <div className="flex items-center gap-2">
          {backupUrl && (
            <a href={backupUrl} target="_blank" rel="noreferrer"
              className="btn-secondary text-xs flex items-center gap-1">
              <ExternalLink className="w-3.5 h-3.5" /> פתח גיליון
            </a>
          )}
          <button onClick={runBackup} disabled={backingUp}
            className="btn-secondary text-xs flex items-center gap-1.5">
            <Sheet className="w-3.5 h-3.5 text-emerald-600" />
            {backingUp ? 'מגבה...' : 'גיבוי ל-Google Sheets'}
          </button>
        </div>
      </div>

      {/* Stats row — 6 cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard
          icon={Users} label="לקוחות פעילים" value={d?.activeClients ?? 0}
          color="bg-gradient-to-br from-purple-500 to-pink-500 text-white shadow-lg shadow-purple-200"
          onClick={() => navigate('/clients')}
        />
        <StatCard
          icon={Calendar} label="פגישות היום" value={d?.todayMeetings?.length ?? 0}
          color="bg-gradient-to-br from-emerald-400 to-teal-500 text-white shadow-lg shadow-emerald-200"
          onClick={() => navigate('/meetings')}
        />
        <StatCard
          icon={FolderKanban} label="פרויקטים פעילים" value={activeProjects.length}
          color="bg-gradient-to-br from-blue-500 to-indigo-500 text-white shadow-lg shadow-blue-200"
          onClick={() => navigate('/projects')}
        />
        <StatCard
          icon={FileText} label="הצעות פתוחות" value={openQuotes.length}
          color="bg-gradient-to-br from-amber-400 to-orange-400 text-white shadow-lg shadow-amber-200"
          onClick={() => navigate('/quotes')}
        />
        <StatCard
          icon={FileSignature} label="חוזים ממתינים" value={pendingContracts.length}
          color="bg-gradient-to-br from-sky-400 to-blue-500 text-white shadow-lg shadow-sky-200"
          onClick={() => navigate('/contracts')}
        />
        <StatCard
          icon={CreditCard} label="ממתינים לגבייה" value={overduePayments.length}
          color="bg-gradient-to-br from-red-400 to-rose-500 text-white shadow-lg shadow-red-200"
          onClick={() => navigate('/payments')}
        />
      </div>

      {/* Row 1: Today's meetings + Upcoming meetings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <SectionHeader icon={Calendar} title="פגישות היום" color="text-primary-500" linkTo="/meetings" onNav={navigate} />
          {d?.todayMeetings?.length === 0 ? (
            <p className="text-sm text-slate-400 py-4 text-center">אין פגישות היום</p>
          ) : (
            <div className="space-y-2">
              {d?.todayMeetings?.map(m => (
                <div key={m.id} onClick={() => navigate(`/clients/${m.clientId}`)}
                  className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 cursor-pointer transition-colors">
                  <div className="w-10 h-10 bg-primary-100 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Clock className="w-5 h-5 text-primary-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{m.client?.fullName}</p>
                    <p className="text-xs text-slate-500">{format(new Date(m.date), 'HH:mm')} · {m.duration} דקות · {m.type}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <SectionHeader icon={TrendingUp} title="פגישות קרובות" color="text-emerald-500" linkTo="/meetings" onNav={navigate} />
          {d?.upcomingMeetings?.length === 0 ? (
            <p className="text-sm text-slate-400 py-4 text-center">אין פגישות קרובות</p>
          ) : (
            <div className="space-y-2">
              {d?.upcomingMeetings?.slice(0, 5).map(m => (
                <div key={m.id} onClick={() => navigate(`/clients/${m.clientId}`)}
                  className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 cursor-pointer transition-colors">
                  <p className="text-sm font-medium text-slate-800">{m.client?.fullName}</p>
                  <p className="text-xs text-slate-500">{formatDate(m.date)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Row 2: Active Projects + Open Quotes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <SectionHeader icon={FolderKanban} title="פרויקטים פעילים" color="text-blue-500" linkTo="/projects" onNav={navigate} />
          {activeProjects.length === 0 ? (
            <p className="text-sm text-slate-400 py-4 text-center">אין פרויקטים פעילים</p>
          ) : (
            <div className="space-y-2">
              {activeProjects.map((p: any) => {
                const total = p.tasks?.length ?? 0;
                const done = p.tasks?.filter((t: any) => t.status === 'COMPLETED').length ?? 0;
                const pct = total ? Math.round((done / total) * 100) : 0;
                return (
                  <div key={p.id} onClick={() => navigate('/projects')}
                    className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 cursor-pointer transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{p.name}</p>
                      <p className="text-xs text-slate-500">{p.client?.fullName}</p>
                      {total > 0 && (
                        <div className="mt-1.5 flex items-center gap-2">
                          <div className="flex-1 bg-gray-100 rounded-full h-1 max-w-24">
                            <div className="bg-blue-500 h-1 rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs text-gray-400">{done}/{total}</span>
                        </div>
                      )}
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="card">
          <SectionHeader icon={FileText} title="הצעות מחיר פתוחות" color="text-amber-500" linkTo="/quotes" onNav={navigate} />
          {openQuotes.length === 0 ? (
            <p className="text-sm text-slate-400 py-4 text-center">אין הצעות פתוחות</p>
          ) : (
            <div className="space-y-2">
              {openQuotes.map((q: any) => {
                const total = q.items?.reduce((s: number, i: any) => s + i.price * i.quantity, 0) ?? 0;
                return (
                  <div key={q.id} onClick={() => navigate('/quotes')}
                    className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 cursor-pointer transition-colors">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{q.title}</p>
                      <p className="text-xs text-slate-500">{q.client?.fullName}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {total > 0 && <span className="text-sm font-semibold text-purple-700">₪{total.toLocaleString('he-IL')}</span>}
                      <span className={clsx('text-xs px-2 py-0.5 rounded-full font-medium', statusColorQ[q.status])}>{statusLabelQ[q.status]}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Row 3: Pending contracts + Clients without meeting */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <SectionHeader icon={FileSignature} title="חוזים ממתינים לחתימה" color="text-sky-500" linkTo="/contracts" onNav={navigate} />
          {pendingContracts.length === 0 ? (
            <p className="text-sm text-slate-400 py-4 text-center">אין חוזים ממתינים</p>
          ) : (
            <div className="space-y-2">
              {pendingContracts.map((c: any) => (
                <div key={c.id} onClick={() => navigate('/contracts')}
                  className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 cursor-pointer transition-colors">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{c.title}</p>
                    <p className="text-xs text-slate-500">{c.client?.fullName}</p>
                  </div>
                  <span className={clsx('text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0', statusColorC[c.status])}>{statusLabelC[c.status]}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <SectionHeader icon={AlertCircle} title="לקוחות ללא פגישה עתידית" color="text-red-500" />
          {d?.clientsWithoutFutureMeeting?.length === 0 ? (
            <p className="text-sm text-slate-400 py-4 text-center">כל הלקוחות הפעילים מתוזמנים</p>
          ) : (
            <div className="space-y-2">
              {d?.clientsWithoutFutureMeeting?.map(c => (
                <div key={c.id} onClick={() => navigate(`/clients/${c.id}`)}
                  className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 cursor-pointer transition-colors">
                  <div className="w-8 h-8 bg-red-50 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-bold text-red-500">
                    {c.fullName[0]}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-800">{c.fullName}</p>
                    <p className="text-xs text-slate-500">{c.email}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Row 4: Open tasks */}
      <div className="card">
        <SectionHeader icon={CheckSquare} title="משימות פתוחות" color="text-amber-500" linkTo="/tasks" onNav={navigate} />
        {d?.openTasks?.length === 0 ? (
          <p className="text-sm text-slate-400 py-4 text-center">אין משימות פתוחות</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {d?.openTasks?.slice(0, 9).map(t => (
              <div key={t.id} onClick={() => navigate(`/clients/${t.clientId}`)}
                className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 cursor-pointer transition-colors border border-slate-100">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{t.title}</p>
                  <p className="text-xs text-slate-500">{(t as any).client?.fullName}</p>
                </div>
                {t.dueDate && (
                  <p className="text-xs text-slate-400 flex-shrink-0 mr-2">{format(new Date(t.dueDate), 'd/M')}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
