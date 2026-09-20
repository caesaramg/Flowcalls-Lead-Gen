export const LEAD_STATUSES = [
  'new',
  'enriched',
  'priority',
  'ready_to_call',
  'called',
  'follow_up',
  'demo_booked',
  'proposal',
  'won',
  'lost',
  'not_suitable',
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: 'New',
  enriched: 'Enriched',
  priority: 'Priority',
  ready_to_call: 'Ready to Call',
  called: 'Called',
  follow_up: 'Follow-up',
  demo_booked: 'Demo Booked',
  proposal: 'Proposal/Offer',
  won: 'Won',
  lost: 'Lost',
  not_suitable: 'Not Suitable',
};

export const CALL_OUTCOMES = [
  'no_answer',
  'voicemail',
  'gatekeeper',
  'owner_reached',
  'interested',
  'not_interested',
  'follow_up_required',
  'demo_booked',
  'customer',
  'wrong_number',
  'not_suitable',
] as const;
export type CallOutcome = (typeof CALL_OUTCOMES)[number];

export const CALL_OUTCOME_LABELS: Record<CallOutcome, string> = {
  no_answer: 'No answer',
  voicemail: 'Voicemail',
  gatekeeper: 'Gatekeeper',
  owner_reached: 'Owner reached',
  interested: 'Interested',
  not_interested: 'Not interested',
  follow_up_required: 'Follow-up required',
  demo_booked: 'Demo booked',
  customer: 'Customer',
  wrong_number: 'Wrong number',
  not_suitable: 'Not suitable',
};

/** Outcomes that mean a human actually spoke to us. Drives the contact rate. */
export const CONTACTED_OUTCOMES: readonly CallOutcome[] = [
  'gatekeeper',
  'owner_reached',
  'interested',
  'not_interested',
  'follow_up_required',
  'demo_booked',
  'customer',
];

export const POSITIVE_OUTCOMES: readonly CallOutcome[] = ['interested', 'demo_booked', 'customer'];

export const TEST_CALL_OUTCOMES = [
  'answered_human',
  'human_receptionist',
  'automated_receptionist',
  'booking_taken',
  'voicemail',
  'no_answer',
  'engaged',
  'number_invalid',
  'other',
] as const;
export type TestCallOutcome = (typeof TEST_CALL_OUTCOMES)[number];

export const TEST_CALL_OUTCOME_LABELS: Record<TestCallOutcome, string> = {
  answered_human: 'Answered by the business',
  human_receptionist: 'Human receptionist / answering service',
  automated_receptionist: 'Automated receptionist / IVR',
  booking_taken: 'Booking taken',
  voicemail: 'Voicemail',
  no_answer: 'No answer',
  engaged: 'Engaged / busy',
  number_invalid: 'Number invalid',
  other: 'Other',
};

export const PROVENANCE_SOURCES = [
  'manual',
  'csv',
  'google_places',
  'companies_house',
  'website',
  'apify',
  'derived',
] as const;
export type ProvenanceSource = (typeof PROVENANCE_SOURCES)[number];

export const PROVENANCE_SOURCE_LABELS: Record<ProvenanceSource, string> = {
  manual: 'Entered manually',
  csv: 'CSV import',
  google_places: 'Google Places API',
  companies_house: 'Companies House',
  website: 'Business website',
  apify: 'Google Maps (Apify)',
  derived: 'Derived from other fields',
};

export const TRADES = [
  'plumber',
  'heating_engineer',
  'plumbing_and_heating',
  'boiler_repair',
  'emergency_plumber',
  'gas_engineer',
  'drainage',
  'other',
] as const;
export type Trade = (typeof TRADES)[number];

export const TRADE_LABELS: Record<Trade, string> = {
  plumber: 'Plumber',
  heating_engineer: 'Heating engineer',
  plumbing_and_heating: 'Plumbing & heating',
  boiler_repair: 'Boiler repair',
  emergency_plumber: 'Emergency plumber',
  gas_engineer: 'Gas engineer',
  drainage: 'Drainage',
  other: 'Other',
};

/** Boolean-valued service columns, in display order. */
export const SERVICE_FIELDS = [
  'svc_plumbing',
  'svc_heating',
  'svc_boiler_repair',
  'svc_boiler_install',
  'svc_emergency',
  'svc_24_7',
  'svc_drainage',
  'svc_commercial',
  'svc_domestic',
  'svc_gas_safe',
  'svc_bathrooms',
] as const;
export type ServiceField = (typeof SERVICE_FIELDS)[number];

