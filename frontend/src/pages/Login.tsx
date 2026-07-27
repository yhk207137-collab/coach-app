import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Briefcase, Eye, EyeOff, Loader2, Mail, CheckCircle } from 'lucide-react';
import { useAuthStore } from '../store/auth';
import api from '../services/api';
import toast from 'react-hot-toast';

type Tab = 'password' | 'magic';

export default function Login() {
  const [tab, setTab] = useState<Tab>('magic');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [magicSent, setMagicSent] = useState(false);
  const { setAuth } = useAuthStore();
  const navigate = useNavigate();

  const handlePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post('/auth/login', { email, password });
      setAuth(data.user, data.token);
      navigate(data.user.role === 'COACH' ? '/' : '/portal', { replace: true });
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'שגיאה בהתחברות');
    } finally {
      setLoading(false);
    }
  };

  const handleMagic = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return toast.error('הכנס כתובת מייל');
    setLoading(true);
    try {
      await api.post('/auth/magic', { email });
      setMagicSent(true);
    } catch {
      toast.error('שגיאה בשליחת המייל');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-primary-900 to-slate-800 flex items-center justify-center p-4">
      <div className="absolute inset-0 opacity-5"
        style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '32px 32px' }} />

      <div className="relative w-full max-w-sm animate-fade-in">
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {/* Logo */}
          <div className="flex flex-col items-center mb-6">
            <div className="w-14 h-14 bg-primary-600 rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-primary-200">
              <Briefcase className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">כניסה למערכת</h1>
            <p className="text-sm text-slate-500 mt-1">ליוי שיווק ופרסום</p>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 bg-slate-100 rounded-xl p-1 mb-6">
            <button onClick={() => { setTab('magic'); setMagicSent(false); }}
              className={`flex-1 py-2 text-sm rounded-lg font-medium transition-all ${tab === 'magic' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>
              <Mail className="w-3.5 h-3.5 inline ml-1" />
              קישור למייל
            </button>
            <button onClick={() => setTab('password')}
              className={`flex-1 py-2 text-sm rounded-lg font-medium transition-all ${tab === 'password' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>
              סיסמה
            </button>
          </div>

          {/* Magic Link */}
          {tab === 'magic' && (
            magicSent ? (
              <div className="text-center py-4">
                <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
                <p className="font-semibold text-slate-900 mb-1">בדוק את המייל שלך</p>
                <p className="text-sm text-slate-500 mb-5">
                  שלחנו קישור כניסה ל-<strong>{email}</strong>.<br />
                  הקישור תקף ל-15 דקות.
                </p>
                <button onClick={() => { setMagicSent(false); setLoading(false); }}
                  className="text-sm text-primary-600 hover:underline">
                  שלח קישור חדש
                </button>
              </div>
            ) : (
              <form onSubmit={handleMagic} className="space-y-4">
                <div>
                  <label className="label">כתובת מייל</label>
                  <input
                    type="email"
                    className="input"
                    placeholder="your@email.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    dir="ltr"
                    autoComplete="email"
                    autoCapitalize="none"
                    autoCorrect="off"
                  />
                </div>
                <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-3">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'שלח קישור כניסה'}
                </button>
                <p className="text-xs text-slate-400 text-center">
                  תקבל קישור חד-פעמי לכניסה ישירה ללא סיסמה
                </p>
              </form>
            )
          )}

          {/* Password */}
          {tab === 'password' && (
            <form onSubmit={handlePassword} className="space-y-4">
              <div>
                <label className="label">דוא"ל</label>
                <input
                  type="email"
                  className="input"
                  placeholder="your@email.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  dir="ltr"
                  autoComplete="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                />
              </div>
              <div>
                <label className="label">סיסמה</label>
                <div className="relative">
                  <input
                    type={showPass ? 'text' : 'password'}
                    className="input pl-10"
                    placeholder="••••••••"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    dir="ltr"
                    autoComplete="current-password"
                  />
                  <button type="button" onClick={() => setShowPass(!showPass)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-3 mt-2">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'כניסה'}
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-slate-400 text-xs mt-6">
          © {new Date().getFullYear()} ליוי שיווק ופרסום
        </p>
      </div>
    </div>
  );
}
