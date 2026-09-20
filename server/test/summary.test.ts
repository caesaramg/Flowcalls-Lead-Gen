import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildOpeningLine, buildPersonalisation, callReason } from '../src/domain/summary.js';
import type { LeadRow } from '../src/domain/types.js';

function lead(overrides: Partial<LeadRow> = {}): LeadRow {
  return {
    id: 1,
    created_at: '2026-09-01T09:00:00.000Z',
    updated_at: '2026-09-01T09:00:00.000Z',
    status: 'new',
    status_changed_at: '2026-09-01T09:00:00.000Z',
    company_name: 'ABC Heating Ltd',
    website: null, phone: null, phone_e164: null, email: null,
    address_line: null, city: null, postcode: null, region: null, country: 'United Kingdom',
    trade: null, companies_house_number: null, company_status: null,
    year_established: null, employee_count: null, employee_count_basis: null,
    owner_name: null, owner_role: null,
    google_place_id: null, google_rating: null, google_review_count: null,
    google_maps_url: null, google_category: null, google_description: null,
    opening_hours: null, opens_24_7: 0,
    svc_plumbing: 0, svc_heating: 0, svc_boiler_repair: 0, svc_boiler_install: 0,
    svc_emergency: 0, svc_drainage: 0, svc_commercial: 0, svc_domestic: 0,
    svc_24_7: 0, svc_gas_safe: 0, svc_bathrooms: 0, svc_other: null,
    has_website: 0, has_google_ads: 0, has_facebook: 0, has_instagram: 0, has_linkedin: 0,
    has_online_booking: 0, has_contact_form: 0, has_live_chat: 0,
    booking_software: null, marketing_signals: null, website_quality_score: null,
    facebook_url: null, instagram_url: null, linkedin_url: null,
    test_call_attempted: 0, test_call_at: null, test_call_outcome: null,
    test_call_answered: null, test_call_ring_seconds: null, test_call_out_of_hours: 0,
    test_call_ooh_failure: 0, test_call_poor_handling: 0, test_call_booking_taken: 0,
    test_call_notes: null,
    score: 0, score_band: 'Low Priority', score_breakdown: null, scored_at: null,
    scoring_config_version: null,
    summary: null, opening_line: null, summary_generated_at: null,
    last_called_at: null, last_call_outcome: null, call_count: 0,
    follow_up_date: null, follow_up_notes: null, next_action: null,
    contract_value: null, notes: null,
    do_not_call: 0, do_not_call_reason: null, do_not_call_at: null,
    tps_screened_at: null, tps_status: null,
    source: 'csv', source_ref: null, import_batch_id: null, enriched_at: null,
    dedupe_key: 'name:abc-heating|',
    ...overrides,
  } as LeadRow;
}

describe('buildPersonalisation', () => {
  it('writes the briefing from the brief’s worked example', () => {
    const { summary } = buildPersonalisation(
      lead({
        company_name: 'ABC Heating Ltd',
        city: 'Manchester',
        trade: 'heating_engineer',
        google_review_count: 426,
        google_rating: 4.8,
        svc_emergency: 1,
        svc_24_7: 1,
        svc_boiler_repair: 1,
        has_google_ads: 1,
        has_website: 1,
        website_quality_score: 72,
        test_call_attempted: 1,
        test_call_outcome: 'voicemail',
        test_call_at: '2026-09-12T18:42:00.000Z',
      }),
    );

    assert.match(summary, /ABC Heating Ltd is a Manchester-based heating company with 426 Google reviews and a 4\.8 rating\./);
    assert.match(summary, /They advertise emergency callouts, 24\/7 availability and boiler repairs\./);
    assert.match(summary, /Google Ads detected/);
    assert.match(summary, /No online booking system found/);
    assert.match(summary, /Manual test call at 19:42 on 12 Sept went to voicemail\./);
  });

  it('leaves out every fact it does not have', () => {
    const { summary, talkingPoints } = buildPersonalisation(lead());
    assert.equal(summary, 'ABC Heating Ltd is a business.');
    assert.ok(!summary.includes('undefined'));
    assert.ok(!summary.includes('null'));
    assert.ok(!summary.includes('NaN'));
    assert.deepEqual(talkingPoints, []);
  });

  it('never claims a website lacks something when the site was not analysed', () => {
    const notCrawled = buildPersonalisation(lead({ has_website: 1, website: 'https://x.example.com' })).summary;
    assert.ok(!/No online booking/i.test(notCrawled));
    assert.ok(!/No Google Ads/i.test(notCrawled));

    const crawled = buildPersonalisation(lead({ has_website: 1, website_quality_score: 40 })).summary;
    assert.match(crawled, /No online booking system found/);
    assert.match(crawled, /No Google Ads tracking found/);
  });

  it('reports the exact number of reviews, never a rounded guess', () => {
    const { summary } = buildPersonalisation(lead({ google_review_count: 1 }));
    assert.match(summary, /1 Google review\b/);
    assert.ok(!summary.includes('1 Google reviews'));
  });
});

describe('buildOpeningLine', () => {
  it('uses the owner’s first name when the register gave us one', () => {
    const line = buildOpeningLine(lead({ owner_name: 'SMITH, John Andrew', svc_emergency: 1, svc_boiler_repair: 1 }));
    assert.match(line, /^Hi John, I came across ABC Heating Ltd and noticed you offer emergency boiler callouts\./);
    assert.match(line, /wanted to ask you something…$/);
  });

  it('falls back to asking for the company when there is no name', () => {
    const line = buildOpeningLine(lead({ svc_emergency: 1 }));
    assert.match(line, /^Hi, is that ABC Heating Ltd\?/);
    assert.ok(!line.includes('undefined'));
  });

  it('picks the strongest hook it can actually support', () => {
    assert.match(buildOpeningLine(lead({ svc_24_7: 1 })), /cover 24\/7 callouts/);
    assert.match(buildOpeningLine(lead({ has_google_ads: 1 })), /running Google Ads/);
    assert.match(buildOpeningLine(lead({ google_review_count: 426 })), /over 400 Google reviews/);
    assert.match(buildOpeningLine(lead({ city: 'Leeds' })), /around Leeds/);
    assert.match(buildOpeningLine(lead()), /looking at plumbing and heating firms\./);
  });
});

describe('callReason', () => {
  it('says in one line why this lead is in the queue', () => {
    assert.match(callReason(lead({ follow_up_date: '2026-10-01' })), /^Follow-up due/);
    assert.equal(callReason(lead({ test_call_outcome: 'no_answer' })), 'Test call went unanswered');
    assert.equal(callReason(lead({ test_call_outcome: 'voicemail' })), 'Test call went to voicemail');
    assert.equal(callReason(lead({ has_google_ads: 1 })), 'Running Google Ads');
    assert.equal(callReason(lead({ google_review_count: 300 })), '300 Google reviews');
    assert.equal(callReason(lead({ score: 42 })), 'Score 42');
  });
});
