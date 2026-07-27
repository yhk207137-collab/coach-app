import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { X, Loader2 } from 'lucide-react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { Task } from '../../types';

interface Props {
  clientId: string;
  meetingId?: string;
  task?: Task;
  onClose: () => void;
  onSaved: () => void;
}

export default function TaskModal({ clientId, meetingId, task, onClose, onSaved }: Props) {
  const isEdit = !!task;

  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm({
    defaultValues: { title: '', description: '', dueDate: '', status: 'PENDING' },
  });

  useEffect(() => {
    if (task) {
      reset({
        title: task.title,
        description: task.description ?? '',
        dueDate: task.dueDate ? task.dueDate.split('T')[0] : '',
        status: task.status,
      });
    }
  }, [task]);

  const onSubmit = async (data: any) => {
    try {
      if (isEdit) {
        await api.put(`/tasks/${task!.id}`, data);
        toast.success('המשימה עודכנה');
      } else {
        await api.post('/tasks', { ...data, clientId, meetingId });
        toast.success('משימה נוצרה');
      }
      onSaved();
    } catch {
      toast.error(isEdit ? 'שגיאה בעדכון המשימה' : 'שגיאה ביצירת המשימה');
    }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal animate-fade-in">
        <div className="modal-header">
          <h2 className="font-semibold text-slate-900">{isEdit ? 'עריכת משימה' : 'משימה חדשה'}</h2>
          <button onClick={onClose} className="btn-ghost p-1.5 rounded-lg"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          <div>
            <label className="label">כותרת *</label>
            <input {...register('title', { required: true })} className="input" placeholder="כותרת המשימה..." />
          </div>
          <div>
            <label className="label">תיאור</label>
            <textarea {...register('description')} className="input min-h-[80px] resize-none" placeholder="תיאור המשימה..." />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">תאריך יעד</label>
              <input {...register('dueDate')} type="date" className="input" />
            </div>
            <div>
              <label className="label">סטטוס</label>
              <select {...register('status')} className="input">
                <option value="PENDING">ממתין</option>
                <option value="IN_PROGRESS">בתהליך</option>
                <option value="COMPLETED">הושלם</option>
              </select>
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={isSubmitting} className="btn-primary flex-1 justify-center py-2.5">
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : isEdit ? 'שמור שינויים' : 'צור משימה'}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary px-6">ביטול</button>
          </div>
        </form>
      </div>
    </div>
  );
}
