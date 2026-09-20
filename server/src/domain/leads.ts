import type { Db } from '../db/index.js';
import { getActiveScoringConfig, rescoreLead } from './scoring-store.js';
import { buildPersonalisation } from './summary.js';
import {
  LEAD_STATUSES,
  type CallOutcome,
  type CallRow,
  type LeadRow,
  type LeadStatus,
  type ProvenanceRow,
  type ProvenanceSource,
  type StatusEventRow,
  type TestCallOutcome,
  type TestCallRow,
} from './types.js';
import {
  canonicalCompanyName,
  isCanonicalRegion,
  normaliseDomain,
  normalisePhone,
  normalisePostcode,
  normaliseWebsite,
  regionFromPostcode,
} from './uk.js';

/** Columns an import, an enrichment provider or a human edit may write. */
export const WRITABLE_FIELDS = [
  'company_name', 'website', 'phone', 'email', 'address_line', 'city', 'postcode', 'region',
  'country', 'trade', 'companies_house_number', 'company_status', 'year_established',
  'employee_count', 'employee_count_basis', 'owner_name', 'owner_role',
  'google_place_id', 'google_rating', 'google_review_count', 'google_maps_url',
  'google_category', 'google_description', 'opening_hours', 'opens_24_7',
  'svc_plumbing', 'svc_heating', 'svc_boiler_repair', 'svc_boiler_install', 'svc_emergency',
  'svc_drainage', 'svc_commercial', 'svc_domestic', 'svc_24_7', 'svc_gas_safe', 'svc_bathrooms', 'svc_other',
  'has_website', 'has_google_ads', 'has_facebook', 'has_instagram', 'has_linkedin',
  'has_online_booking', 'has_contact_form', 'has_live_chat', 'booking_software',
  'marketing_signals', 'website_quality_score', 'facebook_url', 'instagram_url', 'linkedin_url',
  'follow_up_date', 'follow_up_notes', 'next_action', 'contract_value', 'notes',
  'tps_screened_at', 'tps_status', 'source', 'source_ref',
] as const;
export type WritableField = (typeof WRITABLE_FIELDS)[number];

const WRITABLE = new Set<string>(WRITABLE_FIELDS);

const BOOLEAN_FIELDS = new Set<string>([
  'opens_24_7', 'svc_plumbing', 'svc_heating', 'svc_boiler_repair', 'svc_boiler_install',
  'svc_emergency', 'svc_drainage', 'svc_commercial', 'svc_domestic', 'svc_24_7',
  'svc_gas_safe', 'svc_bathrooms', 'has_website', 'has_google_ads', 'has_facebook',
  'has_instagram', 'has_linkedin', 'has_online_booking', 'has_contact_form', 'has_live_chat',
]);

export type LeadInput = Partial<Record<WritableField, unknown>> & { company_name: string };

export interface ApplyOptions {
  source: ProvenanceSource;
  detail?: string;
  /** Automated providers never clobber a value a human typed. */
  overwriteManual?: boolean;
  /** When false (the default for enrichment) only empty fields are filled. */
  overwriteExisting?: boolean;
}

function nowIso(): string {
  return new Date().toISOString();
}

export function toBool(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number') return value !== 0 ? 1 : 0;
  const s = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 't'].includes(s)) return 1;
  if (['0', 'false', 'no', 'n', 'f'].includes(s)) return 0;
  return null;
}

function coerce(field: string, value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (BOOLEAN_FIELDS.has(field)) return toBool(value);

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return null;
    if (['google_rating', 'contract_value'].includes(field)) {
      const n = Number(trimmed);
      return Number.isFinite(n) ? n : null;
    }
    if (['google_review_count', 'employee_count', 'year_established', 'website_quality_score'].includes(field)) {
      const n = Number.parseInt(trimmed.replace(/[^\d-]/g, ''), 10);
      return Number.isFinite(n) ? n : null;
    }
    return trimmed;
  }
  return value;
}

/**
 * Stable identity for a business. Google's place id wins; then the phone
 * number; then the web domain; then name + locality.
 */
export function buildDedupeKey(input: {
  google_place_id?: unknown;
  phone?: unknown;
  phone_e164?: string | null;
  website?: unknown;
  company_name: string;
  postcode?: unknown;
  city?: unknown;
}): string {
  const placeId = typeof input.google_place_id === 'string' ? input.google_place_id.trim() : '';
  if (placeId) return `place:${placeId}`;

  const phone = input.phone_e164 ?? normalisePhone(input.phone as string | null | undefined);
  if (phone) return `phone:${phone}`;

  const domain = normaliseDomain(input.website as string | null | undefined);
  if (domain) return `site:${domain}`;

  const locality = normalisePostcode(input.postcode as string) ?? String(input.city ?? '').toLowerCase().trim();
  return `name:${canonicalCompanyName(input.company_name)}|${locality}`;
}

