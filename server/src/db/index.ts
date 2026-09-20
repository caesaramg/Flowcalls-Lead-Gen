import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { env } from '../lib/env.js';
import { log } from '../lib/logger.js';
import { migrations } from './schema.js';

export type Db = Database.Database;

let instance: Db | null = null;

export function openDatabase(filePath: string = env.databasePath): Db {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const db = new Database(filePath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  migrate(db);
  return db;
}

export function getDb(): Db {
  if (!instance) instance = openDatabase();
  return instance;
}

/** Used by tests to run against a throwaway in-memory database. */
export function openTestDatabase(): Db {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  migrate(db);
  return db;
}

export function migrate(db: Db): void {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL
  )`);

  const applied = new Set(
    db.prepare<[], { version: number }>('SELECT version FROM schema_migrations').all().map((r) => r.version),
  );

  for (const migration of migrations) {
    if (applied.has(migration.version)) continue;
    const run = db.transaction(() => {
      db.exec(migration.sql);
      db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)').run(
        migration.version,
        migration.name,
        new Date().toISOString(),
      );
    });
    run();
    log.info(`Applied migration ${migration.version}: ${migration.name}`);
  }
}

export function getSetting(db: Db, key: string): string | null {
  const row = db.prepare<[string], { value: string }>('SELECT value FROM settings WHERE key = ?').get(key);
  return row?.value ?? null;
}

export function setSetting(db: Db, key: string, value: string): void {
  db.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run(key, value, new Date().toISOString());
}
