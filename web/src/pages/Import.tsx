import { useState } from 'react';
import { ErrorNote, Field, Section, Spinner, Toggle } from '../components/ui';
import { api } from '../lib/api';
import { formatNumber } from '../lib/format';
import { useApi } from '../lib/useApi';
import type { Meta } from '../lib/types';

interface PreviewResponse {
  headers: string[];
  rowCount: number;
  mapping: Record<string, string | null>;
  sample: Array<Record<string, string>>;
  fields: string[];
}

interface ImportReport {
  rowCount: number;
  created: number;
  updated: number;
  skipped: number;
  suppressed: number;
  unmappedHeaders: string[];
  dryRun: boolean;
  issues: Array<{ row: number; company: string; reason: string }>;
}

export default function ImportPage() {
  const meta = useApi<Meta>('/meta');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [mapping, setMapping] = useState<Record<string, string | null>>({});
  const [targetOnly, setTargetOnly] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);

  async function loadPreview(selected: File) {
    setBusy(true);
    setError(null);
    setReport(null);
    try {
      const form = new FormData();
      form.append('file', selected);
      const result = await api.postForm<PreviewResponse>('/import/preview', form);
      setPreview(result);
      setMapping(result.mapping);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function runImport(dryRun: boolean) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('mapping', JSON.stringify(mapping));
      form.append('targetTradesOnly', String(targetOnly));
      form.append('dryRun', String(dryRun));
      setReport(await api.postForm<ImportReport>('/import/csv', form));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Section
        title="Import prospects from CSV"
        description="Works with Google Maps exports (Apify, Outscraper, Bright Data) or your own spreadsheet. Columns are matched automatically — check them before importing."
      >
        <input
          type="file"
          accept=".csv,text/csv"
          className="block w-full text-sm text-ink-soft file:mr-3 file:rounded-lg file:border-0 file:bg-accent file:px-3 file:py-2 file:text-sm file:font-medium file:text-white"
          onChange={(e) => {
            const selected = e.target.files?.[0] ?? null;
            setFile(selected);
            setPreview(null);
            setReport(null);
            if (selected) void loadPreview(selected);
          }}
        />
        {busy && !preview ? <Spinner label="Reading file…" /> : null}
        {error ? <div className="mt-3"><ErrorNote message={error} /></div> : null}
      </Section>

      {preview ? (
        <Section
          title="Column mapping"
          description={`${formatNumber(preview.rowCount)} rows found. Map each column to a field, or leave it as "Ignore".`}
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse">
              <thead className="border-b border-line">
                <tr>
                  <th className="th">CSV column</th>
                  <th className="th">First value</th>
                  <th className="th">Maps to</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {preview.headers.map((header) => (
                  <tr key={header}>
                    <td className="td font-medium text-ink">{header}</td>
                    <td className="td max-w-xs truncate text-ink-muted">{preview.sample[0]?.[header] ?? ''}</td>
                    <td className="td">
                      <select
                        className="input py-1"
                        value={mapping[header] ?? ''}
                        onChange={(e) => setMapping({ ...mapping, [header]: e.target.value || null })}
                      >
                        <option value="">Ignore</option>
                        {preview.fields.map((field) => (
                          <option key={field} value={field}>
                            {field}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-4">
            <Toggle
              label="Only import rows that mention plumbing, heating, boilers or drains"
              checked={targetOnly}
              onChange={setTargetOnly}
            />
            <div className="ml-auto flex gap-2">
              <button type="button" className="btn" onClick={() => runImport(true)} disabled={busy}>
                Dry run
              </button>
              <button type="button" className="btn btn-primary" onClick={() => runImport(false)} disabled={busy}>
                {busy ? 'Importing…' : 'Import'}
              </button>
            </div>
          </div>
        </Section>
      ) : null}

      {report ? (
        <Section title={report.dryRun ? 'Dry run result — nothing was written' : 'Import complete'}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Stat label="Rows read" value={report.rowCount} />
            <Stat label="Created" value={report.created} />
            <Stat label="Updated" value={report.updated} />
            <Stat label="Skipped" value={report.skipped} />
            <Stat label="Suppressed" value={report.suppressed} />
          </div>
          {report.unmappedHeaders.length > 0 ? (
            <p className="mt-3 text-xs text-ink-muted">Ignored columns: {report.unmappedHeaders.join(', ')}</p>
          ) : null}
          {report.issues.length > 0 ? (
            <details className="mt-3">
              <summary className="cursor-pointer text-sm text-ink-soft">
                {report.issues.length} row(s) needed attention
              </summary>
              <ul className="mt-2 flex flex-col gap-1 text-xs text-ink-muted">
                {report.issues.slice(0, 50).map((issue, i) => (
                  <li key={`${issue.row}-${i}`}>
                    Row {issue.row} {issue.company ? `(${issue.company})` : ''}: {issue.reason}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </Section>
      ) : null}

      <GoogleMapsSearch meta={meta.data} />

      <Section title="After importing">
        <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm text-ink-soft">
          <li>Run enrichment to pull in Google data, marketing signals and company details.</li>
          <li>Check the scoring weights match how you think about a good prospect.</li>
          <li>Work down the call queue, ringing each number yourself and logging what happened.</li>
        </ol>
      </Section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-line bg-sunken/50 px-3 py-2">
      <p className="label">{label}</p>
      <p className="mt-0.5 text-xl font-semibold tabular-nums text-ink">{formatNumber(value)}</p>
    </div>
  );
}

function GoogleMapsSearch({ meta }: { meta: Meta | null }) {
  const [provider, setProvider] = useState('google_places');
  const [cities, setCities] = useState('');
  const [templates, setTemplates] = useState<string[]>([]);
  const [maxPerQuery, setMaxPerQuery] = useState('20');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ found: number; created?: number; updated?: number; messages: string[] } | null>(null);

  const available = meta?.providers ?? [];
  const placesReady = available.find((p) => p.provider === 'google_places')?.configured ?? false;

  const queries = cities
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean)
    .flatMap((city) => (templates.length > 0 ? templates : ['plumber in {city}']).map((t) => t.replace('{city}', city)));

  async function search(dryRun: boolean) {
    setBusy(true);
    setError(null);
    try {
      setResult(
        await api.post('/acquire/search', {
          provider,
          queries: queries.slice(0, 50),
          maxPerQuery: Number(maxPerQuery),
          dryRun,
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section
      title="Search Google Maps directly"
      description="Optional. Needs GOOGLE_PLACES_API_KEY or APIFY_TOKEN in your .env — without one, use the CSV import above."
    >
      {!placesReady && provider === 'google_places' ? (
        <p className="mb-3 rounded-lg border border-line bg-sunken px-3 py-2 text-xs text-ink-muted">
          Google Places is not configured. Add <code className="font-mono">GOOGLE_PLACES_API_KEY</code> to your .env and
          restart the server.
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Provider">
          <select className="input" value={provider} onChange={(e) => setProvider(e.target.value)}>
            <option value="google_places">Google Places API</option>
            <option value="apify">Google Maps via Apify</option>
          </select>
        </Field>
        <Field label="Results per search" hint="Keep it modest — quality over volume.">
          <input className="input" type="number" min={1} max={60} value={maxPerQuery} onChange={(e) => setMaxPerQuery(e.target.value)} />
        </Field>
      </div>

      <div className="mt-3">
        <Field label="Towns and cities" hint="Comma separated, e.g. Leeds, Sheffield, Bradford">
          <input className="input" value={cities} onChange={(e) => setCities(e.target.value)} placeholder="Leeds, Sheffield, Bradford" />
        </Field>
      </div>

      <div className="mt-3">
        <p className="label mb-1.5">Search templates</p>
        <div className="flex flex-wrap gap-1.5">
          {(meta?.searchTemplates ?? []).map((template) => {
            const on = templates.includes(template);
            return (
              <button
                key={template}
                type="button"
                className={`btn px-2.5 py-1 text-xs ${on ? 'btn-primary' : ''}`}
                onClick={() => setTemplates(on ? templates.filter((t) => t !== template) : [...templates, template])}
              >
                {template}
              </button>
            );
          })}
        </div>
      </div>

      <p className="mt-3 text-xs text-ink-muted">{queries.length} search(es) will run.</p>
      {error ? <div className="mt-3"><ErrorNote message={error} /></div> : null}

      <div className="mt-3 flex gap-2">
        <button type="button" className="btn" disabled={busy || queries.length === 0} onClick={() => search(true)}>
          Preview
        </button>
        <button type="button" className="btn btn-primary" disabled={busy || queries.length === 0} onClick={() => search(false)}>
          {busy ? 'Searching…' : 'Search and import'}
        </button>
      </div>

      {result ? (
        <div className="mt-3 rounded-lg border border-line bg-sunken/50 p-3 text-sm text-ink-soft">
          <p>
            {formatNumber(result.found)} result(s)
            {result.created !== undefined ? ` · ${formatNumber(result.created)} new · ${formatNumber(result.updated ?? 0)} already known` : ''}
          </p>
          <ul className="mt-1 flex flex-col gap-0.5 text-xs text-ink-muted">
            {result.messages.slice(0, 20).map((message, i) => (
              <li key={i}>{message}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </Section>
  );
}
