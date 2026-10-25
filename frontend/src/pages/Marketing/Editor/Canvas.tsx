import { useState } from 'react';
import clsx from 'clsx';
import { ChevronUp, ChevronDown, Copy, Trash2, GripVertical, ImagePlus } from 'lucide-react';
import { Block, Design, MarketingSettings, blockLabel, HEADING_SIZES } from '../shared';
import { RichText } from './RichText';

const DRAG_NEW = 'application/x-mkt-new-block';
const DRAG_MOVE = 'application/x-mkt-move-block';
export { DRAG_NEW };

interface Props {
  design: Design;
  settings?: MarketingSettings;
  selectedId: string | null;
  mobile: boolean;
  onSelect: (id: string | null) => void;
  onUpdate: (id: string, patch: Partial<Block>) => void;
  onMove: (id: string, toIndex: number) => void;
  onInsert: (type: string, index: number) => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
  onPickImage: (id: string) => void;
}

const fontFamily = (f: string) => (f === 'heebo' ? "'Heebo', Arial, sans-serif" : 'Arial, Helvetica, sans-serif');

function ImagePlaceholder({ onClick, small }: { onClick: () => void; small?: boolean }) {
  return (
    <button type="button" onClick={onClick}
      className={clsx('w-full flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 text-slate-400 hover:border-primary-300 hover:text-primary-500 transition-colors', small ? 'h-32' : 'h-48')}>
      <ImagePlus className="w-7 h-7" />
      <span className="text-sm font-medium">לחצו לבחירת תמונה</span>
    </button>
  );
}

