import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { AlertTriangle, CheckCircle2, Clock, Info, CalendarClock, Loader2, Mail, MessageCircle, Check, Send } from 'lucide-react';
import api from '../../services/api';
import { AlertItem, useAlerts } from '../../hooks/useAlerts';
import { ils } from '../Dashboard/charts';
import { MarkPaidModal } from '../Payments/received';

interface AlertSettings { brief: boolean; briefTime: string; email: string; meetingMinutes: number }

const GROUPS = [
  { key: 'critical', title: 'דחוף', icon: AlertTriangle, cls: 'text-red-600 bg-red-50', match: (a: AlertItem) => a.severity === 'critical' },
  { key: 'todo', title: 'לטיפול', icon: Clock, cls: 'text-amber-700 bg-amber-50', match: (a: AlertItem) => a.severity === 'warning' && !a.soon },
  { key: 'soon', title: 'היום ובימים הקרובים', icon: CalendarClock, cls: 'text-primary-700 bg-primary-50', match: (a: AlertItem) => a.severity !== 'critical' && !!a.soon },
  { key: 'info', title: 'כדאי לזכור', icon: Info, cls: 'text-slate-600 bg-slate-100', match: (a: AlertItem) => a.severity === 'info' && !a.soon },
];

function AlertRow({ alert, onChanged }: { alert: AlertItem; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [markingPaid, setMarkingPaid] = useState(false);
  const run = async (fn: () => Promise<unknown>, message: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(message);
      onChanged();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'הפעולה נכשלה');
      setBusy(false);
    }
  };
  const { action } = alert;
  const done = () => {
    if (action?.type === 'task-done') return run(() => api.put(`/tasks/${action.id}`, { status: 'COMPLETED' }), 'המשימה סומנה כבוצעה');
    if (action?.type === 'payment-paid') return setMarkingPaid(true);
    if (action?.type === 'receipt-issued') return run(() => api.put(`/payments/record/${action.id}`, { receiptIssued: true }), 'סומן שהופקה קבלה');
  };
  const snooze = (days: number, message: string) => run(() => api.post('/alerts/snooze', { key: alert.key, days }), message);

  return (
    <div className={clsx('px-4 sm:px-6 py-3.5 flex flex-col sm:flex-row sm:items-center gap-3', busy && 'opacity-50 pointer-events-none')}>
      <Link to={alert.href} className="flex-1 min-w-0 group">
        <p className="text-sm font-semibold text-slate-800 group-hover:text-primary-700">
          {alert.title}{alert.amount ? <span className="font-bold text-slate-900 whitespace-nowrap"> · {ils(alert.amount)}</span> : null}
        </p>
        <p className="text-xs text-slate-500 mt-0.5">{alert.detail}</p>
      </Link>
      <div className="flex flex-wrap items-center gap-1.5 flex-shrink-0">
        {alert.whatsapp && (
          <a href={alert.whatsapp} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100">
            <MessageCircle className="w-3.5 h-3.5" /> הודעה בוואטסאפ
          </a>
        )}
        {action && (
          <button type="button" onClick={done} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-primary-50 text-primary-700 hover:bg-primary-100">
            <Check className="w-3.5 h-3.5" /> {action.type === 'task-done' ? 'בוצע' : action.type === 'receipt-issued' ? 'הופקה קבלה' : 'שולם'}
          </button>
        )}
        {alert.kind !== 'meeting' && (
          <>
            <button type="button" onClick={() => snooze(1, 'נזכיר לך מחר')} className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-600 hover:bg-slate-200">מחר</button>
            <button type="button" onClick={() => snooze(7, 'נזכיר לך בעוד שבוע')} className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-600 hover:bg-slate-200">בעוד שבוע</button>
          </>
        )}
      </div>
      {markingPaid && action && (
        <MarkPaidModal recordId={action.id} amount={alert.amount} onClose={() => setMarkingPaid(false)} onSaved={() => { setMarkingPaid(false); onChanged(); }} />
      )}
    </div>
  );
}

