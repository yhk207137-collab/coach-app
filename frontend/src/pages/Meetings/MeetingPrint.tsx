import { useEffect, useState } from 'react';
import { X, Printer } from 'lucide-react';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';
import type { Meeting } from '../../types';

interface Props {
  meeting: Meeting;
  onClose: () => void;
}

export default function MeetingPrint({ meeting, onClose }: Props) {
  const [logo, setLogo] = useState('');

  useEffect(() => {
    try { setLogo(localStorage.getItem('companyLogo') ?? ''); } catch {}
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const s = meeting.summary;
  const today = new Date().toLocaleDateString('he-IL');
  const meetingDate = format(new Date(meeting.date), "EEEE, d בMMMM yyyy, HH:mm", { locale: he });

  const sections = s && s.type === 'STRUCTURED' ? [
    { label: 'מטרת הפגישה', value: s.goal },
    { label: 'התקדמות מהפגישה הקודמת', value: s.progress },
    { label: 'אתגרים', value: s.challenges },
    { label: 'החלטות שהתקבלו', value: s.decisions },
    { label: 'מסקנות', value: s.conclusions },
    { label: 'הערות', value: s.notes },
  ].filter(x => x.value) : [];

  return (
    <div className="fixed inset-0 z-50 bg-gray-100 flex flex-col" dir="rtl">
      <div className="print:hidden flex items-center justify-between px-6 py-3 bg-white border-b shadow-sm">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="flex items-center gap-1.5 text-gray-500 hover:text-gray-800 text-sm">
            <X className="w-4 h-4" /> חזרה
          </button>
          <span className="text-gray-300">|</span>
          <span className="text-sm text-gray-600 font-medium">סיכום פגישה — {meeting.client?.fullName}</span>
        </div>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-xl hover:bg-purple-700 text-sm font-medium"
        >
          <Printer className="w-4 h-4" /> הדפס / שמור PDF
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-8 px-4 flex justify-center">
        <div
          className="bg-white shadow-xl w-full max-w-3xl rounded-2xl print:rounded-none print:shadow-none print:max-w-none"
          style={{ fontFamily: "'Segoe UI', 'Arial Hebrew', Arial, sans-serif" }}
        >
          {/* Header */}
          <div style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #4c1d95 100%)' }} className="rounded-t-2xl print:rounded-none px-10 py-8 text-white">
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-4">
                {logo && <img src={logo} alt="לוגו" className="h-12 object-contain rounded-lg bg-white/10 px-2 py-1" />}
                <div>
                  <div className="text-2xl font-bold tracking-wide">ליוי שיווק ופרסום</div>
                  <div className="text-purple-200 text-sm mt-1">סוכנות שיווק ופרסום לעמותות</div>
                </div>
              </div>
              <div className="text-left">
                <div className="text-xs text-purple-300 uppercase tracking-widest">סיכום פגישה</div>
                <div className="text-lg font-bold mt-1">{meeting.client?.fullName}</div>
                <div className="text-sm text-purple-200 mt-0.5">{meeting.type}</div>
              </div>
            </div>
          </div>

          {/* Meta strip */}
          <div className="px-10 py-5 border-b border-gray-100 grid grid-cols-3 gap-6 text-sm">
            <div>
              <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">תאריך פגישה</div>
              <div className="font-semibold text-gray-800">{meetingDate}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">משך</div>
              <div className="font-semibold text-gray-800">{meeting.duration} דקות</div>
            </div>
            <div>
              <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">תאריך הפקה</div>
              <div className="font-semibold text-gray-800">{today}</div>
            </div>
          </div>

          {/* Summary content */}
          <div className="px-10 py-6 space-y-5">
            {s ? (
              s.type === 'STRUCTURED' ? (
                sections.map(sec => (
                  <div key={sec.label}>
                    <div className="text-xs font-semibold text-purple-700 uppercase tracking-wide mb-1">{sec.label}</div>
                    <div className="bg-gray-50 rounded-xl px-4 py-3 text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{sec.value}</div>
                  </div>
                ))
              ) : (
                <div>
                  <div className="text-xs font-semibold text-purple-700 uppercase tracking-wide mb-1">סיכום</div>
                  <div className="bg-gray-50 rounded-xl px-4 py-3 text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{s.freeText}</div>
                </div>
              )
            ) : (
              <div className="text-center py-10 text-gray-400 text-sm">לפגישה זו אין סיכום עדיין</div>
            )}

            {/* Tags */}
            {s?.tags && s.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-2">
                {s.tags.map(t => (
                  <span key={t.id} className="px-3 py-1 bg-purple-50 text-purple-700 rounded-full text-xs font-medium">#{t.name}</span>
                ))}
              </div>
            )}

            {/* Meeting notes */}
            {meeting.notes && (
              <div>
                <div className="text-xs font-semibold text-purple-700 uppercase tracking-wide mb-1">הערות לפגישה</div>
                <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 text-sm text-amber-800 whitespace-pre-wrap">{meeting.notes}</div>
              </div>
            )}
          </div>

          {/* Signature area */}
          <div className="px-10 pb-8">
            <div className="border-t border-gray-200 pt-8 grid grid-cols-2 gap-12">
              <div>
                <div className="text-xs text-gray-400 mb-6">חתימת המאמן</div>
                <div className="border-b border-gray-300 h-8 w-full" />
              </div>
              <div>
                <div className="text-xs text-gray-400 mb-6">חתימת הלקוח</div>
                <div className="border-b border-gray-300 h-8 w-full" />
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-10 py-6 border-t border-gray-100 text-center">
            <div className="text-xs text-gray-400">ליוי שיווק ופרסום • סוכנות שיווק ופרסום לעמותות</div>
            <div className="text-xs text-gray-300 mt-1">מסמך זה הופק ב-{today}</div>
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          body > *:not(.fixed) { display: none !important; }
          .fixed { position: static !important; background: white !important; }
          .print\\:hidden { display: none !important; }
        }
      `}</style>
    </div>
  );
}
