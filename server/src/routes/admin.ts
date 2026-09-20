import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { getDb } from '../db/index.js';
import { asyncHandler, HttpError, pathParam, queryNumber, queryString } from '../lib/http-helpers.js';
import { env } from '../lib/env.js';
import { dashboardStats } from '../domain/dashboard.js';
import { applySuppressionList } from '../domain/leads.js';
import { getActiveScoringConfig, listScoringConfigs, rescoreAll, saveScoringConfig } from '../domain/scoring-store.js';
import { validateScoringConfig, type ScoringConfig } from '../domain/scoring.js';
import {
  CALL_OUTCOME_LABELS,
  LEAD_STATUS_LABELS,
  MARKETING_LABELS,
  PROVENANCE_SOURCE_LABELS,
  SERVICE_LABELS,
  TEST_CALL_OUTCOME_LABELS,
  TRADE_LABELS,
} from '../domain/types.js';
import { importCsv, importRecord, parseCsv } from '../ingest/csv-import.js';
import { CANONICAL_FIELDS, suggestMapping, type CanonicalField } from '../ingest/csv-mapping.js';
import { enrichBatch, providerStatuses, PROVIDERS, type Provider } from '../enrichment/index.js';
import { searchPlaces } from '../enrichment/google-places.js';
import { apifyConfigured, searchGoogleMapsViaApify } from '../enrichment/apify-maps.js';
import { normalisePhone } from '../domain/uk.js';
import { buildSearchPlan, UK_CITIES, SEARCH_TEMPLATES } from '../ingest/search-plan.js';

export const adminRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

adminRouter.get(
  '/health',
  asyncHandler(async (_req, res) => {
    res.json({ ok: true, time: new Date().toISOString() });
  }),
);

adminRouter.get(
  '/meta',
  asyncHandler(async (_req, res) => {
    res.json({
      statuses: LEAD_STATUS_LABELS,
      callOutcomes: CALL_OUTCOME_LABELS,
      testCallOutcomes: TEST_CALL_OUTCOME_LABELS,
      trades: TRADE_LABELS,
      services: SERVICE_LABELS,
      marketing: MARKETING_LABELS,
      provenanceSources: PROVENANCE_SOURCE_LABELS,
      providers: providerStatuses(),
      importFields: CANONICAL_FIELDS,
      cities: UK_CITIES,
      searchTemplates: SEARCH_TEMPLATES,
      compliance: {
        requireTpsScreening: env.requireTpsScreening,
        retentionMonths: env.retentionMonths,
      },
    });
  }),
);

adminRouter.get(
  '/dashboard',
  asyncHandler(async (_req, res) => {
    res.json(dashboardStats(getDb()));
  }),
);

// ---------------------------------------------------------------- scoring ---

adminRouter.get(
  '/scoring',
  asyncHandler(async (_req, res) => {
    const active = getActiveScoringConfig(getDb());
    res.json({ active, versions: listScoringConfigs(getDb()).map(({ config, ...rest }) => ({ ...rest, version: config.version })) });
  }),
);

adminRouter.put(
  '/scoring',
  asyncHandler(async (req, res) => {
    const body = (req.body ?? {}) as { config?: unknown; name?: string; rescore?: boolean };
    const errors = validateScoringConfig(body.config);
    if (errors.length > 0) throw new HttpError(400, 'Invalid scoring config', errors);

    const db = getDb();
    const saved = saveScoringConfig(db, body.config as ScoringConfig, body.name ?? 'Custom');
    const rescored = body.rescore === false ? null : rescoreAll(db);
    res.json({ active: saved, rescored });
  }),
);

adminRouter.post(
  '/scoring/rescore',
  asyncHandler(async (_req, res) => {
    res.json(rescoreAll(getDb()));
  }),
);

adminRouter.post(
  '/scoring/preview',
  asyncHandler(async (req, res) => {
    const errors = validateScoringConfig((req.body ?? {}).config);
    if (errors.length > 0) throw new HttpError(400, 'Invalid scoring config', errors);
    res.json({ ok: true });
  }),
);