/** Fills phone_e164, postcode formatting and region from whatever was supplied. */
function derive(values: Record<string, unknown>): Record<string, unknown> {
  const out = { ...values };
  if (typeof out['website'] === 'string') out['website'] = normaliseWebsite(out['website'] as string);
  if (out['website']) out['has_website'] = 1;

  if (typeof out['postcode'] === 'string') {
    const tidy = normalisePostcode(out['postcode'] as string);
    if (tidy) out['postcode'] = tidy;
  }
  // Sources label the region inconsistently ("Greater Manchester", "England",
  // "West Yorkshire"). Prefer the postcode-derived region so the filter has one
  // vocabulary; keep whatever was supplied when we cannot derive anything.
  if (out['postcode'] && !isCanonicalRegion(out['region'] as string)) {
    const region = regionFromPostcode(out['postcode'] as string);
    if (region) out['region'] = region;
  }
  return out;
}

export function getLead(db: Db, id: number): LeadRow | undefined {
  return db.prepare<[number], LeadRow>('SELECT * FROM leads WHERE id = ?').get(id);
}

export function findByDedupeKey(db: Db, key: string): LeadRow | undefined {
  return db.prepare<[string], LeadRow>('SELECT * FROM leads WHERE dedupe_key = ?').get(key);
}

export function recordProvenance(
  db: Db,
  leadId: number,
  field: string,
  source: ProvenanceSource,
  detail?: string,
  confidence?: number,
): void {
  db.prepare(
    `INSERT INTO field_provenance (lead_id, field, source, detail, confidence, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(lead_id, field) DO UPDATE SET
       source = excluded.source, detail = excluded.detail,
       confidence = excluded.confidence, updated_at = excluded.updated_at`,
  ).run(leadId, field, source, detail ?? null, confidence ?? null, nowIso());
}

export function getProvenance(db: Db, leadId: number): Record<string, ProvenanceRow> {
  const rows = db.prepare<[number], ProvenanceRow>('SELECT * FROM field_provenance WHERE lead_id = ?').all(leadId);
  return Object.fromEntries(rows.map((r) => [r.field, r]));
}

/**
 * Writes a partial update and records where each value came from.
 * Returns the names of the fields that actually changed.
 */
export function applyFieldUpdates(
  db: Db,
  leadId: number,
  updates: Record<string, unknown>,
  options: ApplyOptions,
): string[] {
  const existing = getLead(db, leadId);
  if (!existing) throw Object.assign(new Error(`Lead ${leadId} not found`), { status: 404 });

  const provenance = getProvenance(db, leadId);
  const derived = derive(updates);
  const overwriteExisting = options.overwriteExisting ?? options.source === 'manual';
  const overwriteManual = options.overwriteManual ?? options.source === 'manual';

  const changed: string[] = [];
  const setClauses: string[] = [];
  const params: unknown[] = [];
  const current = existing as unknown as Record<string, unknown>;

  for (const [field, rawValue] of Object.entries(derived)) {
    if (!WRITABLE.has(field)) continue;
    const value = coerce(field, rawValue);
    if (value === undefined) continue;
    if (value === null && options.source !== 'manual') continue; // providers never blank a field

    const currentValue = current[field];
    const isEmpty = currentValue === null || currentValue === undefined || currentValue === '';
    if (!isEmpty && !overwriteExisting) continue;
    if (!overwriteManual && provenance[field]?.source === 'manual') continue;
    if (String(currentValue ?? '') === String(value ?? '')) continue;

    setClauses.push(`${field} = ?`);
    params.push(value);
    changed.push(field);
  }

  if (changed.includes('phone')) {
    const e164 = normalisePhone(derived['phone'] as string);
    setClauses.push('phone_e164 = ?');
    params.push(e164);
  }

  if (changed.length === 0) return [];

  setClauses.push('updated_at = ?');
  params.push(nowIso());
  params.push(leadId);

  db.prepare(`UPDATE leads SET ${setClauses.join(', ')} WHERE id = ?`).run(...params);
  for (const field of changed) recordProvenance(db, leadId, field, options.source, options.detail);

  // Identity fields moved — keep the dedupe key in step.
  if (changed.some((f) => ['google_place_id', 'phone', 'website', 'company_name', 'postcode', 'city'].includes(f))) {
    refreshDedupeKey(db, leadId);
  }
  return changed;
}

