import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Users, Calendar, CheckSquare, CreditCard,
  AlertCircle, Clock, TrendingUp, ArrowLeft,
} from 'lucide-react';
import api from '../services/api';
import { DashboardData } from '../types';
import { format, isToday, isTomorrow } from 'date-fns';
import { he } from 'date-fns/locale';
import clsx from 'clsx';

function StatCard({ icon: Icon, label, value, color, onClick }: any) {
  return (
    <div onClick={onClick} className={clsx('stat-card', onClick && 'cursor-pointer hover:shadow-card-hover')}>
      <div className={clsx('stat-icon', color)}>
        <Icon className="w-6 h-6" />
      </div>
      <div>
        <p className="text-2xl font-bold text-slate-900">{value}</p>
        <p className="text-sm text-slate-500 mt-0.5">{label}</p>
      </div>
    </div>
  );
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  if (isToday(d)) return `היום ${format(d, 'HH:mm')}`;
  if (isTomorrow(d)) return `מחר ${format(d, 'HH:mm')}`;
  return format(d, "d בMMM, HH:mm", { locale: he });
}

export default function Dashboard() {
  const navigate = useNavigate();
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

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="page-title">לוח בקרה</h1>
        <p className="page-subtitle">{format(new Date(), "EEEE, d בMMMM yyyy", { locale: he })}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Users} label="לקוחות פעילים" value={d?.activeClients ?? 0}
          color="bg-primary-50 text-primary-600"
          onClick={() => navigate('/clients')}
        />
        <StatCard
          icon={Calendar} label="פגישות היום" value={d?.todayMeetings?.length ?? 0}
          color="bg-emerald-50 text-emerald-600"
          onClick={() => navigate('/meetings')}
        />
        <StatCard
          icon={CheckSquare} label="משימות פתוחות" value={d?.openTasks?.length ?? 0}
          color="bg-amber-50 text-amber-600"
          onClick={() => navigate('/tasks')}
        />
        <StatCard
          icon={CreditCard} label="ממתינים לגבייה" value={overduePayments.length}
          color="bg-red-50 text-red-500"
          onClick={() => navigate('/payments')}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Today's meetings */}
        <div className="card">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-semibold text-slate-900 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-primary-500" />
              פגישות היום
            </h2>
            <button onClick={() => navigate('/meetings')} className="text-xs text-primary-600 hover:underline flex items-center gap-1">
              הכל <ArrowLeft className="w-3 h-3" />
            </button>
          </div>
          {d?.todayMeetings?.length === 0 ? (
            <p className="text-sm text-slate-400 py-4 text-center">אין פגישות היום</p>
          ) : (
            <div className="space-y-3">
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

        {/* Upcoming meetings */}
        <div className="card">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-semibold text-slate-900 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-500" />
              פגישות קרובות
            </h2>
          </div>
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

        {/* Open tasks */}
        <div className="card">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-semibold text-slate-900 flex items-center gap-2">
              <CheckSquare className="w-4 h-4 text-amber-500" />
              משימות פתוחות
            </h2>
            <button onClick={() => navigate('/tasks')} className="text-xs text-primary-600 hover:underline flex items-center gap-1">
              הכל <ArrowLeft className="w-3 h-3" />
            </button>
          </div>
          {d?.openTasks?.length === 0 ? (
            <p className="text-sm text-slate-400 py-4 text-center">אין משימות פתוחות</p>
          ) : (
            <div className="space-y-2">
              {d?.openTasks?.slice(0, 6).map(t => (
                <div key={t.id} onClick={() => navigate(`/clients/${t.clientId}`)}
                  className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 cursor-pointer transition-colors">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{t.title}</p>
                    <p className="text-xs text-slate-500">{(t as any).client?.fullName}</p>
                  </div>
                  {t.dueDate && (
                    <p className="text-xs text-slate-400">{format(new Date(t.dueDate), 'd/M')}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Clients without future meeting */}
        <div className="card">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-semibold text-slate-900 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-500" />
              לקוחות ללא פגישה עתידית
            </h2>
          </div>
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
    </div>
  );
}