// ----------------------------------------------------------------- import ---

adminRouter.post(
  '/import/preview',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const content = req.file?.buffer.toString('utf8') ?? (req.body as { content?: string })?.content;
    if (!content) throw new HttpError(400, 'Upload a CSV file or send { content }');
    const { headers, rows } = parseCsv(content);
    res.json({
      headers,
      rowCount: rows.length,
      mapping: suggestMapping(headers),
      sample: rows.slice(0, 5),
      fields: CANONICAL_FIELDS,
    });
  }),
);

adminRouter.post(
  '/import/csv',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const body = req.body as Record<string, string | undefined>;
    const content = req.file?.buffer.toString('utf8') ?? body['content'];
    if (!content) throw new HttpError(400, 'Upload a CSV file or send { content }');

    let mapping: Record<string, CanonicalField | null> | undefined;
    if (body['mapping']) {
      try {
        mapping = JSON.parse(body['mapping']) as Record<string, CanonicalField | null>;
      } catch {
        throw new HttpError(400, 'mapping must be valid JSON');
      }
    }

    const report = importCsv(getDb(), content, {
      filename: req.file?.originalname ?? body['filename'] ?? 'upload.csv',
      mapping,
      targetTradesOnly: body['targetTradesOnly'] === 'true',
      dryRun: body['dryRun'] === 'true',
      limit: body['limit'] ? Number.parseInt(body['limit'], 10) : undefined,
    });
    res.json(report);
  }),
);

adminRouter.get(
  '/import/batches',
  asyncHandler(async (_req, res) => {
    res.json({
      batches: getDb().prepare('SELECT * FROM import_batches ORDER BY id DESC LIMIT 50').all(),
    });
  }),
);

// ---------------------------------------------------------------- acquire ---

adminRouter.get(
  '/acquire/plan',
  asyncHandler(async (req, res) => {
    const cities = queryString(req, 'cities')?.split(',').map((c) => c.trim()).filter(Boolean);
    const templates = queryString(req, 'templates')?.split(',').map((c) => c.trim()).filter(Boolean);
    const target = queryNumber(req, 'target') ?? 1000;
    res.json(buildSearchPlan({ cities, templates, target }));
  }),
);

