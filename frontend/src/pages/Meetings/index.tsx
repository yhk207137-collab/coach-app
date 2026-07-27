import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus, Calendar, FileText, Pencil, Trash2, AlertTriangle } from 'lucide-react';
import api from '../../services/api';
import { Meeting } from '../../types';
import { format, isToday, isTomorrow, isPast } from 'date-fns';
import { he } from 'date-fns/locale';
import clsx from 'clsx';
import MeetingModal from './MeetingModal';
import SummaryModal from './SummaryModal';
import toast from 'react-hot-toast';

export default function MeetingsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editMeeting, setEditMeeting] = useState<Meeting | null>(null);
  const [summaryFor, setSummaryFor] = useState<string | null>(null);

  const { data: meetings = [], isLoading } = useQuery<Meeting[]>({
    queryKey: ['meetings'],
    queryFn: () => api.get('/meetings').then(r => r.data),
  });

  const deleteMeeting = useMutation({
    mutationFn: (id: string) => api.delete(`/meetings/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['meetings'] }); toast.success('הפגישה נמחקה'); },
    onError: () => toast.error('שגיאה במחיקה'),
  });

  const handleDelete = (m: Meeting) => {
    if (confirm(`למחוק את הפגישה עם ${m.client?.fullName}?`)) deleteMeeting.mutate(m.id);
  };

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

  const fixTimezone = useMutation({
    mutationFn: () => api.post('/meetings/admin/fix-timezone'),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['meetings'] });
      toast.success(`תוקנו ${res.data.fixed} פגישות — השעות מסונכרנות עכשיו`);
    },
    onError: () => toast.error('שגיאה בתיקון'),
  });

  const saved = () => {
    qc.invalidateQueries({ queryKey: ['meetings'] });
    setShowModal(false);
    setEditMeeting(null);
  };

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

      {/* One-time timezone fix banner */}
      <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-amber-800 text-sm">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>אם השעות מוצגות לא נכון — לחץ לתיקון חד-פעמי</span>
        </div>
        <button
          onClick={() => fixTimezone.mutate()}
          disabled={fixTimezone.isPending}
          className="btn-secondary text-xs px-3 py-1.5 flex-shrink-0 border-amber-300 text-amber-800 hover:bg-amber-100"
        >
          {fixTimezone.isPending ? 'מתקן...' : 'תקן שעות'}
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
                    <div key={m.id} className={clsx('card flex items-center gap-4 flex-wrap', past ? 'opacity-70' : '')}>
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
                        <button onClick={() => setEditMeeting(m)}
                          className="btn-ghost p-1.5 rounded-lg text-slate-400 hover:text-primary-600">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(m)}
                          className="btn-ghost p-1.5 rounded-lg text-slate-400 hover:text-red-500">
                          <Trash2 className="w-4 h-4" />
                        </button>
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
        <MeetingModal onClose={() => setShowModal(false)} onSaved={saved} />
      )}
      {editMeeting && (
        <MeetingModal meeting={editMeeting} onClose={() => setEditMeeting(null)} onSaved={saved} />
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
