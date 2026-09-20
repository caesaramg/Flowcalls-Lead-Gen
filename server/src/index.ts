import { createApp } from './app.js';
import { getDb } from './db/index.js';
import { getActiveScoringConfig } from './domain/scoring-store.js';
import { env } from './lib/env.js';
import { log } from './lib/logger.js';

const db = getDb();
// Seeds the default scoring config on a brand-new database.
const scoring = getActiveScoringConfig(db);

const app = createApp();
const server = app.listen(env.port, env.host, () => {
  log.info(`Flowcalls prospecting system listening on http://${env.host}:${env.port}`);
  log.info(`Database: ${env.databasePath}`);
  log.info(`Scoring config: "${scoring.name}" v${scoring.config.version}`);
});

function shutdown(signal: string): void {
  log.info(`${signal} received, shutting down`);
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
