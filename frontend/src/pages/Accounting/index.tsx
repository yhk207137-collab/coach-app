import { useQuery } from '@tanstack/react-query';
import { TrendingUp, Calendar, DollarSign } from 'lucide-react';
import api from '../../services/api';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';

interface AccountingSummary {
  monthly: Record<string, number>;
  expectedThisMonth: number;
  expectedNextMonth: number;
}

export default function AccountingPage() {
  const { data, isLoading } = useQuery<AccountingSummary>({
    queryKey: ['accounting'],
    queryFn: () => api.get('/payments/accounting/summary').then(r => r.data),
  });

  const months = data ? Object.entries(data.monthly).sort((a, b) => a[0].localeCompare(b[0])) : [];
  const totalIncome = months.reduce((sum, [, v]) => sum + v, 0);
  const currentMonthKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const thisMonthIncome = data?.monthly[currentMonthKey] ?? 0;
  const maxMonthly = months.length ? Math.max(...months.map(([, v]) => v)) : 1;

  const formatMonthLabel = (key: string) => {
    const [y, m] = key.split('-');
    return format(new Date(Number(y), Number(m) - 1, 1), 'MMM yyyy', { locale: he });
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">הנהלת חשבונות</h1>
          <p className="page-subtitle">סיכום הכנסות ותחזיות</p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs text-slate-500">סה"כ הכנסות</p>
              <p className="text-xl font-bold text-slate-900">₪{totalIncome.toLocaleString()}</p>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
              <Calendar className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-slate-500">החודש שולם + מתוזמן</p>
              <p className="text-xl font-bold text-slate-900">₪{(thisMonthIncome + (data?.expectedThisMonth ?? 0)).toLocaleString()}</p>
              {(data?.expectedThisMonth ?? 0) > 0 && (
                <p className="text-xs text-blue-500">מתוכם ₪{data!.expectedThisMonth.toLocaleString()} מתוזמן</p>
              )}
            </div>
          </div>
        </div>
        <div className="card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-violet-50 rounded-xl flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-violet-600" />
            </div>
            <div>
              <p className="text-xs text-slate-500">צפי חודש הבא</p>
              <p className="text-xl font-bold text-slate-900">₪{(data?.expectedNextMonth ?? 0).toLocaleString()}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Monthly chart */}
      <div className="card">
        <h2 className="font-semibold text-slate-900 mb-4">הכנסות לפי חודש</h2>
        {isLoading ? (
          <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" /></div>
        ) : months.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <TrendingUp className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>אין נתוני תשלום עדיין</p>
          </div>
        ) : (
          <div className="space-y-3">
            {months.map(([key, amount]) => (
              <div key={key} className="flex items-center gap-4">
                <div className="w-20 text-sm text-slate-600 text-right flex-shrink-0">{formatMonthLabel(key)}</div>
                <div className="flex-1 h-8 bg-slate-100 rounded-lg overflow-hidden">
                  <div
                    className={`h-full rounded-lg transition-all duration-500 flex items-center px-3 ${key === currentMonthKey ? 'bg-primary-500' : 'bg-emerald-400'}`}
                    style={{ width: `${Math.max((amount / maxMonthly) * 100, 5)}%` }}
                  >
                    <span className="text-white text-xs font-medium whitespace-nowrap">₪{amount.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            ))}

            {/* Expected */}
            {(data?.expectedThisMonth ?? 0) > 0 && (
              <div className="flex items-center gap-4 opacity-60">
                <div className="w-20 text-sm text-slate-600 text-right flex-shrink-0">{formatMonthLabel(currentMonthKey)} (מתוזמן)</div>
                <div className="flex-1 h-8 bg-slate-100 rounded-lg overflow-hidden">
                  <div
                    className="h-full rounded-lg bg-blue-400 flex items-center px-3"
                    style={{ width: `${Math.max((data!.expectedThisMonth / maxMonthly) * 100, 5)}%` }}
                  >
                    <span className="text-white text-xs font-medium whitespace-nowrap">₪{data!.expectedThisMonth.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            )}
            {(data?.expectedNextMonth ?? 0) > 0 && (
              <div className="flex items-center gap-4 opacity-60">
                <div className="w-20 text-sm text-slate-600 text-right flex-shrink-0">חודש הבא (מתוזמן)</div>
                <div className="flex-1 h-8 bg-slate-100 rounded-lg overflow-hidden">
                  <div
                    className="h-full rounded-lg bg-violet-400 flex items-center px-3"
                    style={{ width: `${Math.max((data!.expectedNextMonth / maxMonthly) * 100, 5)}%` }}
                  >
                    <span className="text-white text-xs font-medium whitespace-nowrap">₪{data!.expectedNextMonth.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Monthly table */}
      {months.length > 0 && (
        <div className="card p-0 overflow-hidden mt-6">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="table-header">חודש</th>
                <th className="table-header">הכנסות שהתקבלו</th>
              </tr>
            </thead>
            <tbody>
              {[...months].reverse().map(([key, amount]) => (
                <tr key={key} className={`table-row ${key === currentMonthKey ? 'bg-primary-50' : ''}`}>
                  <td className="table-cell font-medium text-slate-700">{formatMonthLabel(key)}</td>
                  <td className="table-cell text-emerald-700 font-bold">₪{amount.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
