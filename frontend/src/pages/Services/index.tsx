import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Package, Edit2, Trash2, X, Check } from 'lucide-react';
import api from '../../services/api';

interface Service {
  id: string;
  name: string;
  description?: string;
  price: number;
  unit: string;
  isActive: boolean;
}

const UNITS = ['חד-פעמי', 'לחודש', 'לפגישה', 'לשעה', 'לשנה', 'לפרויקט'];

export default function ServicesPage() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Service | null>(null);
  const [form, setForm] = useState({ name: '', description: '', price: '', unit: 'חד-פעמי' });

  const { data: services = [], isLoading } = useQuery<Service[]>({
    queryKey: ['services'],
    queryFn: () => api.get('/services').then(r => r.data),
  });

  const createMut = useMutation({
    mutationFn: () => api.post('/services', form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['services'] }); setShowModal(false); setForm({ name: '', description: '', price: '', unit: 'חד-פעמי' }); },
  });

  const updateMut = useMutation({
    mutationFn: (data: Partial<Service>) => api.put(`/services/${editing!.id}`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['services'] }); setEditing(null); },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/services/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['services'] }),
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.put(`/services/${id}`, { isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['services'] }),
  });

  const openEdit = (s: Service) => {
    setEditing(s);
    setForm({ name: s.name, description: s.description ?? '', price: String(s.price), unit: s.unit });
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">קטלוג שירותים</h1>
          <p className="page-subtitle">המוצרים והשירותים שאתה מציע ומחיריהם</p>
        </div>
        <button onClick={() => { setShowModal(true); setForm({ name: '', description: '', price: '', unit: 'חד-פעמי' }); }} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> שירות חדש
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : services.length === 0 ? (
        <div className="card text-center py-16 text-slate-400">
          <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium mb-1">אין שירותים עדיין</p>
          <p className="text-sm">הגדר את השירותים שלך ותוכל לבחור מהם בעת יצירת הצעת מחיר או חשבונית</p>
          <button onClick={() => setShowModal(true)} className="btn-primary mt-4 text-sm">הוסף שירות ראשון</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {services.map(s => (
            <div key={s.id} className={`card ${!s.isActive ? 'opacity-50' : ''}`}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 bg-primary-50 rounded-xl flex items-center justify-center">
                    <Package className="w-4.5 h-4.5 text-primary-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-800">{s.name}</p>
                    <p className="text-xs text-slate-400">{s.unit}</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => openEdit(s)} className="p-1.5 text-slate-400 hover:text-slate-700 rounded"><Edit2 className="w-3.5 h-3.5" /></button>
                  <button onClick={() => { if (confirm('למחוק שירות?')) deleteMut.mutate(s.id); }} className="p-1.5 text-slate-400 hover:text-red-500 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
              {s.description && <p className="text-sm text-slate-500 mb-3">{s.description}</p>}
              <div className="flex items-center justify-between">
                <p className="text-xl font-bold text-emerald-700">₪{s.price.toLocaleString()}</p>
                <button
                  onClick={() => toggleMut.mutate({ id: s.id, isActive: !s.isActive })}
                  className={`text-xs px-2 py-1 rounded-full font-medium ${s.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}
                >
                  {s.isActive ? '● פעיל' : '○ לא פעיל'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {(showModal || editing) && (
        <div className="modal-overlay" onClick={() => { setShowModal(false); setEditing(null); }}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">{editing ? 'עריכת שירות' : 'שירות חדש'}</h2>
              <button onClick={() => { setShowModal(false); setEditing(null); }} className="modal-close"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="form-label">שם השירות *</label>
                <input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="ניהול רשתות חברתיות" />
              </div>
              <div>
                <label className="form-label">תיאור קצר</label>
                <textarea className="form-input" rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label">מחיר (₪) *</label>
                  <input className="form-input" type="number" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} placeholder="0" />
                </div>
                <div>
                  <label className="form-label">יחידה</label>
                  <select className="form-input" value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}>
                    {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => { setShowModal(false); setEditing(null); }} className="btn-secondary">ביטול</button>
              <button
                onClick={() => editing ? updateMut.mutate(form) : createMut.mutate()}
                disabled={!form.name || !form.price || createMut.isPending || updateMut.isPending}
                className="btn-primary"
              >
                {createMut.isPending || updateMut.isPending ? 'שומר...' : editing ? 'שמור שינויים' : 'הוסף שירות'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
