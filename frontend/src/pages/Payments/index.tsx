import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { CreditCard, AlertCircle } from 'lucide-react';
import api from '../../services/api';
import { Client } from '../../types';
import { format } from 'date-fns';

export default function PaymentsPage() {
  const navigate = useNavigate();
  const { data: clients = [], isLoading } = useQuery<Client[]>({
    queryKey: ['clients-with-payments'],
    queryFn: () => api.get('/clients').then(r => r.data),
  });

  const clientsWithPayments = clients.filter(c => c.payments && c.payments.length > 0);
  const overdueClients = clientsWithPayments.filter(c => {
    const p = c.payments?.[0];
    return p && p.paidAmount < p.totalAmount;
  });

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">תשלומים</h1>
          <p className="page-subtitle">ניהול גבייה ותשלומים</p>
        </div>
      </div>

      {overdueClients.length > 0 && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-800">יש {overdueClients.length} לקוחות עם יתרה לגבייה</p>
            <p className="text-xs text-amber-700 mt-0.5">
              {overdueClients.map(c => c.fullName).join(', ')}
            </p>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="table-header">לקוח</th>
                <th className="table-header">סכום עסקה</th>
                <th className="table-header">שולם</th>
                <th className="table-header">יתרה</th>
                <th className="table-header hidden md:table-cell">תשלום הבא</th>
                <th className="table-header">מצב</th>
              </tr>
            </thead>
            <tbody>
              {clients.map(client => {
                const p = client.payments?.[0];
                if (!p) return null;
                const balance = p.totalAmount - p.paidAmount;
                return (
                  <tr key={client.id} className="table-row cursor-pointer" onClick={() => navigate(`/clients/${client.id}?tab=payments`)}>
                    <td className="table-cell">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 bg-primary-100 rounded-lg flex items-center justify-center text-xs font-bold text-primary-700">
                          {client.fullName[0]}
                        </div>
                        <span className="font-medium text-slate-800">{client.fullName}</span>
                      </div>
                    </td>
                    <td className="table-cell">₪{p.totalAmount.toLocaleString()}</td>
                    <td className="table-cell text-emerald-700 font-medium">₪{p.paidAmount.toLocaleString()}</td>
                    <td className={`table-cell font-medium ${balance > 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                      ₪{balance.toLocaleString()}
                    </td>
                    <td className="table-cell hidden md:table-cell text-slate-500">
                      {p.nextPaymentDate ? format(new Date(p.nextPaymentDate), 'd/M/yyyy') : '—'}
                    </td>
                    <td className="table-cell">
                      {balance === 0
                        ? <span className="badge bg-emerald-50 text-emerald-700">שולם במלואו</span>
                        : <span className="badge bg-red-50 text-red-600">יתרה לגבייה</span>
                      }
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {clients.every(c => !c.payments?.length) && (
            <div className="text-center py-16 text-slate-400">
              <CreditCard className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>אין נתוני תשלום</p>
              <p className="text-sm mt-1">הגדר תכנית תשלום בתיק הלקוח</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
