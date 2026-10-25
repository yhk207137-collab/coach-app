import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { Loader2, MailX, CheckCircle2, Mail } from 'lucide-react';

type State = 'loading' | 'ask' | 'done' | 'back' | 'missing' | 'preview' | 'error';

export default function Unsubscribe() {
  const { token = '' } = useParams();
  const [params] = useSearchParams();
  const [state, setState] = useState<State>(token === 'preview' ? 'preview' : 'loading');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (token === 'preview') return;
    axios.get(`/api/public/unsubscribe/${encodeURIComponent(token)}`)
      .then(({ data }) => { setEmail(data.email); setState(data.subscribed ? 'ask' : 'done'); })
      .catch((err) => setState(err.response?.status === 404 ? 'missing' : 'error'));
  }, [token]);

  const unsubscribe = async () => {
    setBusy(true);
    try {
      await axios.post(`/api/public/unsubscribe/${encodeURIComponent(token)}`, { s: params.get('s') || undefined });
      setState('done');
    } catch {
      setState('error');
    } finally {
      setBusy(false);
    }
  };
  const resubscribe = async () => {
    setBusy(true);
    try {
      await axios.post(`/api/public/resubscribe/${encodeURIComponent(token)}`);
      setState('back');
    } catch {
      setState('error');
    } finally {
      setBusy(false);
    }
  };

  const content: Record<State, JSX.Element> = {
    loading: <Loader2 className="w-8 h-8 animate-spin text-slate-400 mx-auto" />,
    preview: (
      <>
        <MailX className="w-12 h-12 text-slate-300 mx-auto mb-4" />
        <h1 className="text-xl font-bold text-slate-900 mb-2">כאן הנמען יוסר מהרשימה</h1>
        <p className="text-slate-500">זה קישור לדוגמה ממייל בדיקה. במייל אמיתי, לחיצה כאן מסירה את הנמען מרשימת התפוצה.</p>
      </>
    ),
    ask: (
      <>
        <MailX className="w-12 h-12 text-slate-400 mx-auto mb-4" />
        <h1 className="text-xl font-bold text-slate-900 mb-2">הסרה מרשימת התפוצה</h1>
        <p className="text-slate-500 mb-6">להפסיק לשלוח מיילים לכתובת <span dir="ltr" className="font-medium text-slate-700">{email}</span>?</p>
        <button onClick={unsubscribe} disabled={busy} className="w-full py-3 rounded-xl bg-slate-900 text-white font-medium hover:bg-slate-800 disabled:opacity-60">
          {busy ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'כן, הסירו אותי'}
        </button>
      </>
    ),
    done: (
      <>
        <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
        <h1 className="text-xl font-bold text-slate-900 mb-2">הוסרת מהרשימה</h1>
        <p className="text-slate-500 mb-6">לא יישלחו יותר מיילים לכתובת <span dir="ltr">{email}</span>.</p>
        <button onClick={resubscribe} disabled={busy} className="text-sm text-slate-500 underline hover:text-slate-800">
          נלחץ בטעות? חזרה לרשימה
        </button>
      </>
    ),
    back: (
      <>
        <Mail className="w-12 h-12 text-primary-500 mx-auto mb-4" />
        <h1 className="text-xl font-bold text-slate-900 mb-2">חזרת לרשימה</h1>
        <p className="text-slate-500">שמחים שנשארת. המיילים ימשיכו להגיע.</p>
      </>
    ),
    missing: (
      <>
        <MailX className="w-12 h-12 text-slate-300 mx-auto mb-4" />
        <h1 className="text-xl font-bold text-slate-900 mb-2">הקישור לא תקין</h1>
        <p className="text-slate-500">ייתכן שהכתובת כבר נמחקה מהרשימה. אפשר פשוט להשיב למייל ולבקש הסרה.</p>
      </>
    ),
    error: (
      <>
        <MailX className="w-12 h-12 text-red-300 mx-auto mb-4" />
        <h1 className="text-xl font-bold text-slate-900 mb-2">משהו השתבש</h1>
        <p className="text-slate-500">נסו שוב בעוד דקה, או השיבו למייל ובקשו הסרה.</p>
      </>
    ),
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4" dir="rtl">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full text-center">{content[state]}</div>
    </div>
  );
}
