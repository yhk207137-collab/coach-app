import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { CalendarCheck, Settings2, AlertTriangle, CheckCircle2, Mail, MessageSquare, XCircle, Clock, ChevronDown, Save, RotateCcw } from 'lucide-react';
import api from '../../services/api';

interface LogItem { id: string; type: string; notes: string; done: boolean; createdAt: string }
interface Booking {
  id: string; leadId: string; name: string; phone: string; email: string; org: string; start: string; duration: number;
  status: 'BOOKED' | 'CONFIRMED' | 'NOT_CONFIRMED' | 'CANCELED' | 'DONE'; meetLink: string | null; googleEventId: string | null;
  warmSentAt: string | null; confirmSentAt: string | null; finalSentAt: string | null; noReplyAt: string | null;
  plan: { warm: string; confirm: string; noReply: string; final: string };
  log: LogItem[];
}
interface Data { places: { max: number; taken: number; left: number; open: boolean }; google: boolean; messaging: boolean; bookings: Booking[] }
interface Hours { day: number; on: boolean; from: string; to: string }
interface Settings {
  open: boolean; maxMeetings: number; duration: number; step: number; minNoticeHours: number; horizonDays: number; hours: Hours[];
  meetingLink: string; bookingPageUrl: string; warmSubject: string; warmBody: string; confirmText: string; finalText: string;
}

const STATUS: Record<Booking['status'], { label: string; cls: string }> = {
  BOOKED: { label: 'נקבעה', cls: 'bg-slate-100 text-slate-700' },
  CONFIRMED: { label: 'אישר הגעה', cls: 'bg-emerald-50 text-emerald-700' },
  NOT_CONFIRMED: { label: 'לא אישר', cls: 'bg-red-50 text-red-600' },
  CANCELED: { label: 'בוטלה', cls: 'bg-slate-100 text-slate-400 line-through' },
  DONE: { label: 'התקיימה', cls: 'bg-primary-50 text-primary-700' },
};
const DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const when = (iso: string) => format(new Date(iso), "EEEE d/M 'בשעה' HH:mm", { locale: he });
const short = (iso: string) => format(new Date(iso), 'd/M HH:mm');
const PLACEHOLDERS = '{שם} {שם_מלא} {שם_העמותה} {יום} {תאריך} {שעה} {מתי} {קישור_לשינוי} {קישור_לפגישה} {משך}';

function Step({ label, at, sent, skipped }: { label: string; at: string; sent: string | null; skipped?: boolean }) {
  return (
    <li className="flex items-center gap-2 text-xs">
      {sent ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : skipped ? <XCircle className="w-3.5 h-3.5 text-slate-300" /> : <Clock className="w-3.5 h-3.5 text-slate-400" />}
      <span className="text-slate-700">{label}</span>
      <span className="text-slate-400">{sent ? `נשלח ${short(sent)}` : skipped ? 'לא נשלח' : `מתוכנן ${short(at)}`}</span>
    </li>
  );
}

