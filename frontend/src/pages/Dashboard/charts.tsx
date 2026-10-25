import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';

// Validated pair (CVD + contrast on white): collected vs. expected money.
export const C_COLLECTED = '#7c3aed';
export const C_EXPECTED = '#0d9488';
const GRID = '#ebe9f2';
const AXIS = '#94a3b8';

export const ils = (n: number) => `₪${Math.round(n).toLocaleString('he-IL')}`;
export const compact = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M` : n >= 1000 ? `${Math.round(n / 100) / 10}K`.replace('.0K', 'K') : String(Math.round(n));

function niceMax(v: number) {
  if (v <= 0) return 1000;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

export interface MonthPoint {
  key: string;
  label: string;
  year: string;
  collected: number;
  scheduled: number;
  current: boolean;
  future: boolean;
}

export function Legend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <div className="flex items-center gap-4 text-xs text-slate-600">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: i.color }} /> {i.label}
        </span>
      ))}
    </div>
  );
}

export function Sparkline({ values, currentIndex, w = 120, h = 36, className }: { values: number[]; currentIndex: number; w?: number; h?: number; className?: string }) {
  const pad = 5;
  const max = Math.max(...values, 1);
  const pts = values.map((v, i) => [pad + (i * (w - pad * 2)) / Math.max(values.length - 1, 1), h - pad - (v / max) * (h - pad * 2)]);
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const [cx, cy] = pts[currentIndex] || pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={className} width={className ? undefined : w} height={className ? undefined : h} style={{ direction: 'ltr' }} aria-hidden="true">
      <path d={`${d} L${pts[pts.length - 1][0]},${h} L${pts[0][0]},${h} Z`} fill={C_COLLECTED} opacity={0.1} />
      <path d={d} fill="none" stroke={C_COLLECTED} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" opacity={0.55} />
      <circle cx={cx} cy={cy} r={4} fill={C_COLLECTED} stroke="#fff" strokeWidth={2} />
    </svg>
  );
}

// Measures the real width so the chart keeps a fixed height and crisp text at any screen size.
function useWidth<T extends HTMLElement>(fallback: number) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setWidth(Math.max(280, Math.round(el.getBoundingClientRect().width)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
  }, []);
  return [ref, width] as const;
}

export function RevenueChart({ data }: { data: MonthPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const [boxRef, W] = useWidth<HTMLDivElement>(720);
  const H = 260, L = 44, R = 8, T = 16, B = 30;
  const plotW = W - L - R, plotH = H - T - B;
  const max = niceMax(Math.max(...data.map((d) => d.collected + d.scheduled)));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const slot = plotW / data.length;
  const barW = Math.min(24, slot * 0.6);
  const y = (v: number) => T + plotH - (v / max) * plotH;
  const empty = data.every((d) => d.collected + d.scheduled === 0);

  const bar = (x: number, y0: number, y1: number, color: string, roundTop: boolean) => {
    const top = Math.min(y0, y1), height = Math.abs(y1 - y0);
    if (height < 0.5) return null;
    const r = roundTop ? Math.min(4, height) : 0;
    return (
      <path fill={color} d={`M${x},${top + height} L${x},${top + r} Q${x},${top} ${x + r},${top} L${x + barW - r},${top} Q${x + barW},${top} ${x + barW},${top + r} L${x + barW},${top + height} Z`} />
    );
  };

  return (
    <div className="relative min-w-0 overflow-hidden" ref={boxRef}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block max-w-full" style={{ direction: 'ltr' }} role="img" aria-label="הכנסות לפי חודש">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke={t === 0 ? '#cbd5e1' : GRID} strokeWidth={1} />
            <text x={L - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill={AXIS} style={{ fontVariantNumeric: 'tabular-nums' }}>{compact(t)}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = L + i * slot + (slot - barW) / 2;
          const yc = y(d.collected);
          const gap = d.collected > 0 && d.scheduled > 0 ? 2 : 0;
          const ys = y(d.collected + d.scheduled);
          return (
            <g key={d.key} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={L + i * slot} y={T} width={slot} height={plotH} fill={hover === i ? 'rgba(124,58,237,0.06)' : 'transparent'} />
              {bar(x, y(0), yc, C_COLLECTED, d.scheduled === 0)}
              {d.scheduled > 0 && bar(x, yc - gap, ys, C_EXPECTED, true)}
              <text x={x + barW / 2} y={H - 12} textAnchor="middle" fontSize={11} fill={d.current ? '#1e293b' : AXIS} fontWeight={d.current ? 700 : 400}>{d.label}</text>
              {d.current && d.collected > 0 && (
                <text x={x + barW / 2} y={ys - 6} textAnchor="middle" fontSize={11} fontWeight={700} fill="#1e293b">{compact(d.collected + d.scheduled)}</text>
              )}
            </g>
          );
        })}
        {data.findIndex((d) => d.future) > 0 && (
          <line x1={L + data.findIndex((d) => d.future) * slot} x2={L + data.findIndex((d) => d.future) * slot} y1={T} y2={T + plotH} stroke={GRID} strokeWidth={1} />
        )}
      </svg>
      {empty && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <p className="text-sm text-slate-400 bg-white/90 px-4 py-2 rounded-xl">עדיין לא נרשמו תשלומים. רשמו תשלום בכרטיס הלקוח והגרף יתמלא</p>
        </div>
      )}
      {hover !== null && !empty && (
        <div
          className="absolute top-2 pointer-events-none bg-slate-900 text-white rounded-xl px-3 py-2 text-xs shadow-lg"
          style={{ left: `${((L + hover * slot + slot / 2) / W) * 100}%`, transform: 'translateX(-50%)' }}
        >
          <p className="font-semibold mb-1">{data[hover].label} {data[hover].year}</p>
          {(!data[hover].future || data[hover].collected > 0) && (
            <p className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm" style={{ background: C_COLLECTED }} /> נגבה {ils(data[hover].collected)}</p>
          )}
          {(data[hover].current || data[hover].future) && (
            <p className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm" style={{ background: C_EXPECTED }} /> צפוי {ils(data[hover].scheduled)}</p>
          )}
        </div>
      )}
    </div>
  );
}

export function RevenueTable({ data }: { data: MonthPoint[] }) {
  return (
    <table className="w-full text-sm">
      <thead><tr className="text-xs text-slate-400"><th className="text-right py-1.5">חודש</th><th className="text-right py-1.5">נגבה</th><th className="text-right py-1.5">צפוי</th></tr></thead>
      <tbody>
        {[...data].reverse().map((d) => (
          <tr key={d.key} className={clsx('border-t border-slate-100', d.current && 'font-semibold')}>
            <td className="py-1.5">{d.label} {d.year}</td>
            <td className="py-1.5 tabular-nums">{d.future ? '—' : ils(d.collected)}</td>
            <td className="py-1.5 tabular-nums">{d.current || d.future ? ils(d.scheduled) : '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function HBar({ label, value, max, color = C_COLLECTED, right, sub, onClick }: { label: string; value: number; max: number; color?: string; right?: string; sub?: string; onClick?: () => void }) {
  const pct = max > 0 ? Math.max(value > 0 ? 3 : 0, (value / max) * 100) : 0;
  return (
    <button type="button" onClick={onClick} className={clsx('w-full text-right group', !onClick && 'cursor-default')}>
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <span className="text-sm text-slate-700 truncate group-hover:text-slate-900">{label}{sub && <span className="text-xs text-slate-400"> · {sub}</span>}</span>
        <span className="text-sm font-semibold text-slate-900 tabular-nums flex-shrink-0">{right}</span>
      </div>
      <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
      </div>
    </button>
  );
}

export function StackedHBar({ parts, max }: { parts: { value: number; color: string }[]; max: number }) {
  const total = useMemo(() => parts.reduce((s, p) => s + p.value, 0), [parts]);
  return (
    <div className="h-2 rounded-full bg-slate-100 overflow-hidden flex gap-[2px]">
      {parts.filter((p) => p.value > 0).map((p, i) => (
        <div key={i} className="h-full first:rounded-r-full last:rounded-l-full" style={{ width: `${max > 0 ? (p.value / max) * 100 : 0}%`, background: p.color, minWidth: total > 0 ? 4 : 0 }} />
      ))}
    </div>
  );
}
