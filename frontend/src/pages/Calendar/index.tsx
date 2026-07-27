import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, ChevronLeft, Plus } from 'lucide-react';
import api from '../../services/api';
import { Meeting } from '../../types';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isSameMonth, addMonths, subMonths, startOfWeek, endOfWeek } from 'date-fns';
import { he } from 'date-fns/locale';
import clsx from 'clsx';
import MeetingModal from '../Meetings/MeetingModal';
import { useNavigate } from 'react-router-dom';

type ViewMode = 'month' | 'week' | 'day';

const HEBREW_DAYS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];
const HOURS = Array.from({ length: 14 }, (_, i) => i + 7); // 7:00 - 20:00

export default function CalendarPage() {
  const [current, setCurrent] = useState(new Date());
  const [view, setView] = useState<ViewMode>('month');
  const [showMeeting, setShowMeeting] = useState(false);
  const navigate = useNavigate();

  const monthStart = startOfMonth(current);
  const monthEnd = endOfMonth(current);

  const { data: meetings = [] } = useQuery<Meeting[]>({
    queryKey: ['meetings-calendar', current.getFullYear(), current.getMonth()],
    queryFn: () => api.get(`/meetings?from=${monthStart.toISOString()}&to=${monthEnd.toISOString()}`).then(r => r.data),
  });

  const getMeetingsForDay = (day: Date) =>
    meetings.filter(m => isSameDay(new Date(m.date), day));

  const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const calDays = eachDayOfInterval({ start: calStart, end: calEnd });

  // Week view
  const weekStart = startOfWeek(current, { weekStartsOn: 0 });
  const weekEnd = endOfWeek(current, { weekStartsOn: 0 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

  const goBack = () => {
    if (view === 'month') setCurrent(subMonths(current, 1));
    else if (view === 'week') setCurrent(new Date(current.getTime() - 7 * 86400000));
    else setCurrent(new Date(current.getTime() - 86400000));
  };

  const goForward = () => {
    if (view === 'month') setCurrent(addMonths(current, 1));
    else if (view === 'week') setCurrent(new Date(current.getTime() + 7 * 86400000));
    else setCurrent(new Date(current.getTime() + 86400000));
  };

  const titleLabel = () => {
    if (view === 'month') return format(current, 'MMMM yyyy', { locale: he });
    if (view === 'week') return `${format(weekStart, 'd/M', { locale: he })} – ${format(weekEnd, 'd/M/yyyy', { locale: he })}`;
    return format(current, 'EEEE, d בMMMM yyyy', { locale: he });
  };

  const meetingColor = (m: Meeting) => {
    const hour = new Date(m.date).getHours();
    if (hour < 10) return 'bg-blue-100 text-blue-800';
    if (hour < 14) return 'bg-violet-100 text-violet-800';
    return 'bg-emerald-100 text-emerald-800';
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">יומן</h1>
          <p className="page-subtitle">ניהול פגישות ולוח זמנים</p>
        </div>
        <button onClick={() => setShowMeeting(true)} className="btn-primary">
          <Plus className="w-4 h-4" /> פגישה חדשה
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button onClick={goBack} className="btn-secondary p-2"><ChevronRight className="w-4 h-4" /></button>
          <button onClick={() => setCurrent(new Date())} className="btn-secondary text-sm px-3">היום</button>
          <button onClick={goForward} className="btn-secondary p-2"><ChevronLeft className="w-4 h-4" /></button>
          <span className="font-semibold text-slate-800 mr-2">{titleLabel()}</span>
        </div>
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
          {(['month', 'week', 'day'] as ViewMode[]).map(v => (
            <button key={v} onClick={() => setView(v)}
              className={clsx('px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
                view === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700')}>
              {v === 'month' ? 'חודש' : v === 'week' ? 'שבוע' : 'יום'}
            </button>
          ))}
        </div>
      </div>

      {/* Month view */}
      {view === 'month' && (
        <div className="card p-0 overflow-hidden">
          <div className="grid grid-cols-7 bg-slate-50 border-b border-slate-100">
            {HEBREW_DAYS.map(d => (
              <div key={d} className="py-2 text-center text-xs font-semibold text-slate-500">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {calDays.map((day, i) => {
              const dayMeetings = getMeetingsForDay(day);
              const isToday = isSameDay(day, new Date());
              const isCurrentMonth = isSameMonth(day, current);
              return (
                <div key={i} className={clsx(
                  'min-h-[90px] p-1.5 border-b border-l border-slate-100 last:border-l-0',
                  !isCurrentMonth && 'bg-slate-50',
                )}>
                  <div className={clsx(
                    'w-7 h-7 flex items-center justify-center rounded-full text-sm mb-1 font-medium',
                    isToday ? 'bg-primary-600 text-white' : isCurrentMonth ? 'text-slate-700' : 'text-slate-300',
                  )}>
                    {format(day, 'd')}
                  </div>
                  <div className="space-y-0.5">
                    {dayMeetings.slice(0, 3).map(m => (
                      <button key={m.id} onClick={() => navigate(`/meetings`)}
                        className={clsx('w-full text-right text-xs px-1.5 py-0.5 rounded truncate', meetingColor(m))}>
                        {format(new Date(m.date), 'HH:mm')} {m.client?.fullName}
                      </button>
                    ))}
                    {dayMeetings.length > 3 && (
                      <p className="text-xs text-slate-400 px-1">+{dayMeetings.length - 3} נוספות</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Week view */}
      {view === 'week' && (
        <div className="card p-0 overflow-hidden">
          <div className="grid grid-cols-8 bg-slate-50 border-b border-slate-100">
            <div className="py-2 text-xs text-slate-400 text-center">שעה</div>
            {weekDays.map((day, i) => (
              <div key={i} className={clsx('py-2 text-center text-xs font-semibold',
                isSameDay(day, new Date()) ? 'text-primary-600' : 'text-slate-500')}>
                <div>{HEBREW_DAYS[i]}</div>
                <div className={clsx('w-7 h-7 mx-auto flex items-center justify-center rounded-full mt-0.5',
                  isSameDay(day, new Date()) ? 'bg-primary-600 text-white' : 'text-slate-700')}>
                  {format(day, 'd')}
                </div>
              </div>
            ))}
          </div>
          <div className="overflow-y-auto max-h-[500px]">
            {HOURS.map(hour => (
              <div key={hour} className="grid grid-cols-8 border-b border-slate-100">
                <div className="py-3 text-xs text-slate-400 text-center">{hour}:00</div>
                {weekDays.map((day, di) => {
                  const hourMeetings = getMeetingsForDay(day).filter(m => new Date(m.date).getHours() === hour);
                  return (
                    <div key={di} className="border-r border-slate-100 min-h-[48px] p-0.5">
                      {hourMeetings.map(m => (
                        <div key={m.id} className={clsx('text-xs rounded p-1 mb-0.5 truncate', meetingColor(m))}>
                          {m.client?.fullName}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Day view */}
      {view === 'day' && (
        <div className="card p-0 overflow-hidden">
          <div className="bg-slate-50 border-b border-slate-100 px-4 py-3">
            <p className="font-semibold text-slate-700">{format(current, 'EEEE, d בMMMM', { locale: he })}</p>
          </div>
          <div className="overflow-y-auto max-h-[500px]">
            {HOURS.map(hour => {
              const hourMeetings = getMeetingsForDay(current).filter(m => new Date(m.date).getHours() === hour);
              return (
                <div key={hour} className="flex border-b border-slate-100">
                  <div className="w-16 flex-shrink-0 py-3 text-xs text-slate-400 text-center">{hour}:00</div>
                  <div className="flex-1 min-h-[56px] p-1 space-y-1">
                    {hourMeetings.map(m => (
                      <div key={m.id} className={clsx('rounded-xl p-2 text-sm', meetingColor(m))}>
                        <div className="font-medium">{m.client?.fullName}</div>
                        <div className="text-xs opacity-75">{format(new Date(m.date), 'HH:mm')} · {m.duration} דקות · {m.type}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showMeeting && <MeetingModal onClose={() => setShowMeeting(false)} onSaved={() => { setShowMeeting(false); }} />}
    </div>
  );
}