function BookingCard({ b, onChange }: { b: Booking; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const active = ['BOOKED', 'CONFIRMED', 'NOT_CONFIRMED'].includes(b.status);
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); toast.success(ok); onChange(); } catch (e: any) { toast.error(e.response?.data?.error || 'הפעולה נכשלה'); }
  };
  const pending = b.log.filter((l) => !l.done && l.type.endsWith('לא נשלחה'));
  return (
    <div data-consult={b.id} className="card p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="font-semibold text-slate-900">{b.org} <span className="font-normal text-slate-500">· {b.name}</span></p>
          <p className="text-sm text-slate-600 mt-0.5">{when(b.start)} · {b.duration} דק׳</p>
          <p className="text-xs text-slate-500 mt-1"><a href={`tel:${b.phone}`} dir="ltr">{b.phone}</a> · <a href={`mailto:${b.email}`}>{b.email}</a>{b.meetLink && <> · <a className="text-primary-600" href={b.meetLink} target="_blank" rel="noreferrer">קישור לפגישה</a></>}</p>
        </div>
        <span className={clsx('badge', STATUS[b.status].cls)}>{STATUS[b.status].label}</span>
      </div>

      {pending.map((p) => (
        <div key={p.id} className="mt-3 rounded-xl bg-amber-50 p-3 text-sm">
          <p className="font-medium text-amber-800">{p.type.replace(' לא נשלחה', '')}: לא מחובר ספק הודעות, ההודעה מחכה לך</p>
          <p className="text-xs text-amber-900 whitespace-pre-line mt-1">{p.notes.split('\n').slice(1).join('\n')}</p>
          <div className="flex gap-3 mt-2">
            <a className="text-xs font-semibold text-emerald-700" target="_blank" rel="noreferrer" href={`https://wa.me/${b.phone.replace(/\D/g, '').replace(/^0/, '972')}?text=${encodeURIComponent(p.notes.split('\n').slice(1).join('\n'))}`}>לשליחה בוואטסאפ</a>
            <button className="text-xs text-slate-600 hover:underline" onClick={() => act(() => api.post(`/consults/activity/${p.id}/sent`), 'סומן כנשלח')}>שלחתי</button>
          </div>
        </div>
      ))}

      {active && (
        <ul className="mt-3 space-y-1">
          <Step label="① מייל חימום (50 שעות לפני)" at={b.plan.warm} sent={b.warmSentAt} />
          <Step label="② בקשת אישור הגעה (24 שעות לפני)" at={b.plan.confirm} sent={b.confirmSentAt} skipped={b.status === 'CONFIRMED' && !b.confirmSentAt} />
          <Step label="③ תזכורת אחרונה (שעתיים לפני)" at={b.plan.final} sent={b.finalSentAt} />
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-3 mt-3 pt-3 border-t border-slate-100">
        <button className="text-xs text-primary-600 hover:underline flex items-center gap-1" onClick={() => setOpen((v) => !v)}>
          <ChevronDown className={clsx('w-3.5 h-3.5 transition-transform', open && 'rotate-180')} />כל ההודעות והמיילים ({b.log.length})
        </button>
        <Link to={`/leads?open=${b.leadId}`} className="text-xs text-slate-500 hover:underline">לכרטיס הליד</Link>
        {active && b.status !== 'CONFIRMED' && <button className="text-xs text-emerald-700 hover:underline" onClick={() => act(() => api.post(`/consults/${b.id}/status`, { status: 'CONFIRMED' }), 'סומן: אישר הגעה')}>אישר בטלפון</button>}
        {b.status !== 'DONE' && b.status !== 'CANCELED' && new Date(b.start) < new Date() && <button className="text-xs text-primary-700 hover:underline" onClick={() => act(() => api.post(`/consults/${b.id}/status`, { status: 'DONE' }), 'סומן: התקיימה')}>התקיימה</button>}
        {active && <button className="text-xs text-red-600 hover:underline mr-auto" onClick={() => { if (confirm(`לבטל את הפגישה עם ${b.org}? התזכורות שנותרו יבוטלו, האירוע יימחק מהיומן והמקום יחזור למונה.`)) act(() => api.post(`/consults/${b.id}/cancel`), 'הפגישה בוטלה'); }}>ביטול פגישה</button>}
      </div>

      {open && (
        <ol className="mt-3 space-y-2">
          {b.log.map((l) => (
            <li key={l.id} className="rounded-lg bg-slate-50 p-2.5">
              <p className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                {/מייל/.test(l.type) ? <Mail className="w-3.5 h-3.5" /> : <MessageSquare className="w-3.5 h-3.5" />}{l.type}
                <span className="font-normal text-slate-400">{short(l.createdAt)}</span>
              </p>
              <p className="text-xs text-slate-600 whitespace-pre-line mt-1">{l.notes}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function SettingsPanel() {
  const qc = useQueryClient();
  const { data } = useQuery<{ settings: Settings; defaults: Settings }>({ queryKey: ['consult-settings'], queryFn: () => api.get('/consults/settings').then((r) => r.data) });
  const [s, setS] = useState<Settings | null>(null);
  useEffect(() => { if (data) setS(data.settings); }, [data]);
  if (!s || !data) return null;
  const set = (patch: Partial<Settings>) => setS({ ...s, ...patch });
  const save = async () => {
    try { await api.put('/consults/settings', s); toast.success('נשמר'); qc.invalidateQueries({ queryKey: ['consult-settings'] }); qc.invalidateQueries({ queryKey: ['consults'] }); } catch { toast.error('השמירה נכשלה'); }
  };
  const text = (key: 'warmSubject' | 'warmBody' | 'confirmText' | 'finalText', label: string, rows: number) => (
    <div>
      <div className="flex items-center justify-between">
        <label className="label">{label}</label>
        {s[key] !== data.defaults[key] && <button className="text-xs text-slate-500 hover:underline flex items-center gap-1" onClick={() => set({ [key]: data.defaults[key] } as any)}><RotateCcw className="w-3 h-3" />לנוסח המקורי</button>}
      </div>
      {rows === 1
        ? <input className="input" value={s[key]} onChange={(e) => set({ [key]: e.target.value } as any)} />
        : <textarea className="input leading-relaxed" rows={rows} value={s[key]} onChange={(e) => set({ [key]: e.target.value } as any)} />}
    </div>
  );
  return (
    <div className="card p-5 space-y-5" data-consult-settings>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <label className="flex items-center gap-2 text-sm col-span-2 md:col-span-4"><input type="checkbox" checked={s.open} onChange={(e) => set({ open: e.target.checked })} />ההצעה פתוחה בדף התודה</label>
        <div><label className="label">מספר מקומות</label><input className="input" type="number" value={s.maxMeetings} onChange={(e) => set({ maxMeetings: Number(e.target.value) })} /></div>
        <div><label className="label">משך פגישה (דקות)</label><input className="input" type="number" value={s.duration} onChange={(e) => set({ duration: Number(e.target.value) })} /></div>
        <div><label className="label">מרווח בין מועדים (דקות)</label><input className="input" type="number" value={s.step} onChange={(e) => set({ step: Number(e.target.value) })} /></div>
        <div><label className="label">התראה מינימלית (שעות)</label><input className="input" type="number" value={s.minNoticeHours} onChange={(e) => set({ minNoticeHours: Number(e.target.value) })} /></div>
        <div><label className="label">כמה ימים קדימה</label><input className="input" type="number" value={s.horizonDays} onChange={(e) => set({ horizonDays: Number(e.target.value) })} /></div>
        <div className="col-span-2 md:col-span-3"><label className="label">קישור קבוע לפגישה (ריק = קישור Google Meet חדש לכל פגישה)</label><input className="input" dir="ltr" value={s.meetingLink} onChange={(e) => set({ meetingLink: e.target.value })} /></div>
      </div>

      <div>
        <p className="label">ימים ושעות שבהם אפשר לקבוע (שעון ישראל; שבת וחג נחסמים תמיד, ושעה תפוסה ביומן גוגל לא מוצעת)</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {s.hours.map((h, i) => (
            <div key={h.day} className={clsx('rounded-xl border p-2.5 text-sm', h.on ? 'border-primary-200 bg-primary-50/40' : 'border-slate-200')}>
              <label className="flex items-center gap-2 font-medium"><input type="checkbox" checked={h.on} onChange={(e) => set({ hours: s.hours.map((x, j) => (j === i ? { ...x, on: e.target.checked } : x)) })} />יום {DAYS[h.day]}</label>
              {h.on && (
                <div className="flex items-center gap-1 mt-2" dir="ltr">
                  <input type="time" className="input py-1 text-xs" value={h.from} onChange={(e) => set({ hours: s.hours.map((x, j) => (j === i ? { ...x, from: e.target.value } : x)) })} />
                  <span>–</span>
                  <input type="time" className="input py-1 text-xs" value={h.to} onChange={(e) => set({ hours: s.hours.map((x, j) => (j === i ? { ...x, to: e.target.value } : x)) })} />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <p className="text-xs text-slate-500">מילים בסוגריים מסולסלים מתמלאות לבד: <span dir="rtl" className="font-mono">{PLACEHOLDERS}</span>. {'{מתי}'} הופך ל"מחר", "היום" או "ביום ראשון", לפי היום שבו ההודעה יוצאת.</p>
        {text('warmSubject', '① מייל חימום, 50 שעות לפני: נושא', 1)}
        {text('warmBody', '① מייל חימום: גוף המייל (שורה ריקה = פסקה חדשה)', 14)}
        {text('confirmText', '② הודעה 24 שעות לפני: בקשת אישור הגעה', 4)}
        {text('finalText', '③ הודעה שעתיים לפני', 3)}
      </div>
      <button className="btn-primary" onClick={save}><Save className="w-4 h-4" />שמירה</button>
    </div>
  );
}

export default function ConsultsPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'list' | 'settings'>('list');
  const { data, isLoading } = useQuery<Data>({ queryKey: ['consults'], queryFn: () => api.get('/consults').then((r) => r.data), refetchInterval: 60_000 });
  const refresh = () => qc.invalidateQueries({ queryKey: ['consults'] });
  const now = Date.now();
  const upcoming = (data?.bookings || []).filter((b) => ['BOOKED', 'CONFIRMED', 'NOT_CONFIRMED'].includes(b.status) && new Date(b.start).getTime() > now - 60 * 60_000).sort((a, b) => a.start.localeCompare(b.start));
  const past = (data?.bookings || []).filter((b) => !upcoming.includes(b));

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2"><CalendarCheck className="w-6 h-6 text-primary-600" />פגישות הקפצה</h1>
          <p className="page-subtitle">פגישות ייעוץ חינם שנקבעו מדף התודה, התזכורות שיצאו והמקומות שנותרו</p>
        </div>
        <div className="flex gap-2">
          <button className={clsx('text-sm px-3 py-1.5 rounded-lg', tab === 'list' ? 'btn-primary' : 'btn-secondary')} onClick={() => setTab('list')}><CalendarCheck className="w-4 h-4" />פגישות</button>
          <button className={clsx('text-sm px-3 py-1.5 rounded-lg', tab === 'settings' ? 'btn-primary' : 'btn-secondary')} onClick={() => setTab('settings')}><Settings2 className="w-4 h-4" />הגדרות וטקסטים</button>
        </div>
      </div>

      {data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="card p-4"><p className="text-xs text-slate-500">מקומות שנותרו</p><p data-places-left className="text-2xl font-bold text-slate-900">{data.places.left} <span className="text-sm font-normal text-slate-400">מתוך {data.places.max}</span></p></div>
          <div className="card p-4"><p className="text-xs text-slate-500">נקבעו (בלי ביטולים)</p><p className="text-2xl font-bold text-slate-900">{data.places.taken}</p></div>
          <div className={clsx('card p-4', !data.google && 'ring-1 ring-red-200')}><p className="text-xs text-slate-500">יומן גוגל</p><p className={clsx('text-sm font-semibold mt-1', data.google ? 'text-emerald-700' : 'text-red-600')}>{data.google ? 'מחובר: רואים רק שעות פנויות' : 'לא מחובר: חברו בהגדרות'}</p></div>
          <div className={clsx('card p-4', !data.messaging && 'ring-1 ring-amber-200')}><p className="text-xs text-slate-500">וואטסאפ / SMS</p><p className={clsx('text-sm font-semibold mt-1', data.messaging ? 'text-emerald-700' : 'text-amber-700')}>{data.messaging ? 'מחובר: ההודעות יוצאות לבד' : 'לא מחובר: ההודעות מחכות לשליחה ידנית'}</p></div>
        </div>
      )}

      {tab === 'settings' ? <SettingsPanel /> : isLoading ? null : (
        <>
          {!data?.places.open && <div className="card p-4 flex items-center gap-2 text-sm text-amber-800 bg-amber-50"><AlertTriangle className="w-4 h-4" />ההצעה סגורה בדף התודה. מוצגת הודעת "כל המקומות נתפסו" וטופס רשימת המתנה.</div>}
          <section className="space-y-3">
            <h2 className="font-semibold text-slate-900">קרובות</h2>
            {upcoming.length === 0 ? <p className="text-sm text-slate-400">אין פגישות קרובות</p> : upcoming.map((b) => <BookingCard key={b.id} b={b} onChange={refresh} />)}
          </section>
          {past.length > 0 && (
            <section className="space-y-3">
              <h2 className="font-semibold text-slate-900">קודמות ומבוטלות</h2>
              {past.map((b) => <BookingCard key={b.id} b={b} onChange={refresh} />)}
            </section>
          )}
        </>
      )}
    </div>
  );
}
