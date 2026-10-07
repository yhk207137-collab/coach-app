import { useState } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { ArrowRight, Phone, Mail, Building2, Edit2, Check, Plus, MessageSquare, CalendarClock, Users } from 'lucide-react';
import api from '../../services/api';
import type { Lead, LeadStage } from './index';
import { useNavigate } from 'react-router-dom';

interface Props {
  lead: Lead;
  onBack: () => void;
  stages: { key: LeadStage; label: string; icon: string; color: string; bg: string }[];
}

const ACTIVITY_TYPES = [
  { key: 'call', label: 'שיחת טלפון', icon: '📞' },
  { key: 'email', label: 'מייל', icon: '✉️' },
  { key: 'meeting', label: 'פגישה', icon: '🤝' },
  { key: 'note', label: 'הערה', icon: '📝' },
  { key: 'followup', label: 'מעקב', icon: '🔔' },
];

export default function LeadDetail({ lead, onBack, stages }: Props) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [editStage, setEditStage] = useState(false);
  const [newActivity, setNewActivity] = useState({ type: 'note', notes: '', dueDate: '' });
  const [showActivityForm, setShowActivityForm] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Lead> | null>(null);

  const { data: activities = [] } = useQuery({
    queryKey: ['lead-activities', lead.id],
    queryFn: () => api.get(`/leads/${lead.id}/activities`).then(r => r.data),
  });

  const stageMut = useMutation({
    mutationFn: (stage: LeadStage) => api.put(`/leads/${lead.id}`, { ...lead, stage }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['leads'] }); setEditStage(false); },
  });

  const actMut = useMutation({
    mutationFn: () => api.post(`/leads/${lead.id}/activities`, newActivity),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lead-activities', lead.id] });
      qc.invalidateQueries({ queryKey: ['leads'] });
      setNewActivity({ type: 'note', notes: '', dueDate: '' });
      setShowActivityForm(false);
    },
  });

  const doneMut = useMutation({
    mutationFn: (id: string) => api.patch(`/leads/activities/${id}/done`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lead-activities', lead.id] }),
  });

  const updateMut = useMutation({
    mutationFn: (data: Partial<Lead>) => api.put(`/leads/${lead.id}`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['leads'] }); setEditForm(null); },
  });

  const convertMut = useMutation({
    mutationFn: () => api.post('/clients', {
      fullName: lead.fullName,
      email: lead.email ?? '',
      phone: lead.phone,
      businessName: lead.company,
      notes: lead.notes,
    }),
    onSuccess: async (res) => {
      await api.put(`/leads/${lead.id}`, { ...lead, stage: 'WON' });
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['clients'] });
      navigate(`/clients/${res.data.id}`);
    },
  });

  const currentStage = stages.find(s => s.key === lead.stage)!;

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-2 text-slate-500 hover:text-slate-800 mb-4 text-sm">
        <ArrowRight className="w-4 h-4" /> חזור ללידים
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main info */}
        <div className="lg:col-span-2 space-y-4">
          <div className="card">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h1 className="text-2xl font-bold text-slate-900">{lead.fullName}</h1>
                {lead.company && <p className="text-slate-500 flex items-center gap-1 mt-1"><Building2 className="w-4 h-4" />{lead.company}</p>}
              </div>
              <button onClick={() => setEditForm(lead)} className="p-2 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100">
                <Edit2 className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {lead.phone && (
                <a href={`tel:${lead.phone}`} className="flex items-center gap-2 text-sm text-primary-600 hover:underline">
                  <Phone className="w-4 h-4" />{lead.phone}
                </a>
              )}
              {lead.email && (
                <a href={`mailto:${lead.email}`} className="flex items-center gap-2 text-sm text-primary-600 hover:underline">
                  <Mail className="w-4 h-4" />{lead.email}
                </a>
              )}
              {lead.source && <p className="text-sm text-slate-600"><span className="font-medium">מקור:</span> {lead.source}</p>}
              {lead.estimatedValue ? <p className="text-sm font-bold text-emerald-700">ערך: ₪{lead.estimatedValue.toLocaleString()}</p> : null}
            </div>

            {lead.notes && <p className="mt-3 text-sm text-slate-600 bg-slate-50 rounded-lg p-3">{lead.notes}</p>}
          </div>

          {/* Activities */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-slate-900">ציר זמן</h2>
              <button onClick={() => setShowActivityForm(v => !v)} className="btn-primary text-sm flex items-center gap-1 py-1.5 px-3">
                <Plus className="w-3.5 h-3.5" /> הוסף פעילות
              </button>
            </div>

            {showActivityForm && (
              <div className="bg-slate-50 rounded-xl p-4 mb-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="form-label">סוג</label>
                    <select className="form-input text-sm" value={newActivity.type} onChange={e => setNewActivity(a => ({ ...a, type: e.target.value }))}>
                      {ACTIVITY_TYPES.map(t => <option key={t.key} value={t.key}>{t.icon} {t.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="form-label">תאריך יעד (אופציונלי)</label>
                    <input type="datetime-local" className="form-input text-sm" value={newActivity.dueDate} onChange={e => setNewActivity(a => ({ ...a, dueDate: e.target.value }))} />
                  </div>
                </div>
                <div>
                  <label className="form-label">פרטים *</label>
                  <textarea className="form-input text-sm" rows={2} value={newActivity.notes} onChange={e => setNewActivity(a => ({ ...a, notes: e.target.value }))} placeholder="מה קרה? מה דובר?" />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => actMut.mutate()} disabled={!newActivity.notes || actMut.isPending} className="btn-primary text-sm py-1.5">שמור</button>
                  <button onClick={() => setShowActivityForm(false)} className="btn-secondary text-sm py-1.5">ביטול</button>
                </div>
              </div>
            )}

            <div className="space-y-3">
              {activities.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-6">אין פעילויות עדיין</p>
              ) : activities.map((act: any) => {
                const t = ACTIVITY_TYPES.find(x => x.key === act.type);
                return (
                  <div key={act.id} className={`flex gap-3 items-start ${act.done ? 'opacity-50' : ''}`}>
                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-base flex-shrink-0">{t?.icon ?? '📝'}</div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-700">{t?.label ?? act.type}</span>
                        <span className="text-xs text-slate-400">{new Date(act.createdAt).toLocaleDateString('he-IL')}</span>
                        {act.dueDate && !act.done && (
                          <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded flex items-center gap-1">
                            <CalendarClock className="w-3 h-3" />{new Date(act.dueDate).toLocaleDateString('he-IL')}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-600 mt-0.5">{act.notes}</p>
                    </div>
                    {!act.done && (
                      <button onClick={() => doneMut.mutate(act.id)} className="p-1.5 text-slate-400 hover:text-emerald-600 rounded" title="סמן כבוצע">
                        <Check className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Stage */}
          <div className="card">
            <h3 className="font-semibold text-slate-900 mb-3">שלב במשפך</h3>
            <div className="space-y-2">
              {stages.map((s, i) => (
                <button
                  key={s.key}
                  onClick={() => stageMut.mutate(s.key)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                    lead.stage === s.key
                      ? `${s.bg} border-2 ${s.color}`
                      : 'border-2 border-transparent text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  <span>{s.icon}</span>
                  <span>{s.label}</span>
                  {lead.stage === s.key && <Check className="w-3.5 h-3.5 mr-auto" />}
                </button>
              ))}
            </div>
          </div>

          {/* Convert to client */}
          {lead.stage !== 'WON' && lead.stage !== 'LOST' && lead.email && (
            <button
              onClick={() => convertMut.mutate()}
              disabled={convertMut.isPending}
              className="w-full btn-primary flex items-center justify-center gap-2 py-3"
            >
              <Users className="w-4 h-4" />
              {convertMut.isPending ? 'ממיר...' : 'המר ללקוח פעיל →'}
            </button>
          )}
        </div>
      </div>

      {/* Edit modal */}
      {editForm && (
        <div className="modal-overlay" onClick={() => setEditForm(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">עריכת ליד</h2>
              <button onClick={() => setEditForm(null)} className="modal-close"><span className="text-xl">×</span></button>
            </div>
            <div className="space-y-4">
              {[
                { key: 'fullName', label: 'שם', type: 'text' },
                { key: 'email', label: 'מייל', type: 'email' },
                { key: 'phone', label: 'טלפון', type: 'text' },
                { key: 'company', label: 'חברה', type: 'text' },
                { key: 'source', label: 'מקור', type: 'text' },
                { key: 'estimatedValue', label: 'ערך משוער', type: 'number' },
              ].map(f => (
                <div key={f.key}>
                  <label className="form-label">{f.label}</label>
                  <input
                    className="form-input"
                    type={f.type}
                    value={(editForm as any)[f.key] ?? ''}
                    onChange={e => setEditForm(ef => ({ ...ef!, [f.key]: e.target.value }))}
                  />
                </div>
              ))}
              <div>
                <label className="form-label">הערות</label>
                <textarea className="form-input" rows={3} value={editForm.notes ?? ''} onChange={e => setEditForm(ef => ({ ...ef!, notes: e.target.value }))} />
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setEditForm(null)} className="btn-secondary">ביטול</button>
              <button onClick={() => updateMut.mutate(editForm)} disabled={updateMut.isPending} className="btn-primary">שמור</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
