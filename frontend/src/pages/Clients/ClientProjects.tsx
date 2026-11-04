import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ChevronLeft, FolderKanban, Pencil, Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import ProjectDetail from '../Projects/ProjectDetail';
import ProjectModal from '../Projects/ProjectModal';
import ProjectSchedule from '../Projects/ProjectSchedule';
import type { Project, ProjectStatusType } from '../Projects/index';

const statusLabel: Record<ProjectStatusType, string> = { PLANNING: 'תכנון', ACTIVE: 'פעיל', ON_HOLD: 'מושהה', COMPLETED: 'הושלם', CANCELLED: 'בוטל' };
const statusClass: Record<ProjectStatusType, string> = {
  PLANNING: 'bg-blue-100 text-blue-700',
  ACTIVE: 'bg-green-100 text-green-700',
  ON_HOLD: 'bg-yellow-100 text-yellow-700',
  COMPLETED: 'bg-gray-100 text-gray-600',
  CANCELLED: 'bg-red-100 text-red-700',
};

export const isRunning = (status: string) => status === 'PLANNING' || status === 'ACTIVE';

const missingDates = (p: Project) => [!p.startDate && 'תאריך התחלה', !p.endDate && 'תאריך סיום'].filter(Boolean).join(' ו');

// Projects in progress first, the nearest end date on top. One with no end date needs attention, so it comes before them all.
const byUrgency = (a: Project, b: Project) => {
  const running = Number(isRunning(b.status)) - Number(isRunning(a.status));
  if (running) return running;
  return (a.endDate ?? '').localeCompare(b.endDate ?? '');
};

interface Props {
  clientId: string;
  onChanged: () => void;
  onNew: () => void;
  // From a link that means one project: open it, or open its edit window.
  openId?: string | null;
  editId?: string | null;
  onLinkUsed: () => void;
}

// Everything to do with a client's projects, from their own page.
export default function ClientProjects({ clientId, onChanged, onNew, openId, editId, onLinkUsed }: Props) {
  const qc = useQueryClient();
  const [detail, setDetail] = useState<Project | null>(null);
  const [editing, setEditing] = useState<Project | null>(null);

  const { data: projects, isLoading, isError } = useQuery<Project[]>({
    queryKey: ['client-projects', clientId],
    queryFn: () => api.get('/projects', { params: { clientId } }).then((r) => r.data),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['client-projects', clientId] });
    onChanged();
  };

  useEffect(() => {
    if (!projects || (!openId && !editId)) return;
    const toOpen = projects.find((p) => p.id === openId);
    const toEdit = projects.find((p) => p.id === editId);
    if (toOpen) setDetail(toOpen);
    if (toEdit) setEditing(toEdit);
    onLinkUsed();
  }, [projects, openId, editId]);

  const remove = async (p: Project) => {
    if (!confirm(`למחוק את הפרויקט "${p.name.trim()}"? המשימות שלו יישארו ברשימת המשימות של הלקוח.`)) return;
    try {
      await api.delete(`/projects/${p.id}`);
      toast.success('הפרויקט נמחק');
      refresh();
    } catch {
      toast.error('המחיקה לא הצליחה');
    }
  };

  if (detail) return <ProjectDetail project={detail} onBack={() => setDetail(null)} onChanged={refresh} />;

  if (isLoading) return <div className="flex justify-center py-12"><div className="w-7 h-7 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" /></div>;
  if (isError || !projects) return <div className="card text-center py-12 text-red-600 font-medium">לא הצלחנו לטעון את הפרויקטים. נסו לרענן את הדף.</div>;

  if (projects.length === 0) {
    return (
      <div className="card text-center py-12 text-slate-400">
        <FolderKanban className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p className="font-medium mb-1">אין פרויקטים עדיין</p>
        <button type="button" onClick={onNew} className="btn-primary mt-3 text-sm"><Plus className="w-4 h-4" /> פרויקט חדש</button>
      </div>
    );
  }

  const budget = projects.reduce((s, p) => s + (p.budget || 0), 0);

  return (
    <div className="space-y-3">
      <p data-projects-summary className="text-sm text-slate-500">
        בעבודה: <strong className="text-slate-800">{projects.filter((p) => isRunning(p.status)).length}</strong>
        {' · '}הושלמו: <strong className="text-slate-800">{projects.filter((p) => p.status === 'COMPLETED').length}</strong>
        {budget > 0 && <>{' · '}תקציב כולל: <strong className="text-slate-800">₪{budget.toLocaleString()}</strong></>}
      </p>

      {[...projects].sort(byUrgency).map((p) => {
        const missing = missingDates(p);
        const allTasks = [...p.tasks, ...p.subProjects.flatMap((s) => s.tasks)];
        const done = allTasks.filter((t) => t.status === 'COMPLETED').length;
        return (
          <div key={p.id} data-client-project className="card">
            <div className="flex items-start gap-3">
              <span className="w-10 h-10 bg-primary-50 rounded-xl flex items-center justify-center flex-shrink-0">
                <FolderKanban className="w-5 h-5 text-primary-600" />
              </span>
              <button type="button" onClick={() => setDetail(p)} className="flex-1 min-w-0 text-right">
                <span className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-slate-800">{p.name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusClass[p.status]}`}>{statusLabel[p.status]}</span>
                </span>
                {p.description && <span className="block text-sm text-slate-500 mt-0.5">{p.description}</span>}
                {(p.startDate || p.endDate) && <ProjectSchedule project={p} compact />}
                <span className="block text-xs text-slate-400 mt-1">{allTasks.length ? `${done}/${allTasks.length} משימות` : 'אין משימות'}</span>
              </button>
              {!!p.budget && <p className="text-lg font-bold text-emerald-700 flex-shrink-0">₪{p.budget.toLocaleString()}</p>}
            </div>

            {missing && (
              <div data-missing-dates className="mt-3 rounded-xl bg-amber-50 border border-amber-200 p-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-amber-800 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>חסר {missing}.{isRunning(p.status) && !p.endDate ? ' בלי תאריך סיום לא תגיע תזכורת לפני ההגשה.' : ''}</span>
                </p>
                <button type="button" onClick={() => setEditing(p)} className="btn-primary text-xs">קביעת תאריכים</button>
              </div>
            )}

            <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-slate-100">
              <button type="button" onClick={() => setDetail(p)} className="btn-secondary text-xs">פתיחה ומשימות <ChevronLeft className="w-3.5 h-3.5" /></button>
              <button type="button" onClick={() => setEditing(p)} className="btn-secondary text-xs"><Pencil className="w-3.5 h-3.5" /> עריכה</button>
              <button type="button" onClick={() => remove(p)} className="text-xs px-3 py-1.5 rounded-xl border border-red-200 text-red-500 hover:bg-red-50 transition-colors flex items-center gap-1"><Trash2 className="w-3.5 h-3.5" /> מחיקה</button>
            </div>
          </div>
        );
      })}

      {editing && <ProjectModal project={editing} onClose={() => setEditing(null)} onSave={() => { setEditing(null); refresh(); }} />}
    </div>
  );
}
