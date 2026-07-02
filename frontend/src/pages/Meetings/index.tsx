import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus, Calendar, FileText } from 'lucide-react';
import api from '../../services/api';
import { Meeting } from '../../types';
import { format, isToday, isTomorrow, isPast } from 'date-fns';
import { he } from 'date-fns/locale';
import clsx from 'clsx';
import MeetingModal from './MeetingModal';
import SummaryModal from './SummaryModal';

export default function MeetingsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [summaryFor, setSummaryFor] = useState<string | null>(null);

  const { data: meetings = [], isLoading } = useQuery<Meeting[]>({
    queryKey: ['meetings'],
    queryFn: () => api.get('/meetings').then(r => r.data),
  });

  const grouped = meetings.reduce((acc: Record<string, Meeting[]>, m) => {
    const key = format(new Date(m.date), 'yyyy-MM-dd');
    if (!acc[key]) acc[key] = [];
    acc[key].push(m);
    return acc;
  }, {});

  const sortedKeys = Object.keys(grouped).sort();

  function dayLabel(dateStr: string) {
    const d = new Date(dateStr);
    if (isToday(d)) return 'היום';
    if (isTomorrow(d)) return 'מחר';
    return format(d, "EEEE, d בMMMM", { locale: he });
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">פגישות</h1>
          <p className="page-subtitle">{meetings.length} פגישות</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary">
          <Plus className="w-4 h-4" /> פגישה חדשה
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><div className="w-7 h-7 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : meetings.length === 0 ? (
        <div className="card text-center py-16 text-slate-400">
          <Calendar className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>אין פגישות מתוזמנות</p>
        </div>
      ) : (
        <div className="space-y-6">
          {sortedKeys.map(dateKey => (
            <div key={dateKey}>
              <div className="flex items-center gap-3 mb-3">
                <h3 className="text-sm font-semibold text-slate-700">{dayLabel(dateKey)}</h3>
                <div className="flex-1 h-px bg-slate-100" />
                <span className="text-xs text-slate-400">{format(new Date(dateKey), 'd/M/yyyy')}</span>
              </div>
              <div className="space-y-3">
                {grouped[dateKey].map(m => {
                  const past = isPast(new Date(m.date));
                  return (
                    <div key={m.id} className={clsx('card flex items-center gap-4 flex-wrap',
                      past ? 'opacity-70' : '')}>
                      <div className="w-14 text-center flex-shrink-0">
                        <p className="text-lg font-bold text-slate-900">{format(new Date(m.date), 'HH:mm')}</p>
                        <p className="text-xs text-slate-400">{m.duration}ד׳</p>
                      </div>
                      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => navigate(`/clients/${m.clientId}`)}>
                        <p className="font-medium text-slate-900">{m.client?.fullName}</p>
                        <p className="text-sm text-slate-500">{m.type}</p>
                        {m.notes && <p className="text-xs text-slate-400 mt-0.5 truncate">{m.notes}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        {m.summary ? (
                          <span className="badge bg-emerald-50 text-emerald-700 text-xs">סוכם</span>
                        ) : past ? (
                          <button onClick={() => setSummaryFor(m.id)} className="btn-secondary text-xs">
                            <FileText className="w-3.5 h-3.5" /> הוסף סיכום
                          </button>
                        ) : (
                          <span className="badge bg-blue-50 text-blue-600 text-xs">מתוכנן</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <MeetingModal
          onClose={() => setShowModal(false)}
          onSaved={() => { qc.invalidateQueries({ queryKey: ['meetings'] }); setShowModal(false); }}
        />
      )}
      {summaryFor && (
        <SummaryModal
          meetingId={summaryFor}
          onClose={() => setSummaryFor(null)}
          onSaved={() => { qc.invalidateQueries({ queryKey: ['meetings'] }); setSummaryFor(null); }}
        />
      )}
    </div>
  );
}
