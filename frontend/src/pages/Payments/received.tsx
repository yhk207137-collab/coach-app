import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FieldErrors, UseFormRegister, useForm } from 'react-hook-form';
import { Loader2, X } from 'lucide-react';
import clsx from 'clsx';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import api from '../../services/api';
import { Client, Payment, PaymentCharge } from '../../types';

export const PAYMENT_METHODS = ['ישראכרט', 'אשראי', 'מזומן', "צ'ק בנקאי", 'העברה בנקאית', 'ביט', 'פייבוקס'];

export const todayInput = () => format(new Date(), 'yyyy-MM-dd');
export const ils = (n: number) => `₪${n.toLocaleString()}`;
export const balanceOf = (client?: Pick<Client, 'payments'>) => {
  const p = client?.payments?.[0];
  return p ? p.totalAmount - p.paidAmount : 0;
};

export const usePayment = (clientId: string) => useQuery<Payment | null>({
  queryKey: ['payment', clientId],
  queryFn: () => api.get(`/payments/${clientId}`).then(r => r.data),
});

// Everything on screen that shows money, refreshed after any change to it.
export function useMoneyRefresh(onUpdated?: () => void) {
  const qc = useQueryClient();
  return (clientId?: string) => {
    if (clientId) qc.invalidateQueries({ queryKey: ['payment', clientId] });
    for (const queryKey of [['received-payments'], ['clients-with-payments'], ['clients'], ['alerts'], ['accounting'], ['receivables'], ['dashboard']]) qc.invalidateQueries({ queryKey });
    onUpdated?.();
  };
}

// Any change to what a client owes says what the balance will be, before it is saved.
export const balanceChangeText = (before: number, after: number) => {
  const from = before < 0 ? `יתרת זכות של ${ils(-before)}` : ils(before);
  return after < 0 ? `אחרי השמירה תהיה ללקוח יתרת זכות של ${ils(-after)}` : `היתרה ${after > before ? 'תעלה' : 'תרד'} מ־${from} ל־${ils(after)}`;
};
function BalanceChange({ before, after }: { before: number; after: number }) {
  if (before === after) return null;
  return <p data-balance-change className="text-sm font-medium text-slate-700 bg-slate-50 rounded-xl px-3 py-2">{balanceChangeText(before, after)}</p>;
}

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

const amountRules = { required: 'חובה לכתוב סכום', validate: (v: any) => parseFloat(v) > 0 || 'הסכום חייב להיות חיובי' };

