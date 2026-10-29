import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import {
  Eye, UserPlus, Send, MailOpen, FileDown, Loader2, Search, Upload, Copy, ExternalLink, AlertTriangle, ChevronLeft, FileText,
} from 'lucide-react';
import api from '../../services/api';
import { CONTACT_STATUS, ContactStatus, pct } from './shared';
import { ContactDrawer } from './Contacts';

interface Person {
  id: string; name: string | null; email: string; status: ContactStatus; source: string | null; createdAt: string;
  visits: number; lastVisit: string | null; emailsSent: number; emailsOpened: number; lastOpened: string | null; downloadedAt: string | null;
}
interface TrackingData {
  days: number;
  funnel: { visitors: number; visits: number; signups: number; guideSent: number; opened: number; downloaded: number };
  sources: { source: string; visitors: number; signups: number }[];
  recent: { id: string; at: string; page: string; source: string; contact: { id: string; name: string | null; email: string } | null }[];
  people: Person[];
  setup: { welcomeId: string; welcomeActive: boolean; guideUrl: string; guideName: string };
}

const PERIODS = [{ days: 7, label: '7 ימים' }, { days: 30, label: '30 יום' }, { days: 90, label: '90 יום' }, { days: 0, label: 'מההתחלה' }];
type Filter = 'all' | 'visited' | 'opened' | 'notOpened' | 'downloaded' | 'notDownloaded';
const when = (d: string | null, withYear = false) => (d ? format(new Date(d), withYear ? 'd/M/yyyy' : 'd/M HH:mm') : '—');

