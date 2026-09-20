/**
 * Lead acquisition runner: works through a search plan (city x query template)
 * and imports the results, de-duplicating as it goes.
 */
import { getDb } from '../db/index.js';
import { applySuppressionList } from '../domain/leads.js';
import { apifyConfigured, fetchApifyDataset, searchGoogleMapsViaApify } from '../enrichment/apify-maps.js';
import { googlePlacesConfigured, searchPlaces } from '../enrichment/google-places.js';
import { importRecord } from '../ingest/csv-import.js';
import { buildSearchPlan } from '../ingest/search-plan.js';
import { flagBool, flagNumber, flagString, parseArgs } from './args.js';

const args = parseArgs();

if (flagBool(args, 'help')) {
  console.log(`Usage: npm run acquire -- [--target 1000] [--provider google_places|apify] [--cities "Leeds,Manchester"] [--dry-run] [--plan-only]

Searches Google Maps for plumbing and heating businesses across UK cities and
imports what it finds. Requires GOOGLE_PLACES_API_KEY or APIFY_TOKEN.

  --target N     How many unique prospects you are aiming for (default 1000)
  --provider     google_places (default) or apify
  --cities       Restrict to these cities
  --templates    Restrict to these query templates
  --location     Apify only: one location per run (default "United Kingdom")
  --dataset ID   Import an Apify dataset that has already been scraped
  --plan-only    Print the search plan and stop
  --dry-run      Run the searches but do not write to the database`);
  process.exit(0);
}

const provider = flagString(args, 'provider') ?? 'google_places';
const datasetId = flagString(args, 'dataset');

if (datasetId) {
  if (!apifyConfigured()) {
    console.error('APIFY_TOKEN is not set — it is needed to read the dataset.');
    process.exit(1);
  }
  const db = getDb();
  const result = await fetchApifyDataset(datasetId);
  if (!result.ok) {
    console.error(result.message);
    process.exit(1);
  }
  console.log(result.message);

  let datasetCreated = 0;
  let datasetUpdated = 0;
  for (const place of result.places) {
    if (!place['company_name']) continue;
    const outcome = importRecord(
      db,
      place as Record<string, unknown> & { company_name: string },
      'apify',
      `Apify dataset ${datasetId}`,
    );
    if (outcome.created) datasetCreated += 1;
    else datasetUpdated += 1;
  }
  const datasetSuppressed = applySuppressionList(db);
  console.log(`  New prospects: ${datasetCreated}`);
  console.log(`  Already known: ${datasetUpdated}`);
  console.log(`  Closed skipped: ${result.skippedClosed}`);
  console.log(`  Suppressed:    ${datasetSuppressed}`);
  console.log(`\nNext: npm run enrich -- --limit 200`);
  db.close();
  process.exit(0);
}
const plan = buildSearchPlan({
  target: flagNumber(args, 'target') ?? 1000,
  cities: flagString(args, 'cities')?.split(',').map((c) => c.trim()).filter(Boolean),
  templates: flagString(args, 'templates')?.split(',').map((c) => c.trim()).filter(Boolean),
});

console.log(`Plan: ${plan.searches.length} searches, ~${plan.estimatedResults} results, ~${plan.estimatedUnique} unique after de-duplication (target ${plan.target}).`);
if (flagBool(args, 'plan-only')) {
  for (const search of plan.searches) console.log(`  ${search.query} (max ${search.maxResults})`);
  process.exit(0);
}

if (provider === 'google_places' && !googlePlacesConfigured()) {
  console.error('GOOGLE_PLACES_API_KEY is not set. Add it to .env, or use --provider apify, or import a CSV instead.');
  process.exit(1);
}
if (provider === 'apify' && !apifyConfigured()) {
  console.error('APIFY_TOKEN is not set. Add it to .env, or use --provider google_places.');
  process.exit(1);
}

const dryRun = flagBool(args, 'dry-run');
const db = getDb();
let created = 0;
let updated = 0;
let seen = 0;

if (provider === 'apify') {
  const queries = plan.searches.map((s) => s.query);
  console.log(`Running ${queries.length} queries through Apify (this can take several minutes)…`);
  const result = await searchGoogleMapsViaApify(queries, {
    maxPerQuery: Math.max(...plan.searches.map((s) => s.maxResults)),
    location: flagString(args, 'location') ?? 'United Kingdom',
  });
  console.log(`  ${result.message}`);
  seen = result.places.length;
  if (!dryRun) {
    for (const place of result.places) {
      if (!place['company_name']) continue;
      const outcome = importRecord(db, place as Record<string, unknown> & { company_name: string }, 'apify', 'acquire');
      if (outcome.created) created += 1;
      else updated += 1;
    }
  }
} else {
  for (const [index, search] of plan.searches.entries()) {
    const result = await searchPlaces(search.query, search.maxResults);
    seen += result.places.length;
    if (!dryRun) {
      for (const place of result.places) {
        if (!place['company_name']) continue;
        const outcome = importRecord(
          db,
          { ...place, source_ref: search.query } as unknown as Record<string, unknown> & { company_name: string },
          'google_places',
          search.query,
        );
        if (outcome.created) created += 1;
        else updated += 1;
      }
    }
    console.log(
      `[${String(index + 1).padStart(3)}/${plan.searches.length}] ${search.query.padEnd(42)} ` +
      `${result.places.length} result(s) · ${created} new so far`,
    );
    if (created >= plan.target) {
      console.log(`Reached the target of ${plan.target} new prospects — stopping.`);
      break;
    }
  }
}

const suppressed = dryRun ? 0 : applySuppressionList(db);
console.log(`\n${dryRun ? 'DRY RUN — nothing written' : 'Acquisition complete'}`);
console.log(`  Results seen:  ${seen}`);
console.log(`  New prospects: ${created}`);
console.log(`  Existing seen: ${updated}`);
console.log(`  Suppressed:    ${suppressed}`);
console.log(`\nNext: npm run enrich -- --limit 100`);
db.close();
