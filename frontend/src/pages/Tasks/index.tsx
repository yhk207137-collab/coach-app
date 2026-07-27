import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { CheckSquare, Circle, Clock, Pencil, Trash2 } from 'lucide-react';
import api from '../../services/api';
import { Task, TaskStatus } from '../../types';
import { format } from 'date-fns';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import TaskModal from './TaskModal';

const taskLabel: Record<TaskStatus, string> = { PENDING: 'ממתין', IN_PROGRESS: 'בתהליך', COMPLETED: 'הושלם' };
const taskClass: Record<TaskStatus, string> = { PENDING: 'task-pending', IN_PROGRESS: 'task-progress', COMPLETED: 'task-completed' };

const STATUS_CYCLE: Record<TaskStatus, TaskStatus> = {
  PENDING: 'IN_PROGRESS', IN_PROGRESS: 'COMPLETED', COMPLETED: 'PENDING',
};

export default function TasksPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<TaskStatus | ''>('');
  const [editTask, setEditTask] = useState<Task | null>(null);

  const { data: tasks = [], isLoading } = useQuery<Task[]>({
    queryKey: ['tasks', filter],
    queryFn: () => api.get(`/tasks${filter ? `?status=${filter}` : ''}`).then(r => r.data),
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: TaskStatus }) =>
      api.put(`/tasks/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
    onError: () => toast.error('שגיאה בעדכון'),
  });

  const deleteTask = useMutation({
    mutationFn: (id: string) => api.delete(`/tasks/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tasks'] }); toast.success('משימה נמחקה'); },
    onError: () => toast.error('שגיאה במחיקה'),
  });

  const handleDelete = (task: Task) => {
    if (confirm(`למחוק את המשימה "${task.title}"?`)) deleteTask.mutate(task.id);
  };

  const counts = tasks.reduce((acc, t) => { acc[t.status] = (acc[t.status] || 0) + 1; return acc; }, {} as Record<TaskStatus, number>);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">משימות</h1>
          <p className="page-subtitle">{tasks.length} משימות</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        {(['PENDING', 'IN_PROGRESS', 'COMPLETED'] as TaskStatus[]).map(s => (
          <button key={s} onClick={() => setFilter(filter === s ? '' : s)}
            className={clsx('card flex items-center gap-3 transition-all duration-150',
              filter === s ? 'ring-2 ring-primary-400' : '')}>
            <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center',
              s === 'PENDING' ? 'bg-slate-100' : s === 'IN_PROGRESS' ? 'bg-blue-50' : 'bg-emerald-50')}>
              {s === 'COMPLETED' ? <CheckSquare className="w-5 h-5 text-emerald-500" /> :
                s === 'IN_PROGRESS' ? <Clock className="w-5 h-5 text-blue-500" /> :
                  <Circle className="w-5 h-5 text-slate-400" />}
            </div>
            <div>
              <p className="text-xl font-bold text-slate-900">{counts[s] ?? 0}</p>
              <p className="text-xs text-slate-500">{taskLabel[s]}</p>
            </div>
          </button>
        ))}
      </div>

      <div className="card p-0 overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" /></div>
        ) : tasks.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <CheckSquare className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>אין משימות</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="table-header">משימה</th>
                <th className="table-header hidden md:table-cell">לקוח</th>
                <th className="table-header hidden lg:table-cell">תאריך יעד</th>
                <th className="table-header">סטטוס</th>
                <th className="table-header w-20" />
              </tr>
            </thead>
            <tbody>
              {tasks.map(task => (
                <tr key={task.id} className="table-row">
                  <td className="table-cell">
                    <p className="font-medium text-slate-800">{task.title}</p>
                    {task.description && <p className="text-xs text-slate-500 mt-0.5">{task.description}</p>}
                  </td>
                  <td className="table-cell hidden md:table-cell">
                    <button onClick={() => navigate(`/clients/${task.clientId}`)}
                      className="text-sm text-primary-600 hover:underline">
                      {task.client?.fullName}
                    </button>
                  </td>
                  <td className="table-cell hidden lg:table-cell text-slate-600">
                    {task.dueDate ? format(new Date(task.dueDate), 'd/M/yyyy') : '—'}
                  </td>
                  <td className="table-cell">
                    <button onClick={() => updateStatus.mutate({ id: task.id, status: STATUS_CYCLE[task.status] })}
                      className={clsx(taskClass[task.status], 'cursor-pointer hover:opacity-80 transition-opacity')}>
                      {taskLabel[task.status]}
                    </button>
                  </td>
                  <td className="table-cell">
                    <div className="flex items-center gap-1">
                      <button onClick={() => setEditTask(task)}
                        className="p-1.5 text-slate-400 hover:text-primary-600 rounded-lg hover:bg-slate-50 transition-colors">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDelete(task)}
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

      {editTask && (
        <TaskModal
          clientId={editTask.clientId}
          task={editTask}
          onClose={() => setEditTask(null)}
          onSaved={() => { qc.invalidateQueries({ queryKey: ['tasks'] }); setEditTask(null); }}
        />
      )}
    </div>
  );
}
