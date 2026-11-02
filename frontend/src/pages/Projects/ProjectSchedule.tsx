import { differenceInCalendarDays, format } from 'date-fns';
import { CalendarClock } from 'lucide-react';
import clsx from 'clsx';
import type { Project } from './index';

export const calendarDaysLeft = (date: string) => differenceInCalendarDays(new Date(date), new Date());

const inDays = (n: number) => (n === 0 ? 'מסתיים היום' : n === 1 ? 'מסתיים מחר' : n === 2 ? 'נשארו יומיים' : `נשארו ${n} ימים`);
const lateBy = (n: number) => (n === 1 ? 'איחור של יום' : n === 2 ? 'איחור של יומיים' : `איחור של ${n} ימים`);

// Start and end dates, how much of the time has gone, and whether the work is keeping up.
export default function ProjectSchedule({ project: p, compact }: { project: Project; compact?: boolean }) {
  if (!p.startDate && !p.endDate) {
    return <p className={clsx('text-xs text-gray-400', compact ? 'mt-1.5' : 'mt-3')}>עוד לא נקבעו תאריכי התחלה וסיום. בעריכת הפרויקט קובעים אותם, ואז מגיעות תזכורות.</p>;
  }

  const running = p.status === 'PLANNING' || p.status === 'ACTIVE';
  const left = p.endDate ? calendarDaysLeft(p.endDate) : null;
  const allTasks = [...p.tasks, ...p.subProjects.flatMap((s) => s.tasks)];
  const done = allTasks.filter((t) => t.status === 'COMPLETED').length;
  const workPct = allTasks.length ? Math.round((done / allTasks.length) * 100) : null;
  const span = p.startDate && p.endDate ? differenceInCalendarDays(new Date(p.endDate), new Date(p.startDate)) : 0;
  const timePct = span > 0 ? Math.min(100, Math.max(0, Math.round((differenceInCalendarDays(new Date(), new Date(p.startDate!)) / span) * 100))) : null;
  const behind = running && left !== null && left >= 0 && timePct !== null && workPct !== null && timePct >= 25 && timePct - workPct >= 25;

  const tone = !running || left === null ? 'text-gray-500'
    : left <= 2 ? 'text-red-600'
    : left <= 7 || behind ? 'text-amber-700'
    : 'text-gray-600';
  const barTone = left !== null && running && left <= 2 ? 'bg-red-500' : left !== null && running && (left <= 7 || behind) ? 'bg-amber-500' : 'bg-primary-500';

  const dates = (
    <span className="text-xs text-gray-500" dir="rtl">
      {p.startDate ? format(new Date(p.startDate), 'd/M/yyyy') : 'ללא התחלה'} עד {p.endDate ? format(new Date(p.endDate), 'd/M/yyyy') : 'ללא סיום'}
    </span>
  );
  const status = running && left !== null && (
    <span className={clsx('text-xs font-semibold', tone)}>{left < 0 ? lateBy(-left) : inDays(left)}</span>
  );

  if (compact) {
    return (
      <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <CalendarClock className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
        {dates}
        {status}
        {behind && <span className="text-xs font-medium text-amber-700">מאחור בלוח הזמנים</span>}
      </p>
    );
  }

  return (
    <div className="mt-4 pt-4 border-t border-gray-50 space-y-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <CalendarClock className="w-4 h-4 text-gray-400 flex-shrink-0" />
        {dates}
        {status}
      </div>
      {timePct !== null && (
        <div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden" role="img" aria-label={`עברו ${timePct}% מהזמן`}>
            <div className={clsx('h-full rounded-full', barTone)} style={{ width: `${timePct}%` }} />
          </div>
          <p className={clsx('text-xs mt-1.5', behind ? 'font-medium text-amber-700' : 'text-gray-500')}>
            עברו {timePct}% מהזמן
            {workPct !== null ? ` והושלמו ${workPct}% מהמשימות` : ''}
            {behind ? '. הפרויקט מאחור בלוח הזמנים' : ''}
          </p>
        </div>
      )}
    </div>
  );
}
