import { getDb } from '../db/index.js';
import { getActiveScoringConfig } from '../domain/scoring-store.js';
import { env } from '../lib/env.js';

const db = getDb();
const scoring = getActiveScoringConfig(db);
console.log(`Database ready at ${env.databasePath}`);
console.log(`Active scoring config: "${scoring.name}" v${scoring.config.version}`);
db.close();
