import { useState, useEffect } from 'react';
import { Eye, EyeOff, Loader2, Lock, CheckCircle, Calendar } from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/auth';

export default function SettingsPage() {
  const { user } = useAuthStore();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [calConnected, setCalConnected] = useState<boolean | null>(null);
  const [calLoading, setCalLoading] = useState(false);

  useEffect(() => {
    api.get('/calendar/status').then(r => setCalConnected(r.data.connected)).catch(() => setCalConnected(false));

    // Listen for message from Google OAuth popup
    const handler = (e: MessageEvent) => {
      if (e.data === 'google-calendar-connected') {
        setCalConnected(true);
        toast.success('יומן גוגל חובר בהצלחה!');
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const connectGoogleCalendar = async () => {
    setCalLoading(true);
    try {
      const { data } = await api.get('/calendar/connect');
      window.open(data.url, '_blank', 'width=500,height=600');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'שגיאה בחיבור יומן גוגל');
    } finally {
      setCalLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next !== confirm) return toast.error('הסיסמאות אינן תואמות');
    if (next.length < 4) return toast.error('הסיסמה חייבת להכיל לפחות 4 תווים');
    setLoading(true);
    try {
      await api.post('/auth/change-password', { currentPassword: current, newPassword: next });
      setDone(true);
      setCurrent(''); setNext(''); setConfirm('');
      toast.success('הסיסמה עודכנה בהצלחה');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'שגיאה בעדכון הסיסמה');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">הגדרות</h1>
          <p className="page-subtitle">{user?.email}</p>
        </div>
      </div>

      <div className="max-w-md space-y-6">

        {/* Google Calendar */}
        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
              <Calendar className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-900">יומן גוגל</h2>
              <p className="text-sm text-slate-500">סנכרון אוטומטי של פגישות + הזמנות ללקוחות</p>
            </div>
          </div>

          {calConnected === null ? (
            <div className="flex items-center gap-2 text-slate-400 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> בודק...</div>
          ) : calConnected ? (
            <div className="flex items-center gap-2 bg-emerald-50 text-emerald-700 rounded-xl p-3 text-sm">
              <CheckCircle className="w-4 h-4" />
              יומן גוגל מחובר — פגישות חדשות יתווספו אוטומטית ויישלחו הזמנות ללקוחות
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-slate-500">
                כשתחבר את היומן, כל פגישה שתיצור תופיע אוטומטית ביומן גוגל שלך, והלקוח יקבל הזמנה ישירות למייל.
              </p>
              <button onClick={connectGoogleCalendar} disabled={calLoading} className="btn-primary w-full justify-center py-2.5">
                {calLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                  <><svg className="w-4 h-4 ml-2" viewBox="0 0 24 24"><path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                  חבר יומן גוגל</>
                )}
              </button>
            </div>
          )}
        </div>


        <div className="card">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-primary-100 rounded-xl flex items-center justify-center">
              <Lock className="w-5 h-5 text-primary-600" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-900">שינוי סיסמה</h2>
              <p className="text-sm text-slate-500">הגדר סיסמה לכניסה מכל מכשיר</p>
            </div>
          </div>

          {done && (
            <div className="flex items-center gap-2 bg-emerald-50 text-emerald-700 rounded-xl p-3 mb-4 text-sm">
              <CheckCircle className="w-4 h-4" />
              הסיסמה עודכנה — עכשיו ניתן להיכנס עם סיסמה מכל מכשיר
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">סיסמה נוכחית (אם יש)</label>
              <div className="relative">
                <input
                  type={showCurrent ? 'text' : 'password'}
                  className="input pl-10"
                  placeholder="השאר ריק אם אין סיסמה"
                  value={current}
                  onChange={e => setCurrent(e.target.value)}
                  dir="ltr"
                  autoComplete="current-password"
                />
                <button type="button" onClick={() => setShowCurrent(!showCurrent)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                  {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="label">סיסמה חדשה *</label>
              <div className="relative">
                <input
                  type={showNext ? 'text' : 'password'}
                  className="input pl-10"
                  placeholder="לפחות 4 תווים"
                  value={next}
                  onChange={e => setNext(e.target.value)}
                  required
                  dir="ltr"
                  autoComplete="new-password"
                />
                <button type="button" onClick={() => setShowNext(!showNext)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                  {showNext ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="label">אימות סיסמה *</label>
              <input
                type="password"
                className="input"
                placeholder="הקלד שוב את הסיסמה"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                required
                dir="ltr"
                autoComplete="new-password"
              />
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-3 mt-2">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'שמור סיסמה'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
