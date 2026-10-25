import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { X, Monitor, Smartphone, Loader2 } from 'lucide-react';
import api from '../../../services/api';
import { Design } from '../shared';

interface Props {
  campaignId: string;
  design: Design;
  subject: string;
  preheader: string | null;
  markAsAd: boolean;
  onClose: () => void;
}

export default function PreviewModal({ campaignId, design, subject, preheader, markAsAd, onClose }: Props) {
  const [mode, setMode] = useState<'desktop' | 'mobile'>('desktop');
  const [data, setData] = useState<{ html: string; subject: string; fromName: string } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.post(`/marketing/campaigns/${campaignId}/preview`, { design, subject, preheader, markAsAd })
      .then((r) => setData(r.data))
      .catch(() => setError('לא הצלחנו לטעון תצוגה מקדימה'));
  }, [campaignId, design, subject, preheader, markAsAd]);

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col animate-fade-in overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
          <h2 className="font-semibold text-slate-900">תצוגה מקדימה</h2>
          <div className="flex items-center gap-2">
            <div className="flex bg-slate-100 rounded-xl p-1 gap-1">
              <button type="button" onClick={() => setMode('desktop')} className={clsx('px-3 py-1.5 rounded-lg text-sm flex items-center gap-1.5', mode === 'desktop' ? 'bg-white shadow-sm' : 'text-slate-500')}>
                <Monitor className="w-4 h-4" /> מחשב
              </button>
              <button type="button" onClick={() => setMode('mobile')} className={clsx('px-3 py-1.5 rounded-lg text-sm flex items-center gap-1.5', mode === 'mobile' ? 'bg-white shadow-sm' : 'text-slate-500')}>
                <Smartphone className="w-4 h-4" /> טלפון
              </button>
            </div>
            <button onClick={onClose} className="btn-ghost p-1.5 rounded-lg"><X className="w-4 h-4" /></button>
          </div>
        </div>
        <div className="flex-1 bg-slate-100 overflow-auto p-6 flex flex-col items-center">
          {error ? <p className="text-red-500 mt-10">{error}</p> : !data ? (
            <Loader2 className="w-6 h-6 animate-spin text-slate-400 mt-16" />
          ) : (
            <div className={clsx('bg-white shadow-xl overflow-hidden flex flex-col transition-all duration-300', mode === 'mobile' ? 'w-[390px] h-[760px] rounded-[2.5rem] border-[10px] border-slate-800' : 'w-full max-w-[760px] h-full rounded-xl border border-slate-200')}>
              <div className="px-4 py-3 border-b border-slate-100 text-right bg-white">
                <p className="text-sm font-bold text-slate-900">{data.fromName}</p>
                <p className="text-sm text-slate-800 truncate">{data.subject || '(ללא נושא)'}</p>
                {preheader && <p className="text-xs text-slate-400 truncate">{preheader}</p>}
              </div>
              <iframe title="תצוגה מקדימה" srcDoc={data.html} sandbox="allow-popups allow-popups-to-escape-sandbox" className="flex-1 w-full bg-white" />
            </div>
          )}
          <p className="text-xs text-slate-400 mt-3">כך המייל ייראה אצל הנמען. השם "{'{{שם}}'}" מוחלף בשם של כל נמען.</p>
        </div>
      </div>
    </div>
  );
}
