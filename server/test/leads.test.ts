import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { openTestDatabase, type Db } from '../src/db/index.js';
import {
  applyFieldUpdates,
  applySuppressionList,
  buildDedupeKey,
  clearDoNotCall,
  getCalls,
  getLead,
  getProvenance,
  getStatusEvents,
  recordCall,
  recordTestCall,
  regeneratePersonalisation,
  setDoNotCall,
  setStatus,
  upsertLead,
} from '../src/domain/leads.js';
import { callQueue, listLeads } from '../src/domain/lead-query.js';
import { dashboardStats } from '../src/domain/dashboard.js';
import { getActiveScoringConfig, rescoreAll, rescoreLead } from '../src/domain/scoring-store.js';

let db: Db;

beforeEach(() => {
  db = openTestDatabase();
  getActiveScoringConfig(db); // installs the default scoring config
});

function seed(overrides: Record<string, unknown> = {}) {
  const result = upsertLead(
    db,
    {
      company_name: 'Northgate Plumbing & Heating',
      phone: '0161 496 0001',
      website: 'https://northgate-plumbing.example.com',
      city: 'Manchester',
      postcode: 'M20 2RN',
      google_review_count: 210,
      google_rating: 4.7,
      svc_emergency: 1,
      ...overrides,
    } as { company_name: string },
    { source: 'csv' },
  );
  // Every real entry point (CSV import, API, enrichment) scores on the way in.
  const { config } = getActiveScoringConfig(db);
  rescoreLead(db, getLead(db, result.id)!, config);
  return result;
}

describe('buildDedupeKey', () => {
  it('prefers the strongest identifier available', () => {
    assert.equal(
      buildDedupeKey({ company_name: 'A', google_place_id: 'PLACE1', phone: '0161 496 0001' }),
      'place:PLACE1',
    );
    assert.equal(buildDedupeKey({ company_name: 'A', phone: '0161 496 0001' }), 'phone:+441614960001');
    assert.equal(buildDedupeKey({ company_name: 'A', website: 'https://www.a.co.uk/x' }), 'site:a.co.uk');
    assert.match(buildDedupeKey({ company_name: 'A Ltd', city: 'Leeds' }), /^name:a\|leeds$/);
  });
});

describe('upsertLead', () => {
  it('creates a lead and records where each field came from', () => {
    const result = seed();
    assert.equal(result.created, true);

    const lead = getLead(db, result.id)!;
    assert.equal(lead.company_name, 'Northgate Plumbing & Heating');
    assert.equal(lead.phone_e164, '+441614960001');
    assert.equal(lead.postcode, 'M20 2RN');
    assert.equal(lead.region, 'North West', 'region is derived from the postcode');
    assert.equal(lead.has_website, 1, 'a website URL implies has_website');
    assert.equal(lead.status, 'new');

    const provenance = getProvenance(db, result.id);
    assert.equal(provenance['company_name']?.source, 'csv');
    assert.equal(provenance['phone']?.source, 'csv');
  });

  it('merges a second import of the same business rather than duplicating it', () => {
    const first = seed();
    const second = upsertLead(
      db,
      { company_name: 'Northgate Plumbing and Heating Ltd', phone: '+44 161 496 0001', email: 'info@northgate.example.com' } as { company_name: string },
      { source: 'csv' },
    );
    assert.equal(second.created, false);
    assert.equal(second.id, first.id);
    assert.equal(getLead(db, first.id)!.email, 'info@northgate.example.com', 'new fields are filled in');
    assert.equal(
      (db.prepare('SELECT COUNT(*) AS n FROM leads').get() as { n: number }).n,
      1,
    );
  });

  it('does not let an import overwrite a value that is already set', () => {
    const { id } = seed();
    upsertLead(db, { company_name: 'Northgate', phone: '0161 496 0001', city: 'Salford' } as { company_name: string }, { source: 'csv' });
    assert.equal(getLead(db, id)!.city, 'Manchester');
  });
});