// Money that came in: from the payments page the client is chosen, from a client's page it is already known.
export function RecordReceivedModal({ clients = [], client, onClose, onSaved }: {
  clients?: Client[];
  client?: { id: string; fullName: string; balance: number };
  onClose: () => void;
  onSaved: (clientId: string) => void;
}) {
  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm({
    defaultValues: { clientId: client?.id ?? '', amount: '', date: todayInput(), paymentMethod: '', receipt: '', note: '' },
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
  const chosen = watch('clientId');
  const amount = parseFloat(watch('amount')) || 0;
  const before = client ? client.balance : balanceOf(clients.find((c) => c.id === chosen));
  return (
    <Modal title={client ? `כסף שהתקבל · ${client.fullName}` : 'רישום כסף שהתקבל'} onClose={onClose}>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="p-6 space-y-4">
        {!client && (
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
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">סכום (₪) *</label>
            <input {...register('amount', amountRules)} type="number" min="0" step="0.01" inputMode="decimal" className="input" placeholder="0" />
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
        {amount > 0 && (client || chosen) && <BalanceChange before={before} after={before - amount} />}
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

export function EditRecordModal({ record, balance, onClose, onSaved }: { record: any; balance?: number; onClose: () => void; onSaved: () => void }) {
  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm({
    defaultValues: {
      amount: record.amount,
      note: record.note ?? '',
      date: record.isPaid ? record.date?.split('T')[0] : '',
      scheduledDate: record.scheduledDate ? record.scheduledDate.split('T')[0] : '',
      paymentMethod: record.paymentMethod ?? '',
      receipt: record.receiptIssued === true ? 'yes' : record.receiptIssued === false ? 'no' : '',
    },
  });
  const onSubmit = async (data: any) => {
    try {
      await api.put(`/payments/record/${record.id}`, {
        amount: parseFloat(data.amount),
        note: data.note,
        ...(record.isPaid
          ? { date: data.date || undefined, paymentMethod: data.paymentMethod, receiptIssued: data.receipt === 'yes' }
          : { scheduledDate: data.scheduledDate }),
      });
      toast.success('רשומה עודכנה');
      onSaved();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'שגיאה בעדכון');
    }
  };
  const amount = parseFloat(String(watch('amount'))) || 0;
  return (
    <Modal title="עריכת רשומת תשלום" onClose={onClose}>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">סכום (₪) *</label>
            <input {...register('amount', amountRules)} type="number" min="0" step="0.01" inputMode="decimal" className="input" />
            {errors.amount && <p className="text-xs text-red-500 mt-1">{errors.amount.message as string}</p>}
          </div>
          {record.isPaid ? (
            <div>
              <label className="label">תאריך תשלום</label>
              <input {...register('date')} type="date" className="input" />
            </div>
          ) : (
            <div>
              <label className="label">תאריך מתוכנן *</label>
              <input {...register('scheduledDate', { required: 'חובה לבחור תאריך' })} type="date" className="input" />
              {errors.scheduledDate && <p className="text-xs text-red-500 mt-1">{errors.scheduledDate.message as string}</p>}
            </div>
          )}
        </div>
        {record.isPaid && <ReceivedFields register={register} errors={errors} receipt={watch('receipt')} />}
        <div>
          <label className="label">הערה</label>
          <input {...register('note')} className="input" placeholder="הערה..." />
        </div>
        {record.isPaid && balance !== undefined && amount > 0 && <BalanceChange before={balance} after={balance - (amount - record.amount)} />}
        <SaveButtons busy={isSubmitting} label="שמור שינויים" onClose={onClose} />
      </form>
    </Modal>
  );
}

// Something the client now owes, and what it is for. With a charge it edits that charge.
export function ChargeModal({ clientId, clientName, balance, charge, onClose, onSaved }: {
  clientId: string;
  clientName: string;
  balance: number;
  charge?: PaymentCharge;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm({
    defaultValues: { amount: charge ? String(charge.amount) : '', date: charge ? charge.date.split('T')[0] : todayInput(), note: charge?.note ?? '' },
  });
  const onSubmit = async (data: any) => {
    try {
      const body = { amount: parseFloat(data.amount), date: data.date, note: data.note };
      if (charge) await api.put(`/payments/charge/${charge.id}`, body);
      else await api.post(`/payments/${clientId}/charge`, body);
      toast.success(charge ? 'החיוב עודכן' : 'החיוב נוסף');
      onSaved();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'השמירה נכשלה');
    }
  };
  const amount = parseFloat(watch('amount')) || 0;
  return (
    <Modal title={`${charge ? 'עריכת חיוב' : 'חיוב חדש'} · ${clientName}`} onClose={onClose}>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="p-6 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">סכום (₪) *</label>
            <input {...register('amount', amountRules)} type="number" min="0" step="0.01" inputMode="decimal" className="input" placeholder="0" autoFocus />
            {errors.amount && <p className="text-xs text-red-500 mt-1">{errors.amount.message as string}</p>}
          </div>
          <div>
            <label className="label">תאריך *</label>
            <input {...register('date', { required: 'חובה לבחור תאריך' })} type="date" className="input" />
            {errors.date && <p className="text-xs text-red-500 mt-1">{errors.date.message as string}</p>}
          </div>
        </div>
        <div>
          <label className="label">עבור מה?</label>
          <input {...register('note')} className="input" placeholder="לדוגמה: ריטיינר נובמבר, עיצוב לוגו" />
        </div>
        {!charge && <p className="text-xs text-slate-500">פגישות מתווספות לבד לפי המחיר לפגישה, לכן אין צורך לחייב עליהן כאן.</p>}
        {amount > 0 && <BalanceChange before={balance} after={balance + amount - (charge?.amount ?? 0)} />}
        <SaveButtons busy={isSubmitting} label={charge ? 'שמור שינויים' : 'הוספת חיוב'} onClose={onClose} />
      </form>
    </Modal>
  );
}

// Money expected on a date. It changes nothing in the balance until it arrives.
export function ScheduleModal({ clientId, clientName, onClose, onSaved }: { clientId: string; clientName: string; onClose: () => void; onSaved: () => void }) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({ defaultValues: { amount: '', scheduledDate: '', note: '' } });
  const onSubmit = async (data: any) => {
    try {
      await api.post(`/payments/${clientId}/record`, { amount: parseFloat(data.amount), isPaid: false, scheduledDate: data.scheduledDate, note: data.note || undefined });
      toast.success('התשלום העתידי נוסף');
      onSaved();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'השמירה נכשלה');
    }
  };
  return (
    <Modal title={`תשלום עתידי · ${clientName}`} onClose={onClose}>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="p-6 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">סכום (₪) *</label>
            <input {...register('amount', amountRules)} type="number" min="0" step="0.01" inputMode="decimal" className="input" placeholder="0" autoFocus />
            {errors.amount && <p className="text-xs text-red-500 mt-1">{errors.amount.message as string}</p>}
          </div>
          <div>
            <label className="label">תאריך מתוכנן *</label>
            <input {...register('scheduledDate', { required: 'חובה לבחור תאריך' })} type="date" className="input" />
            {errors.scheduledDate && <p className="text-xs text-red-500 mt-1">{errors.scheduledDate.message as string}</p>}
          </div>
        </div>
        <div>
          <label className="label">הערה</label>
          <input {...register('note')} className="input" placeholder="לדוגמה: תשלום שני" />
        </div>
        <p className="text-xs text-slate-500">זה לא משנה את היתרה. המערכת תזכיר לך בתאריך, וכשהכסף מגיע לוחצים "התקבל".</p>
        <SaveButtons busy={isSubmitting} label="הוספה" onClose={onClose} />
      </form>
    </Modal>
  );
}

// The total the client has to pay, typed by hand, and the date the next payment is due.
export function TotalModal({ clientId, clientName, total, paid, nextPaymentDate, onClose, onSaved }: {
  clientId: string;
  clientName: string;
  total: number;
  paid: number;
  nextPaymentDate?: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm({
    defaultValues: { totalAmount: String(total), nextPaymentDate: nextPaymentDate ? nextPaymentDate.slice(0, 10) : '' },
  });
  const onSubmit = async (data: any) => {
    try {
      await api.post(`/payments/${clientId}`, { totalAmount: parseFloat(data.totalAmount), nextPaymentDate: data.nextPaymentDate });
      toast.success('נשמר');
      onSaved();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'השמירה נכשלה');
    }
  };
  const typed = parseFloat(watch('totalAmount'));
  return (
    <Modal title={`סכום ותאריך · ${clientName}`} onClose={onClose}>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="p-6 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">סך הכול לתשלום (₪) *</label>
            <input {...register('totalAmount', { required: 'חובה לכתוב סכום', validate: (v) => parseFloat(v) >= 0 || 'סכום לא תקין' })} type="number" min="0" step="0.01" inputMode="decimal" className="input" />
            {errors.totalAmount && <p className="text-xs text-red-500 mt-1">{errors.totalAmount.message as string}</p>}
          </div>
          <div>
            <label className="label">תאריך תשלום הבא</label>
            <input {...register('nextPaymentDate')} type="date" className="input" />
          </div>
        </div>
        <p className="text-xs text-slate-500">הסכום כולל את כל החיובים. התאריך לא חובה: מחיקה שלו מבטלת את התזכורת על מועד התשלום.</p>
        {typed >= 0 && <BalanceChange before={total - paid} after={typed - paid} />}
        <SaveButtons busy={isSubmitting} label="שמירה" onClose={onClose} />
      </form>
    </Modal>
  );
}