function refreshDedupeKey(db: Db, leadId: number): void {
  const lead = getLead(db, leadId);
  if (!lead) return;
  const key = buildDedupeKey({
    google_place_id: lead.google_place_id,
    phone_e164: lead.phone_e164,
    website: lead.website,
    company_name: lead.company_name,
    postcode: lead.postcode,
    city: lead.city,
  });
  if (key === lead.dedupe_key) return;
  const clash = db.prepare<[string, number], { id: number }>(
    'SELECT id FROM leads WHERE dedupe_key = ? AND id != ?',
  ).get(key, leadId);
  if (clash) return; // leave the old key rather than break the unique index
  db.prepare('UPDATE leads SET dedupe_key = ? WHERE id = ?').run(key, leadId);
}

export interface UpsertResult {
  id: number;
  created: boolean;
  changedFields: string[];
}

export function upsertLead(db: Db, input: LeadInput, options: ApplyOptions & { importBatchId?: number }): UpsertResult {
  const companyName = String(input.company_name ?? '').trim();
  if (!companyName) throw Object.assign(new Error('company_name is required'), { status: 400 });

  const values = derive({ ...input, company_name: companyName });
  const phoneE164 = normalisePhone(values['phone'] as string | null);
  const dedupeKey = buildDedupeKey({
    google_place_id: values['google_place_id'],
    phone_e164: phoneE164,
    website: values['website'],
    company_name: companyName,
    postcode: values['postcode'],
    city: values['city'],
  });

  const existing = findByDedupeKey(db, dedupeKey);
  if (existing) {
    const changed = applyFieldUpdates(db, existing.id, values, options);
    return { id: existing.id, created: false, changedFields: changed };
  }

  const ts = nowIso();
  const info = db
    .prepare(
      `INSERT INTO leads (created_at, updated_at, status, status_changed_at, company_name, phone_e164,
                          source, source_ref, import_batch_id, dedupe_key)
       VALUES (?, ?, 'new', ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      ts, ts, ts, companyName, phoneE164,
      options.source === 'manual' ? 'manual' : String(values['source'] ?? options.source),
      (values['source_ref'] as string) ?? null,
      options.importBatchId ?? null,
      dedupeKey,
    );

  const id = Number(info.lastInsertRowid);
  recordProvenance(db, id, 'company_name', options.source, options.detail);
  db.prepare('INSERT INTO status_events (lead_id, from_status, to_status, reason, changed_at) VALUES (?, NULL, ?, ?, ?)')
    .run(id, 'new', 'Lead created', ts);

  const rest = { ...values };
  delete rest['company_name'];
  const changed = applyFieldUpdates(db, id, rest, { ...options, overwriteExisting: true });

  return { id, created: true, changedFields: ['company_name', ...changed] };
}

export function setStatus(db: Db, leadId: number, status: LeadStatus, reason?: string): LeadRow {
  if (!LEAD_STATUSES.includes(status)) {
    throw Object.assign(new Error(`Unknown status "${status}"`), { status: 400 });
  }
  const lead = getLead(db, leadId);
  if (!lead) throw Object.assign(new Error(`Lead ${leadId} not found`), { status: 404 });
  if (lead.status === status) return lead;

  const ts = nowIso();
  const tx = db.transaction(() => {
    db.prepare('UPDATE leads SET status = ?, status_changed_at = ?, updated_at = ? WHERE id = ?')
      .run(status, ts, ts, leadId);
    db.prepare(
      'INSERT INTO status_events (lead_id, from_status, to_status, reason, changed_at) VALUES (?, ?, ?, ?, ?)',
    ).run(leadId, lead.status, status, reason ?? null, ts);
  });
  tx();
  return getLead(db, leadId)!;
}

/** Statuses the app may advance on its own; anything past "called" is the user's call. */
const AUTO_ADVANCEABLE: readonly LeadStatus[] = ['new', 'enriched', 'priority', 'ready_to_call'];

export function autoAdvanceAfterScoring(db: Db, leadId: number): void {
  const lead = getLead(db, leadId);
  if (!lead || !AUTO_ADVANCEABLE.includes(lead.status)) return;
  const target: LeadStatus = lead.score >= 80 ? 'priority' : lead.enriched_at ? 'enriched' : lead.status;
  if (target !== lead.status) setStatus(db, leadId, target, 'Automatic: opportunity score updated');
}

const OUTCOME_STATUS: Partial<Record<CallOutcome, LeadStatus>> = {
  demo_booked: 'demo_booked',
  customer: 'won',
  not_interested: 'lost',
  not_suitable: 'not_suitable',
  wrong_number: 'not_suitable',
  interested: 'follow_up',
  follow_up_required: 'follow_up',
  gatekeeper: 'follow_up',
  owner_reached: 'called',
  no_answer: 'called',
  voicemail: 'called',
};

export interface RecordCallInput {
  outcome: CallOutcome;
  called_at?: string;
  contact_name?: string | null;
  duration_seconds?: number | null;
  notes?: string | null;
  follow_up_date?: string | null;
  follow_up_notes?: string | null;
  next_action?: string | null;
  contract_value?: number | null;
}

export function recordCall(db: Db, leadId: number, input: RecordCallInput): { call: CallRow; lead: LeadRow } {
  const lead = getLead(db, leadId);
  if (!lead) throw Object.assign(new Error(`Lead ${leadId} not found`), { status: 404 });

  const calledAt = input.called_at ?? nowIso();
  const ts = nowIso();

  const tx = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO calls (lead_id, called_at, outcome, contact_name, duration_seconds, notes,
                            follow_up_date, follow_up_notes, next_action, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        leadId, calledAt, input.outcome, input.contact_name ?? null, input.duration_seconds ?? null,
        input.notes ?? null, input.follow_up_date ?? null, input.follow_up_notes ?? null,
        input.next_action ?? null, ts,
      );

    db.prepare(
      `UPDATE leads
          SET last_called_at = ?, last_call_outcome = ?, call_count = call_count + 1,
              follow_up_date = COALESCE(?, follow_up_date),
              follow_up_notes = COALESCE(?, follow_up_notes),
              next_action = COALESCE(?, next_action),
              contract_value = COALESCE(?, contract_value),
              updated_at = ?
        WHERE id = ?`,
    ).run(
      calledAt, input.outcome, input.follow_up_date ?? null, input.follow_up_notes ?? null,
      input.next_action ?? null, input.contract_value ?? null, ts, leadId,
    );
    return Number(info.lastInsertRowid);
  });
  const callId = tx();

  const nextStatus = OUTCOME_STATUS[input.outcome];
  if (nextStatus) setStatus(db, leadId, nextStatus, `Call outcome: ${input.outcome}`);
  if (input.outcome === 'wrong_number' || input.outcome === 'not_suitable') {
    // Nothing automatic beyond the status change — suppression stays a deliberate act.
  }

  return {
    call: db.prepare<[number], CallRow>('SELECT * FROM calls WHERE id = ?').get(callId)!,
    lead: getLead(db, leadId)!,
  };
}

export interface RecordTestCallInput {
  outcome: TestCallOutcome;
  attempted_at?: string;
  answered?: boolean;
  ring_seconds?: number | null;
  out_of_hours?: boolean;
  ooh_failure?: boolean;
  poor_handling?: boolean;
  booking_taken?: boolean;
  notes?: string | null;
}

const ANSWERED_OUTCOMES: readonly TestCallOutcome[] = [
  'answered_human', 'human_receptionist', 'automated_receptionist', 'booking_taken',
];

export function recordTestCall(db: Db, leadId: number, input: RecordTestCallInput): { testCall: TestCallRow; lead: LeadRow } {
  const lead = getLead(db, leadId);
  if (!lead) throw Object.assign(new Error(`Lead ${leadId} not found`), { status: 404 });

  const attemptedAt = input.attempted_at ?? nowIso();
  const answered = input.answered ?? ANSWERED_OUTCOMES.includes(input.outcome);
  const unanswered = !answered;
  const oohFailure = input.ooh_failure ?? (Boolean(input.out_of_hours) && unanswered);
  const ts = nowIso();

  const tx = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO test_calls (lead_id, attempted_at, outcome, answered, ring_seconds, out_of_hours,
                                 ooh_failure, poor_handling, booking_taken, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        leadId, attemptedAt, input.outcome, answered ? 1 : 0, input.ring_seconds ?? null,
        input.out_of_hours ? 1 : 0, oohFailure ? 1 : 0, input.poor_handling ? 1 : 0,
        input.booking_taken ? 1 : 0, input.notes ?? null, ts,
      );

    db.prepare(
      `UPDATE leads
          SET test_call_attempted = 1, test_call_at = ?, test_call_outcome = ?, test_call_answered = ?,
              test_call_ring_seconds = ?, test_call_out_of_hours = ?, test_call_ooh_failure = ?,
              test_call_poor_handling = ?, test_call_booking_taken = ?, test_call_notes = ?, updated_at = ?
        WHERE id = ?`,
    ).run(
      attemptedAt, input.outcome, answered ? 1 : 0, input.ring_seconds ?? null,
      input.out_of_hours ? 1 : 0, oohFailure ? 1 : 0, input.poor_handling ? 1 : 0,
      input.booking_taken ? 1 : 0, input.notes ?? null, ts, leadId,
    );
    return Number(info.lastInsertRowid);
  });
  const testCallId = tx();

  // A test call is the single biggest scoring input — refresh immediately.
  const { config } = getActiveScoringConfig(db);
  rescoreLead(db, getLead(db, leadId)!, config);
  autoAdvanceAfterScoring(db, leadId);
  regeneratePersonalisation(db, leadId);

  return {
    testCall: db.prepare<[number], TestCallRow>('SELECT * FROM test_calls WHERE id = ?').get(testCallId)!,
    lead: getLead(db, leadId)!,
  };
}

export function regeneratePersonalisation(db: Db, leadId: number): { summary: string; openingLine: string } {
  const lead = getLead(db, leadId);
  if (!lead) throw Object.assign(new Error(`Lead ${leadId} not found`), { status: 404 });
  const p = buildPersonalisation(lead);
  db.prepare('UPDATE leads SET summary = ?, opening_line = ?, summary_generated_at = ? WHERE id = ?')
    .run(p.summary, p.openingLine, nowIso(), leadId);
  return { summary: p.summary, openingLine: p.openingLine };
}

export function setDoNotCall(db: Db, leadId: number, reason: string, addToSuppressionList = true): LeadRow {
  const lead = getLead(db, leadId);
  if (!lead) throw Object.assign(new Error(`Lead ${leadId} not found`), { status: 404 });
  const ts = nowIso();

  const tx = db.transaction(() => {
    db.prepare('UPDATE leads SET do_not_call = 1, do_not_call_reason = ?, do_not_call_at = ?, updated_at = ? WHERE id = ?')
      .run(reason, ts, ts, leadId);
    if (addToSuppressionList && lead.phone_e164) {
      db.prepare(
        `INSERT INTO suppression_list (phone_e164, reason, source, added_at, notes)
         VALUES (?, ?, 'lead', ?, ?)
         ON CONFLICT(phone_e164) DO UPDATE SET reason = excluded.reason, added_at = excluded.added_at`,
      ).run(lead.phone_e164, reason, ts, lead.company_name);
    }
  });
  tx();
  return getLead(db, leadId)!;
}

export function clearDoNotCall(db: Db, leadId: number): LeadRow {
  const lead = getLead(db, leadId);
  if (!lead) throw Object.assign(new Error(`Lead ${leadId} not found`), { status: 404 });
  const tx = db.transaction(() => {
    db.prepare('UPDATE leads SET do_not_call = 0, do_not_call_reason = NULL, do_not_call_at = NULL, updated_at = ? WHERE id = ?')
      .run(nowIso(), leadId);
    if (lead.phone_e164) {
      db.prepare("DELETE FROM suppression_list WHERE phone_e164 = ? AND source = 'lead'").run(lead.phone_e164);
    }
  });
  tx();
  return getLead(db, leadId)!;
}

/** Applies the suppression list to every lead; returns how many were newly suppressed. */
export function applySuppressionList(db: Db): number {
  const ts = nowIso();
  const info = db
    .prepare(
      `UPDATE leads
          SET do_not_call = 1,
              do_not_call_reason = COALESCE(do_not_call_reason, 'On suppression list (TPS/CTPS or objection)'),
              do_not_call_at = COALESCE(do_not_call_at, ?),
              updated_at = ?
        WHERE do_not_call = 0
          AND phone_e164 IN (SELECT phone_e164 FROM suppression_list)`,
    )
    .run(ts, ts);
  return info.changes;
}

export function getCalls(db: Db, leadId: number): CallRow[] {
  return db.prepare<[number], CallRow>('SELECT * FROM calls WHERE lead_id = ? ORDER BY called_at DESC').all(leadId);
}

export function getTestCalls(db: Db, leadId: number): TestCallRow[] {
  return db.prepare<[number], TestCallRow>('SELECT * FROM test_calls WHERE lead_id = ? ORDER BY attempted_at DESC').all(leadId);
}

export function getStatusEvents(db: Db, leadId: number): StatusEventRow[] {
  return db.prepare<[number], StatusEventRow>(
    'SELECT * FROM status_events WHERE lead_id = ? ORDER BY changed_at DESC, id DESC',
  ).all(leadId);
}

export function deleteLead(db: Db, leadId: number): boolean {
  return db.prepare('DELETE FROM leads WHERE id = ?').run(leadId).changes > 0;
}
