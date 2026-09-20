/**
 * Loads a TPS/CTPS export (or any list of numbers you must not call) into the
 * suppression list and flags every matching lead as do-not-call.
 */
import fs from 'node:fs';
import path from 'node:path';
import { getDb } from '../db/index.js';
import { applySuppressionList } from '../domain/leads.js';
import { normalisePhone } from '../domain/uk.js';
import { flagString, parseArgs } from './args.js';
import { resolveUserPath } from './paths.js';

const args = parseArgs();
const file = args.positional[0];

if (!file) {
  console.error(`Usage: npm run suppression:import -- <numbers.txt|csv> [--reason "TPS"] [--source "TPS export 2026-09"]

The file may be one number per line, or a CSV whose first column is the number.`);
  process.exit(1);
}

const resolved = resolveUserPath(file);
if (!fs.existsSync(resolved)) {
  console.error(`File not found: ${resolved}`);
  process.exit(1);
}

const reason = flagString(args, 'reason') ?? 'TPS/CTPS';
const source = flagString(args, 'source') ?? path.basename(resolved);
const db = getDb();
const now = new Date().toISOString();

const insert = db.prepare(
  `INSERT INTO suppression_list (phone_e164, reason, source, added_at, notes)
   VALUES (?, ?, ?, ?, NULL)
   ON CONFLICT(phone_e164) DO UPDATE SET reason = excluded.reason, added_at = excluded.added_at`,
);

let added = 0;
let invalid = 0;
const lines = fs.readFileSync(resolved, 'utf8').split(/\r?\n/);

const tx = db.transaction(() => {
  for (const line of lines) {
    const raw = line.split(',')[0]?.trim();
    if (!raw || /^(?:phone|number|telephone|tel)$/i.test(raw)) continue;
    const phone = normalisePhone(raw);
    if (!phone) {
      invalid += 1;
      continue;
    }
    insert.run(phone, reason, source, now);
    added += 1;
  }
});
tx();

const suppressed = applySuppressionList(db);
console.log(`Suppression list updated`);
console.log(`  Numbers added:     ${added}`);
console.log(`  Unparseable lines: ${invalid}`);
console.log(`  Leads suppressed:  ${suppressed}`);
db.close();
