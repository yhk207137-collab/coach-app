import { useState, useEffect } from 'react';
import { Plus, FolderKanban, ChevronDown, ChevronRight, Trash2, Edit2, CheckCircle, Clock, PauseCircle, XCircle, BarChart3, Printer } from 'lucide-react';
import api from '../../services/api';
import ProjectModal from './ProjectModal';
import ProjectDetail from './ProjectDetail';
import ProjectPrint from './ProjectPrint';

export interface SubProject {
  id: string;
  name: string;
  description?: string;
  status: ProjectStatusType;
  tasks: Task[];
}

export interface Task {
  id: string;
  title: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
}

export type ProjectStatusType = 'PLANNING' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED';

export interface Project {
  id: string;
  name: string;
  description?: string;
  status: ProjectStatusType;
  startDate?: string;
  endDate?: string;
  budget?: number;
  strategy?: string;
  goals?: string;
  client: { id: string; fullName: string; businessName?: string };
  subProjects: SubProject[];
  tasks: Task[];
}

const statusLabel: Record<ProjectStatusType, string> = {
  PLANNING: 'תכנון',
  ACTIVE: 'פעיל',
  ON_HOLD: 'מושהה',
  COMPLETED: 'הושלם',
  CANCELLED: 'בוטל',
};

const statusColor: Record<ProjectStatusType, string> = {
  PLANNING: 'bg-blue-100 text-blue-700',
  ACTIVE: 'bg-green-100 text-green-700',
  ON_HOLD: 'bg-yellow-100 text-yellow-700',
  COMPLETED: 'bg-gray-100 text-gray-600',
  CANCELLED: 'bg-red-100 text-red-700',
};

const statusIcon: Record<ProjectStatusType, React.ReactNode> = {
  PLANNING: <Clock className="w-3.5 h-3.5" />,
  ACTIVE: <CheckCircle className="w-3.5 h-3.5" />,
  ON_HOLD: <PauseCircle className="w-3.5 h-3.5" />,
  COMPLETED: <BarChart3 className="w-3.5 h-3.5" />,
  CANCELLED: <XCircle className="w-3.5 h-3.5" />,
};

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editProject, setEditProject] = useState<Project | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<Project | null>(null);
  const [printProject, setPrintProject] = useState<Project | null>(null);

  const load = async () => {
    try {
      const res = await api.get('/projects');
      setProjects(res.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (id: string) => {
    if (!confirm('למחוק פרויקט זה?')) return;
    await api.delete(`/projects/${id}`);
    setProjects(p => p.filter(x => x.id !== id));
  };

  const handleSave = (project: Project) => {
    setProjects(prev => {
      const idx = prev.findIndex(p => p.id === project.id);
      if (idx >= 0) { const a = [...prev]; a[idx] = project; return a; }
      return [project, ...prev];
    });
    setShowModal(false);
    setEditProject(null);
  };

  const toggle = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  if (detail) return <ProjectDetail project={detail} onBack={() => { setDetail(null); load(); }} />;

  const activeCount = projects.filter(p => p.status === 'ACTIVE').length;

  return (
    <div dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">פרויקטים</h1>
          <p className="text-sm text-gray-500 mt-0.5">{projects.length} פרויקטים • {activeCount} פעילים</p>
        </div>
        <button
          onClick={() => { setEditProject(null); setShowModal(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-xl hover:bg-purple-700 transition-colors font-medium"
        >
          <Plus className="w-4 h-4" />
          פרויקט חדש
        </button>
      </div>

      {loading ? (
        <div className="text-center py-20 text-gray-400">טוען...</div>
      ) : projects.length === 0 ? (
        <div className="text-center py-20">
          <FolderKanban className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-400">אין פרויקטים עדיין</p>
        </div>
      ) : (
        <div className="space-y-3">
          {projects.map(p => {
            const totalTasks = p.tasks.length + p.subProjects.reduce((s, sp) => s + sp.tasks.length, 0);
            const doneTasks = p.tasks.filter(t => t.status === 'COMPLETED').length +
              p.subProjects.reduce((s, sp) => s + sp.tasks.filter(t => t.status === 'COMPLETED').length, 0);
            const pct = totalTasks ? Math.round((doneTasks / totalTasks) * 100) : 0;
            const isOpen = expanded.has(p.id);

            return (
              <div key={p.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-5 flex items-center gap-4">
                  <button onClick={() => toggle(p.id)} className="text-gray-400 hover:text-purple-600">
                    {isOpen ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                  </button>
                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setDetail(p)}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-gray-900">{p.name}</h3>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${statusColor[p.status]}`}>
                        {statusIcon[p.status]}
                        {statusLabel[p.status]}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 mt-0.5">{p.client.fullName}{p.client.businessName ? ` — ${p.client.businessName}` : ''}</p>
                    {totalTasks > 0 && (
                      <div className="mt-2 flex items-center gap-2">
                        <div className="flex-1 bg-gray-100 rounded-full h-1.5 max-w-32">
                          <div className="bg-purple-500 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs text-gray-400">{doneTasks}/{totalTasks} משימות</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-sm text-gray-500">
                    {p.budget && <span className="font-medium text-gray-700">₪{p.budget.toLocaleString('he-IL')}</span>}
                    <span>{p.subProjects.length} תת-פרויקטים</span>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => setPrintProject(p)} className="p-2 rounded-lg hover:bg-purple-50 text-gray-400 hover:text-purple-600" title="הדפס דוח פרויקט"><Printer className="w-4 h-4" /></button>
                    <button onClick={() => { setEditProject(p); setShowModal(true); }} className="p-2 rounded-lg hover:bg-purple-50 text-gray-400 hover:text-purple-600"><Edit2 className="w-4 h-4" /></button>
                    <button onClick={() => handleDelete(p.id)} className="p-2 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>

                {isOpen && p.subProjects.length > 0 && (
                  <div className="border-t border-gray-50 bg-gray-50/50 px-5 py-3 space-y-2">
                    {p.subProjects.map(sp => (
                      <div key={sp.id} className="flex items-center gap-3 py-1.5 px-3 bg-white rounded-xl border border-gray-100">
                        <div className="w-2 h-2 rounded-full bg-purple-300 flex-shrink-0" />
                        <span className="text-sm font-medium text-gray-800 flex-1">{sp.name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${statusColor[sp.status]}`}>{statusLabel[sp.status]}</span>
                        <span className="text-xs text-gray-400">{sp.tasks.length} משימות</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <ProjectModal project={editProject} onClose={() => { setShowModal(false); setEditProject(null); }} onSave={handleSave} />
      )}
      {printProject && (
        <ProjectPrint project={printProject} onClose={() => setPrintProject(null)} />
      )}
    </div>
  );
}
