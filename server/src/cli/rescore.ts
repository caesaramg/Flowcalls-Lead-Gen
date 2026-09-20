import { getDb } from '../db/index.js';
import { rescoreAll } from '../domain/scoring-store.js';

const db = getDb();
const result = rescoreAll(db);
console.log(`Rescored ${result.scored} lead(s) with scoring config v${result.configVersion}`);

const bands = db
  .prepare('SELECT score_band AS band, COUNT(*) AS n FROM leads GROUP BY score_band ORDER BY n DESC')
  .all() as Array<{ band: string; n: number }>;
for (const row of bands) console.log(`  ${row.band.padEnd(14)} ${row.n}`);
db.close();