adminRouter.post(
  '/acquire/search',
  asyncHandler(async (req, res) => {
    const schema = z.object({
      provider: z.enum(['google_places', 'apify']),
      queries: z.array(z.string().min(3)).min(1).max(50),
      maxPerQuery: z.number().int().min(1).max(300).optional(),
      /** Apify only: one location per run, e.g. "Leeds, United Kingdom". */
      location: z.string().min(2).max(120).optional(),
      dryRun: z.boolean().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'Invalid search', parsed.error.flatten());
    const { provider, queries, maxPerQuery = 20, dryRun = false } = parsed.data;

    const db = getDb();
    const found: Array<Record<string, unknown>> = [];
    const messages: string[] = [];

    if (provider === 'apify') {
      if (!apifyConfigured()) throw new HttpError(400, 'APIFY_TOKEN is not set');
      const result = await searchGoogleMapsViaApify(queries, { maxPerQuery, location: parsed.data.location });
      messages.push(result.message);
      found.push(...result.places);
    } else {
      for (const query of queries) {
        const result = await searchPlaces(query, maxPerQuery);
        messages.push(`${query}: ${result.message}`);
        found.push(...result.places.map((p) => ({ ...p, source_ref: query })));
      }
    }

    if (dryRun) {
      res.json({ dryRun: true, messages, found: found.length, sample: found.slice(0, 10) });
      return;
    }

    let created = 0;
    let updated = 0;
    for (const place of found) {
      if (!place['company_name']) continue;
      const result = importRecord(
        db,
        place as Record<string, unknown> & { company_name: string },
        provider === 'apify' ? 'apify' : 'google_places',
        String(place['source_ref'] ?? queries[0] ?? ''),
      );
      if (result.created) created += 1;
      else updated += 1;
    }
    const suppressed = applySuppressionList(db);
    res.json({ dryRun: false, messages, found: found.length, created, updated, suppressed });
  }),
);

// --------------------------------------------------------------- enrichment -

adminRouter.post(
  '/enrich/batch',
  asyncHandler(async (req, res) => {
    const schema = z.object({
      limit: z.number().int().min(1).max(500).optional(),
      onlyUnenriched: z.boolean().optional(),
      providers: z.array(z.enum(PROVIDERS)).optional(),
      refresh: z.boolean().optional(),
    });
    const parsed = schema.safeParse(req.body ?? {});
    if (!parsed.success) throw new HttpError(400, 'Invalid batch request', parsed.error.flatten());

    const outcomes = await enrichBatch(getDb(), {
      limit: parsed.data.limit ?? 25,
      onlyUnenriched: parsed.data.onlyUnenriched ?? true,
      providers: parsed.data.providers as Provider[] | undefined,
      refresh: parsed.data.refresh ?? false,
    });
    res.json({
      processed: outcomes.length,
      updated: outcomes.filter((o) => o.fieldsUpdated.length > 0).length,
      outcomes,
    });
  }),
);

// -------------------------------------------------------------- compliance --

adminRouter.get(
  '/suppression',
  asyncHandler(async (_req, res) => {
    res.json({
      entries: getDb().prepare('SELECT * FROM suppression_list ORDER BY added_at DESC LIMIT 500').all(),
      count: (getDb().prepare('SELECT COUNT(*) AS n FROM suppression_list').get() as { n: number }).n,
    });
  }),
);

adminRouter.post(
  '/suppression',
  asyncHandler(async (req, res) => {
    const schema = z.object({
      phones: z.array(z.string()).min(1).max(20_000),
      reason: z.string().min(1).max(200).default('TPS/CTPS'),
      source: z.string().max(200).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'Invalid suppression payload', parsed.error.flatten());

    const db = getDb();
    const now = new Date().toISOString();
    let added = 0;
    let invalid = 0;

    const insert = db.prepare(
      `INSERT INTO suppression_list (phone_e164, reason, source, added_at, notes)
       VALUES (?, ?, ?, ?, NULL)
       ON CONFLICT(phone_e164) DO UPDATE SET reason = excluded.reason, added_at = excluded.added_at`,
    );
    const tx = db.transaction(() => {
      for (const raw of parsed.data.phones) {
        const phone = normalisePhone(raw);
        if (!phone) {
          invalid += 1;
          continue;
        }
        insert.run(phone, parsed.data.reason, parsed.data.source ?? 'manual', now);
        added += 1;
      }
    });
    tx();

    const suppressed = applySuppressionList(db);
    res.json({ added, invalid, leadsSuppressed: suppressed });
  }),
);

adminRouter.delete(
  '/suppression/:phone',
  asyncHandler(async (req, res) => {
    const phone = normalisePhone(pathParam(req, 'phone'));
    if (!phone) throw new HttpError(400, 'Invalid phone number');
    const changes = getDb().prepare('DELETE FROM suppression_list WHERE phone_e164 = ?').run(phone).changes;
    res.json({ removed: changes });
  }),
);

adminRouter.get(
  '/compliance/retention',
  asyncHandler(async (_req, res) => {
    const db = getDb();
    const cutoff = new Date(Date.now() - env.retentionMonths * 30 * 86_400_000).toISOString();
    const stale = db
      .prepare(
        `SELECT COUNT(*) AS n FROM leads
          WHERE updated_at < ? AND status IN ('new', 'enriched', 'priority', 'ready_to_call', 'lost', 'not_suitable')`,
      )
      .get(cutoff) as { n: number };
    res.json({ retentionMonths: env.retentionMonths, cutoff, eligibleForDeletion: stale.n });
  }),
);
