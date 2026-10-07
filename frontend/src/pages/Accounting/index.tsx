import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TrendingUp, Calendar, DollarSign, AlertCircle, CheckCircle, ExternalLink, Receipt } from 'lucide-react';
import api from '../../services/api';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';

interface AccountingSummary {
  monthly: Record<string, number>;
  expectedThisMonth: number;
  expectedNextMonth: number;
}

interface Receivable {
  id: string;
  fullName: string;
  email: string;
  phone?: string;
  clientType: string;
  paymentDebt: number;
  invoiceDebt: number;
  totalDebt: number;
  nextPaymentDate?: string;
  openInvoices: number;
}

const CLIENT_TYPE_LABELS: Record<string, string> = {
  SESSION: 'פגישות',
  RETAINER: 'ריטיינר',
  PROJECT: 'פרויקט',
};

export default function AccountingPage() {
  const [tab, setTab] = useState<'income' | 'receivables' | 'invoices'>('income');

  const { data, isLoading: incomeLoading } = useQuery<AccountingSummary>({
    queryKey: ['accounting'],
    queryFn: () => api.get('/payments/accounting/summary').then(r => r.data),
    enabled: tab === 'income',
  });

  const { data: receivables = [], isLoading: recLoading } = useQuery<Receivable[]>({
    queryKey: ['receivables'],
    queryFn: () => api.get('/invoices/receivables').then(r => r.data),
    enabled: tab === 'receivables',
  });

  const months = data ? Object.entries(data.monthly).sort((a, b) => a[0].localeCompare(b[0])) : [];
  const totalIncome = months.reduce((sum, [, v]) => sum + v, 0);
  const currentMonthKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const thisMonthIncome = data?.monthly[currentMonthKey] ?? 0;
  const maxMonthly = months.length ? Math.max(...months.map(([, v]) => v)) : 1;
  const totalReceivables = receivables.reduce((s, r) => s + r.totalDebt, 0);

  const formatMonthLabel = (key: string) => {
    const [y, m] = key.split('-');
    return format(new Date(Number(y), Number(m) - 1, 1), 'MMM yyyy', { locale: he });
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">הנהלת חשבונות</h1>
          <p className="page-subtitle">הכנסות, חייבים וחשבוניות</p>
        </div>
        {tab === 'invoices' && (
          <a
            href="https://www.isracard.co.il/business"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary flex items-center gap-2 no-underline"
          >
            <ExternalLink className="w-4 h-4" /> פתח ישרכארט עסקים
          </a>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-slate-100 p-1 rounded-xl w-fit">
        {([
          { key: 'income', label: 'הכנסות' },
          { key: 'receivables', label: `חייבים${totalReceivables > 0 ? ` (₪${totalReceivables.toLocaleString()})` : ''}` },
          { key: 'invoices', label: 'חשבוניות' },
        ] as const).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t.key ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* INCOME TAB */}
      {tab === 'income' && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div className="card">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center">
                  <DollarSign className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-xs text-slate-500">סה"כ הכנסות</p>
                  <p className="text-xl font-bold text-slate-900">₪{totalIncome.toLocaleString()}</p>
                </div>
              </div>
            </div>
            <div className="card">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
                  <Calendar className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-xs text-slate-500">החודש שולם + מתוזמן</p>
                  <p className="text-xl font-bold text-slate-900">₪{(thisMonthIncome + (data?.expectedThisMonth ?? 0)).toLocaleString()}</p>
                  {(data?.expectedThisMonth ?? 0) > 0 && (
                    <p className="text-xs text-blue-500">מתוכם ₪{data!.expectedThisMonth.toLocaleString()} מתוזמן</p>
                  )}
                </div>
              </div>
            </div>
            <div className="card">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-violet-50 rounded-xl flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-violet-600" />
                </div>
                <div>
                  <p className="text-xs text-slate-500">צפי חודש הבא</p>
                  <p className="text-xl font-bold text-slate-900">₪{(data?.expectedNextMonth ?? 0).toLocaleString()}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <h2 className="font-semibold text-slate-900 mb-4">הכנסות לפי חודש</h2>
            {incomeLoading ? (
              <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" /></div>
            ) : months.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <TrendingUp className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p>אין נתוני תשלום עדיין</p>
              </div>
            ) : (
              <div className="space-y-3">
                {months.map(([key, amount]) => (
                  <div key={key} className="flex items-center gap-4">
                    <div className="w-20 text-sm text-slate-600 text-right flex-shrink-0">{formatMonthLabel(key)}</div>
                    <div className="flex-1 h-8 bg-slate-100 rounded-lg overflow-hidden">
                      <div
                        className={`h-full rounded-lg transition-all duration-500 flex items-center px-3 ${key === currentMonthKey ? 'bg-primary-500' : 'bg-emerald-400'}`}
                        style={{ width: `${Math.max((amount / maxMonthly) * 100, 5)}%` }}
                      >
                        <span className="text-white text-xs font-medium whitespace-nowrap">₪{amount.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* RECEIVABLES TAB */}
      {tab === 'receivables' && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
            <div className="card border-l-4 border-l-red-400">
              <p className="text-xs text-slate-500 mb-1">סה"כ חוב פתוח</p>
              <p className="text-2xl font-bold text-red-600">₪{totalReceivables.toLocaleString()}</p>
            </div>
            <div className="card">
              <p className="text-xs text-slate-500 mb-1">לקוחות עם חוב</p>
              <p className="text-2xl font-bold text-slate-800">{receivables.length}</p>
            </div>
            <div className="card">
              <p className="text-xs text-slate-500 mb-1">חשבוניות פתוחות</p>
              <p className="text-2xl font-bold text-slate-800">{receivables.reduce((s, r) => s + r.openInvoices, 0)}</p>
            </div>
          </div>

          {recLoading ? (
            <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" /></div>
          ) : receivables.length === 0 ? (
            <div className="card text-center py-12 text-slate-400">
              <CheckCircle className="w-10 h-10 mx-auto mb-3 text-emerald-400" />
              <p className="font-medium text-emerald-600">כל הלקוחות מסודרים! אין חובות פתוחים.</p>
            </div>
          ) : (
            <div className="card p-0 overflow-hidden">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr>
                    <th className="table-header">לקוח</th>
                    <th className="table-header">סוג</th>
                    <th className="table-header">חוב תשלומים</th>
                    <th className="table-header">חשבוניות פתוחות</th>
                    <th className="table-header">סה"כ חוב</th>
                    <th className="table-header">תשלום הבא</th>
                    <th className="table-header">פעולה</th>
                  </tr>
                </thead>
                <tbody>
                  {receivables.map(r => (
                    <tr key={r.id} className="table-row">
                      <td className="table-cell">
                        <div>
                          <p className="font-semibold text-slate-800">{r.fullName}</p>
                          <p className="text-xs text-slate-400">{r.email}</p>
                        </div>
                      </td>
                      <td className="table-cell">
                        <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                          {CLIENT_TYPE_LABELS[r.clientType] ?? r.clientType}
                        </span>
                      </td>
                      <td className="table-cell font-medium text-red-600">
                        {r.paymentDebt > 0 ? `₪${r.paymentDebt.toLocaleString()}` : '—'}
                      </td>
                      <td className="table-cell">
                        {r.invoiceDebt > 0 ? (
                          <span className="text-sm text-orange-600 font-medium">₪{r.invoiceDebt.toLocaleString()} ({r.openInvoices} חשבוניות)</span>
                        ) : '—'}
                      </td>
                      <td className="table-cell font-bold text-red-700 text-base">₪{r.totalDebt.toLocaleString()}</td>
                      <td className="table-cell text-slate-500 text-sm">
                        {r.nextPaymentDate ? format(new Date(r.nextPaymentDate), 'dd/MM/yyyy') : '—'}
                      </td>
                      <td className="table-cell">
                        <a href={`/clients/${r.id}`} className="text-primary-600 text-sm hover:underline">פרטים →</a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* INVOICES TAB */}
      {tab === 'invoices' && (
        <div className="max-w-md">
          <div className="card">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl bg-red-600 flex items-center justify-center flex-shrink-0">
                <Receipt className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="font-bold text-slate-900 text-lg">ישרכארט עסקים</h2>
                <p className="text-sm text-slate-500">פלטפורמת החשבוניות והקבלות שלך</p>
              </div>
            </div>
            <p className="text-sm text-slate-600 mb-5 leading-relaxed">
              הנפקת חשבוניות וקבלות מנוהלת דרך ישרכארט עסקים — כלי עצמאי המוסמך על ידי רשות המסים.
              לחץ כדי לפתוח את האפליקציה ולהנפיק מסמכים.
            </p>
            <a
              href="https://www.isracard.co.il/business"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary w-full justify-center py-3 flex items-center gap-2 no-underline text-base"
            >
              <ExternalLink className="w-5 h-5" />
              פתח ישרכארט עסקים
            </a>
            <p className="text-xs text-slate-400 text-center mt-3">
              ניתן לשנות את אפליקציית החשבוניות בהגדרות
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
