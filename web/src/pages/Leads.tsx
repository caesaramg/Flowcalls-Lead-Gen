import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ErrorNote, ScoreBadge, Spinner, StatusBadge, Toggle, TriState } from '../components/ui';
import { formatDate, formatNumber, telHref, titleCase } from '../lib/format';
import { qs } from '../lib/api';
import { useApi } from '../lib/useApi';
import type { Facets, LeadsResponse, Meta } from '../lib/types';

const SORTS: Array<[string, string]> = [
  ['score', 'Opportunity score'],
  ['google_review_count', 'Review count'],
  ['google_rating', 'Google rating'],
  ['employee_count', 'Employees'],
  ['company_name', 'Company name'],
  ['city', 'City'],
  ['created_at', 'Date added'],
  ['follow_up_date', 'Follow-up date'],
  ['last_called_at', 'Last called'],
  ['status', 'Status'],
];

function useFilterState() {
  const [params, setParams] = useSearchParams();

  const get = (key: string) => params.get(key) ?? '';
  const getBool = (key: string): boolean | undefined => {
    const value = params.get(key);
    if (value === 'true') return true;
    if (value === 'false') return false;
    return undefined;
  };

  const set = (key: string, value: string | boolean | undefined) => {
    const next = new URLSearchParams(params);
    if (value === undefined || value === '' || value === null) next.delete(key);
    else next.set(key, String(value));
    if (key !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };

  const clear = () => setParams(new URLSearchParams(), { replace: true });

  return { params, get, getBool, set, clear };
}

export default function Leads() {
  const { params, get, getBool, set, clear } = useFilterState();
  const meta = useApi<Meta>('/meta');
  const facets = useApi<Facets>('/leads/facets');
  const [showFilters, setShowFilters] = useState(true);

  const query = useMemo(
    () =>
      qs({
        q: get('q'),
        status: get('status'),
        band: get('band'),
        city: get('city'),
        region: get('region'),
        trade: get('trade'),
        scoreMin: get('scoreMin'),
        ratingMin: get('ratingMin'),
        reviewsMin: get('reviewsMin'),
        employeesMin: get('employeesMin'),
        emergency: get('emergency'),
        service247: get('service247'),
        googleAds: get('googleAds'),
        hasWebsite: get('hasWebsite'),
        hasOnlineBooking: get('hasOnlineBooking'),
        callOutcome: get('callOutcome'),
        testOutcome: get('testOutcome'),
        followUpDue: get('followUpDue'),
        followUpFrom: get('followUpFrom'),
        followUpTo: get('followUpTo'),
        addedFrom: get('addedFrom'),
        addedTo: get('addedTo'),
        doNotCall: get('doNotCall'),
        sort: get('sort') || 'score',
        order: get('order') || 'desc',
        page: get('page') || '1',
        pageSize: 50,
      }),
    [params], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const leads = useApi<LeadsResponse>(`/leads${query}`);
  const statusLabels = meta.data?.statuses ?? {};
  const tradeLabels = meta.data?.trades ?? {};
  const callOutcomes = meta.data?.callOutcomes ?? {};
  const testOutcomes = meta.data?.testCallOutcomes ?? {};

  const page = Number(get('page') || '1');

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          className="input max-w-sm"
          placeholder="Search company, town, postcode, phone…"
          defaultValue={get('q')}
          onKeyDown={(e) => {
            if (e.key === 'Enter') set('q', (e.target as HTMLInputElement).value);
          }}
          onBlur={(e) => set('q', e.target.value)}
        />
        <button type="button" className="btn" onClick={() => setShowFilters((v) => !v)}>
          {showFilters ? 'Hide filters' : 'Show filters'}
        </button>
        <button type="button" className="btn" onClick={clear}>
          Reset
        </button>
        <div className="ml-auto flex items-center gap-2">
          <label className="label">Sort</label>
          <select className="input w-52 py-1.5" value={get('sort') || 'score'} onChange={(e) => set('sort', e.target.value)}>
            {SORTS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <select className="input w-32 py-1.5" value={get('order') || 'desc'} onChange={(e) => set('order', e.target.value)}>
            <option value="desc">High → low</option>
            <option value="asc">Low → high</option>
          </select>
          <a className="btn" href={`/api/leads/export.csv${query}`}>
            Export CSV
          </a>
        </div>
      </div>

      <div className={showFilters ? 'grid gap-4 lg:grid-cols-[17rem_1fr]' : ''}>
        {showFilters ? (
          <aside className="card flex flex-col gap-4 p-4">
            <div>
              <label className="label mb-1">Status</label>
              <select className="input py-1.5" value={get('status')} onChange={(e) => set('status', e.target.value)}>
                <option value="">Any status</option>
                {Object.entries(statusLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label mb-1">Score band</label>
              <select className="input py-1.5" value={get('band')} onChange={(e) => set('band', e.target.value)}>
                <option value="">Any band</option>
                {['Priority', 'Good', 'Test', 'Low Priority'].map((band) => (
                  <option key={band} value={band}>
                    {band}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label mb-1">Min score</label>
                <input className="input py-1.5" type="number" min={0} max={100} value={get('scoreMin')} onChange={(e) => set('scoreMin', e.target.value)} />
              </div>
              <div>
                <label className="label mb-1">Min rating</label>
                <input className="input py-1.5" type="number" step="0.1" min={0} max={5} value={get('ratingMin')} onChange={(e) => set('ratingMin', e.target.value)} />
              </div>
              <div>
                <label className="label mb-1">Min reviews</label>
                <input className="input py-1.5" type="number" min={0} value={get('reviewsMin')} onChange={(e) => set('reviewsMin', e.target.value)} />
              </div>
              <div>
                <label className="label mb-1">Min staff</label>
                <input className="input py-1.5" type="number" min={0} value={get('employeesMin')} onChange={(e) => set('employeesMin', e.target.value)} />
              </div>
            </div>

            <div>
              <label className="label mb-1">City</label>
              <select className="input py-1.5" value={get('city')} onChange={(e) => set('city', e.target.value)}>
                <option value="">Any city</option>
                {(facets.data?.cities ?? []).map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.value} ({c.count})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label mb-1">Region</label>
              <select className="input py-1.5" value={get('region')} onChange={(e) => set('region', e.target.value)}>
                <option value="">Any region</option>
                {(facets.data?.regions ?? []).map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.value} ({c.count})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label mb-1">Trade</label>
              <select className="input py-1.5" value={get('trade')} onChange={(e) => set('trade', e.target.value)}>
                <option value="">Any trade</option>
                {(facets.data?.trades ?? []).map((c) => (
                  <option key={c.value} value={c.value}>
                    {tradeLabels[c.value] ?? titleCase(c.value)} ({c.count})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-3">
              <TriState label="Emergency service" value={getBool('emergency')} onChange={(v) => set('emergency', v)} />
              <TriState label="24/7 service" value={getBool('service247')} onChange={(v) => set('service247', v)} />
              <TriState label="Google Ads" value={getBool('googleAds')} onChange={(v) => set('googleAds', v)} />
              <TriState label="Website" value={getBool('hasWebsite')} onChange={(v) => set('hasWebsite', v)} />
              <TriState label="Online booking" value={getBool('hasOnlineBooking')} onChange={(v) => set('hasOnlineBooking', v)} />
            </div>

            <div>
              <label className="label mb-1">Last call outcome</label>
              <select className="input py-1.5" value={get('callOutcome')} onChange={(e) => set('callOutcome', e.target.value)}>
                <option value="">Any outcome</option>
                {Object.entries(callOutcomes).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label mb-1">Test call outcome</label>
              <select className="input py-1.5" value={get('testOutcome')} onChange={(e) => set('testOutcome', e.target.value)}>
                <option value="">Any outcome</option>
                {Object.entries(testOutcomes).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label mb-1">Follow-up from</label>
                <input className="input py-1.5" type="date" value={get('followUpFrom')} onChange={(e) => set('followUpFrom', e.target.value)} />
              </div>
              <div>
                <label className="label mb-1">Follow-up to</label>
                <input className="input py-1.5" type="date" value={get('followUpTo')} onChange={(e) => set('followUpTo', e.target.value)} />
              </div>
              <div>
                <label className="label mb-1">Added from</label>
                <input className="input py-1.5" type="date" value={get('addedFrom')} onChange={(e) => set('addedFrom', e.target.value)} />
              </div>
              <div>
                <label className="label mb-1">Added to</label>
                <input className="input py-1.5" type="date" value={get('addedTo')} onChange={(e) => set('addedTo', e.target.value)} />
              </div>
            </div>

            <Toggle label="Only follow-ups due" checked={get('followUpDue') === 'true'} onChange={(v) => set('followUpDue', v ? 'true' : undefined)} />

            <div>
              <label className="label mb-1">Do-not-call</label>
              <select className="input py-1.5" value={get('doNotCall') || 'exclude'} onChange={(e) => set('doNotCall', e.target.value)}>
                <option value="exclude">Hidden (default)</option>
                <option value="include">Included</option>
                <option value="only">Only do-not-call</option>
              </select>
            </div>
          </aside>
        ) : null}

        <div className="min-w-0">
          {leads.loading ? <Spinner /> : null}
          {leads.error ? <ErrorNote message={leads.error} /> : null}

          {leads.data ? (
            <>
              <div className="mb-2 flex items-center justify-between text-sm text-ink-muted">
                <span>
                  {formatNumber(leads.data.total)} prospect{leads.data.total === 1 ? '' : 's'}
                </span>
                <span>
                  Page {leads.data.page} of {leads.data.pageCount}
                </span>
              </div>

              <div className="card overflow-x-auto">
                <table className="w-full min-w-[1100px] border-collapse">
                  <thead className="border-b border-line bg-sunken/60">
                    <tr>
                      <th className="th">Score</th>
                      <th className="th">Company</th>
                      <th className="th">Location</th>
                      <th className="th">Phone</th>
                      <th className="th">Google</th>
                      <th className="th">Signals</th>
                      <th className="th">Status</th>
                      <th className="th">Follow-up</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {leads.data.leads.map((lead) => (
                      <tr key={lead.id} className="hover:bg-sunken/60">
                        <td className="td">
                          <ScoreBadge score={lead.score} band={lead.score_band} />
                        </td>
                        <td className="td">
                          <Link to={`/leads/${lead.id}`} className="font-medium text-ink hover:text-accent">
                            {lead.company_name}
                          </Link>
                          {lead.do_not_call ? (
                            <span className="ml-2 rounded border border-critical/40 px-1 text-[10px] font-semibold uppercase text-critical">
                              Do not call
                            </span>
                          ) : null}
                          <div className="text-xs text-ink-muted">{lead.reason}</div>
                        </td>
                        <td className="td">
                          {lead.city ?? '—'}
                          <div className="text-xs text-ink-muted">{lead.postcode ?? ''}</div>
                        </td>
                        <td className="td font-mono">
                          {lead.phone_e164 && !lead.do_not_call ? (
                            <a className="hover:text-accent" href={telHref(lead.phone_e164)}>
                              {lead.phone_display}
                            </a>
                          ) : (
                            (lead.phone_display ?? '—')
                          )}
                        </td>
                        <td className="td tabular-nums">
                          {lead.google_rating ? `${lead.google_rating.toFixed(1)}★` : '—'}
                          <span className="ml-1 text-xs text-ink-muted">
                            {lead.google_review_count !== null ? `(${formatNumber(lead.google_review_count)})` : ''}
                          </span>
                        </td>
                        <td className="td min-w-[10rem]">
                          <div className="flex flex-wrap gap-1">
                            {lead.svc_emergency ? <span className="chip">Emergency</span> : null}
                            {lead.svc_24_7 || lead.opens_24_7 ? <span className="chip">24/7</span> : null}
                            {lead.has_google_ads ? <span className="chip">Ads</span> : null}
                            {lead.has_online_booking ? <span className="chip">Booking</span> : null}
                          </div>
                        </td>
                        <td className="td">
                          <StatusBadge status={lead.status} label={statusLabels[lead.status] ?? titleCase(lead.status)} />
                        </td>
                        <td className="td">{lead.follow_up_date ? formatDate(lead.follow_up_date) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {leads.data.leads.length === 0 ? (
                  <p className="px-4 py-10 text-center text-sm text-ink-muted">
                    No prospects match these filters.
                  </p>
                ) : null}
              </div>

              <div className="mt-3 flex items-center justify-center gap-2">
                <button type="button" className="btn" disabled={page <= 1} onClick={() => set('page', String(page - 1))}>
                  Previous
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={page >= leads.data.pageCount}
                  onClick={() => set('page', String(page + 1))}
                >
                  Next
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
