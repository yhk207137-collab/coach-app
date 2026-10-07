import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X, Plus, Trash2 } from 'lucide-react';
import api from '../../services/api';

interface Item { description: string; quantity: number; price: string }

interface Props { onClose: () => void }

export default function InvoiceModal({ onClose }: Props) {
  const qc = useQueryClient();
  const [clientId, setClientId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<Item[]>([{ description: '', quantity: 1, price: '' }]);

  const { data: clients = [] } = useQuery<any[]>({
    queryKey: ['clients'],
    queryFn: () => api.get('/clients').then(r => r.data),
  });

  const { data: services = [] } = useQuery<any[]>({
    queryKey: ['services'],
    queryFn: () => api.get('/services').then(r => r.data),
  });

  const mut = useMutation({
    mutationFn: () => api.post('/invoices', { clientId, dueDate, notes, items }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['invoices'] }); onClose(); },
  });

  const addItem = () => setItems(its => [...its, { description: '', quantity: 1, price: '' }]);
  const removeItem = (i: number) => setItems(its => its.filter((_, j) => j !== i));
  const setItem = (i: number, k: keyof Item, v: any) =>
    setItems(its => its.map((item, j) => j === i ? { ...item, [k]: v } : item));

  const total = items.reduce((s, it) => s + (parseFloat(it.price) || 0) * it.quantity, 0);
  const valid = clientId && items.some(it => it.description && it.price);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content max-w-2xl" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">חשבונית חדשה</h2>
          <button onClick={onClose} className="modal-close"><X className="w-5 h-5" /></button>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">לקוח *</label>
              <select className="form-input" value={clientId} onChange={e => setClientId(e.target.value)}>
                <option value="">בחר לקוח</option>
                {clients.map((c: any) => <option key={c.id} value={c.id}>{c.fullName}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">תאריך פירעון</label>
              <input type="date" className="form-input" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </div>
          </div>

          {/* Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="form-label mb-0">פריטים</label>
              {services.length > 0 && (
                <select
                  className="text-xs border border-slate-200 rounded-lg px-2 py-1 text-slate-600"
                  onChange={e => {
                    const s = services.find((sv: any) => sv.id === e.target.value);
                    if (s) addItem();
                    if (s) setItems(its => {
                      const copy = [...its];
                      copy[copy.length - 1] = { description: s.name, quantity: 1, price: String(s.price) };
                      return copy;
                    });
                    e.target.value = '';
                  }}
                >
                  <option value="">+ הוסף מהקטלוג</option>
                  {services.map((s: any) => <option key={s.id} value={s.id}>{s.name} – ₪{s.price}</option>)}
                </select>
              )}
            </div>
            <div className="space-y-2">
              {items.map((item, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <input
                    className="form-input flex-1 text-sm"
                    placeholder="תיאור שירות"
                    value={item.description}
                    onChange={e => setItem(i, 'description', e.target.value)}
                  />
                  <input
                    className="form-input w-20 text-sm text-center"
                    type="number"
                    min={1}
                    placeholder="כמות"
                    value={item.quantity}
                    onChange={e => setItem(i, 'quantity', parseInt(e.target.value) || 1)}
                  />
                  <input
                    className="form-input w-28 text-sm"
                    type="number"
                    placeholder="מחיר"
                    value={item.price}
                    onChange={e => setItem(i, 'price', e.target.value)}
                  />
                  {items.length > 1 && (
                    <button onClick={() => removeItem(i)} className="p-2 text-red-400 hover:text-red-600 mt-0.5">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
              <button onClick={addItem} className="flex items-center gap-1 text-sm text-primary-600 hover:text-primary-800 mt-1">
                <Plus className="w-4 h-4" /> הוסף שורה
              </button>
            </div>
          </div>

          <div>
            <label className="form-label">הערות</label>
            <textarea className="form-input text-sm" rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
          </div>

          <div className="bg-slate-50 rounded-xl p-4 text-left">
            <p className="text-lg font-bold text-slate-900">סה"כ: ₪{total.toLocaleString()}</p>
          </div>
        </div>

        <div className="modal-footer">
          <button onClick={onClose} className="btn-secondary">ביטול</button>
          <button onClick={() => mut.mutate()} disabled={!valid || mut.isPending} className="btn-primary">
            {mut.isPending ? 'יוצר...' : 'צור חשבונית'}
          </button>
        </div>
      </div>
    </div>
  );
}
