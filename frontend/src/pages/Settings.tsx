import { useState } from 'react';
import { Eye, EyeOff, Loader2, Lock, CheckCircle } from 'lucide-react';
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

      <div className="max-w-md">
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
