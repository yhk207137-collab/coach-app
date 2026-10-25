import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import {
  Search, Plus, Upload, Download, Tag, Trash2, UserMinus, X, Loader2, Users2, UserPlus, MailOpen, MousePointerClick,
  CheckCircle2, FileSpreadsheet, ChevronLeft, ChevronRight, Mail, ShieldCheck,
} from 'lucide-react';
import api from '../../services/api';
import { cleanEmail, EMAIL_PATTERN } from '../../utils/text';
import { Contact, CONTACT_STATUS, ContactStatus } from './shared';
import { parseTable, rowsToContacts } from './importParser';

interface Stats {
  total: number; subscribed: number; unsubscribed: number; bounced: number; newThisMonth: number;
  tags: { tag: string; count: number }[]; sources: { source: string; count: number }[];
}

function TagInput({ value, onChange, suggestions }: { value: string[]; onChange: (v: string[]) => void; suggestions: string[] }) {
  const [text, setText] = useState('');
  const add = (t: string) => {
    const clean = t.trim();
    if (clean && !value.includes(clean)) onChange([...value, clean]);
    setText('');
  };
  const left = suggestions.filter((s) => !value.includes(s) && s.includes(text.trim()));
  return (
    <div>
      <div className="flex flex-wrap gap-1.5 p-2 rounded-xl border border-slate-200 bg-white min-h-[44px]">
        {value.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary-50 text-primary-700 text-sm">
            {t}<button type="button" onClick={() => onChange(value.filter((x) => x !== t))}><X className="w-3 h-3" /></button>
          </span>
        ))}
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={value.length ? '' : 'הקלידו תגית ולחצו Enter'}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(text); } if (e.key === 'Backspace' && !text && value.length) onChange(value.slice(0, -1)); }}
          onBlur={() => text && add(text)}
          className="flex-1 min-w-[120px] outline-none text-sm px-1" />
      </div>
      {left.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {left.slice(0, 8).map((s) => (
            <button key={s} type="button" onClick={() => add(s)} className="px-2 py-0.5 rounded-full border border-dashed border-slate-300 text-xs text-slate-500 hover:border-primary-400 hover:text-primary-600">+ {s}</button>
          ))}
        </div>
      )}
    </div>
  );
}

function AddContactModal({ tags, onClose, onSaved }: { tags: string[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ name: '', email: '', phone: '', notes: '', tags: [] as string[], consentConfirmed: false });
  const [saving, setSaving] = useState(false);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/marketing/contacts', form);
      toast.success('איש הקשר נוסף');
      onSaved();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'השמירה נכשלה');
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <form onSubmit={save} className="modal-content">
        <div className="modal-header">
          <h2 className="modal-title">איש קשר חדש</h2>
          <button type="button" onClick={onClose} className="modal-close"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">שם</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><label className="label">טלפון</label><input className="input" dir="ltr" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          </div>
          <div><label className="label">מייל *</label><input className="input" dir="ltr" type="text" inputMode="email" required value={form.email} onChange={(e) => setForm({ ...form, email: cleanEmail(e.target.value) })} /></div>
          <div><label className="label">תגיות</label><TagInput value={form.tags} onChange={(t) => setForm({ ...form, tags: t })} suggestions={tags} /></div>
          <div><label className="label">הערות</label><textarea className="input min-h-[70px]" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          <label className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50 text-sm text-amber-900 cursor-pointer">
            <input type="checkbox" checked={form.consentConfirmed} onChange={(e) => setForm({ ...form, consentConfirmed: e.target.checked })} className="mt-1 accent-primary-600" />
            <span>איש הקשר ביקש או הסכים לקבל ממני מיילים. <span className="text-amber-700">(החוק אוסר לשלוח דיוור למי שלא הסכים)</span></span>
          </label>
        </div>
        <div className="modal-footer">
          <button type="button" onClick={onClose} className="btn-secondary">ביטול</button>
          <button type="submit" disabled={saving || !form.consentConfirmed} className="btn-primary">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'הוספה'}</button>
        </div>
      </form>
    </div>
  );
}

