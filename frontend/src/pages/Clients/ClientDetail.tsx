import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight, Phone, Mail, Building2, Calendar, CheckSquare,
  CreditCard, FolderOpen, Edit, Plus, FileText, Clock,
} from 'lucide-react';
import api from '../../services/api';
import { Client, ClientStatus, TaskStatus } from '../../types';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';
import clsx from 'clsx';
import ClientModal from './ClientModal';
import MeetingModal from '../Meetings/MeetingModal';
import SummaryModal from '../Meetings/SummaryModal';
import TaskModal from '../Tasks/TaskModal';
import PaymentPanel from '../Payments/PaymentPanel';

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
  const [summaryFor, setSummaryFor] = useState<string | null>(null);
  const [newTask, setNewTask] = useState(false);

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
                {!m.summary && (
                  <button onClick={() => setSummaryFor(m.id)} className="btn-secondary text-xs">
                    <FileText className="w-3.5 h-3.5" /> הוסף סיכום
                  </button>
                )}
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
      {summaryFor && <SummaryModal meetingId={summaryFor} onClose={() => setSummaryFor(null)} onSaved={() => { invalidate(); setSummaryFor(null); }} />}
      {newTask && <TaskModal clientId={id!} onClose={() => setNewTask(false)} onSaved={() => { invalidate(); setNewTask(false); }} />}
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
