import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FieldErrors, UseFormRegister, useForm } from 'react-hook-form';
import { Loader2, X } from 'lucide-react';
import clsx from 'clsx';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import api from '../../services/api';
import { Client } from '../../types';

export const PAYMENT_METHODS = ['ישראכרט', 'אשראי', 'מזומן', "צ'ק בנקאי", 'העברה בנקאית', 'ביט', 'פייבוקס'];

export const todayInput = () => format(new Date(), 'yyyy-MM-dd');

const RECEIPT_CHOICES = [
  { value: 'yes', label: 'כן, הופקה', on: 'peer-checked:bg-emerald-500 peer-checked:text-white' },
  { value: 'no', label: 'עדיין לא', on: 'peer-checked:bg-amber-500 peer-checked:text-white' },
];

// How the money came and whether a receipt was issued. Both are required wherever money is recorded as received.
export function ReceivedFields({ register, errors, receipt }: { register: UseFormRegister<any>; errors: FieldErrors<any>; receipt?: string }) {
  return (
    <>
      <div>
        <label className="label">באיזו דרך התקבל הכסף? *</label>
        <select {...register('paymentMethod', { required: 'חובה לבחור באיזו דרך התקבל הכסף' })} className="input">
          <option value="">בחר דרך</option>
          {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        {errors.paymentMethod && <p className="text-xs text-red-500 mt-1">{errors.paymentMethod.message as string}</p>}
      </div>
      <div>
        <p className="label">הופקה קבלה בישראכרט? *</p>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="הופקה קבלה בישראכרט?">
          {RECEIPT_CHOICES.map((c) => (
            <label key={c.value} className="cursor-pointer">
              <input type="radio" value={c.value} className="peer sr-only" {...register('receipt', { required: 'חובה לסמן אם הופקה קבלה' })} />
              <span className={clsx('block py-2 text-center text-sm rounded-xl font-medium bg-slate-100 text-slate-600 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-primary-500', c.on)}>{c.label}</span>
            </label>
          ))}
        </div>
        {errors.receipt && <p className="text-xs text-red-500 mt-1">{errors.receipt.message as string}</p>}
        {receipt === 'no' && <p className="text-xs text-amber-700 mt-1">המערכת תזכיר לך בהתראות, עד שתסמן שהקבלה הופקה.</p>}
      </div>
    </>
  );
}

interface ReceiptRecord { id: string; receiptIssued?: boolean | null }

// Whether a receipt was issued for money already recorded, with the one-click update.
export function ReceiptStatus({ record, onChanged }: { record: ReceiptRecord; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const save = async (issued: boolean) => {
    setBusy(true);
    try {
      await api.put(`/payments/record/${record.id}`, { receiptIssued: issued });
      toast.success(issued ? 'סומן שהופקה קבלה' : 'סומן שעדיין לא הופקה קבלה');
      onChanged();
    } catch {
      toast.error('השמירה נכשלה');
    } finally {
      setBusy(false);
    }
  };
  if (record.receiptIssued === true) return <span className="badge bg-emerald-50 text-emerald-700 whitespace-nowrap">הופקה קבלה</span>;
  const missing = record.receiptIssued === false;
  return (
    <div className={clsx('flex flex-wrap items-center gap-1.5', busy && 'opacity-50 pointer-events-none')}>
      <span className={clsx('badge whitespace-nowrap', missing ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600')}>{missing ? 'חסרה קבלה' : 'לא צוין'}</span>
      <button type="button" onClick={() => save(true)} className="px-2 py-1 rounded-lg text-xs font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 whitespace-nowrap">הופקה</button>
      {!missing && <button type="button" onClick={() => save(false)} className="px-2 py-1 rounded-lg text-xs font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 whitespace-nowrap">לא הופקה</button>}
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal animate-fade-in">
        <div className="modal-header">
          <h2 className="font-semibold text-slate-900">{title}</h2>
          <button type="button" onClick={onClose} aria-label="סגירה" className="btn-ghost p-1.5 rounded-lg"><X className="w-4 h-4" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

const SaveButtons = ({ busy, label, onClose }: { busy: boolean; label: string; onClose: () => void }) => (
  <div className="flex gap-3 pt-2">
    <button type="submit" disabled={busy} className="btn-primary flex-1 justify-center py-2.5">
      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : label}
    </button>
    <button type="button" onClick={onClose} className="btn-secondary px-6">ביטול</button>
  </div>
);

// Money that came in, from the payments page: from whom, how much, how, and the receipt.
export function RecordReceivedModal({ clients, onClose, onSaved }: { clients: Client[]; onClose: () => void; onSaved: (clientId: string) => void }) {
  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm({
    defaultValues: { clientId: '', amount: '', date: todayInput(), paymentMethod: '', receipt: '', note: '' },
  });
  const onSubmit = async (data: any) => {
    try {
      await api.post(`/payments/${data.clientId}/record`, {
        amount: parseFloat(data.amount),
        date: data.date,
        isPaid: true,
        paymentMethod: data.paymentMethod,
        receiptIssued: data.receipt === 'yes',
        note: data.note || undefined,
      });
      toast.success('הכסף נרשם');
      onSaved(data.clientId);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'הרישום נכשל');
    }
  };
  return (
    <Modal title="רישום כסף שהתקבל" onClose={onClose}>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="p-6 space-y-4">
        <div>
          <label className="label">ממי התקבל הכסף? *</label>
          <select {...register('clientId', { required: 'חובה לבחור ממי התקבל הכסף' })} className="input">
            <option value="">בחר לקוח</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.fullName}</option>)}
          </select>
          {errors.clientId
            ? <p className="text-xs text-red-500 mt-1">{errors.clientId.message as string}</p>
            : <p className="text-xs text-slate-500 mt-1">לא ברשימה? מוסיפים אותו קודם ב<Link to="/clients" className="text-primary-600 hover:underline">לקוחות</Link>.</p>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">סכום (₪) *</label>
            <input {...register('amount', { required: 'חובה לכתוב סכום', validate: (v) => parseFloat(v) > 0 || 'הסכום חייב להיות חיובי' })} type="number" min="0" step="0.01" inputMode="decimal" className="input" placeholder="0" />
            {errors.amount && <p className="text-xs text-red-500 mt-1">{errors.amount.message as string}</p>}
          </div>
          <div>
            <label className="label">תאריך *</label>
            <input {...register('date', { required: 'חובה לבחור תאריך' })} type="date" className="input" />
            {errors.date && <p className="text-xs text-red-500 mt-1">{errors.date.message as string}</p>}
          </div>
        </div>
        <ReceivedFields register={register} errors={errors} receipt={watch('receipt')} />
        <div>
          <label className="label">הערה</label>
          <input {...register('note')} className="input" placeholder="לא חובה" />
        </div>
        <SaveButtons busy={isSubmitting} label="רישום" onClose={onClose} />
      </form>
    </Modal>
  );
}

// A scheduled payment that has now arrived: asks the same questions as any other money received.
export function MarkPaidModal({ recordId, amount, onClose, onSaved }: { recordId: string; amount?: number; onClose: () => void; onSaved: () => void }) {
  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm({
    defaultValues: { date: todayInput(), paymentMethod: '', receipt: '' },
  });
  const onSubmit = async (data: any) => {
    try {
      await api.post(`/payments/record/${recordId}/pay`, { date: data.date, paymentMethod: data.paymentMethod, receiptIssued: data.receipt === 'yes' });
      toast.success('התשלום נרשם');
      onSaved();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'הרישום נכשל');
    }
  };
  return (
    <Modal title={amount ? `הכסף התקבל · ₪${amount.toLocaleString()}` : 'הכסף התקבל'} onClose={onClose}>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="p-6 space-y-4">
        <div>
          <label className="label">תאריך קבלת הכסף *</label>
          <input {...register('date', { required: 'חובה לבחור תאריך' })} type="date" className="input" />
          {errors.date && <p className="text-xs text-red-500 mt-1">{errors.date.message as string}</p>}
        </div>
        <ReceivedFields register={register} errors={errors} receipt={watch('receipt')} />
        <SaveButtons busy={isSubmitting} label="רישום" onClose={onClose} />
      </form>
    </Modal>
  );
}

export function EditRecordModal({ record, onClose, onSaved }: { record: any; onClose: () => void; onSaved: () => void }) {
  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm({
    defaultValues: {
      amount: record.amount,
      note: record.note ?? '',
      date: record.isPaid ? record.date?.split('T')[0] : '',
      paymentMethod: record.paymentMethod ?? '',
      receipt: record.receiptIssued === true ? 'yes' : record.receiptIssued === false ? 'no' : '',
    },
  });
  const onSubmit = async (data: any) => {
    try {
      await api.put(`/payments/record/${record.id}`, {
        amount: parseFloat(data.amount),
        note: data.note || undefined,
        date: data.date || undefined,
        ...(record.isPaid ? { paymentMethod: data.paymentMethod, receiptIssued: data.receipt === 'yes' } : {}),
      });
      toast.success('רשומה עודכנה');
      onSaved();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'שגיאה בעדכון');
    }
  };
  return (
    <Modal title="עריכת רשומת תשלום" onClose={onClose}>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="p-6 space-y-4">
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
        {record.isPaid && <ReceivedFields register={register} errors={errors} receipt={watch('receipt')} />}
        <div>
          <label className="label">הערה</label>
          <input {...register('note')} className="input" placeholder="הערה..." />
        </div>
        <SaveButtons busy={isSubmitting} label="שמור שינויים" onClose={onClose} />
      </form>
    </Modal>
  );
}
