import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CallLogger } from '../components/call-forms';
import { EmptyState, ErrorNote, ScoreBadge, Spinner } from '../components/ui';
import { formatNumber, telHref } from '../lib/format';
import { useApi } from '../lib/useApi';
import type { LeadDetail, LeadListItem, Meta } from '../lib/types';

/**
 * One prospect at a time, everything you need on screen, one tap to dial.
 * The Call button is a plain tel: link — the system never dials for you.
 */
export default function CallMode() {
  const queue = useApi<{ leads: LeadListItem[] }>('/call-queue?limit=40');
  const meta = useApi<Meta>('/meta');
  const [index, setIndex] = useState(0);

  const leads = queue.data?.leads ?? [];
  const current = leads[index];
  const detail = useApi<LeadDetail>(current ? `/leads/${current.id}` : null, [current?.id]);

  useEffect(() => {
    setIndex(0);
  }, [queue.data]);

  if (queue.loading) return <Spinner label="Building your call list…" />;
  if (queue.error) return <ErrorNote message={queue.error} />;

  if (leads.length === 0) {
    return (
      <EmptyState
        title="Nothing to call right now"
        hint="The queue holds overdue follow-ups and un-worked prospects with a phone number. Import or enrich some prospects to fill it."
        action={
          <Link to="/import" className="btn btn-primary mt-2">
            Import prospects
          </Link>
        }
      />
    );
  }

  if (!current) return null;

  function next() {
    setIndex((i) => Math.min(i + 1, leads.length - 1));
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <div className="flex items-center justify-between text-sm text-ink-muted">
        <span>
          Call {index + 1} of {leads.length}
        </span>
        <div className="flex gap-2">
          <button type="button" className="btn px-2 py-1 text-xs" disabled={index === 0} onClick={() => setIndex((i) => i - 1)}>
            Previous
          </button>
          <button type="button" className="btn px-2 py-1 text-xs" disabled={index >= leads.length - 1} onClick={next}>
            Skip
          </button>
        </div>
      </div>

      <div className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold text-ink">{current.company_name}</h1>
              <ScoreBadge score={current.score} band={current.score_band} />
            </div>
            <p className="mt-1 text-sm text-ink-muted">
              {[current.city, current.postcode].filter(Boolean).join(' · ')}
              {current.owner_name ? ` · ${current.owner_name}` : ''}
            </p>
            <p className="mt-1 text-sm font-medium text-accent">{current.reason}</p>
          </div>

          <a className="btn btn-primary px-6 py-4 text-lg" href={telHref(current.phone_e164) ?? '#'}>
            Call {current.phone_display}
          </a>
        </div>

        <div className="mt-4 grid gap-3 text-sm sm:grid-cols-4">
          <Fact label="Google">
            {current.google_rating ? `${current.google_rating.toFixed(1)} ★` : '—'}{' '}
            <span className="text-ink-muted">({formatNumber(current.google_review_count)})</span>
          </Fact>
          <Fact label="Emergency">{current.svc_emergency ? 'Yes' : '—'}</Fact>
          <Fact label="24/7">{current.svc_24_7 || current.opens_24_7 ? 'Yes' : '—'}</Fact>
          <Fact label="Google Ads">{current.has_google_ads ? 'Yes' : '—'}</Fact>
        </div>

        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-sm">
          {current.website ? (
            <a className="text-accent hover:underline" href={current.website} target="_blank" rel="noreferrer noopener">
              {current.website.replace(/^https?:\/\//, '')}
            </a>
          ) : null}
          {current.email ? (
            <a className="text-ink-soft hover:text-accent" href={`mailto:${current.email}`}>
              {current.email}
            </a>
          ) : null}
          <Link className="text-ink-soft hover:text-accent" to={`/leads/${current.id}`}>
            Full record →
          </Link>
        </div>
      </div>

      {detail.loading ? <Spinner label="Loading briefing…" /> : null}
      {detail.data ? (
        <>
          <div className="card p-5">
            <h2 className="label mb-2">Before you dial</h2>
            <p className="text-sm leading-relaxed text-ink">{detail.data.personalisation.summary}</p>
            <div className="mt-3 rounded-lg border border-accent/30 bg-accent/5 p-3">
              <p className="text-sm italic leading-relaxed text-ink">“{detail.data.personalisation.openingLine}”</p>
            </div>
            {detail.data.personalisation.talkingPoints.length > 0 ? (
              <ul className="mt-3 flex flex-col gap-1">
                {detail.data.personalisation.talkingPoints.map((point) => (
                  <li key={point} className="flex gap-2 text-sm text-ink-soft">
                    <span className="text-accent">•</span>
                    {point}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className="card p-5">
            <h2 className="label mb-3">How did it go?</h2>
            <CallLogger
              leadId={current.id}
              labels={meta.data?.callOutcomes ?? {}}
              onLogged={() => {
                if (index >= leads.length - 1) queue.reload();
                else next();
              }}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-sunken/50 px-3 py-2">
      <p className="label">{label}</p>
      <p className="mt-0.5 font-medium text-ink">{children}</p>
    </div>
  );
}
