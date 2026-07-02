import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import api from '../services/api';

export default function Header() {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const { data } = useQuery({
    queryKey: ['search', query],
    queryFn: () => api.get(`/search?q=${encodeURIComponent(query)}`).then(r => r.data),
    enabled: query.length >= 2,
  });

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const hasResults = data && (data.clients?.length || data.tasks?.length || data.summaries?.length);

  return (
    <header className="h-16 bg-white border-b border-slate-100 flex items-center px-6 lg:px-8 gap-4 shadow-sm">
      <div className="flex-1 relative max-w-md" ref={ref}>
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
        <input
          className="w-full pr-9 pl-8 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm
                     focus:bg-white focus:border-primary-300 focus:ring-2 focus:ring-primary-100
                     transition-all duration-150 placeholder:text-slate-400"
          placeholder="חיפוש לקוח, משימה, סיכום..."
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => query.length >= 2 && setOpen(true)}
        />
        {query && (
          <button onClick={() => { setQuery(''); setOpen(false); }} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
            <X className="w-3.5 h-3.5" />
          </button>
        )}

        {open && hasResults && (
          <div className="absolute top-full mt-2 right-0 w-full bg-white rounded-2xl shadow-xl border border-slate-100 z-50 overflow-hidden animate-fade-in">
            {data.clients?.length > 0 && (
              <div>
                <p className="px-4 pt-3 pb-1 text-xs font-semibold text-slate-400 uppercase tracking-wider">לקוחות</p>
                {data.clients.map((c: any) => (
                  <button key={c.id} onClick={() => { navigate(`/clients/${c.id}`); setOpen(false); setQuery(''); }}
                    className="w-full text-right px-4 py-2.5 hover:bg-slate-50 transition-colors">
                    <p className="text-sm font-medium text-slate-800">{c.fullName}</p>
                    <p className="text-xs text-slate-500">{c.email}</p>
                  </button>
                ))}
              </div>
            )}
            {data.tasks?.length > 0 && (
              <div>
                <p className="px-4 pt-3 pb-1 text-xs font-semibold text-slate-400 uppercase tracking-wider">משימות</p>
                {data.tasks.map((t: any) => (
                  <button key={t.id} onClick={() => { navigate('/tasks'); setOpen(false); setQuery(''); }}
                    className="w-full text-right px-4 py-2.5 hover:bg-slate-50 transition-colors">
                    <p className="text-sm font-medium text-slate-800">{t.title}</p>
                    <p className="text-xs text-slate-500">{t.client?.fullName}</p>
                  </button>
                ))}
              </div>
            )}
            <div className="h-2" />
          </div>
        )}
      </div>
    </header>
  );
}
