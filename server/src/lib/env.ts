import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
// src/lib -> src -> server -> repo root
export const repoRoot = path.resolve(here, '..', '..', '..');

function str(name: string, fallback = ''): string {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : v;
}

function int(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

function bool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
}

export const env = {
  nodeEnv: str('NODE_ENV', 'development'),
  port: int('PORT', 4000),
  host: str('HOST', '127.0.0.1'),
  databasePath: path.resolve(repoRoot, str('DATABASE_PATH', 'data/flowcalls.db')),
  webDistPath: path.resolve(repoRoot, str('WEB_DIST_PATH', 'web/dist')),

  /** Enrichment providers are opt-in: no key, no outbound calls. */
  googlePlacesApiKey: str('GOOGLE_PLACES_API_KEY'),
  companiesHouseApiKey: str('COMPANIES_HOUSE_API_KEY'),
  apifyToken: str('APIFY_TOKEN'),
  apifyGoogleMapsActor: str('APIFY_GOOGLE_MAPS_ACTOR', 'compass~crawler-google-places'),

  /** Website crawler politeness. */
  userAgent: str(
    'ENRICHMENT_USER_AGENT',
    'FlowcallsProspectingBot/0.1 (+internal B2B research; contact: hello@flowcalls.example)',
  ),
  httpTimeoutMs: int('HTTP_TIMEOUT_MS', 15000),
  crawlDelayMs: int('CRAWL_DELAY_MS', 1500),
  maxPagesPerSite: int('MAX_PAGES_PER_SITE', 5),
  respectRobotsTxt: bool('RESPECT_ROBOTS_TXT', true),

  /** Compliance. */
  retentionMonths: int('RETENTION_MONTHS', 24),
  requireTpsScreening: bool('REQUIRE_TPS_SCREENING', true),
} as const;

export type Env = typeof env;
