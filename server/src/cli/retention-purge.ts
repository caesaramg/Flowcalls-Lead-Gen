/**
 * Data-retention housekeeping. Deletes prospect records that have gone
 * untouched for longer than RETENTION_MONTHS and never became customers.
 * Defaults to a dry run — pass --confirm to actually delete.
 */
import { getDb } from '../db/index.js';
import { env } from '../lib/env.js';
import { flagBool, flagNumber, parseArgs } from './args.js';

const args = parseArgs();
const months = flagNumber(args, 'months') ?? env.retentionMonths;
const confirm = flagBool(args, 'confirm');
const cutoff = new Date(Date.now() - months * 30 * 86_400_000).toISOString();

const db = getDb();
const where = `updated_at < ? AND status IN ('new', 'enriched', 'priority', 'ready_to_call', 'lost', 'not_suitable')`;

const rows = db
  .prepare(`SELECT id, company_name, status, updated_at FROM leads WHERE ${where} ORDER BY updated_at ASC LIMIT 25`)
  .all(cutoff) as Array<{ id: number; company_name: string; status: string; updated_at: string }>;
const total = (db.prepare(`SELECT COUNT(*) AS n FROM leads WHERE ${where}`).get(cutoff) as { n: number }).n;

console.log(`Retention policy: ${months} months. Cutoff: ${cutoff.slice(0, 10)}`);
console.log(`${total} lead(s) are eligible for deletion.`);
for (const row of rows) {
  console.log(`  #${row.id} ${row.company_name} (${row.status}, last touched ${row.updated_at.slice(0, 10)})`);
}
if (total > rows.length) console.log(`  … and ${total - rows.length} more`);

if (!confirm) {
  console.log(`\nDry run — nothing deleted. Re-run with --confirm to delete these records.`);
} else {
  const deleted = db.prepare(`DELETE FROM leads WHERE ${where}`).run(cutoff).changes;
  console.log(`\nDeleted ${deleted} lead(s) and their call history.`);
}
db.close();