export default function TrackingPage() {
  const qc = useQueryClient();
  const [days, setDays] = useState(30);
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useQuery<TrackingData>({
    queryKey: ['marketing-tracking', days],
    queryFn: () => api.get('/marketing/tracking', { params: { days } }).then((r) => r.data),
    placeholderData: (prev) => prev,
    refetchInterval: 60_000,
  });
  const { data: contactStats } = useQuery<{ tags: { tag: string }[] }>({
    queryKey: ['contact-stats'],
    queryFn: () => api.get('/marketing/contacts/stats').then((r) => r.data),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ['marketing-tracking'] });

  const people = useMemo(() => {
    if (!data) return [];
    const term = q.trim().toLowerCase();
    return data.people.filter((p) => {
      if (term && !`${p.name || ''} ${p.email}`.toLowerCase().includes(term)) return false;
      switch (filter) {
        case 'visited': return p.visits > 0;
        case 'opened': return p.emailsOpened > 0;
        case 'notOpened': return p.emailsSent > 0 && p.emailsOpened === 0;
        case 'downloaded': return !!p.downloadedAt;
        case 'notDownloaded': return p.emailsSent > 0 && !p.downloadedAt;
        default: return true;
      }
    });
  }, [data, filter, q]);

  const uploadGuide = async (file: File) => {
    if (file.type !== 'application/pdf') return toast.error('אפשר להעלות רק קובץ PDF');
    const form = new FormData();
    form.append('file', file, file.name);
    setUploading(true);
    try {
      await api.post('/marketing/guide', form);
      toast.success('המדריך הועלה');
      refresh();
      qc.invalidateQueries({ queryKey: ['marketing-settings'] });
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'ההעלאה נכשלה');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };
  const copyGuideLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('הקישור הועתק');
    } catch {
      toast.error('לא הצלחתי להעתיק');
    }
  };

  if (isLoading || !data) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>;
  const { funnel, setup } = data;

  const steps = [
    { label: 'נכנסו לדף הנחיתה', value: funnel.visitors, sub: `${funnel.visits} כניסות בסך הכל`, icon: Eye, color: 'bg-blue-100 text-blue-600' },
    { label: 'נרשמו לקבלת המדריך', value: funnel.signups, sub: `${pct(funnel.signups, funnel.visitors)}% מהנכנסים`, icon: UserPlus, color: 'bg-sky-100 text-sky-600' },
    { label: 'קיבלו את המדריך במייל', value: funnel.guideSent, sub: setup.welcomeActive ? `${pct(funnel.guideSent, funnel.signups)}% מהנרשמים` : 'המייל האוטומטי כבוי', icon: Send, color: 'bg-indigo-100 text-indigo-600' },
    { label: 'פתחו את המייל', value: funnel.opened, sub: `${pct(funnel.opened, funnel.guideSent)}% ממי שקיבל`, icon: MailOpen, color: 'bg-emerald-100 text-emerald-600' },
    { label: 'הורידו את המדריך', value: funnel.downloaded, sub: `${pct(funnel.downloaded, funnel.guideSent)}% ממי שקיבל`, icon: FileDown, color: 'bg-primary-100 text-primary-700' },
  ];

  const filters: { key: Filter; label: string; count: number }[] = [
    { key: 'all', label: 'כולם', count: data.people.length },
    { key: 'visited', label: 'נכנסו לדף', count: data.people.filter((p) => p.visits > 0).length },
    { key: 'opened', label: 'פתחו מייל', count: data.people.filter((p) => p.emailsOpened > 0).length },
    { key: 'notOpened', label: 'לא פתחו', count: data.people.filter((p) => p.emailsSent > 0 && p.emailsOpened === 0).length },
    { key: 'downloaded', label: 'הורידו את המדריך', count: data.people.filter((p) => !!p.downloadedAt).length },
    { key: 'notDownloaded', label: 'לא הורידו', count: data.people.filter((p) => p.emailsSent > 0 && !p.downloadedAt).length },
  ];

  return (
    <div className="space-y-6">
      <div className="page-header mb-0 flex-col items-stretch gap-3 md:flex-row md:items-center">
        <div>
          <h1 className="page-title">מעקב</h1>
          <p className="page-subtitle">מי נכנס לדף הנחיתה, מי נרשם, מי פתח את המייל ומי הוריד את המדריך</p>
        </div>
        <div className="flex bg-slate-100 rounded-xl p-1 gap-1 self-start whitespace-nowrap">
          {PERIODS.map((p) => (
            <button key={p.days} onClick={() => setDays(p.days)}
              className={clsx('px-3 py-1.5 text-sm rounded-lg font-medium', days === p.days ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700')}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
        {steps.map((s, i) => (
          <div key={s.label} className="card py-4 relative">
            <div className={clsx('w-9 h-9 rounded-xl flex items-center justify-center mb-2', s.color)}><s.icon size={18} /></div>
            <p className="text-2xl font-bold text-slate-900">{s.value}</p>
            <p className="text-sm text-slate-600">{s.label}</p>
            <p className="text-xs text-slate-400">{s.sub}</p>
            {i < steps.length - 1 && <ChevronLeft className="hidden xl:block w-5 h-5 text-slate-300 absolute top-1/2 -translate-y-1/2" style={{ left: -18 }} />}
          </div>
        ))}
      </div>

      {!setup.welcomeActive && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold">המייל האוטומטי ששולח את המדריך עדיין כבוי</p>
            <p className="mt-0.5 text-amber-800">לכן מי שנרשם עוד לא מקבל מייל. כשהמדריך יהיה מוכן, מפעילים את המייל, ומכאן והלאה כל נרשם יקבל אותו מיד.</p>
          </div>
          <Link to={`/marketing/campaigns/${setup.welcomeId}/edit`} className="btn-secondary text-sm flex-shrink-0">למייל האוטומטי</Link>
        </div>
      )}

      <div className="card">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary-50 text-primary-700 flex items-center justify-center flex-shrink-0"><FileText className="w-5 h-5" /></div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-slate-900">קובץ המדריך</p>
            {setup.guideUrl ? (
              <p className="text-sm text-slate-500 truncate">{setup.guideName || 'המדריך'}. כל לחיצה עליו מתוך מייל נספרת כהורדה.</p>
            ) : (
              <p className="text-sm text-slate-500">עדיין לא הועלה. אחרי ההעלאה, הכפתור במייל יוביל אליו, ותראו כאן מי הוריד.</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {setup.guideUrl && (
              <>
                <a href={setup.guideUrl} target="_blank" rel="noreferrer" className="btn-ghost text-sm"><ExternalLink className="w-4 h-4" /> פתיחה</a>
                <button onClick={() => copyGuideLink(setup.guideUrl)} className="btn-ghost text-sm"><Copy className="w-4 h-4" /> העתקת הקישור</button>
              </>
            )}
            <button onClick={() => fileRef.current?.click()} disabled={uploading} className={setup.guideUrl ? 'btn-secondary text-sm' : 'btn-primary text-sm'}>
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} {setup.guideUrl ? 'החלפת הקובץ' : 'העלאת המדריך (PDF)'}
            </button>
            <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={(e) => e.target.files?.[0] && uploadGuide(e.target.files[0])} />
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="card p-0 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100"><h3 className="font-semibold text-slate-900">מאיפה הגיעו</h3></div>
          {data.sources.length === 0 ? <p className="text-center text-slate-400 py-10 text-sm">עדיין אין כניסות בתקופה הזו</p> : (
            <table className="w-full">
              <thead className="bg-slate-50"><tr><th className="table-header">מקור</th><th className="table-header w-28">נכנסו</th><th className="table-header w-28">נרשמו</th></tr></thead>
              <tbody>
                {data.sources.map((s) => (
                  <tr key={s.source} className="table-row">
                    <td className="table-cell text-sm font-medium text-slate-800">{s.source}</td>
                    <td className="table-cell text-sm">{s.visitors}</td>
                    <td className="table-cell text-sm">{s.signups}{s.visitors > 0 && <span className="text-xs text-slate-400"> ({pct(s.signups, s.visitors)}%)</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card p-0 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100"><h3 className="font-semibold text-slate-900">כניסות אחרונות לדף</h3></div>
          {data.recent.length === 0 ? <p className="text-center text-slate-400 py-10 text-sm">עדיין אין כניסות בתקופה הזו</p> : (
            <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
              {data.recent.map((v) => (
                <div key={v.id} className="px-6 py-2.5 flex items-center gap-3 text-sm">
                  <span className="text-slate-400 w-20 flex-shrink-0">{when(v.at)}</span>
                  {v.contact ? (
                    <button onClick={() => setOpenId(v.contact!.id)} className="font-medium text-primary-700 hover:underline truncate">{v.contact.name || v.contact.email}</button>
                  ) : <span className="text-slate-500 truncate">מבקר שלא נרשם</span>}
                  <span className="mr-auto px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs flex-shrink-0">{v.source}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex flex-col md:flex-row md:items-center gap-3 justify-between">
          <h3 className="font-semibold text-slate-900">מה כל אחד עשה</h3>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1">
              {filters.map((f) => (
                <button key={f.key} onClick={() => setFilter(f.key)}
                  className={clsx('px-3 py-1.5 rounded-full text-xs font-medium', filter === f.key ? 'bg-primary-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}>
                  {f.label} ({f.count})
                </button>
              ))}
            </div>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
              <input className="input py-1.5 pr-9 text-sm w-48" value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש" />
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="table-header">איש קשר</th>
                <th className="table-header">נכנס לדף</th>
                <th className="table-header">מיילים</th>
                <th className="table-header">פתח לאחרונה</th>
                <th className="table-header">הוריד את המדריך</th>
              </tr>
            </thead>
            <tbody>
              {people.slice(0, 500).map((p) => (
                <tr key={p.id} className="table-row cursor-pointer" onClick={() => setOpenId(p.id)}>
                  <td className="table-cell">
                    <p className="font-medium text-slate-800">{p.name || '—'}</p>
                    <p className="text-xs text-slate-400"><span dir="ltr">{p.email}</span> · נרשם {when(p.createdAt, true)}</p>
                    {p.status !== 'SUBSCRIBED' && <span className={clsx('badge mt-1', CONTACT_STATUS[p.status].cls)}>{CONTACT_STATUS[p.status].label}</span>}
                  </td>
                  <td className="table-cell text-sm">{p.visits ? <>{p.visits === 1 ? 'פעם אחת' : `${p.visits} פעמים`}<span className="block text-xs text-slate-400">אחרונה {when(p.lastVisit)}</span></> : <span className="text-slate-400">—</span>}</td>
                  <td className="table-cell text-sm">{p.emailsSent ? <>{p.emailsOpened} נפתחו<span className="block text-xs text-slate-400">מתוך {p.emailsSent} שנשלחו</span></> : <span className="text-slate-400">עוד לא נשלח</span>}</td>
                  <td className="table-cell text-sm">{p.lastOpened ? when(p.lastOpened) : <span className="text-slate-400">—</span>}</td>
                  <td className="table-cell text-sm">
                    {p.downloadedAt
                      ? <span className="inline-flex items-center gap-1 text-primary-700 font-medium"><FileDown className="w-4 h-4" /> {when(p.downloadedAt)}</span>
                      : <span className="text-slate-400">—</span>}
                  </td>
                </tr>
              ))}
              {people.length === 0 && <tr><td colSpan={5} className="text-center text-slate-400 py-10 text-sm">אין אנשי קשר להצגה</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-slate-400 leading-relaxed">
        מי שנכנס לדף ולא נרשם נספר, אבל אי אפשר לדעת מי הוא. אחרי שהוא נרשם, גם הכניסות הקודמות שלו מאותו מכשיר מצטרפות לכרטיס שלו. כניסה מקישור במייל מזוהה תמיד.
        פתיחות נמדדות לפי טעינת תמונה, ולכן הן הערכה. הורדות והקלקות מדויקות.
      </p>

      {openId && <ContactDrawer id={openId} tags={(contactStats?.tags || []).map((t) => t.tag)} onClose={() => setOpenId(null)} onChanged={refresh} />}
    </div>
  );
}
