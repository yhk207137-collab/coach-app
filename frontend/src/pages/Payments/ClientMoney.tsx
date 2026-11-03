import { useState } from 'react';
import { format } from 'date-fns';
import { CalendarPlus, ChevronLeft, Clock, HandCoins, Pencil, Plus, Wallet } from 'lucide-react';
import clsx from 'clsx';
import { ChargeModal, RecordReceivedModal, ScheduleModal, TotalModal, ils, todayInput, useMoneyRefresh, usePayment } from './received';

type Action = 'received' | 'charge' | 'schedule' | 'total';

// The client's money at the top of their page: where it stands, and every action, for any client and from any tab.
export default function ClientMoney({ client, onUpdated, onShowAll }: { client: { id: string; fullName: string }; onUpdated: () => void; onShowAll?: () => void }) {
  const [action, setAction] = useState<Action | null>(null);
  const refresh = useMoneyRefresh(onUpdated);
  const { data: payment, isLoading, isError } = usePayment(client.id);

  const total = payment?.totalAmount ?? 0;
  const paid = payment?.paidAmount ?? 0;
  const balance = total - paid;
  const next = balance > 0 ? payment?.nextPaymentDate : null;
  const nextPassed = !!next && next.slice(0, 10) < todayInput();
  const saved = () => {
    setAction(null);
    refresh(client.id);
    onShowAll?.();
  };

  // The windows stay outside the card: its blur would otherwise trap them inside it.
  return (
    <>
      <div data-client-money className="card">
        <div className="flex flex-col lg:flex-row lg:items-center gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-sm text-slate-500 flex items-center gap-2">
              <Wallet className="w-4 h-4 text-slate-400" />
              {balance > 0 ? 'יתרה לתשלום' : balance < 0 ? 'יתרת זכות' : total > 0 ? 'שולם במלואו' : 'יתרה'}
            </p>
            {isError
              ? <p className="text-sm font-medium text-red-600 mt-1">לא הצלחנו לטעון את הנתונים. נסו לרענן את הדף.</p>
              : <p data-client-balance className={clsx('text-3xl font-bold mt-0.5', balance > 0 ? 'text-red-600' : 'text-slate-900', isLoading && 'opacity-30')}>{ils(Math.abs(balance))}</p>}
            <p className="text-sm text-slate-500 mt-1">
              חויב <strong className="text-slate-800">{ils(total)}</strong> · שולם <strong className="text-emerald-700">{ils(paid)}</strong>
              {onShowAll && <button type="button" onClick={onShowAll} className="text-primary-600 hover:underline inline-flex items-center mr-2">לכל התנועות<ChevronLeft className="w-3.5 h-3.5" /></button>}
            </p>
            {next && (
              <p className={clsx('text-xs mt-1 flex items-center gap-1', nextPassed ? 'font-medium text-red-600' : 'text-slate-500')}>
                <Clock className="w-3.5 h-3.5" />
                תשלום הבא: {format(new Date(next), 'd/M/yyyy')}{nextPassed ? ', המועד עבר' : ''}
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 lg:justify-end">
            <button type="button" onClick={() => setAction('received')} className="btn-primary text-sm justify-center whitespace-nowrap px-2"><HandCoins className="w-4 h-4" /> כסף שהתקבל</button>
            <button type="button" onClick={() => setAction('charge')} className="btn-primary text-sm justify-center whitespace-nowrap px-2"><Plus className="w-4 h-4" /> חיוב חדש</button>
            <button type="button" onClick={() => setAction('schedule')} className="btn-primary text-sm justify-center whitespace-nowrap px-2"><CalendarPlus className="w-4 h-4" /> תשלום עתידי</button>
            <button type="button" onClick={() => setAction('total')} className="btn-secondary text-sm justify-center whitespace-nowrap px-2"><Pencil className="w-4 h-4" /> סכום ותאריך</button>
          </div>
        </div>
      </div>

      {action === 'received' && <RecordReceivedModal client={{ ...client, balance }} onClose={() => setAction(null)} onSaved={saved} />}
      {action === 'charge' && <ChargeModal clientId={client.id} clientName={client.fullName} balance={balance} onClose={() => setAction(null)} onSaved={saved} />}
      {action === 'schedule' && <ScheduleModal clientId={client.id} clientName={client.fullName} onClose={() => setAction(null)} onSaved={saved} />}
      {action === 'total' && <TotalModal clientId={client.id} clientName={client.fullName} total={total} paid={paid} nextPaymentDate={payment?.nextPaymentDate} onClose={() => setAction(null)} onSaved={saved} />}
    </>
  );
}
