import { Router } from 'express';
import { stringify } from 'csv-stringify/sync';
import { z } from 'zod';
import { getDb } from '../db/index.js';
import {
  asyncHandler,
  HttpError,
  queryBool,
  queryList,
  queryNumber,
  queryString,
  requireId,
} from '../lib/http-helpers.js';
import {
  applyFieldUpdates,
  clearDoNotCall,
  deleteLead,
  getCalls,
  getLead,
  getProvenance,
  getStatusEvents,
  getTestCalls,
  recordCall,
  recordTestCall,
  regeneratePersonalisation,
  setDoNotCall,
  setStatus,
  upsertLead,
  WRITABLE_FIELDS,
} from '../domain/leads.js';
import { callQueue, facets, listAllMatching, listLeads, type LeadFilters, type SortColumn } from '../domain/lead-query.js';
import { getActiveScoringConfig, rescoreLead, toScorable } from '../domain/scoring-store.js';
import { scoreLead, topReasons } from '../domain/scoring.js';
import { buildPersonalisation, callReason, displayPhone } from '../domain/summary.js';
import { CALL_OUTCOMES, LEAD_STATUSES, TEST_CALL_OUTCOMES, type LeadRow } from '../domain/types.js';
import { enrichLead, PROVIDERS, type Provider } from '../enrichment/index.js';

export const leadsRouter = Router();

function parseFilters(req: Parameters<Parameters<typeof asyncHandler>[0]>[0]): LeadFilters {
  const dnc = queryString(req, 'doNotCall');
  return {
    q: queryString(req, 'q'),
    status: queryList(req, 'status'),
    band: queryList(req, 'band'),
    city: queryList(req, 'city'),
    region: queryList(req, 'region'),
    trade: queryList(req, 'trade'),
    testOutcome: queryList(req, 'testOutcome'),
    callOutcome: queryList(req, 'callOutcome'),
    scoreMin: queryNumber(req, 'scoreMin'),
    scoreMax: queryNumber(req, 'scoreMax'),
    ratingMin: queryNumber(req, 'ratingMin'),
    reviewsMin: queryNumber(req, 'reviewsMin'),
    reviewsMax: queryNumber(req, 'reviewsMax'),
    employeesMin: queryNumber(req, 'employeesMin'),
    employeesMax: queryNumber(req, 'employeesMax'),
    emergency: queryBool(req, 'emergency'),
    service247: queryBool(req, 'service247'),
    googleAds: queryBool(req, 'googleAds'),
    hasWebsite: queryBool(req, 'hasWebsite'),
    hasOnlineBooking: queryBool(req, 'hasOnlineBooking'),
    hasEmail: queryBool(req, 'hasEmail'),
    testCalled: queryBool(req, 'testCalled'),
    doNotCall: dnc === 'include' || dnc === 'only' ? dnc : 'exclude',
    followUpDue: queryBool(req, 'followUpDue'),
    followUpFrom: queryString(req, 'followUpFrom'),
    followUpTo: queryString(req, 'followUpTo'),
    addedFrom: queryString(req, 'addedFrom'),
    addedTo: queryString(req, 'addedTo'),
    sort: queryString(req, 'sort') as SortColumn | undefined,
    order: queryString(req, 'order') === 'asc' ? 'asc' : 'desc',
    page: queryNumber(req, 'page'),
    pageSize: queryNumber(req, 'pageSize'),
  };
}

/** Trimmed shape for list views — the full row is heavy and mostly unused there. */
function toListItem(lead: LeadRow) {
  return {
    id: lead.id,
    company_name: lead.company_name,
    city: lead.city,
    region: lead.region,
    postcode: lead.postcode,
    trade: lead.trade,
    phone: lead.phone,
    phone_display: displayPhone(lead),
    phone_e164: lead.phone_e164,
    website: lead.website,
    email: lead.email,
    owner_name: lead.owner_name,
    google_rating: lead.google_rating,
    google_review_count: lead.google_review_count,
    employee_count: lead.employee_count,
    svc_emergency: lead.svc_emergency,
    svc_24_7: lead.svc_24_7,
    opens_24_7: lead.opens_24_7,
    has_google_ads: lead.has_google_ads,
    has_website: lead.has_website,
    has_online_booking: lead.has_online_booking,
    score: lead.score,
    score_band: lead.score_band,
    status: lead.status,
    last_call_outcome: lead.last_call_outcome,
    last_called_at: lead.last_called_at,
    call_count: lead.call_count,
    follow_up_date: lead.follow_up_date,
    test_call_attempted: lead.test_call_attempted,
    test_call_outcome: lead.test_call_outcome,
    do_not_call: lead.do_not_call,
    created_at: lead.created_at,
    enriched_at: lead.enriched_at,
    reason: callReason(lead),
  };
}

