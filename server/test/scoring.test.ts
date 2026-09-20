import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_SCORING_CONFIG } from '../src/domain/scoring-default.js';
import {
  bandFor,
  evaluateCondition,
  scoreLead,
  topReasons,
  validateScoringConfig,
  type ScoringConfig,
} from '../src/domain/scoring.js';

const config = DEFAULT_SCORING_CONFIG;

function lead(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    svc_emergency: 0,
    svc_24_7: 0,
    opens_24_7: 0,
    svc_boiler_install: 0,
    svc_commercial: 0,
    svc_heating: 0,
    employee_count: null,
    google_review_count: null,
    google_rating: null,
    has_google_ads: 0,
    has_website: 0,
    has_facebook: 0,
    has_instagram: 0,
    has_linkedin: 0,
    has_online_booking: 0,
    website_quality_score: null,
    test_call_outcome: null,
    test_call_ooh_failure: 0,
    test_call_poor_handling: 0,
    ...overrides,
  };
}

describe('evaluateCondition', () => {
  it('handles the comparison operators', () => {
    const l = lead({ google_review_count: 120, test_call_outcome: 'voicemail' });
    assert.equal(evaluateCondition({ field: 'google_review_count', op: 'gte', value: 100 }, l), true);
    assert.equal(evaluateCondition({ field: 'google_review_count', op: 'gte', value: 500 }, l), false);
    assert.equal(evaluateCondition({ field: 'test_call_outcome', op: 'eq', value: 'voicemail' }, l), true);
    assert.equal(evaluateCondition({ field: 'test_call_outcome', op: 'in', value: ['no_answer', 'voicemail'] }, l), true);
    assert.equal(evaluateCondition({ field: 'google_rating', op: 'not_null' }, l), false);
  });

  it('treats a missing numeric field as "does not match", never as zero', () => {
    const l = lead({ employee_count: null });
    assert.equal(evaluateCondition({ field: 'employee_count', op: 'gte', value: 5 }, l), false);
    assert.equal(evaluateCondition({ field: 'employee_count', op: 'lte', value: 5 }, l), false);
  });

  it('composes with all / any / not', () => {
    const l = lead({ svc_emergency: 1, has_website: 0 });
    assert.equal(evaluateCondition({ all: [{ field: 'svc_emergency', op: 'is_true' }, { field: 'has_website', op: 'is_true' }] }, l), false);
    assert.equal(evaluateCondition({ any: [{ field: 'svc_emergency', op: 'is_true' }, { field: 'has_website', op: 'is_true' }] }, l), true);
    assert.equal(evaluateCondition({ not: { field: 'has_website', op: 'is_true' } }, l), true);
  });
});

describe('scoreLead with the default weights', () => {
  it('scores a cold, unknown business at zero', () => {
    assert.equal(scoreLead(lead(), config).score, 0);
  });

  it('applies the brief’s weights exactly', () => {
    assert.equal(scoreLead(lead({ svc_emergency: 1 }), config).score, 15);
    assert.equal(scoreLead(lead({ svc_24_7: 1 }), config).score, 15);
    assert.equal(scoreLead(lead({ svc_boiler_install: 1, svc_heating: 1 }), config).score, 10);
    assert.equal(scoreLead(lead({ employee_count: 5 }), config).score, 10);
    assert.equal(scoreLead(lead({ google_review_count: 100 }), config).score, 10);
    assert.equal(scoreLead(lead({ has_google_ads: 1 }), config).score, 15);
    assert.equal(scoreLead(lead({ has_website: 1 }), config).score, 5);
    assert.equal(scoreLead(lead({ test_call_outcome: 'no_answer' }), config).score, 25);
    assert.equal(scoreLead(lead({ test_call_outcome: 'voicemail' }), config).score, 20);
    assert.equal(scoreLead(lead({ test_call_ooh_failure: 1 }), config).score, 20);
    assert.equal(scoreLead(lead({ test_call_poor_handling: 1 }), config).score, 15);
  });

  it('stacks the 500+ review bonus on top of the 100+ rule', () => {
    assert.equal(scoreLead(lead({ google_review_count: 500 }), config).score, 15);
  });

  it('caps the total at 100', () => {
    const excellent = lead({
      svc_emergency: 1, svc_24_7: 1, svc_boiler_install: 1, employee_count: 12,
      google_review_count: 600, google_rating: 4.9, has_google_ads: 1, has_website: 1,
      has_facebook: 1, test_call_outcome: 'no_answer', test_call_ooh_failure: 1,
    });
    const result = scoreLead(excellent, config);
    assert.equal(result.score, 100);
    assert.ok(result.rawScore > 100, 'the raw total should exceed the cap');
    assert.equal(result.band.label, 'Priority');
  });

  it('reports which rules fired, and which did not', () => {
    const result = scoreLead(lead({ svc_emergency: 1, has_google_ads: 1 }), config);
    const fired = result.breakdown.filter((r) => r.matched).map((r) => r.id);
    assert.deepEqual(fired.sort(), ['emergency_service', 'google_ads']);
    assert.ok(result.breakdown.some((r) => !r.matched), 'unmatched rules stay in the breakdown so the UI can explain them');
    assert.deepEqual(topReasons(result, 5).sort(), ['Emergency service', 'Google Ads detected']);
  });

  it('ignores rules that are switched off', () => {
    const withNegative: ScoringConfig = {
      ...config,
      rules: config.rules.map((r) => (r.id === 'already_has_answering_service' ? { ...r, enabled: true } : r)),
    };
    const l = lead({ svc_emergency: 1, test_call_outcome: 'human_receptionist' });
    assert.equal(scoreLead(l, config).score, 15, 'disabled by default');
    assert.equal(scoreLead(l, withNegative).score, 0, 'enabled: 15 - 20, floored at 0');
  });
});

describe('bands', () => {
  it('matches the priority thresholds from the brief', () => {
    assert.equal(bandFor(config, 100).label, 'Priority');
    assert.equal(bandFor(config, 80).label, 'Priority');
    assert.equal(bandFor(config, 79).label, 'Good');
    assert.equal(bandFor(config, 60).label, 'Good');
    assert.equal(bandFor(config, 59).label, 'Test');
    assert.equal(bandFor(config, 40).label, 'Test');
    assert.equal(bandFor(config, 39).label, 'Low Priority');
    assert.equal(bandFor(config, 0).label, 'Low Priority');
  });
});

describe('validateScoringConfig', () => {
  it('accepts the shipped default', () => {
    assert.deepEqual(validateScoringConfig(config), []);
  });

  it('rejects the mistakes a hand-edited config actually makes', () => {
    assert.ok(validateScoringConfig({ ...config, rules: [] }).length > 0, 'no rules');
    assert.ok(
      validateScoringConfig({ ...config, rules: [{ ...config.rules[0]!, points: 'ten' }] }).some((e) => e.includes('points')),
    );
    assert.ok(
      validateScoringConfig({ ...config, rules: [config.rules[0]!, config.rules[0]!] }).some((e) => e.includes('duplicate')),
    );
    assert.ok(
      validateScoringConfig({
        ...config,
        rules: [{ ...config.rules[0]!, when: { field: 'x', op: 'sideways' } }],
      }).some((e) => e.includes('op')),
    );
    assert.ok(
      validateScoringConfig({
        ...config,
        rules: [{ ...config.rules[0]!, when: { field: 'x', op: 'gte' } }],
      }).some((e) => e.includes('value')),
    );
  });
});
