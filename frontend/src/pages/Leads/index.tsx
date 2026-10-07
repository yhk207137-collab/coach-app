import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Phone, Mail, Building2, Flame, ChevronDown, X, ArrowRight, Trash2 } from 'lucide-react';
import api from '../../services/api';
import LeadModal from './LeadModal';
import LeadDetail from './LeadDetail';

export type LeadStage = 'COLD' | 'WARM' | 'HOT' | 'PROPOSAL' | 'WON' | 'LOST';

export interface Lead {
  id: string;
  fullName: string;
  email?: string;
  phone?: string;
  company?: string;
  source?: string;
  stage: LeadStage;
  notes?: string;
  estimatedValue?: number;
  activities: any[];
  createdAt: string;
}

const STAGES: { key: LeadStage; label: string; icon: string; color: string; bg: string }[] = [
  { key: 'COLD',     label: 'קר',         icon: '🧊', color: 'text-blue-600',   bg: 'bg-blue-50 border-blue-200' },
  { key: 'WARM',     label: 'פושר',       icon: '🌤️', color: 'text-yellow-600', bg: 'bg-yellow-50 border-yellow-200' },
  { key: 'HOT',      label: 'חם',          icon: '🔥', color: 'text-orange-600', bg: 'bg-orange-50 border-orange-200' },
  { key: 'PROPOSAL', label: 'הצעה נשלחה', icon: '📄', color: 'text-purple-600', bg: 'bg-purple-50 border-purple-200' },
  { key: 'WON',      label: 'סגור ✓',     icon: '✅', color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200' },
  { key: 'LOST',     label: 'לא סגר',     icon: '❌', color: 'text-slate-500',  bg: 'bg-slate-50 border-slate-200' },
];

export default function LeadsPage() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [view, setView] = useState<'kanban' | 'list'>('kanban');

  const { data: leads = [], isLoading } = useQuery<Lead[]>({
    queryKey: ['leads'],
    queryFn: () => api.get('/leads').then(r => r.data),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/leads/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leads'] }),
  });

  const stageMut = useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: LeadStage }) =>
      api.put(`/leads/${id}`, { stage }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leads'] }),
  });

  const byStage = (stage: LeadStage) => leads.filter(l => l.stage === stage);
  const totalValue = leads.filter(l => l.stage !== 'LOST').reduce((s, l) => s + (l.estimatedValue ?? 0), 0);
  const wonValue = leads.filter(l => l.stage === 'WON').reduce((s, l) => s + (l.estimatedValue ?? 0), 0);

  if (selectedLead) {
    const fresh = leads.find(l => l.id === selectedLead.id) ?? selectedLead;
    return <LeadDetail lead={fresh} onBack={() => setSelectedLead(null)} stages={STAGES} />;
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">CRM – לידים</h1>
          <p className="page-subtitle">ניהול משפך מכירות מהליד ועד לקוח פעיל</p>
        </div>
        <div className="flex gap-2 items-center">
          <button
            onClick={() => setView(v => v === 'kanban' ? 'list' : 'kanban')}
            className="btn-secondary text-sm"
          >
            {view === 'kanban' ? 'תצוגת רשימה' : 'תצוגת Kanban'}
          </button>
          <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> ליד חדש
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'סה"כ לידים', value: leads.filter(l => l.stage !== 'LOST').length, color: 'text-slate-800' },
          { label: 'ערך pipeline', value: `₪${totalValue.toLocaleString()}`, color: 'text-blue-700' },
          { label: 'סגורים', value: leads.filter(l => l.stage === 'WON').length, color: 'text-emerald-700' },
          { label: 'ערך סגור', value: `₪${wonValue.toLocaleString()}`, color: 'text-emerald-700' },
        ].map(kpi => (
          <div key={kpi.label} className="card py-3 px-4">
            <p className="text-xs text-slate-500 mb-1">{kpi.label}</p>
            <p className={`text-xl font-bold ${kpi.color}`}>{kpi.value}</p>
          </div>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : view === 'kanban' ? (
        <div className="overflow-x-auto">
          <div className="flex gap-4 pb-4" style={{ minWidth: '900px' }}>
            {STAGES.map(stage => {
              const cards = byStage(stage.key);
              return (
                <div key={stage.key} className={`flex-1 min-w-[160px] rounded-xl border-2 ${stage.bg}`}>
                  <div className="px-3 py-2 border-b border-current/10">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold">{stage.icon} {stage.label}</span>
                      <span className="text-xs bg-white/70 px-2 py-0.5 rounded-full font-medium">{cards.length}</span>
                    </div>
                  </div>
                  <div className="p-2 space-y-2 min-h-[120px]">
                    {cards.map(lead => (
                      <div
                        key={lead.id}
                        onClick={() => setSelectedLead(lead)}
                        className="bg-white rounded-lg p-3 shadow-sm cursor-pointer hover:shadow-md transition-shadow border border-slate-100"
                      >
                        <p className="font-semibold text-slate-800 text-sm mb-1 line-clamp-1">{lead.fullName}</p>
                        {lead.company && <p className="text-xs text-slate-500 flex items-center gap-1 mb-1"><Building2 className="w-3 h-3" />{lead.company}</p>}
                        {lead.phone && <p className="text-xs text-slate-500 flex items-center gap-1"><Phone className="w-3 h-3" />{lead.phone}</p>}
                        {lead.estimatedValue ? (
                          <p className="text-xs font-bold text-emerald-600 mt-1">₪{lead.estimatedValue.toLocaleString()}</p>
                        ) : null}
                        {lead.source && <span className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded mt-1 inline-block">{lead.source}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="table-header">שם</th>
                <th className="table-header">חברה</th>
                <th className="table-header">טלפון</th>
                <th className="table-header">מקור</th>
                <th className="table-header">שלב</th>
                <th className="table-header">ערך</th>
                <th className="table-header">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {leads.map(lead => {
                const stg = STAGES.find(s => s.key === lead.stage)!;
                return (
                  <tr key={lead.id} className="table-row">
                    <td className="table-cell font-semibold cursor-pointer hover:text-primary-600" onClick={() => setSelectedLead(lead)}>{lead.fullName}</td>
                    <td className="table-cell text-slate-600">{lead.company || '—'}</td>
                    <td className="table-cell">{lead.phone ? <a href={`tel:${lead.phone}`} className="text-primary-600">{lead.phone}</a> : '—'}</td>
                    <td className="table-cell text-slate-500">{lead.source || '—'}</td>
                    <td className="table-cell">
                      <select
                        value={lead.stage}
                        onChange={e => stageMut.mutate({ id: lead.id, stage: e.target.value as LeadStage })}
                        onClick={e => e.stopPropagation()}
                        className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white"
                      >
                        {STAGES.map(s => <option key={s.key} value={s.key}>{s.icon} {s.label}</option>)}
                      </select>
                    </td>
                    <td className="table-cell font-bold text-emerald-700">{lead.estimatedValue ? `₪${lead.estimatedValue.toLocaleString()}` : '—'}</td>
                    <td className="table-cell">
                      <button onClick={() => deleteMut.mutate(lead.id)} className="p-1.5 text-slate-400 hover:text-red-500 rounded"><Trash2 className="w-4 h-4" /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {leads.length === 0 && (
            <div className="text-center py-12 text-slate-400">
              <Flame className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>אין לידים עדיין</p>
            </div>
          )}
        </div>
      )}

      {showModal && (
        <LeadModal
          onClose={() => setShowModal(false)}
          stages={STAGES}
        />
      )}
    </div>
  );
}
