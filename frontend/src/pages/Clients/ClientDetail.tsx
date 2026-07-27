import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight, Phone, Mail, Building2, Calendar, CheckSquare,
  CreditCard, FolderOpen, Edit, Plus, FileText, Clock, Trash2, Pencil,
} from 'lucide-react';
import api from '../../services/api';
import { Client, ClientStatus, Meeting, Task, TaskStatus } from '../../types';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import ClientModal from './ClientModal';
import MeetingModal from '../Meetings/MeetingModal';
import SummaryModal from '../Meetings/SummaryModal';
import TaskModal from '../Tasks/TaskModal';
import PaymentPanel from '../Payments/PaymentPanel';
import { useMutation } from '@tanstack/react-query';

const statusLabel: Record<ClientStatus, string> = { ACTIVE: 'פעיל', FROZEN: 'מוקפא', ENDED: 'הסתיים' };
const statusClass: Record<ClientStatus, string> = { ACTIVE: 'status-active', FROZEN: 'status-frozen', ENDED: 'status-ended' };
const taskLabel: Record<TaskStatus, string> = { PENDING: 'ממתין', IN_PROGRESS: 'בתהליך', COMPLETED: 'הושלם' };
const taskClass: Record<TaskStatus, string> = { PENDING: 'task-pending', IN_PROGRESS: 'task-progress', COMPLETED: 'task-completed' };

type Tab = 'timeline' | 'tasks' | 'payments' | 'documents';

