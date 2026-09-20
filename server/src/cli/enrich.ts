import { getDb } from '../db/index.js';
import { enrichBatch, providerStatuses, PROVIDERS, type Provider } from '../enrichment/index.js';
import { flagBool, flagNumber, flagString, parseArgs } from './args.js';

const args = parseArgs();

if (flagBool(args, 'help')) {
  console.log(`Usage: npm run enrich -- [--limit N] [--all] [--refresh] [--providers website,google_places]

  --limit N     How many leads to process (default 25)
  --all         Include leads that were enriched before (default: only new ones)
  --refresh     Overwrite existing values (never overwrites manual edits)
  --providers   Comma-separated subset of: ${PROVIDERS.join(', ')}`);
  process.exit(0);
}

console.log('Providers:');
for (const status of providerStatuses()) {
  console.log(`  ${status.configured ? '✓' : '·'} ${status.provider.padEnd(16)} ${status.configured ? 'ready' : `needs ${status.requirement}`}`);
}

const providersFlag = flagString(args, 'providers');
const providers = providersFlag
  ? (providersFlag.split(',').map((p) => p.trim()).filter((p): p is Provider => (PROVIDERS as readonly string[]).includes(p)))
  : undefined;

const db = getDb();
const outcomes = await enrichBatch(db, {
  limit: flagNumber(args, 'limit') ?? 25,
  onlyUnenriched: !flagBool(args, 'all'),
  refresh: flagBool(args, 'refresh'),
  ...(providers ? { providers } : {}),
  onProgress: (done, total, outcome) => {
    const updated = outcome.fieldsUpdated.length;
    console.log(
      `[${String(done).padStart(4)}/${total}] ${outcome.company.slice(0, 40).padEnd(40)} ` +
      `score ${String(outcome.score).padStart(3)} (${outcome.band}) · ${updated} field(s) updated`,
    );
    for (const p of outcome.providers) {
      if (p.status !== 'ok') console.log(`         ${p.provider}: ${p.status} — ${p.message}`);
    }
  },
});

console.log(`\nDone. ${outcomes.length} lead(s) processed, ${outcomes.filter((o) => o.fieldsUpdated.length > 0).length} updated.`);
db.close();
