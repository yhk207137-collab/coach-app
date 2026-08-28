import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { CheckCircle, MessageSquare, Loader2, ChevronDown, ChevronUp, AlertTriangle, Printer } from 'lucide-react';
import axios from 'axios';

interface QuoteItem {
  id: string;
  description: string;
  duration?: string;
  price: number;
  quantity: number;
  order: number;
}

interface Quote {
  id: string;
  number: number;
  title: string;
  status: string;
  notes?: string;
  validUntil?: string;
  createdAt: string;
  client: { fullName: string; businessName?: string };
  items: QuoteItem[];
}

const api = axios.create({ baseURL: '/api' });

export default function ReviewQuote() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [approving, setApproving] = useState(false);
  const [showRevision, setShowRevision] = useState(false);
  const [revisionMsg, setRevisionMsg] = useState('');
  const [revisionSent, setRevisionSent] = useState(false);
  const [sendingRevision, setSendingRevision] = useState(false);
  const [approved, setApproved] = useState(false);
  const [showTerms, setShowTerms] = useState(false);

  useEffect(() => {
    api.get(`/quotes/review/${id}`)
      .then(r => {
        setQuote(r.data);
        if (r.data.status === 'ACCEPTED') setApproved(true);
      })
      .catch(() => setError('ההצעה לא נמצאה או שהקישור אינו תקין'))
      .finally(() => setLoading(false));
  }, [id]);

  const handleApprove = async () => {
    if (!confirm('לאשר את הצעת המחיר ולעבור לחתימת חוזה?')) return;
    setApproving(true);
    try {
      const res = await api.post(`/quotes/review/${id}/approve`);
      navigate(`/sign-contract/${res.data.contractId}`);
    } catch {
      setError('שגיאה באישור ההצעה, נסה שוב.');
      setApproving(false);
    }
  };

  const handleRevision = async () => {
    if (!revisionMsg.trim()) return;
    setSendingRevision(true);
    try {
      await api.post(`/quotes/review/${id}/revision`, { message: revisionMsg.trim() });
      setRevisionSent(true);
    } catch {
      alert('שגיאה בשליחה, נסה שוב.');
    } finally {
      setSendingRevision(false);
    }
  };

  const [logo, setLogo] = useState<string | null>(null);
  const [letterhead, setLetterhead] = useState<string | null>(null);

  useEffect(() => {
    api.get('/settings/public/companyLogo')
      .then(r => setLogo(r.data.value))
      .catch(() => {
        try { setLogo(localStorage.getItem('companyLogo')); } catch {}
      });
    api.get('/settings/public/letterhead')
      .then(r => { if (r.data.value) setLetterhead(r.data.value); })
      .catch(() => {});
  }, []);

  const total = quote?.items.reduce((s, i) => s + i.price * i.quantity, 0) ?? 0;

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
    </div>
  );

  if (error && !quote) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50" dir="rtl">
      <div className="text-center p-8">
        <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-3" />
        <p className="text-gray-600">{error}</p>
      </div>
    </div>
  );

  if (!quote) return null;

  if (revisionSent) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50" dir="rtl">
      <div className="text-center p-8 max-w-md">
        <MessageSquare className="w-16 h-16 text-blue-500 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-gray-900 mb-2">הבקשה נשלחה!</h1>
        <p className="text-gray-500">קיבלנו את בקשת התיקון שלך. ניצור קשר בהקדם.</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      {/* Header */}
      <div
        className="relative overflow-hidden px-6 py-6"
        style={letterhead ? {} : { background: 'linear-gradient(135deg, #1e1b4b 0%, #4c1d95 100%)' }}
      >
        {letterhead && (
          <img src={letterhead} alt="" className="absolute inset-0 w-full h-full object-cover pointer-events-none" style={{ zIndex: 0 }} />
        )}
        <div className={`relative max-w-3xl mx-auto flex items-center justify-between gap-4 ${letterhead ? 'text-gray-900' : 'text-white'}`} style={{ zIndex: 1 }}>
          <div className="flex items-center gap-4">
            {logo && (
              <img src={logo} alt="לוגו" className="h-20 w-auto object-contain rounded-lg"
                style={{ background: letterhead ? 'rgba(255,255,255,0.6)' : 'transparent', padding: letterhead ? '4px' : '0' }} />
            )}
            <div>
              <p className={`text-sm ${letterhead ? 'text-purple-700' : 'text-purple-200'}`}
                style={{ textShadow: letterhead ? '0 1px 3px rgba(255,255,255,0.8)' : 'none' }}>
                הצעת מחיר #{String(quote.number).padStart(4, '0')}
              </p>
              <h1 className="text-xl font-bold" style={{ textShadow: letterhead ? '0 1px 3px rgba(255,255,255,0.8)' : 'none' }}>{quote.title}</h1>
            </div>
          </div>
          <button
            onClick={() => window.print()}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-colors print:hidden ${letterhead ? 'bg-white/70 hover:bg-white/90 text-purple-800' : 'bg-white/10 hover:bg-white/20 text-white'}`}
          >
            <Printer className="w-4 h-4" />
            הדפס / PDF
          </button>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">

        {/* Already approved banner */}
        {approved && (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-5 flex items-center gap-3">
            <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0" />
            <div>
              <p className="font-semibold text-green-800">ההצעה אושרה!</p>
              <p className="text-sm text-green-600">ההצעה כבר אושרה. החוזה נשלח לחתימה.</p>
            </div>
          </div>
        )}

        {/* Client + meta */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <p className="text-sm text-gray-500">מוגש ל</p>
              <p className="text-lg font-bold text-gray-900">{quote.client.fullName}</p>
              {quote.client.businessName && <p className="text-sm text-gray-500">{quote.client.businessName}</p>}
            </div>
            <div className="text-left">
              <p className="text-sm text-gray-500">תאריך הצעה</p>
              <p className="text-sm font-medium">{new Date(quote.createdAt).toLocaleDateString('he-IL')}</p>
              {quote.validUntil && (
                <>
                  <p className="text-sm text-gray-500 mt-1">תאריך סיום התקשרות</p>
                  <p className="text-sm font-medium">{new Date(quote.validUntil).toLocaleDateString('he-IL')}</p>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Items table */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">פירוט השירותים</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {quote.items.map((item, i) => (
              <div key={item.id ?? i} className="px-6 py-4 flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900">{item.description}</p>
                  {item.duration && <p className="text-sm text-gray-500">{item.duration}</p>}
                  {item.quantity > 1 && <p className="text-xs text-gray-400">כמות: {item.quantity}</p>}
                </div>
                <p className="font-semibold text-gray-800 flex-shrink-0">₪{(item.price * item.quantity).toLocaleString('he-IL')}</p>
              </div>
            ))}
          </div>
          <div className="px-6 py-4 bg-purple-50 border-t border-purple-100 flex items-center justify-between">
            <p className="font-bold text-gray-900 text-lg">סה״כ לתשלום</p>
            <p className="text-2xl font-bold text-purple-700">₪{total.toLocaleString('he-IL')}</p>
          </div>
        </div>

        {/* Notes */}
        {quote.notes && !quote.notes.startsWith('[בקשת תיקון') && (
          <div className="bg-amber-50 border border-amber-100 rounded-2xl p-5">
            <p className="text-sm font-medium text-amber-800 mb-1">הערות</p>
            <p className="text-sm text-amber-700 whitespace-pre-wrap">{quote.notes}</p>
          </div>
        )}

        {/* Terms accordion */}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <button
            onClick={() => setShowTerms(v => !v)}
            className="w-full px-6 py-4 flex items-center justify-between text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <span className="font-medium">תנאים כלליים</span>
            {showTerms ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {showTerms && (
            <div className="px-6 pb-5 text-sm text-gray-600 space-y-2 border-t border-gray-100 pt-4">
              <p>• ביטול ההסכם ייעשה בהודעה בכתב של 14 יום מראש.</p>
              <p>• כל המידע שיועבר בין הצדדים ישמר בסודיות מלאה.</p>
              <p>• האישור להלן מהווה הסכמה לתנאי ההצעה והחוזה שייחתם.</p>
            </div>
          )}
        </div>

        {/* Actions */}
        {!approved && (
          <div className="space-y-3">
            <button
              onClick={handleApprove}
              disabled={approving}
              className="w-full flex items-center justify-center gap-2 py-4 bg-green-600 text-white rounded-2xl hover:bg-green-700 font-bold text-lg disabled:opacity-50 transition-colors shadow-lg shadow-green-200"
            >
              {approving ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle className="w-5 h-5" />}
              {approving ? 'מעבד...' : 'אני מאשר את ההצעה וממשיך לחתימה'}
            </button>

            {!showRevision ? (
              <button
                onClick={() => setShowRevision(true)}
                className="w-full py-3 border border-gray-200 text-gray-600 rounded-2xl hover:bg-gray-50 font-medium transition-colors flex items-center justify-center gap-2"
              >
                <MessageSquare className="w-4 h-4" />
                בקש תיקון / שינוי
              </button>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
                <p className="text-sm font-medium text-gray-700">מה תרצה לשנות?</p>
                <textarea
                  value={revisionMsg}
                  onChange={e => setRevisionMsg(e.target.value)}
                  rows={4}
                  placeholder="תאר את השינויים המבוקשים..."
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-400"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleRevision}
                    disabled={sendingRevision || !revisionMsg.trim()}
                    className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {sendingRevision ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    שלח בקשת תיקון
                  </button>
                  <button onClick={() => setShowRevision(false)} className="px-4 py-2.5 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50">
                    ביטול
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <p className="text-center text-xs text-gray-400 pb-4">
          לשאלות נוספות ניתן לפנות ישירות אלינו
        </p>
      </div>
    </div>
  );
}
