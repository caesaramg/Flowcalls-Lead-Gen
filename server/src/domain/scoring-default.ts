import type { ScoringConfig } from './scoring.js';

/**
 * Default Flowcalls Opportunity Score.
 *
 * These are the starting weights only — they are copied into the database on
 * first run and edited from Settings -> Scoring after that. Changing the numbers
 * here does not affect an existing database.
 */
export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  version: 1,
  cap: 100,
  floor: 0,
  bands: [
    { id: 'priority', label: 'Priority', min: 80, action: 'Strong potential customer. Call first.' },
    { id: 'good', label: 'Good', min: 60, action: 'Worth calling.' },
    { id: 'test', label: 'Test', min: 40, action: 'Lower priority.' },
    { id: 'low', label: 'Low Priority', min: 0, action: 'Do not prioritise.' },
  ],
  rules: [
    // ---- Business value -------------------------------------------------
    {
      id: 'emergency_service',
      label: 'Emergency service',
      group: 'Business value',
      points: 15,
      enabled: true,
      description: 'Advertises emergency or same-day callouts.',
      when: { field: 'svc_emergency', op: 'is_true' },
    },
    {
      id: 'service_24_7',
      label: '24/7 service',
      group: 'Business value',
      points: 15,
      enabled: true,
      description: 'Claims 24/7 or 24-hour availability, or Google shows "Open 24 hours".',
      when: { any: [{ field: 'svc_24_7', op: 'is_true' }, { field: 'opens_24_7', op: 'is_true' }] },
    },
    {
      id: 'high_value_services',
      label: 'High-value services',
      group: 'Business value',
      points: 10,
      enabled: true,
      description: 'Boiler installation, commercial work or heating installs — jobs typically £250+.',
      when: {
        any: [
          { field: 'svc_boiler_install', op: 'is_true' },
          { field: 'svc_commercial', op: 'is_true' },
          { field: 'svc_heating', op: 'is_true' },
        ],
      },
    },
    {
      id: 'team_of_five_plus',
      label: '5+ engineers',
      group: 'Business value',
      points: 10,
      enabled: true,
      description: 'Estimated employee/engineer count of 5 or more.',
      when: { field: 'employee_count', op: 'gte', value: 5 },
    },
    {
      id: 'reviews_100_plus',
      label: '100+ Google reviews',
      group: 'Business value',
      points: 10,
      enabled: true,
      when: { field: 'google_review_count', op: 'gte', value: 100 },
    },
    {
      id: 'reviews_500_plus',
      label: '500+ Google reviews',
      group: 'Business value',
      points: 5,
      enabled: true,
      description: 'Stacks on top of the 100+ reviews rule.',
      when: { field: 'google_review_count', op: 'gte', value: 500 },
    },
    {
      id: 'strong_google_presence',
      label: 'Strong Google presence',
      group: 'Business value',
      points: 5,
      enabled: true,
      description: 'Rating of 4.5+ with at least 50 reviews.',
      when: {
        all: [
          { field: 'google_rating', op: 'gte', value: 4.5 },
          { field: 'google_review_count', op: 'gte', value: 50 },
        ],
      },
    },

    // ---- Marketing activity ---------------------------------------------
    {
      id: 'google_ads',
      label: 'Google Ads detected',
      group: 'Marketing activity',
      points: 15,
      enabled: true,
      description: 'Google Ads conversion tag or ads remarketing tag found on the website.',
      when: { field: 'has_google_ads', op: 'is_true' },
    },
    {
      id: 'active_website',
      label: 'Active website',
      group: 'Marketing activity',
      points: 5,
      enabled: true,
      when: { field: 'has_website', op: 'is_true' },
    },
    {
      id: 'online_marketing_signals',
      label: 'Online marketing signals',
      group: 'Marketing activity',
      points: 5,
      enabled: true,
      description: 'Social profiles, online booking, or a well-built site (quality score 60+).',
      when: {
        any: [
          { field: 'has_facebook', op: 'is_true' },
          { field: 'has_instagram', op: 'is_true' },
          { field: 'has_linkedin', op: 'is_true' },
          { field: 'has_online_booking', op: 'is_true' },
          { field: 'website_quality_score', op: 'gte', value: 60 },
        ],
      },
    },

    // ---- Phone opportunity (from your manual test calls) -----------------
    {
      id: 'test_no_answer',
      label: 'No answer on test call',
      group: 'Phone opportunity',
      points: 25,
      enabled: true,
      when: { field: 'test_call_outcome', op: 'in', value: ['no_answer', 'engaged'] },
    },
    {
      id: 'test_voicemail',
      label: 'Voicemail on test call',
      group: 'Phone opportunity',
      points: 20,
      enabled: true,
      when: { field: 'test_call_outcome', op: 'eq', value: 'voicemail' },
    },
    {
      id: 'test_out_of_hours_failure',
      label: 'Out-of-hours failure',
      group: 'Phone opportunity',
      points: 20,
      enabled: true,
      description: 'Called outside advertised hours and nobody picked up.',
      when: { field: 'test_call_ooh_failure', op: 'is_true' },
    },
    {
      id: 'test_poor_handling',
      label: 'Poor call handling',
      group: 'Phone opportunity',
      points: 15,
      enabled: true,
      description: 'Answered, but slowly / abruptly / could not take the job.',
      when: { field: 'test_call_poor_handling', op: 'is_true' },
    },

    // ---- Optional extras (off by default; switch on in Settings) ---------
    {
      id: 'already_has_answering_service',
      label: 'Already uses an answering service',
      group: 'Phone opportunity',
      points: -20,
      enabled: false,
      description: 'Negative signal: a third-party receptionist already picks up.',
      when: { field: 'test_call_outcome', op: 'eq', value: 'human_receptionist' },
    },
    {
      id: 'mobile_only_number',
      label: 'Mobile number only',
      group: 'Phone opportunity',
      points: 5,
      enabled: false,
      description: 'An 07 number usually means the owner is answering calls personally.',
      when: { field: 'phone_kind', op: 'eq', value: 'mobile' },
    },
    {
      id: 'no_online_booking',
      label: 'No online booking',
      group: 'Marketing activity',
      points: 5,
      enabled: false,
      description: 'Spends on marketing but has no way to capture a job other than the phone.',
      when: {
        all: [
          { field: 'has_website', op: 'is_true' },
          { field: 'has_online_booking', op: 'is_false' },
        ],
      },
    },
  ],
};
