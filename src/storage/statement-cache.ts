/**
 * SQLite Statement Cache
 *
 * Caches prepared statements to improve database performance.
 * Uses an LRU (Least Recently Used) eviction strategy.
 *
 * Coordinates with:
 * - SQLiteDatabase for statement preparation
 * - LRUCache utility for eviction strategy
 *
 * @example
 * ```typescript
 * const cache = new StatementCache(db, { maxSize: 100 });
 * const stmt = cache.prepare('SELECT * FROM users WHERE id = ?');
 * const user = stmt.get(userId);
 * ```
 */

import type Database from 'better-sqlite3';
import type { Statement } from 'better-sqlite3';
import { LRUCache } from '../utils/lru-cache.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Options for creating a statement cache
 */
export interface StatementCacheOptions {
  /** Maximum number of statements to cache */
  maxSize: number;
}

/**
 * Statistics about statement cache usage
 */
export interface StatementCacheStats {
  /** Number of cache hits */
  hits: number;

  /** Number of cache misses */
  misses: number;

  /** Current number of cached statements */
  size: number;

  /** Hit rate (0-1) */
  hitRate: number;
}

// ============================================================================
// SQL Normalization
// ============================================================================

/**
 * Normalize SQL string for consistent caching.
 * Handles whitespace variations that produce identical statements.
 *
 * @param sql - Raw SQL string
 * @returns Normalized SQL string
 */
function normalizeSQL(sql: string): string {
  return sql
    // Replace all whitespace sequences (including newlines) with single space
    .replace(/\s+/g, ' ')
    // Trim leading and trailing whitespace
    .trim();
}

// ============================================================================
// Statement Cache Implementation
// ============================================================================

/**
 * Cache for SQLite prepared statements.
 *
 * Prepared statements are expensive to create but can be reused.
 * This cache stores prepared statements keyed by normalized SQL,
 * using LRU eviction when capacity is reached.
 *
 * @template TDatabase - The database type (typically better-sqlite3 Database)
 */
export class StatementCache {
  private cache: LRUCache<Statement>;
  private db: Database.Database;
  private hits: number = 0;
  private misses: number = 0;

  /**
   * Create a new statement cache
   *
   * @param db - The better-sqlite3 database instance
   * @param options - Cache configuration options
   */
  constructor(db: Database.Database, options: StatementCacheOptions) {
    this.db = db;
    this.cache = new LRUCache<Statement>({
      maxSize: options.maxSize,
    });
  }

  /**
   * Get or create a prepared statement for the given SQL.
   *
   * If the statement is already cached, returns the cached version.
   * Otherwise, prepares the statement and caches it.
   *
   * @param sql - SQL query string
   * @returns Prepared statement ready for execution
   * @throws Error if the SQL fails to prepare
   */
  prepare(sql: string): Statement {
    const normalizedSQL = normalizeSQL(sql);

    // Check cache first
    const cached = this.cache.get(normalizedSQL);
    if (cached) {
      this.hits++;
      return cached;
    }

    // Cache miss - prepare the statement
    this.misses++;

    // Prepare statement (may throw on invalid SQL)
    const stmt = this.db.prepare(normalizedSQL);

    // Cache the prepared statement
    this.cache.set(normalizedSQL, stmt);

    return stmt;
  }

  /**
   * Get cache statistics
   *
   * @returns Statistics object with hits, misses, size, and hit rate
   */
  getStats(): StatementCacheStats {
    const total = this.hits + this.misses;
    const cacheStats = this.cache.getStats();

    return {
      hits: this.hits,
      misses: this.misses,
      size: cacheStats.size,
      hitRate: total > 0 ? this.hits / total : 0,
    };
  }

  /**
   * Clear all cached statements and reset statistics.
   *
   * Call this when closing the database or when you need to
   * force re-preparation of all statements.
   */
  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }
}
