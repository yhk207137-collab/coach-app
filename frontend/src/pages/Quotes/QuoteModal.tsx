import { useState, useEffect } from 'react';
import { X, Plus, Trash2, GripVertical } from 'lucide-react';
import api from '../../services/api';
import type { Quote, QuoteItem } from './index';

interface Client { id: string; fullName: string; businessName?: string; }

interface Props {
  quote: Quote | null;
  onClose: () => void;
  onSave: (q: Quote) => void;
}

const emptyItem = (): Omit<QuoteItem, 'id' | 'order'> => ({ description: '', duration: '', price: 0, quantity: 1 });

export default function QuoteModal({ quote, onClose, onSave }: Props) {
  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState(quote?.client.id ?? '');
  const [title, setTitle] = useState(quote?.title ?? '');
  const [status, setStatus] = useState<Quote['status']>(quote?.status ?? 'DRAFT');
  const [notes, setNotes] = useState(quote?.notes ?? '');
  const [validUntil, setValidUntil] = useState(quote?.validUntil ? quote.validUntil.slice(0, 10) : '');
  const [items, setItems] = useState<Array<Omit<QuoteItem, 'id' | 'order'>>>(
    quote?.items.length ? quote.items.map(i => ({ description: i.description, duration: i.duration ?? '', price: i.price, quantity: i.quantity })) : [emptyItem()]
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/clients').then((r: { data: Client[] }) => setClients(r.data));
  }, []);

  const setItem = (idx: number, field: keyof typeof items[0], val: string | number) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: val } : it));
  };

  const addItem = () => setItems(prev => [...prev, emptyItem()]);
  const removeItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx));

  const total = items.reduce((s, i) => s + (Number(i.price) || 0) * (Number(i.quantity) || 1), 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientId || !title) return;
    setSaving(true);
    try {
      const payload = {
        clientId,
        title,
        status,
        notes: notes || null,
        validUntil: validUntil || null,
        items: items.map((it, i) => ({ ...it, price: Number(it.price), quantity: Number(it.quantity), order: i })),
      };
      const res = quote
        ? await api.put(`/quotes/${quote.id}`, payload)
        : await api.post('/quotes', payload);
      onSave(res.data);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" dir="rtl">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-bold text-gray-900">{quote ? 'עריכת הצעת מחיר' : 'הצעת מחיר חדשה'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X className="w-5 h-5" /></button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">לקוח *</label>
              <select
                value={clientId}
                onChange={e => setClientId(e.target.value)}
                required
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
              >
                <option value="">בחר לקוח</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>{c.fullName}{c.businessName ? ` — ${c.businessName}` : ''}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">כותרת הצעה *</label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                required
                placeholder="לדוגמה: שירותי שיווק דיגיטלי Q3 2026"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">סטטוס</label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value as Quote['status'])}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
              >
                <option value="DRAFT">טיוטה</option>
                <option value="SENT">נשלח</option>
                <option value="ACCEPTED">אושר</option>
                <option value="REJECTED">נדחה</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">בתוקף עד</label>
              <input
                type="date"
                value={validUntil}
                onChange={e => setValidUntil(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">פריטי שירות</label>
              <button type="button" onClick={addItem} className="flex items-center gap-1 text-xs text-purple-600 hover:text-purple-800 font-medium">
                <Plus className="w-3.5 h-3.5" /> הוסף פריט
              </button>
            </div>
            <div className="space-y-2">
              {items.map((item, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center p-3 bg-gray-50 rounded-xl border border-gray-100">
                  <div className="col-span-1 flex justify-center text-gray-300 cursor-grab">
                    <GripVertical className="w-4 h-4" />
                  </div>
                  <div className="col-span-5">
                    <input
                      type="text"
                      value={item.description}
                      onChange={e => setItem(idx, 'description', e.target.value)}
                      placeholder="תיאור השירות *"
                      required
                      className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 bg-white"
                    />
                  </div>
                  <div className="col-span-2">
                    <input
                      type="text"
                      value={item.duration ?? ''}
                      onChange={e => setItem(idx, 'duration', e.target.value)}
                      placeholder="משך (לדוג׳ 3 חודשים)"
                      className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 bg-white"
                    />
                  </div>
                  <div className="col-span-1">
                    <input
                      type="number"
                      value={item.quantity}
                      onChange={e => setItem(idx, 'quantity', e.target.value)}
                      min={1}
                      className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-purple-400 bg-white"
                    />
                  </div>
                  <div className="col-span-2">
                    <div className="relative">
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₪</span>
                      <input
                        type="number"
                        value={item.price}
                        onChange={e => setItem(idx, 'price', e.target.value)}
                        min={0}
                        placeholder="0"
                        className="w-full border border-gray-200 rounded-lg pr-6 pl-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 bg-white"
                      />
                    </div>
                  </div>
                  <div className="col-span-1 flex justify-center">
                    {items.length > 1 && (
                      <button type="button" onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-600">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end mt-3 text-sm font-semibold text-gray-700">
              סה"כ: <span className="text-purple-700 mr-2">₪{total.toLocaleString('he-IL')}</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">הערות נוספות</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder="תנאי תשלום, הערות מיוחדות..."
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 resize-none"
            />
          </div>
        </form>

        <div className="flex gap-3 px-6 py-4 border-t justify-end">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">ביטול</button>
          <button
            onClick={handleSubmit as unknown as React.MouseEventHandler}
            disabled={saving}
            className="px-5 py-2 rounded-xl bg-purple-600 text-white text-sm font-medium hover:bg-purple-700 disabled:opacity-50"
          >
            {saving ? 'שומר...' : 'שמור'}
          </button>
        </div>
      </div>
    </div>
  );
}
