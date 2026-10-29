import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { ArrowRight, Send, CheckCircle2, MailOpen, MousePointerClick, UserMinus, AlertTriangle, Clock, Loader2, Search, StopCircle, Copy, FileDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { Campaign, CampaignStats, CAMPAIGN_STATUS, pct } from './shared';

interface Recipient {
  id: string; status: string; email: string; name: string | null; contactId: string; contactStatus: string;
  sentAt: string | null; openedAt: string | null; clickedAt: string | null; downloadedAt: string | null; unsubscribedAt: string | null; opens: number; clicks: number; error: string | null;
}
interface ReportData {
  campaign: Campaign;
  stats: CampaignStats;
  links: { url: string; clicks: number; people: number }[];
  recipients: Recipient[];
  queue: { dailyLimit: number; sentLast24h: number; domainReady: boolean };
}

const SEND_STATUS: Record<string, { label: string; cls: string }> = {
  QUEUED: { label: 'בתור', cls: 'text-slate-500' },
  SENDING: { label: 'נשלח כעת', cls: 'text-amber-600' },
  SENT: { label: 'נשלח', cls: 'text-blue-600' },
  DELIVERED: { label: 'התקבל', cls: 'text-emerald-600' },
  BOUNCED: { label: 'כתובת שגויה', cls: 'text-red-500' },
  FAILED: { label: 'נכשל', cls: 'text-red-500' },
  SKIPPED: { label: 'לא נשלח', cls: 'text-slate-400' },
};

type Filter = 'all' | 'opened' | 'notOpened' | 'clicked' | 'downloaded' | 'unsubscribed' | 'failed';

export default function CampaignReport() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const { data, isLoading } = useQuery<ReportData>({
    queryKey: ['campaign-report', id],
    queryFn: () => api.get(`/marketing/campaigns/${id}/report`).then((r) => r.data),
    refetchInterval: (query) => {
      const d = query.state.data as ReportData | undefined;
      return d && (d.campaign.status === 'SENDING' || d.stats.pending > 0) ? 8000 : 60_000;
    },
  });

  const recipients = useMemo(() => {
    if (!data) return [];
    const term = q.trim().toLowerCase();
    return data.recipients.filter((r) => {
      if (term && !(`${r.name || ''} ${r.email}`.toLowerCase().includes(term))) return false;
      switch (filter) {
        case 'opened': return !!r.openedAt;
        case 'notOpened': return !r.openedAt && ['SENT', 'DELIVERED'].includes(r.status);
        case 'clicked': return !!r.clickedAt;
        case 'downloaded': return !!r.downloadedAt;
        case 'unsubscribed': return !!r.unsubscribedAt;
        case 'failed': return ['FAILED', 'BOUNCED'].includes(r.status);
        default: return true;
      }
    });
  }, [data, filter, q]);

  if (isLoading || !data) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>;
  const { campaign, stats } = data;
  const progress = pct(stats.sent + stats.failed, stats.recipients);
  const hasDownloads = stats.downloaded > 0;

  const stop = async () => {
    if (!confirm('לעצור את השליחה? מי שעוד לא קיבל, לא יקבל.')) return;
    await api.post(`/marketing/campaigns/${campaign.id}/cancel`);
    toast.success(campaign.status === 'SCHEDULED' ? 'התזמון בוטל והקמפיין חזר לטיוטה' : 'השליחה נעצרה');
    qc.invalidateQueries({ queryKey: ['campaign-report', id] });
    qc.invalidateQueries({ queryKey: ['campaigns'] });
    if (campaign.status === 'SCHEDULED') navigate(`/marketing/campaigns/${campaign.id}/edit`);
  };
  const duplicate = async () => {
    const { data: c } = await api.post('/marketing/campaigns', { duplicateOf: campaign.id });
    navigate(`/marketing/campaigns/${c.id}/edit`);
  };

  const kpis = [
    { label: 'נשלחו', value: stats.sent, sub: `מתוך ${stats.recipients}`, icon: Send, color: 'bg-blue-100 text-blue-600' },
    { label: 'התקבלו', value: stats.delivered, sub: `${pct(stats.delivered, stats.sent)}%`, icon: CheckCircle2, color: 'bg-sky-100 text-sky-600' },
    { label: 'פתחו', value: stats.opened, sub: `${pct(stats.opened, stats.sent)}%`, icon: MailOpen, color: 'bg-emerald-100 text-emerald-600' },
    { label: 'לחצו על קישור', value: stats.clicked, sub: `${pct(stats.clicked, stats.sent)}%`, icon: MousePointerClick, color: 'bg-amber-100 text-amber-600' },
    ...(hasDownloads ? [{ label: 'הורידו את המדריך', value: stats.downloaded, sub: `${pct(stats.downloaded, stats.sent)}%`, icon: FileDown, color: 'bg-primary-100 text-primary-700' }] : []),
    { label: 'הסירו את עצמם', value: stats.unsubscribed, sub: `${pct(stats.unsubscribed, stats.sent)}%`, icon: UserMinus, color: 'bg-slate-100 text-slate-500' },
    { label: 'נכשלו', value: stats.failed, sub: 'כתובת שגויה או שגיאה', icon: AlertTriangle, color: 'bg-red-100 text-red-500' },
  ];

  const filters: { key: Filter; label: string; count: number }[] = [
    { key: 'all', label: 'כולם', count: data.recipients.length },
    { key: 'opened', label: 'פתחו', count: stats.opened },
    { key: 'notOpened', label: 'לא פתחו', count: data.recipients.filter((r) => !r.openedAt && ['SENT', 'DELIVERED'].includes(r.status)).length },
    { key: 'clicked', label: 'לחצו', count: stats.clicked },
    ...(hasDownloads ? [{ key: 'downloaded' as Filter, label: 'הורידו את המדריך', count: stats.downloaded }] : []),
    { key: 'unsubscribed', label: 'הסירו', count: stats.unsubscribed },
    { key: 'failed', label: 'נכשלו', count: stats.failed },
  ];

  return (
    <div className="space-y-6">
      <Link to="/marketing/campaigns" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowRight className="w-4 h-4" /> לכל הקמפיינים</Link>
      <div className="page-header mb-0">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="page-title">{campaign.name}</h1>
            <span className={clsx('badge', CAMPAIGN_STATUS[campaign.status].cls)}>{CAMPAIGN_STATUS[campaign.status].label}</span>
          </div>
          <p className="page-subtitle">
            {campaign.subject}
            {campaign.sentAt && ` · נשלח ${format(new Date(campaign.sentAt), 'd/M/yyyy HH:mm')}`}
            {campaign.status === 'SCHEDULED' && campaign.scheduledAt && ` · מתוזמן ל-${format(new Date(campaign.scheduledAt), 'd/M/yyyy HH:mm')}`}
          </p>
        </div>
        <div className="flex gap-2">
          {campaign.kind === 'BROADCAST' && <button onClick={duplicate} className="btn-secondary"><Copy className="w-4 h-4" /> שכפול</button>}
          {(campaign.status === 'SENDING' || campaign.status === 'SCHEDULED') && (
            <button onClick={stop} className="btn-danger"><StopCircle className="w-4 h-4" /> {campaign.status === 'SCHEDULED' ? 'ביטול תזמון' : 'עצירת השליחה'}</button>
          )}
        </div>
      </div>

      {stats.pending > 0 && (
        <div className="card">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="flex items-center gap-2 text-slate-700"><Clock className="w-4 h-4 text-amber-500" /> {stats.pending} מיילים ממתינים לשליחה</span>
            <span className="font-medium">{progress}%</span>
          </div>
          <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-primary-500 rounded-full transition-all" style={{ width: `${progress}%` }} /></div>
          <p className="text-xs text-slate-400 mt-2">
            {!data.queue.domainReady
              ? 'השליחה תתחיל ברגע שדומיין השליחה יחובר.'
              : data.queue.sentLast24h >= data.queue.dailyLimit
                ? `הגעתם למגבלה היומית (${data.queue.dailyLimit} מיילים ביממה). ההמשך יישלח אוטומטית.`
                : 'המיילים יוצאים בקצב של כמה בשנייה. הדף מתעדכן לבד.'}
          </p>
        </div>
      )}

      <div className={clsx('grid grid-cols-2 md:grid-cols-3 gap-4', hasDownloads ? 'xl:grid-cols-7' : 'xl:grid-cols-6')}>
        {kpis.map((k) => (
          <div key={k.label} className="card py-4">
            <div className={clsx('w-9 h-9 rounded-xl flex items-center justify-center mb-2', k.color)}><k.icon className="w-4.5 h-4.5" size={18} /></div>
            <p className="text-2xl font-bold text-slate-900">{k.value}</p>
            <p className="text-sm text-slate-600">{k.label}</p>
            <p className="text-xs text-slate-400">{k.sub}</p>
          </div>
        ))}
      </div>

      {data.links.length > 0 && (
        <div className="card p-0 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100"><h3 className="font-semibold text-slate-900">על מה לחצו</h3></div>
          <table className="w-full">
            <thead className="bg-slate-50"><tr><th className="table-header">קישור</th><th className="table-header w-28">הקלקות</th><th className="table-header w-28">אנשים</th></tr></thead>
            <tbody>
              {data.links.map((l) => (
                <tr key={l.url} className="table-row">
                  <td className="table-cell"><a href={l.url} target="_blank" rel="noreferrer" dir="ltr" className="text-primary-600 hover:underline break-all text-sm">{l.url}</a></td>
                  <td className="table-cell font-semibold">{l.clicks}</td>
                  <td className="table-cell">{l.people}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex flex-col md:flex-row md:items-center gap-3 justify-between">
          <h3 className="font-semibold text-slate-900">נמענים</h3>
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
                <th className="table-header">נמען</th><th className="table-header">סטטוס</th><th className="table-header">נפתח</th><th className="table-header">לחץ</th>
                {hasDownloads && <th className="table-header">הוריד את המדריך</th>}
              </tr>
            </thead>
            <tbody>
              {recipients.slice(0, 500).map((r) => (
                <tr key={r.id} className="table-row">
                  <td className="table-cell">
                    <p className="font-medium text-slate-800">{r.name || '—'}</p>
                    <p className="text-xs text-slate-400" dir="ltr">{r.email}</p>
                  </td>
                  <td className="table-cell text-sm">
                    <span className={SEND_STATUS[r.status]?.cls}>{SEND_STATUS[r.status]?.label || r.status}</span>
                    {r.unsubscribedAt && <span className="block text-xs text-slate-400">הסיר/ה את עצמו</span>}
                    {r.error && <span className="block text-xs text-red-400 max-w-xs truncate" title={r.error}>{r.error}</span>}
                  </td>
                  <td className="table-cell text-sm">{r.openedAt ? <>{format(new Date(r.openedAt), 'd/M HH:mm')}{r.opens > 1 && <span className="text-xs text-slate-400"> ({r.opens} פעמים)</span>}</> : '—'}</td>
                  <td className="table-cell text-sm">{r.clickedAt ? <>{format(new Date(r.clickedAt), 'd/M HH:mm')}{r.clicks > 1 && <span className="text-xs text-slate-400"> ({r.clicks})</span>}</> : '—'}</td>
                  {hasDownloads && <td className="table-cell text-sm">{r.downloadedAt ? format(new Date(r.downloadedAt), 'd/M HH:mm') : '—'}</td>}
                </tr>
              ))}
              {recipients.length === 0 && <tr><td colSpan={hasDownloads ? 5 : 4} className="text-center text-slate-400 py-10 text-sm">אין נמענים להצגה</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-xs text-slate-400">פתיחות נמדדות לפי טעינת תמונה. אפליקציות כמו Apple Mail פותחות מיילים אוטומטית, ולכן שיעור הפתיחה הוא הערכה. הקלקות מדויקות.</p>
    </div>
  );
}