function ImportModal({ tags, onClose, onDone }: { tags: string[]; onClose: () => void; onDone: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [importTags, setImportTags] = useState<string[]>([]);
  const [source, setSource] = useState('ייבוא');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ created: number; updated: number; invalid: number; skippedUnsubscribed: number } | null>(null);
  const parsed = useMemo(() => (text.trim() ? rowsToContacts(parseTable(text)) : null), [text]);
  const invalidCount = parsed ? parsed.rows.filter((r) => !EMAIL_PATTERN.test(cleanEmail(r.email))).length : 0;

  const readFile = async (file?: File) => {
    if (!file) return;
    if (/\.xlsx?$/i.test(file.name)) {
      toast.error('באקסל: בחרו את הטבלה, העתיקו (Ctrl+C) והדביקו כאן. או שמרו בתור CSV.', { duration: 7000 });
      return;
    }
    setText(await file.text());
  };

  const run = async () => {
    if (!parsed?.rows.length) return;
    setBusy(true);
    try {
      const { data } = await api.post('/marketing/contacts/import', { rows: parsed.rows, tags: importTags, source, consentConfirmed: consent });
      setResult(data);
      onDone();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'הייבוא נכשל');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col animate-fade-in">
        <div className="modal-header">
          <h2 className="font-semibold text-slate-900">ייבוא אנשי קשר</h2>
          <button onClick={onClose} className="btn-ghost p-1.5 rounded-lg"><X className="w-4 h-4" /></button>
        </div>
        {result ? (
          <div className="p-8 text-center space-y-3">
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
            <p className="text-lg font-semibold text-slate-900">הייבוא הסתיים</p>
            <p className="text-slate-600">נוספו <strong>{result.created}</strong> חדשים · עודכנו <strong>{result.updated}</strong> קיימים{result.invalid ? ` · ${result.invalid} שורות עם מייל לא תקין דולגו` : ''}</p>
            {result.skippedUnsubscribed > 0 && <p className="text-sm text-slate-500">{result.skippedUnsubscribed} מהם הסירו את עצמם בעבר, ונשארו מוסרים.</p>}
            <button onClick={onClose} className="btn-primary mt-2">סגירה</button>
          </div>
        ) : (
          <div className="p-6 space-y-5 overflow-y-auto">
            <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600 space-y-1">
              <p className="font-medium text-slate-800">איך מייבאים?</p>
              <p>מאקסל או מגוגל שיטס: סמנו את הטבלה (כולל שורת הכותרות), העתיקו והדביקו כאן. או העלו קובץ CSV.</p>
              <p>המערכת מזהה לבד את עמודות המייל, השם והטלפון.</p>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => fileRef.current?.click()} className="btn-secondary text-sm"><FileSpreadsheet className="w-4 h-4" /> בחירת קובץ CSV</button>
              <input ref={fileRef} type="file" accept=".csv,.txt,.tsv,.xlsx,.xls" hidden onChange={(e) => { readFile(e.target.files?.[0]); e.target.value = ''; }} />
            </div>
            <textarea className="input min-h-[140px] font-mono text-xs" dir="ltr" value={text} onChange={(e) => setText(e.target.value)} placeholder={'שם\tמייל\nישראל ישראלי\tisrael@example.com'} />
            {parsed && (
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-4 py-2 bg-slate-50 text-sm text-slate-600 flex justify-between">
                  <span>זוהו <strong>{parsed.rows.length - invalidCount}</strong> אנשי קשר{invalidCount > 0 && <span className="text-amber-600"> · {invalidCount} שורות עם מייל לא תקין ידולגו</span>}</span>
                  {parsed.columns.email === undefined && <span className="text-red-500">לא נמצאה עמודת מייל</span>}
                </div>
                <table className="w-full text-sm">
                  <thead><tr className="text-slate-400 text-xs"><th className="px-4 py-2 text-right">שם</th><th className="px-4 py-2 text-right">מייל</th><th className="px-4 py-2 text-right">טלפון</th></tr></thead>
                  <tbody>
                    {parsed.rows.slice(0, 5).map((r, i) => (
                      <tr key={i} className="border-t border-slate-100"><td className="px-4 py-1.5">{r.name || '—'}</td><td className="px-4 py-1.5" dir="ltr">{r.email}</td><td className="px-4 py-1.5" dir="ltr">{r.phone || '—'}</td></tr>
                    ))}
                  </tbody>
                </table>
                {parsed.rows.length > 5 && <p className="px-4 py-2 text-xs text-slate-400 border-t border-slate-100">ועוד {parsed.rows.length - 5}…</p>}
              </div>
            )}
            <div className="grid sm:grid-cols-2 gap-4">
              <div><label className="label">תגיות לכל המיובאים</label><TagInput value={importTags} onChange={setImportTags} suggestions={tags} /></div>
              <div><label className="label">מקור</label><input className="input" value={source} onChange={(e) => setSource(e.target.value)} /></div>
            </div>
            <label className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50 text-sm text-amber-900 cursor-pointer">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 accent-primary-600" />
              <span>כל האנשים ברשימה נרשמו או הסכימו לקבל ממני מיילים.</span>
            </label>
          </div>
        )}
        {!result && (
          <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100">
            <button onClick={onClose} className="btn-secondary">ביטול</button>
            <button onClick={run} disabled={busy || !consent || !parsed?.rows.length} className="btn-primary">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : `ייבוא ${(parsed?.rows.length || 0) - invalidCount} אנשי קשר`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ContactDrawer({ id, tags, onClose, onChanged }: { id: string; tags: string[]; onClose: () => void; onChanged: () => void }) {
  const qc = useQueryClient();
  const { data: c, isLoading } = useQuery<Contact & { sends: any[] }>({
    queryKey: ['contact', id],
    queryFn: () => api.get(`/marketing/contacts/${id}`).then((r) => r.data),
  });
  const [edit, setEdit] = useState<{ name: string; phone: string; notes: string; tags: string[] } | null>(null);
  const save = async (patch: Record<string, unknown>, msg = 'נשמר') => {
    try {
      await api.put(`/marketing/contacts/${id}`, patch);
      toast.success(msg);
      qc.invalidateQueries({ queryKey: ['contact', id] });
      onChanged();
      setEdit(null);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'השמירה נכשלה');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex" onClick={(e) => e.target === e.currentTarget && onClose()} style={{ background: 'rgba(15,23,42,.35)' }}>
      <div className="mr-auto w-full max-w-md h-full bg-white shadow-2xl overflow-y-auto animate-fade-in">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
          <h2 className="font-semibold text-slate-900">כרטיס איש קשר</h2>
          <button onClick={onClose} className="btn-ghost p-1.5"><X className="w-4 h-4" /></button>
        </div>
        {isLoading || !c ? <div className="p-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div> : (
          <div className="p-6 space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-primary-100 text-primary-700 flex items-center justify-center text-lg font-bold">{(c.name || c.email)[0].toUpperCase()}</div>
              <div className="min-w-0">
                <p className="font-semibold text-slate-900 truncate">{c.name || 'ללא שם'}</p>
                <p className="text-sm text-slate-500 truncate" dir="ltr">{c.email}</p>
              </div>
              <span className={clsx('badge mr-auto', CONTACT_STATUS[c.status].cls)}>{CONTACT_STATUS[c.status].label}</span>
            </div>

            {edit ? (
              <div className="space-y-3">
                <div><label className="label">שם</label><input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></div>
                <div><label className="label">טלפון</label><input className="input" dir="ltr" value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></div>
                <div><label className="label">תגיות</label><TagInput value={edit.tags} onChange={(t) => setEdit({ ...edit, tags: t })} suggestions={tags} /></div>
                <div><label className="label">הערות</label><textarea className="input min-h-[70px]" value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} /></div>
                <div className="flex gap-2"><button onClick={() => save(edit)} className="btn-primary">שמירה</button><button onClick={() => setEdit(null)} className="btn-secondary">ביטול</button></div>
              </div>
            ) : (
              <div className="space-y-3 text-sm">
                <div className="flex justify-between"><span className="text-slate-500">טלפון</span><span dir="ltr">{c.phone || '—'}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">מקור</span><span>{c.source || '—'}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">הצטרף</span><span>{format(new Date(c.createdAt), 'd/M/yyyy HH:mm')}</span></div>
                <div>
                  <span className="text-slate-500">תגיות</span>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">{c.tags.length ? c.tags.map((t) => <span key={t} className="px-2.5 py-0.5 rounded-full bg-primary-50 text-primary-700 text-xs">{t}</span>) : <span className="text-slate-400">אין</span>}</div>
                </div>
                {c.notes && <div><span className="text-slate-500">הערות</span><p className="mt-1 whitespace-pre-wrap">{c.notes}</p></div>}
                <button onClick={() => setEdit({ name: c.name || '', phone: c.phone || '', notes: c.notes || '', tags: c.tags })} className="btn-secondary text-sm w-full justify-center">עריכת פרטים</button>
              </div>
            )}

            <div className="rounded-xl bg-slate-50 p-4 text-xs text-slate-500 space-y-1">
              <p className="font-medium text-slate-700 flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5" /> תיעוד הסכמה</p>
              <p>{c.consentText || '—'}</p>
              {c.consentAt && <p>{format(new Date(c.consentAt), 'd/M/yyyy HH:mm')}</p>}
              {c.consentPage && <p dir="ltr" className="truncate">{c.consentPage}</p>}
              {c.unsubscribedAt && <p className="text-slate-700">הוסר/ה מהרשימה ב-{format(new Date(c.unsubscribedAt), 'd/M/yyyy HH:mm')}</p>}
            </div>

            <div>
              <h3 className="text-sm font-semibold text-slate-800 mb-2">היסטוריית מיילים</h3>
              {c.sends.length === 0 ? <p className="text-sm text-slate-400">עדיין לא נשלחו מיילים</p> : (
                <div className="space-y-2">
                  {c.sends.map((s: any) => (
                    <Link key={s.id} to={`/marketing/campaigns/${s.campaign.id}/report`} className="flex items-center gap-2 p-2.5 rounded-xl border border-slate-100 hover:bg-slate-50 text-sm">
                      <Mail className="w-4 h-4 text-slate-400 flex-shrink-0" />
                      <span className="flex-1 truncate">{s.campaign.name}</span>
                      {s.clickedAt ? <MousePointerClick className="w-4 h-4 text-amber-500" /> : s.openedAt ? <MailOpen className="w-4 h-4 text-emerald-500" /> : <span className="text-xs text-slate-400">{s.sentAt ? 'לא נפתח' : 'בתור'}</span>}
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {c.status === 'SUBSCRIBED' ? (
              <button onClick={() => confirm('להסיר את איש הקשר מרשימת התפוצה?') && save({ status: 'UNSUBSCRIBED' }, 'הוסר מהרשימה')} className="btn-secondary w-full justify-center text-sm"><UserMinus className="w-4 h-4" /> הסרה מרשימת התפוצה</button>
            ) : (
              <button onClick={() => confirm('איש הקשר ביקש במפורש לחזור לרשימה?') && save({ status: 'SUBSCRIBED', consentConfirmed: true }, 'הוחזר לרשימה')} className="btn-secondary w-full justify-center text-sm"><UserPlus className="w-4 h-4" /> החזרה לרשימה (לבקשתו)</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ContactsPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<ContactStatus | ''>('');
  const [tag, setTag] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [modal, setModal] = useState<'add' | 'import' | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [bulkTag, setBulkTag] = useState('');

  const params = { q: q.trim() || undefined, status: status || undefined, tag: tag || undefined, page, pageSize: 50 };
  const { data, isLoading } = useQuery<{ items: Contact[]; total: number; pageSize: number }>({
    queryKey: ['contacts', params],
    queryFn: () => api.get('/marketing/contacts', { params }).then((r) => r.data),
    placeholderData: (prev) => prev,
  });
  const { data: stats } = useQuery<Stats>({
    queryKey: ['contact-stats'],
    queryFn: () => api.get('/marketing/contacts/stats').then((r) => r.data),
  });
  const allTags = (stats?.tags || []).map((t) => t.tag);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['contacts'] });
    qc.invalidateQueries({ queryKey: ['contact-stats'] });
  };

  const items = data?.items || [];
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const allChecked = items.length > 0 && items.every((c) => selected.has(c.id));
  const toggleAll = () => setSelected(allChecked ? new Set() : new Set(items.map((c) => c.id)));
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const bulk = async (action: string, extra: Record<string, string> = {}) => {
    const ids = [...selected];
    if (action === 'delete' && !confirm(`למחוק לצמיתות ${ids.length} אנשי קשר? כולל היסטוריית המיילים שלהם.`)) return;
    if (action === 'unsubscribe' && !confirm(`להסיר ${ids.length} אנשי קשר מרשימת התפוצה?`)) return;
    try {
      await api.post('/marketing/contacts/bulk', { ids, action, ...extra });
      toast.success('בוצע');
      setSelected(new Set());
      setBulkTag('');
      refresh();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'הפעולה נכשלה');
    }
  };

  const exportCsv = async () => {
    const res = await api.get('/marketing/contacts/export.csv', { params: { ...params, page: undefined, pageSize: undefined }, responseType: 'blob' });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = `contacts-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const kpis = [
    { label: 'רשומים פעילים', value: stats?.subscribed, icon: Users2, color: 'bg-emerald-100 text-emerald-600', onClick: () => { setStatus('SUBSCRIBED'); setPage(1); } },
    { label: 'חדשים ב-30 יום', value: stats?.newThisMonth, icon: UserPlus, color: 'bg-violet-100 text-violet-600' },
    { label: 'הסירו את עצמם', value: stats?.unsubscribed, icon: UserMinus, color: 'bg-slate-100 text-slate-500', onClick: () => { setStatus('UNSUBSCRIBED'); setPage(1); } },
    { label: 'סה"כ אנשי קשר', value: stats?.total, icon: Mail, color: 'bg-blue-100 text-blue-600', onClick: () => { setStatus(''); setTag(''); setPage(1); } },
  ];

  return (
    <div className="space-y-6">
      <div className="page-header mb-0">
        <div>
          <h1 className="page-title">אנשי קשר</h1>
          <p className="page-subtitle">הנרשמים לדיוור, בנפרד מהלקוחות. נרשמים חדשים מדף הנחיתה נכנסים לכאן אוטומטית.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={exportCsv} className="btn-secondary"><Download className="w-4 h-4" /> ייצוא</button>
          <button onClick={() => setModal('import')} className="btn-secondary"><Upload className="w-4 h-4" /> ייבוא</button>
          <button onClick={() => setModal('add')} className="btn-primary"><Plus className="w-4 h-4" /> איש קשר</button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k) => (
          <button key={k.label} type="button" onClick={k.onClick} className={clsx('stat-card text-right', !k.onClick && 'cursor-default')}>
            <div className={clsx('stat-icon', k.color)}><k.icon className="w-5 h-5" /></div>
            <div><p className="text-2xl font-bold text-slate-900">{k.value ?? '…'}</p><p className="text-sm text-slate-600">{k.label}</p></div>
          </button>
        ))}
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
            <input className="input pr-9" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="חיפוש לפי שם, מייל או טלפון" />
          </div>
          <select className="input lg:w-44" value={status} onChange={(e) => { setStatus(e.target.value as ContactStatus | ''); setPage(1); }}>
            <option value="">כל הסטטוסים</option>
            {(Object.keys(CONTACT_STATUS) as ContactStatus[]).map((s) => <option key={s} value={s}>{CONTACT_STATUS[s].label}</option>)}
          </select>
          <select className="input lg:w-52" value={tag} onChange={(e) => { setTag(e.target.value); setPage(1); }}>
            <option value="">כל התגיות</option>
            {(stats?.tags || []).map((t) => <option key={t.tag} value={t.tag}>{t.tag} ({t.count})</option>)}
          </select>
        </div>

        {selected.size > 0 && (
          <div className="px-4 py-3 bg-primary-50 border-b border-primary-100 flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium text-primary-800">{selected.size} נבחרו</span>
            <div className="flex items-center gap-1 mr-2">
              <input className="input py-1.5 w-40 text-sm" value={bulkTag} onChange={(e) => setBulkTag(e.target.value)} placeholder="שם תגית" list="all-tags" />
              <datalist id="all-tags">{allTags.map((t) => <option key={t} value={t} />)}</datalist>
              <button disabled={!bulkTag.trim()} onClick={() => bulk('addTag', { tag: bulkTag })} className="btn-secondary py-1.5 text-xs"><Tag className="w-3.5 h-3.5" /> הוספת תגית</button>
              <button disabled={!bulkTag.trim()} onClick={() => bulk('removeTag', { tag: bulkTag })} className="btn-ghost py-1.5 text-xs">הסרת תגית</button>
            </div>
            <button onClick={() => bulk('unsubscribe')} className="btn-ghost py-1.5 text-xs"><UserMinus className="w-3.5 h-3.5" /> הסרה מהרשימה</button>
            <button onClick={() => bulk('delete')} className="btn-ghost py-1.5 text-xs text-red-500"><Trash2 className="w-3.5 h-3.5" /> מחיקה</button>
            <button onClick={() => setSelected(new Set())} className="mr-auto text-xs text-slate-500 hover:underline">ניקוי בחירה</button>
          </div>
        )}

        {isLoading && !data ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
        ) : items.length === 0 ? (
          <div className="text-center py-16 px-6">
            <Users2 className="w-12 h-12 mx-auto text-slate-300 mb-3" />
            <p className="font-semibold text-slate-700">{q || status || tag ? 'לא נמצאו אנשי קשר' : 'עדיין אין אנשי קשר'}</p>
            {!(q || status || tag) && <p className="text-sm text-slate-500 mt-1">נרשמים מדף הנחיתה יופיעו כאן אוטומטית. אפשר גם לייבא רשימה קיימת.</p>}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="table-header w-10"><input type="checkbox" checked={allChecked} onChange={toggleAll} className="accent-primary-600" /></th>
                  <th className="table-header">איש קשר</th>
                  <th className="table-header">סטטוס</th>
                  <th className="table-header">תגיות</th>
                  <th className="table-header">מקור</th>
                  <th className="table-header">הצטרף</th>
                </tr>
              </thead>
              <tbody>
                {items.map((c) => (
                  <tr key={c.id} className="table-row cursor-pointer" onClick={() => setOpenId(c.id)}>
                    <td className="table-cell" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} className="accent-primary-600" /></td>
                    <td className="table-cell">
                      <p className="font-medium text-slate-800">{c.name || '—'}</p>
                      <p className="text-xs text-slate-400" dir="ltr">{c.email}</p>
                    </td>
                    <td className="table-cell"><span className={clsx('badge', CONTACT_STATUS[c.status].cls)}>{CONTACT_STATUS[c.status].label}</span></td>
                    <td className="table-cell"><div className="flex flex-wrap gap-1 max-w-xs">{c.tags.map((t) => <span key={t} className="px-2 py-0.5 rounded-full bg-primary-50 text-primary-700 text-xs">{t}</span>)}</div></td>
                    <td className="table-cell text-sm text-slate-500">{c.source || '—'}</td>
                    <td className="table-cell text-sm text-slate-500">{format(new Date(c.createdAt), 'd/M/yyyy')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data && data.total > data.pageSize && (
          <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between text-sm text-slate-500">
            <span>{data.total} אנשי קשר</span>
            <div className="flex items-center gap-2">
              <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="btn-ghost p-1.5 disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button>
              <span>עמוד {page} מתוך {pages}</span>
              <button disabled={page >= pages} onClick={() => setPage(page + 1)} className="btn-ghost p-1.5 disabled:opacity-30"><ChevronLeft className="w-4 h-4" /></button>
            </div>
          </div>
        )}
      </div>

      {modal === 'add' && <AddContactModal tags={allTags} onClose={() => setModal(null)} onSaved={() => { setModal(null); refresh(); }} />}
      {modal === 'import' && <ImportModal tags={allTags} onClose={() => setModal(null)} onDone={refresh} />}
      {openId && <ContactDrawer id={openId} tags={allTags} onClose={() => setOpenId(null)} onChanged={refresh} />}
    </div>
  );
}
