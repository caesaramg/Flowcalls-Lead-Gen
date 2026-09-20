import type { Db } from '../db/index.js';
import { log } from '../lib/logger.js';
import {
  applyFieldUpdates,
  autoAdvanceAfterScoring,
  getLead,
  regeneratePersonalisation,
} from '../domain/leads.js';
import { getActiveScoringConfig, rescoreLead } from '../domain/scoring-store.js';
import type { LeadRow, ProvenanceSource } from '../domain/types.js';
import { companiesHouseConfigured, enrichFromCompaniesHouse } from './companies-house.js';
import { findPlaceId, googlePlacesConfigured, refreshPlaceDetails } from './google-places.js';
import { enrichFromWebsite } from './website.js';

export const PROVIDERS = ['google_places', 'website', 'companies_house'] as const;
export type Provider = (typeof PROVIDERS)[number];

export interface ProviderStatus {
  provider: Provider;
  configured: boolean;
  /** What the user has to do to turn it on. */
  requirement: string;
  description: string;
}

export function providerStatuses(): ProviderStatus[] {
  return [
    {
      provider: 'google_places',
      configured: googlePlacesConfigured(),
      requirement: 'GOOGLE_PLACES_API_KEY',
      description: 'Rating, review count, opening hours, website, phone and Maps URL.',
    },
    {
      provider: 'website',
      configured: true,
      requirement: 'None — uses the lead’s own website',
      description: 'Google Ads, booking software, contact form, socials, services, site quality.',
    },
    {
      provider: 'companies_house',
      configured: companiesHouseConfigured(),
      requirement: 'COMPANIES_HOUSE_API_KEY',
      description: 'Company number, status, incorporation year and serving director name.',
    },
  ];
}

export interface ProviderOutcome {
  provider: Provider;
  status: 'ok' | 'skipped' | 'error';
  message: string;
  fieldsUpdated: string[];
}

export interface EnrichmentOutcome {
  leadId: number;
  company: string;
  providers: ProviderOutcome[];
  fieldsUpdated: string[];
  score: number;
  band: string;
}

export interface EnrichOptions {
  providers?: Provider[];
  /** Re-fetch even when the lead was enriched recently. */
  force?: boolean;
  /** Overwrite values that already exist (never touches manual edits). */
  refresh?: boolean;
}

