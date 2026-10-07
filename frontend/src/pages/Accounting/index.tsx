import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { TrendingUp, Calendar, DollarSign, AlertCircle, Plus, FileText, CheckCircle, Clock, XCircle } from 'lucide-react';
import api from '../../services/api';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';
import InvoiceModal from './InvoiceModal';

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

interface Invoice {
  id: string;
  number: number;
  status: 'DRAFT' | 'SENT' | 'PAID' | 'OVERDUE';
  issueDate: string;
  dueDate?: string;
  notes?: string;
  client: { fullName: string; email: string };
  items: { description: string; quantity: number; price: number; order: number }[];
}

const STATUS_MAP: Record<string, { label: string; icon: typeof CheckCircle; color: string }> = {
  DRAFT:   { label: 'טיוטה',  icon: FileText,     color: 'text-slate-500' },
  SENT:    { label: 'נשלחה',  icon: Clock,         color: 'text-blue-600' },
  PAID:    { label: 'שולמה',  icon: CheckCircle,   color: 'text-emerald-600' },
  OVERDUE: { label: 'באיחור', icon: AlertCircle,   color: 'text-red-600' },
};

const CLIENT_TYPE_LABELS: Record<string, string> = {
  SESSION: 'פגישות',
  RETAINER: 'ריטיינר',
  PROJECT: 'פרויקט',
};

export default function AccountingPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'income' | 'receivables' | 'invoices'>('income');
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);

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

  const { data: invoices = [], isLoading: invLoading } = useQuery<Invoice[]>({
    queryKey: ['invoices'],
    queryFn: () => api.get('/invoices').then(r => r.data),
    enabled: tab === 'invoices',
  });

  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/invoices/${id}/status`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invoices'] }),
  });

  const deleteInvMut = useMutation({
    mutationFn: (id: string) => api.delete(`/invoices/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invoices'] }),
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

  const invoiceTotal = (inv: Invoice) => inv.items.reduce((s, i) => s + i.price * i.quantity, 0);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">הנהלת חשבונות</h1>
          <p className="page-subtitle">הכנסות, חייבים וחשבוניות</p>
        </div>
        {tab === 'invoices' && (
          <button onClick={() => setShowInvoiceModal(true)} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> חשבונית חדשה
          </button>
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
        <>
          {invLoading ? (
            <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" /></div>
          ) : invoices.length === 0 ? (
            <div className="card text-center py-12 text-slate-400">
              <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>אין חשבוניות עדיין</p>
              <button onClick={() => setShowInvoiceModal(true)} className="btn-primary mt-4 text-sm">צור חשבונית ראשונה</button>
            </div>
          ) : (
            <div className="card p-0 overflow-hidden">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr>
                    <th className="table-header">#</th>
                    <th className="table-header">לקוח</th>
                    <th className="table-header">תאריך</th>
                    <th className="table-header">לתשלום עד</th>
                    <th className="table-header">סכום</th>
                    <th className="table-header">סטטוס</th>
                    <th className="table-header">פעולות</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map(inv => {
                    const st = STATUS_MAP[inv.status];
                    const Icon = st.icon;
                    const total = invoiceTotal(inv);
                    return (
                      <tr key={inv.id} className="table-row">
                        <td className="table-cell font-mono text-slate-600">#{inv.number}</td>
                        <td className="table-cell font-semibold">{inv.client.fullName}</td>
                        <td className="table-cell text-slate-500">{format(new Date(inv.issueDate), 'dd/MM/yyyy')}</td>
                        <td className="table-cell text-slate-500">
                          {inv.dueDate ? format(new Date(inv.dueDate), 'dd/MM/yyyy') : '—'}
                        </td>
                        <td className="table-cell font-bold text-slate-800">₪{total.toLocaleString()}</td>
                        <td className="table-cell">
                          <span className={`flex items-center gap-1 text-sm font-medium ${st.color}`}>
                            <Icon className="w-3.5 h-3.5" />{st.label}
                          </span>
                        </td>
                        <td className="table-cell">
                          <div className="flex gap-1">
                            {inv.status !== 'PAID' && (
                              <button
                                onClick={() => statusMut.mutate({ id: inv.id, status: 'PAID' })}
                                className="text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded-lg hover:bg-emerald-200"
                              >
                                סמן כשולם
                              </button>
                            )}
                            {inv.status === 'DRAFT' && (
                              <button
                                onClick={() => statusMut.mutate({ id: inv.id, status: 'SENT' })}
                                className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-lg hover:bg-blue-200"
                              >
                                נשלחה
                              </button>
                            )}
                            <button
                              onClick={() => window.open(`/invoice-print/${inv.id}`, '_blank')}
                              className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-lg hover:bg-slate-200"
                            >
                              הדפס
                            </button>
                            <button
                              onClick={() => { if (confirm('למחוק חשבונית?')) deleteInvMut.mutate(inv.id); }}
                              className="text-xs text-red-500 px-1 py-1 rounded hover:bg-red-50"
                            >
                              ✕
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {showInvoiceModal && (
        <InvoiceModal onClose={() => setShowInvoiceModal(false)} />
      )}
    </div>
  );
}
