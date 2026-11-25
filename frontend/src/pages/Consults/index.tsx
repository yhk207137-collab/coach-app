import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { CalendarCheck, Settings2, AlertTriangle, CheckCircle2, Mail, MessageSquare, XCircle, Clock, ChevronDown, Save, RotateCcw, Eye } from 'lucide-react';
import api from '../../services/api';

interface LogItem { id: string; type: string; notes: string; done: boolean; createdAt: string }
interface Booking {
  id: string; leadId: string; name: string; phone: string; email: string; org: string; role?: string | null; about?: string | null; start: string; duration: number;
  status: 'BOOKED' | 'CONFIRMED' | 'NOT_CONFIRMED' | 'CANCELED' | 'DONE'; meetLink: string | null; googleEventId: string | null;
  warmSentAt: string | null; confirmSentAt: string | null; finalSentAt: string | null; noReplyAt: string | null;
  plan: { lastMinute?: boolean; warm: string; confirm: string; noReply: string; final: string };
  log: LogItem[];
}
interface Data { places: { max: number | null; taken: number; left: number | null; open: boolean }; google: boolean; bookings: Booking[] }
interface Hours { day: number; on: boolean; from: string; to: string }
interface Settings {
  open: boolean; maxMeetings: number; duration: number; step: number; minNoticeHours: number; horizonDays: number; hours: Hours[]; closedDays: string[];
  meetingLink: string; bookingPageUrl: string; warmSubject: string; warmBody: string; confirmSubject: string; confirmText: string; finalSubject: string; finalText: string;
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

const LATE = 'נקבעה פחות מ-24 שעות מראש';

function Step({ label, at, sent, skipped }: { label: string; at: string; sent: string | null; skipped?: boolean | string }) {
  return (
    <li className="flex items-center gap-2 text-xs">
      {sent ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : skipped ? <XCircle className="w-3.5 h-3.5 text-slate-300" /> : <Clock className="w-3.5 h-3.5 text-slate-400" />}
      <span className="text-slate-700">{label}</span>
      <span className="text-slate-400">{sent ? `נשלח ${short(sent)}` : skipped ? (skipped === true ? 'לא נשלח' : `לא נשלח (${skipped})`) : `מתוכנן ${short(at)}`}</span>
    </li>
  );
}

function BookingCard({ b, onChange }: { b: Booking; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const active = ['BOOKED', 'CONFIRMED', 'NOT_CONFIRMED'].includes(b.status);
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); toast.success(ok); onChange(); } catch (e: any) { toast.error(e.response?.data?.error || 'הפעולה נכשלה'); }
  };
  return (
    <div data-consult={b.id} className="card p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="font-semibold text-slate-900">{b.org} <span className="font-normal text-slate-500">· {b.name}{b.role ? `, ${b.role}` : ''}</span></p>
          <p className="text-sm text-slate-600 mt-0.5">{when(b.start)} · {b.duration} דק׳</p>
          <p className="text-xs text-slate-500 mt-1"><a href={`tel:${b.phone}`} dir="ltr">{b.phone}</a> · <a href={`mailto:${b.email}`}>{b.email}</a>{b.meetLink && <> · <a className="text-primary-600" href={b.meetLink} target="_blank" rel="noreferrer">קישור לפגישה</a></>}</p>
          {b.about && <p className="text-sm text-slate-700 mt-2 whitespace-pre-wrap bg-slate-50 rounded-lg px-3 py-2"><span className="text-slate-500">רקע: </span>{b.about}</p>}
        </div>
        <span className={clsx('badge', STATUS[b.status].cls)}>{STATUS[b.status].label}</span>
      </div>

      {active && (
        <ul className="mt-3 space-y-1">
          <Step label="① מייל חימום (50 שעות לפני)" at={b.plan.warm} sent={b.warmSentAt} skipped={b.plan.lastMinute && !b.warmSentAt ? LATE : false} />
          <Step label="② מייל אישור הגעה (24 שעות לפני)" at={b.plan.confirm} sent={b.confirmSentAt} skipped={b.confirmSentAt ? false : b.plan.lastMinute ? LATE : b.status === 'CONFIRMED'} />
          <Step label="③ מייל תזכורת (שעתיים לפני)" at={b.plan.final} sent={b.finalSentAt} />
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-3 mt-3 pt-3 border-t border-slate-100">
        <button className="text-xs text-primary-600 hover:underline flex items-center gap-1" onClick={() => setOpen((v) => !v)}>
          <ChevronDown className={clsx('w-3.5 h-3.5 transition-transform', open && 'rotate-180')} />כל ההודעות והמיילים ({b.log.length})
        </button>
        <Link to={`/leads?open=${b.leadId}`} className="text-xs text-slate-500 hover:underline">לכרטיס הליד</Link>
        {active && b.status !== 'CONFIRMED' && <button className="text-xs text-emerald-700 hover:underline" onClick={() => act(() => api.post(`/consults/${b.id}/status`, { status: 'CONFIRMED' }), 'סומן: אישר הגעה')}>אישר בטלפון</button>}
        {b.status !== 'DONE' && b.status !== 'CANCELED' && new Date(b.start) < new Date() && <button className="text-xs text-primary-700 hover:underline" onClick={() => act(() => api.post(`/consults/${b.id}/status`, { status: 'DONE' }), 'סומן: התקיימה')}>התקיימה</button>}
        {active && <button className="text-xs text-red-600 hover:underline mr-auto" onClick={() => { if (confirm(`לבטל את הפגישה עם ${b.org}? התזכורות שנותרו יבוטלו, והאירוע יימחק מהיומן.`)) act(() => api.post(`/consults/${b.id}/cancel`), 'הפגישה בוטלה'); }}>ביטול פגישה</button>}
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

// Israel-time day key, e.g. "2026-11-18"
const israelDay = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const addDay = (day: string, n: number) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

// Days the owner can close (vacation, a full day): one click per day, saved at once.
function ClosedDays({ bookings }: { bookings: Booking[] }) {
  const qc = useQueryClient();
  const { data } = useQuery<{ settings: Settings }>({ queryKey: ['consult-settings'], queryFn: () => api.get('/consults/settings').then((r) => r.data) });
  const [busy, setBusy] = useState<string | null>(null);
  if (!data) return null;
  const s = data.settings;
  const closed = new Set(s.closedDays || []);
  const today = israelDay(new Date());
  const days = Array.from({ length: s.horizonDays + 1 }, (_, i) => addDay(today, i))
    .filter((d) => s.hours.find((h) => h.day === new Date(`${d}T12:00:00Z`).getUTCDay())?.on);
  const count = (d: string) => bookings.filter((b) => ['BOOKED', 'CONFIRMED', 'NOT_CONFIRMED'].includes(b.status) && israelDay(new Date(b.start)) === d).length;
  const toggle = async (d: string) => {
    const close = !closed.has(d);
    const n = count(d);
    if (close && n > 0 && !confirm(`יש ${n === 1 ? 'פגישה אחת' : `${n} פגישות`} ביום הזה. ${n === 1 ? 'היא נשארת' : 'הן נשארות'} במקום, ורק מועדים חדשים לא יוצעו. לסגור את היום?`)) return;
    setBusy(d);
    try {
      await api.put('/consults/closed-days', { day: d, closed: close });
      await qc.invalidateQueries({ queryKey: ['consult-settings'] });
      toast.success(close ? 'היום נסגר. אי אפשר לקבוע בו פגישות' : 'היום נפתח שוב לקביעת פגישות');
    } catch { toast.error('השמירה נכשלה'); } finally { setBusy(null); }
  };
  return (
    <section className="card p-4" data-closed-days>
      <h2 className="font-semibold text-slate-900">ימים פתוחים לקביעה</h2>
      <p className="text-xs text-slate-500 mt-0.5 mb-3">לוחצים על יום כדי לסגור אותו (חופש, יום מלא). ביום סגור אף אחד לא יכול לקבוע. לוחצים שוב כדי לפתוח.</p>
      <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-8 gap-2">
        {days.map((d) => {
          const isClosed = closed.has(d);
          const n = count(d);
          const wd = new Date(`${d}T12:00:00Z`).getUTCDay();
          return (
            <button key={d} data-day={d} disabled={busy === d} onClick={() => toggle(d)}
              className={clsx('rounded-xl border p-2 text-center transition-colors disabled:opacity-50',
                isClosed ? 'border-red-200 bg-red-50 hover:bg-red-100' : 'border-emerald-200 bg-emerald-50/50 hover:bg-emerald-100')}>
              <p className="text-xs text-slate-500">{d === today ? 'היום' : d === addDay(today, 1) ? 'מחר' : `יום ${DAYS[wd]}`}</p>
              <p className="font-semibold text-slate-900">{Number(d.slice(8))}/{Number(d.slice(5, 7))}</p>
              <p className={clsx('text-xs font-semibold', isClosed ? 'text-red-600' : 'text-emerald-700')}>{isClosed ? 'סגור' : 'פתוח'}</p>
              {n > 0 && <p className="text-[11px] text-slate-500">{n === 1 ? 'פגישה 1' : `${n} פגישות`}</p>}
            </button>
          );
        })}
      </div>
    </section>
  );
}

interface VisitRow {
  visitorId: string; first: string; last: string; views: number; pages: string[]; source: string;
  contact: { id: string; name: string | null; email: string } | null;
  booking: { id: string; name: string; org: string; status: Booking['status']; start: string; leadId: string } | null;
}
const SOURCE_NAMES: [RegExp, string][] = [[/whatsapp|wa\.me/i, 'וואטסאפ'], [/facebook|fb\./i, 'פייסבוק'], [/instagram/i, 'אינסטגרם'], [/google\./i, 'גוגל'], [/mail|outlook|walla/i, 'מייל']];
const sourceName = (s: string) => (s ? SOURCE_NAMES.find(([re]) => re.test(s))?.[1] || s.replace(/^www\./, '') : 'ישירות');

// Who opened the consult pages, newest first.
function VisitsPanel() {
  const [days, setDays] = useState(30);
  const { data } = useQuery<{ visitors: number; booked: number; byPage: Record<string, number>; rows: VisitRow[] }>({
    queryKey: ['consult-visits', days], queryFn: () => api.get(`/consults/visits?days=${days}`).then((r) => r.data), refetchInterval: 60_000,
  });
  if (!data) return null;
  return (
    <div className="space-y-4" data-consult-visits>
      <div className="flex items-center gap-2">
        {[7, 30, 90].map((d) => <button key={d} className={clsx('text-xs px-2.5 py-1 rounded-lg', d === days ? 'btn-primary' : 'btn-secondary')} onClick={() => setDays(d)}>{d} ימים</button>)}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="card p-3"><p className="text-xs text-slate-500">נכנסו</p><p className="text-xl font-bold">{data.visitors}</p></div>
        <div className="card p-3"><p className="text-xs text-slate-500">קבעו פגישה</p><p className="text-xl font-bold text-emerald-700">{data.booked}</p></div>
        {['דף התודה', 'דף הפגישה', 'בחירת מועד'].map((p) => <div key={p} className="card p-3"><p className="text-xs text-slate-500">{p}</p><p className="text-xl font-bold">{data.byPage[p] || 0}</p></div>)}
      </div>
      <div className="card divide-y divide-slate-100">
        {data.rows.length === 0 && <p className="p-4 text-sm text-slate-400">עוד לא נכנס אף אחד בתקופה הזאת</p>}
        {data.rows.map((r) => {
          const name = r.booking ? `${r.booking.name} · ${r.booking.org}` : r.contact ? (r.contact.name || r.contact.email) : null;
          return (
            <div key={r.visitorId} className="p-3 flex items-start justify-between gap-3 flex-wrap text-sm">
              <div className="min-w-0">
                <p className={clsx('font-semibold', name ? 'text-slate-900' : 'text-slate-500')}>
                  {name || `מבקר/ת לא מזוהה`}
                  {!r.booking && r.contact && <span className="font-normal text-xs text-slate-400"> · הוריד/ה את המדריך</span>}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">{r.pages.join(' · ')} · {r.views === 1 ? 'כניסה אחת' : `${r.views} כניסות`} · הגיע/ה מ{sourceName(r.source)}</p>
              </div>
              <div className="text-left shrink-0">
                {r.booking
                  ? <span className={clsx('badge', STATUS[r.booking.status].cls)}>{r.booking.status === 'CANCELED' ? 'קבע/ה וביטל/ה' : `קבע/ה ל-${short(r.booking.start)}`}</span>
                  : <span className="badge bg-amber-50 text-amber-700">לא קבע/ה</span>}
                <p className="text-xs text-slate-400 mt-1">{format(new Date(r.last), 'd/M HH:mm')}</p>
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-slate-400">שם מופיע כשהאדם הוריד את המדריך או קבע פגישה מאותו מכשיר. מי שנכנס בלי להשאיר פרטים מופיע כ"מבקר/ת לא מזוהה".</p>
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
  const text = (key: 'warmSubject' | 'warmBody' | 'confirmSubject' | 'confirmText' | 'finalSubject' | 'finalText', label: string, rows: number) => (
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
        <div><label className="label">הגבלת מספר פגישות (0 = בלי הגבלה)</label><input className="input" type="number" value={s.maxMeetings} onChange={(e) => set({ maxMeetings: Number(e.target.value) })} /></div>
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
        {text('confirmSubject', '② מייל 24 שעות לפני, בקשת אישור הגעה: נושא', 1)}
        {text('confirmText', '② גוף המייל (מתחתיו מופיע כפתור: מגיע/ה, מאשר/ת)', 4)}
        {text('finalSubject', '③ מייל שעתיים לפני: נושא', 1)}
        {text('finalText', '③ גוף המייל (מתחתיו כפתור כניסה לפגישה)', 3)}
      </div>
      <button className="btn-primary" onClick={save}><Save className="w-4 h-4" />שמירה</button>
    </div>
  );
}

export default function ConsultsPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'list' | 'visits' | 'settings'>('list');
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
          <p className="page-subtitle">פגישות ייעוץ חינם שנקבעו מדף התודה ומדף הפגישה, והתזכורות שיצאו</p>
        </div>
        <div className="flex gap-2">
          <button className={clsx('text-sm px-3 py-1.5 rounded-lg', tab === 'list' ? 'btn-primary' : 'btn-secondary')} onClick={() => setTab('list')}><CalendarCheck className="w-4 h-4" />פגישות</button>
          <button className={clsx('text-sm px-3 py-1.5 rounded-lg', tab === 'visits' ? 'btn-primary' : 'btn-secondary')} onClick={() => setTab('visits')}><Eye className="w-4 h-4" />מי נכנס</button>
          <button className={clsx('text-sm px-3 py-1.5 rounded-lg', tab === 'settings' ? 'btn-primary' : 'btn-secondary')} onClick={() => setTab('settings')}><Settings2 className="w-4 h-4" />הגדרות וטקסטים</button>
        </div>
      </div>

      {data && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="card p-4"><p className="text-xs text-slate-500">פגישות קרובות</p><p data-upcoming className="text-2xl font-bold text-slate-900">{data.bookings.filter((b) => ['BOOKED', 'CONFIRMED', 'NOT_CONFIRMED'].includes(b.status) && new Date(b.start) > new Date()).length}{data.places.max !== null && <span className="text-sm font-normal text-slate-400"> · נשארו {data.places.left} מתוך {data.places.max}</span>}</p></div>
          <div className="card p-4"><p className="text-xs text-slate-500">נקבעו (בלי ביטולים)</p><p className="text-2xl font-bold text-slate-900">{data.places.taken}</p></div>
          <div className={clsx('card p-4', !data.google && 'ring-1 ring-red-200')}><p className="text-xs text-slate-500">יומן גוגל</p><p className={clsx('text-sm font-semibold mt-1', data.google ? 'text-emerald-700' : 'text-red-600')}>{data.google ? 'מחובר: רואים רק שעות פנויות' : 'לא מחובר: חברו בהגדרות'}</p></div>
        </div>
      )}

      {tab === 'settings' ? <SettingsPanel /> : tab === 'visits' ? <VisitsPanel /> : isLoading ? null : (
        <>
          <ClosedDays bookings={data?.bookings || []} />
          {!data?.places.open && <div className="card p-4 flex items-center gap-2 text-sm text-amber-800 bg-amber-50"><AlertTriangle className="w-4 h-4" />ההצעה סגורה בדף התודה. מוצגת הודעת "כרגע אין מועדים פנויים" וטופס רשימת המתנה.</div>}
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
