import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { X, Loader2 } from 'lucide-react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import clsx from 'clsx';

interface Props {
  meetingId: string;
  onClose: () => void;
  onSaved: () => void;
  prefill?: any;
}

export default function SummaryModal({ meetingId, onClose, onSaved, prefill }: Props) {
  const [type, setType] = useState<'STRUCTURED' | 'FREE'>('STRUCTURED');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);

  const { register, handleSubmit, setValue, formState: { isSubmitting } } = useForm({
    defaultValues: {
      goal: prefill?.goal ?? '',
      progress: prefill?.progress ?? '',
      challenges: prefill?.challenges ?? '',
      decisions: prefill?.decisions ?? '',
      conclusions: prefill?.conclusions ?? '',
      freeText: prefill?.freeText ?? '',
      notes: prefill?.notes ?? '',
    },
  });

  const addTag = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const t = tagInput.trim().replace(/^#/, '');
      if (t && !tags.includes(t)) setTags([...tags, t]);
      setTagInput('');
    }
  };

  const onSubmit = async (data: any) => {
    try {
      await api.post('/summaries', { ...data, meetingId, type, tags });
      toast.success('הסיכום נשמר');
      onSaved();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'שגיאה');
    }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal w-full max-w-2xl animate-fade-in">
        <div className="modal-header">
          <h2 className="font-semibold text-slate-900">סיכום פגישה</h2>
          <button onClick={onClose} className="btn-ghost p-1.5 rounded-lg"><X className="w-4 h-4" /></button>
        </div>

        <div className="px-6 pt-4">
          <div className="flex gap-2">
            {(['STRUCTURED', 'FREE'] as const).map(t => (
              <button key={t} type="button" onClick={() => setType(t)}
                className={clsx('btn text-sm', type === t ? 'btn-primary' : 'btn-secondary')}>
                {t === 'STRUCTURED' ? 'טופס מובנה' : 'טקסט חופשי'}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          {type === 'STRUCTURED' ? (
            <>
              <Field label="מטרת הפגישה" name="goal" register={register} />
              <Field label="מה התקדם מהפגישה הקודמת" name="progress" register={register} />
              <Field label="אתגרים" name="challenges" register={register} />
              <Field label="החלטות שהתקבלו" name="decisions" register={register} />
              <Field label="מסקנות" name="conclusions" register={register} />
              <Field label="הערות נוספות" name="notes" register={register} />
            </>
          ) : (
            <div>
              <label className="label">סיכום חופשי</label>
              <textarea {...register('freeText')} className="input min-h-[200px] resize-none" placeholder="כתוב את הסיכום כאן..." />
            </div>
          )}

          {/* Tags */}
          <div>
            <label className="label">תגיות</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {tags.map(t => (
                <span key={t} className="badge bg-primary-50 text-primary-700 cursor-pointer"
                  onClick={() => setTags(tags.filter(x => x !== t))}>
                  #{t} ×
                </span>
              ))}
            </div>
            <input className="input" placeholder="הוסף תגית ולחץ Enter..." value={tagInput}
              onChange={e => setTagInput(e.target.value)} onKeyDown={addTag} />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={isSubmitting} className="btn-primary flex-1 justify-center py-2.5">
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'שמור סיכום'}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary px-6">ביטול</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, name, register }: { label: string; name: string; register: any }) {
  return (
    <div>
      <label className="label">{label}</label>
      <textarea {...register(name)} className="input min-h-[70px] resize-none" placeholder={`${label}...`} />
    </div>
  );
}