describe('manual edits', () => {
  it('always beat automated enrichment', () => {
    const { id } = seed();
    applyFieldUpdates(db, id, { owner_name: 'Jane Okafor' }, { source: 'manual' });
    assert.equal(getProvenance(db, id)['owner_name']?.source, 'manual');

    const changed = applyFieldUpdates(
      db,
      id,
      { owner_name: 'SMITH, John' },
      { source: 'companies_house', overwriteExisting: true },
    );
    assert.deepEqual(changed, [], 'enrichment must not clobber a human edit');
    assert.equal(getLead(db, id)!.owner_name, 'Jane Okafor');
  });

  it('lets a human overwrite an enriched value', () => {
    const { id } = seed();
    applyFieldUpdates(db, id, { owner_name: 'SMITH, John' }, { source: 'companies_house' });
    applyFieldUpdates(db, id, { owner_name: 'Jane Okafor' }, { source: 'manual' });
    assert.equal(getLead(db, id)!.owner_name, 'Jane Okafor');
  });

  it('never lets a provider blank out an existing value', () => {
    const { id } = seed();
    applyFieldUpdates(db, id, { city: null }, { source: 'google_places', overwriteExisting: true });
    assert.equal(getLead(db, id)!.city, 'Manchester');
  });
});

describe('test calls', () => {
  it('rescore the lead immediately', () => {
    const { id } = seed();
    const before = getLead(db, id)!.score;
    recordTestCall(db, id, { outcome: 'no_answer', out_of_hours: true });
    const after = getLead(db, id)!;
    assert.equal(before, 35, 'emergency (+15), 100+ reviews (+10), strong Google presence (+5), website (+5)');
    assert.equal(after.score, before + 45, 'no answer (+25) and an out-of-hours failure (+20)');
    assert.equal(after.test_call_attempted, 1);
    assert.equal(after.test_call_ooh_failure, 1);
  });

  it('infer "answered" from the outcome when it is not stated', () => {
    const { id } = seed();
    recordTestCall(db, id, { outcome: 'human_receptionist' });
    assert.equal(getLead(db, id)!.test_call_answered, 1);
    recordTestCall(db, id, { outcome: 'voicemail', out_of_hours: true });
    const lead = getLead(db, id)!;
    assert.equal(lead.test_call_answered, 0);
    assert.equal(lead.test_call_ooh_failure, 1, 'unanswered out of hours is an out-of-hours failure');
  });
});

describe('sales calls', () => {
  it('move the lead through the pipeline and store the follow-up', () => {
    const { id } = seed();
    recordCall(db, id, { outcome: 'interested', follow_up_date: '2026-10-01', next_action: 'Send a recording' });

    const lead = getLead(db, id)!;
    assert.equal(lead.status, 'follow_up');
    assert.equal(lead.call_count, 1);
    assert.equal(lead.last_call_outcome, 'interested');
    assert.equal(lead.follow_up_date, '2026-10-01');
    assert.equal(getCalls(db, id).length, 1);

    recordCall(db, id, { outcome: 'demo_booked' });
    assert.equal(getLead(db, id)!.status, 'demo_booked');
    assert.equal(getLead(db, id)!.call_count, 2);
  });

  it('record every status change with a timestamp', () => {
    const { id } = seed();
    setStatus(db, id, 'ready_to_call', 'Queued for today');
    recordCall(db, id, { outcome: 'customer', contract_value: 199 });

    const events = getStatusEvents(db, id);
    assert.deepEqual(events.map((e) => e.to_status), ['won', 'ready_to_call', 'new']);
    assert.ok(events.every((e) => typeof e.changed_at === 'string' && e.changed_at.length > 0));
    assert.equal(getLead(db, id)!.contract_value, 199);
  });
});

describe('do-not-call', () => {
  it('suppresses the number and survives a re-import', () => {
    const { id } = seed();
    setDoNotCall(db, id, 'Asked not to be contacted');

    assert.equal(getLead(db, id)!.do_not_call, 1);
    assert.equal(
      (db.prepare('SELECT COUNT(*) AS n FROM suppression_list').get() as { n: number }).n,
      1,
    );

    // A later import re-adds the same business; the suppression sweep re-flags it.
    clearDoNotCall(db, id);
    db.prepare("INSERT INTO suppression_list (phone_e164, reason, source, added_at) VALUES ('+441614960001', 'TPS', 'tps', datetime('now'))").run();
    assert.equal(applySuppressionList(db), 1);
    assert.equal(getLead(db, id)!.do_not_call, 1);
  });

  it('keeps suppressed leads out of the call queue and default list', () => {
    const { id } = seed();
    recordTestCall(db, id, { outcome: 'no_answer' });
    assert.equal(callQueue(db).length, 1);

    setDoNotCall(db, id, 'Objected');
    assert.equal(callQueue(db).length, 0);
    assert.equal(listLeads(db, {}).total, 0);
    assert.equal(listLeads(db, { doNotCall: 'only' }).total, 1);
  });
});

