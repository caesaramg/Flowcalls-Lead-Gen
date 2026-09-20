import fs from 'node:fs';
import path from 'node:path';
import { getDb } from '../db/index.js';
import { importCsv } from '../ingest/csv-import.js';
import { flagBool, flagNumber, parseArgs } from './args.js';
import { resolveUserPath } from './paths.js';

const args = parseArgs();
const file = args.positional[0];

if (!file) {
  console.error(`Usage: npm run import:csv -- <file.csv> [--dry-run] [--target-trades-only] [--limit N]

  --dry-run             Parse and report without writing anything
  --target-trades-only  Skip rows with no plumbing/heating signal
  --limit N             Only process the first N rows`);
  process.exit(1);
}

const resolved = resolveUserPath(file);
if (!fs.existsSync(resolved)) {
  console.error(`File not found: ${resolved}`);
  process.exit(1);
}

const db = getDb();
const report = importCsv(db, fs.readFileSync(resolved, 'utf8'), {
  filename: path.basename(resolved),
  dryRun: flagBool(args, 'dry-run'),
  targetTradesOnly: flagBool(args, 'target-trades-only'),
  limit: flagNumber(args, 'limit'),
});

console.log(`\n${report.dryRun ? 'DRY RUN — nothing written' : 'Import complete'}`);
console.log(`  Rows read:     ${report.rowCount}`);
console.log(`  Created:       ${report.created}`);
console.log(`  Updated:       ${report.updated}`);
console.log(`  Skipped:       ${report.skipped}`);
console.log(`  Suppressed:    ${report.suppressed}`);
if (report.unmappedHeaders.length > 0) {
  console.log(`  Unmapped columns: ${report.unmappedHeaders.join(', ')}`);
}
for (const issue of report.issues.slice(0, 10)) {
  console.log(`  ! row ${issue.row} ${issue.company}: ${issue.reason}`);
}
if (report.issues.length > 10) console.log(`  … and ${report.issues.length - 10} more issues`);
db.close();
