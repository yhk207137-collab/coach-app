import { useEffect, useState } from 'react';
import { X, Printer } from 'lucide-react';
import type { Project } from './index';

interface Props {
  project: Project;
  onClose: () => void;
}

const statusLabel: Record<string, string> = {
  PLANNING: 'תכנון', ACTIVE: 'פעיל', ON_HOLD: 'מושהה', COMPLETED: 'הושלם', CANCELLED: 'בוטל',
};

const taskStatusLabel: Record<string, string> = {
  PENDING: 'ממתין', IN_PROGRESS: 'בביצוע', COMPLETED: 'הושלם',
};

export default function ProjectPrint({ project, onClose }: Props) {
  const [logo, setLogo] = useState('');

  useEffect(() => {
    try { setLogo(localStorage.getItem('companyLogo') ?? ''); } catch {}
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const today = new Date().toLocaleDateString('he-IL');
  const allTasks = [
    ...project.tasks,
    ...project.subProjects.flatMap(sp => sp.tasks),
  ];
  const doneCount = allTasks.filter(t => t.status === 'COMPLETED').length;
  const progress = allTasks.length > 0 ? Math.round((doneCount / allTasks.length) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 bg-gray-100 flex flex-col" dir="rtl">
      <div className="print:hidden flex items-center justify-between px-6 py-3 bg-white border-b shadow-sm">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="flex items-center gap-1.5 text-gray-500 hover:text-gray-800 text-sm">
            <X className="w-4 h-4" /> חזרה
          </button>
          <span className="text-gray-300">|</span>
          <span className="text-sm text-gray-600 font-medium">דוח פרויקט — {project.name}</span>
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
                <div className="text-xs text-purple-300 uppercase tracking-widest">דוח פרויקט</div>
                <div className="text-lg font-bold mt-1">{project.name}</div>
                <div className="mt-1 inline-block px-3 py-0.5 rounded-full text-xs font-medium bg-white/10 text-white/80">
                  {statusLabel[project.status]}
                </div>
              </div>
            </div>
          </div>

          {/* Meta */}
          <div className="px-10 py-5 border-b border-gray-100 grid grid-cols-3 gap-6 text-sm">
            <div>
              <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">לקוח</div>
              <div className="font-semibold text-gray-800">{project.client.fullName}</div>
              {project.client.businessName && <div className="text-gray-500 text-xs">{project.client.businessName}</div>}
            </div>
            {project.startDate && (
              <div>
                <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">תאריך התחלה</div>
                <div className="font-semibold text-gray-800">{new Date(project.startDate).toLocaleDateString('he-IL')}</div>
              </div>
            )}
            {project.budget && (
              <div>
                <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">תקציב</div>
                <div className="font-semibold text-gray-800">₪{project.budget.toLocaleString('he-IL')}</div>
              </div>
            )}
          </div>

          <div className="px-10 py-6 space-y-6">
            {/* Progress bar */}
            {allTasks.length > 0 && (
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="font-medium text-gray-700">התקדמות כללית</span>
                  <span className="font-bold text-purple-700">{progress}%</span>
                </div>
                <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${progress}%`, background: 'linear-gradient(90deg, #7c3aed, #4c1d95)' }}
                  />
                </div>
                <div className="text-xs text-gray-400 mt-1">{doneCount} מתוך {allTasks.length} משימות הושלמו</div>
              </div>
            )}

            {/* Description */}
            {project.description && (
              <div>
                <div className="text-xs font-semibold text-purple-700 uppercase tracking-wide mb-1">תיאור הפרויקט</div>
                <div className="bg-gray-50 rounded-xl px-4 py-3 text-sm text-gray-800 whitespace-pre-wrap">{project.description}</div>
              </div>
            )}

            {/* Goals */}
            {project.goals && (
              <div>
                <div className="text-xs font-semibold text-purple-700 uppercase tracking-wide mb-1">מטרות</div>
                <div className="bg-gray-50 rounded-xl px-4 py-3 text-sm text-gray-800 whitespace-pre-wrap">{project.goals}</div>
              </div>
            )}

            {/* Strategy */}
            {project.strategy && (
              <div>
                <div className="text-xs font-semibold text-purple-700 uppercase tracking-wide mb-1">אסטרטגיה ושיווק</div>
                <div className="bg-gray-50 rounded-xl px-4 py-3 text-sm text-gray-800 whitespace-pre-wrap">{project.strategy}</div>
              </div>
            )}

            {/* Project tasks */}
            {project.tasks.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-purple-700 uppercase tracking-wide mb-2">משימות ראשיות</div>
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: '#f5f3ff' }}>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-purple-700 rounded-r-lg">משימה</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-purple-700 rounded-l-lg">סטטוס</th>
                    </tr>
                  </thead>
                  <tbody>
                    {project.tasks.map((t, i) => (
                      <tr key={t.id} className={i % 2 === 0 ? '' : 'bg-gray-50'}>
                        <td className="px-3 py-2 text-gray-800">{t.title}</td>
                        <td className="px-3 py-2">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            t.status === 'COMPLETED' ? 'bg-green-100 text-green-700' :
                            t.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-700' :
                            'bg-gray-100 text-gray-600'
                          }`}>{taskStatusLabel[t.status]}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Sub-projects */}
            {project.subProjects.map(sp => (
              <div key={sp.id}>
                <div className="flex items-center gap-2 mb-2">
                  <div className="text-xs font-semibold text-purple-700 uppercase tracking-wide">תת-פרויקט: {sp.name}</div>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-purple-50 text-purple-600">{statusLabel[sp.status]}</span>
                </div>
                {sp.description && <div className="text-xs text-gray-500 mb-2">{sp.description}</div>}
                {sp.tasks.length > 0 && (
                  <table className="w-full text-sm">
                    <tbody>
                      {sp.tasks.map((t, i) => (
                        <tr key={t.id} className={i % 2 === 0 ? 'bg-gray-50' : ''}>
                          <td className="px-3 py-2 text-gray-800">{t.title}</td>
                          <td className="px-3 py-2">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                              t.status === 'COMPLETED' ? 'bg-green-100 text-green-700' :
                              t.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-700' :
                              'bg-gray-100 text-gray-600'
                            }`}>{taskStatusLabel[t.status]}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="px-10 py-6 border-t border-gray-100 text-center">
            <div className="text-xs text-gray-400">ליוי שיווק ופרסום • סוכנות שיווק ופרסום לעמותות</div>
            <div className="text-xs text-gray-300 mt-1">דוח זה הופק ב-{today}</div>
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
