import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CreditCard, AlertCircle, Plus, Pencil, Wallet } from 'lucide-react';
import clsx from 'clsx';
import api from '../../services/api';
import { Client } from '../../types';
import { format } from 'date-fns';
import { EditRecordModal, ReceiptStatus, RecordReceivedModal } from './received';

interface ReceivedRow {
  id: string;
  amount: number;
  date: string;
  note?: string;
  isPaid: boolean;
  paymentMethod?: string;
  receiptIssued?: boolean | null;
  payment: { clientId: string; client: { fullName: string } };
}

export default function PaymentsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'received' ? 'received' : 'balances';
  const [recording, setRecording] = useState(false);
  const [editing, setEditing] = useState<ReceivedRow | null>(null);
  const [onlyMissing, setOnlyMissing] = useState(false);

  const { data: clients = [], isLoading } = useQuery<Client[]>({
    queryKey: ['clients-with-payments'],
    queryFn: () => api.get('/clients').then(r => r.data),
  });
  const { data: received = [], isLoading: receivedLoading } = useQuery<ReceivedRow[]>({
    queryKey: ['received-payments'],
    queryFn: () => api.get('/payments/accounting/received').then(r => r.data),
  });

  const clientsWithPayments = clients.filter(c => c.payments && c.payments.length > 0);
  const overdueClients = clientsWithPayments.filter(c => {
    const p = c.payments?.[0];
    return p && p.paidAmount < p.totalAmount;
  });
  const noReceipt = received.filter(r => r.receiptIssued !== true);
  const shownReceived = onlyMissing ? noReceipt : received;

  const refresh = (clientId?: string) => {
    for (const queryKey of [['received-payments'], ['clients-with-payments'], ['alerts'], ['accounting']]) qc.invalidateQueries({ queryKey });
    if (clientId) qc.invalidateQueries({ queryKey: ['payment', clientId] });
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">תשלומים</h1>
          <p className="page-subtitle">ניהול גבייה ותשלומים</p>
        </div>
        <button type="button" onClick={() => setRecording(true)} className="btn-primary">
          <Plus className="w-4 h-4" /> רישום כסף שהתקבל
        </button>
      </div>

      <div className="flex flex-wrap gap-1 mb-6 bg-slate-100 p-1 rounded-xl w-fit max-w-full">
        {([
          { key: 'balances', label: 'יתרות לקוחות' },
          { key: 'received', label: `כסף שהתקבל${noReceipt.length ? ` (${noReceipt.length} בלי קבלה)` : ''}` },
        ] as const).map(t => (
          <button
            key={t.key}
            type="button"
            onClick={() => setParams(t.key === 'received' ? { tab: 'received' } : {})}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === t.key ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'balances' && overdueClients.length > 0 && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-800">יש {overdueClients.length} לקוחות עם יתרה לגבייה</p>
            <p className="text-xs text-amber-700 mt-0.5">
              {overdueClients.map(c => c.fullName).join(', ')}
            </p>
          </div>
        </div>
      )}

      {tab === 'balances' && (isLoading ? (
        <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="table-header">לקוח</th>
                <th className="table-header">סכום עסקה</th>
                <th className="table-header">שולם</th>
                <th className="table-header">יתרה</th>
                <th className="table-header hidden md:table-cell">תשלום הבא</th>
                <th className="table-header">מצב</th>
              </tr>
            </thead>
            <tbody>
              {clients.map(client => {
                const p = client.payments?.[0];
                if (!p) return null;
                const balance = p.totalAmount - p.paidAmount;
                return (
                  <tr key={client.id} className="table-row cursor-pointer" onClick={() => navigate(`/clients/${client.id}?tab=payments`)}>
                    <td className="table-cell">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 bg-primary-100 rounded-lg flex items-center justify-center text-xs font-bold text-primary-700">
                          {client.fullName[0]}
                        </div>
                        <span className="font-medium text-slate-800">{client.fullName}</span>
                      </div>
                    </td>
                    <td className="table-cell">₪{p.totalAmount.toLocaleString()}</td>
                    <td className="table-cell text-emerald-700 font-medium">₪{p.paidAmount.toLocaleString()}</td>
                    <td className={`table-cell font-medium ${balance > 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                      ₪{Math.abs(balance).toLocaleString()}
                    </td>
                    <td className="table-cell hidden md:table-cell text-slate-500">
                      {p.nextPaymentDate ? format(new Date(p.nextPaymentDate), 'd/M/yyyy') : '—'}
                    </td>
                    <td className="table-cell">
                      {balance > 0
                        ? <span className="badge bg-red-50 text-red-600">יתרה לגבייה</span>
                        : <span className="badge bg-emerald-50 text-emerald-700">{balance < 0 ? 'יתרת זכות' : 'שולם במלואו'}</span>
                      }
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {clients.every(c => !c.payments?.length) && (
            <div className="text-center py-16 text-slate-400">
              <CreditCard className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>אין נתוני תשלום</p>
              <p className="text-sm mt-1">הגדר תכנית תשלום בתיק הלקוח</p>
            </div>
          )}
        </div>
      ))}

      {tab === 'received' && (receivedLoading ? (
        <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <>
          {received.length > 0 && (
            <div className="flex gap-2 mb-3">
              {[{ on: false, label: 'הכול' }, { on: true, label: `בלי קבלה (${noReceipt.length})` }].map(f => (
                <button
                  key={f.label}
                  type="button"
                  onClick={() => setOnlyMissing(f.on)}
                  className={clsx('px-3 py-1.5 rounded-lg text-xs font-medium', onlyMissing === f.on ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}
          <div className="card p-0 overflow-hidden">
            {/* On a phone every row is whole on screen, the receipt included */}
            <div className="md:hidden divide-y divide-slate-100">
              {shownReceived.map(r => (
                <div key={r.id} data-received-row className="p-4 space-y-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link to={`/clients/${r.payment.clientId}?tab=payments`} className="font-medium text-slate-800">{r.payment.client.fullName}</Link>
                      <p className="text-xs text-slate-500 mt-0.5">{format(new Date(r.date), 'd/M/yyyy')} · {r.paymentMethod || 'דרך לא צוינה'}{r.note ? ` · ${r.note}` : ''}</p>
                    </div>
                    <p className="font-semibold text-emerald-700 whitespace-nowrap">₪{r.amount.toLocaleString()}</p>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <ReceiptStatus record={r} onChanged={() => refresh(r.payment.clientId)} />
                    <button type="button" onClick={() => setEditing(r)} aria-label="עריכה" className="p-1 text-slate-400 hover:text-primary-600 rounded transition-colors">
                      <Pencil className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr>
                    <th className="table-header">תאריך</th>
                    <th className="table-header">ממי</th>
                    <th className="table-header">סכום</th>
                    <th className="table-header">באיזו דרך</th>
                    <th className="table-header">קבלה</th>
                    <th className="table-header hidden md:table-cell">הערה</th>
                    <th className="table-header w-10" />
                  </tr>
                </thead>
                <tbody>
                  {shownReceived.map(r => (
                    <tr key={r.id} className="table-row">
                      <td className="table-cell text-sm whitespace-nowrap">{format(new Date(r.date), 'd/M/yyyy')}</td>
                      <td className="table-cell">
                        <Link to={`/clients/${r.payment.clientId}?tab=payments`} className="font-medium text-slate-800 hover:text-primary-700 whitespace-nowrap">{r.payment.client.fullName}</Link>
                      </td>
                      <td className="table-cell font-semibold text-emerald-700 whitespace-nowrap">₪{r.amount.toLocaleString()}</td>
                      <td className="table-cell text-sm text-slate-600 whitespace-nowrap">{r.paymentMethod || 'לא צוין'}</td>
                      <td className="table-cell"><ReceiptStatus record={r} onChanged={() => refresh(r.payment.clientId)} /></td>
                      <td className="table-cell hidden md:table-cell text-sm text-slate-500">{r.note || '—'}</td>
                      <td className="table-cell">
                        <button type="button" onClick={() => setEditing(r)} aria-label="עריכה" className="p-1 text-slate-400 hover:text-primary-600 rounded transition-colors">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {shownReceived.length === 0 && (
              <div className="text-center py-16 text-slate-400">
                <Wallet className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p>{onlyMissing ? 'כל התשלומים מסודרים עם קבלה' : 'עוד לא נרשם כסף שהתקבל'}</p>
              </div>
            )}
          </div>
        </>
      ))}

      {recording && (
        <RecordReceivedModal
          clients={clients}
          onClose={() => setRecording(false)}
          onSaved={(clientId) => { setRecording(false); setOnlyMissing(false); setParams({ tab: 'received' }); refresh(clientId); }}
        />
      )}
      {editing && (
        <EditRecordModal
          record={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { const clientId = editing.payment.clientId; setEditing(null); refresh(clientId); }}
        />
      )}
    </div>
  );
}
