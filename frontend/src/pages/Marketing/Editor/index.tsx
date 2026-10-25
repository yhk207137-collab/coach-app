import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { ArrowRight, Undo2, Redo2, Eye, Monitor, Smartphone, Loader2, CheckCircle2, Save, LayoutTemplate } from 'lucide-react';
import api from '../../../services/api';
import { BLOCKS, Block, Campaign, Design, DesignSettings, DomainStatus, MarketingSettings, RICH_TYPES, newId } from '../shared';
import Canvas from './Canvas';
import Panel from './Panel';
import PreviewModal from './PreviewModal';
import SendStep, { SendMeta } from './SendStep';
import MediaPicker from '../MediaPicker';
import { FormatToolbar } from './RichText';

type SaveState = 'saved' | 'dirty' | 'saving' | 'error';

export default function CampaignEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: campaign, isLoading, error } = useQuery<Campaign>({
    queryKey: ['campaign', id],
    queryFn: () => api.get(`/marketing/campaigns/${id}`).then((r) => r.data),
    staleTime: Infinity,
  });
  const { data: mkt } = useQuery<{ settings: MarketingSettings; domain: DomainStatus }>({
    queryKey: ['marketing-settings'],
    queryFn: () => api.get('/marketing/settings').then((r) => r.data),
  });

  const [design, setDesign] = useState<Design | null>(null);
  const [meta, setMeta] = useState<SendMeta | null>(null);
  const [step, setStep] = useState<'design' | 'send'>('design');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobile, setMobile] = useState(false);
  const [preview, setPreview] = useState(false);
  const [pickFor, setPickFor] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const past = useRef<Design[]>([]);
  const future = useRef<Design[]>([]);
  const lastSnapshot = useRef<number>(0);
  const saveTimer = useRef<number>();
  const pending = useRef<{ design?: Design; meta?: Partial<SendMeta> }>({});

  const readOnly = campaign ? ['SENDING', 'SENT'].includes(campaign.status) : false;

  useEffect(() => {
    if (campaign && !design) {
      setDesign(campaign.design);
      setMeta({
        name: campaign.name, subject: campaign.subject, preheader: campaign.preheader, fromName: campaign.fromName,
        markAsAd: campaign.markAsAd, audienceTags: campaign.audienceTags,
      });
    }
  }, [campaign, design]);

  const flush = useCallback(async () => {
    window.clearTimeout(saveTimer.current);
    const body = { ...(pending.current.meta || {}), ...(pending.current.design ? { design: pending.current.design } : {}) };
    pending.current = {};
    if (Object.keys(body).length === 0 || readOnly) return;
    setSaveState('saving');
    try {
      await api.put(`/marketing/campaigns/${id}`, body);
      setSaveState('saved');
      qc.invalidateQueries({ queryKey: ['campaigns'] });
    } catch (err: any) {
      setSaveState('error');
      toast.error(err.response?.data?.error || 'השמירה נכשלה');
    }
  }, [id, qc, readOnly]);

  const scheduleSave = useCallback((patch: { design?: Design; meta?: Partial<SendMeta> }) => {
    if (patch.design) pending.current.design = patch.design;
    if (patch.meta) pending.current.meta = { ...(pending.current.meta || {}), ...patch.meta };
    setSaveState('dirty');
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => void flush(), 1200);
  }, [flush]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (pending.current.design || pending.current.meta) { void flush(); e.preventDefault(); } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [flush]);

  const commit = useCallback((next: Design, coalesce = false) => {
    setDesign((prev) => {
      if (prev && (!coalesce || Date.now() - lastSnapshot.current > 800)) {
        past.current = [...past.current.slice(-60), prev];
        future.current = [];
      }
      lastSnapshot.current = Date.now();
      return next;
    });
    scheduleSave({ design: next });
  }, [scheduleSave]);

  const updateMeta = (patch: Partial<SendMeta>) => {
    setMeta((m) => (m ? { ...m, ...patch } : m));
    scheduleSave({ meta: patch });
  };

  const undo = () => {
    if (!design || !past.current.length) return;
    const prev = past.current.pop()!;
    future.current.push(design);
    setDesign(prev);
    scheduleSave({ design: prev });
  };
  const redo = () => {
    if (!design || !future.current.length) return;
    const next = future.current.pop()!;
    past.current.push(design);
    setDesign(next);
    scheduleSave({ design: next });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(t.tagName)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) { e.preventDefault(); removeBlock(selectedId); }
      if (e.key === 'Escape') setSelectedId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const blocks = design?.blocks || [];
  const selected = useMemo(() => blocks.find((b) => b.id === selectedId) || null, [blocks, selectedId]);

  const updateBlock = (bid: string, patch: Partial<Block>) => {
    if (!design || readOnly) return;
    const isText = 'html' in patch || 'text' in patch;
    commit({ ...design, blocks: design.blocks.map((b) => (b.id === bid ? { ...b, ...patch } : b)) }, isText);
  };
  const insertBlock = (type: string, index: number) => {
    if (!design || readOnly) return;
    const def = BLOCKS.find((b) => b.type === type);
    if (!def) return;
    const block = def.create(design.settings.brand);
    const arr = [...design.blocks];
    arr.splice(Math.max(0, Math.min(index, arr.length)), 0, block);
    commit({ ...design, blocks: arr });
    setSelectedId(block.id);
    if ((type === 'image' || type === 'logo' || type === 'imageText')) setPickFor(block.id);
  };
  const addAfterSelected = (type: string) => {
    const idx = selectedId ? blocks.findIndex((b) => b.id === selectedId) + 1 : blocks.length;
    insertBlock(type, idx);
  };
  const moveBlock = (bid: string, to: number) => {
    if (!design || readOnly) return;
    const from = design.blocks.findIndex((b) => b.id === bid);
    if (from < 0 || to < 0 || to > design.blocks.length) return;
    const target = to > from ? to - 1 : to;
    if (target === from) return;
    const arr = [...design.blocks];
    const [item] = arr.splice(from, 1);
    arr.splice(target, 0, item);
    commit({ ...design, blocks: arr });
  };
  const duplicateBlock = (bid: string) => {
    if (!design || readOnly) return;
    const idx = design.blocks.findIndex((b) => b.id === bid);
    const copy = { ...design.blocks[idx], id: newId() };
    const arr = [...design.blocks];
    arr.splice(idx + 1, 0, copy);
    commit({ ...design, blocks: arr });
    setSelectedId(copy.id);
  };
  function removeBlock(bid: string) {
    if (!design || readOnly) return;
    commit({ ...design, blocks: design.blocks.filter((b) => b.id !== bid) });
    setSelectedId(null);
  }
  const updateSettings = (patch: Partial<DesignSettings>) => {
    if (!design || readOnly) return;
    commit({ ...design, settings: { ...design.settings, ...patch } });
  };

  const saveAsTemplate = async () => {
    const name = prompt('שם לתבנית החדשה:', meta?.name || '');
    if (!name || !design) return;
    try {
      await api.post('/marketing/templates', { name, design });
      toast.success('התבנית נשמרה. אפשר לבחור בה כשיוצרים קמפיין חדש.');
      qc.invalidateQueries({ queryKey: ['marketing-templates'] });
    } catch {
      toast.error('שמירת התבנית נכשלה');
    }
  };

  const goBack = async () => {
    await flush();
    navigate(campaign?.kind === 'WELCOME' ? '/marketing/campaigns' : readOnly ? `/marketing/campaigns/${id}/report` : '/marketing/campaigns');
  };

  if (isLoading || (!design && !error)) {
    return <div className="h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary-500" /></div>;
  }
  if (error || !campaign || !design || !meta) {
    return <div className="h-screen flex items-center justify-center text-slate-500">הקמפיין לא נמצא</div>;
  }

  const missingLinks = blocks.filter((b) => b.type === 'button' && !String(b.url || '').trim()).length;
  const emptyImages = blocks.filter((b) => ['image', 'logo', 'imageText'].includes(b.type) && !b.src).length;
  const richSelected = selected && RICH_TYPES.includes(selected.type);

  return (
    <div className="h-screen flex flex-col bg-slate-100" dir="rtl">
      <header className="h-16 flex-shrink-0 bg-white border-b border-slate-200 flex items-center gap-3 px-4">
        <button type="button" onClick={goBack} className="btn-ghost p-2" title="חזרה"><ArrowRight className="w-5 h-5" /></button>
        <input
          value={meta.name}
          onChange={(e) => updateMeta({ name: e.target.value })}
          className="font-semibold text-slate-900 bg-transparent rounded-lg px-2 py-1 hover:bg-slate-50 focus:bg-slate-50 outline-none min-w-0 w-48 lg:w-72"
          title="שם הקמפיין (רק אתם רואים אותו)"
        />
        <div className="flex bg-slate-100 rounded-xl p-1 gap-1 mx-auto">
          <button type="button" onClick={() => setStep('design')} className={clsx('px-4 py-1.5 rounded-lg text-sm font-medium', step === 'design' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500')}>1. עיצוב</button>
          <button type="button" onClick={async () => { await flush(); setStep('send'); }} className={clsx('px-4 py-1.5 rounded-lg text-sm font-medium', step === 'send' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500')}>
            2. {campaign.kind === 'WELCOME' ? 'הגדרות והפעלה' : 'הגדרות ושליחה'}
          </button>
        </div>
        <span className="hidden md:flex items-center gap-1 text-xs text-slate-400 w-20">
          {readOnly ? 'נשלח · לקריאה בלבד' : saveState === 'saving' ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> שומר…</> : saveState === 'dirty' ? 'לא נשמר' : saveState === 'error' ? <span className="text-red-500">שגיאה</span> : <><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> נשמר</>}
        </span>
        {step === 'design' && (
          <>
            <button type="button" onClick={undo} disabled={!past.current.length} className="btn-ghost p-2 disabled:opacity-30" title="ביטול (Ctrl+Z)"><Undo2 className="w-4 h-4" /></button>
            <button type="button" onClick={redo} disabled={!future.current.length} className="btn-ghost p-2 disabled:opacity-30" title="חזרה (Ctrl+Y)"><Redo2 className="w-4 h-4" /></button>
            <div className="hidden sm:flex bg-slate-100 rounded-xl p-1 gap-1">
              <button type="button" onClick={() => setMobile(false)} className={clsx('p-1.5 rounded-lg', !mobile ? 'bg-white shadow-sm' : 'text-slate-500')} title="תצוגת מחשב"><Monitor className="w-4 h-4" /></button>
              <button type="button" onClick={() => setMobile(true)} className={clsx('p-1.5 rounded-lg', mobile ? 'bg-white shadow-sm' : 'text-slate-500')} title="תצוגת טלפון"><Smartphone className="w-4 h-4" /></button>
            </div>
            <button type="button" onClick={saveAsTemplate} className="btn-ghost text-sm hidden lg:inline-flex" title="שמירה כתבנית לשימוש חוזר"><LayoutTemplate className="w-4 h-4" /> שמירה כתבנית</button>
          </>
        )}
        <button type="button" onClick={async () => { await flush(); setPreview(true); }} className="btn-secondary text-sm"><Eye className="w-4 h-4" /> תצוגה מקדימה</button>
        {step === 'design' && (
          <button type="button" onClick={async () => { await flush(); setStep('send'); }} className="btn-primary text-sm">
            <Save className="w-4 h-4" /> {campaign.kind === 'WELCOME' ? 'המשך להפעלה' : 'המשך לשליחה'}
          </button>
        )}
      </header>

      {step === 'design' ? (
        <div className="flex-1 flex min-h-0">
          <aside className="w-80 flex-shrink-0 bg-white border-l border-slate-200 overflow-y-auto">
            {readOnly ? (
              <div className="p-5 text-sm text-slate-500">הקמפיין כבר נשלח, ולכן אי אפשר לשנות אותו. אפשר לשכפל אותו מרשימת הקמפיינים ולערוך את העותק.</div>
            ) : (
              <Panel
                design={design}
                selected={selected}
                onAdd={addAfterSelected}
                onUpdate={updateBlock}
                onSettings={updateSettings}
                onDeselect={() => setSelectedId(null)}
                onRemove={removeBlock}
                onPickImage={setPickFor}
              />
            )}
          </aside>
          <main className="flex-1 overflow-y-auto relative">
            {richSelected && !readOnly && (
              <div className="sticky top-3 z-40 flex justify-center pointer-events-none">
                <div className="pointer-events-auto"><FormatToolbar /></div>
              </div>
            )}
            <div className={clsx(readOnly && 'pointer-events-none')}>
              <Canvas
                design={design}
                settings={mkt?.settings}
                selectedId={selectedId}
                mobile={mobile}
                onSelect={setSelectedId}
                onUpdate={updateBlock}
                onMove={moveBlock}
                onInsert={insertBlock}
                onDuplicate={duplicateBlock}
                onRemove={removeBlock}
                onPickImage={setPickFor}
              />
            </div>
          </main>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {readOnly ? (
            <div className="max-w-xl mx-auto p-10 text-center text-slate-500">הקמפיין כבר נשלח. <button className="text-primary-600 underline" onClick={() => navigate(`/marketing/campaigns/${id}/report`)}>לדוח הקמפיין</button></div>
          ) : (
            <SendStep
              campaign={campaign}
              meta={meta}
              onMeta={updateMeta}
              flush={flush}
              settings={mkt?.settings}
              domain={mkt?.domain}
              missingLinks={missingLinks}
              emptyImages={emptyImages}
            />
          )}
        </div>
      )}

      {preview && (
        <PreviewModal campaignId={campaign.id} design={design} subject={meta.subject} preheader={meta.preheader} markAsAd={meta.markAsAd} onClose={() => setPreview(false)} />
      )}
      {pickFor && (
        <MediaPicker
          onClose={() => setPickFor(null)}
          onSelect={(item) => updateBlock(pickFor, { src: item.url })}
        />
      )}
    </div>
  );
}
