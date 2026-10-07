import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import api from '../../services/api';
import type { LeadStage } from './index';

interface Props {
  onClose: () => void;
  stages: { key: LeadStage; label: string; icon: string }[];
  initial?: Partial<{ fullName: string; stage: LeadStage }>;
}

const SOURCES = ['המלצה', 'פייסבוק', 'אינסטגרם', 'גוגל', 'לינקדאין', 'אתר', 'קר', 'אחר'];

export default function LeadModal({ onClose, stages, initial }: Props) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    fullName: initial?.fullName ?? '',
    email: '',
    phone: '',
    company: '',
    source: '',
    stage: initial?.stage ?? 'COLD' as LeadStage,
    notes: '',
    estimatedValue: '',
  });

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const mut = useMutation({
    mutationFn: () => api.post('/leads', form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['leads'] }); onClose(); },
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">ליד חדש</h2>
          <button onClick={onClose} className="modal-close"><X className="w-5 h-5" /></button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="form-label">שם מלא *</label>
            <input className="form-input" value={form.fullName} onChange={e => set('fullName', e.target.value)} placeholder="שם הליד" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">טלפון</label>
              <input className="form-input" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="050-0000000" />
            </div>
            <div>
              <label className="form-label">מייל</label>
              <input className="form-input" type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="email@example.com" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">חברה / עסק</label>
              <input className="form-input" value={form.company} onChange={e => set('company', e.target.value)} placeholder="שם העסק" />
            </div>
            <div>
              <label className="form-label">מקור</label>
              <select className="form-input" value={form.source} onChange={e => set('source', e.target.value)}>
                <option value="">בחר מקור</option>
                {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">שלב</label>
              <select className="form-input" value={form.stage} onChange={e => set('stage', e.target.value as LeadStage)}>
                {stages.map(s => <option key={s.key} value={s.key}>{s.icon} {s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">ערך משוער (₪)</label>
              <input className="form-input" type="number" value={form.estimatedValue} onChange={e => set('estimatedValue', e.target.value)} placeholder="0" />
            </div>
          </div>

          <div>
            <label className="form-label">הערות</label>
            <textarea className="form-input" rows={3} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="פרטים נוספים..." />
          </div>
        </div>

        <div className="modal-footer">
          <button onClick={onClose} className="btn-secondary">ביטול</button>
          <button
            onClick={() => mut.mutate()}
            disabled={!form.fullName || mut.isPending}
            className="btn-primary"
          >
            {mut.isPending ? 'שומר...' : 'הוסף ליד'}
          </button>
        </div>
      </div>
    </div>
  );
}
