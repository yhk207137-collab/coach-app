import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Briefcase, Eye, EyeOff, Loader2, Mail, CheckCircle, KeyRound } from 'lucide-react';
import { useAuthStore } from '../store/auth';
import api from '../services/api';
import toast from 'react-hot-toast';

type Tab = 'password' | 'magic';

export default function Login() {
  const [tab, setTab] = useState<Tab>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [magicSent, setMagicSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [otpInput, setOtpInput] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
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
      const { data } = await api.post('/auth/magic', { email });
      setOtp(data.otp || '');
      setMagicSent(true);
    } catch {
      toast.error('שגיאה בשליחת הקוד');
    } finally {
      setLoading(false);
    }
  };

  const handleOtpLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpInput.trim()) return toast.error('הכנס את הקוד');
    setOtpLoading(true);
    try {
      const { data } = await api.get(`/auth/magic/verify?token=${encodeURIComponent(`otp:${otpInput.trim()}`)}`);
      setAuth(data.user, data.token);
      navigate(data.user.role === 'COACH' ? '/' : '/portal', { replace: true });
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'קוד שגוי או פג תוקף');
    } finally {
      setOtpLoading(false);
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
            <button onClick={() => { setTab('magic'); setMagicSent(false); setOtp(''); setOtpInput(''); }}
              className={`flex-1 py-2 text-sm rounded-lg font-medium transition-all ${tab === 'magic' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>
              <Mail className="w-3.5 h-3.5 inline ml-1" />
              כניסה עם קוד
            </button>
            <button onClick={() => setTab('password')}
              className={`flex-1 py-2 text-sm rounded-lg font-medium transition-all ${tab === 'password' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>
              סיסמה
            </button>
          </div>

          {/* Magic / OTP */}
          {tab === 'magic' && (
            magicSent ? (
              <div className="text-center py-2">
                <CheckCircle className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
                <p className="font-semibold text-slate-900 mb-1">הקוד שלך לכניסה</p>
                <p className="text-xs text-slate-500 mb-3">
                  שלחנו גם למייל <strong>{email}</strong>
                </p>

                {/* Big OTP display */}
                {otp && (
                  <div className="bg-primary-50 border-2 border-primary-200 rounded-2xl p-4 mb-5">
                    <p className="text-xs text-primary-600 font-medium mb-1">קוד הכניסה שלך:</p>
                    <p className="text-4xl font-bold tracking-[0.3em] text-primary-700">{otp}</p>
                    <p className="text-xs text-slate-400 mt-1">תקף ל-15 דקות</p>
                  </div>
                )}

                {/* OTP entry form */}
                <form onSubmit={handleOtpLogin} className="space-y-3 text-right">
                  <div>
                    <label className="label flex items-center gap-1">
                      <KeyRound className="w-3.5 h-3.5" />
                      הקלד את הקוד
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      className="input text-center text-2xl tracking-[0.3em] font-bold"
                      placeholder="000000"
                      maxLength={6}
                      value={otpInput}
                      onChange={e => setOtpInput(e.target.value.replace(/\D/g, ''))}
                      dir="ltr"
                      autoFocus
                    />
                  </div>
                  <button type="submit" disabled={otpLoading || otpInput.length !== 6} className="btn-primary w-full justify-center py-3">
                    {otpLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'כנסו למערכת'}
                  </button>
                </form>

                <button onClick={() => { setMagicSent(false); setOtp(''); setOtpInput(''); }}
                  className="text-xs text-primary-600 hover:underline mt-3 block mx-auto">
                  שלח קוד חדש
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
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'קבל קוד כניסה'}
                </button>
                <p className="text-xs text-slate-400 text-center">
                  תקבל קוד 6 ספרות לכניסה — ללא סיסמה
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
