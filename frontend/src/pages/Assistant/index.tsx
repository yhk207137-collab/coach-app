import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { Bot, CheckCircle2, Circle, Loader2, Send, Trash2, Plus } from 'lucide-react';
import api from '../../services/api';

interface Status {
  brain: boolean; whatsapp: boolean; calendar: boolean; gmail: boolean; zoom: boolean; voice: boolean;
  spentTodayUsd: number; spentMonthUsd: number; dailyCapUsd: number; memories: number;
}
interface Memory { id: string; fact: string; topic: string; createdAt: string }
interface Msg { id: string; role: 'user' | 'assistant'; text: string; createdAt: string }

const CHECKS: { key: keyof Status; label: string; need: string }[] = [
  { key: 'brain', label: 'מוח (Claude)', need: 'חסר מפתח Claude בהגדרות השרת' },
  { key: 'whatsapp', label: 'וואטסאפ', need: 'חסר חיבור למספר של העוזר' },
  { key: 'calendar', label: 'יומן גוגל', need: 'צריך ללחוץ "חבר יומן גוגל" בהגדרות' },
  { key: 'gmail', label: 'ג׳ימייל', need: 'צריך לחבר מחדש את גוגל בהגדרות (פעם אחת) כדי לאשר גם מייל' },
  { key: 'zoom', label: 'זום', need: 'חסר חיבור לחשבון הזום' },
  { key: 'voice', label: 'הודעות קוליות', need: 'אופציונלי: חסר מפתח תמלול' },
];

