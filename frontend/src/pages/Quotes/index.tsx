import { useState, useEffect, useRef } from 'react';
import { Plus, FileText, Printer, Trash2, Edit2, CheckCircle, Clock, XCircle, Send, Copy, X, Link, RefreshCw } from 'lucide-react';
import api from '../../services/api';
import QuoteModal from './QuoteModal';
import QuotePrint from './QuotePrint';
import toast from 'react-hot-toast';

export interface QuoteItem {
  id?: string;
  description: string;
  duration?: string;
  price: number;
  quantity: number;
  order: number;
}

export interface Quote {
  id: string;
  number: number;
  title: string;
  status: 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED' | 'REVISION';
  notes?: string;
  validUntil?: string;
  createdAt: string;
  client: { id: string; fullName: string; businessName?: string; email: string };
  items: QuoteItem[];
}

const statusLabel: Record<Quote['status'], string> = {
  DRAFT: 'טיוטה',
  SENT: 'נשלח',
  ACCEPTED: 'אושר',
  REJECTED: 'נדחה',
  REVISION: '⚠️ בקש תיקון',
};

const statusIcon: Record<Quote['status'], React.ReactNode> = {
  DRAFT: <Clock className="w-4 h-4 text-gray-400" />,
  SENT: <Send className="w-4 h-4 text-blue-500" />,
  ACCEPTED: <CheckCircle className="w-4 h-4 text-green-500" />,
  REJECTED: <XCircle className="w-4 h-4 text-red-500" />,
  REVISION: <XCircle className="w-4 h-4 text-orange-500" />,
};

const statusColor: Record<Quote['status'], string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  SENT: 'bg-blue-100 text-blue-700',
  ACCEPTED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
  REVISION: 'bg-orange-100 text-orange-700',
};

export default function QuotesPage() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editQuote, setEditQuote] = useState<Quote | null>(null);
  const [printQuote, setPrintQuote] = useState<Quote | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await api.get('/quotes');
      setQuotes(res.data);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
    toast.success('רשימה עודכנה');
  };

  useEffect(() => {
    load();
    intervalRef.current = setInterval(() => load(true), 30000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm('למחוק הצעת מחיר זו?')) return;
    await api.delete(`/quotes/${id}`);
    setQuotes(q => q.filter(x => x.id !== id));
  };

  const handleSave = (quote: Quote) => {
    setQuotes(prev => {
      const idx = prev.findIndex(q => q.id === quote.id);
      if (idx >= 0) { const a = [...prev]; a[idx] = quote; return a; }
      return [quote, ...prev];
    });
    setShowModal(false);
    setEditQuote(null);
  };

  const total = (q: Quote) => q.items.reduce((s, i) => s + i.price * i.quantity, 0);

const reviewLink = (id: string) => `${window.location.origin}/review-quote/${id}`;
  const signLink = (id: string) => `${window.location.origin}/sign-contract/${id}`;
  const copyReviewLink = (id: string) => {
    navigator.clipboard.writeText(reviewLink(id));
    toast.success('קישור ללקוח הועתק! שלח בוואטסאפ / מייל');
  };
  const copyLink = (id: string) => {
    navigator.clipboard.writeText(signLink(id));
    toast.success('קישור לחתימה הועתק!');
  };

  if (printQuote) {
    return <QuotePrint quote={printQuote} onClose={() => setPrintQuote(null)} />;
  }

  return (
    <div dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">הצעות מחיר</h1>
          <p className="text-sm text-gray-500 mt-0.5">{quotes.length} הצעות</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            title="רענן רשימה"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            רענן
          </button>
          <button
          onClick={() => { setEditQuote(null); setShowModal(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-xl hover:bg-purple-700 transition-colors font-medium"
        >
          <Plus className="w-4 h-4" />
          הצעת מחיר חדשה
        </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-20 text-gray-400">טוען...</div>
      ) : quotes.length === 0 ? (
        <div className="text-center py-20">
          <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-400">אין הצעות מחיר עדיין</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {quotes.map(q => (
            <div key={q.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-mono text-gray-400">#{String(q.number).padStart(4, '0')}</span>
                  <h3 className="font-semibold text-gray-900">{q.title}</h3>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${statusColor[q.status]}`}>
                    {statusIcon[q.status]}
                    {statusLabel[q.status]}
                  </span>
                </div>
                <p className="text-sm text-gray-500 mt-1">{q.client.fullName}{q.client.businessName ? ` — ${q.client.businessName}` : ''}</p>
                <div className="flex gap-3 mt-1 text-xs text-gray-400 flex-wrap">
                  <span>{q.items.length} פריטים</span>
                  {q.validUntil && <span>בתוקף עד {new Date(q.validUntil).toLocaleDateString('he-IL')}</span>}
                  <span>{new Date(q.createdAt).toLocaleDateString('he-IL')}</span>
                </div>
                {q.status === 'REVISION' && q.notes && (
                  <div className="mt-2 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 text-xs text-orange-800">
                    <span className="font-semibold">בקשת תיקון: </span>
                    {q.notes.replace(/^\[בקשת תיקון [^\]]+\]: /, '')}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3 flex-wrap justify-end">
                <span className="text-lg font-bold text-purple-700">₪{total(q).toLocaleString('he-IL')}</span>
                {(q.status === 'DRAFT' || q.status === 'SENT' || q.status === 'REVISION') && (
                  <button
                    onClick={() => copyReviewLink(q.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
                    title="העתק קישור לשליחה ללקוח"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    שלח ללקוח
                  </button>
                )}
                <div className="flex gap-1">
                  <button onClick={() => setPrintQuote(q)} className="p-2 rounded-lg hover:bg-purple-50 text-gray-400 hover:text-purple-600" title="הדפס / PDF">
                    <Printer className="w-4 h-4" />
                  </button>
                  <button onClick={() => { setEditQuote(q); setShowModal(true); }} className="p-2 rounded-lg hover:bg-purple-50 text-gray-400 hover:text-purple-600" title="ערוך">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDelete(q.id)} className="p-2 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500" title="מחק">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <QuoteModal
          quote={editQuote}
          onClose={() => { setShowModal(false); setEditQuote(null); }}
          onSave={handleSave}
        />
      )}

    </div>
  );
}
