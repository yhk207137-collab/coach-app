import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import api from '../../services/api';
import type { Contract, ContractStatus } from './index';

interface Client { id: string; fullName: string; businessName?: string; }

interface Props {
  contract: Contract | null;
  onClose: () => void;
  onSave: (c: Contract) => void;
}

const DEFAULT_TEMPLATE = `הסכם שירותי שיווק ופרסום

בין: ליוי שיווק ופרסום (להלן: "נותן השירות")
לבין: [שם הלקוח] (להלן: "מקבל השירות")

1. היקף השירות
נותן השירות יספק ללקוח את שירותי השיווק והפרסום כמפורט בהצעת המחיר המצורפת.

2. תקופת ההתקשרות
ההסכם יכנס לתוקף ממועד חתימתו ויהיה בתוקף לתקופה של ___ חודשים.

3. תמורה ותשלומים
התמורה תשולם בהתאם לתנאים שנקבעו בהצעת המחיר.

4. זכויות יוצרים
כל החומרים השיווקיים שייוצרו במסגרת הסכם זה יהיו קניינו של הלקוח לאחר תשלום מלא.

5. סודיות
הצדדים מתחייבים לשמור בסוד כל מידע עסקי שיחשף במסגרת ההתקשרות.

6. ביטול ההסכם
כל צד רשאי לבטל הסכם זה בהודעה מוקדמת של 30 יום.

7. חתימה
על ידי חתימתי להלן, אני מאשר/ת כי קראתי את ההסכם, הבנתי את תנאיו, ואני מסכים/ה לקבלם.`;

export default function ContractModal({ contract, onClose, onSave }: Props) {
  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState(contract?.client.id ?? '');
  const [title, setTitle] = useState(contract?.title ?? '');
  const [content, setContent] = useState(contract?.content ?? DEFAULT_TEMPLATE);
  const [status, setStatus] = useState<ContractStatus>(contract?.status ?? 'DRAFT');
  const [validUntil, setValidUntil] = useState(contract?.validUntil?.slice(0, 10) ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/clients').then((r: { data: Client[] }) => setClients(r.data));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientId || !title) return;
    setSaving(true);
    try {
      const payload = { clientId, title, content, status, validUntil: validUntil || null };
      const res = contract ? await api.put(`/contracts/${contract.id}`, payload) : await api.post('/contracts', payload);
      onSave(res.data);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" dir="rtl">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-bold text-gray-900">{contract ? 'עריכת חוזה' : 'חוזה חדש'}</h2>
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
              <label className="block text-sm font-medium text-gray-700 mb-1">כותרת *</label>
              <input type="text" value={title} onChange={e => setTitle(e.target.value)} required placeholder="לדוגמה: הסכם שיווק 2026" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">סטטוס</label>
              <select value={status} onChange={e => setStatus(e.target.value as ContractStatus)} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400">
                <option value="DRAFT">טיוטה</option>
                <option value="SENT">נשלח</option>
                <option value="SIGNED">חתום</option>
                <option value="EXPIRED">פג תוקף</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">בתוקף עד</label>
              <input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">תוכן החוזה</label>
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              rows={16}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 resize-none font-mono"
            />
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
