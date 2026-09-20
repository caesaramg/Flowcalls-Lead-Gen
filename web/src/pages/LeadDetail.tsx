import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CallLogger, TestCallLogger } from '../components/call-forms';
import { ErrorNote, Field, ScoreBadge, Section, Spinner, StatusBadge } from '../components/ui';
import { api } from '../lib/api';
import { formatDate, formatDateTime, formatNumber, relativeDays, telHref, titleCase } from '../lib/format';
import { useApi } from '../lib/useApi';
import type { LeadDetail as LeadDetailData, Meta } from '../lib/types';

function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn px-2 py-1 text-xs"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          setCopied(false);
        }
      }}
    >
      {copied ? 'Copied' : label}
    </button>
  );
}

function ProvenanceDot({ source, sourceLabels }: { source?: string; sourceLabels: Record<string, string> }) {
  if (!source) return null;
  const manual = source === 'manual';
  return (
    <span
      className={`ml-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle ${manual ? 'bg-warning' : 'bg-accent'}`}
      title={sourceLabels[source] ?? source}
    />
  );
}

export default function LeadDetail() {
  const { id } = useParams<{ id: string }>();
  const detail = useApi<LeadDetailData>(id ? `/leads/${id}` : null);
  const meta = useApi<Meta>('/meta');
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  if (detail.loading) return <Spinner label="Loading prospect…" />;
  if (detail.error) return <ErrorNote message={detail.error} />;
  if (!detail.data) return null;

  const d = detail.data;
  const lead = d.lead;
  const statusLabels = meta.data?.statuses ?? {};
  const sourceLabels = meta.data?.provenanceSources ?? {};
  const serviceLabels = meta.data?.services ?? {};
  const marketingLabels = meta.data?.marketing ?? {};

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    setActionError(null);
    try {
      await fn();
      detail.reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  const services = Object.entries(serviceLabels).filter(([field]) => Number(lead[field] ?? 0) === 1);
  const marketing = Object.entries(marketingLabels).filter(([field]) => Number(lead[field] ?? 0) === 1);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/leads" className="text-xs text-ink-muted hover:text-accent">
            ← Back to prospects
          </Link>
          <h1 className="mt-1 flex flex-wrap items-center gap-3 text-2xl font-semibold text-ink">
            {lead.company_name}
            <ScoreBadge score={d.score.score} band={d.score.band.label} />
            <StatusBadge status={lead.status} label={statusLabels[lead.status] ?? titleCase(lead.status)} />
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            {[lead.city, lead.postcode, lead.region].filter(Boolean).join(' · ') || 'Location unknown'}
            {lead.owner_name ? ` · ${lead.owner_name}${lead.owner_role ? ` (${titleCase(String(lead.owner_role))})` : ''}` : ''}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {lead.do_not_call ? (
            <button
              type="button"
              className="btn"
              disabled={busy !== null}
              onClick={() => run('dnc', () => api.delete(`/leads/${lead.id}/do-not-call`))}
            >
              Remove do-not-call
            </button>
          ) : (
            <a
              className="btn btn-primary px-5 py-3 text-base"
              href={telHref(lead.phone_e164 as string) ?? '#'}
              aria-disabled={!lead.phone_e164}
            >
              Call {d.phone_display ?? ''}
            </a>
          )}
          <button
            type="button"
            className="btn"
            disabled={busy !== null}
            onClick={() => run('enrich', () => api.post(`/leads/${lead.id}/enrich`, { refresh: true }))}
          >
            {busy === 'enrich' ? 'Enriching…' : 'Re-enrich'}
          </button>
          <button type="button" className="btn" onClick={() => setEditing((v) => !v)}>
            {editing ? 'Close editor' : 'Edit'}
          </button>
        </div>
      </div>

      {lead.do_not_call ? (
        <div className="rounded-lg border border-critical/40 bg-critical/10 px-3 py-2 text-sm">
          <span className="font-semibold text-critical">Do not call.</span>{' '}
          {String(lead.do_not_call_reason ?? 'No reason recorded.')} Added {formatDate(lead.do_not_call_at as string)}.
        </div>
      ) : null}

      {actionError ? <ErrorNote message={actionError} /> : null}

      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <div className="flex flex-col gap-4">
          {/* --- Before you call ------------------------------------- */}
          <Section
            title="Before you call"
            description="Built only from facts stored on this record. Nothing here is invented."
            right={
              <button
                type="button"
                className="btn px-2 py-1 text-xs"
                disabled={busy !== null}
                onClick={() => run('personalise', () => api.post(`/leads/${lead.id}/personalisation`))}
              >
                Regenerate
              </button>
            }
          >
            <p className="text-sm leading-relaxed text-ink">{d.personalisation.summary}</p>

            <div className="mt-3 rounded-lg border border-accent/30 bg-accent/5 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="label mb-1">Suggested opening line</p>
                  <p className="text-sm italic leading-relaxed text-ink">“{d.personalisation.openingLine}”</p>
                </div>
                <CopyButton text={d.personalisation.openingLine} />
              </div>
              <p className="mt-2 text-xs text-ink-muted">
                A starting point only — nothing is sent anywhere. Say it however you like.
              </p>
            </div>

            {d.personalisation.talkingPoints.length > 0 ? (
              <ul className="mt-3 flex flex-col gap-1.5">
                {d.personalisation.talkingPoints.map((point) => (
                  <li key={point} className="flex gap-2 text-sm text-ink-soft">
                    <span className="text-accent">•</span>
                    {point}
                  </li>
                ))}
              </ul>
            ) : null}
          </Section>

          {/* --- Log a call ------------------------------------------- */}
          <Section title="Log a call" description="Record the outcome as soon as you hang up.">
            {lead.do_not_call ? (
              <p className="text-sm text-ink-muted">This prospect is marked do-not-call. Remove the flag to log a call.</p>
            ) : (
              <CallLogger leadId={lead.id} labels={meta.data?.callOutcomes ?? {}} onLogged={detail.reload} />
            )}
          </Section>

          {/* --- Phone test ------------------------------------------- */}
          <Section title="Phone handling test" description="Your own test call to see how they answer.">
            {lead.test_call_attempted ? (
              <div className="mb-4 rounded-lg border border-line bg-sunken/50 px-3 py-2 text-sm text-ink-soft">
                Last test: <span className="font-medium text-ink">{meta.data?.testCallOutcomes[String(lead.test_call_outcome)] ?? String(lead.test_call_outcome)}</span>{' '}
                at {formatDateTime(lead.test_call_at as string)}
                {lead.test_call_ring_seconds ? ` · rang ${lead.test_call_ring_seconds}s` : ''}
                {lead.test_call_ooh_failure ? ' · out-of-hours failure' : ''}
                {lead.test_call_notes ? <span className="mt-1 block text-ink-muted">{String(lead.test_call_notes)}</span> : null}
              </div>
            ) : null}
            {lead.do_not_call ? null : (
              <TestCallLogger leadId={lead.id} labels={meta.data?.testCallOutcomes ?? {}} onLogged={detail.reload} />
            )}
          </Section>

          {/* --- Editor ---------------------------------------------- */}
          {editing ? <Editor detail={d} onSaved={() => { setEditing(false); detail.reload(); }} /> : null}

          {/* --- History --------------------------------------------- */}
          <Section title="Call history">
            {d.calls.length === 0 ? (
              <p className="text-sm text-ink-muted">No calls logged yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {d.calls.map((call) => (
                  <li key={call.id} className="py-2">
                    <div className="flex flex-wrap items-baseline gap-x-3">
                      <span className="text-sm font-medium text-ink">
                        {meta.data?.callOutcomes[call.outcome] ?? call.outcome}
                      </span>
                      <span className="text-xs text-ink-muted">{formatDateTime(call.called_at)}</span>
                      {call.contact_name ? <span className="text-xs text-ink-muted">· {call.contact_name}</span> : null}
                    </div>
                    {call.notes ? <p className="mt-0.5 text-sm text-ink-soft">{call.notes}</p> : null}
                    {call.next_action ? (
                      <p className="mt-0.5 text-xs text-ink-muted">Next: {call.next_action}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Status history">
            <ul className="flex flex-col gap-1.5">
              {d.statusEvents.map((event) => (
                <li key={event.id} className="flex flex-wrap items-baseline gap-2 text-sm text-ink-soft">
                  <span className="font-medium text-ink">
                    {statusLabels[event.to_status] ?? titleCase(event.to_status)}
                  </span>
                  {event.from_status ? (
                    <span className="text-xs text-ink-muted">
                      from {statusLabels[event.from_status] ?? titleCase(event.from_status)}
                    </span>
                  ) : null}
                  <span className="text-xs text-ink-muted">{formatDateTime(event.changed_at)}</span>
                  {event.reason ? <span className="text-xs text-ink-muted">· {event.reason}</span> : null}
                </li>
              ))}
            </ul>
          </Section>
        </div>

        {/* ---------------- Right column ---------------- */}
        <div className="flex flex-col gap-4">
          <Section title="Contact">
            <dl className="flex flex-col gap-2 text-sm">
              <Row label="Phone" prov={d.provenance['phone']?.source} sourceLabels={sourceLabels}>
                {lead.phone_e164 ? (
                  <a className="font-mono hover:text-accent" href={telHref(lead.phone_e164 as string)}>
                    {d.phone_display}
                  </a>
                ) : '—'}
              </Row>
              <Row label="Email" prov={d.provenance['email']?.source} sourceLabels={sourceLabels}>
                {lead.email ? <a className="hover:text-accent" href={`mailto:${String(lead.email)}`}>{String(lead.email)}</a> : '—'}
              </Row>
              <Row label="Website" prov={d.provenance['website']?.source} sourceLabels={sourceLabels}>
                {lead.website ? (
                  <a className="truncate hover:text-accent" href={String(lead.website)} target="_blank" rel="noreferrer noopener">
                    {String(lead.website).replace(/^https?:\/\//, '')}
                  </a>
                ) : '—'}
              </Row>
              <Row label="Google Maps" sourceLabels={sourceLabels}>
                {lead.google_maps_url ? (
                  <a className="hover:text-accent" href={String(lead.google_maps_url)} target="_blank" rel="noreferrer noopener">
                    Open listing
                  </a>
                ) : '—'}
              </Row>
              <Row label="Address" prov={d.provenance['address_line']?.source} sourceLabels={sourceLabels}>
                {String(lead.address_line ?? '—')}
              </Row>
            </dl>
          </Section>

          <Section title="Google profile">
            <dl className="flex flex-col gap-2 text-sm">
              <Row label="Rating" prov={d.provenance['google_rating']?.source} sourceLabels={sourceLabels}>
                {lead.google_rating ? `${Number(lead.google_rating).toFixed(1)} ★` : '—'}
              </Row>
              <Row label="Reviews" prov={d.provenance['google_review_count']?.source} sourceLabels={sourceLabels}>
                {formatNumber(lead.google_review_count)}
              </Row>
              <Row label="Category" sourceLabels={sourceLabels}>{String(lead.google_category ?? '—')}</Row>
              <Row label="Employees" prov={d.provenance['employee_count']?.source} sourceLabels={sourceLabels}>
                {lead.employee_count ? `${formatNumber(lead.employee_count)}${lead.employee_count_basis ? ` (${String(lead.employee_count_basis)})` : ''}` : '—'}
              </Row>
              <Row label="Companies House" prov={d.provenance['companies_house_number']?.source} sourceLabels={sourceLabels}>
                {lead.companies_house_number
                  ? `${String(lead.companies_house_number)} · ${String(lead.company_status ?? 'status unknown')}${lead.year_established ? ` · est. ${String(lead.year_established)}` : ''}`
                  : '—'}
              </Row>
            </dl>
            {d.opening_hours ? (
              <details className="mt-3">
                <summary className="cursor-pointer text-xs text-ink-muted">Opening hours</summary>
                <ul className="mt-1.5 flex flex-col gap-0.5 text-xs text-ink-soft">
                  {d.opening_hours.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </details>
            ) : null}
          </Section>

          <Section title="Services & signals">
            <div className="flex flex-wrap gap-1.5">
              {services.length === 0 ? <span className="text-sm text-ink-muted">None detected.</span> : null}
              {services.map(([field, label]) => (
                <span key={field} className="chip">{label}</span>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {marketing.map(([field, label]) => (
                <span key={field} className="chip">{label}</span>
              ))}
              {lead.booking_software ? <span className="chip">{String(lead.booking_software)}</span> : null}
            </div>
            {lead.website_quality_score !== null && lead.website_quality_score !== undefined ? (
              <p className="mt-3 text-xs text-ink-muted">
                Website quality score {String(lead.website_quality_score)}/100
                {d.marketing_signals.length > 0 ? ` · detected: ${d.marketing_signals.join(', ')}` : ''}
              </p>
            ) : (
              <p className="mt-3 text-xs text-ink-muted">Website not analysed yet — run enrichment to fill this in.</p>
            )}
          </Section>

          <Section title="Why this score" description={`${d.score.score}/100 · ${d.score.band.action}`}>
            <ul className="flex flex-col gap-1">
              {d.score.breakdown
                .filter((rule) => rule.matched)
                .sort((a, b) => b.applied - a.applied)
                .map((rule) => (
                  <li key={rule.id} className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="text-ink-soft">{rule.label}</span>
                    <span className={`tabular-nums font-medium ${rule.applied < 0 ? 'text-critical' : 'text-ink'}`}>
                      {rule.applied > 0 ? '+' : ''}
                      {rule.applied}
                    </span>
                  </li>
                ))}
            </ul>
            {d.score.rawScore > d.score.score ? (
              <p className="mt-2 text-xs text-ink-muted">Capped at {d.score.score} (raw total {d.score.rawScore}).</p>
            ) : null}
            <details className="mt-3">
              <summary className="cursor-pointer text-xs text-ink-muted">Rules that did not apply</summary>
              <ul className="mt-1.5 flex flex-col gap-1">
                {d.score.breakdown
                  .filter((rule) => !rule.matched)
                  .map((rule) => (
                    <li key={rule.id} className="flex items-baseline justify-between gap-2 text-xs text-ink-muted">
                      <span>{rule.label}</span>
                      <span className="tabular-nums">+{rule.points}</span>
                    </li>
                  ))}
              </ul>
            </details>
          </Section>

          <Section title="Follow-up">
            <dl className="flex flex-col gap-2 text-sm">
              <Row label="Follow-up" sourceLabels={sourceLabels}>
                {lead.follow_up_date ? `${formatDate(lead.follow_up_date as string)} (${relativeDays(lead.follow_up_date as string)})` : '—'}
              </Row>
              <Row label="Next action" sourceLabels={sourceLabels}>{String(lead.next_action ?? '—')}</Row>
              <Row label="Notes" sourceLabels={sourceLabels}>{String(lead.follow_up_notes ?? '—')}</Row>
            </dl>
            <div className="mt-3">
              <label className="label mb-1">Move to status</label>
              <select
                className="input py-1.5"
                value={lead.status}
                onChange={(e) => run('status', () => api.post(`/leads/${lead.id}/status`, { status: e.target.value, reason: 'Changed manually' }))}
              >
                {Object.entries(statusLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </Section>

          <Section title="Data protection">
            <p className="text-xs text-ink-muted">
              Fields marked <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent align-middle" /> were found
              automatically; <span className="inline-block h-1.5 w-1.5 rounded-full bg-warning align-middle" /> means you
              typed them. Nothing is inferred or filled in with a guess.
            </p>
            {!lead.do_not_call ? (
              <button
                type="button"
                className="btn btn-danger mt-3 w-full"
                disabled={busy !== null}
                onClick={() => {
                  const reason = window.prompt('Why should this business not be called again?');
                  if (!reason) return;
                  void run('dnc', () => api.post(`/leads/${lead.id}/do-not-call`, { reason }));
                }}
              >
                Mark do-not-call
              </button>
            ) : null}
            <p className="mt-2 text-xs text-ink-muted">
              Adds the number to the suppression list so a future import cannot resurrect it.
            </p>
          </Section>

          {d.enrichmentRuns.length > 0 ? (
            <Section title="Enrichment log">
              <ul className="flex flex-col gap-1.5">
                {d.enrichmentRuns.slice(0, 8).map((run_) => (
                  <li key={run_.id} className="text-xs text-ink-muted">
                    <span className="font-medium text-ink-soft">{titleCase(run_.provider)}</span> · {run_.status} ·{' '}
                    {formatDateTime(run_.started_at)}
                    {run_.message ? <span className="block">{run_.message}</span> : null}
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Row({ label, prov, sourceLabels, children }: {
  label: string;
  prov?: string;
  sourceLabels: Record<string, string>;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-xs uppercase tracking-wide text-ink-muted">
        {label}
        <ProvenanceDot source={prov} sourceLabels={sourceLabels} />
      </dt>
      <dd className="min-w-0 truncate text-right text-ink-soft">{children}</dd>
    </div>
  );
}

const EDITABLE: Array<[string, string, 'text' | 'number' | 'textarea']> = [
  ['company_name', 'Company name', 'text'],
  ['owner_name', 'Owner / director', 'text'],
  ['phone', 'Phone', 'text'],
  ['email', 'Email', 'text'],
  ['website', 'Website', 'text'],
  ['address_line', 'Address', 'text'],
  ['city', 'Town / city', 'text'],
  ['postcode', 'Postcode', 'text'],
  ['employee_count', 'Employees', 'number'],
  ['notes', 'Notes', 'textarea'],
];

function Editor({ detail, onSaved }: { detail: LeadDetailData; onSaved: () => void }) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(EDITABLE.map(([field]) => [field, String(detail.lead[field] ?? '')])),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const patch: Record<string, unknown> = {};
      for (const [field, , kind] of EDITABLE) {
        const raw = values[field] ?? '';
        const original = String(detail.lead[field] ?? '');
        if (raw === original) continue;
        patch[field] = raw === '' ? null : kind === 'number' ? Number(raw) : raw;
      }
      if (Object.keys(patch).length > 0) await api.patch(`/leads/${detail.lead.id}`, patch);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Section title="Edit details" description="Anything you type here is marked as manually entered and is never overwritten by enrichment.">
      <div className="grid gap-3 sm:grid-cols-2">
        {EDITABLE.map(([field, label, kind]) => (
          <div key={field} className={kind === 'textarea' ? 'sm:col-span-2' : ''}>
            <Field label={label}>
              {kind === 'textarea' ? (
                <textarea
                  className="input min-h-[4rem]"
                  value={values[field] ?? ''}
                  onChange={(e) => setValues({ ...values, [field]: e.target.value })}
                />
              ) : (
                <input
                  className="input"
                  type={kind}
                  value={values[field] ?? ''}
                  onChange={(e) => setValues({ ...values, [field]: e.target.value })}
                />
              )}
            </Field>
          </div>
        ))}
      </div>
      {error ? <div className="mt-3"><ErrorNote message={error} /></div> : null}
      <button type="button" className="btn btn-primary mt-3" onClick={save} disabled={saving}>
        {saving ? 'Saving…' : 'Save changes'}
      </button>
    </Section>
  );
}