function SettingsCard() {
  const qc = useQueryClient();
  const { data } = useQuery<AlertSettings>({ queryKey: ['alert-settings'], queryFn: () => api.get('/alerts/settings').then((r) => r.data) });
  const [form, setForm] = useState<AlertSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  useEffect(() => { if (data && !form) setForm(data); }, [data, form]);
  if (!form) return <div className="card flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>;

  const save = async () => {
    setSaving(true);
    try {
      const { data: saved } = await api.put('/alerts/settings', form);
      setForm(saved);
      qc.setQueryData(['alert-settings'], saved);
      toast.success('ההגדרות נשמרו');
    } catch {
      toast.error('השמירה נכשלה');
    } finally {
      setSaving(false);
    }
  };
  const sendNow = async () => {
    setSending(true);
    try {
      const { data: sent } = await api.post('/alerts/send-brief');
      toast.success(`המייל נשלח אל ${sent.to}`);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'השליחה נכשלה');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="card space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary-50 text-primary-700 flex items-center justify-center flex-shrink-0"><Mail className="w-5 h-5" /></div>
        <div>
          <h2 className="font-semibold text-slate-900">תזכורות במייל</h2>
          <p className="text-sm text-slate-500">בשבת ובחג לא יוצא כלום. המייל הראשון אחריהם מרכז הכל.</p>
        </div>
      </div>
      <label className="flex items-center gap-2.5 text-sm text-slate-700">
        <input type="checkbox" checked={form.brief} onChange={(e) => setForm({ ...form, brief: e.target.checked })} className="accent-primary-600 w-4 h-4" />
        לשלוח לי כל בוקר מייל עם מה שמחכה לי היום
      </label>
      <div className="grid sm:grid-cols-3 gap-4">
        <div>
          <label className="label">שעת מייל הבוקר</label>
          <input type="time" dir="ltr" className="input" value={form.briefTime} onChange={(e) => setForm({ ...form, briefTime: e.target.value })} />
        </div>
        <div>
          <label className="label">תזכורת לפני פגישה</label>
          <select className="input" value={form.meetingMinutes} onChange={(e) => setForm({ ...form, meetingMinutes: Number(e.target.value) })}>
            <option value={0}>בלי תזכורת</option>
            <option value={30}>חצי שעה לפני</option>
            <option value={60}>שעה לפני</option>
            <option value={120}>שעתיים לפני</option>
          </select>
        </div>
        <div>
          <label className="label">לאיזה מייל לשלוח</label>
          <input type="email" dir="ltr" className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={save} disabled={saving} className="btn-primary">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'שמירה'}</button>
        <button type="button" onClick={sendNow} disabled={sending} className="btn-secondary">
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} לשלוח לי את מייל הבוקר עכשיו
        </button>
      </div>
    </div>
  );
}

export default function AlertsPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useAlerts();
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['alerts'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const alerts = data?.alerts ?? [];
  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">התראות</h1>
        <p className="page-subtitle">כל מה שמחכה לך: תשלומים, משימות, פגישות, הצעות מחיר, חוזים ולידים</p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
      ) : alerts.length === 0 ? (
        <div className="card text-center py-12">
          <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
          <p className="font-semibold text-slate-800">הכל מטופל</p>
          <p className="text-sm text-slate-500 mt-1">אין כרגע שום דבר שמחכה לך</p>
        </div>
      ) : GROUPS.map((g) => {
        const items = alerts.filter(g.match);
        if (items.length === 0) return null;
        return (
          <div key={g.key} className="card p-0 overflow-hidden">
            <div className="px-4 sm:px-6 py-3.5 border-b border-slate-100 flex items-center gap-2">
              <span className={clsx('w-7 h-7 rounded-lg flex items-center justify-center', g.cls)}><g.icon className="w-4 h-4" /></span>
              <h2 className="font-semibold text-slate-900">{g.title}</h2>
              <span className="text-sm text-slate-400">({items.length})</span>
            </div>
            <div className="divide-y divide-slate-100">
              {items.map((a) => <AlertRow key={a.key} alert={a} onChanged={refresh} />)}
            </div>
          </div>
        );
      })}

      <SettingsCard />
    </div>
  );
}