function recordRun(
  db: Db,
  leadId: number,
  provider: string,
  startedAt: string,
  outcome: ProviderOutcome,
): void {
  db.prepare(
    `INSERT INTO enrichment_runs (lead_id, provider, status, fields_updated, message, started_at, finished_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    leadId,
    provider,
    outcome.status,
    JSON.stringify(outcome.fieldsUpdated),
    outcome.message,
    startedAt,
    new Date().toISOString(),
  );
}

async function runProvider(
  db: Db,
  lead: LeadRow,
  provider: Provider,
  options: EnrichOptions,
): Promise<ProviderOutcome> {
  const startedAt = new Date().toISOString();
  const apply = (updates: Record<string, unknown>, source: ProvenanceSource, detail: string): string[] =>
    applyFieldUpdates(db, lead.id, updates, {
      source,
      detail,
      overwriteExisting: options.refresh ?? false,
      overwriteManual: false,
    });

  try {
    if (provider === 'google_places') {
      let placeId = lead.google_place_id;
      if (!placeId) {
        if (!googlePlacesConfigured()) {
          return { provider, status: 'skipped', message: 'GOOGLE_PLACES_API_KEY not set', fieldsUpdated: [] };
        }
        placeId = await findPlaceId(lead.company_name, lead.postcode ?? lead.city);
        if (!placeId) {
          return { provider, status: 'skipped', message: 'No matching Google place found', fieldsUpdated: [] };
        }
        apply({ google_place_id: placeId }, 'google_places', 'Places text search');
      }
      const result = await refreshPlaceDetails(placeId);
      if (!result.ok) return { provider, status: 'skipped', message: result.message, fieldsUpdated: [] };
      // Ratings and review counts move, so these always refresh.
      const fields = applyFieldUpdates(db, lead.id, result.updates, {
        source: 'google_places',
        detail: 'Places details',
        overwriteExisting: true,
        overwriteManual: false,
      });
      return { provider, status: 'ok', message: result.message, fieldsUpdated: fields };
    }

    if (provider === 'website') {
      const site = lead.website;
      if (!site) return { provider, status: 'skipped', message: 'No website on file', fieldsUpdated: [] };
      const result = await enrichFromWebsite(site);
      if (!result.ok) return { provider, status: 'skipped', message: result.message, fieldsUpdated: [] };
      // Marketing signals are point-in-time facts about the site; refresh them.
      const fields = applyFieldUpdates(db, lead.id, result.updates, {
        source: 'website',
        detail: result.finalUrl ?? site,
        overwriteExisting: true,
        overwriteManual: false,
      });
      return { provider, status: 'ok', message: result.message, fieldsUpdated: fields };
    }

    // companies_house
    if (lead.companies_house_number && !options.refresh) {
      return { provider, status: 'skipped', message: 'Company number already on file', fieldsUpdated: [] };
    }
    const result = await enrichFromCompaniesHouse(lead.company_name, lead.postcode);
    if (!result.ok) return { provider, status: 'skipped', message: result.message, fieldsUpdated: [] };
    const fields = apply(result.updates, 'companies_house', result.message);
    return { provider, status: 'ok', message: result.message, fieldsUpdated: fields };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.warn(`Enrichment ${provider} failed for lead ${lead.id}`, message);
    return { provider, status: 'error', message, fieldsUpdated: [] };
  } finally {
    // startedAt is captured above so the run row spans the whole provider call.
    void startedAt;
  }
}

export async function enrichLead(db: Db, leadId: number, options: EnrichOptions = {}): Promise<EnrichmentOutcome> {
  const lead = getLead(db, leadId);
  if (!lead) throw Object.assign(new Error(`Lead ${leadId} not found`), { status: 404 });

  const providers = options.providers ?? [...PROVIDERS];
  const outcomes: ProviderOutcome[] = [];

  for (const provider of providers) {
    const startedAt = new Date().toISOString();
    // Always read the freshest row: a website URL found by Places is used by
    // the website provider in the same pass.
    const current = getLead(db, leadId)!;
    const outcome = await runProvider(db, current, provider, options);
    recordRun(db, leadId, provider, startedAt, outcome);
    outcomes.push(outcome);
  }

  const fieldsUpdated = [...new Set(outcomes.flatMap((o) => o.fieldsUpdated))];
  const anySuccess = outcomes.some((o) => o.status === 'ok');
  if (anySuccess) {
    db.prepare('UPDATE leads SET enriched_at = ?, updated_at = ? WHERE id = ?')
      .run(new Date().toISOString(), new Date().toISOString(), leadId);
  }

  const { config } = getActiveScoringConfig(db);
  const scored = rescoreLead(db, getLead(db, leadId)!, config);
  autoAdvanceAfterScoring(db, leadId);
  regeneratePersonalisation(db, leadId);

  return {
    leadId,
    company: lead.company_name,
    providers: outcomes,
    fieldsUpdated,
    score: scored.score,
    band: scored.band,
  };
}

export interface BatchEnrichOptions extends EnrichOptions {
  limit?: number;
  /** Only leads never enriched before. */
  onlyUnenriched?: boolean;
  onProgress?: (done: number, total: number, outcome: EnrichmentOutcome) => void;
}

export async function enrichBatch(db: Db, options: BatchEnrichOptions = {}): Promise<EnrichmentOutcome[]> {
  const limit = options.limit ?? 50;
  const where = options.onlyUnenriched ? 'WHERE enriched_at IS NULL' : '';
  const leads = db
    .prepare<[number], { id: number }>(
      `SELECT id FROM leads ${where} ORDER BY score DESC, id ASC LIMIT ?`,
    )
    .all(limit);

  const results: EnrichmentOutcome[] = [];
  for (const [index, { id }] of leads.entries()) {
    const outcome = await enrichLead(db, id, options);
    results.push(outcome);
    options.onProgress?.(index + 1, leads.length, outcome);
  }
  return results;
}
