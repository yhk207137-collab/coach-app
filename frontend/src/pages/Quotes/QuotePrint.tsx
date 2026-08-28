import { useEffect, useRef, useState } from 'react';
import { X, Printer } from 'lucide-react';
import api from '../../services/api';
import type { Quote } from './index';

interface Props {
  quote: Quote;
  onClose: () => void;
}

const statusLabel: Record<Quote['status'], string> = {
  DRAFT: 'טיוטה',
  SENT: 'נשלח ללקוח',
  ACCEPTED: 'אושר',
  REJECTED: 'נדחה',
  REVISION: 'בקשת תיקון',
};

export default function QuotePrint({ quote, onClose }: Props) {
  const printRef = useRef<HTMLDivElement>(null);
  const [logo, setLogo] = useState('');
  const [letterhead, setLetterhead] = useState('');

  useEffect(() => {
    try { setLogo(localStorage.getItem('companyLogo') ?? ''); } catch {}
    api.get('/settings/letterhead').then(r => { if (r.data.value) setLetterhead(r.data.value); }).catch(() => {});
  }, []);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const handlePrint = () => window.print();

  const total = quote.items.reduce((s, i) => s + i.price * i.quantity, 0);
  const today = new Date().toLocaleDateString('he-IL');

  return (
    <div className="fixed inset-0 z-50 bg-gray-100 flex flex-col" dir="rtl">
      {/* Toolbar — hidden on print */}
      <div className="print:hidden flex items-center justify-between px-6 py-3 bg-white border-b shadow-sm">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="flex items-center gap-1.5 text-gray-500 hover:text-gray-800 text-sm">
            <X className="w-4 h-4" /> חזרה
          </button>
          <span className="text-gray-300">|</span>
          <span className="text-sm text-gray-600 font-medium">תצוגת הדפסה — הצעה #{String(quote.number).padStart(4, '0')}</span>
        </div>
        <button
          onClick={handlePrint}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-xl hover:bg-purple-700 text-sm font-medium"
        >
          <Printer className="w-4 h-4" /> הדפס / שמור PDF
        </button>
      </div>

      {/* Page wrapper */}
      <div className="flex-1 overflow-y-auto py-8 px-4 flex justify-center">
        <div
          ref={printRef}
          className="bg-white shadow-xl w-full max-w-3xl rounded-2xl print:rounded-none print:shadow-none print:max-w-none relative overflow-hidden"
          style={{ fontFamily: "'Segoe UI', 'Arial Hebrew', Arial, sans-serif" }}
        >
          {/* Header — letterhead as background image of header only */}
          <div
            className="rounded-t-2xl print:rounded-none px-10 py-8 relative overflow-hidden"
            style={letterhead ? {} : { background: 'linear-gradient(135deg, #1e1b4b 0%, #4c1d95 100%)' }}
          >
            {letterhead && (
              <img src={letterhead} alt="" className="absolute inset-0 w-full h-full object-cover pointer-events-none" style={{ zIndex: 0 }} />
            )}
            <div className={`relative flex justify-between items-start ${letterhead ? 'text-gray-900' : 'text-white'}`} style={{ zIndex: 1 }}>
              <div className="flex items-center gap-4">
                {logo && <img src={logo} alt="לוגו" className="h-16 object-contain rounded-lg px-2 py-1" style={{ background: letterhead ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.1)' }} />}
                <div>
                  <div className="text-2xl font-bold tracking-wide" style={{ textShadow: letterhead ? '0 1px 3px rgba(255,255,255,0.8)' : 'none' }}>ליוי שיווק ופרסום</div>
                  <div className={`text-sm mt-1 ${letterhead ? 'text-gray-700' : 'text-purple-200'}`} style={{ textShadow: letterhead ? '0 1px 2px rgba(255,255,255,0.7)' : 'none' }}>סוכנות שיווק ופרסום לעמותות</div>
                </div>
              </div>
              <div className="text-left">
                <div className={`text-xs uppercase tracking-widest ${letterhead ? 'text-purple-700' : 'text-purple-300'}`}>הצעת מחיר</div>
                <div className="text-3xl font-bold mt-1">#{String(quote.number).padStart(4, '0')}</div>
                <div className={`mt-2 inline-block px-3 py-0.5 rounded-full text-xs font-medium ${
                  quote.status === 'ACCEPTED' ? 'bg-green-100 text-green-700' :
                  quote.status === 'REJECTED' ? 'bg-red-100 text-red-700' :
                  quote.status === 'SENT' ? 'bg-blue-100 text-blue-700' :
                  letterhead ? 'bg-white/70 text-gray-700' : 'bg-white/10 text-white/70'
                }`}>
                  {statusLabel[quote.status]}
                </div>
              </div>
            </div>
          </div>
          <div>

          {/* Meta strip */}
          <div className="px-10 py-5 border-b border-gray-100 grid grid-cols-3 gap-6 text-sm">
            <div>
              <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">לקוח</div>
              <div className="font-semibold text-gray-800">{quote.client.fullName}</div>
              {quote.client.businessName && <div className="text-gray-500">{quote.client.businessName}</div>}
              <div className="text-gray-500">{quote.client.email}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">תאריך הפקה</div>
              <div className="font-semibold text-gray-800">{today}</div>
            </div>
            {quote.validUntil && (
              <div>
                <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">בתוקף עד</div>
                <div className="font-semibold text-gray-800">{new Date(quote.validUntil).toLocaleDateString('he-IL')}</div>
              </div>
            )}
          </div>

          {/* Title */}
          <div className="px-10 pt-6">
            <h2 className="text-xl font-bold text-gray-900 mb-1">{quote.title}</h2>
            <div className="h-0.5 bg-gradient-to-l from-purple-500 to-transparent w-24 mb-6" />
          </div>

          {/* Items table */}
          <div className="px-10">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: '#f5f3ff' }} className="text-right">
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-purple-700 rounded-r-lg">תיאור השירות</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-purple-700">משך / תקופה</th>
                  <th className="px-3 py-2.5 text-center text-xs font-semibold text-purple-700">כמות</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-purple-700">מחיר יחידה</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-purple-700 rounded-l-lg">סה"כ</th>
                </tr>
              </thead>
              <tbody>
                {quote.items.map((item, idx) => (
                  <tr key={item.id ?? idx} className={idx % 2 === 0 ? '' : 'bg-gray-50'}>
                    <td className="px-3 py-3 text-gray-800 font-medium">{item.description}</td>
                    <td className="px-3 py-3 text-gray-500">{item.duration || '—'}</td>
                    <td className="px-3 py-3 text-center text-gray-600">{item.quantity}</td>
                    <td className="px-3 py-3 text-left text-gray-600">₪{item.price.toLocaleString('he-IL')}</td>
                    <td className="px-3 py-3 text-left font-semibold text-gray-800">₪{(item.price * item.quantity).toLocaleString('he-IL')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Total */}
          <div className="px-10 mt-6">
            <div className="flex justify-end">
              <div className="min-w-48 border-t-2 border-purple-200 pt-3">
                <div className="flex justify-between text-sm text-gray-500 mb-1">
                  <span>סכום ביניים</span>
                  <span>₪{total.toLocaleString('he-IL')}</span>
                </div>
                <div className="flex justify-between items-center mt-2">
                  <span className="font-bold text-gray-800">סה"כ לתשלום</span>
                  <span className="text-2xl font-bold text-purple-700">₪{total.toLocaleString('he-IL')}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Notes */}
          {quote.notes && (
            <div className="px-10 mt-6">
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-sm text-amber-800">
                <div className="font-semibold mb-1 text-amber-900">הערות</div>
                <div className="whitespace-pre-wrap">{quote.notes}</div>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="px-10 py-8 mt-8 border-t border-gray-100 text-center">
            <div className="text-xs text-gray-400">
              ליוי שיווק ופרסום • סוכנות שיווק ופרסום לעמותות
            </div>
            <div className="text-xs text-gray-300 mt-1">הצעה זו הופקה ב-{today}</div>
          </div>
          </div>{/* end content wrapper */}
        </div>
      </div>

      <style>{`
        @media print {
          body > *:not(.fixed) { display: none !important; }
          .fixed { position: static !important; background: white !important; }
          .print\\:hidden { display: none !important; }
        }
      `}</style>
    </div>
  );
}
