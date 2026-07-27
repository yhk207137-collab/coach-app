import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Briefcase, Loader2, XCircle } from 'lucide-react';
import api from '../services/api';
import { useAuthStore } from '../store/auth';

export default function Verify() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();
  const [error, setError] = useState('');

  useEffect(() => {
    const token = params.get('token');
    if (!token) { setError('קישור לא תקין'); return; }

    api.get(`/auth/magic/verify?token=${encodeURIComponent(token.startsWith('otp:') ? token : token)}`)
      .then(({ data }) => {
        setAuth(data.user, data.token);
        navigate(data.user.role === 'COACH' ? '/' : '/portal', { replace: true });
      })
      .catch(err => {
        setError(err.response?.data?.error || 'הקישור פג תוקף. בקש קישור חדש.');
      });
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-primary-900 to-slate-800 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full text-center">
        <div className="w-14 h-14 bg-primary-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Briefcase className="w-7 h-7 text-white" />
        </div>

        {!error ? (
          <>
            <Loader2 className="w-8 h-8 animate-spin text-primary-500 mx-auto mb-3" />
            <p className="text-slate-700 font-medium">מאמת קישור...</p>
          </>
        ) : (
          <>
            <XCircle className="w-8 h-8 text-red-400 mx-auto mb-3" />
            <p className="text-slate-800 font-semibold mb-2">שגיאה</p>
            <p className="text-slate-500 text-sm mb-5">{error}</p>
            <button onClick={() => navigate('/login')} className="btn-primary w-full justify-center">
              חזרה לדף הכניסה
            </button>
          </>
        )}
      </div>
    </div>
  );
}
