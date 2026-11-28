import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { Megaphone, Plus, Copy, Loader2, X, Pencil, Trash2, Link2, MailPlus, AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';
import clsx from 'clsx';
import api from '../../services/api';
import { pct } from './shared';

export interface Promotion {
  id: string; name: string; code: string; url: string; day: string; note: string | null; link: string;
  visitors: number; signups: number; downloads: number;
}

const today = () => format(new Date(), 'yyyy-MM-dd');
export const showDay = (d: string) => { const [y, m, dd] = d.split('-'); return `${+dd}/${+m}/${y}`; };

async function copy(text: string, done = 'הקישור הועתק') {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(done);
  } catch {
    toast.error('לא הצלחתי להעתיק');
  }
}

function PromotionModal({ promo, defaultUrl, onClose, onSaved }: { promo: Promotion | null; defaultUrl: string; onClose: () => void; onSaved: (p?: Promotion) => void }) {
  const [form, setForm] = useState({ name: promo?.name || '', date: promo?.day || today(), note: promo?.note || '', url: promo?.url || defaultUrl, code: promo?.code || '' });
  const [saving, setSaving] = useState(false);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (promo) {
        await api.put(`/marketing/promotions/${promo.id}`, { name: form.name, date: form.date, note: form.note });
        toast.success('נשמר');
        onSaved();
      } else {
        const { data } = await api.post('/marketing/promotions', form);
        onSaved(data);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'השמירה נכשלה');
    } finally {
      setSaving(false);
    }
  };
  // Rendered on <body>: the card around it has a blur, which would otherwise trap this fixed overlay inside the card.
  return createPortal(
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <form onSubmit={save} className="modal-content">
        <div className="modal-header">
          <h2 className="modal-title">{promo ? 'עריכת פרסום' : 'פרסום חדש'}</h2>
          <button type="button" onClick={onClose} className="modal-close"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="label">שם הפרסום *</label>
            <input className="input" required autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="למשל: מודעה בעיתון, סטטוס, קבוצת מנהלי עמותות" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label className="label">תאריך הפרסום *</label><input className="input" type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
            {!promo && (
              <div>
                <label className="label">קוד בקישור <span className="text-slate-400 font-normal">(לא חובה)</span></label>
                <input className="input" dir="ltr" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} placeholder="נוצר לבד" />
              </div>
            )}
          </div>
          {!promo && (
            <div>
              <label className="label">לאיזה דף הקישור יוביל</label>
              <input className="input" dir="ltr" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
            </div>
          )}
          <div><label className="label">הערה</label><textarea className="input min-h-[60px]" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="איפה פורסם, כמה עלה, מה היה כתוב..." /></div>
          {promo && <p className="text-xs text-slate-400">הקישור עצמו לא משתנה, כדי שכל מי שכבר קיבל אותו ימשיך להיספר.</p>}
        </div>
        <div className="modal-footer">
          <button type="button" onClick={onClose} className="btn-secondary">ביטול</button>
          <button type="submit" disabled={saving} className="btn-primary">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : promo ? 'שמירה' : 'יצירת קישור'}</button>
        </div>
      </form>
    </div>,
    document.body,
  );
}

