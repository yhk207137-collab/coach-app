import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { X, Loader2, ImagePlus, CheckCircle2, AlertTriangle, Globe } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import { DomainStatus, MarketingSettings } from './shared';
import MediaPicker from './MediaPicker';

export function DomainBanner({ domain, compact }: { domain?: DomainStatus; compact?: boolean }) {
  if (!domain || domain.ready) return null;
  const text = domain.reason === 'not-verified'
    ? `הדומיין ${domain.domain} נוסף אבל עוד לא אומת. בדרך כלל זה לוקח עד שעה אחרי הוספת הרשומות.`
    : domain.reason === 'not-added'
      ? `הכתובת ${domain.from} מוגדרת, אבל הדומיין שלה לא נוסף אצל ספק המיילים.`
      : 'כדי לשלוח לנרשמים צריך לחבר דומיין משלך (למשל levi.co.il). עד אז אפשר לעצב קמפיינים ולשלוח מיילי בדיקה לעצמך.';
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <Globe className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
      <div>
        <p className="font-semibold">דומיין שליחה עדיין לא מחובר</p>
        {!compact && <p className="mt-0.5 text-amber-800">{text}</p>}
      </div>
    </div>
  );
}

export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { data } = useQuery<{ settings: MarketingSettings; domain: DomainStatus; quota: { dailyLimit: number; sentLast24h: number } }>({
    queryKey: ['marketing-settings'],
    queryFn: () => api.get('/marketing/settings').then((r) => r.data),
  });
  const [form, setForm] = useState<MarketingSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [picking, setPicking] = useState(false);

  useEffect(() => { if (data && !form) setForm(data.settings); }, [data, form]);
  const set = (k: keyof MarketingSettings, v: string) => setForm((f) => (f ? { ...f, [k]: v } : f));

  const save = async () => {
    if (!form) return;
    setSaving(true);
    try {
      await api.put('/marketing/settings', form);
      await qc.invalidateQueries({ queryKey: ['marketing-settings'] });
      toast.success('הגדרות הדיוור נשמרו');
      onClose();
    } catch {
      toast.error('השמירה נכשלה');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col animate-fade-in">
        <div className="modal-header">
          <h2 className="font-semibold text-slate-900">הגדרות דיוור</h2>
          <button onClick={onClose} className="btn-ghost p-1.5 rounded-lg"><X className="w-4 h-4" /></button>
        </div>
        {!form || !data ? (
          <div className="p-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
        ) : (
          <div className="p-6 space-y-6 overflow-y-auto">
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-800">כתובת השליחה</h3>
              {data.domain.ready ? (
                <div className="flex items-center gap-2 rounded-xl bg-emerald-50 text-emerald-700 p-3 text-sm">
                  <CheckCircle2 className="w-4 h-4" /> המיילים נשלחים מהכתובת <strong dir="ltr">{data.domain.from}</strong>
                </div>
              ) : <DomainBanner domain={data.domain} />}
              <p className="text-xs text-slate-500 flex items-center gap-1">
                {data.quota.sentLast24h >= data.quota.dailyLimit && <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />}
                נשלחו {data.quota.sentLast24h} מתוך {data.quota.dailyLimit} מיילים ב-24 השעות האחרונות (מגבלת התוכנית החינמית)
              </p>
            </section>

            <section className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="label">שם השולח</label>
                <input className="input" value={form.senderName} onChange={(e) => set('senderName', e.target.value)} placeholder="יהושע כהן" />
                <p className="text-xs text-slate-400 mt-1">השם שמופיע בתיבת הדואר של הנמען</p>
              </div>
              <div>
                <label className="label">כתובת לתשובות</label>
                <input className="input" dir="ltr" value={form.replyTo} onChange={(e) => set('replyTo', e.target.value)} placeholder="you@gmail.com" />
                <p className="text-xs text-slate-400 mt-1">כשנמען לוחץ "השב", התשובה מגיעה לכאן</p>
              </div>
            </section>

            <section className="space-y-4">
              <h3 className="text-sm font-semibold text-slate-800">תחתית המייל (מתווספת לכל מייל, כפי שהחוק מחייב)</h3>
              <div>
                <label className="label">שם העסק</label>
                <input className="input" value={form.businessName} onChange={(e) => set('businessName', e.target.value)} />
              </div>
              <div>
                <label className="label">פרטי קשר / כתובת</label>
                <input className="input" value={form.details} onChange={(e) => set('details', e.target.value)} placeholder="טלפון, כתובת או אתר" />
              </div>
              <div>
                <label className="label">למה הנמען מקבל את המייל</label>
                <input className="input" value={form.reason} onChange={(e) => set('reason', e.target.value)} />
              </div>
            </section>

            <section className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="label">לוגו לקמפיינים חדשים</label>
                <div className="flex items-center gap-3">
                  {form.logoUrl ? <img src={form.logoUrl} alt="" className="h-14 max-w-[140px] object-contain rounded-lg border border-slate-200 bg-slate-50 p-1" /> : null}
                  <button type="button" onClick={() => setPicking(true)} className="btn-secondary text-sm"><ImagePlus className="w-4 h-4" /> {form.logoUrl ? 'החלפה' : 'בחירת לוגו'}</button>
                  {form.logoUrl && <button type="button" onClick={() => set('logoUrl', '')} className="text-xs text-red-500">הסרה</button>}
                </div>
              </div>
              <div>
                <label className="label">צבע מותג לקמפיינים חדשים</label>
                <div className="flex items-center gap-2">
                  <input type="color" value={form.brand} onChange={(e) => set('brand', e.target.value)} className="w-12 h-10 rounded-lg border border-slate-200 cursor-pointer" />
                  <span className="text-sm text-slate-500" dir="ltr">{form.brand}</span>
                </div>
              </div>
            </section>
          </div>
        )}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100">
          <button onClick={onClose} className="btn-secondary">ביטול</button>
          <button onClick={save} disabled={saving || !form} className="btn-primary">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'שמירה'}</button>
        </div>
      </div>
      {picking && <MediaPicker onClose={() => setPicking(false)} onSelect={(m) => set('logoUrl', m.url)} />}
    </div>
  );
}
