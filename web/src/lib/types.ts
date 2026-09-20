export interface LeadListItem {
  id: number;
  company_name: string;
  city: string | null;
  region: string | null;
  postcode: string | null;
  trade: string | null;
  phone: string | null;
  phone_display: string | null;
  phone_e164: string | null;
  website: string | null;
  email: string | null;
  owner_name: string | null;
  google_rating: number | null;
  google_review_count: number | null;
  employee_count: number | null;
  svc_emergency: number;
  svc_24_7: number;
  opens_24_7: number;
  has_google_ads: number;
  has_website: number;
  has_online_booking: number;
  score: number;
  score_band: string;
  status: string;
  last_call_outcome: string | null;
  last_called_at: string | null;
  call_count: number;
  follow_up_date: string | null;
  test_call_attempted: number;
  test_call_outcome: string | null;
  do_not_call: number;
  created_at: string;
  enriched_at: string | null;
  reason: string;
}

export interface LeadsResponse {
  leads: LeadListItem[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export type Lead = LeadListItem & Record<string, unknown>;

export interface RuleResult {
  id: string;
  label: string;
  group: string;
  points: number;
  matched: boolean;
  applied: number;
}

export interface ScoringRule {
  id: string;
  label: string;
  group: string;
  points: number;
  enabled: boolean;
  description?: string;
  when: unknown;
}

export interface ScoringBand {
  id: string;
  label: string;
  min: number;
  action: string;
}

export interface ScoringConfig {
  version: number;
  cap: number;
  floor: number;
  rules: ScoringRule[];
  bands: ScoringBand[];
}

export interface ProvenanceEntry {
  lead_id: number;
  field: string;
  source: string;
  detail: string | null;
  confidence: number | null;
  updated_at: string;
}

export interface CallRecord {
  id: number;
  lead_id: number;
  called_at: string;
  outcome: string;
  contact_name: string | null;
  duration_seconds: number | null;
  notes: string | null;
  follow_up_date: string | null;
  follow_up_notes: string | null;
  next_action: string | null;
}

export interface TestCallRecord {
  id: number;
  lead_id: number;
  attempted_at: string;
  outcome: string;
  answered: number;
  ring_seconds: number | null;
  out_of_hours: number;
  ooh_failure: number;
  poor_handling: number;
  booking_taken: number;
  notes: string | null;
}

export interface StatusEvent {
  id: number;
  from_status: string | null;
  to_status: string;
  reason: string | null;
  changed_at: string;
}

export interface EnrichmentRun {
  id: number;
  provider: string;
  status: string;
  message: string | null;
  fields_updated: string | null;
  started_at: string;
}

export interface LeadDetail {
  lead: Lead;
  phone_display: string | null;
  opening_hours: string[] | null;
  marketing_signals: string[];
  score: {
    score: number;
    rawScore: number;
    band: ScoringBand;
    breakdown: RuleResult[];
    topReasons: string[];
  };
  personalisation: {
    summary: string;
    openingLine: string;
    talkingPoints: string[];
  };
  provenance: Record<string, ProvenanceEntry>;
  calls: CallRecord[];
  testCalls: TestCallRecord[];
  statusEvents: StatusEvent[];
  enrichmentRuns: EnrichmentRun[];
}

export interface CountBucket {
  value: string;
  count: number;
}

export interface DashboardStats {
  generatedAt: string;
  totals: {
    prospects: number;
    enriched: number;
    priority: number;
    readyToCall: number;
    doNotCall: number;
    withPhone: number;
    testCalled: number;
  };
  activity: {
    callsMade: number;
    callsToday: number;
    callsThisWeek: number;
    leadsCalled: number;
    leadsContacted: number;
    leadsInterested: number;
    demosBooked: number;
    customersWon: number;
    followUpsDue: number;
    followUpsNext7Days: number;
  };
  rates: { contactRate: number; interestedRate: number; demoRate: number; conversionRate: number };
  value: { monthlyRevenueWon: number; annualisedRevenueWon: number; averageContractValue: number | null };
  quality: { averageScore: number; averageScoreEnriched: number; medianReviewCount: number | null };
  byCity: CountBucket[];
  byTrade: CountBucket[];
  byBand: CountBucket[];
  byStatus: CountBucket[];
  pipelineValueByStatus: CountBucket[];
}

export interface ProviderStatus {
  provider: string;
  configured: boolean;
  requirement: string;
  description: string;
}

export interface Meta {
  statuses: Record<string, string>;
  callOutcomes: Record<string, string>;
  testCallOutcomes: Record<string, string>;
  trades: Record<string, string>;
  services: Record<string, string>;
  marketing: Record<string, string>;
  provenanceSources: Record<string, string>;
  providers: ProviderStatus[];
  importFields: string[];
  cities: Array<{ name: string; region: string; tier: number }>;
  searchTemplates: string[];
  compliance: { requireTpsScreening: boolean; retentionMonths: number };
}

export interface Facets {
  cities: CountBucket[];
  regions: CountBucket[];
  trades: CountBucket[];
  statuses: CountBucket[];
  bands: CountBucket[];
}