export default function ClientDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('timeline');
  const [editClient, setEditClient] = useState(false);
  const [newMeeting, setNewMeeting] = useState(false);
  const [editMeeting, setEditMeeting] = useState<Meeting | null>(null);
  const [summaryFor, setSummaryFor] = useState<string | null>(null);
  const [newTask, setNewTask] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [confirmDeleteClient, setConfirmDeleteClient] = useState(false);

  const deleteClient = useMutation({
    mutationFn: () => api.delete(`/clients/${id}`),
    onSuccess: () => { toast.success('הלקוח נמחק'); navigate('/clients'); },
    onError: () => toast.error('שגיאה במחיקה'),
  });

  const deleteTask = useMutation({
    mutationFn: (taskId: string) => api.delete(`/tasks/${taskId}`),
    onSuccess: () => { invalidate(); toast.success('משימה נמחקה'); },
    onError: () => toast.error('שגיאה במחיקה'),
  });

  const deleteMeeting = useMutation({
    mutationFn: (meetingId: string) => api.delete(`/meetings/${meetingId}`),
    onSuccess: () => { invalidate(); toast.success('הפגישה נמחקה'); },
    onError: () => toast.error('שגיאה במחיקה'),
  });

  const handleDeleteMeeting = (m: Meeting) => {
    if (confirm(`למחוק את הפגישה מ-${format(new Date(m.date), 'd/M/yyyy')}?`)) deleteMeeting.mutate(m.id);
  };

  const { data: client, isLoading } = useQuery<Client>({
    queryKey: ['client', id],
    queryFn: () => api.get(`/clients/${id}`).then(r => r.data),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['client', id] });

  if (isLoading) return <div className="flex justify-center py-16"><div className="w-7 h-7 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" /></div>;
  if (!client) return <div className="text-center py-16 text-slate-400">לקוח לא נמצא</div>;

  const tabs: { key: Tab; label: string; icon: any }[] = [
    { key: 'timeline', label: 'ציר זמן', icon: Clock },
    { key: 'tasks', label: `משימות (${client.tasks?.length ?? 0})`, icon: CheckSquare },
    { key: 'payments', label: 'תשלומים', icon: CreditCard },
    { key: 'documents', label: `מסמכים (${client.documents?.length ?? 0})`, icon: FolderOpen },
  ];

  return (
    <div className="space-y-6">
      {/* Back */}
      <button onClick={() => navigate('/clients')} className="btn-ghost text-sm gap-1 -ml-2">
        <ArrowRight className="w-4 h-4" /> חזרה ללקוחות
      </button>

      {/* Client header */}
      <div className="card">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-primary-100 rounded-2xl flex items-center justify-center text-2xl font-bold text-primary-700">
              {client.fullName[0]}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold text-slate-900">{client.fullName}</h1>
                <span className={statusClass[client.status]}>{statusLabel[client.status]}</span>
              </div>
              <div className="flex flex-wrap items-center gap-3 mt-1.5 text-sm text-slate-500">
                {client.email && <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5" />{client.email}</span>}
                {client.phone && <span className="flex items-center gap-1" dir="ltr"><Phone className="w-3.5 h-3.5" />{client.phone}</span>}
                {client.businessName && <span className="flex items-center gap-1"><Building2 className="w-3.5 h-3.5" />{client.businessName}</span>}
              </div>
              {client.businessField && <p className="text-xs text-slate-400 mt-1">{client.businessField}</p>}
              {client.startDate && (
                <p className="text-xs text-slate-400 mt-1">
                  תחילת ליווי: {format(new Date(client.startDate), 'd בMMMM yyyy', { locale: he })}
                </p>
              )}
            </div>
          </div>

          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setEditClient(true)} className="btn-secondary text-xs">
              <Edit className="w-3.5 h-3.5" /> עריכה
            </button>
            <button onClick={() => setNewMeeting(true)} className="btn-primary text-xs">
              <Plus className="w-3.5 h-3.5" /> פגישה חדשה
            </button>
            <button onClick={() => setNewTask(true)} className="btn-secondary text-xs">
              <CheckSquare className="w-3.5 h-3.5" /> משימה חדשה
            </button>
            <button onClick={() => setConfirmDeleteClient(true)} className="text-xs px-3 py-1.5 rounded-xl border border-red-200 text-red-500 hover:bg-red-50 transition-colors flex items-center gap-1">
              <Trash2 className="w-3.5 h-3.5" /> מחק לקוח
            </button>
          </div>
        </div>

        {client.notes && (
          <div className="mt-4 pt-4 border-t border-slate-100">
            <p className="text-sm text-slate-600">{client.notes}</p>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={clsx('flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150',
              tab === key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700')}>
            <Icon className="w-4 h-4" />{label}
          </button>
        ))}
      </div>

      {/* Timeline */}
      {tab === 'timeline' && (
        <div className="space-y-4">
          {!client.meetings?.length && (
            <div className="card text-center py-12 text-slate-400">
              <Calendar className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>אין פגישות עדיין</p>
            </div>
          )}
          {client.meetings?.map(m => (
            <div key={m.id} className="card">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {format(new Date(m.date), "EEEE, d בMMMM yyyy · HH:mm", { locale: he })}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">{m.type} · {m.duration} דקות</p>
                  {m.notes && <p className="text-sm text-slate-600 mt-2">{m.notes}</p>}
                </div>
                <div className="flex items-center gap-2">
                  {!m.summary && (
                    <button onClick={() => setSummaryFor(m.id)} className="btn-secondary text-xs">
                      <FileText className="w-3.5 h-3.5" /> הוסף סיכום
                    </button>
                  )}
                  <button onClick={() => setEditMeeting(m as any)}
                    className="btn-ghost p-1.5 rounded-lg text-slate-400 hover:text-primary-600">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDeleteMeeting(m as any)}
                    className="btn-ghost p-1.5 rounded-lg text-slate-400 hover:text-red-500">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {m.summary && (
                <div className="mt-4 pt-4 border-t border-slate-100 space-y-3">
                  {m.summary.type === 'STRUCTURED' ? (
                    <div className="grid grid-cols-1 gap-3">
                      {m.summary.goal && <SummaryField label="מטרת הפגישה" value={m.summary.goal} />}
                      {m.summary.progress && <SummaryField label="התקדמות" value={m.summary.progress} />}
                      {m.summary.challenges && <SummaryField label="אתגרים" value={m.summary.challenges} />}
                      {m.summary.decisions && <SummaryField label="החלטות" value={m.summary.decisions} />}
                      {m.summary.conclusions && <SummaryField label="מסקנות" value={m.summary.conclusions} />}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-700 whitespace-pre-wrap">{m.summary.freeText}</p>
                  )}
                  {m.summary.tags?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {m.summary.tags.map(tag => (
                        <span key={tag.id} className="badge bg-primary-50 text-primary-700">#{tag.name}</span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {m.tasks && m.tasks.length > 0 && (
                <div className="mt-3 pt-3 border-t border-slate-100">
                  <p className="text-xs font-semibold text-slate-500 mb-2">משימות מהפגישה</p>
                  <div className="space-y-1">
                    {m.tasks.map(t => (
                      <div key={t.id} className="flex items-center gap-2 text-sm">
                        <span className={taskClass[t.status]}>{taskLabel[t.status]}</span>
                        <span className="text-slate-700">{t.title}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Tasks */}
      {tab === 'tasks' && (
        <div className="card p-0 overflow-hidden">
          {client.tasks?.length === 0 ? (
            <div className="text-center py-12 text-slate-400">אין משימות</div>
          ) : (
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="table-header">משימה</th>
                  <th className="table-header">תאריך יעד</th>
                  <th className="table-header">סטטוס</th>
                  <th className="table-header w-20" />
                </tr>
              </thead>
              <tbody>
                {client.tasks?.map(t => (
                  <tr key={t.id} className="table-row">
                    <td className="table-cell">
                      <p className="font-medium text-slate-800">{t.title}</p>
                      {t.description && <p className="text-xs text-slate-500 mt-0.5">{t.description}</p>}
                    </td>
                    <td className="table-cell text-slate-600">
                      {t.dueDate ? format(new Date(t.dueDate), 'd/M/yyyy') : '—'}
                    </td>
                    <td className="table-cell">
                      <span className={taskClass[t.status]}>{taskLabel[t.status]}</span>
                    </td>
                    <td className="table-cell">
                      <div className="flex items-center gap-1">
                        <button onClick={() => setEditTask(t as any)}
                          className="p-1.5 text-slate-400 hover:text-primary-600 rounded-lg hover:bg-slate-50 transition-colors">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => deleteTask.mutate(t.id)}
                          className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-slate-50 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Payments */}
      {tab === 'payments' && <PaymentPanel clientId={id!} onUpdated={invalidate} />}

      {/* Documents */}
      {tab === 'documents' && (
        <div className="card">
          {client.documents?.length === 0 ? (
            <div className="text-center py-12 text-slate-400">אין מסמכים</div>
          ) : (
            <div className="space-y-2">
              {client.documents?.map(doc => (
                <a key={doc.id} href={doc.url} target="_blank" rel="noreferrer"
                  className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors">
                  <FolderOpen className="w-5 h-5 text-slate-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{doc.name}</p>
                    <p className="text-xs text-slate-500">{format(new Date(doc.createdAt), 'd/M/yyyy')}</p>
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      {editClient && <ClientModal client={client} onClose={() => setEditClient(false)} onSaved={() => { invalidate(); setEditClient(false); }} />}
      {newMeeting && <MeetingModal clientId={id!} onClose={() => setNewMeeting(false)} onSaved={() => { invalidate(); setNewMeeting(false); }} />}
      {editMeeting && <MeetingModal meeting={editMeeting} onClose={() => setEditMeeting(null)} onSaved={() => { invalidate(); setEditMeeting(null); }} />}
      {summaryFor && <SummaryModal meetingId={summaryFor} onClose={() => setSummaryFor(null)} onSaved={() => { invalidate(); setSummaryFor(null); }} />}
      {newTask && <TaskModal clientId={id!} onClose={() => setNewTask(false)} onSaved={() => { invalidate(); setNewTask(false); }} />}
      {editTask && <TaskModal clientId={id!} task={editTask} onClose={() => setEditTask(null)} onSaved={() => { invalidate(); setEditTask(null); }} />}

      {confirmDeleteClient && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full">
            <h3 className="font-bold text-slate-900 text-lg mb-2">מחיקת לקוח</h3>
            <p className="text-slate-600 text-sm mb-6">
              האם למחוק את <strong>{client.fullName}</strong>? כל הפגישות, המשימות, התשלומים והמסמכים יימחקו לצמיתות.
            </p>
            <div className="flex gap-3">
              <button onClick={() => deleteClient.mutate()} disabled={deleteClient.isPending}
                className="flex-1 justify-center py-2 px-4 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-medium transition-colors">
                {deleteClient.isPending ? 'מוחק...' : 'כן, מחק'}
              </button>
              <button onClick={() => setConfirmDeleteClient(false)} className="btn-secondary flex-1 justify-center">ביטול</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold text-slate-500 mb-0.5">{label}</p>
      <p className="text-sm text-slate-700">{value}</p>
    </div>
  );
}
