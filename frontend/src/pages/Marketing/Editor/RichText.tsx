import { useEffect, useRef, useState, CSSProperties } from 'react';
import { Bold, Italic, Underline, Link, List, ListOrdered, RemoveFormatting, UserPlus, Check, X } from 'lucide-react';
import { COLOR_SWATCHES } from '../shared';

let activeEditor: HTMLElement | null = null;
let savedRange: Range | null = null;

function rememberSelection() {
  const sel = window.getSelection();
  if (sel && sel.rangeCount && activeEditor?.contains(sel.anchorNode)) savedRange = sel.getRangeAt(0).cloneRange();
}

function restoreSelection() {
  if (!activeEditor) return false;
  activeEditor.focus();
  if (savedRange) {
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(savedRange);
  }
  return true;
}

function exec(command: string, value?: string) {
  if (!restoreSelection()) return;
  document.execCommand('styleWithCSS', false, 'true');
  document.execCommand(command, false, value);
  rememberSelection();
}

interface RichTextProps {
  html: string;
  onChange: (html: string) => void;
  onFocus?: () => void;
  className?: string;
  style?: CSSProperties;
  placeholder?: string;
  singleLine?: boolean;
}

export function RichText({ html, onChange, onFocus, className, style, placeholder, singleLine }: RichTextProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== html && document.activeElement !== ref.current) {
      ref.current.innerHTML = html;
    }
  }, [html]);

  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      dir="rtl"
      data-placeholder={placeholder}
      className={`outline-none rich-editable ${className || ''}`}
      style={style}
      onFocus={() => { activeEditor = ref.current; onFocus?.(); }}
      onKeyUp={rememberSelection}
      onMouseUp={rememberSelection}
      onBlur={rememberSelection}
      onInput={(e) => onChange(e.currentTarget.innerHTML)}
      onKeyDown={(e) => { if (singleLine && e.key === 'Enter') e.preventDefault(); }}
      onPaste={(e) => {
        e.preventDefault();
        const text = e.clipboardData.getData('text/plain');
        document.execCommand('insertText', false, singleLine ? text.replace(/\s*\n\s*/g, ' ') : text);
      }}
    />
  );
}

export function FormatToolbar() {
  const [linkMode, setLinkMode] = useState(false);
  const [url, setUrl] = useState('');
  const [showColors, setShowColors] = useState(false);
  const keep = (e: React.MouseEvent) => e.preventDefault();

  const btn = (title: string, icon: any, onClick: () => void) => {
    const Icon = icon;
    return (
      <button type="button" title={title} onMouseDown={keep} onClick={onClick}
        className="p-2 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors">
        <Icon className="w-4 h-4" />
      </button>
    );
  };

  const applyLink = () => {
    const clean = url.trim();
    if (clean) exec('createLink', /^(https?:|mailto:|tel:)/i.test(clean) ? clean : `https://${clean}`);
    setLinkMode(false);
    setUrl('');
  };

  if (linkMode) {
    return (
      <div className="flex items-center gap-2 p-1.5 bg-white rounded-xl border border-slate-200 shadow-sm">
        <Link className="w-4 h-4 text-slate-400 mr-1" />
        <input
          autoFocus dir="ltr" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..."
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyLink(); } if (e.key === 'Escape') setLinkMode(false); }}
          className="flex-1 min-w-0 text-sm px-2 py-1.5 rounded-lg border border-slate-200 outline-none focus:border-primary-400"
        />
        <button type="button" onClick={applyLink} className="p-2 rounded-lg bg-primary-600 text-white"><Check className="w-4 h-4" /></button>
        <button type="button" onClick={() => setLinkMode(false)} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100"><X className="w-4 h-4" /></button>
      </div>
    );
  }

  return (
    <div className="relative flex items-center gap-0.5 flex-wrap p-1 bg-white rounded-xl border border-slate-200 shadow-sm">
      {btn('מודגש', Bold, () => exec('bold'))}
      {btn('נטוי', Italic, () => exec('italic'))}
      {btn('קו תחתון', Underline, () => exec('underline'))}
      <span className="w-px h-5 bg-slate-200 mx-1" />
      {btn('קישור', Link, () => { rememberSelection(); setLinkMode(true); })}
      {btn('רשימה', List, () => exec('insertUnorderedList'))}
      {btn('רשימה ממוספרת', ListOrdered, () => exec('insertOrderedList'))}
      <span className="w-px h-5 bg-slate-200 mx-1" />
      <button type="button" title="צבע טקסט" onMouseDown={keep} onClick={() => setShowColors((v) => !v)}
        className="p-2 rounded-lg hover:bg-slate-100 flex items-center">
        <span className="w-4 h-4 rounded-full border border-slate-300" style={{ background: 'conic-gradient(#dc2626,#d97706,#059669,#2563eb,#6d28d9,#db2777,#dc2626)' }} />
      </button>
      {btn('הוספת שם הנמען', UserPlus, () => exec('insertText', '{{שם}}'))}
      {btn('ניקוי עיצוב', RemoveFormatting, () => { exec('removeFormat'); exec('unlink'); })}
      {showColors && (
        <div className="absolute top-full mt-2 right-0 z-30 flex gap-1.5 p-2 bg-white rounded-xl border border-slate-200 shadow-lg">
          {COLOR_SWATCHES.filter((c) => c !== '#ffffff').map((c) => (
            <button key={c} type="button" onMouseDown={keep} onClick={() => { exec('foreColor', c); setShowColors(false); }}
              className="w-6 h-6 rounded-full border border-white shadow ring-1 ring-slate-200" style={{ background: c }} />
          ))}
        </div>
      )}
    </div>
  );
}
