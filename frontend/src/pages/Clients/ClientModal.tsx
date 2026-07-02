import { useForm } from 'react-hook-form';
import { X, Loader2 } from 'lucide-react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { Client } from '../../types';

interface Props {
  client?: Client;
  onClose: () => void;
  onSaved: () => void;
}

export default function ClientModal({ client, onClose, onSaved }: Props) {
  const { register, handleSubmit, formState: { isSubmitting } } = useForm({
    defaultValues: {
      fullName: client?.fullName ?? '',
      email: client?.email ?? '',
      phone: client?.phone ?? '',
      businessName: client?.businessName ?? '',
      businessField: client?.businessField ?? '',
      startDate: client?.startDate ? client.startDate.split('T')[0] : new Date().toISOString().split('T')[0],
      status: client?.status ?? 'ACTIVE',
      notes: client?.notes ?? '',
    },
  });

  const onSubmit = async (data: any) => {
    try {
      if (client) {
        await api.put(`/clients/${client.id}`, data);
        toast.success('הלקוח עודכן');
      } else {
        await api.post('/clients', data);
        toast.success('לקוח נוסף בהצלחה');
      }
      onSaved();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'שגיאה');
    }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal animate-fade-in">
        <div className="modal-header">
          <h2 className="font-semibold text-slate-900">{client ? 'עריכת לקוח' : 'לקוח חדש'}</h2>
          <button onClick={onClose} className="btn-ghost p-1.5 rounded-lg"><X className="w-4 h-4" /></button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="label">שם מלא *</label>
              <input {...register('fullName', { required: true })} className="input" placeholder="ישראל ישראלי" />
            </div>
            <div>
              <label className="label">דוא"ל *</label>
              <input {...register('email', { required: true })} type="email" className="input" dir="ltr" placeholder="email@example.com" />
            </div>
            <div>
              <label className="label">טלפון</label>
              <input {...register('phone')} className="input" dir="ltr" placeholder="050-0000000" />
            </div>
            <div>
              <label className="label">שם העסק</label>
              <input {...register('businessName')} className="input" placeholder="שם העסק" />
            </div>
            <div>
              <label className="label">תחום עיסוק</label>
              <input {...register('businessField')} className="input" placeholder="הייטק, מסחר..." />
            </div>
            <div>
              <label className="label">תאריך תחילת ליווי</label>
              <input {...register('startDate')} type="date" className="input" />
            </div>
            <div>
              <label className="label">סטטוס</label>
              <select {...register('status')} className="input">
                <option value="ACTIVE">פעיל</option>
                <option value="FROZEN">מוקפא</option>
                <option value="ENDED">הסתיים</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="label">הערות</label>
              <textarea {...register('notes')} className="input min-h-[80px] resize-none" placeholder="הערות נוספות..." />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={isSubmitting} className="btn-primary flex-1 justify-center py-2.5">
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : client ? 'שמור שינויים' : 'הוסף לקוח'}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary px-6">ביטול</button>
          </div>
        </form>
      </div>
    </div>
  );
}
