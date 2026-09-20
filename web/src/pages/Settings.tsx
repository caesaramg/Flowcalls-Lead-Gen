import { useState } from 'react';
import { ErrorNote, Field, Section, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { formatDate, formatNumber } from '../lib/format';
import { useApi } from '../lib/useApi';
import type { Meta } from '../lib/types';

interface SuppressionResponse {
  entries: Array<{ phone_e164: string; reason: string; source: string | null; added_at: string; notes: string | null }>;
  count: number;
}

export default function SettingsPage() {
  const meta = useApi<Meta>('/meta');
  const suppression = useApi<SuppressionResponse>('/suppression');
  const retention = useApi<{ retentionMonths: number; cutoff: string; eligibleForDeletion: number }>('/compliance/retention');

  const [numbers, setNumbers] = useState('');
  const [reason, setReason] = useState('TPS/CTPS');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [enrichLimit, setEnrichLimit] = useState('25');

  async function addSuppression() {
    const phones = numbers.split(/[\s,;]+/).map((n) => n.trim()).filter(Boolean);
    if (phones.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.post<{ added: number; invalid: number; leadsSuppressed: number }>('/suppression', {
        phones,
        reason,
      });
      setMessage(`${result.added} number(s) added, ${result.invalid} unreadable, ${result.leadsSuppressed} prospect(s) suppressed.`);
      setNumbers('');
      suppression.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function runEnrichment() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await api.post<{ processed: number; updated: number }>('/enrich/batch', {
        limit: Number(enrichLimit),
        onlyUnenriched: true,
      });
      setMessage(`Enriched ${result.processed} prospect(s); ${result.updated} gained new data.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (meta.loading) return <Spinner />;

  return (
    <div className="flex flex-col gap-4">
      {message ? <p className="rounded-lg border border-good/40 bg-good/10 px-3 py-2 text-sm text-ink">{message}</p> : null}
      {error ? <ErrorNote message={error} /> : null}

      <Section title="Enrichment providers" description="Providers are opt-in. Without a key, nothing is called and no data leaves this machine.">
        <ul className="flex flex-col divide-y divide-line">
          {(meta.data?.providers ?? []).map((provider) => (
            <li key={provider.provider} className="flex flex-wrap items-center gap-3 py-2.5">
              <span
                className={`inline-block h-2 w-2 rounded-full ${provider.configured ? 'bg-good' : 'bg-line'}`}
                aria-hidden
              />
              <div className="min-w-[14rem] flex-1">
                <p className="text-sm font-medium text-ink">{provider.provider.replace(/_/g, ' ')}</p>
                <p className="text-xs text-ink-muted">{provider.description}</p>
              </div>
              <span className="text-xs text-ink-muted">
                {provider.configured ? 'Ready' : `Needs ${provider.requirement}`}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="w-40">
            <Field label="Prospects to enrich">
              <input className="input" type="number" min={1} max={500} value={enrichLimit} onChange={(e) => setEnrichLimit(e.target.value)} />
            </Field>
          </div>
          <button type="button" className="btn btn-primary" onClick={runEnrichment} disabled={busy}>
            {busy ? 'Working…' : 'Run enrichment'}
          </button>
          <p className="text-xs text-ink-muted">
            Processes the highest-scoring un-enriched prospects first. Large batches are better run from the
            command line: <code className="font-mono">npm run enrich -- --limit 200</code>
          </p>
        </div>
      </Section>

      <Section
        title="Do-not-call suppression"
        description="Screen against TPS/CTPS before you dial. Anything on this list is blocked from calls and hidden from the queue, even if a later import re-adds the business."
      >
        <div className="grid gap-3 lg:grid-cols-2">
          <div>
            <Field label="Numbers to suppress" hint="One per line, or comma separated. Any UK format.">
              <textarea
                className="input min-h-[8rem] font-mono text-xs"
                value={numbers}
                onChange={(e) => setNumbers(e.target.value)}
                placeholder={'01632 960123\n07700 900456'}
              />
            </Field>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <div className="w-56">
                <Field label="Reason">
                  <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
                </Field>
              </div>
              <button type="button" className="btn btn-primary" onClick={addSuppression} disabled={busy}>
                Add to suppression list
              </button>
            </div>
            <p className="mt-2 text-xs text-ink-muted">
              Bulk TPS exports are easier from the command line:{' '}
              <code className="font-mono">npm run suppression:import -- tps-export.csv</code>
            </p>
          </div>

          <div>
            <p className="label mb-2">
              {formatNumber(suppression.data?.count ?? 0)} number(s) suppressed
            </p>
            <div className="max-h-64 overflow-y-auto rounded-lg border border-line">
              <table className="w-full border-collapse">
                <tbody className="divide-y divide-line">
                  {(suppression.data?.entries ?? []).slice(0, 100).map((entry) => (
                    <tr key={entry.phone_e164}>
                      <td className="td font-mono">{entry.phone_e164}</td>
                      <td className="td text-xs">{entry.reason}</td>
                      <td className="td text-xs text-ink-muted">{formatDate(entry.added_at)}</td>
                    </tr>
                  ))}
                  {(suppression.data?.entries.length ?? 0) === 0 ? (
                    <tr>
                      <td className="td text-ink-muted" colSpan={3}>
                        Nothing suppressed yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </Section>

      <Section title="Data retention" description="Prospect records you never converted should not be kept indefinitely.">
        {retention.data ? (
          <p className="text-sm text-ink-soft">
            Policy: delete untouched prospects after{' '}
            <span className="font-medium text-ink">{retention.data.retentionMonths} months</span>. Cutoff{' '}
            {formatDate(retention.data.cutoff)}.{' '}
            <span className="font-medium text-ink">{formatNumber(retention.data.eligibleForDeletion)}</span> record(s)
            are currently eligible.
          </p>
        ) : (
          <Spinner />
        )}
        <p className="mt-2 text-xs text-ink-muted">
          Review and purge from the command line:{' '}
          <code className="font-mono">npm run retention:purge</code> (dry run) then{' '}
          <code className="font-mono">npm run retention:purge -- --confirm</code>.
        </p>
      </Section>

      <Section title="How this system stays on the right side of the rules">
        <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-ink-soft">
          <li>Every call is dialled by you. There is no auto-dialler, no bulk calling and no recorded-message feature.</li>
          <li>Only business contact details are collected. Director names come from the public Companies House register; personal inboxes are skipped in favour of role addresses.</li>
          <li>Every field records where it came from, so you can always show the source of a data point.</li>
          <li>An objection is one click: "Mark do-not-call" suppresses the number permanently, across future imports.</li>
          <li>Sole traders and unincorporated partnerships have the same protection as individuals under PECR — screen against TPS as well as CTPS.</li>
          <li>Website enrichment honours robots.txt and rate-limits itself.</li>
        </ul>
        <p className="mt-3 text-xs text-ink-muted">
          Full detail in <code className="font-mono">docs/COMPLIANCE.md</code>. This is engineering guidance, not legal
          advice — confirm your own position with a suitably qualified adviser.
        </p>
      </Section>
    </div>
  );
}
