import { useState } from 'react';
import clsx from 'clsx';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, AlignRight, AlignCenter, AlignLeft, ImagePlus, Trash2, Palette, LayoutTemplate, FileDown, CheckCircle2 } from 'lucide-react';
import api from '../../../services/api';
import { BLOCKS, Block, Design, DesignSettings, MarketingSettings, blockLabel, COLOR_SWATCHES } from '../shared';
import { DRAG_NEW } from './Canvas';

// Points a button at the uploaded guide; clicks on that link count as downloads in the tracking page.
function GuideLink({ url, onPick }: { url: string; onPick: (url: string) => void }) {
  const { data } = useQuery<{ settings: MarketingSettings }>({
    queryKey: ['marketing-settings'],
    queryFn: () => api.get('/marketing/settings').then((r) => r.data),
  });
  const guideUrl = data?.settings.guideUrl;
  if (!guideUrl) return null;
  if (url === guideUrl) {
    return <p className="flex items-center gap-1 text-xs text-emerald-600 mt-1.5"><CheckCircle2 className="w-3.5 h-3.5" /> הכפתור מוביל למדריך, וכל הורדה נספרת במעקב</p>;
  }
  return (
    <button type="button" onClick={() => onPick(guideUrl)} className="btn-ghost text-xs mt-1.5 px-2 py-1">
      <FileDown className="w-3.5 h-3.5" /> קישור להורדת המדריך
    </button>
  );
}

interface Props {
  design: Design;
  selected: Block | null;
  onAdd: (type: string) => void;
  onUpdate: (id: string, patch: Partial<Block>) => void;
  onSettings: (patch: Partial<DesignSettings>) => void;
  onDeselect: () => void;
  onRemove: (id: string) => void;
  onPickImage: (id: string) => void;
}

