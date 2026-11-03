import { useState } from 'react';
import { format } from 'date-fns';
import { Pencil, Trash2, Wallet } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import { PaymentCharge, PaymentRecord } from '../../types';
import { ChargeModal, EditRecordModal, MarkPaidModal, ReceiptStatus, TotalModal, balanceChangeText, ils, todayInput, useMoneyRefresh, usePayment } from './received';

const day = (date: string) => format(new Date(date), 'd/M/yyyy');

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card p-0 overflow-hidden min-w-0">
      <h3 className="px-4 sm:px-5 py-3 font-semibold text-slate-900 border-b border-slate-100">{title}</h3>
      <div className="divide-y divide-slate-100">{children}</div>
    </section>
  );
}

function Row({ amount, tone, title, sub, children }: { amount: number; tone: string; title?: string; sub: string; children?: React.ReactNode }) {
  return (
    <div data-money-row className="px-4 sm:px-5 py-3 flex flex-wrap items-center gap-x-3 gap-y-2">
      <div className="flex-1 min-w-[9rem]">
        <p className={`font-semibold ${tone}`}>{ils(amount)}{title && <span className="text-sm font-medium text-slate-800 mr-2">{title}</span>}</p>
        <p className="text-xs text-slate-500 mt-0.5 break-words">{sub}</p>
      </div>
      {children}
    </div>
  );
}

const IconButtons = ({ onEdit, onDelete }: { onEdit: () => void; onDelete?: () => void }) => (
  <div className="flex items-center gap-1 flex-shrink-0">
    <button type="button" onClick={onEdit} aria-label="עריכה" className="p-1.5 text-slate-400 hover:text-primary-600 rounded transition-colors"><Pencil className="w-4 h-4" /></button>
    {onDelete && <button type="button" onClick={onDelete} aria-label="מחיקה" className="p-1.5 text-slate-400 hover:text-red-500 rounded transition-colors"><Trash2 className="w-4 h-4" /></button>}
  </div>
);

