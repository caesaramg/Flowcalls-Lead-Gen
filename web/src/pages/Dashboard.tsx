import { Link, useNavigate } from 'react-router-dom';
import { BarList, Meter, StatTile } from '../components/charts';
import { ErrorNote, ScoreBadge, Section, Spinner } from '../components/ui';
import { bandColorVar, formatDate, formatMoney, formatNumber, formatPercent, titleCase } from '../lib/format';
import { useApi } from '../lib/useApi';
import type { DashboardStats, LeadListItem, Meta } from '../lib/types';

const BAND_ORDER = ['Priority', 'Good', 'Test', 'Low Priority'];

/** Pipeline reads as a sequence, so the bars follow the stages, not the counts. */
const STATUS_ORDER = [
  'new', 'enriched', 'priority', 'ready_to_call', 'called', 'follow_up',
  'demo_booked', 'proposal', 'won', 'lost', 'not_suitable',
];

export default function Dashboard() {
  const stats = useApi<DashboardStats>('/dashboard');
  const queue = useApi<{ leads: LeadListItem[] }>('/call-queue?limit=8');
  const meta = useApi<Meta>('/meta');
  const navigate = useNavigate();

  if (stats.loading) return <Spinner label="Loading dashboard…" />;
  if (stats.error) return <ErrorNote message={stats.error} />;
  if (!stats.data) return null;

  const d = stats.data;
  const nextUp = queue.data?.leads ?? [];
  const statusLabels = meta.data?.statuses ?? {};
  const tradeLabels = meta.data?.trades ?? {};

  const bandData = BAND_ORDER.filter((band) => d.byBand.some((b) => b.value === band)).map((band) => ({
    label: band,
    value: d.byBand.find((b) => b.value === band)?.count ?? 0,
    color: bandColorVar(band),
  }));

  return (
    <div className="flex flex-col gap-6">
      {/* Who should I call next? — the question the dashboard exists to answer. */}
      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-ink">Who should I call next?</h2>
            <p className="mt-0.5 text-xs text-ink-muted">
              Overdue follow-ups first, then the highest-scoring prospects you have not worked yet.
            </p>
          </div>
          <Link to="/call" className="btn btn-primary">
            Start calling
          </Link>
        </div>

        {queue.loading ? (
          <Spinner />
        ) : nextUp.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-ink-muted">
            Nothing in the queue. Import prospects or clear a filter to get started.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {nextUp.map((lead) => (
              <li key={lead.id}>
                <Link
                  to={`/leads/${lead.id}`}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 hover:bg-sunken"
                >
                  <ScoreBadge score={lead.score} band={lead.score_band} />
                  <span className="min-w-[14rem] flex-1 truncate text-sm font-medium text-ink">
                    {lead.company_name}
                  </span>
                  <span className="text-sm text-ink-muted">{lead.city ?? '—'}</span>
                  <span className="font-mono text-sm text-ink-soft">{lead.phone_display ?? '—'}</span>
                  <span className="text-xs text-ink-muted">{lead.reason}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Pipeline headline numbers */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <StatTile label="Total prospects" value={formatNumber(d.totals.prospects)} sub={`${formatNumber(d.totals.withPhone)} with a phone number`} />
        <StatTile label="Enriched" value={formatNumber(d.totals.enriched)} sub={`${formatNumber(d.totals.testCalled)} phone-tested`} />
        <StatTile label="Priority prospects" value={formatNumber(d.totals.priority)} sub="Score 80+" />
        <StatTile label="Calls made" value={formatNumber(d.activity.callsMade)} sub={`${formatNumber(d.activity.callsToday)} today`} />
        <StatTile
          label="Follow-ups due"
          value={formatNumber(d.activity.followUpsDue)}
          sub={`${formatNumber(d.activity.followUpsNext7Days)} due in the next 7 days`}
          tone={d.activity.followUpsDue > 0 ? 'warning' : 'default'}
        />
        <StatTile label="Average score" value={d.quality.averageScore} sub={`Median reviews ${formatNumber(d.quality.medianReviewCount)}`} />
      </div>

      {/* Conversion */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <StatTile label="Contact rate" value={formatPercent(d.rates.contactRate)} sub={`${d.activity.leadsContacted}/${d.activity.leadsCalled} leads reached`} />
        <StatTile label="Interested rate" value={formatPercent(d.rates.interestedRate)} sub={`${d.activity.leadsInterested} showed interest`} />
        <StatTile label="Demos booked" value={formatNumber(d.activity.demosBooked)} />
        <StatTile label="Customers won" value={formatNumber(d.activity.customersWon)} tone={d.activity.customersWon > 0 ? 'good' : 'default'} />
        <StatTile label="Conversion rate" value={formatPercent(d.rates.conversionRate)} sub="Won ÷ leads called" />
        <StatTile
          label="Revenue won"
          value={formatMoney(d.value.monthlyRevenueWon)}
          sub={`${formatMoney(d.value.annualisedRevenueWon)} annualised`}
          tone={d.value.monthlyRevenueWon > 0 ? 'good' : 'default'}
        />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-3">
        <Section title="Prospects by score band" description="Ordered scale, so the bars use a single-hue ramp.">
          <BarList data={bandData} onSelect={(datum) => navigate(`/leads?band=${encodeURIComponent(datum.label)}`)} />
        </Section>

        <Section title="Prospects by city" description="Top 15 locations.">
          <BarList
            data={d.byCity.map((b) => ({ label: b.value, value: b.count }))}
            onSelect={(datum) => navigate(`/leads?city=${encodeURIComponent(datum.label)}`)}
          />
        </Section>

        <Section title="Prospects by trade">
          <BarList
            data={d.byTrade.map((b) => ({ label: tradeLabels[b.value] ?? titleCase(b.value), value: b.count }))}
          />
        </Section>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Section title="Pipeline" description="Where every prospect currently sits.">
          <BarList
            data={[...d.byStatus]
              .sort((a, b) => STATUS_ORDER.indexOf(a.value) - STATUS_ORDER.indexOf(b.value))
              .map((b) => ({ label: statusLabels[b.value] ?? titleCase(b.value), value: b.count }))}
            onSelect={(datum) => {
              const key = Object.entries(statusLabels).find(([, label]) => label === datum.label)?.[0];
              if (key) navigate(`/leads?status=${key}`);
            }}
          />
        </Section>

        <Section title="Working the list" description={`Snapshot taken ${formatDate(d.generatedAt)}.`}>
          <div className="flex flex-col gap-4">
            <Meter
              label="Prospects enriched"
              value={d.totals.enriched}
              max={Math.max(1, d.totals.prospects)}
              caption="Run enrichment to fill in Google data, marketing signals and company details."
            />
            <Meter
              label="Phone-tested"
              value={d.totals.testCalled}
              max={Math.max(1, d.totals.prospects)}
              caption="Your test calls are the single biggest input to the opportunity score."
            />
            <Meter
              label="Prospects called"
              value={d.activity.leadsCalled}
              max={Math.max(1, d.totals.prospects)}
            />
            {d.totals.doNotCall > 0 ? (
              <p className="rounded-lg border border-line bg-sunken px-3 py-2 text-xs text-ink-soft">
                {formatNumber(d.totals.doNotCall)} prospect(s) are marked do-not-call and are excluded from the
                queue and default lists.
              </p>
            ) : null}
          </div>
        </Section>
      </div>
    </div>
  );
}
