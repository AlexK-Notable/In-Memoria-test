/**
 * Database Adapter
 *
 * Provides an async DatabaseAdapter interface over SQLiteDatabase.
 * Enables repositories to work with the existing synchronous better-sqlite3
 * implementation while maintaining an async API contract.
 */

import Database from 'better-sqlite3';
import type { DatabaseAdapter } from './repositories.js';

/**
 * SQLite Database Adapter
 *
 * Wraps better-sqlite3's synchronous API with Promise-based async methods.
 * This adapter allows repositories to use a consistent async interface
 * while still benefiting from better-sqlite3's performance.
 */
export class SQLiteDatabaseAdapter implements DatabaseAdapter {
  constructor(private db: Database.Database) {}

  /**
   * Execute a query and return all matching rows.
   * Wraps better-sqlite3's prepare().all() in a Promise.
   */
  async query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> {
    const stmt = this.db.prepare(sql);
    return stmt.all(...(params ?? [])) as T[];
  }

  /**
   * Execute a statement without returning results.
   * Wraps better-sqlite3's prepare().run() in a Promise.
   */
  async execute(sql: string, params?: unknown[]): Promise<void> {
    const stmt = this.db.prepare(sql);
    stmt.run(...(params ?? []));
  }

  /**
   * Get a single row.
   * Wraps better-sqlite3's prepare().get() in a Promise.
   */
  async get<T = unknown>(sql: string, params?: unknown[]): Promise<T | undefined> {
    const stmt = this.db.prepare(sql);
    return stmt.get(...(params ?? [])) as T | undefined;
  }

  /**
   * Get all rows.
   * Alias for query() for semantic clarity.
   */
  async all<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> {
    return this.query<T>(sql, params);
  }

  /**
   * Run a statement and return changes count.
   * Wraps better-sqlite3's prepare().run() in a Promise.
   */
  async run(sql: string, params?: unknown[]): Promise<{ changes: number }> {
    const stmt = this.db.prepare(sql);
    const result = stmt.run(...(params ?? []));
    return { changes: result.changes };
  }
}

/**
 * Create a DatabaseAdapter from an existing better-sqlite3 database instance.
 *
 * @param db - The better-sqlite3 database instance
 * @returns DatabaseAdapter implementation
 *
 * @example
 * ```typescript
 * const db = new Database(':memory:');
 * const adapter = createDatabaseAdapter(db);
 * const repo = new IntelligenceRepository(adapter);
 * ```
 */
export function createDatabaseAdapter(db: Database.Database): DatabaseAdapter {
  return new SQLiteDatabaseAdapter(db);
}