describe('call queue', () => {
  it('puts overdue follow-ups ahead of higher-scoring cold leads', () => {
    const cold = seed({ company_name: 'Cold High Scorer', phone: '0161 496 0002' });
    recordTestCall(db, cold.id, { outcome: 'no_answer', out_of_hours: true });

    const warm = seed({ company_name: 'Warm Follow Up', phone: '0161 496 0003', svc_emergency: 0 });
    recordCall(db, warm.id, { outcome: 'interested', follow_up_date: '2020-01-01' });

    const queue = callQueue(db);
    assert.equal(queue[0]!.id, warm.id, 'the overdue follow-up comes first');
    assert.ok(getLead(db, cold.id)!.score > getLead(db, warm.id)!.score);
  });

  it('skips leads with no phone number and closed leads', () => {
    const noPhone = upsertLead(db, { company_name: 'No Phone Ltd', website: 'https://nophone.example.com' } as { company_name: string }, { source: 'csv' });
    const lost = seed({ company_name: 'Lost Ltd', phone: '0161 496 0004' });
    setStatus(db, lost.id, 'lost');

    const ids = callQueue(db).map((l) => l.id);
    assert.ok(!ids.includes(noPhone.id));
    assert.ok(!ids.includes(lost.id));
  });
});

describe('filters', () => {
  it('combine, and default to the highest score first', () => {
    seed({ company_name: 'Emergency Leeds', phone: '0113 496 0001', city: 'Leeds', postcode: 'LS11 9TA', has_google_ads: 1 });
    seed({ company_name: 'Quiet Leeds', phone: '0113 496 0002', city: 'Leeds', postcode: 'LS11 9TB', svc_emergency: 0, google_review_count: 4, google_rating: 3.1 });
    rescoreAll(db);

    assert.equal(listLeads(db, { city: ['Leeds'] }).total, 2);
    assert.equal(listLeads(db, { city: ['Leeds'], emergency: true }).total, 1);
    assert.equal(listLeads(db, { googleAds: true }).total, 1);
    assert.equal(listLeads(db, { reviewsMin: 100 }).total, 1, 'only the busy one clears 100 reviews');
    assert.equal(listLeads(db, { q: 'quiet' }).total, 1);
    assert.equal(listLeads(db, { q: '0113 496 0001' }).total, 1, 'searching by phone number works in any format');

    const rows = listLeads(db, { city: ['Leeds'] }).rows;
    assert.ok(rows[0]!.score >= rows[1]!.score, 'highest opportunity score first by default');
  });
});

describe('personalisation', () => {
  it('builds a summary from stored facts only', () => {
    const { id } = seed();
    const { summary } = regeneratePersonalisation(db, id);
    assert.match(summary, /Manchester-based/);
    assert.match(summary, /210 Google reviews/);
    assert.match(summary, /4\.7 rating/);
    assert.ok(!summary.includes('undefined') && !summary.includes('null'));
    assert.ok(!/online booking/i.test(summary), 'no claim about the website until it has been analysed');
  });
});

describe('dashboard', () => {
  it('counts activity and rates from the call log', () => {
    const a = seed({ company_name: 'A Ltd', phone: '0161 496 0011' });
    const b = seed({ company_name: 'B Ltd', phone: '0161 496 0012' });
    seed({ company_name: 'C Ltd', phone: '0161 496 0013' });

    recordCall(db, a.id, { outcome: 'no_answer' });
    recordCall(db, b.id, { outcome: 'customer', contract_value: 149 });

    const stats = dashboardStats(db);
    assert.equal(stats.totals.prospects, 3);
    assert.equal(stats.activity.callsMade, 2);
    assert.equal(stats.activity.callsToday, 2);
    assert.equal(stats.activity.leadsCalled, 2);
    assert.equal(stats.activity.leadsContacted, 1);
    assert.equal(stats.rates.contactRate, 50);
    assert.equal(stats.activity.customersWon, 1);
    assert.equal(stats.value.monthlyRevenueWon, 149);
    assert.equal(stats.value.annualisedRevenueWon, 1788);
  });
});
