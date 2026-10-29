import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import {
  Plus, Settings2, Mail, Users2, MailOpen, MousePointerClick, Copy, Trash2, BarChart3, Pencil, Loader2, X,
  Sparkles, Newspaper, Megaphone, PenLine, FileText, Zap, BookUser, Activity,
} from 'lucide-react';
import api from '../../services/api';
import { Campaign, CAMPAIGN_STATUS, DomainStatus, MarketingSettings, pct } from './shared';
import SettingsModal, { DomainBanner } from './SettingsModal';

const STARTER_ICONS: Record<string, any> = { newsletter: Newspaper, announcement: Megaphone, personal: PenLine, blank: FileText };
const STARTER_TEXT: Record<string, string> = {
  newsletter: 'כותרת, פתיחה אישית, תמונה, כלי השבוע וטיפ',
  announcement: 'תמונה גדולה, כותרת חזקה וכפתור',
  personal: 'נראה כמו מכתב אישי, בלי עיצוב',
  blank: 'מתחילים מדף ריק',
};

function NewCampaignModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [creating, setCreating] = useState<string | null>(null);
  const { data } = useQuery<{ starters: { key: string; label: string }[]; saved: { id: string; name: string; updatedAt: string }[] }>({
    queryKey: ['marketing-templates'],
    queryFn: () => api.get('/marketing/templates').then((r) => r.data),
  });

  const create = async (body: Record<string, string>, key: string) => {
    setCreating(key);
    try {
      const { data: c } = await api.post('/marketing/campaigns', { name: name.trim() || undefined, ...body });
      qc.invalidateQueries({ queryKey: ['campaigns'] });
      navigate(`/marketing/campaigns/${c.id}/edit`);
    } catch {
      toast.error('יצירת הקמפיין נכשלה');
      setCreating(null);
    }
  };

  const removeTemplate = async (id: string) => {
    if (!confirm('למחוק את התבנית?')) return;
    await api.delete(`/marketing/templates/${id}`);
    qc.invalidateQueries({ queryKey: ['marketing-templates'] });
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col animate-fade-in">
        <div className="modal-header">
          <h2 className="font-semibold text-slate-900">קמפיין חדש</h2>
          <button onClick={onClose} className="btn-ghost p-1.5 rounded-lg"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-6 space-y-6 overflow-y-auto">
          <div>
            <label className="label">שם הקמפיין (רק אתם רואים אותו)</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={`ניוזלטר ${format(new Date(), 'd/M')}`} autoFocus />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-800 mb-3">בחרו נקודת התחלה</h3>
            <div className="grid sm:grid-cols-2 gap-3">
              {(data?.starters || []).map((s) => {
                const Icon = STARTER_ICONS[s.key] || FileText;
                return (
                  <button key={s.key} type="button" disabled={!!creating} onClick={() => create({ starter: s.key }, s.key)}
                    className="flex items-start gap-3 p-4 rounded-2xl border border-slate-200 text-right hover:border-primary-300 hover:shadow-md transition-all disabled:opacity-60">
                    <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center flex-shrink-0">
                      {creating === s.key ? <Loader2 className="w-5 h-5 animate-spin text-primary-600" /> : <Icon className="w-5 h-5 text-primary-600" />}
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900">{s.label}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{STARTER_TEXT[s.key]}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
          {!!data?.saved.length && (
            <div>
              <h3 className="text-sm font-semibold text-slate-800 mb-3">התבניות שלי</h3>
              <div className="grid sm:grid-cols-2 gap-3">
                {data.saved.map((t) => (
                  <div key={t.id} className="group flex items-center gap-3 p-4 rounded-2xl border border-slate-200 hover:border-primary-300 hover:shadow-md transition-all">
                    <button type="button" disabled={!!creating} onClick={() => create({ templateId: t.id }, t.id)} className="flex items-center gap-3 flex-1 text-right min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center flex-shrink-0">
                        {creating === t.id ? <Loader2 className="w-5 h-5 animate-spin text-amber-600" /> : <Sparkles className="w-5 h-5 text-amber-600" />}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 truncate">{t.name}</p>
                        <p className="text-xs text-slate-400">עודכנה {format(new Date(t.updatedAt), 'd/M/yyyy')}</p>
                      </div>
                    </button>
                    <button type="button" onClick={() => removeTemplate(t.id)} className="p-1.5 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100"><Trash2 className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CampaignsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [showNew, setShowNew] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const { data: campaigns = [], isLoading } = useQuery<Campaign[]>({
    queryKey: ['campaigns'],
    queryFn: () => api.get('/marketing/campaigns').then((r) => r.data),
    refetchInterval: (q) => ((q.state.data as Campaign[] | undefined)?.some((c) => c.status === 'SENDING') ? 10_000 : false),
  });
  const { data: welcome } = useQuery<Campaign>({
    queryKey: ['welcome'],
    queryFn: () => api.get('/marketing/welcome').then((r) => r.data),
  });
  const { data: mkt } = useQuery<{ settings: MarketingSettings; domain: DomainStatus }>({
    queryKey: ['marketing-settings'],
    queryFn: () => api.get('/marketing/settings').then((r) => r.data),
  });
  const { data: contactStats } = useQuery<{ subscribed: number; newThisMonth: number }>({
    queryKey: ['contact-stats'],
    queryFn: () => api.get('/marketing/contacts/stats').then((r) => r.data),
  });

  const sent = campaigns.filter((c) => c.status === 'SENT' || c.status === 'SENDING');
  const totals = sent.reduce((a, c) => ({ sent: a.sent + (c.stats?.sent || 0), opened: a.opened + (c.stats?.opened || 0), clicked: a.clicked + (c.stats?.clicked || 0) }), { sent: 0, opened: 0, clicked: 0 });

  const duplicate = async (c: Campaign) => {
    const { data } = await api.post('/marketing/campaigns', { duplicateOf: c.id });
    qc.invalidateQueries({ queryKey: ['campaigns'] });
    navigate(`/marketing/campaigns/${data.id}/edit`);
  };
  const remove = async (c: Campaign) => {
    if (!confirm(`למחוק את הקמפיין "${c.name}"?${c.status === 'SENT' ? ' גם הדוח שלו יימחק.' : ''}`)) return;
    try {
      await api.delete(`/marketing/campaigns/${c.id}`);
      qc.invalidateQueries({ queryKey: ['campaigns'] });
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'המחיקה נכשלה');
    }
  };

  const kpis = [
    { label: 'נרשמים פעילים', value: contactStats?.subscribed ?? '…', sub: contactStats ? `+${contactStats.newThisMonth} ב-30 הימים האחרונים` : '', icon: Users2, color: 'bg-primary-100 text-primary-600' },
    { label: 'מיילים שנשלחו', value: totals.sent, sub: `${sent.length} קמפיינים`, icon: Mail, color: 'bg-blue-100 text-blue-600' },
    { label: 'שיעור פתיחה ממוצע', value: `${pct(totals.opened, totals.sent)}%`, sub: 'מתוך מי שקיבל', icon: MailOpen, color: 'bg-emerald-100 text-emerald-600' },
    { label: 'שיעור הקלקה ממוצע', value: `${pct(totals.clicked, totals.sent)}%`, sub: 'לחצו על קישור', icon: MousePointerClick, color: 'bg-amber-100 text-amber-600' },
  ];

  return (
    <div className="space-y-6">
      <div className="page-header mb-0">
        <div>
          <h1 className="page-title">דיוור</h1>
          <p className="page-subtitle">עיצוב ושליחה של מיילים לנרשמים, עם מעקב פתיחות והקלקות</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/marketing/tracking" className="btn-secondary"><Activity className="w-4 h-4" /> מעקב</Link>
          <button onClick={() => setShowSettings(true)} className="btn-secondary"><Settings2 className="w-4 h-4" /> הגדרות דיוור</button>
          <button onClick={() => setShowNew(true)} className="btn-primary"><Plus className="w-4 h-4" /> קמפיין חדש</button>
        </div>
      </div>

      <DomainBanner domain={mkt?.domain} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k) => (
          <div key={k.label} className="stat-card">
            <div className={clsx('stat-icon', k.color)}><k.icon className="w-5 h-5" /></div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{k.value}</p>
              <p className="text-sm text-slate-600">{k.label}</p>
              <p className="text-xs text-slate-400">{k.sub}</p>
            </div>
          </div>
        ))}
      </div>

      {welcome && (
        <div className="card flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center flex-shrink-0">
            <Zap className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-slate-900">מייל ברוכים הבאים אוטומטי</h3>
              <span className={clsx('badge', CAMPAIGN_STATUS[welcome.status].cls)}>{CAMPAIGN_STATUS[welcome.status].label}</span>
            </div>
            <p className="text-sm text-slate-500">נשלח לבד לכל מי שנרשם בדף הנחיתה. בדף כתוב לנרשמים "המייל הראשון כבר בדרך אליך".</p>
            {!!welcome.stats?.sent && <p className="text-xs text-slate-400 mt-1">נשלח ל-{welcome.stats.sent} · נפתח {pct(welcome.stats.opened, welcome.stats.sent)}%</p>}
          </div>
          <div className="flex gap-2">
            {!!welcome.stats?.recipients && <Link to={`/marketing/campaigns/${welcome.id}/report`} className="btn-secondary text-sm"><BarChart3 className="w-4 h-4" /> דוח</Link>}
            <Link to={`/marketing/campaigns/${welcome.id}/edit`} className="btn-primary text-sm"><Pencil className="w-4 h-4" /> עריכה והפעלה</Link>
          </div>
        </div>
      )}

      <div className="card p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-semibold text-slate-900">קמפיינים</h3>
          <Link to="/marketing/contacts" className="text-sm text-primary-600 hover:underline flex items-center gap-1"><BookUser className="w-4 h-4" /> לאנשי הקשר</Link>
        </div>
        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
        ) : campaigns.length === 0 ? (
          <div className="text-center py-16 px-6">
            <Mail className="w-12 h-12 mx-auto text-slate-300 mb-3" />
            <p className="font-semibold text-slate-700">עדיין אין קמפיינים</p>
            <p className="text-sm text-slate-500 mt-1 mb-4">צרו את הניוזלטר הראשון מתבנית מוכנה, תוך כמה דקות.</p>
            <button onClick={() => setShowNew(true)} className="btn-primary"><Plus className="w-4 h-4" /> קמפיין ראשון</button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="table-header">קמפיין</th>
                  <th className="table-header">סטטוס</th>
                  <th className="table-header">נשלח ל</th>
                  <th className="table-header">פתיחות</th>
                  <th className="table-header">הקלקות</th>
                  <th className="table-header w-32" />
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => {
                  const st = c.stats!;
                  const editable = c.status === 'DRAFT' || c.status === 'SCHEDULED';
                  const date = c.sentAt || c.startedAt || c.scheduledAt || c.updatedAt;
                  return (
                    <tr key={c.id} className="table-row">
                      <td className="table-cell">
                        <Link to={editable ? `/marketing/campaigns/${c.id}/edit` : `/marketing/campaigns/${c.id}/report`} className="font-medium text-slate-900 hover:text-primary-600">{c.name}</Link>
                        <p className="text-xs text-slate-400 truncate max-w-xs">{c.subject || 'ללא נושא'} · {format(new Date(date), 'd/M/yyyy HH:mm')}</p>
                      </td>
                      <td className="table-cell">
                        <span className={clsx('badge', CAMPAIGN_STATUS[c.status].cls)}>{CAMPAIGN_STATUS[c.status].label}</span>
                        {c.status === 'SENDING' && st.pending > 0 && <p className="text-xs text-slate-400 mt-1">עוד {st.pending} בתור</p>}
                      </td>
                      <td className="table-cell">{st.sent || '—'}</td>
                      <td className="table-cell">{st.sent ? `${pct(st.opened, st.sent)}%` : '—'}</td>
                      <td className="table-cell">{st.sent ? `${pct(st.clicked, st.sent)}%` : '—'}</td>
                      <td className="table-cell">
                        <div className="flex items-center gap-1 justify-end">
                          {editable
                            ? <Link to={`/marketing/campaigns/${c.id}/edit`} className="p-1.5 text-slate-400 hover:text-primary-600" title="עריכה"><Pencil className="w-4 h-4" /></Link>
                            : <Link to={`/marketing/campaigns/${c.id}/report`} className="p-1.5 text-slate-400 hover:text-primary-600" title="דוח"><BarChart3 className="w-4 h-4" /></Link>}
                          <button onClick={() => duplicate(c)} className="p-1.5 text-slate-400 hover:text-primary-600" title="שכפול"><Copy className="w-4 h-4" /></button>
                          {c.status !== 'SENDING' && <button onClick={() => remove(c)} className="p-1.5 text-slate-400 hover:text-red-500" title="מחיקה"><Trash2 className="w-4 h-4" /></button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showNew && <NewCampaignModal onClose={() => setShowNew(false)} />}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}