leadsRouter.get(
  '/leads',
  asyncHandler(async (req, res) => {
    const db = getDb();
    const page = listLeads(db, parseFilters(req));
    res.json({
      leads: page.rows.map(toListItem),
      total: page.total,
      page: page.page,
      pageSize: page.pageSize,
      pageCount: page.pageCount,
    });
  }),
);

leadsRouter.get(
  '/leads/facets',
  asyncHandler(async (_req, res) => {
    res.json(facets(getDb()));
  }),
);

leadsRouter.get(
  '/leads/export.csv',
  asyncHandler(async (req, res) => {
    const db = getDb();
    const rows = listAllMatching(db, parseFilters(req));
    const columns = [
      'id', 'company_name', 'trade', 'phone', 'email', 'website', 'address_line', 'city',
      'postcode', 'region', 'owner_name', 'owner_role', 'companies_house_number', 'company_status',
      'year_established', 'employee_count', 'google_rating', 'google_review_count', 'google_maps_url',
      'google_category', 'svc_emergency', 'svc_24_7', 'svc_boiler_repair', 'svc_boiler_install',
      'svc_drainage', 'svc_commercial', 'has_google_ads', 'has_website', 'has_online_booking',
      'booking_software', 'website_quality_score', 'test_call_attempted', 'test_call_at',
      'test_call_outcome', 'score', 'score_band', 'status', 'last_called_at', 'last_call_outcome',
      'follow_up_date', 'next_action', 'do_not_call', 'notes', 'created_at',
    ];
    const csv = stringify(
      rows.map((r) => Object.fromEntries(columns.map((c) => [c, (r as unknown as Record<string, unknown>)[c] ?? '']))),
      { header: true, columns },
    );
    res.setHeader('content-type', 'text/csv; charset=utf-8');
    res.setHeader('content-disposition', `attachment; filename="flowcalls-leads-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
  }),
);

leadsRouter.get(
  '/call-queue',
  asyncHandler(async (req, res) => {
    const db = getDb();
    const limit = queryNumber(req, 'limit') ?? 25;
    const rows = callQueue(db, Math.min(Math.max(limit, 1), 100));
    res.json({ leads: rows.map(toListItem) });
  }),
);

const leadInput = z
  .object({ company_name: z.string().min(1, 'Company name is required') })
  .catchall(z.unknown());

leadsRouter.post(
  '/leads',
  asyncHandler(async (req, res) => {
    const db = getDb();
    const parsed = leadInput.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'Invalid lead', parsed.error.flatten());

    const result = upsertLead(db, parsed.data as { company_name: string }, { source: 'manual' });
    const { config } = getActiveScoringConfig(db);
    rescoreLead(db, getLead(db, result.id)!, config);
    regeneratePersonalisation(db, result.id);
    res.status(result.created ? 201 : 200).json({ ...result, lead: getLead(db, result.id) });
  }),
);

leadsRouter.get(
  '/leads/:id',
  asyncHandler(async (req, res) => {
    const db = getDb();
    const id = requireId(req);
    const lead = getLead(db, id);
    if (!lead) throw new HttpError(404, 'Lead not found');

    const { config } = getActiveScoringConfig(db);
    const score = scoreLead(toScorable(lead), config);
    const personalisation = buildPersonalisation(lead);

    res.json({
      lead,
      phone_display: displayPhone(lead),
      opening_hours: lead.opening_hours ? (JSON.parse(lead.opening_hours) as string[]) : null,
      marketing_signals: lead.marketing_signals ? (JSON.parse(lead.marketing_signals) as string[]) : [],
      score: { ...score, topReasons: topReasons(score) },
      personalisation,
      provenance: getProvenance(db, id),
      calls: getCalls(db, id),
      testCalls: getTestCalls(db, id),
      statusEvents: getStatusEvents(db, id),
      enrichmentRuns: db
        .prepare('SELECT * FROM enrichment_runs WHERE lead_id = ? ORDER BY started_at DESC LIMIT 20')
        .all(id),
    });
  }),
);

leadsRouter.patch(
  '/leads/:id',
  asyncHandler(async (req, res) => {
    const db = getDb();
    const id = requireId(req);
    if (!getLead(db, id)) throw new HttpError(404, 'Lead not found');

    const body = (req.body ?? {}) as Record<string, unknown>;
    const unknownFields = Object.keys(body).filter((k) => !(WRITABLE_FIELDS as readonly string[]).includes(k));
    if (unknownFields.length > 0) throw new HttpError(400, `Fields are not editable: ${unknownFields.join(', ')}`);

    const changed = applyFieldUpdates(db, id, body, { source: 'manual', detail: 'Edited in the app' });
    const { config } = getActiveScoringConfig(db);
    rescoreLead(db, getLead(db, id)!, config);
    regeneratePersonalisation(db, id);
    res.json({ changed, lead: getLead(db, id) });
  }),
);

leadsRouter.delete(
  '/leads/:id',
  asyncHandler(async (req, res) => {
    const id = requireId(req);
    const removed = deleteLead(getDb(), id);
    if (!removed) throw new HttpError(404, 'Lead not found');
    res.status(204).end();
  }),
);

leadsRouter.post(
  '/leads/:id/status',
  asyncHandler(async (req, res) => {
    const schema = z.object({
      status: z.enum(LEAD_STATUSES),
      reason: z.string().max(500).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'Invalid status', parsed.error.flatten());
    const lead = setStatus(getDb(), requireId(req), parsed.data.status, parsed.data.reason);
    res.json({ lead });
  }),
);

leadsRouter.post(
  '/leads/:id/calls',
  asyncHandler(async (req, res) => {
    const schema = z.object({
      outcome: z.enum(CALL_OUTCOMES),
      called_at: z.string().optional(),
      contact_name: z.string().max(200).nullish(),
      duration_seconds: z.number().int().min(0).max(86_400).nullish(),
      notes: z.string().max(5000).nullish(),
      follow_up_date: z.string().nullish(),
      follow_up_notes: z.string().max(2000).nullish(),
      next_action: z.string().max(500).nullish(),
      contract_value: z.number().min(0).nullish(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'Invalid call', parsed.error.flatten());

    const db = getDb();
    const id = requireId(req);
    const lead = getLead(db, id);
    if (!lead) throw new HttpError(404, 'Lead not found');
    if (lead.do_not_call) throw new HttpError(409, 'This lead is marked do-not-call — remove the flag first.');

    const result = recordCall(db, id, parsed.data);
    res.status(201).json(result);
  }),
);

leadsRouter.post(
  '/leads/:id/test-calls',
  asyncHandler(async (req, res) => {
    const schema = z.object({
      outcome: z.enum(TEST_CALL_OUTCOMES),
      attempted_at: z.string().optional(),
      answered: z.boolean().optional(),
      ring_seconds: z.number().int().min(0).max(600).nullish(),
      out_of_hours: z.boolean().optional(),
      ooh_failure: z.boolean().optional(),
      poor_handling: z.boolean().optional(),
      booking_taken: z.boolean().optional(),
      notes: z.string().max(5000).nullish(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'Invalid test call', parsed.error.flatten());

    const db = getDb();
    const id = requireId(req);
    const lead = getLead(db, id);
    if (!lead) throw new HttpError(404, 'Lead not found');
    if (lead.do_not_call) throw new HttpError(409, 'This lead is marked do-not-call — remove the flag first.');

    res.status(201).json(recordTestCall(db, id, parsed.data));
  }),
);

leadsRouter.post(
  '/leads/:id/enrich',
  asyncHandler(async (req, res) => {
    const schema = z.object({
      providers: z.array(z.enum(PROVIDERS)).optional(),
      refresh: z.boolean().optional(),
    });
    const parsed = schema.safeParse(req.body ?? {});
    if (!parsed.success) throw new HttpError(400, 'Invalid enrichment request', parsed.error.flatten());

    const db = getDb();
    const id = requireId(req);
    const outcome = await enrichLead(db, id, {
      providers: parsed.data.providers as Provider[] | undefined,
      refresh: parsed.data.refresh ?? false,
    });
    res.json({ outcome, lead: getLead(db, id) });
  }),
);

leadsRouter.post(
  '/leads/:id/personalisation',
  asyncHandler(async (req, res) => {
    res.json(regeneratePersonalisation(getDb(), requireId(req)));
  }),
);

leadsRouter.post(
  '/leads/:id/do-not-call',
  asyncHandler(async (req, res) => {
    const schema = z.object({
      reason: z.string().min(1).max(500),
      addToSuppressionList: z.boolean().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'A reason is required', parsed.error.flatten());
    const lead = setDoNotCall(getDb(), requireId(req), parsed.data.reason, parsed.data.addToSuppressionList ?? true);
    res.json({ lead });
  }),
);

leadsRouter.delete(
  '/leads/:id/do-not-call',
  asyncHandler(async (req, res) => {
    res.json({ lead: clearDoNotCall(getDb(), requireId(req)) });
  }),
);
