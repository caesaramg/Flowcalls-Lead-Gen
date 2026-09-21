/**
 * A very small wrapper over Node's built-in `node:sqlite`.
 *
 * We deliberately avoid a native SQLite addon: those need a prebuilt binary for
 * every Node version and platform, and when one is missing npm falls back to
 * compiling from source, which needs a full C++ toolchain. On Windows that
 * means a multi-gigabyte Visual Studio install just to open a database file.
 * Node ships SQLite itself, so there is nothing to build.
 *
 * The surface mirrors the small part of the better-sqlite3 API this project
 * used, including its savepoint-based nesting for `transaction()`.
 */
import { createRequire } from 'node:module';
import type { DatabaseSync as DatabaseSyncType } from 'node:sqlite';
import './quiet-sqlite-warning.js';

type DatabaseSync = DatabaseSyncType;

/**
 * `node:sqlite` is loaded on first use rather than imported at the top.
 *
 * ESM links every import before any module body runs, and Node 22 emits its
 * "SQLite is an experimental feature" warning during that link step — too early
 * for any listener we could register. A lazy require defers the load until
 * after quiet-sqlite-warning has installed the filter, and keeps the API
 * synchronous (a dynamic import would make every caller async).
 */
let DatabaseSyncCtor: (new (path: string) => DatabaseSync) | null = null;

function loadDatabaseSync(): new (path: string) => DatabaseSync {
  if (!DatabaseSyncCtor) {
    const require = createRequire(import.meta.url);
    DatabaseSyncCtor = (require('node:sqlite') as { DatabaseSync: new (path: string) => DatabaseSync }).DatabaseSync;
  }
  return DatabaseSyncCtor;
}

export interface RunResult {
  changes: number;
  lastInsertRowid: number;
}

export interface Statement<Row = unknown> {
  run(...params: unknown[]): RunResult;
  get(...params: unknown[]): Row | undefined;
  all(...params: unknown[]): Row[];
}

export interface Db {
  exec(sql: string): void;
  prepare<Params extends unknown[] = unknown[], Row = unknown>(sql: string): Statement<Row>;
  /** Returns a function that runs `fn` inside a transaction, as better-sqlite3 does. */
  transaction<T>(fn: () => T): () => T;
  close(): void;
  readonly raw: DatabaseSync;
}

type Bindable = null | number | bigint | string | Uint8Array;

/**
 * `node:sqlite` rejects `undefined` outright. Treating it as SQL NULL matches
 * what every call site here means by a missing value.
 */
function toBindable(value: unknown): Bindable {
  if (value === undefined || value === null) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number' || typeof value === 'bigint' || typeof value === 'string') return value;
  if (value instanceof Uint8Array) return value;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function bind(params: unknown[]): Bindable[] {
  return params.map(toBindable);
}

export function wrapDatabase(raw: DatabaseSync): Db {
  let depth = 0;
  let savepointSeq = 0;

  const db: Db = {
    raw,

    exec(sql: string): void {
      raw.exec(sql);
    },

    prepare<Params extends unknown[] = unknown[], Row = unknown>(sql: string): Statement<Row> {
      const statement = raw.prepare(sql);
      return {
        run(...params: unknown[]): RunResult {
          const result = statement.run(...bind(params));
          return { changes: Number(result.changes), lastInsertRowid: Number(result.lastInsertRowid) };
        },
        get(...params: unknown[]): Row | undefined {
          return statement.get(...bind(params)) as Row | undefined;
        },
        all(...params: unknown[]): Row[] {
          return statement.all(...bind(params)) as Row[];
        },
      };
    },

    transaction<T>(fn: () => T): () => T {
      return (): T => {
        // Nested calls use a savepoint so an inner rollback cannot discard the
        // outer transaction's work (the CSV import nests several levels deep).
        const nested = depth > 0;
        const name = nested ? `sp_${(savepointSeq += 1)}` : null;

        raw.exec(name ? `SAVEPOINT ${name}` : 'BEGIN');
        depth += 1;
        try {
          const result = fn();
          raw.exec(name ? `RELEASE ${name}` : 'COMMIT');
          return result;
        } catch (error) {
          try {
            raw.exec(name ? `ROLLBACK TO ${name}` : 'ROLLBACK');
            if (name) raw.exec(`RELEASE ${name}`);
          } catch {
            // The rollback itself failed — surface the original error instead.
          }
          throw error;
        } finally {
          depth -= 1;
        }
      };
    },

    close(): void {
      raw.close();
    },
  };

  return db;
}

export function createDatabase(filePath: string): Db {
  const DatabaseSyncClass = loadDatabaseSync();
  return wrapDatabase(new DatabaseSyncClass(filePath));
}
