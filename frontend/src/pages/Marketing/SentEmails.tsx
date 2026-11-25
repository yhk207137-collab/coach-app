import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import clsx from 'clsx';
import { Search, Loader2, X, AlertTriangle, MailCheck } from 'lucide-react';
import api from '../../services/api';

// "מיילים שנשלחו": what the system sent (login codes excepted), one row per content, to read exactly what went out.
interface Row { id: string; subject: string; kind: string; sent: number; people: number; failed: number; first: string; last: string }
interface ListData { rows: Row[]; total: number; pageSize: number; kinds: { kind: string; count: number }[] }
interface Full { id: string; to: string; subject: string; kind: string; ok: boolean; error: string | null; createdAt: string; html: string }

const when = (d: string) => format(new Date(d), 'dd/MM/yy HH:mm');

const sentTo = (r: Row) => (r.people === 1 ? 'נשלח לאדם אחד' : `נשלח ל-${r.people} אנשים`);
const span = (r: Row) => {
  const a = format(new Date(r.first), 'dd/MM/yy'); const b = format(new Date(r.last), 'dd/MM/yy');
  return a === b ? when(r.last) : `${a} עד ${b}`;
};

function Reader({ id, row, onClose }: { id: string; row: Row; onClose: () => void }) {
  const { data, isLoading } = useQuery<Full>({ queryKey: ['sent-email', id], queryFn: () => api.get(`/sent-emails/${id}`).then((r) => r.data) });
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-stretch md:items-center justify-center md:p-6" onClick={onClose}>
      <div data-sent-reader className="bg-white w-full md:max-w-3xl md:rounded-2xl shadow-xl flex flex-col max-h-full" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3 p-4 border-b">
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-slate-900 break-words">{data?.subject || '...'}</p>
            <p className="text-xs text-slate-500 mt-1">{row.kind} · {sentTo(row)} · {span(row)}</p>
            {row.failed > 0 && <p className="text-xs text-red-600 mt-1">{row.failed} לא נשלחו</p>}
          </div>
          <button className="p-1.5 rounded-lg hover:bg-slate-100" onClick={onClose} aria-label="סגירה"><X className="w-5 h-5" /></button>
        </div>
        {isLoading || !data ? (
          <div className="p-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
        ) : (
          // The email as it was sent, isolated from the app (no scripts).
          <iframe title="תוכן המייל" sandbox="allow-popups allow-popups-to-escape-sandbox" srcDoc={`<base target="_blank">${data.html}`} className="w-full flex-1 min-h-[70vh] md:rounded-b-2xl" />
        )}
      </div>
    </div>
  );
}

export default function SentEmailsPage() {
  const [kind, setKind] = useState('');
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<Row | null>(null);
  useEffect(() => { const t = setTimeout(() => { setSearch(q); setPage(0); }, 350); return () => clearTimeout(t); }, [q]);

  const { data, isLoading } = useQuery<ListData>({
    queryKey: ['sent-emails', kind, search, page],
    queryFn: () => api.get('/sent-emails', { params: { kind: kind || undefined, q: search || undefined, page } }).then((r) => r.data),
    placeholderData: (prev) => prev,
  });
  const all = data?.kinds.reduce((n, k) => n + k.count, 0) || 0;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="space-y-5">
      <div className="page-header mb-0">
        <div>
          <h1 className="page-title flex items-center gap-2"><MailCheck className="w-6 h-6 text-primary-600" />מיילים שנשלחו</h1>
          <p className="page-subtitle">כל תוכן שנשלח מופיע פעם אחת, עם מספר האנשים שקיבלו אותו. לוחצים על שורה כדי לקרוא.</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button className={clsx('text-sm px-3 py-1.5 rounded-lg', !kind ? 'btn-primary' : 'btn-secondary')} onClick={() => { setKind(''); setPage(0); }}>הכול ({all})</button>
        {data?.kinds.map((k) => (
          <button key={k.kind} className={clsx('text-sm px-3 py-1.5 rounded-lg', kind === k.kind ? 'btn-primary' : 'btn-secondary')} onClick={() => { setKind(k.kind); setPage(0); }}>{k.kind} ({k.count})</button>
        ))}
      </div>

      <div className="relative max-w-md">
        <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
        <input className="input pr-9" placeholder="חיפוש לפי נושא" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="card divide-y">
        {isLoading && !data ? (
          <div className="p-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
        ) : !data?.rows.length ? (
          <p className="p-8 text-center text-sm text-slate-500">{search || kind ? 'לא נמצאו מיילים.' : 'עוד לא נשלחו מיילים מאז שהעמוד הזה נוסף. מכאן והלאה כל מייל יופיע כאן.'}</p>
        ) : data.rows.map((r) => (
          <button key={r.id} data-sent-row onClick={() => setOpen(r)} className="w-full text-right p-3 md:p-4 hover:bg-slate-50 flex flex-col md:flex-row md:items-center gap-1 md:gap-4">
            <span className="text-xs text-slate-400 md:w-36 shrink-0">{span(r)}</span>
            <span className="flex-1 min-w-0">
              <span className="block font-medium text-slate-900 truncate">{r.subject}</span>
              <span className="block text-xs text-slate-500">{sentTo(r)}</span>
            </span>
            <span className="flex items-center gap-2 shrink-0">
              <span className="badge bg-slate-100 text-slate-600">{r.kind}</span>
              {r.failed > 0 && <span className="badge bg-red-50 text-red-700 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{r.failed} לא נשלחו</span>}
            </span>
          </button>
        ))}
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-center gap-3 text-sm">
          <button className="btn-secondary px-3 py-1.5 rounded-lg" disabled={page === 0} onClick={() => setPage(page - 1)}>חדשים יותר</button>
          <span className="text-slate-500">עמוד {page + 1} מתוך {pages}</span>
          <button className="btn-secondary px-3 py-1.5 rounded-lg" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>ישנים יותר</button>
        </div>
      )}

      {open && <Reader id={open.id} row={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
