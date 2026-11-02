import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { CircleDollarSign, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';

interface BilledMeeting {
  id: string;
  date: string;
  type: string;
  chargeStatus?: 'PENDING' | 'CHARGED' | 'SKIPPED' | null;
  chargedAmount?: number | null;
}
interface BillingClient {
  id: string;
  sessionPrice?: number | null;
  meetings?: BilledMeeting[];
  payments?: { totalAmount: number; paidAmount: number }[];
}

const money = (n: number) => `₪${n.toLocaleString()}`;

// The price per meeting, and the meetings still waiting for a decision. Past meetings are never charged on a guess.
export default function MeetingBilling({ client, onChanged }: { client: BillingClient; onChanged: () => void }) {
  const [price, setPrice] = useState(client.sessionPrice ? String(client.sessionPrice) : '');
  const [saving, setSaving] = useState(false);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => { setPrice(client.sessionPrice ? String(client.sessionPrice) : ''); }, [client.sessionPrice]);

  const meetings = client.meetings ?? [];
  const undecided = meetings.filter((m) => !m.chargeStatus).sort((a, b) => a.date.localeCompare(b.date));
  const charged = meetings.filter((m) => m.chargeStatus === 'CHARGED');
  const chargedSum = charged.reduce((s, m) => s + (m.chargedAmount || 0), 0);
  const dirty = price !== (client.sessionPrice ? String(client.sessionPrice) : '');
  const payment = client.payments?.[0];
  const balance = payment ? payment.totalAmount - payment.paidAmount : 0;

  const savePrice = async () => {
    setSaving(true);
    try {
      await api.put(`/meetings/billing/${client.id}/price`, { price: price === '' ? null : price });
      toast.success(price === '' ? 'המחיר הוסר' : 'המחיר נשמר');
      onChanged();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'השמירה נכשלה');
    } finally {
      setSaving(false);
    }
  };

  const amountFor = (m: BilledMeeting) => amounts[m.id] ?? (client.sessionPrice ? String(client.sessionPrice) : '');
  const decide = async (m: BilledMeeting, charge: boolean) => {
    const amount = parseFloat(amountFor(m));
    if (charge && !(amount > 0)) return toast.error('הכנס סכום');
    if (charge && !confirm(`להוסיף ${money(amount)} ליתרה על הפגישה מ-${format(new Date(m.date), 'd/M/yyyy')}?\nהיתרה תעלה מ-${money(balance)} ל-${money(balance + amount)}.`)) return;
    setBusy(m.id);
    try {
      if (charge) await api.post(`/meetings/${m.id}/charge`, { amount });
      else await api.post(`/meetings/${m.id}/skip-charge`);
      toast.success(charge ? `נוספו ${money(amount)} ליתרה` : 'הפגישה לא נוספה ליתרה');
      onChanged();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'הפעולה נכשלה');
    } finally {
      setBusy(null);
    }
  };

  // Only for marking meetings as not to be added: charging is never done in bulk.
  const skipAll = async () => {
    if (!confirm(`לסמן ${undecided.length} פגישות כלא להוספה? היתרה לא תשתנה.`)) return;
    setBusy('all');
    try {
      for (const m of undecided) await api.post(`/meetings/${m.id}/skip-charge`);
      toast.success('בוצע');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'הפעולה נכשלה');
    } finally {
      setBusy(null);
      onChanged();
    }
  };

  return (
    <div className="card space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-primary-50 text-primary-700 flex items-center justify-center flex-shrink-0"><CircleDollarSign className="w-5 h-5" /></div>
          <div className="min-w-0">
            <h2 className="font-semibold text-slate-900">מחיר לפגישה</h2>
            <p className="text-xs text-slate-500">
              {client.sessionPrice
                ? 'כל פגישה מתווספת לבד ליתרה כשהיא מתקיימת. בפגישת היכרות המערכת שואלת.'
                : 'בלי מחיר, פגישות לא מתווספות ליתרה.'}
              {charged.length > 0 && ` נוספו עד היום: ${charged.length === 1 ? 'פגישה אחת' : `${charged.length} פגישות`}, ${money(chargedSum)}.`}
            </p>
            {payment && <p className="text-sm font-semibold text-slate-800 mt-1">יתרה לתשלום כרגע: {money(balance)}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">₪</span>
            <input aria-label="מחיר לפגישה" type="number" min="1" dir="ltr" className="input w-32 pl-7" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0" />
          </div>
          <button type="button" onClick={savePrice} disabled={saving || !dirty} className="btn-primary disabled:opacity-40">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'שמירה'}
          </button>
        </div>
      </div>

      {undecided.length > 0 && !client.sessionPrice && (
        <p className="text-sm text-amber-800 bg-amber-50 rounded-xl px-4 py-2.5">
          {undecided.length === 1 ? 'פגישה אחת מחכה להחלטה' : `${undecided.length} פגישות מחכות להחלטה`}. אחרי שמכניסים מחיר, בוחרים על כל אחת אם להוסיף אותה ליתרה.
        </p>
      )}

      {undecided.length > 0 && !!client.sessionPrice && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-amber-200 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-amber-900">
              {undecided.length === 1 ? 'פגישה אחת מחכה להחלטה' : `${undecided.length} פגישות מחכות להחלטה`}
            </p>
            {undecided.length > 1 && (
              <button type="button" disabled={!!busy} onClick={skipAll} className="text-xs font-medium text-slate-600 hover:underline">אף אחת לא להוסיף</button>
            )}
            <p className="w-full text-xs text-amber-800">פגישה שכבר כלולה ביתרה: בוחרים "לא להוסיף". "להוסיף" מעלה את היתרה בסכום שרשום בשורה.</p>
          </div>
          <div className="divide-y divide-amber-100">
            {undecided.map((m) => (
              <div key={m.id} className="px-4 py-2.5 flex flex-col sm:flex-row sm:items-center gap-2">
                <p className="flex-1 min-w-0 text-sm text-slate-800">
                  <b>{format(new Date(m.date), 'd/M/yyyy')}</b> · {m.type}
                </p>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">₪</span>
                    <input aria-label="סכום לחיוב" type="number" min="1" dir="ltr" className="input py-1.5 w-24 pl-6 text-sm" value={amountFor(m)} onChange={(e) => setAmounts({ ...amounts, [m.id]: e.target.value })} placeholder="0" />
                  </div>
                  <button type="button" disabled={!!busy} onClick={() => decide(m, true)} className="btn-primary py-1.5 text-xs">להוסיף</button>
                  <button type="button" disabled={!!busy} onClick={() => decide(m, false)} className="btn-secondary py-1.5 text-xs">לא להוסיף</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// The charge state on each meeting in the timeline, with a way to undo it.
export function ChargeBadge({ meeting, hasPrice, onChanged }: { meeting: BilledMeeting; hasPrice: boolean; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const undo = async () => {
    const charged = meeting.chargeStatus === 'CHARGED';
    if (charged && !confirm(`לבטל את החיוב ולהוריד ${money(meeting.chargedAmount || 0)} מהיתרה?`)) return;
    setBusy(true);
    try {
      await api.post(`/meetings/${meeting.id}/reset-charge`);
      toast.success(charged ? 'החיוב בוטל' : 'הפגישה חזרה לרשימה');
      onChanged();
    } catch {
      toast.error('הפעולה נכשלה');
    } finally {
      setBusy(false);
    }
  };

  if (!meeting.chargeStatus) return hasPrice ? <p className="text-xs text-amber-700 mt-1">מחכה להחלטה על חיוב</p> : null;
  if (meeting.chargeStatus === 'PENDING') return <p className="text-xs text-slate-500 mt-1">תתווסף ליתרה כשתתקיים</p>;
  return (
    <p className="text-xs mt-1">
      {meeting.chargeStatus === 'CHARGED'
        ? <span className="text-emerald-700 font-medium">חויבה {money(meeting.chargedAmount || 0)}</span>
        : <span className="text-slate-500">לא נוספה ליתרה</span>}
      <button type="button" disabled={busy} onClick={undo} className="text-slate-400 hover:text-slate-700 hover:underline mr-2">
        {meeting.chargeStatus === 'CHARGED' ? 'ביטול חיוב' : 'שינוי'}
      </button>
    </p>
  );
}