function CreatedModal({ promo, onClose }: { promo: Promotion; onClose: () => void }) {
  return createPortal(
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-content">
        <div className="modal-header">
          <h2 className="modal-title">הקישור של "{promo.name}" מוכן</h2>
          <button type="button" onClick={onClose} className="modal-close"><X className="w-5 h-5" /></button>
        </div>
        <p className="text-sm text-slate-600 mb-3">שלח את הקישור הזה בפרסום. כל מי שייכנס דרכו ייספר כאן, ותראה כמה נכנסו, כמה נרשמו וכמה הורידו את המדריך.</p>
        <div className="flex items-center gap-2 rounded-xl bg-slate-50 border border-slate-200 p-3">
          <Link2 className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <span className="flex-1 text-sm font-medium text-slate-800 break-all" dir="ltr">{promo.link}</span>
        </div>
        <div className="modal-footer">
          <button type="button" onClick={onClose} className="btn-secondary">סגירה</button>
          <button type="button" onClick={() => copy(promo.link)} className="btn-primary"><Copy className="w-4 h-4" /> העתקת הקישור</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default function PromotionsCard() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Promotion | 'new' | null>(null);
  const [created, setCreated] = useState<Promotion | null>(null);
  const [mailFor, setMailFor] = useState<Promotion | null>(null);
  const { data, isLoading } = useQuery<{ defaultUrl: string; promotions: Promotion[] }>({
    queryKey: ['marketing-promotions'],
    queryFn: () => api.get('/marketing/promotions').then((r) => r.data),
    refetchInterval: 60_000,
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['marketing-promotions'] });
    qc.invalidateQueries({ queryKey: ['marketing-tracking'] });
  };
  const remove = async (p: Promotion) => {
    if (!confirm(`למחוק את "${p.name}"? המספרים שלו לא יוצגו יותר בנפרד (הכניסות עצמן לא נמחקות).`)) return;
    try {
      await api.delete(`/marketing/promotions/${p.id}`);
      refresh();
    } catch {
      toast.error('המחיקה נכשלה');
    }
  };

  return (
    <div className="card p-0 overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-primary-50 text-primary-700 flex items-center justify-center flex-shrink-0"><Megaphone className="w-[18px] h-[18px]" /></div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-slate-900">פרסומים</h3>
          <p className="text-xs text-slate-500">לכל פרסום קישור משלו, וכאן רואים מה הוא הביא</p>
        </div>
        <button onClick={() => setEditing('new')} className="btn-primary text-sm flex-shrink-0"><Plus className="w-4 h-4" /> פרסום חדש</button>
      </div>
      {isLoading || !data ? (
        <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
      ) : data.promotions.length === 0 ? (
        <div className="text-center py-10 px-6">
          <p className="text-sm text-slate-500">עוד לא נרשם פרסום.</p>
          <p className="text-xs text-slate-400 mt-1">לפני שאתה מפרסם, לחץ "פרסום חדש", תן לו שם ותאריך, ושלח בפרסום את הקישור שייווצר.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="table-header">פרסום</th>
                <th className="table-header w-24 hidden sm:table-cell">תאריך</th>
                <th className="table-header w-24 hidden sm:table-cell">נכנסו</th>
                <th className="table-header w-28 hidden sm:table-cell">נרשמו</th>
                <th className="table-header w-28 hidden sm:table-cell">הורידו</th>
                <th className="table-header w-32"></th>
              </tr>
            </thead>
            <tbody>
              {data.promotions.map((p) => (
                <tr key={p.id} className="table-row">
                  <td className="table-cell">
                    <p className="font-medium text-slate-800">{p.name}</p>
                    <p className="text-xs text-slate-400 truncate max-w-[260px]" dir="ltr">{p.link.replace(/^https?:\/\//, '')}</p>
                    {p.note && <p className="text-xs text-slate-500 mt-0.5">{p.note}</p>}
                    <p className="sm:hidden mt-1.5 text-xs text-slate-600">
                      {showDay(p.day)} · נכנסו <b className="text-slate-900">{p.visitors}</b> · נרשמו <b className="text-slate-900">{p.signups}</b> · הורידו <b className="text-slate-900">{p.downloads}</b>
                    </p>
                  </td>
                  <td className="table-cell text-sm whitespace-nowrap hidden sm:table-cell">{showDay(p.day)}</td>
                  <td className="table-cell text-sm font-semibold hidden sm:table-cell">{p.visitors}</td>
                  <td className="table-cell text-sm hidden sm:table-cell">{p.signups}{p.visitors > 0 && <span className="text-xs text-slate-400"> ({pct(p.signups, p.visitors)}%)</span>}</td>
                  <td className="table-cell text-sm hidden sm:table-cell">{p.downloads}{p.signups > 0 && <span className="text-xs text-slate-400"> ({pct(p.downloads, p.signups)}%)</span>}</td>
                  <td className="table-cell">
                    <div className="flex flex-col sm:flex-row items-end sm:items-center gap-1 justify-end">
                      <button onClick={() => copy(p.link)} className="btn-ghost text-xs px-2 py-1" title="העתקת הקישור"><Copy className="w-4 h-4" /> קישור</button>
                      <button onClick={() => setMailFor(p)} className="btn-ghost text-xs px-2 py-1" title="כפתור לקבלת המדריך במייל, למי שאין דפדפן"><MailPlus className="w-4 h-4" /> כפתור מייל</button>
                      <button onClick={() => setEditing(p)} className="btn-ghost p-1.5" title="עריכה"><Pencil className="w-4 h-4" /></button>
                      <button onClick={() => remove(p)} className="btn-ghost p-1.5 text-slate-400 hover:text-red-600" title="מחיקה"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && (
        <PromotionModal
          promo={editing === 'new' ? null : editing}
          defaultUrl={data?.defaultUrl || 'https://yehoshua.co.il/'}
          onClose={() => setEditing(null)}
          onSaved={(p) => { setEditing(null); refresh(); if (p) setCreated(p); }}
        />
      )}
      {created && <CreatedModal promo={created} onClose={() => setCreated(null)} />}
      {mailFor && <MailButtonModal code={mailFor.code} name={mailFor.name} onClose={() => setMailFor(null)} />}
    </div>
  );
}

// ---- Guide by email ----

interface Snippet { mailto: string; html: string; text: string; preview: string }

export function MailButtonModal({ code, name, onClose }: { code: string | null; name: string | null; onClose: () => void }) {
  const { data, isLoading, error } = useQuery<Snippet>({
    queryKey: ['guide-mail-snippet', code],
    queryFn: () => api.get('/marketing/guide-mail/snippet', { params: { code: code || undefined } }).then((r) => r.data),
  });
  return createPortal(
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-content max-w-xl">
        <div className="modal-header">
          <h2 className="modal-title">כפתור "קבל את המדריך במייל"{name ? ` – ${name}` : ''}</h2>
          <button type="button" onClick={onClose} className="modal-close"><X className="w-5 h-5" /></button>
        </div>
        {isLoading ? <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
          : error || !data ? <p className="text-sm text-red-600">{(error as any)?.response?.data?.error || 'לא הצלחתי להכין את הכפתור'}</p> : (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              למפרסם או לפורום שמוציאים את המייל: שיוסיפו את הכפתור הזה מתחת לקישור. מי שאין לו דפדפן לוחץ, נפתח לו מייל מוכן, הוא שולח, והמערכת שולחת לו את המדריך אוטומטית.
              {code && ' הבקשות שיגיעו דרכו ייספרו בשורה של הפרסום הזה.'}
            </p>
            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <p className="text-xs text-slate-400 px-3 py-1.5 bg-slate-50 border-b border-slate-200">כך זה ייראה במייל</p>
              <iframe title="תצוגה" srcDoc={data.preview} className="w-full h-36 bg-white" />
            </div>
            <div className="grid gap-2">
              <button type="button" onClick={() => copy(data.html, 'קוד הכפתור הועתק')} className="btn-primary justify-center"><Copy className="w-4 h-4" /> העתקת קוד הכפתור (HTML)</button>
              <button type="button" onClick={() => copy(data.mailto)} className="btn-secondary justify-center"><Link2 className="w-4 h-4" /> העתקת הקישור בלבד (לשים על כפתור קיים)</button>
              <button type="button" onClick={() => copy(data.text, 'הטקסט הועתק')} className="btn-ghost justify-center text-sm">העתקת הסבר בטקסט רגיל (למייל בלי עיצוב)</button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

interface GuideMailInfo {
  address: string; gmailAddress: string | null; gmailConnected: boolean; ready: boolean; problems: string[]; welcomeActive: boolean;
  schedule: { mode: 'fast' | 'slow' | 'quiet'; label: string };
  counts: Record<string, number>;
  recent: { id: string; email: string; name: string | null; status: string; note: string | null; consent: boolean; promotion: string | null; receivedAt: string }[];
}

const REQ_STATUS: Record<string, { label: string; cls: string }> = {
  queued: { label: 'נשלח המדריך', cls: 'bg-emerald-100 text-emerald-700' },
  sent: { label: 'נשלח המדריך', cls: 'bg-emerald-100 text-emerald-700' },
  duplicate: { label: 'כבר קיבל', cls: 'bg-slate-100 text-slate-600' },
  ignored: { label: 'לא בקשה', cls: 'bg-slate-100 text-slate-500' },
  failed: { label: 'נכשל', cls: 'bg-red-100 text-red-700' },
};

export function GuideMailCard() {
  const qc = useQueryClient();
  const [showButton, setShowButton] = useState(false);
  const [running, setRunning] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<{ error: string; redirectUri: string } | null>(null);
  const connectGmail = async () => {
    setConnecting(true);
    setConnectError(null);
    try {
      const { data: r } = await api.get('/marketing/guide-mail/connect');
      window.location.assign(r.link); // Google's sign-in page; it comes back to a "connected" page
    } catch (err: any) {
      setConnectError(err.response?.data || { error: 'לא הצלחתי להתחיל את החיבור', redirectUri: '' });
      setConnecting(false);
    }
  };
  const { data, isLoading } = useQuery<GuideMailInfo>({
    queryKey: ['guide-mail'],
    queryFn: () => api.get('/marketing/guide-mail').then((r) => r.data),
    refetchInterval: 60_000,
  });
  const runNow = async () => {
    setRunning(true);
    try {
      const { data: r } = await api.post('/marketing/guide-mail/run');
      toast.success(r.handled ? `טופלו ${r.handled} בקשות חדשות` : 'אין בקשות חדשות');
      qc.invalidateQueries({ queryKey: ['guide-mail'] });
      qc.invalidateQueries({ queryKey: ['marketing-tracking'] });
      qc.invalidateQueries({ queryKey: ['marketing-promotions'] });
    } catch {
      toast.error('הבדיקה נכשלה');
    } finally {
      setRunning(false);
    }
  };
  const sent = (data?.counts.queued || 0) + (data?.counts.sent || 0);

  return (
    <div className="card p-0 overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-primary-50 text-primary-700 flex items-center justify-center flex-shrink-0"><MailPlus className="w-[18px] h-[18px]" /></div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-slate-900">בקשות למדריך במייל</h3>
          <p className="text-xs text-slate-500">למי שאין דפדפן: כפתור שפותח מייל מוכן, והמדריך נשלח אליו אוטומטית{data ? ` · עד היום ${sent}` : ''}</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 flex-shrink-0">
          <button onClick={() => setShowButton(true)} className="btn-secondary text-sm" disabled={!data?.address}><Copy className="w-4 h-4" /> הכפתור</button>
          <button onClick={runNow} className="btn-ghost text-sm" disabled={running} title="בדיקת בקשות חדשות עכשיו">{running ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} בדיקה</button>
        </div>
      </div>
      {isLoading || !data ? <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div> : (
        <>
          {data.ready ? (
            <p className="px-6 py-3 text-sm text-emerald-700 bg-emerald-50 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> פעיל: הבקשות מגיעות אל <span dir="ltr" className="font-medium">{data.address}</span>, והמדריך נשלח אוטומטית
            </p>
          ) : (
            <div className="px-6 py-3 bg-amber-50 text-sm text-amber-900 space-y-2">
              {data.problems.map((p, i) => <p key={i} className="flex items-start gap-2"><AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" /> {p}</p>)}
              {(!data.gmailConnected || (data.address && data.gmailAddress !== data.address)) && (
                <div className="pt-1">
                  <button onClick={connectGmail} disabled={connecting} className="btn-primary text-sm">
                    {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <MailPlus className="w-4 h-4" />} {data.gmailConnected ? 'חיבור ג\'ימייל אחר' : 'חיבור ג\'ימייל'}
                  </button>
                  <p className="text-xs text-amber-800 mt-1.5">ייפתח דף של גוגל. בחר את החשבון <span dir="ltr" className="font-medium">{data.address || 'של כתובת המענה'}</span>, ואשר את ההרשאות ליומן ולמייל.</p>
                  {connectError && (
                    <div className="mt-2 rounded-xl bg-white border border-amber-200 p-3 text-xs text-slate-700 space-y-1">
                      <p className="font-semibold text-red-700">{connectError.error}</p>
                      {connectError.redirectUri && <p>אם גוגל מציג שגיאה של כתובת חזרה (redirect_uri_mismatch), צריך להוסיף בהגדרות החיבור לגוגל (Google Cloud ← Credentials ← Authorized redirect URIs) את הכתובת: <span dir="ltr" className="font-mono break-all">{connectError.redirectUri}</span></p>}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          <p className="px-6 py-2 text-xs text-slate-500 border-b border-slate-100">{data.schedule.label} אפשר תמיד ללחוץ "בדיקה" כדי לטפל בבקשות מיד.</p>
          {data.recent.length === 0 ? <p className="text-center text-slate-400 py-8 text-sm">עוד לא הגיעו בקשות במייל</p> : (
            <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
              {data.recent.map((r) => (
                <div key={r.id} className="px-6 py-2.5 flex items-center gap-3 text-sm">
                  <span className="text-slate-400 w-20 flex-shrink-0">{format(new Date(r.receivedAt), 'd/M HH:mm')}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-800 truncate">{r.name || r.email}</p>
                    <p className="text-xs text-slate-400 truncate">
                      {r.name && <span dir="ltr">{r.email}</span>}{r.promotion && ` · ${r.promotion}`}{r.status !== 'ignored' && !r.consent && ' · בלי רשימת דיוור'}{r.note && ` · ${r.note}`}
                    </p>
                  </div>
                  <span className={clsx('badge flex-shrink-0', REQ_STATUS[r.status]?.cls || 'bg-slate-100 text-slate-600')}>{REQ_STATUS[r.status]?.label || r.status}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      {showButton && <MailButtonModal code={null} name={null} onClose={() => setShowButton(false)} />}
    </div>
  );
}
