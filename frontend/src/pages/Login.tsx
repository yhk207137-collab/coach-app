import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Loader2, Mail, KeyRound, ArrowRight } from 'lucide-react';
import { useAuthStore } from '../store/auth';
import api from '../services/api';
import toast from 'react-hot-toast';
import { cleanEmail } from '../utils/text';

type Mode = 'password' | 'code' | 'forgot';

const errorText = (err: any, fallback: string) => err?.response?.data?.error || fallback;

export default function Login() {
  const [mode, setMode] = useState<Mode>('password');
  const [codeSent, setCodeSent] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [code, setCode] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const { setAuth } = useAuthStore();
  const navigate = useNavigate();

  const switchMode = (m: Mode) => {
    setMode(m);
    setCodeSent(false);
    setCode('');
    setNewPassword('');
  };

  const finishLogin = (data: any) => {
    setAuth(data.user, data.token);
    navigate(data.user.role === 'COACH' ? '/' : '/portal', { replace: true });
  };

  const run = async (fn: () => Promise<void>, fallback: string) => {
    setLoading(true);
    try {
      await fn();
    } catch (err) {
      toast.error(errorText(err, fallback));
    } finally {
      setLoading(false);
    }
  };

  const handlePassword = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      const { data } = await api.post('/auth/login', { email: email.trim(), password });
      finishLogin(data);
    }, 'שגיאה בהתחברות');
  };

  const handleSendCode = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return toast.error('הכנס כתובת מייל');
    run(async () => {
      await api.post('/auth/magic', { email: email.trim() });
      setCodeSent(true);
      toast.success('אם המייל רשום במערכת — נשלח אליו קוד');
    }, 'שגיאה בשליחת הקוד');
  };

  const handleCodeLogin = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      const { data } = await api.post('/auth/otp/verify', { email: email.trim(), code });
      finishLogin(data);
    }, 'קוד שגוי או פג תוקף');
  };

  const handleReset = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) return toast.error('הסיסמה חייבת להכיל לפחות 6 תווים');
    run(async () => {
      const { data } = await api.post('/auth/reset-password', { email: email.trim(), code, newPassword });
      toast.success('הסיסמה עודכנה בהצלחה');
      finishLogin(data);
    }, 'שגיאה באיפוס הסיסמה');
  };

  const emailInput = (
    <div>
      <label className="label">כתובת מייל</label>
      <input
        type="text"
        inputMode="email"
        className="input"
        placeholder="your@email.com"
        value={email}
        onChange={e => setEmail(cleanEmail(e.target.value))}
        required
        dir="ltr"
        autoComplete="username"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
      />
    </div>
  );

  const codeInput = (
    <div>
      <label className="label flex items-center gap-1">
        <KeyRound className="w-3.5 h-3.5" />
        הקוד שקיבלת במייל
      </label>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        className="input text-center text-2xl tracking-[0.3em] font-bold"
        placeholder="000000"
        maxLength={6}
        value={code}
        onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
        dir="ltr"
        autoFocus
      />
      <p className="text-xs text-slate-400 mt-1">נשלח אל {email.trim()} · תקף ל-15 דקות · בדוק גם בספאם</p>
    </div>
  );

  const passwordToggle = (
    <button type="button" onClick={() => setShowPass(!showPass)}
      className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
      {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
    </button>
  );

  const submitButton = (label: string, disabled = false) => (
    <button type="submit" disabled={loading || disabled} className="btn-primary w-full justify-center py-3">
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : label}
    </button>
  );

  const resendLink = (
    <button type="button" onClick={() => { setCodeSent(false); setCode(''); }}
      className="text-xs text-primary-600 hover:underline block mx-auto">
      לא קיבלתי — שלח קוד חדש
    </button>
  );

  return (
    <div className="min-h-screen bg-gradient-brand flex items-center justify-center p-4">
      <div className="absolute inset-0 opacity-5"
        style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '32px 32px' }} />

      <div className="relative w-full max-w-sm animate-fade-in">
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <div className="flex flex-col items-center mb-6">
            <img src="/brand/logo.png" alt="יהושע כהן — אסטרטגיה וליווי לעמותות" className="h-32 w-auto mb-5" />
            <h1 className="text-xl font-bold text-navy-900">
              {mode === 'forgot' ? 'איפוס סיסמה' : 'כניסה למערכת'}
            </h1>
          </div>

          {mode !== 'forgot' && (
            <div className="flex gap-1 bg-slate-100 rounded-xl p-1 mb-6">
              <button type="button" onClick={() => switchMode('password')}
                className={`flex-1 py-2 text-sm rounded-lg font-medium transition-all ${mode === 'password' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>
                סיסמה
              </button>
              <button type="button" onClick={() => switchMode('code')}
                className={`flex-1 py-2 text-sm rounded-lg font-medium transition-all ${mode === 'code' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>
                <Mail className="w-3.5 h-3.5 inline ml-1" />
                כניסה עם קוד
              </button>
            </div>
          )}

          {mode === 'password' && (
            <form onSubmit={handlePassword} className="space-y-4">
              {emailInput}
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
                  {passwordToggle}
                </div>
              </div>
              {submitButton('כניסה')}
              <button type="button" onClick={() => switchMode('forgot')}
                className="text-sm text-primary-600 hover:underline block mx-auto">
                שכחתי סיסמה
              </button>
            </form>
          )}

          {mode === 'code' && (
            !codeSent ? (
              <form onSubmit={handleSendCode} className="space-y-4">
                {emailInput}
                {submitButton('שלח לי קוד כניסה')}
                <p className="text-xs text-slate-400 text-center">קוד של 6 ספרות יישלח למייל — בלי סיסמה</p>
              </form>
            ) : (
              <form onSubmit={handleCodeLogin} className="space-y-4">
                {codeInput}
                {submitButton('כניסה למערכת', code.length !== 6)}
                {resendLink}
              </form>
            )
          )}

          {mode === 'forgot' && (
            <>
              {!codeSent ? (
                <form onSubmit={handleSendCode} className="space-y-4">
                  <p className="text-sm text-slate-500">נשלח קוד למייל שלך, ואז תבחר סיסמה חדשה.</p>
                  {emailInput}
                  {submitButton('שלח לי קוד')}
                </form>
              ) : (
                <form onSubmit={handleReset} className="space-y-4">
                  {codeInput}
                  <div>
                    <label className="label">סיסמה חדשה</label>
                    <div className="relative">
                      <input
                        type={showPass ? 'text' : 'password'}
                        className="input pl-10"
                        placeholder="לפחות 6 תווים"
                        value={newPassword}
                        onChange={e => setNewPassword(e.target.value)}
                        required
                        minLength={6}
                        dir="ltr"
                        autoComplete="new-password"
                      />
                      {passwordToggle}
                    </div>
                  </div>
                  {submitButton('שמור סיסמה והיכנס', code.length !== 6)}
                  {resendLink}
                </form>
              )}
              <button type="button" onClick={() => switchMode('password')}
                className="text-sm text-slate-500 hover:text-slate-700 flex items-center gap-1 mx-auto mt-4">
                <ArrowRight className="w-3.5 h-3.5" />
                חזרה לכניסה
              </button>
            </>
          )}
        </div>

        <p className="text-center text-white/40 text-xs mt-6">
          © {new Date().getFullYear()} יהושע כהן · אסטרטגיה וליווי לעמותות
        </p>
      </div>
    </div>
  );
}
