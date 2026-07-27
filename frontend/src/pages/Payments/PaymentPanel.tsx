import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Plus, Loader2, CheckCircle, Clock, CreditCard, Banknote, FileText, Pencil, Trash2, X } from 'lucide-react';
import api from '../../services/api';
import { Payment } from '../../types';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

interface Props { clientId: string; onUpdated?: () => void; }

const PAYMENT_METHODS = [
  { value: '', label: 'בחר אמצעי תשלום' },
  { value: 'אשראי', label: 'אשראי' },
  { value: 'מזומן', label: 'מזומן' },
  { value: "צ'ק בנקאי", label: "צ'ק בנקאי" },
  { value: 'העברה בנקאית', label: 'העברה בנקאית' },
  { value: 'ביט', label: 'ביט' },
  { value: 'פייבוקס', label: 'פייבוקס' },
];

const methodIcon = (m?: string) => {
  if (!m) return null;
  if (m === 'אשראי') return <CreditCard className="w-3.5 h-3.5 inline ml-1" />;
  if (m === 'מזומן') return <Banknote className="w-3.5 h-3.5 inline ml-1" />;
  return <FileText className="w-3.5 h-3.5 inline ml-1" />;
};

export default function PaymentPanel({ clientId, onUpdated }: Props) {
  const qc = useQueryClient();
  const [addRecord, setAddRecord] = useState(false);
  const [setupPlan, setSetupPlan] = useState(false);
  const [recordType, setRecordType] = useState<'paid' | 'scheduled'>('paid');
  const [editRecord, setEditRecord] = useState<any | null>(null);

  const { data: payment, isLoading } = useQuery<Payment | null>({
    queryKey: ['payment', clientId],
    queryFn: () => api.get(`/payments/${clientId}`).then(r => r.data).catch(() => null),
  });

  const { register: regPlan, handleSubmit: submitPlan, formState: { isSubmitting: planSub } } = useForm({
    defaultValues: { totalAmount: payment?.totalAmount ?? 0, nextPaymentDate: '' },
  });

  const { register: regRecord, handleSubmit: submitRecord, reset, formState: { errors: recErrors, isSubmitting: recSub } } = useForm({
    defaultValues: { amount: '', note: '', date: new Date().toISOString().split('T')[0], scheduledDate: '', paymentMethod: '' },
  });

  const savePlan = async (data: any) => {
    try {
      await api.post(`/payments/${clientId}`, { ...data, totalAmount: parseFloat(data.totalAmount) });
      qc.invalidateQueries({ queryKey: ['payment', clientId] });
      setSetupPlan(false);
      toast.success('תכנית תשלום עודכנה');
      onUpdated?.();
    } catch { toast.error('שגיאה בשמירת תכנית'); }
  };

  const saveRecord = async (data: any) => {
    try {
      const isPaid = recordType === 'paid';
      await api.post(`/payments/${clientId}/record`, {
        amount: parseFloat(data.amount),
        note: data.note || undefined,
        date: isPaid ? data.date : undefined,
        isPaid,
        scheduledDate: !isPaid ? data.scheduledDate : undefined,
        paymentMethod: isPaid ? (data.paymentMethod || undefined) : undefined,
      });
      qc.invalidateQueries({ queryKey: ['payment', clientId] });
      setAddRecord(false);
      reset();
      toast.success(isPaid ? 'תשלום נרשם בהצלחה' : 'תשלום מתוזמן נוסף');
      onUpdated?.();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'שגיאה ברישום תשלום');
    }
  };

  const deleteRecord = useMutation({
    mutationFn: (recordId: string) => api.delete(`/payments/record/${recordId}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['payment', clientId] }); toast.success('רשומה נמחקה'); onUpdated?.(); },
    onError: () => toast.error('שגיאה במחיקה'),
  });

  const handleDeleteRecord = (r: any) => {
    if (confirm('למחוק רשומה זו?')) deleteRecord.mutate(r.id);
  };

  const markPaid = useMutation({
    mutationFn: (recordId: string) => api.post(`/payments/record/${recordId}/pay`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['payment', clientId] }); toast.success('תשלום סומן כשולם'); onUpdated?.(); },
    onError: () => toast.error('שגיאה'),
  });

  if (isLoading) return <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" /></div>;

  const paidAmount = payment?.paidAmount ?? 0;
  const totalAmount = payment?.totalAmount ?? 0;
  const balance = totalAmount - paidAmount;
  const pct = totalAmount > 0 ? Math.min((paidAmount / totalAmount) * 100, 100) : 0;

  return (
    <div className="space-y-4">
      {!payment || setupPlan ? (
        <div className="card">
          <h3 className="font-semibold text-slate-900 mb-4">{payment ? 'עדכון תכנית' : 'הגדרת תכנית תשלום'}</h3>
          <form onSubmit={submitPlan(savePlan)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">סכום עסקה כולל (₪)</label>
                <input {...regPlan('totalAmount', { required: true, min: 0 })} type="number" min="0" step="0.01" className="input" />
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
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-3">
            <div className="card text-center py-4">
              <p className="text-2xl font-bold text-slate-900">₪{totalAmount.toLocaleString()}</p>
              <p className="text-xs text-slate-500 mt-1">סכום עסקה</p>
            </div>
            <div className="card text-center py-4">
              <p className="text-2xl font-bold text-emerald-600">₪{paidAmount.toLocaleString()}</p>
              <p className="text-xs text-slate-500 mt-1">שולם</p>
            </div>
            <div className="card text-center py-4">
              <p className={`text-2xl font-bold ${balance > 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                ₪{Math.abs(balance).toLocaleString()}
              </p>
              <p className="text-xs text-slate-500 mt-1">{balance > 0 ? 'יתרה לתשלום' : 'שולם במלואו'}</p>
            </div>
          </div>

          {/* Progress */}
          <div className="card">
            <div className="flex items-center justify-between mb-2 text-sm">
              <span className="text-slate-600">התקדמות גבייה</span>
              <span className="font-medium">{Math.round(pct)}%</span>
            </div>
            <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
            </div>
            {payment.nextPaymentDate && (
              <p className="text-xs text-slate-500 mt-2 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                תאריך תשלום הבא: {format(new Date(payment.nextPaymentDate), 'd/M/yyyy')}
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => { setAddRecord(true); setRecordType('paid'); }} className="btn-primary text-sm">
              <Plus className="w-4 h-4" /> רישום תשלום
            </button>
            <button onClick={() => setSetupPlan(true)} className="btn-secondary text-sm">עריכת תכנית</button>
          </div>

          {/* Add record form */}
          {addRecord && (
            <div className="card border border-primary-100">
              <h3 className="font-semibold text-slate-900 mb-3">הוספת תשלום</h3>

              <div className="flex gap-2 mb-4">
                <button type="button" onClick={() => setRecordType('paid')}
                  className={`flex-1 py-2 text-sm rounded-xl font-medium transition-colors ${recordType === 'paid' ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-600'}`}>
                  שולם
                </button>
                <button type="button" onClick={() => setRecordType('scheduled')}
                  className={`flex-1 py-2 text-sm rounded-xl font-medium transition-colors ${recordType === 'scheduled' ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-600'}`}>
                  מתוזמן לעתיד
                </button>
              </div>

              <form onSubmit={submitRecord(saveRecord)} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">סכום (₪) *</label>
                    <input
                      {...regRecord('amount', { required: 'חובה', min: { value: 1, message: 'סכום חייב להיות חיובי' } })}
                      type="number" min="1" step="0.01" className="input"
                      placeholder="0"
                    />
                    {recErrors.amount && <p className="text-xs text-red-500 mt-1">{recErrors.amount.message as string}</p>}
                  </div>
                  <div>
                    <label className="label">{recordType === 'paid' ? 'תאריך תשלום' : 'תאריך מתוכנן'}</label>
                    <input
                      {...regRecord(recordType === 'paid' ? 'date' : 'scheduledDate')}
                      type="date" className="input"
                    />
                  </div>
                </div>

                {recordType === 'paid' && (
                  <div>
                    <label className="label">אמצעי תשלום</label>
                    <select {...regRecord('paymentMethod')} className="input">
                      {PAYMENT_METHODS.map(m => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="label">הערה / פרטים נוספים</label>
                  <input {...regRecord('note')} className="input" placeholder="לדוגמה: תשלום ראשון, חשבונית 123..." />
                </div>

                <div className="flex gap-2">
                  <button type="submit" disabled={recSub} className="btn-primary">
                    {recSub ? <Loader2 className="w-4 h-4 animate-spin" /> : recordType === 'paid' ? 'רשום תשלום' : 'הוסף תזכורת'}
                  </button>
                  <button type="button" onClick={() => { setAddRecord(false); reset(); }} className="btn-secondary">ביטול</button>
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
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="table-header">תאריך</th>
                      <th className="table-header">סכום</th>
                      <th className="table-header">אמצעי תשלום</th>
                      <th className="table-header">הערה</th>
                      <th className="table-header">סטטוס</th>
                      <th className="table-header w-16" />
                    </tr>
                  </thead>
                  <tbody>
                    {payment.history.map(r => (
                      <tr key={r.id} className="table-row">
                        <td className="table-cell text-sm">
                          {r.isPaid
                            ? format(new Date(r.date), 'd/M/yyyy')
                            : r.scheduledDate
                              ? format(new Date(r.scheduledDate), 'd/M/yyyy')
                              : '—'}
                        </td>
                        <td className={`table-cell font-semibold ${r.isPaid ? 'text-emerald-700' : 'text-blue-600'}`}>
                          ₪{r.amount.toLocaleString()}
                        </td>
                        <td className="table-cell text-sm text-slate-600">
                          {r.paymentMethod ? (
                            <span>{methodIcon(r.paymentMethod)}{r.paymentMethod}</span>
                          ) : '—'}
                        </td>
                        <td className="table-cell text-slate-500 text-sm">{r.note || '—'}</td>
                        <td className="table-cell">
                          {r.isPaid ? (
                            <span className="inline-flex items-center gap-1 text-xs text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">
                              <CheckCircle className="w-3.5 h-3.5" /> שולם
                            </span>
                          ) : (
                            <button onClick={() => markPaid.mutate(r.id)} disabled={markPaid.isPending}
                              className="inline-flex items-center gap-1 text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded-full hover:bg-blue-100 transition-colors">
                              <Clock className="w-3.5 h-3.5" /> מתוזמן — סמן כשולם
                            </button>
                          )}
                        </td>
                        <td className="table-cell">
                          <div className="flex items-center gap-1">
                            <button onClick={() => setEditRecord(r)}
                              className="p-1 text-slate-400 hover:text-primary-600 rounded transition-colors">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => handleDeleteRecord(r)}
                              className="p-1 text-slate-400 hover:text-red-500 rounded transition-colors">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

interface EditRecordModalProps { record: any; onClose: () => void; onSaved: () => void; }

function EditRecordModal({ record, onClose, onSaved }: EditRecordModalProps) {
  const { register, handleSubmit, formState: { isSubmitting } } = useForm({
    defaultValues: {
      amount: record.amount,
      note: record.note ?? '',
      date: record.isPaid ? record.date?.split('T')[0] : '',
      paymentMethod: record.paymentMethod ?? '',
    },
  });

  const onSubmit = async (data: any) => {
    try {
      await api.put(`/payments/record/${record.id}`, {
        amount: parseFloat(data.amount),
        note: data.note || undefined,
        date: data.date || undefined,
        paymentMethod: data.paymentMethod || undefined,
      });
      toast.success('רשומה עודכנה');
      onSaved();
    } catch {
      toast.error('שגיאה בעדכון');
    }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal animate-fade-in">
        <div className="modal-header">
          <h2 className="font-semibold text-slate-900">עריכת רשומת תשלום</h2>
          <button onClick={onClose} className="btn-ghost p-1.5 rounded-lg"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">סכום (₪)</label>
              <input {...register('amount', { required: true, min: 1 })} type="number" min="1" step="0.01" className="input" />
            </div>
            {record.isPaid && (
              <div>
                <label className="label">תאריך תשלום</label>
                <input {...register('date')} type="date" className="input" />
              </div>
            )}
          </div>
          {record.isPaid && (
            <div>
              <label className="label">אמצעי תשלום</label>
              <select {...register('paymentMethod')} className="input">
                {PAYMENT_METHODS.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="label">הערה</label>
            <input {...register('note')} className="input" placeholder="הערה..." />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={isSubmitting} className="btn-primary flex-1 justify-center py-2.5">
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'שמור שינויים'}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary px-6">ביטול</button>
          </div>
        </form>
      </div>
    </div>
  );
}
