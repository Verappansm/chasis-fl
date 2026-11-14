/**
 * Small, dependency-free SVG charts, rendered on the server. Each bar carries
 * a <title> so hovering shows the exact figure; a visually hidden table gives
 * screen readers the same numbers.
 */

export type Series = { name: string; fill: string; swatch: string };

const W = 640;
const H = 220;
const PAD = { top: 12, right: 8, bottom: 28, left: 64 };

/** 1,23,45,678 → "₹1.2L" style short labels for axes. */
export function shortMoney(paise: number): string {
  const r = paise / 100;
  const a = Math.abs(r);
  const sign = r < 0 ? "−" : "";
  if (a >= 1e7) return `${sign}₹${(a / 1e7).toFixed(a >= 1e8 ? 0 : 1)}Cr`;
  if (a >= 1e5) return `${sign}₹${(a / 1e5).toFixed(a >= 1e6 ? 0 : 1)}L`;
  if (a >= 1e3) return `${sign}₹${(a / 1e3).toFixed(0)}k`;
  return `${sign}₹${a.toFixed(0)}`;
}

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

export function Legend({ series }: { series: Series[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
      {series.map((s) => (
        <li key={s.name} className="flex items-center gap-1.5">
          <span className={`size-2.5 rounded-sm ${s.swatch}`} aria-hidden />
          {s.name}
        </li>
      ))}
    </ul>
  );
}

/**
 * Vertical bars per category; several series side by side, or stacked.
 * Handles negative values (drawn below a zero line).
 */
export function BarChart({
  title,
  categories,
  series,
  values,
  format = (n) => String(n),
  axisFormat,
  stacked = false,
}: {
  title: string;
  categories: string[];
  series: Series[];
  /** values[seriesIndex][categoryIndex] */
  values: number[][];
  format?: (n: number) => string;
  axisFormat?: (n: number) => string;
  stacked?: boolean;
}) {
  const axis = axisFormat ?? format;
  const totals = categories.map((_, ci) =>
    stacked
      ? {
          pos: values.reduce((t, s) => t + Math.max(0, s[ci] ?? 0), 0),
          neg: values.reduce((t, s) => t + Math.min(0, s[ci] ?? 0), 0),
        }
      : { pos: Math.max(0, ...values.map((s) => s[ci] ?? 0)), neg: Math.min(0, ...values.map((s) => s[ci] ?? 0)) },
  );
  const max = niceMax(Math.max(0, ...totals.map((t) => t.pos)));
  const minRaw = Math.min(0, ...totals.map((t) => t.neg));
  const min = minRaw < 0 ? -niceMax(-minRaw) : 0;
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const y = (v: number) => PAD.top + ((max - v) / (max - min)) * innerH;
  const band = innerW / Math.max(1, categories.length);
  const barW = stacked ? band * 0.6 : (band * 0.7) / Math.max(1, series.length);
  const ticks = min < 0 ? [max, max / 2, 0, min / 2, min] : [max, (max * 3) / 4, max / 2, max / 4, 0];

  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={title}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} className={t === 0 ? "stroke-slate-400" : "stroke-slate-200"} strokeWidth={1} />
            <text x={PAD.left - 6} y={y(t) + 3} textAnchor="end" className="fill-slate-400 text-[10px]">
              {axis(t)}
            </text>
          </g>
        ))}
        {categories.map((cat, ci) => {
          const x0 = PAD.left + ci * band + (band - (stacked ? barW : barW * series.length)) / 2;
          let up = 0;
          let down = 0;
          return (
            <g key={cat}>
              {series.map((s, si) => {
                const v = values[si]?.[ci] ?? 0;
                if (v === 0) return null;
                let top: number;
                let bottom: number;
                if (stacked) {
                  if (v > 0) {
                    top = y(up + v);
                    bottom = y(up);
                    up += v;
                  } else {
                    top = y(down);
                    bottom = y(down + v);
                    down += v;
                  }
                } else {
                  top = y(Math.max(0, v));
                  bottom = y(Math.min(0, v));
                }
                const x = stacked ? x0 : x0 + si * barW;
                return (
                  <rect key={s.name} x={x} y={top} width={Math.max(1, barW - 2)} height={Math.max(1, bottom - top)} rx={2} className={s.fill}>
                    <title>{`${cat} · ${s.name}: ${format(v)}`}</title>
                  </rect>
                );
              })}
              <text x={PAD.left + ci * band + band / 2} y={H - 10} textAnchor="middle" className="fill-slate-500 text-[10px]">
                {cat}
              </text>
            </g>
          );
        })}
      </svg>
      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th>Period</th>
            {series.map((s) => (
              <th key={s.name}>{s.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {categories.map((c, ci) => (
            <tr key={c}>
              <th>{c}</th>
              {series.map((s, si) => (
                <td key={s.name}>{format(values[si]?.[ci] ?? 0)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/** Ranked horizontal bars (e.g. providers, ageing buckets). */
export function HBars({
  items,
  format,
  fill = "bg-indigo-500",
  empty = "Nothing to show.",
}: {
  items: { label: string; value: number; detail?: string; fill?: string }[];
  format: (n: number) => string;
  fill?: string;
  empty?: string;
}) {
  const max = Math.max(0, ...items.map((i) => Math.abs(i.value)));
  if (!items.length || max === 0) return <p className="py-6 text-center text-sm text-slate-500">{empty}</p>;
  return (
    <ul className="space-y-2.5">
      {items.map((i) => (
        <li key={i.label}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate text-slate-700">{i.label}</span>
            <span className="shrink-0 tabular-nums text-slate-900">
              {format(i.value)}
              {i.detail && <span className="ml-2 text-xs text-slate-400">{i.detail}</span>}
            </span>
          </div>
          <div className="h-2 rounded-full bg-slate-100">
            <div className={`h-2 rounded-full ${i.fill ?? fill}`} style={{ width: `${Math.max(2, (Math.abs(i.value) / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** One horizontal bar split into proportional parts (e.g. invoice stages). */
export function StackBar({ parts, label }: { parts: { name: string; value: number; swatch: string }[]; label: string }) {
  const total = parts.reduce((t, p) => t + p.value, 0);
  if (total <= 0) return <div className="h-2 rounded-full bg-slate-100" aria-label={`${label}: none`} />;
  return (
    <div className="flex h-2 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={`${label}: ${parts.map((p) => `${p.name} ${p.value}`).join(", ")}`}>
      {parts.map((p) =>
        p.value > 0 ? <div key={p.name} className={p.swatch} style={{ width: `${(p.value / total) * 100}%` }} title={`${p.name}: ${p.value}`} /> : null,
      )}
    </div>
  );
}