export const SERVICE_LABELS: Record<ServiceField, string> = {
  svc_plumbing: 'Plumbing',
  svc_heating: 'Heating',
  svc_boiler_repair: 'Boiler repair',
  svc_boiler_install: 'Boiler installation',
  svc_emergency: 'Emergency callouts',
  svc_24_7: '24/7 service',
  svc_drainage: 'Drainage',
  svc_commercial: 'Commercial work',
  svc_domestic: 'Domestic work',
  svc_gas_safe: 'Gas Safe registered',
  svc_bathrooms: 'Bathrooms',
};

export const MARKETING_FIELDS = [
  'has_website',
  'has_google_ads',
  'has_facebook',
  'has_instagram',
  'has_linkedin',
  'has_online_booking',
  'has_contact_form',
  'has_live_chat',
] as const;
export type MarketingField = (typeof MARKETING_FIELDS)[number];

export const MARKETING_LABELS: Record<MarketingField, string> = {
  has_website: 'Website',
  has_google_ads: 'Google Ads',
  has_facebook: 'Facebook',
  has_instagram: 'Instagram',
  has_linkedin: 'LinkedIn',
  has_online_booking: 'Online booking',
  has_contact_form: 'Contact form',
  has_live_chat: 'Live chat',
};

export interface LeadRow {
  id: number;
  created_at: string;
  updated_at: string;
  status: LeadStatus;
  status_changed_at: string;

  company_name: string;
  website: string | null;
  phone: string | null;
  phone_e164: string | null;
  email: string | null;
  address_line: string | null;
  city: string | null;
  postcode: string | null;
  region: string | null;
  country: string | null;
  trade: Trade | null;
  companies_house_number: string | null;
  company_status: string | null;
  year_established: number | null;
  employee_count: number | null;
  employee_count_basis: string | null;

  owner_name: string | null;
  owner_role: string | null;

  google_place_id: string | null;
  google_rating: number | null;
  google_review_count: number | null;
  google_maps_url: string | null;
  google_category: string | null;
  google_description: string | null;
  opening_hours: string | null;
  opens_24_7: number;

  svc_plumbing: number;
  svc_heating: number;
  svc_boiler_repair: number;
  svc_boiler_install: number;
  svc_emergency: number;
  svc_drainage: number;
  svc_commercial: number;
  svc_domestic: number;
  svc_24_7: number;
  svc_gas_safe: number;
  svc_bathrooms: number;
  svc_other: string | null;

  has_website: number;
  has_google_ads: number;
  has_facebook: number;
  has_instagram: number;
  has_linkedin: number;
  has_online_booking: number;
  has_contact_form: number;
  has_live_chat: number;
  booking_software: string | null;
  marketing_signals: string | null;
  website_quality_score: number | null;
  facebook_url: string | null;
  instagram_url: string | null;
  linkedin_url: string | null;

  test_call_attempted: number;
  test_call_at: string | null;
  test_call_outcome: TestCallOutcome | null;
  test_call_answered: number | null;
  test_call_ring_seconds: number | null;
  test_call_out_of_hours: number;
  test_call_ooh_failure: number;
  test_call_poor_handling: number;
  test_call_booking_taken: number;
  test_call_notes: string | null;

  score: number;
  score_band: string;
  score_breakdown: string | null;
  scored_at: string | null;
  scoring_config_version: number | null;

  summary: string | null;
  opening_line: string | null;
  summary_generated_at: string | null;

  last_called_at: string | null;
  last_call_outcome: CallOutcome | null;
  call_count: number;
  follow_up_date: string | null;
  follow_up_notes: string | null;
  next_action: string | null;
  contract_value: number | null;
  notes: string | null;

  do_not_call: number;
  do_not_call_reason: string | null;
  do_not_call_at: string | null;
  tps_screened_at: string | null;
  tps_status: string | null;

  source: string;
  source_ref: string | null;
  import_batch_id: number | null;
  enriched_at: string | null;
  dedupe_key: string;
}

export interface CallRow {
  id: number;
  lead_id: number;
  called_at: string;
  outcome: CallOutcome;
  contact_name: string | null;
  duration_seconds: number | null;
  notes: string | null;
  follow_up_date: string | null;
  follow_up_notes: string | null;
  next_action: string | null;
  created_at: string;
}

export interface TestCallRow {
  id: number;
  lead_id: number;
  attempted_at: string;
  outcome: TestCallOutcome;
  answered: number;
  ring_seconds: number | null;
  out_of_hours: number;
  ooh_failure: number;
  poor_handling: number;
  booking_taken: number;
  notes: string | null;
  created_at: string;
}

export interface StatusEventRow {
  id: number;
  lead_id: number;
  from_status: LeadStatus | null;
  to_status: LeadStatus;
  reason: string | null;
  changed_at: string;
}

export interface ProvenanceRow {
  lead_id: number;
  field: string;
  source: ProvenanceSource;
  detail: string | null;
  confidence: number | null;
  updated_at: string;
}
