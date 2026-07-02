import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Calendar, CheckSquare, FileText, LogOut, Briefcase, TrendingUp, FolderOpen, CheckCircle } from 'lucide-react';
import api from '../../services/api';
import { Client, TaskStatus } from '../../types';
import { format, isFuture } from 'date-fns';
import { he } from 'date-fns/locale';
import { useAuthStore } from '../../store/auth';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { useState } from 'react';

const taskLabel: Record<TaskStatus, string> = { PENDING: 'ממתין', IN_PROGRESS: 'בתהליך', COMPLETED: 'הושלם' };
const taskClass: Record<TaskStatus, string> = { PENDING: 'task-pending', IN_PROGRESS: 'task-progress', COMPLETED: 'task-completed' };

type Tab = 'meetings' | 'tasks' | 'documents';

export default function ClientPortal() {
  const { user, clearAuth } = useAuthStore();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('meetings');

  const { data: client, isLoading } = useQuery<Client>({
    queryKey: ['portal-client'],
    queryFn: () => api.get(`/clients/${user?.clientId}`).then(r => r.data),
    enabled: !!user?.clientId,
  });

  const updateTask = useMutation({
    mutationFn: ({ id, status }: { id: string; status: TaskStatus }) =>
      api.put(`/tasks/${id}`, { status }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['portal-client'] }); toast.success('משימה עודכנה'); },
  });

  const handleLogout = () => { clearAuth(); navigate('/login'); };

  if (!user?.clientId) return (
    <div className="min-h-screen flex items-center justify-center text-slate-500">
      חשבון לא מקושר ללקוח. פנה למאמן שלך.
    </div>
  );

  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!client) return null;

  const futureMeetings = client.meetings?.filter(m => isFuture(new Date(m.date))) ?? [];
  const pastMeetings = client.meetings?.filter(m => !isFuture(new Date(m.date))) ?? [];
  const pendingTasks = client.tasks?.filter(t => t.status !== 'COMPLETED') ?? [];
  const completedTasks = client.tasks?.filter(t => t.status === 'COMPLETED') ?? [];
  const progress = client.tasks?.length
    ? Math.round((completedTasks.length / client.tasks.length) * 100) : 0;

  const tabs: { key: Tab; label: string; icon: any }[] = [
    { key: 'meetings', label: 'פגישות', icon: Calendar },
    { key: 'tasks', label: `משימות (${pendingTasks.length})`, icon: CheckSquare },
    { key: 'documents', label: 'מסמכים', icon: FolderOpen },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-100 shadow-sm">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-primary-600 rounded-xl flex items-center justify-center">
              <Briefcase className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="font-bold text-slate-900 text-sm">האזור האישי שלי</p>
              <p className="text-xs text-slate-500">{client.fullName}</p>
            </div>
          </div>
          <button onClick={handleLogout} className="btn-ghost text-sm">
            <LogOut className="w-4 h-4" /> יציאה
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Welcome + progress */}
        <div className="card">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-slate-900">שלום, {client.fullName.split(' ')[0]} 👋</h1>
              {client.businessName && <p className="text-sm text-slate-500 mt-0.5">{client.businessName}</p>}
            </div>
            <div className="text-left">
              <p className="text-2xl font-bold text-primary-600">{progress}%</p>
              <p className="text-xs text-slate-500">השלמת משימות</p>
            </div>
          </div>
          <div className="mt-4 h-2 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-primary-500 rounded-full transition-all duration-700"
              style={{ width: `${progress}%` }} />
          </div>

          {futureMeetings.length > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-100">
              <p className="text-xs font-semibold text-slate-500 mb-2">הפגישה הקרובה</p>
              <p className="text-sm font-medium text-slate-800">
                {format(new Date(futureMeetings[0].date), "EEEE, d בMMMM · HH:mm", { locale: he })}
              </p>
              <p className="text-xs text-slate-500">{futureMeetings[0].type} · {futureMeetings[0].duration} דקות</p>
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="card text-center py-4">
            <p className="text-2xl font-bold text-slate-900">{client.meetings?.length ?? 0}</p>
            <p className="text-xs text-slate-500 mt-1">פגישות</p>
          </div>
          <div className="card text-center py-4">
            <p className="text-2xl font-bold text-primary-600">{pendingTasks.length}</p>
            <p className="text-xs text-slate-500 mt-1">משימות פתוחות</p>
          </div>
          <div className="card text-center py-4">
            <p className="text-2xl font-bold text-emerald-600">{completedTasks.length}</p>
            <p className="text-xs text-slate-500 mt-1">הושלמו</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
          {tabs.map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => setTab(key)}
              className={clsx('flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium flex-1 justify-center transition-all duration-150',
                tab === key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700')}>
              <Icon className="w-4 h-4" />{label}
            </button>
          ))}
        </div>

        {/* Tab: Meetings */}
        {tab === 'meetings' && (
          <div className="space-y-4">
            {futureMeetings.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-primary-500" /> פגישות קרובות
                </h3>
                {futureMeetings.map(m => (
                  <div key={m.id} className="card border-r-4 border-r-primary-400 mb-3">
                    <p className="font-medium text-slate-900">
                      {format(new Date(m.date), "EEEE, d בMMMM yyyy", { locale: he })}
                    </p>
                    <p className="text-sm text-slate-500 mt-1">
                      {format(new Date(m.date), 'HH:mm')} · {m.duration} דקות · {m.type}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {pastMeetings.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-3">סיכומי פגישות</h3>
                {pastMeetings.map(m => (
                  <div key={m.id} className="card mb-3 opacity-80">
                    <p className="text-sm font-medium text-slate-700">
                      {format(new Date(m.date), "d בMMMM yyyy · HH:mm", { locale: he })} – {m.type}
                    </p>
                    {m.summary && (
                      <div className="mt-3 space-y-2 text-sm text-slate-600">
                        {m.summary.goal && <p><strong>מטרה:</strong> {m.summary.goal}</p>}
                        {m.summary.decisions && <p><strong>החלטות:</strong> {m.summary.decisions}</p>}
                        {m.summary.freeText && <p>{m.summary.freeText}</p>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {!client.meetings?.length && (
              <div className="card text-center py-12 text-slate-400">אין פגישות עדיין</div>
            )}
          </div>
        )}

        {/* Tab: Tasks */}
        {tab === 'tasks' && (
          <div className="space-y-3">
            {pendingTasks.length === 0 && completedTasks.length === 0 && (
              <div className="card text-center py-12 text-slate-400">אין משימות</div>
            )}
            {pendingTasks.map(task => (
              <div key={task.id} className="card flex items-start gap-3">
                <button
                  onClick={() => updateTask.mutate({ id: task.id, status: 'COMPLETED' })}
                  className="w-5 h-5 rounded-full border-2 border-slate-300 flex-shrink-0 mt-0.5 hover:border-primary-500 transition-colors"
                />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-800">{task.title}</p>
                  {task.description && <p className="text-sm text-slate-500 mt-0.5">{task.description}</p>}
                  {task.dueDate && (
                    <p className="text-xs text-slate-400 mt-1">תאריך יעד: {format(new Date(task.dueDate), 'd/M/yyyy')}</p>
                  )}
                </div>
                <span className={taskClass[task.status]}>{taskLabel[task.status]}</span>
              </div>
            ))}
            {completedTasks.map(task => (
              <div key={task.id} className="card flex items-start gap-3 opacity-50">
                <CheckCircle className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm line-through text-slate-500">{task.title}</p>
              </div>
            ))}
          </div>
        )}

        {/* Tab: Documents */}
        {tab === 'documents' && (
          <div className="space-y-2">
            {!client.documents?.length && (
              <div className="card text-center py-12 text-slate-400">
                <FolderOpen className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p>אין מסמכים</p>
              </div>
            )}
            {client.documents?.map(doc => (
              <a key={doc.id} href={doc.url} target="_blank" rel="noreferrer"
                className="card flex items-center gap-3 hover:shadow-card-hover transition-shadow">
                <FileText className="w-5 h-5 text-primary-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{doc.name}</p>
                  <p className="text-xs text-slate-500">{format(new Date(doc.createdAt), 'd/M/yyyy')}</p>
                </div>
              </a>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