const usd = (n: number) => `$${n.toFixed(2)}`;
const time = (s: string) => new Date(s).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export default function AssistantPage() {
  const qc = useQueryClient();
  const { data: status } = useQuery<Status>({ queryKey: ['assistant-status'], queryFn: () => api.get('/assistant/status').then((r) => r.data) });
  const { data: memories = [] } = useQuery<Memory[]>({ queryKey: ['assistant-memories'], queryFn: () => api.get('/assistant/memories').then((r) => r.data) });
  const { data: messages = [] } = useQuery<Msg[]>({ queryKey: ['assistant-messages'], queryFn: () => api.get('/assistant/messages').then((r) => r.data), refetchInterval: 15000 });

  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [newFact, setNewFact] = useState('');
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, sending]);

  const refresh = () => ['assistant-status', 'assistant-memories', 'assistant-messages'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));

  const send = async () => {
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    setText('');
    qc.setQueryData<Msg[]>(['assistant-messages'], (old = []) => [...old, { id: 'tmp', role: 'user', text: t, createdAt: new Date().toISOString() }]);
    try {
      await api.post('/assistant/chat', { text: t });
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'השליחה נכשלה');
    } finally {
      setSending(false);
      refresh();
    }
  };

  const forget = async (id: string) => {
    await api.delete(`/assistant/memories/${id}`);
    refresh();
  };
  const addFact = async () => {
    if (!newFact.trim()) return;
    await api.post('/assistant/memories', { fact: newFact.trim() });
    setNewFact('');
    refresh();
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary-50 text-primary-700 flex items-center justify-center"><Bot size={22} /></div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">העוזר שלי</h1>
          <p className="text-sm text-slate-500">שולחים לו הודעה בוואטסאפ כמו לחבר, והוא מבצע: יומן, מייל, זום והמערכת.</p>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="card p-5 md:col-span-2">
          <h2 className="font-semibold text-slate-800 mb-3">מה מחובר</h2>
          <ul className="grid sm:grid-cols-2 gap-2">
            {CHECKS.map((c) => {
              const ok = !!status?.[c.key];
              return (
                <li key={c.key} className="flex items-start gap-2 text-sm">
                  {ok ? <CheckCircle2 size={18} className="text-emerald-600 mt-0.5 flex-shrink-0" /> : <Circle size={18} className="text-slate-300 mt-0.5 flex-shrink-0" />}
                  <span>
                    <span className={clsx('font-medium', ok ? 'text-slate-800' : 'text-slate-500')}>{c.label}</span>
                    {!ok && status && <span className="block text-xs text-slate-400">{c.need}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
        <div className="card p-5">
          <h2 className="font-semibold text-slate-800 mb-3">עלות</h2>
          <p className="text-sm text-slate-600">היום: <b className="text-slate-900">{status ? usd(status.spentTodayUsd) : '…'}</b></p>
          <p className="text-sm text-slate-600 mt-1">החודש: <b className="text-slate-900">{status ? usd(status.spentMonthUsd) : '…'}</b></p>
          <p className="text-xs text-slate-400 mt-2">תקרה יומית: {status ? usd(status.dailyCapUsd) : '…'}. מעבר לה העוזר עוצר עד מחר.</p>
        </div>
      </div>

      <div className="grid md:grid-cols-5 gap-4">
        <div className="card md:col-span-3 flex flex-col h-[560px]">
          <div className="px-5 py-3 border-b border-slate-100">
            <h2 className="font-semibold text-slate-800">השיחה</h2>
            <p className="text-xs text-slate-400">אותה שיחה כמו בוואטסאפ. אפשר גם לכתוב לו מכאן.</p>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-slate-50/60">
            {messages.length === 0 && <p className="text-sm text-slate-400 text-center mt-10">עוד אין הודעות.</p>}
            {messages.map((m) => (
              <div key={m.id + m.createdAt} className={clsx('flex', m.role === 'user' ? 'justify-start' : 'justify-end')}>
                <div className={clsx('max-w-[85%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap shadow-sm', m.role === 'user' ? 'bg-emerald-100 text-slate-800' : 'bg-white text-slate-800')}>
                  {m.text}
                  <div className="text-[10px] text-slate-400 mt-1">{time(m.createdAt)}</div>
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex justify-end"><div className="rounded-2xl px-3.5 py-2 bg-white shadow-sm"><Loader2 size={16} className="animate-spin text-slate-400" /></div></div>
            )}
            <div ref={bottom} />
          </div>
          <div className="p-3 border-t border-slate-100 flex gap-2">
            <input
              className="input flex-1"
              placeholder="למשל: מה יש לי מחר?"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send()}
              disabled={sending}
            />
            <button type="button" className="btn-primary inline-flex items-center gap-1" onClick={send} disabled={sending || !text.trim()}>
              <Send size={16} /> שלח
            </button>
          </div>
        </div>

        <div className="card md:col-span-2 flex flex-col h-[560px]">
          <div className="px-5 py-3 border-b border-slate-100">
            <h2 className="font-semibold text-slate-800">מה הוא זוכר עליך ({memories.length})</h2>
            <p className="text-xs text-slate-400">הוא לומד לבד מהשיחות. אפשר למחוק או להוסיף.</p>
          </div>
          <ul className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {memories.length === 0 && <li className="p-4 text-sm text-slate-400">עוד לא למד כלום.</li>}
            {memories.map((m) => (
              <li key={m.id} className="px-4 py-2.5 flex items-start gap-2 text-sm group">
                <span className="text-[11px] mt-0.5 px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 flex-shrink-0">{m.topic}</span>
                <span className="flex-1 text-slate-700">{m.fact}</span>
                <button type="button" onClick={() => forget(m.id)} className="text-slate-300 hover:text-red-600" aria-label="מחק">
                  <Trash2 size={15} />
                </button>
              </li>
            ))}
          </ul>
          <div className="p-3 border-t border-slate-100 flex gap-2">
            <input className="input flex-1" placeholder="משהו שחשוב שידע עליך" value={newFact} onChange={(e) => setNewFact(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addFact()} />
            <button type="button" className="btn-secondary inline-flex items-center gap-1" onClick={addFact}><Plus size={16} /> הוסף</button>
          </div>
        </div>
      </div>
    </div>
  );
}
