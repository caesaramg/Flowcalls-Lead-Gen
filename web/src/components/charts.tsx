import { useState, type ReactNode } from 'react';
import { formatNumber } from '../lib/format';

/**
 * Stat tile — the right form for a single headline number. No plot, so no
 * tooltip layer; the number and its label carry everything.
 */
export function StatTile({ label, value, sub, tone = 'default', hero = false }: {
  label: string;
  value: ReactNode;
  sub?: string;
  tone?: 'default' | 'good' | 'warning' | 'critical';
  hero?: boolean;
}) {
  const toneClass =
    tone === 'good' ? 'text-good' : tone === 'warning' ? 'text-warning' : tone === 'critical' ? 'text-critical' : 'text-ink';
  return (
    <div className="card px-4 py-3">
      <p className="label">{label}</p>
      <p className={`mt-1 font-semibold tabular-nums ${hero ? 'text-4xl' : 'text-2xl'} ${toneClass}`}>{value}</p>
      {sub ? <p className="mt-0.5 text-xs text-ink-muted">{sub}</p> : null}
    </div>
  );
}

export interface BarDatum {
  label: string;
  value: number;
  /** Optional per-bar colour. Only used for ordered scales (e.g. score bands). */
  color?: string;
  href?: string;
}

/**
 * Horizontal bar list — comparing magnitude across categories.
 *
 * One series, so one colour for every bar (a value-ramp on nominal categories
 * would double-encode length as hue). An ordered scale passes explicit colours
 * from the validated ordinal ramp instead.
 */
export function BarList({ data, unit = '', emptyText = 'No data yet', onSelect }: {
  data: BarDatum[];
  unit?: string;
  emptyText?: string;
  onSelect?: (datum: BarDatum) => void;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const total = data.reduce((sum, d) => sum + d.value, 0);

  if (data.length === 0) {
    return <p className="py-6 text-center text-sm text-ink-muted">{emptyText}</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {data.map((datum) => {
        const pct = total > 0 ? Math.round((datum.value / total) * 100) : 0;
        const width = `${Math.max(2, (datum.value / max) * 100)}%`;
        const interactive = Boolean(onSelect);
        return (
          <li key={datum.label} className="relative">
            <div
              role={interactive ? 'button' : undefined}
              tabIndex={interactive ? 0 : undefined}
              onClick={interactive ? () => onSelect?.(datum) : undefined}
              onKeyDown={
                interactive
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelect?.(datum);
                      }
                    }
                  : undefined
              }
              onMouseEnter={() => setHovered(datum.label)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(datum.label)}
              onBlur={() => setHovered(null)}
              className={`grid grid-cols-[minmax(6rem,9rem)_1fr_auto] items-center gap-3 rounded-md px-1 py-1 ${
                interactive ? 'cursor-pointer hover:bg-sunken' : ''
              }`}
            >
              <span className="truncate text-sm text-ink-soft" title={datum.label}>
                {datum.label}
              </span>
              <span className="relative block h-2.5 rounded-sm bg-sunken" aria-hidden>
                <span
                  className="absolute inset-y-0 left-0 rounded-l-none rounded-r"
                  style={{ width, background: datum.color ?? 'var(--series-1)' }}
                />
              </span>
              <span className="w-14 text-right text-sm font-medium tabular-nums text-ink">
                {formatNumber(datum.value)}
                {unit}
              </span>
            </div>

            {hovered === datum.label ? (
              <div className="pointer-events-none absolute -top-1 left-[9.5rem] z-10 -translate-y-full rounded-md border border-line bg-raised px-2 py-1 text-xs shadow-lg">
                <span className="font-semibold text-ink">{datum.label}</span>
                <span className="ml-2 tabular-nums text-ink-soft">
                  {formatNumber(datum.value)}
                  {unit} · {pct}% of {formatNumber(total)}
                </span>
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Single ratio against a limit. Uses the same hue as the bars, so a meter never
 * reads as a separate series.
 */
export function Meter({ label, value, max, caption }: { label: string; value: number; max: number; caption?: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-ink-soft">{label}</span>
        <span className="text-sm font-semibold tabular-nums text-ink">
          {formatNumber(value)} <span className="text-ink-muted">/ {formatNumber(max)}</span>
        </span>
      </div>
      <div className="mt-1.5 h-2.5 rounded-sm bg-sunken">
        <div className="h-full rounded-l-none rounded-r" style={{ width: `${Math.max(2, pct)}%`, background: 'var(--series-1)' }} />
      </div>
      {caption ? <p className="mt-1 text-xs text-ink-muted">{caption}</p> : null}
    </div>
  );
}
