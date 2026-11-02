import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, CheckCircle2, ChevronLeft } from 'lucide-react';
import clsx from 'clsx';
import { useAlerts } from '../hooks/useAlerts';

const DOT = { critical: 'bg-red-500', warning: 'bg-amber-500', info: 'bg-slate-300' };

export default function AlertsBell() {
  const { data } = useAlerts();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const urgent = data?.urgent ?? 0;
  const alerts = data?.alerts ?? [];

  return (
    <div className="relative flex-shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={urgent ? `התראות, ${urgent} מחכות לטיפול` : 'התראות'}
        aria-expanded={open}
        className="relative p-2 rounded-xl text-slate-500 hover:bg-slate-100 transition-colors"
      >
        <Bell className="w-5 h-5" />
        {urgent > 0 && (
          <span className="absolute -top-0.5 -left-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[11px] font-bold leading-[18px] text-center">
            {urgent > 99 ? '99+' : urgent}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-x-2 top-16 md:absolute md:inset-x-auto md:top-full md:left-0 md:mt-2 md:w-96 bg-white rounded-2xl shadow-xl border border-slate-100 z-50 overflow-hidden animate-fade-in">
          <div className="px-4 py-3 border-b border-slate-100 font-semibold text-slate-900 text-sm">התראות</div>
          {alerts.length === 0 ? (
            <div className="text-center py-8 px-4">
              <CheckCircle2 className="w-9 h-9 text-emerald-500 mx-auto mb-2" />
              <p className="text-sm font-medium text-slate-700">הכל מטופל</p>
            </div>
          ) : (
            <div className="max-h-[60vh] overflow-y-auto divide-y divide-slate-50">
              {alerts.slice(0, 6).map((a) => (
                <button
                  key={a.key}
                  type="button"
                  onClick={() => { setOpen(false); navigate(a.href); }}
                  className="w-full flex items-start gap-2.5 px-4 py-2.5 hover:bg-slate-50 text-right transition-colors"
                >
                  <span className={clsx('w-2 h-2 rounded-full mt-1.5 flex-shrink-0', DOT[a.severity])} aria-hidden="true" />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium text-slate-800 truncate">{a.title}</span>
                    <span className="block text-xs text-slate-500 truncate">{a.detail}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
          <Link to="/alerts" onClick={() => setOpen(false)} className="flex items-center justify-center gap-1 px-4 py-3 border-t border-slate-100 text-sm font-medium text-primary-600 hover:bg-slate-50">
            {alerts.length > 6 ? `לכל ההתראות (${alerts.length})` : 'לדף ההתראות'}<ChevronLeft className="w-4 h-4" />
          </Link>
        </div>
      )}
    </div>
  );
}
