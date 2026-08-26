import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import api from '../../services/api';
import type { Project, ProjectStatusType } from './index';

interface Client { id: string; fullName: string; businessName?: string; }

interface Props {
  project: Project | null;
  onClose: () => void;
  onSave: (p: Project) => void;
}

export default function ProjectModal({ project, onClose, onSave }: Props) {
  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState(project?.client.id ?? '');
  const [name, setName] = useState(project?.name ?? '');
  const [description, setDescription] = useState(project?.description ?? '');
  const [status, setStatus] = useState<ProjectStatusType>(project?.status ?? 'PLANNING');
  const [startDate, setStartDate] = useState(project?.startDate?.slice(0, 10) ?? '');
  const [endDate, setEndDate] = useState(project?.endDate?.slice(0, 10) ?? '');
  const [budget, setBudget] = useState(project?.budget?.toString() ?? '');
  const [strategy, setStrategy] = useState(project?.strategy ?? '');
  const [goals, setGoals] = useState(project?.goals ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/clients').then((r: { data: Client[] }) => setClients(r.data));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientId || !name) return;
    setSaving(true);
    try {
      const payload = { clientId, name, description, status, startDate: startDate || null, endDate: endDate || null, budget: budget || null, strategy, goals };
      const res = project
        ? await api.put(`/projects/${project.id}`, payload)
        : await api.post('/projects', payload);
      onSave(res.data);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" dir="rtl">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-bold text-gray-900">{project ? 'עריכת פרויקט' : 'פרויקט חדש'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X className="w-5 h-5" /></button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">לקוח *</label>
              <select value={clientId} onChange={e => setClientId(e.target.value)} required className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400">
                <option value="">בחר לקוח</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.fullName}{c.businessName ? ` — ${c.businessName}` : ''}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">שם הפרויקט *</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} required placeholder="לדוגמה: קמפיין חורף 2026" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">סטטוס</label>
              <select value={status} onChange={e => setStatus(e.target.value as ProjectStatusType)} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400">
                <option value="PLANNING">תכנון</option>
                <option value="ACTIVE">פעיל</option>
                <option value="ON_HOLD">מושהה</option>
                <option value="COMPLETED">הושלם</option>
                <option value="CANCELLED">בוטל</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">תקציב (₪)</label>
              <input type="number" value={budget} onChange={e => setBudget(e.target.value)} placeholder="0" min={0} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">תאריך התחלה</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">תאריך סיום</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">תיאור הפרויקט</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 resize-none" placeholder="תיאור קצר של הפרויקט" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">יעדי הקמפיין / אסטרטגיה</label>
            <textarea value={goals} onChange={e => setGoals(e.target.value)} rows={2} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 resize-none" placeholder="מה אנחנו רוצים להשיג? מי קהל היעד?" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">אסטרטגיה שיווקית</label>
            <textarea value={strategy} onChange={e => setStrategy(e.target.value)} rows={3} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 resize-none" placeholder="ערוצי שיווק, מסרים, תדירות פרסום..." />
          </div>
        </form>

        <div className="flex gap-3 px-6 py-4 border-t justify-end">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">ביטול</button>
          <button onClick={handleSubmit as unknown as React.MouseEventHandler} disabled={saving} className="px-5 py-2 rounded-xl bg-purple-600 text-white text-sm font-medium hover:bg-purple-700 disabled:opacity-50">
            {saving ? 'שומר...' : 'שמור'}
          </button>
        </div>
      </div>
    </div>
  );
}
