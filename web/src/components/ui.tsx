import type { ReactNode } from 'react';

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-8 text-sm text-ink-muted" role="status">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-accent" aria-hidden />
      {label}
    </div>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-critical/40 bg-critical/10 px-3 py-2 text-sm text-ink" role="alert">
      <span className="font-semibold text-critical">Error:</span> {message}
    </div>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-2 p-10 text-center">
      <p className="text-sm font-semibold text-ink">{title}</p>
      {hint ? <p className="max-w-md text-sm text-ink-muted">{hint}</p> : null}
      {action}
    </div>
  );
}

export function Section({ title, description, right, children }: {
  title: string;
  description?: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="card p-4">
      <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          {description ? <p className="mt-0.5 text-xs text-ink-muted">{description}</p> : null}
        </div>
        {right}
      </header>
      {children}
    </section>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="label mb-1">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-ink-muted">{hint}</span> : null}
    </label>
  );
}

const BAND_STYLES: Record<string, string> = {
  Priority: 'bg-accent text-white border-transparent',
  Good: 'bg-accent/15 text-ink border-accent/30',
  Test: 'bg-sunken text-ink-soft border-line',
  'Low Priority': 'bg-transparent text-ink-muted border-line',
};

export function ScoreBadge({ score, band }: { score: number; band: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-semibold ${BAND_STYLES[band] ?? BAND_STYLES['Test']}`}
      title={`Flowcalls Opportunity Score ${score}/100 — ${band}`}
    >
      <span className="tabular-nums">{score}</span>
      <span className="font-medium opacity-80">{band}</span>
    </span>
  );
}

export function StatusBadge({ status, label }: { status: string; label: string }) {
  const tone =
    status === 'won' ? 'border-good/40 bg-good/10 text-ink'
    : status === 'lost' || status === 'not_suitable' ? 'border-line bg-sunken text-ink-muted'
    : status === 'demo_booked' || status === 'proposal' ? 'border-accent/40 bg-accent/10 text-ink'
    : 'border-line bg-sunken text-ink-soft';
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${tone}`}>{label}</span>;
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-ink-soft">
      <input
        type="checkbox"
        className="h-4 w-4 rounded border-line text-accent focus:ring-accent/40"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

/** Tri-state filter: any / yes / no. */
export function TriState({ value, onChange, label }: {
  value: boolean | undefined;
  onChange: (v: boolean | undefined) => void;
  label: string;
}) {
  const options: Array<[string, boolean | undefined]> = [['Any', undefined], ['Yes', true], ['No', false]];
  return (
    <div>
      <span className="label mb-1">{label}</span>
      <div className="inline-flex rounded-lg border border-line bg-surface p-0.5">
        {options.map(([text, option]) => (
          <button
            key={text}
            type="button"
            onClick={() => onChange(option)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
              value === option ? 'bg-accent text-white' : 'text-ink-muted hover:text-ink'
            }`}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}