// Everything recorded for a client: what is expected, what came in, and what makes up the total.
export default function PaymentPanel({ clientId, clientName, onUpdated }: { clientId: string; clientName: string; onUpdated?: () => void }) {
  const [editRecord, setEditRecord] = useState<PaymentRecord | null>(null);
  const [markingPaid, setMarkingPaid] = useState<PaymentRecord | null>(null);
  const [editCharge, setEditCharge] = useState<PaymentCharge | null>(null);
  const [editTotal, setEditTotal] = useState(false);
  const refresh = useMoneyRefresh(onUpdated);
  const moneyChanged = () => refresh(clientId);
  const { data: payment, isLoading, isError } = usePayment(clientId);

  if (isLoading) return <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" /></div>;
  if (isError) return <p className="text-sm text-red-600 text-center py-8">לא הצלחנו לטעון את הנתונים. נסו לרענן את הדף.</p>;

  const total = payment?.totalAmount ?? 0;
  const paid = payment?.paidAmount ?? 0;
  const balance = total - paid;
  const history = payment?.history ?? [];
  const scheduled = history.filter((r) => !r.isPaid).sort((a, b) => (a.scheduledDate ?? '').localeCompare(b.scheduledDate ?? ''));
  const received = history.filter((r) => r.isPaid).sort((a, b) => b.date.localeCompare(a.date));
  const charges = payment?.charges ?? [];
  const meetingCharges = payment?.meetingCharges ?? [];
  // Whatever part of the total no line explains was typed by hand as the total itself.
  const typedByHand = Math.round((total - charges.reduce((s, c) => s + c.amount, 0) - meetingCharges.reduce((s, m) => s + (m.chargedAmount || 0), 0)) * 100) / 100;

  const run = async (question: string, action: () => Promise<unknown>, done: string) => {
    if (!confirm(question)) return;
    try {
      await action();
      toast.success(done);
      moneyChanged();
    } catch {
      toast.error('הפעולה נכשלה');
    }
  };
  const deleteRecord = (r: PaymentRecord) => run(
    r.isPaid ? `למחוק את התשלום של ${ils(r.amount)}?\n${balanceChangeText(balance, balance + r.amount)}.` : `למחוק את התשלום העתידי של ${ils(r.amount)}? היתרה לא תשתנה.`,
    () => api.delete(`/payments/record/${r.id}`), 'הרשומה נמחקה',
  );
  const deleteCharge = (c: PaymentCharge) => run(
    `למחוק את החיוב של ${ils(c.amount)}?\n${balanceChangeText(balance, balance - c.amount)}.`,
    () => api.delete(`/payments/charge/${c.id}`), 'החיוב נמחק',
  );
  const undoMeeting = (id: string, amount: number) => run(
    `לבטל את החיוב על הפגישה?\n${balanceChangeText(balance, balance - amount)}.`,
    () => api.post(`/meetings/${id}/reset-charge`), 'החיוב בוטל',
  );

  const lines = [
    ...charges.map((c) => ({ key: c.id, date: c.date, charge: c, meeting: null })),
    ...meetingCharges.map((m) => ({ key: m.id, date: m.date, charge: null, meeting: m })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  if (!history.length && !lines.length && !typedByHand) {
    return (
      <div className="card text-center py-10 text-slate-500">
        <Wallet className="w-9 h-9 mx-auto mb-2 opacity-30" />
        <p className="font-medium">עוד לא נרשם כסף ללקוח הזה</p>
        <p className="text-sm mt-1">מתחילים מהכפתורים למעלה: כסף שהתקבל, חיוב חדש או תשלום עתידי.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {scheduled.length > 0 && (
        <Section title="תשלומים עתידיים">
          {scheduled.map((r) => {
            const when = r.scheduledDate ?? '';
            return (
              <Row key={r.id} amount={r.amount} tone="text-blue-600" sub={[when ? day(when) : 'בלי תאריך', when && when.slice(0, 10) < todayInput() ? 'המועד עבר' : '', r.note].filter(Boolean).join(' · ')}>
                <button type="button" onClick={() => setMarkingPaid(r)} className="btn-primary text-xs py-1.5 flex-shrink-0">התקבל</button>
                <IconButtons onEdit={() => setEditRecord(r)} onDelete={() => deleteRecord(r)} />
              </Row>
            );
          })}
        </Section>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
        <Section title="כסף שהתקבל">
          {received.length === 0 && <p className="px-5 py-6 text-sm text-slate-400 text-center">עוד לא נרשם כסף שהתקבל</p>}
          {received.map((r) => (
            <Row key={r.id} amount={r.amount} tone="text-emerald-700" sub={[day(r.date), r.paymentMethod || 'דרך לא צוינה', r.note].filter(Boolean).join(' · ')}>
              <ReceiptStatus record={r} onChanged={moneyChanged} />
              <IconButtons onEdit={() => setEditRecord(r)} onDelete={() => deleteRecord(r)} />
            </Row>
          ))}
        </Section>

        <Section title="ממה מורכב הסכום">
          {lines.map(({ key, charge, meeting }) => (charge ? (
            <Row key={key} amount={charge.amount} tone="text-slate-900" sub={`${day(charge.date)} · ${charge.note || 'חיוב'}`}>
              <IconButtons onEdit={() => setEditCharge(charge)} onDelete={() => deleteCharge(charge)} />
            </Row>
          ) : meeting && (
            <Row key={key} amount={meeting.chargedAmount || 0} tone="text-slate-900" sub={`${day(meeting.date)} · פגישה · ${meeting.type}`}>
              <button type="button" onClick={() => undoMeeting(meeting.id, meeting.chargedAmount || 0)} className="text-xs text-slate-500 hover:text-slate-800 hover:underline flex-shrink-0">ביטול חיוב</button>
            </Row>
          )))}
          {typedByHand !== 0 && (
            <Row amount={typedByHand} tone="text-slate-900" sub={typedByHand > 0 ? 'סכום עסקה שהוכנס ידנית' : 'תיקון ידני של הסכום'}>
              <IconButtons onEdit={() => setEditTotal(true)} />
            </Row>
          )}
          <p className="px-4 sm:px-5 py-3 bg-slate-50 text-sm font-semibold text-slate-900 flex justify-between gap-3"><span>סך הכול חויב</span><span>{ils(total)}</span></p>
        </Section>
      </div>

      {editRecord && <EditRecordModal record={editRecord} balance={balance} onClose={() => setEditRecord(null)} onSaved={() => { setEditRecord(null); moneyChanged(); }} />}
      {markingPaid && <MarkPaidModal recordId={markingPaid.id} amount={markingPaid.amount} onClose={() => setMarkingPaid(null)} onSaved={() => { setMarkingPaid(null); moneyChanged(); }} />}
      {editCharge && <ChargeModal clientId={clientId} clientName={clientName} balance={balance} charge={editCharge} onClose={() => setEditCharge(null)} onSaved={() => { setEditCharge(null); moneyChanged(); }} />}
      {editTotal && <TotalModal clientId={clientId} clientName={clientName} total={total} paid={paid} nextPaymentDate={payment?.nextPaymentDate} onClose={() => setEditTotal(false)} onSaved={() => { setEditTotal(false); moneyChanged(); }} />}
    </div>
  );
}