export default function Canvas(p: Props) {
  const { design } = p;
  const s = design.settings;
  const font = fontFamily(s.font);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const handleDrop = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDropIndex(null);
    const newType = e.dataTransfer.getData(DRAG_NEW);
    const moveId = e.dataTransfer.getData(DRAG_MOVE);
    if (newType) p.onInsert(newType, index);
    else if (moveId) p.onMove(moveId, index);
  };

  const dropZone = (index: number) => (
    <div
      key={`drop-${index}`}
      onDragOver={(e) => { e.preventDefault(); setDropIndex(index); }}
      onDragLeave={() => setDropIndex((v) => (v === index ? null : v))}
      onDrop={(e) => handleDrop(e, index)}
      className="relative h-2 -my-1 z-10"
    >
      {dropIndex === index && <div className="absolute inset-x-6 top-1/2 -translate-y-1/2 h-1 rounded-full bg-primary-500 shadow" />}
    </div>
  );

  const renderBlock = (b: Block) => {
    const align = (b.align || 'right') as 'right' | 'center' | 'left';
    const rich = (html: string, style: React.CSSProperties, extra: Partial<Parameters<typeof RichText>[0]> = {}) => (
      <RichText html={html || ''} onChange={(v) => p.onUpdate(b.id, { html: v })} onFocus={() => p.onSelect(b.id)} style={style} {...extra} />
    );
    switch (b.type) {
      case 'logo':
        return (
          <div style={{ padding: '24px 32px 8px', textAlign: align }}>
            {b.src
              ? <img src={b.src} alt={b.alt || ''} style={{ width: `${b.width ?? 30}%`, display: 'inline-block' }} />
              : <div style={{ width: '40%', display: 'inline-block' }}><ImagePlaceholder small onClick={() => p.onPickImage(b.id)} /></div>}
          </div>
        );
      case 'heading':
        return (
          <div style={{ padding: '16px 32px 4px' }}>
            {rich(b.html, {
              fontFamily: font, fontSize: HEADING_SIZES[(b.size as 'xl') || 'lg'], lineHeight: 1.3, fontWeight: 700,
              color: b.color || s.textColor, textAlign: align,
            }, { placeholder: 'כותרת', singleLine: true })}
          </div>
        );
      case 'text':
        return (
          <div style={{ padding: '8px 32px' }}>
            {rich(b.html, { fontFamily: font, fontSize: b.fontSize || 16, lineHeight: 1.75, color: b.color || s.textColor, textAlign: align }, { placeholder: 'כתבו כאן טקסט...' })}
          </div>
        );
      case 'quote':
        return (
          <div style={{ padding: '12px 32px' }}>
            <div style={{ background: `color-mix(in srgb, ${s.brand} 8%, white)`, borderRight: `4px solid ${s.brand}`, borderRadius: 8, padding: '18px 20px' }}>
              {rich(b.html, { fontFamily: font, fontSize: 17, lineHeight: 1.7, color: s.textColor })}
            </div>
          </div>
        );
      case 'image':
        return (
          <div style={{ padding: '12px 32px', textAlign: align }}>
            {b.src
              ? <img src={b.src} alt={b.alt || ''} style={{ width: `${b.width ?? 100}%`, display: 'inline-block', borderRadius: b.rounded ? 12 : 0 }} />
              : <ImagePlaceholder onClick={() => p.onPickImage(b.id)} />}
            {b.caption && <div style={{ fontFamily: font, fontSize: 13, color: '#64748b', marginTop: 8 }}>{b.caption}</div>}
          </div>
        );
      case 'button':
        return (
          <div style={{ padding: '16px 32px', textAlign: align }}>
            <span style={{
              display: b.fullWidth ? 'block' : 'inline-block', background: b.bg || s.brand, color: b.color || '#fff',
              borderRadius: b.radius ?? 10, padding: '14px 30px', fontFamily: font, fontSize: 17, fontWeight: 700, textAlign: 'center',
            }}>
              <RichText html={b.text || ''} singleLine onFocus={() => p.onSelect(b.id)}
                onChange={(v) => p.onUpdate(b.id, { text: v.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ') })}
                style={{ display: 'inline-block', minWidth: 40 }} />
            </span>
            {!b.url && <div className="text-xs text-amber-600 mt-2">⚠ חסר קישור לכפתור</div>}
          </div>
        );
      case 'divider':
        return <div style={{ padding: '16px 32px' }}><div style={{ borderTop: `${b.thickness || 1}px solid ${b.color || '#e2e8f0'}` }} /></div>;
      case 'spacer':
        return <div style={{ height: b.height || 24 }} />;
      case 'imageText': {
        const img = b.src
          ? <img src={b.src} alt={b.alt || ''} style={{ width: '100%', display: 'block', borderRadius: 10 }} />
          : <ImagePlaceholder small onClick={() => p.onPickImage(b.id)} />;
        const txt = rich(b.html, { fontFamily: font, fontSize: 16, lineHeight: 1.7, color: s.textColor });
        return (
          <div style={{ padding: '12px 32px', display: 'flex', flexDirection: p.mobile ? 'column' : (b.imageSide === 'left' ? 'row-reverse' : 'row'), gap: 24 }}>
            <div style={{ flex: 1 }}>{img}</div>
            <div style={{ flex: 1 }}>{txt}</div>
          </div>
        );
      }
      default:
        return null;
    }
  };

  return (
    <div className="min-h-full py-8 px-4" style={{ background: s.bg }} onClick={() => p.onSelect(null)}>
      <div
        className="mx-auto shadow-xl transition-all duration-300"
        style={{ width: p.mobile ? 375 : 600, maxWidth: '100%', background: s.contentBg, borderRadius: 14, overflow: 'visible' }}
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
      >
        {design.blocks.length === 0 && (
          <div onDragOver={(e) => e.preventDefault()} onDrop={(e) => handleDrop(e, 0)}
            className="m-6 p-12 rounded-xl border-2 border-dashed border-slate-300 text-center text-slate-400">
            <p className="font-medium">המייל ריק</p>
            <p className="text-sm mt-1">גררו לכאן בלוקים מהתפריט, או לחצו על בלוק כדי להוסיף אותו</p>
          </div>
        )}
        {design.blocks.map((b, i) => {
          const selected = p.selectedId === b.id;
          return (
            <div key={b.id}>
              {dropZone(i)}
              <div
                onClick={(e) => { e.stopPropagation(); p.onSelect(b.id); }}
                onDragOver={(e) => {
                  e.preventDefault();
                  const r = e.currentTarget.getBoundingClientRect();
                  setDropIndex(e.clientY < r.top + r.height / 2 ? i : i + 1);
                }}
                onDrop={(e) => handleDrop(e, dropIndex ?? i)}
                className={clsx('group relative transition-shadow cursor-pointer', selected ? 'ring-2 ring-primary-500 z-20' : 'hover:ring-2 hover:ring-primary-200')}
              >
                {renderBlock(b)}
                <div className={clsx('absolute -top-3 left-3 flex items-center gap-0.5 bg-primary-600 text-white rounded-lg shadow-lg px-1 py-0.5 text-xs transition-opacity',
                  selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto')}>
                  <span draggable
                    onDragStart={(e) => { e.dataTransfer.setData(DRAG_MOVE, b.id); e.dataTransfer.effectAllowed = 'move'; }}
                    onDragEnd={() => setDropIndex(null)}
                    className="p-1 cursor-grab active:cursor-grabbing" title="גררו כדי להזיז"><GripVertical className="w-3.5 h-3.5" /></span>
                  <span className="px-1 font-medium">{blockLabel(b.type)}</span>
                  <button type="button" title="למעלה" onClick={(e) => { e.stopPropagation(); p.onMove(b.id, i - 1); }} className="p-1 hover:bg-white/20 rounded"><ChevronUp className="w-3.5 h-3.5" /></button>
                  <button type="button" title="למטה" onClick={(e) => { e.stopPropagation(); p.onMove(b.id, i + 2); }} className="p-1 hover:bg-white/20 rounded"><ChevronDown className="w-3.5 h-3.5" /></button>
                  <button type="button" title="שכפול" onClick={(e) => { e.stopPropagation(); p.onDuplicate(b.id); }} className="p-1 hover:bg-white/20 rounded"><Copy className="w-3.5 h-3.5" /></button>
                  <button type="button" title="מחיקה" onClick={(e) => { e.stopPropagation(); p.onRemove(b.id); }} className="p-1 hover:bg-white/20 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            </div>
          );
        })}
        {design.blocks.length > 0 && dropZone(design.blocks.length)}
        <div style={{ height: 16 }} />
      </div>
      {p.settings && (
        <div className="mx-auto text-center py-5 px-8 select-none" style={{ width: p.mobile ? 375 : 600, maxWidth: '100%', fontFamily: 'Arial', fontSize: 12, lineHeight: 1.7, color: '#64748b' }}>
          {p.settings.businessName && <div><strong>{p.settings.businessName}</strong></div>}
          {p.settings.details && <div>{p.settings.details}</div>}
          {p.settings.reason && <div>{p.settings.reason}</div>}
          <div className="underline">להסרה מרשימת התפוצה לחצו כאן</div>
          <div className="mt-2 text-[11px] text-slate-400 no-underline">(התחתית מתווספת אוטומטית לכל מייל, ונערכת בהגדרות הדיוור)</div>
        </div>
      )}
    </div>
  );
}
