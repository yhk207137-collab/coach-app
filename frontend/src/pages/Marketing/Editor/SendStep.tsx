import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { CheckCircle2, AlertTriangle, Send, Loader2, UserPlus, Users2, Tag, CalendarClock, Rocket, Info, X } from 'lucide-react';
import api from '../../../services/api';
import { useAuthStore } from '../../../store/auth';
import { Campaign, DomainStatus, MarketingSettings } from '../shared';

export interface SendMeta {
  name: string;
  subject: string;
  preheader: string | null;
  fromName: string | null;
  markAsAd: boolean;
  audienceTags: string[];
}

interface Props {
  campaign: Campaign;
  meta: SendMeta;
  onMeta: (patch: Partial<SendMeta>) => void;
  flush: () => Promise<void>;
  settings?: MarketingSettings;
  domain?: DomainStatus;
  missingLinks: number;
  emptyImages: number;
}

export default function SendStep({ campaign, meta, onMeta, flush, settings, domain, missingLinks, emptyImages }: Props) {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const isWelcome = campaign.kind === 'WELCOME';
  const [testEmails, setTestEmails] = useState(user?.email || '');
  const [testing, setTesting] = useState(false);
  const [mode, setMode] = useState<'now' | 'later'>('now');
  const [when, setWhen] = useState('');
  const [audienceMode, setAudienceMode] = useState<'all' | 'tags'>(meta.audienceTags.length ? 'tags' : 'all');
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);

  const { data: stats } = useQuery<{ subscribed: number; tags: { tag: string; count: number }[] }>({
    queryKey: ['contact-stats'],
    queryFn: () => api.get('/marketing/contacts/stats').then((r) => r.data),
  });
  const tagsKey = audienceMode === 'tags' ? meta.audienceTags.join(',') : '';
  const { data: audience } = useQuery<{ count: number }>({
    queryKey: ['audience', campaign.id, tagsKey],
    queryFn: () => api.get(`/marketing/campaigns/${campaign.id}/audience`, { params: { tags: tagsKey } }).then((r) => r.data),
    enabled: !isWelcome,
  });

  useEffect(() => {
    if (audienceMode === 'all' && meta.audienceTags.length) onMeta({ audienceTags: [] });
  }, [audienceMode]);

  const toggleTag = (tag: string) =>
    onMeta({ audienceTags: meta.audienceTags.includes(tag) ? meta.audienceTags.filter((t) => t !== tag) : [...meta.audienceTags, tag] });

  const sendTest = async () => {
    setTesting(true);
    try {
      await flush();
      const { data } = await api.post(`/marketing/campaigns/${campaign.id}/test`, { emails: testEmails.split(/[,\s]+/).filter(Boolean) });
      const ok = data.results.filter((r: any) => r.ok);
      const bad = data.results.filter((r: any) => !r.ok);
      if (ok.length) toast.success(`מייל בדיקה נשלח אל ${ok.map((r: any) => r.email).join(', ')}`);
      bad.forEach((r: any) => toast.error(`${r.email}: ${r.error}`, { duration: 6000 }));
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'שליחת הבדיקה נכשלה');
    } finally {
      setTesting(false);
    }
  };

  const subjectLen = meta.subject.length + (meta.markAsAd ? 8 : 0);
  const checks = [
    { ok: !!meta.subject.trim(), label: meta.subject.trim() ? 'יש נושא למייל' : 'חסר נושא למייל' },
    { ok: missingLinks === 0, label: missingLinks ? `${missingLinks} כפתורים בלי קישור` : 'לכל הכפתורים יש קישור' },
    { ok: emptyImages === 0, label: emptyImages ? `${emptyImages} תמונות שלא נבחרו (לא יוצגו)` : 'כל התמונות נבחרו', soft: true },
    ...(isWelcome ? [] : [{ ok: (audience?.count ?? 0) > 0, label: `${audience?.count ?? 0} נמענים רשומים בקהל שנבחר` }]),
    { ok: !!domain?.ready, label: domain?.ready ? `נשלח מהכתובת ${domain.from}` : 'דומיין שליחה עדיין לא מחובר' },
  ];
  const blocking = checks.filter((c) => !c.ok && !(c as any).soft);

  const doSend = async () => {
    setSending(true);
    try {
      await flush();
      const scheduledAt = mode === 'later' && when ? new Date(when).toISOString() : undefined;
      const { data } = await api.post(`/marketing/campaigns/${campaign.id}/send`, { scheduledAt });
      toast.success(scheduledAt ? `הקמפיין תוזמן ל-${data.count} נמענים` : `השליחה ל-${data.count} נמענים התחילה`);
      navigate(`/marketing/campaigns/${campaign.id}/report`);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'השליחה נכשלה');
    } finally {
      setSending(false);
      setConfirming(false);
    }
  };

  const toggleWelcome = async (active: boolean) => {
    try {
      await flush();
      await api.post('/marketing/welcome/status', { active });
      toast.success(active ? 'מייל הברוכים הבאים הופעל' : 'מייל הברוכים הבאים כובה');
      navigate('/marketing/campaigns');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'שגיאה');
    }
  };

  const insertName = () => onMeta({ subject: `{{שם}}, ${meta.subject}`.trim() });

  return (
    <div className="max-w-5xl mx-auto p-6 grid lg:grid-cols-[1fr_340px] gap-6">
      <div className="space-y-5">
        <div className="card space-y-4">
          <h3 className="font-semibold text-slate-900">נושא ושולח</h3>
          <div>
            <div className="flex items-center justify-between">
              <label className="label">נושא המייל</label>
              <button type="button" onClick={insertName} className="text-xs text-primary-600 hover:underline flex items-center gap-1 mb-1.5"><UserPlus className="w-3.5 h-3.5" /> הוספת שם הנמען</button>
            </div>
            <input className="input" value={meta.subject} onChange={(e) => onMeta({ subject: e.target.value })} placeholder="למשל: 3 דרכים להגדיל תרומות עוד החודש" maxLength={200} />
            <p className={clsx('text-xs mt-1', subjectLen > 60 ? 'text-amber-600' : 'text-slate-400')}>
              {subjectLen} תווים{subjectLen > 60 ? ' · נושא ארוך עלול להיחתך בטלפון' : ''}
            </p>
          </div>
          <div>
            <label className="label">טקסט מקדים (לא חובה)</label>
            <input className="input" value={meta.preheader || ''} onChange={(e) => onMeta({ preheader: e.target.value })} placeholder="השורה שמופיעה ליד הנושא בתיבת הדואר" maxLength={200} />
          </div>
          <div>
            <label className="label">שם השולח</label>
            <input className="input" value={meta.fromName || ''} onChange={(e) => onMeta({ fromName: e.target.value })} placeholder={settings?.senderName || ''} maxLength={60} />
          </div>
          <label className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 cursor-pointer">
            <input type="checkbox" checked={meta.markAsAd} onChange={(e) => onMeta({ markAsAd: e.target.checked })} className="mt-1 accent-primary-600" />
            <span className="text-sm text-slate-700">
              <strong>להוסיף "פרסומת:" בתחילת הנושא</strong>
              <span className="block text-xs text-slate-500 mt-0.5">החוק בישראל מחייב את זה כשהמייל מקדם שירות, מוצר, אירוע או גיוס. בניוזלטר תוכן בלבד אפשר לכבות.</span>
            </span>
          </label>
        </div>

        {!isWelcome && (
          <div className="card space-y-4">
            <h3 className="font-semibold text-slate-900">למי לשלוח</h3>
            <div className="grid sm:grid-cols-2 gap-3">
              <button type="button" onClick={() => setAudienceMode('all')}
                className={clsx('p-4 rounded-xl border-2 text-right transition-colors', audienceMode === 'all' ? 'border-primary-500 bg-primary-50' : 'border-slate-200 hover:border-slate-300')}>
                <Users2 className="w-5 h-5 text-primary-600 mb-2" />
                <p className="font-medium text-slate-900">כל הרשומים</p>
                <p className="text-xs text-slate-500">{stats?.subscribed ?? '…'} אנשי קשר</p>
              </button>
              <button type="button" onClick={() => setAudienceMode('tags')}
                className={clsx('p-4 rounded-xl border-2 text-right transition-colors', audienceMode === 'tags' ? 'border-primary-500 bg-primary-50' : 'border-slate-200 hover:border-slate-300')}>
                <Tag className="w-5 h-5 text-primary-600 mb-2" />
                <p className="font-medium text-slate-900">לפי תגיות</p>
                <p className="text-xs text-slate-500">רק מי שיש לו אחת מהתגיות</p>
              </button>
            </div>
            {audienceMode === 'tags' && (
              <div className="flex flex-wrap gap-2">
                {(stats?.tags || []).length === 0 && <p className="text-sm text-slate-400">עדיין אין תגיות. מוסיפים תגיות בעמוד אנשי הקשר.</p>}
                {(stats?.tags || []).map(({ tag, count }) => (
                  <button key={tag} type="button" onClick={() => toggleTag(tag)}
                    className={clsx('px-3 py-1.5 rounded-full text-sm border transition-colors', meta.audienceTags.includes(tag) ? 'bg-primary-600 border-primary-600 text-white' : 'border-slate-200 text-slate-600 hover:border-primary-300')}>
                    {tag} <span className="opacity-70">({count})</span>
                  </button>
                ))}
              </div>
            )}
            <p className="text-sm text-slate-600">המייל יישלח ל-<strong>{audience?.count ?? '…'}</strong> נמענים. מי שהסיר את עצמו לא יקבל אותו.</p>
          </div>
        )}

        <div className="card space-y-3">
          <h3 className="font-semibold text-slate-900">שליחת בדיקה</h3>
          <p className="text-sm text-slate-500">שלחו את המייל לעצמכם כדי לראות אותו בתיבת הדואר האמיתית לפני השליחה.</p>
          <div className="flex gap-2">
            <input className="input" dir="ltr" value={testEmails} onChange={(e) => setTestEmails(e.target.value)} placeholder="you@example.com" />
            <button type="button" onClick={sendTest} disabled={testing} className="btn-secondary whitespace-nowrap">
              {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Send className="w-4 h-4" /> שליחת בדיקה</>}
            </button>
          </div>
        </div>

        {!isWelcome && (
          <div className="card space-y-3">
            <h3 className="font-semibold text-slate-900">מתי לשלוח</h3>
            <div className="flex gap-3">
              <label className="flex items-center gap-2 text-sm"><input type="radio" checked={mode === 'now'} onChange={() => setMode('now')} className="accent-primary-600" /> עכשיו</label>
              <label className="flex items-center gap-2 text-sm"><input type="radio" checked={mode === 'later'} onChange={() => setMode('later')} className="accent-primary-600" /> בתזמון</label>
            </div>
            {mode === 'later' && (
              <input type="datetime-local" className="input max-w-xs" value={when} onChange={(e) => setWhen(e.target.value)} min={new Date(Date.now() + 5 * 60_000).toISOString().slice(0, 16)} />
            )}
          </div>
        )}
      </div>

      <div className="space-y-5">
        <div className="card">
          <p className="text-xs text-slate-400 mb-2">כך זה ייראה בתיבת הדואר</p>
          <div className="rounded-xl border border-slate-200 p-3 bg-slate-50">
            <p className="text-sm font-bold text-slate-900 truncate">{meta.fromName || settings?.senderName}</p>
            <p className="text-sm text-slate-800 truncate">{meta.markAsAd ? 'פרסומת: ' : ''}{meta.subject.replace(/\{\{\s*שם\s*\}\}/g, (user?.name || '').split(' ')[0]) || 'נושא המייל'}</p>
            <p className="text-xs text-slate-400 truncate">{meta.preheader || 'טקסט מקדים…'}</p>
          </div>
        </div>

        <div className="card space-y-2.5">
          <h3 className="font-semibold text-slate-900 mb-1">בדיקה לפני שליחה</h3>
          {checks.map((c) => (
            <div key={c.label} className="flex items-start gap-2 text-sm">
              {c.ok ? <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" /> : <AlertTriangle className={clsx('w-4 h-4 mt-0.5 flex-shrink-0', (c as any).soft ? 'text-amber-500' : 'text-red-500')} />}
              <span className={c.ok ? 'text-slate-600' : 'text-slate-800'}>{c.label}</span>
            </div>
          ))}
          {!domain?.ready && (
            <div className="flex gap-2 text-xs text-slate-500 bg-amber-50 rounded-xl p-3 mt-2">
              <Info className="w-4 h-4 text-amber-500 flex-shrink-0" />
              <span>בלי דומיין משלך ספק המיילים מאפשר לשלוח רק אליך. אחרי שנחבר דומיין, הכפתור יופעל. בינתיים אפשר לעצב ולשלוח בדיקות.</span>
            </div>
          )}
        </div>

        {isWelcome ? (
          <div className="card space-y-3">
            <p className="text-sm text-slate-600">
              המייל נשלח אוטומטית לכל מי שנרשם בדף הנחיתה.
              מצב נוכחי: <strong>{campaign.status === 'ACTIVE' ? 'פעיל' : 'כבוי'}</strong>
            </p>
            {campaign.status === 'ACTIVE' ? (
              <button type="button" onClick={() => toggleWelcome(false)} className="btn-secondary w-full justify-center">כיבוי המייל האוטומטי</button>
            ) : (
              <button type="button" onClick={() => toggleWelcome(true)} disabled={!meta.subject.trim()} className="btn-primary w-full justify-center py-3">
                <Rocket className="w-4 h-4" /> הפעלת המייל האוטומטי
              </button>
            )}
            {!domain?.ready && campaign.status !== 'ACTIVE' && <p className="text-xs text-slate-400">אפשר להפעיל כבר עכשיו. המיילים יתחילו לצאת ברגע שהדומיין יחובר.</p>}
          </div>
        ) : (
          <button type="button" disabled={blocking.length > 0 || (mode === 'later' && !when)} onClick={() => setConfirming(true)}
            className="btn-primary w-full justify-center py-3.5 text-base disabled:opacity-50 disabled:cursor-not-allowed">
            {mode === 'later' ? <><CalendarClock className="w-5 h-5" /> תזמון השליחה</> : <><Send className="w-5 h-5" /> שליחה ל-{audience?.count ?? 0} נמענים</>}
          </button>
        )}
      </div>

      {confirming && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setConfirming(false)}>
          <div className="modal-content max-w-md">
            <div className="modal-header">
              <h2 className="modal-title">{mode === 'later' ? 'לתזמן את השליחה?' : 'לשלוח עכשיו?'}</h2>
              <button onClick={() => setConfirming(false)} className="modal-close"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-slate-600">
              המייל <strong>"{meta.subject}"</strong> יישלח ל-<strong>{audience?.count}</strong> נמענים
              {mode === 'later' && when ? ` ב-${new Date(when).toLocaleString('he-IL')}` : ''}.
              אחרי השליחה אי אפשר לבטל.
            </p>
            {(audience?.count ?? 0) > 90 && (
              <p className="text-xs text-amber-700 bg-amber-50 rounded-xl p-3 mt-3">בתוכנית החינמית יוצאים עד 90 מיילים ביום. השאר יישלחו אוטומטית למחרת.</p>
            )}
            <div className="modal-footer">
              <button onClick={() => setConfirming(false)} className="btn-secondary">ביטול</button>
              <button onClick={doSend} disabled={sending} className="btn-primary">
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'כן, לשלוח'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
