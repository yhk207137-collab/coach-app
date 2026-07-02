import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Plus, Loader2 } from 'lucide-react';
import api from '../../services/api';
import { Payment } from '../../types';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

interface Props { clientId: string; onUpdated?: () => void; }

export default function PaymentPanel({ clientId, onUpdated }: Props) {
  const qc = useQueryClient();
  const [addRecord, setAddRecord] = useState(false);
  const [setupPlan, setSetupPlan] = useState(false);

  const { data: payment, isLoading } = useQuery<Payment | null>({
    queryKey: ['payment', clientId],
    queryFn: () => api.get(`/payments/${clientId}`).then(r => r.data).catch(() => null),
  });

  const { register: regPlan, handleSubmit: submitPlan, formState: { isSubmitting: planSub } } = useForm({
    defaultValues: { totalAmount: payment?.totalAmount ?? 0, nextPaymentDate: '' },
  });

  const { register: regRecord, handleSubmit: submitRecord, reset, formState: { isSubmitting: recSub } } = useForm({
    defaultValues: { amount: 0, note: '', date: new Date().toISOString().split('T')[0] },
  });

  const savePlan = async (data: any) => {
    try {
      await api.post(`/payments/${clientId}`, data);
      qc.invalidateQueries({ queryKey: ['payment', clientId] });
      setSetupPlan(false);
      toast.success('תכנית תשלום עודכנה');
      onUpdated?.();
    } catch { toast.error('שגיאה'); }
  };

  const saveRecord = async (data: any) => {
    try {
      await api.post(`/payments/${clientId}/record`, data);
      qc.invalidateQueries({ queryKey: ['payment', clientId] });
      setAddRecord(false);
      reset();
      toast.success('תשלום נרשם');
      onUpdated?.();
    } catch { toast.error('שגיאה'); }
  };

  if (isLoading) return <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" /></div>;

  const balance = payment ? payment.totalAmount - payment.paidAmount : 0;

  return (
    <div className="space-y-4">
      {!payment || setupPlan ? (
        <div className="card">
          <h3 className="font-semibold text-slate-900 mb-4">{payment ? 'עדכון תכנית' : 'הגדרת תכנית תשלום'}</h3>
          <form onSubmit={submitPlan(savePlan)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">סכום עסקה כולל (₪)</label>
                <input {...regPlan('totalAmount', { required: true, min: 0 })} type="number" className="input" />
              </div>
              <div>
                <label className="label">תאריך תשלום הבא</label>
                <input {...regPlan('nextPaymentDate')} type="date" className="input" />
              </div>
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={planSub} className="btn-primary">
                {planSub ? <Loader2 className="w-4 h-4 animate-spin" /> : 'שמור'}
              </button>
              {payment && <button type="button" onClick={() => setSetupPlan(false)} className="btn-secondary">ביטול</button>}
            </div>
          </form>
        </div>
      ) : (
        <>
          {/* Summary */}
          <div className="grid grid-cols-3 gap-4">
            <div className="card text-center">
              <p className="text-2xl font-bold text-slate-900">₪{payment.totalAmount.toLocaleString()}</p>
              <p className="text-xs text-slate-500 mt-1">סכום עסקה</p>
            </div>
            <div className="card text-center">
              <p className="text-2xl font-bold text-emerald-600">₪{payment.paidAmount.toLocaleString()}</p>
              <p className="text-xs text-slate-500 mt-1">שולם</p>
            </div>
            <div className="card text-center">
              <p className={`text-2xl font-bold ${balance > 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                ₪{balance.toLocaleString()}
              </p>
              <p className="text-xs text-slate-500 mt-1">יתרה</p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="card">
            <div className="flex items-center justify-between mb-2 text-sm">
              <span className="text-slate-600">התקדמות גבייה</span>
              <span className="font-medium">{Math.round((payment.paidAmount / payment.totalAmount) * 100)}%</span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-primary-500 rounded-full transition-all duration-500"
                style={{ width: `${Math.min((payment.paidAmount / payment.totalAmount) * 100, 100)}%` }} />
            </div>
            {payment.nextPaymentDate && (
              <p className="text-xs text-slate-500 mt-2">
                תאריך תשלום הבא: {format(new Date(payment.nextPaymentDate), 'd/M/yyyy')}
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button onClick={() => setAddRecord(true)} className="btn-primary text-sm">
              <Plus className="w-4 h-4" /> רישום תשלום
            </button>
            <button onClick={() => setSetupPlan(true)} className="btn-secondary text-sm">עריכת תכנית</button>
          </div>

          {/* Add record form */}
          {addRecord && (
            <div className="card border border-primary-100">
              <h3 className="font-semibold text-slate-900 mb-4">רישום תשלום חדש</h3>
              <form onSubmit={submitRecord(saveRecord)} className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">סכום (₪)</label>
                  <input {...regRecord('amount', { required: true, min: 1 })} type="number" className="input" />
                </div>
                <div>
                  <label className="label">תאריך</label>
                  <input {...regRecord('date')} type="date" className="input" />
                </div>
                <div className="col-span-2">
                  <label className="label">הערה</label>
                  <input {...regRecord('note')} className="input" placeholder="הערה לתשלום..." />
                </div>
                <div className="col-span-2 flex gap-2">
                  <button type="submit" disabled={recSub} className="btn-primary">
                    {recSub ? <Loader2 className="w-4 h-4 animate-spin" /> : 'רשום תשלום'}
                  </button>
                  <button type="button" onClick={() => setAddRecord(false)} className="btn-secondary">ביטול</button>
                </div>
              </form>
            </div>
          )}

          {/* History */}
          {payment.history?.length > 0 && (
            <div className="card p-0 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100">
                <h3 className="font-semibold text-slate-900">היסטוריית תשלומים</h3>
              </div>
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="table-header">תאריך</th>
                    <th className="table-header">סכום</th>
                    <th className="table-header">הערה</th>
                  </tr>
                </thead>
                <tbody>
                  {payment.history.map(r => (
                    <tr key={r.id} className="table-row">
                      <td className="table-cell">{format(new Date(r.date), 'd/M/yyyy')}</td>
                      <td className="table-cell font-medium text-emerald-700">₪{r.amount.toLocaleString()}</td>
                      <td className="table-cell text-slate-500">{r.note || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
