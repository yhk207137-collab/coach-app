import { useState } from 'react';
import { ArrowRight, Plus, Trash2, Edit2, CheckSquare, Square, FolderOpen } from 'lucide-react';
import api from '../../services/api';
import type { Project, SubProject, ProjectStatusType } from './index';

const statusLabel: Record<ProjectStatusType, string> = {
  PLANNING: 'תכנון', ACTIVE: 'פעיל', ON_HOLD: 'מושהה', COMPLETED: 'הושלם', CANCELLED: 'בוטל',
};

interface Props {
  project: Project;
  onBack: () => void;
}

export default function ProjectDetail({ project: initial, onBack }: Props) {
  const [project, setProject] = useState(initial);
  const [newSubName, setNewSubName] = useState('');
  const [addingTask, setAddingTask] = useState<string | null>(null); // subId or 'root'
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [editSubId, setEditSubId] = useState<string | null>(null);
  const [editSubName, setEditSubName] = useState('');

  const reload = async () => {
    const res = await api.get(`/projects/${project.id}`);
    setProject(res.data);
  };

  const addSubProject = async () => {
    if (!newSubName.trim()) return;
    await api.post(`/projects/${project.id}/subprojects`, { name: newSubName, status: 'PLANNING' });
    setNewSubName('');
    await reload();
  };

  const deleteSubProject = async (subId: string) => {
    if (!confirm('למחוק תת-פרויקט זה?')) return;
    await api.delete(`/projects/subprojects/${subId}`);
    await reload();
  };

  const saveSubName = async (sub: SubProject) => {
    await api.put(`/projects/subprojects/${sub.id}`, { name: editSubName, status: sub.status });
    setEditSubId(null);
    await reload();
  };

  const addTask = async (subProjectId: string | null) => {
    if (!newTaskTitle.trim()) return;
    await api.post('/tasks', { clientId: project.client.id, projectId: project.id, subProjectId, title: newTaskTitle });
    setNewTaskTitle('');
    setAddingTask(null);
    await reload();
  };

  const toggleTask = async (taskId: string, done: boolean) => {
    await api.put(`/tasks/${taskId}`, { status: done ? 'COMPLETED' : 'PENDING' });
    await reload();
  };

  const deleteTask = async (taskId: string) => {
    await api.delete(`/tasks/${taskId}`);
    await reload();
  };

  const TaskList = ({ tasks, scopeId }: { tasks: Project['tasks']; scopeId: string | null }) => (
    <div className="space-y-1.5">
      {tasks.map(t => (
        <div key={t.id} className="flex items-center gap-2 group">
          <button onClick={() => toggleTask(t.id, t.status !== 'COMPLETED')} className="text-gray-400 hover:text-purple-600 flex-shrink-0">
            {t.status === 'COMPLETED' ? <CheckSquare className="w-4 h-4 text-green-500" /> : <Square className="w-4 h-4" />}
          </button>
          <span className={`text-sm flex-1 ${t.status === 'COMPLETED' ? 'line-through text-gray-400' : 'text-gray-700'}`}>{t.title}</span>
          <button onClick={() => deleteTask(t.id)} className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
      {addingTask === (scopeId ?? 'root') ? (
        <div className="flex gap-2 mt-2">
          <input
            autoFocus
            type="text"
            value={newTaskTitle}
            onChange={e => setNewTaskTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addTask(scopeId); if (e.key === 'Escape') setAddingTask(null); }}
            placeholder="שם המשימה..."
            className="flex-1 border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
          />
          <button onClick={() => addTask(scopeId)} className="px-3 py-1 bg-purple-600 text-white text-sm rounded-lg">הוסף</button>
          <button onClick={() => setAddingTask(null)} className="px-2 py-1 text-gray-400 text-sm">ביטול</button>
        </div>
      ) : (
        <button onClick={() => { setAddingTask(scopeId ?? 'root'); setNewTaskTitle(''); }} className="flex items-center gap-1 text-xs text-purple-500 hover:text-purple-700 mt-1">
          <Plus className="w-3.5 h-3.5" /> הוסף משימה
        </button>
      )}
    </div>
  );

  return (
    <div dir="rtl">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} className="flex items-center gap-1.5 text-gray-500 hover:text-gray-800 text-sm">
          <ArrowRight className="w-4 h-4" /> חזרה לפרויקטים
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{project.name}</h1>
            <p className="text-sm text-gray-500 mt-0.5">{project.client.fullName}{project.client.businessName ? ` — ${project.client.businessName}` : ''}</p>
            {project.description && <p className="text-sm text-gray-600 mt-2">{project.description}</p>}
          </div>
          <span className="text-sm px-3 py-1 bg-purple-100 text-purple-700 rounded-full font-medium">{statusLabel[project.status]}</span>
        </div>
        {(project.goals || project.strategy || project.budget) && (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-gray-50">
            {project.budget && (
              <div>
                <div className="text-xs text-gray-400 mb-1">תקציב</div>
                <div className="font-semibold text-gray-800">₪{project.budget.toLocaleString('he-IL')}</div>
              </div>
            )}
            {project.goals && (
              <div>
                <div className="text-xs text-gray-400 mb-1">יעדים</div>
                <div className="text-sm text-gray-700 whitespace-pre-wrap">{project.goals}</div>
              </div>
            )}
            {project.strategy && (
              <div className="sm:col-span-2">
                <div className="text-xs text-gray-400 mb-1">אסטרטגיה שיווקית</div>
                <div className="text-sm text-gray-700 whitespace-pre-wrap">{project.strategy}</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Root-level tasks */}
      {(project.tasks.length > 0 || addingTask === 'root') && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-4">
          <h3 className="font-semibold text-gray-700 mb-3 text-sm">משימות כלליות</h3>
          <TaskList tasks={project.tasks} scopeId={null} />
        </div>
      )}
      {addingTask !== 'root' && project.tasks.length === 0 && (
        <button onClick={() => { setAddingTask('root'); setNewTaskTitle(''); }} className="flex items-center gap-1.5 text-sm text-purple-500 hover:text-purple-700 mb-4">
          <Plus className="w-4 h-4" /> הוסף משימה כללית
        </button>
      )}

      {/* Sub-projects */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-gray-800">תת-פרויקטים</h2>
          <span className="text-sm text-gray-400">{project.subProjects.length}</span>
        </div>

        {project.subProjects.map(sp => (
          <div key={sp.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center gap-3 mb-3">
              <FolderOpen className="w-4 h-4 text-purple-400 flex-shrink-0" />
              {editSubId === sp.id ? (
                <div className="flex gap-2 flex-1">
                  <input autoFocus value={editSubName} onChange={e => setEditSubName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveSubName(sp); if (e.key === 'Escape') setEditSubId(null); }}
                    className="flex-1 border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                  />
                  <button onClick={() => saveSubName(sp)} className="text-purple-600 text-sm font-medium">שמור</button>
                  <button onClick={() => setEditSubId(null)} className="text-gray-400 text-sm">ביטול</button>
                </div>
              ) : (
                <>
                  <h3 className="font-semibold text-gray-800 flex-1">{sp.name}</h3>
                  <span className="text-xs text-gray-400">{statusLabel[sp.status]}</span>
                  <button onClick={() => { setEditSubId(sp.id); setEditSubName(sp.name); }} className="text-gray-300 hover:text-purple-500"><Edit2 className="w-3.5 h-3.5" /></button>
                  <button onClick={() => deleteSubProject(sp.id)} className="text-gray-300 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                </>
              )}
            </div>
            <TaskList tasks={sp.tasks} scopeId={sp.id} />
          </div>
        ))}

        <div className="flex gap-2">
          <input
            type="text"
            value={newSubName}
            onChange={e => setNewSubName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addSubProject()}
            placeholder="שם תת-פרויקט חדש..."
            className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
          />
          <button onClick={addSubProject} className="px-4 py-2 bg-purple-600 text-white rounded-xl text-sm hover:bg-purple-700">
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
