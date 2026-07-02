import { useForm } from 'react-hook-form';
import { X, Loader2 } from 'lucide-react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { useQuery } from '@tanstack/react-query';
import { Client } from '../../types';

const MEETING_TYPES = ['אימון עסקי', 'סקירת ביצועים', 'תכנון אסטרטגי', 'פגישת מעקב', 'פגישת היכרות', 'אחר'];

interface Props {
  clientId?: string;
  onClose: () => void;
  onSaved: () => void;
}

export default function MeetingModal({ clientId, onClose, onSaved }: Props) {
  const { data: clients = [] } = useQuery<Client[]>({
    queryKey: ['clients'],
    queryFn: () => api.get('/clients?status=ACTIVE').then(r => r.data),
    enabled: !clientId,
  });

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 16);

  const { register, handleSubmit, formState: { isSubmitting } } = useForm({
    defaultValues: {
      clientId: clientId ?? '',
      date: dateStr,
      duration: 60,
      type: 'אימון עסקי',
      notes: '',
    },
  });

  const onSubmit = async (data: any) => {
    try {
      await api.post('/meetings', data);
      toast.success('הפגישה נקבעה בהצלחה');
      onSaved();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'שגיאה');
    }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal animate-fade-in">
        <div className="modal-header">
          <h2 className="font-semibold text-slate-900">פגישה חדשה</h2>
          <button onClick={onClose} className="btn-ghost p-1.5 rounded-lg"><X className="w-4 h-4" /></button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          {!clientId && (
            <div>
              <label className="label">לקוח *</label>
              <select {...register('clientId', { required: true })} className="input">
                <option value="">בחר לקוח...</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.fullName}</option>)}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="label">תאריך ושעה *</label>
              <input {...register('date', { required: true })} type="datetime-local" className="input" />
            </div>
            <div>
              <label className="label">משך (דקות)</label>
              <input {...register('duration', { required: true, min: 15 })} type="number" min={15} step={15} className="input" />
            </div>
            <div>
              <label className="label">סוג הפגישה</label>
              <select {...register('type')} className="input">
                {MEETING_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="label">הערות</label>
              <textarea {...register('notes')} className="input min-h-[80px] resize-none" placeholder="הערות לפגישה..." />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={isSubmitting} className="btn-primary flex-1 justify-center py-2.5">
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'קבע פגישה'}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary px-6">ביטול</button>
          </div>
        </form>
      </div>
    </div>
  );
}
