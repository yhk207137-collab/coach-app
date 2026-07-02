import { useState, useRef } from 'react';
import { Sparkles, Mic, Upload, Loader2, CheckCircle, Edit3, Save } from 'lucide-react';
import api from '../../services/api';
import { useQuery } from '@tanstack/react-query';
import { Client } from '../../types';
import toast from 'react-hot-toast';
import SummaryModal from '../Meetings/SummaryModal';

type Step = 'upload' | 'transcribing' | 'review-transcript' | 'summarizing' | 'review-summary' | 'done';

export default function AIPage() {
  const [step, setStep] = useState<Step>('upload');
  const [transcript, setTranscript] = useState('');
  const [summary, setSummary] = useState<any>(null);
  const [selectedClient, setSelectedClient] = useState('');
  const [selectedMeeting, setSelectedMeeting] = useState('');
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: clients = [] } = useQuery<Client[]>({
    queryKey: ['clients'],
    queryFn: () => api.get('/clients?status=ACTIVE').then(r => r.data),
  });

  const client = clients.find(c => c.id === selectedClient);
  const meetings = (client as any)?.meetings ?? [];

  const handleFile = async (file: File) => {
    setStep('transcribing');
    const form = new FormData();
    form.append('audio', file);
    try {
      const { data } = await api.post('/ai/transcribe', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setTranscript(data.text);
      setStep('review-transcript');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'שגיאה בתמלול');
      setStep('upload');
    }
  };

  const handleSummarize = async () => {
    setStep('summarizing');
    try {
      const { data } = await api.post('/ai/summarize', {
        transcript,
        clientName: client?.fullName,
        meetingDate: new Date().toLocaleDateString('he-IL'),
      });
      setSummary(data);
      setStep('review-summary');
    } catch {
      toast.error('שגיאה ביצירת הסיכום');
      setStep('review-transcript');
    }
  };

  const reset = () => {
    setStep('upload');
    setTranscript('');
    setSummary(null);
    setSelectedClient('');
    setSelectedMeeting('');
  };

  return (
    <div className="max-w-3xl">
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-primary-500" /> AI – תמלול וסיכום
          </h1>
          <p className="page-subtitle">העלה הקלטת פגישה – המערכת תתמלל ותיצור סיכום מקצועי</p>
        </div>
      </div>

      {/* Progress */}
      <div className="flex items-center gap-2 mb-8">
        {(['upload', 'review-transcript', 'review-summary', 'done'] as Step[]).map((s, i) => {
          const labels = ['העלאה', 'בדיקת תמלול', 'סיכום AI', 'שמירה'];
          const done = ['upload', 'review-transcript', 'review-summary', 'done'].indexOf(step) > i;
          const active = step === s || (step === 'transcribing' && s === 'upload') || (step === 'summarizing' && s === 'review-transcript');
          return (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div className={`flex items-center gap-1.5 text-xs font-medium ${done ? 'text-primary-600' : active ? 'text-slate-900' : 'text-slate-400'}`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold
                  ${done ? 'bg-primary-500 text-white' : active ? 'bg-primary-100 text-primary-700' : 'bg-slate-100 text-slate-400'}`}>
                  {done ? '✓' : i + 1}
                </div>
                <span className="hidden sm:inline">{labels[i]}</span>
              </div>
              {i < 3 && <div className={`flex-1 h-px ${done ? 'bg-primary-300' : 'bg-slate-200'}`} />}
            </div>
          );
        })}
      </div>

      {/* Step: Upload */}
      {step === 'upload' && (
        <div className="card space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">לקוח</label>
              <select className="input" value={selectedClient} onChange={e => setSelectedClient(e.target.value)}>
                <option value="">בחר לקוח...</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.fullName}</option>)}
              </select>
            </div>
          </div>

          <div
            className="border-2 border-dashed border-slate-200 rounded-2xl p-12 text-center hover:border-primary-300 transition-colors cursor-pointer"
            onClick={() => fileRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
          >
            <Mic className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="font-medium text-slate-700">גרור קובץ אודיו לכאן</p>
            <p className="text-sm text-slate-500 mt-1">או לחץ לבחירת קובץ</p>
            <p className="text-xs text-slate-400 mt-3">MP3, WAV, MP4, M4A – עד 100MB</p>
            <input ref={fileRef} type="file" className="sr-only"
              accept="audio/*,video/mp4" onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
          </div>
        </div>
      )}

      {/* Step: Transcribing */}
      {step === 'transcribing' && (
        <div className="card text-center py-16">
          <Loader2 className="w-12 h-12 text-primary-500 animate-spin mx-auto mb-4" />
          <p className="font-semibold text-slate-800 text-lg">מתמלל את ההקלטה...</p>
          <p className="text-sm text-slate-500 mt-2">זה עשוי לקחת מספר דקות</p>
        </div>
      )}

      {/* Step: Review transcript */}
      {step === 'review-transcript' && (
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-900 flex items-center gap-2">
              <Edit3 className="w-4 h-4 text-primary-500" /> בדיקת תמלול
            </h2>
            <span className="badge bg-emerald-50 text-emerald-700">
              <CheckCircle className="w-3 h-3 mr-1" /> תמלול הושלם
            </span>
          </div>
          <textarea
            className="input min-h-[300px] resize-none font-mono text-sm leading-relaxed"
            value={transcript}
            onChange={e => setTranscript(e.target.value)}
          />
          <div className="flex gap-3">
            <button onClick={handleSummarize} className="btn-primary">
              <Sparkles className="w-4 h-4" /> צור סיכום AI
            </button>
            <button onClick={reset} className="btn-secondary">התחל מחדש</button>
          </div>
        </div>
      )}

      {/* Step: Summarizing */}
      {step === 'summarizing' && (
        <div className="card text-center py-16">
          <Sparkles className="w-12 h-12 text-primary-500 animate-pulse mx-auto mb-4" />
          <p className="font-semibold text-slate-800 text-lg">יוצר סיכום מקצועי...</p>
          <p className="text-sm text-slate-500 mt-2">GPT-4 מנתח את הפגישה</p>
        </div>
      )}

      {/* Step: Review summary */}
      {step === 'review-summary' && summary && (
        <div className="space-y-4">
          <div className="card">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-semibold text-slate-900 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary-500" /> סיכום שנוצר
              </h2>
              <button onClick={() => setStep('review-transcript')} className="btn-ghost text-xs">ערוך תמלול</button>
            </div>

            <div className="space-y-4">
              {[
                { key: 'goal', label: 'מטרת הפגישה' },
                { key: 'progress', label: 'התקדמות' },
                { key: 'challenges', label: 'אתגרים' },
                { key: 'decisions', label: 'החלטות' },
                { key: 'conclusions', label: 'מסקנות' },
                { key: 'notes', label: 'הערות' },
              ].map(({ key, label }) => summary[key] && (
                <div key={key}>
                  <label className="label">{label}</label>
                  <textarea
                    className="input min-h-[80px] resize-none"
                    value={summary[key]}
                    onChange={e => setSummary({ ...summary, [key]: e.target.value })}
                  />
                </div>
              ))}

              {summary.tasks?.length > 0 && (
                <div>
                  <label className="label">משימות שזוהו</label>
                  <div className="space-y-2">
                    {summary.tasks.map((t: any, i: number) => (
                      <div key={i} className="flex items-start gap-2 p-3 bg-slate-50 rounded-xl text-sm">
                        <CheckCircle className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="font-medium text-slate-800">{t.title}</p>
                          {t.description && <p className="text-slate-500 text-xs mt-0.5">{t.description}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-3">
            {selectedMeeting ? (
              <button onClick={() => setShowSummaryModal(true)} className="btn-primary">
                <Save className="w-4 h-4" /> שמור סיכום לפגישה
              </button>
            ) : (
              <div className="flex items-center gap-3 flex-1">
                <select className="input max-w-xs" value={selectedMeeting} onChange={e => setSelectedMeeting(e.target.value)}>
                  <option value="">בחר פגישה לשמירה...</option>
                  {meetings.map((m: any) => <option key={m.id} value={m.id}>{new Date(m.date).toLocaleDateString('he-IL')} – {m.type}</option>)}
                </select>
              </div>
            )}
            <button onClick={reset} className="btn-secondary">שמור בנפרד</button>
          </div>
        </div>
      )}

      {showSummaryModal && (
        <SummaryModal
          meetingId={selectedMeeting}
          prefill={summary}
          onClose={() => setShowSummaryModal(false)}
          onSaved={() => { setShowSummaryModal(false); setStep('done'); }}
        />
      )}

      {step === 'done' && (
        <div className="card text-center py-16">
          <CheckCircle className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
          <p className="font-bold text-slate-900 text-xl">הסיכום נשמר בהצלחה!</p>
          <p className="text-slate-500 mt-2">הסיכום הועבר לתיק הלקוח</p>
          <button onClick={reset} className="btn-primary mt-6">תמלול חדש</button>
        </div>
      )}
    </div>
  );
}