const Field = ({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) => (
  <div>
    <label className="label">{label}</label>
    {children}
    {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
  </div>
);

function Segmented<T extends string | number | boolean>({ value, options, onChange }: { value: T; options: { value: T; label: React.ReactNode }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex bg-slate-100 rounded-xl p-1 gap-1">
      {options.map((o) => (
        <button key={String(o.value)} type="button" onClick={() => onChange(o.value)}
          className={clsx('flex-1 py-1.5 text-sm rounded-lg font-medium transition-all flex items-center justify-center', value === o.value ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function ColorField({ label, value, onChange, allowEmpty }: { label: string; value?: string; onChange: (v: string | undefined) => void; allowEmpty?: string }) {
  return (
    <Field label={label}>
      <div className="flex items-center gap-1.5 flex-wrap">
        {allowEmpty && (
          <button type="button" onClick={() => onChange(undefined)}
            className={clsx('px-2 h-7 rounded-lg text-xs border', !value ? 'border-primary-500 text-primary-600 bg-primary-50' : 'border-slate-200 text-slate-500')}>{allowEmpty}</button>
        )}
        {COLOR_SWATCHES.map((c) => (
          <button key={c} type="button" onClick={() => onChange(c)}
            className={clsx('w-7 h-7 rounded-full border shadow-sm', value === c ? 'ring-2 ring-offset-1 ring-primary-500' : 'border-slate-200')}
            style={{ background: c }} />
        ))}
        <label className="relative w-7 h-7 rounded-full border border-slate-200 overflow-hidden cursor-pointer" title="צבע אחר"
          style={{ background: 'conic-gradient(#dc2626,#d97706,#059669,#2563eb,#6d28d9,#db2777,#dc2626)' }}>
          <input type="color" value={value || '#000000'} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" />
        </label>
      </div>
    </Field>
  );
}

const AlignField = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
  <Field label="יישור">
    <Segmented value={value || 'right'} onChange={onChange} options={[
      { value: 'right', label: <AlignRight className="w-4 h-4" /> },
      { value: 'center', label: <AlignCenter className="w-4 h-4" /> },
      { value: 'left', label: <AlignLeft className="w-4 h-4" /> },
    ]} />
  </Field>
);

const Range = ({ label, value, min, max, step = 1, suffix, onChange }: { label: string; value: number; min: number; max: number; step?: number; suffix: string; onChange: (v: number) => void }) => (
  <Field label={`${label}: ${value}${suffix}`}>
    <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-primary-600" />
  </Field>
);

function ImageFields({ b, onUpdate, onPickImage, showWidth = true }: { b: Block; onUpdate: Props['onUpdate']; onPickImage: Props['onPickImage']; showWidth?: boolean }) {
  return (
    <>
      <Field label="תמונה">
        {b.src ? (
          <div className="space-y-2">
            <img src={b.src} alt="" className="w-full max-h-40 object-contain rounded-xl border border-slate-200 bg-slate-50" />
            <div className="flex gap-2">
              <button type="button" onClick={() => onPickImage(b.id)} className="btn-secondary text-xs flex-1 justify-center">החלפה</button>
              <button type="button" onClick={() => onUpdate(b.id, { src: '' })} className="btn-ghost text-xs text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => onPickImage(b.id)} className="btn-primary w-full justify-center text-sm"><ImagePlus className="w-4 h-4" /> בחירת תמונה</button>
        )}
      </Field>
      <Field label="תיאור התמונה" hint="מוצג אם התמונה לא נטענת, ועוזר שהמייל לא ייחשב ספאם">
        <input className="input" value={b.alt || ''} onChange={(e) => onUpdate(b.id, { alt: e.target.value })} placeholder="למשל: מנהלי עמותות בסדנה" />
      </Field>
      <Field label="קישור בלחיצה על התמונה (לא חובה)">
        <input className="input" dir="ltr" value={b.link || ''} onChange={(e) => onUpdate(b.id, { link: e.target.value })} placeholder="https://..." />
      </Field>
      {showWidth && <Range label="רוחב" value={b.width ?? 100} min={20} max={100} step={5} suffix="%" onChange={(v) => onUpdate(b.id, { width: v })} />}
    </>
  );
}

function BlockSettings({ b, onUpdate, onPickImage }: { b: Block; onUpdate: Props['onUpdate']; onPickImage: Props['onPickImage'] }) {
  const up = (patch: Partial<Block>) => onUpdate(b.id, patch);
  switch (b.type) {
    case 'heading':
      return (
        <>
          <p className="text-sm text-slate-500 bg-slate-50 rounded-xl p-3">את הטקסט עורכים ישירות על המייל.</p>
          <Field label="גודל">
            <Segmented value={b.size || 'lg'} onChange={(v) => up({ size: v })} options={[{ value: 'xl', label: 'גדול' }, { value: 'lg', label: 'בינוני' }, { value: 'md', label: 'קטן' }]} />
          </Field>
          <AlignField value={b.align} onChange={(v) => up({ align: v })} />
          <ColorField label="צבע" value={b.color} onChange={(v) => up({ color: v })} allowEmpty="רגיל" />
        </>
      );
    case 'text':
      return (
        <>
          <p className="text-sm text-slate-500 bg-slate-50 rounded-xl p-3">את הטקסט עורכים ישירות על המייל. סמנו מילים כדי להדגיש, להוסיף קישור או צבע.</p>
          <AlignField value={b.align} onChange={(v) => up({ align: v })} />
          <Range label="גודל טקסט" value={b.fontSize ?? 16} min={12} max={22} suffix="px" onChange={(v) => up({ fontSize: v })} />
          <ColorField label="צבע" value={b.color} onChange={(v) => up({ color: v })} allowEmpty="רגיל" />
        </>
      );
    case 'quote':
      return <p className="text-sm text-slate-500 bg-slate-50 rounded-xl p-3">מסגרת צבעונית להדגשת טיפ, ציטוט או משפט חשוב. הצבע לפי צבע המותג. את הטקסט עורכים על המייל.</p>;
    case 'image':
      return (
        <>
          <ImageFields b={b} onUpdate={onUpdate} onPickImage={onPickImage} />
          <AlignField value={b.align} onChange={(v) => up({ align: v })} />
          <Field label="כיתוב מתחת לתמונה (לא חובה)">
            <input className="input" value={b.caption || ''} onChange={(e) => up({ caption: e.target.value })} />
          </Field>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={!!b.rounded} onChange={(e) => up({ rounded: e.target.checked })} className="accent-primary-600" /> פינות מעוגלות
          </label>
        </>
      );
    case 'logo':
      return (
        <>
          <ImageFields b={b} onUpdate={onUpdate} onPickImage={onPickImage} />
          <AlignField value={b.align} onChange={(v) => up({ align: v })} />
        </>
      );
    case 'button':
      return (
        <>
          <Field label="טקסט הכפתור">
            <input className="input" value={b.text || ''} onChange={(e) => up({ text: e.target.value })} />
          </Field>
          <Field label="לאן הכפתור מוביל" hint="כתובת אתר, או mailto: למייל, או tel: לטלפון">
            <input className={clsx('input', !b.url && 'border-amber-300')} dir="ltr" value={b.url || ''} onChange={(e) => up({ url: e.target.value })} placeholder="https://..." />
            <GuideLink url={b.url || ''} onPick={(url) => up({ url })} />
          </Field>
          <AlignField value={b.align} onChange={(v) => up({ align: v })} />
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={!!b.fullWidth} onChange={(e) => up({ fullWidth: e.target.checked })} className="accent-primary-600" /> כפתור ברוחב מלא
          </label>
          <ColorField label="צבע הכפתור" value={b.bg} onChange={(v) => up({ bg: v })} allowEmpty="צבע המותג" />
          <ColorField label="צבע הטקסט" value={b.color} onChange={(v) => up({ color: v })} allowEmpty="לבן" />
          <Range label="עיגול פינות" value={b.radius ?? 10} min={0} max={30} suffix="px" onChange={(v) => up({ radius: v })} />
        </>
      );
    case 'divider':
      return (
        <>
          <ColorField label="צבע הקו" value={b.color} onChange={(v) => up({ color: v || '#e2e8f0' })} />
          <Range label="עובי" value={b.thickness ?? 1} min={1} max={6} suffix="px" onChange={(v) => up({ thickness: v })} />
        </>
      );
    case 'spacer':
      return <Range label="גובה" value={b.height ?? 24} min={4} max={120} step={4} suffix="px" onChange={(v) => up({ height: v })} />;
    case 'imageText':
      return (
        <>
          <ImageFields b={b} onUpdate={onUpdate} onPickImage={onPickImage} showWidth={false} />
          <Field label="צד התמונה">
            <Segmented value={b.imageSide || 'right'} onChange={(v) => up({ imageSide: v })} options={[{ value: 'right', label: 'ימין' }, { value: 'left', label: 'שמאל' }]} />
          </Field>
          <p className="text-xs text-slate-400">בטלפון התמונה והטקסט מוצגים אחד מעל השני.</p>
        </>
      );
    default:
      return null;
  }
}

export default function Panel(p: Props) {
  const [tab, setTab] = useState<'blocks' | 'style'>('blocks');
  const s = p.design.settings;

  if (p.selected) {
    return (
      <div className="p-5 space-y-5">
        <div className="flex items-center justify-between">
          <button type="button" onClick={p.onDeselect} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
            <ArrowRight className="w-4 h-4" /> חזרה
          </button>
          <span className="text-sm font-semibold text-slate-800">{blockLabel(p.selected.type)}</span>
        </div>
        <BlockSettings b={p.selected} onUpdate={p.onUpdate} onPickImage={p.onPickImage} />
        <button type="button" onClick={() => p.onRemove(p.selected!.id)} className="btn-danger w-full justify-center text-sm">
          <Trash2 className="w-4 h-4" /> מחיקת הבלוק
        </button>
      </div>
    );
  }

  return (
    <div className="p-5 space-y-5">
      <div className="flex bg-slate-100 rounded-xl p-1 gap-1">
        <button type="button" onClick={() => setTab('blocks')} className={clsx('flex-1 py-2 text-sm rounded-lg font-medium flex items-center justify-center gap-1.5', tab === 'blocks' ? 'bg-white shadow-sm' : 'text-slate-500')}>
          <LayoutTemplate className="w-4 h-4" /> בלוקים
        </button>
        <button type="button" onClick={() => setTab('style')} className={clsx('flex-1 py-2 text-sm rounded-lg font-medium flex items-center justify-center gap-1.5', tab === 'style' ? 'bg-white shadow-sm' : 'text-slate-500')}>
          <Palette className="w-4 h-4" /> עיצוב כללי
        </button>
      </div>

      {tab === 'blocks' ? (
        <>
          <p className="text-xs text-slate-500">גררו בלוק אל המייל, או לחצו כדי להוסיף אותו מתחת לבלוק המסומן.</p>
          <div className="grid grid-cols-2 gap-2.5">
            {BLOCKS.map(({ type, label, icon: Icon }) => (
              <button key={type} type="button" draggable
                onDragStart={(e) => { e.dataTransfer.setData(DRAG_NEW, type); e.dataTransfer.effectAllowed = 'copy'; }}
                onClick={() => p.onAdd(type)}
                className="flex flex-col items-center gap-2 py-4 rounded-xl border border-slate-200 bg-white hover:border-primary-300 hover:shadow-md hover:-translate-y-0.5 transition-all cursor-grab active:cursor-grabbing">
                <Icon className="w-5 h-5 text-primary-600" />
                <span className="text-xs font-medium text-slate-700">{label}</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="space-y-5">
          <ColorField label="צבע המותג (כפתורים, קישורים, הדגשות)" value={s.brand} onChange={(v) => p.onSettings({ brand: v || '#007f91' })} />
          <ColorField label="צבע הרקע" value={s.bg} onChange={(v) => p.onSettings({ bg: v || '#f1f5f9' })} />
          <ColorField label="צבע תוכן המייל" value={s.contentBg} onChange={(v) => p.onSettings({ contentBg: v || '#ffffff' })} />
          <ColorField label="צבע הטקסט" value={s.textColor} onChange={(v) => p.onSettings({ textColor: v || '#1e293b' })} />
          <Field label="גופן" hint="Heebo מוצג באייפון ובאפל מייל; בשאר התוכנות יוצג Arial">
            <Segmented value={s.font} onChange={(v) => p.onSettings({ font: v })} options={[{ value: 'arial', label: 'Arial' }, { value: 'heebo', label: 'Heebo' }]} />
          </Field>
        </div>
      )}
    </div>
  );
}
