/**
 * Tests for SQLite Statement Caching
 * TDD: Write tests FIRST, then implementation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// Runtime import to verify the file exists and exports correctly
import * as StatementCacheModule from '../storage/statement-cache.js';

// Types are tested through class usage
export type { StatementCacheStats } from '../storage/statement-cache.js';

describe('Statement Cache', () => {
  describe('Module exports', () => {
    it('should export the StatementCacheModule', () => {
      expect(StatementCacheModule).toBeDefined();
    });

    it('should export StatementCache class', () => {
      expect(StatementCacheModule.StatementCache).toBeDefined();
      expect(typeof StatementCacheModule.StatementCache).toBe('function');
    });
  });

  describe('Basic operations', () => {
    let tempDir: string;
    let cache: StatementCacheModule.StatementCache;
    let mockDb: any;

    beforeEach(() => {
      tempDir = mkdtempSync(join(tmpdir(), 'statement-cache-test-'));

      // Create a mock database with prepare function
      mockDb = {
        prepare: vi.fn().mockImplementation((sql: string) => ({
          sql,
          run: vi.fn(),
          get: vi.fn(),
          all: vi.fn(),
        })),
      };

      cache = new StatementCacheModule.StatementCache(mockDb, { maxSize: 10 });
    });

    afterEach(() => {
      cache.clear();
      rmSync(tempDir, { recursive: true, force: true });
    });

    it('should prepare statement and cache it', () => {
      const sql = 'SELECT * FROM users WHERE id = ?';

      const stmt = cache.prepare(sql);
      expect(stmt).toBeDefined();
      expect(mockDb.prepare).toHaveBeenCalledWith(sql);
      expect(mockDb.prepare).toHaveBeenCalledTimes(1);
    });

    it('should return cached statement on second call', () => {
      const sql = 'SELECT * FROM users WHERE id = ?';

      const stmt1 = cache.prepare(sql);
      const stmt2 = cache.prepare(sql);

      // Should only prepare once
      expect(mockDb.prepare).toHaveBeenCalledTimes(1);
      expect(stmt1).toBe(stmt2);
    });

    it('should track cache hits and misses', () => {
      const sql = 'SELECT * FROM users WHERE id = ?';

      cache.prepare(sql); // Miss
      cache.prepare(sql); // Hit
      cache.prepare(sql); // Hit

      const stats = cache.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
    });

    it('should report hit rate correctly', () => {
      const sql1 = 'SELECT * FROM users WHERE id = ?';
      const sql2 = 'SELECT * FROM posts WHERE id = ?';

      cache.prepare(sql1); // Miss
      cache.prepare(sql1); // Hit
      cache.prepare(sql2); // Miss
      cache.prepare(sql1); // Hit
      cache.prepare(sql2); // Hit

      const stats = cache.getStats();
      expect(stats.hits).toBe(3);
      expect(stats.misses).toBe(2);
      expect(stats.hitRate).toBe(0.6); // 3/5
    });

    it('should evict least recently used statements when at capacity', () => {
      // Create cache with maxSize of 3
      cache = new StatementCacheModule.StatementCache(mockDb, { maxSize: 3 });

      cache.prepare('SELECT 1');
      cache.prepare('SELECT 2');
      cache.prepare('SELECT 3');

      expect(mockDb.prepare).toHaveBeenCalledTimes(3);

      // Access SELECT 1 to make it recently used
      cache.prepare('SELECT 1');
      expect(mockDb.prepare).toHaveBeenCalledTimes(3); // Still 3, was cached

      // Add SELECT 4 - should evict SELECT 2 (LRU)
      cache.prepare('SELECT 4');
      expect(mockDb.prepare).toHaveBeenCalledTimes(4);

      // SELECT 2 should be evicted, accessing it should cause new prepare
      mockDb.prepare.mockClear();
      cache.prepare('SELECT 2');
      expect(mockDb.prepare).toHaveBeenCalledWith('SELECT 2');
    });

    it('should clear cache', () => {
      cache.prepare('SELECT 1');
      cache.prepare('SELECT 2');

      expect(cache.getStats().size).toBe(2);

      cache.clear();

      const stats = cache.getStats();
      expect(stats.size).toBe(0);
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
    });
  });

  describe('SQL normalization', () => {
    let mockDb: any;
    let cache: StatementCacheModule.StatementCache;

    beforeEach(() => {
      mockDb = {
        prepare: vi.fn().mockImplementation((sql: string) => ({
          sql,
          run: vi.fn(),
          get: vi.fn(),
          all: vi.fn(),
        })),
      };
      cache = new StatementCacheModule.StatementCache(mockDb, { maxSize: 10 });
    });

    afterEach(() => {
      cache.clear();
    });

    it('should normalize whitespace in SQL', () => {
      const sql1 = 'SELECT  *  FROM  users  WHERE  id = ?';
      const sql2 = 'SELECT * FROM users WHERE id = ?';

      cache.prepare(sql1);
      cache.prepare(sql2);

      // Should only prepare once due to normalization
      expect(mockDb.prepare).toHaveBeenCalledTimes(1);
    });

    it('should trim SQL strings', () => {
      const sql1 = '  SELECT * FROM users  ';
      const sql2 = 'SELECT * FROM users';

      cache.prepare(sql1);
      cache.prepare(sql2);

      expect(mockDb.prepare).toHaveBeenCalledTimes(1);
    });

    it('should normalize newlines', () => {
      const sql1 = `SELECT *
        FROM users
        WHERE id = ?`;
      const sql2 = 'SELECT * FROM users WHERE id = ?';

      cache.prepare(sql1);
      cache.prepare(sql2);

      expect(mockDb.prepare).toHaveBeenCalledTimes(1);
    });
  });

  describe('Error handling', () => {
    let mockDb: any;

    it('should propagate prepare errors', () => {
      mockDb = {
        prepare: vi.fn().mockImplementation(() => {
          throw new Error('SQL syntax error');
        }),
      };

      const cache = new StatementCacheModule.StatementCache(mockDb, { maxSize: 10 });

      expect(() => cache.prepare('INVALID SQL')).toThrow('SQL syntax error');
    });

    it('should not cache statements that fail to prepare', () => {
      let callCount = 0;
      mockDb = {
        prepare: vi.fn().mockImplementation((sql: string) => {
          callCount++;
          if (callCount === 1) {
            throw new Error('SQL syntax error');
          }
          return { sql, run: vi.fn() };
        }),
      };

      const cache = new StatementCacheModule.StatementCache(mockDb, { maxSize: 10 });

      // First call should throw
      expect(() => cache.prepare('SELECT 1')).toThrow();

      // Second call should retry (not be cached)
      const stmt = cache.prepare('SELECT 1');
      expect(stmt).toBeDefined();
      expect(mockDb.prepare).toHaveBeenCalledTimes(2);
    });
  });

  describe('Real database integration', () => {
    // These tests use a real database to verify statements actually work
    let tempDir: string;
    let db: any;
    let cache: StatementCacheModule.StatementCache;

    beforeEach(async () => {
      tempDir = mkdtempSync(join(tmpdir(), 'statement-cache-integration-'));

      // Dynamic import better-sqlite3 for real database
      const Database = (await import('better-sqlite3')).default;
      db = new Database(':memory:');

      // Create test table
      db.exec('CREATE TABLE test_table (id INTEGER PRIMARY KEY, name TEXT)');
      db.exec("INSERT INTO test_table VALUES (1, 'Alice'), (2, 'Bob')");

      cache = new StatementCacheModule.StatementCache(db, { maxSize: 10 });
    });

    afterEach(() => {
      cache.clear();
      db.close();
      rmSync(tempDir, { recursive: true, force: true });
    });

    it('should execute cached SELECT statement', () => {
      const stmt = cache.prepare('SELECT * FROM test_table WHERE id = ?');
      const row = stmt.get(1);

      expect(row).toEqual({ id: 1, name: 'Alice' });
    });

    it('should execute cached INSERT statement', () => {
      const stmt = cache.prepare('INSERT INTO test_table (id, name) VALUES (?, ?)');
      const result = stmt.run(3, 'Charlie');

      expect(result.changes).toBe(1);

      // Verify with cached SELECT
      const selectStmt = cache.prepare('SELECT * FROM test_table WHERE id = ?');
      expect(selectStmt.get(3)).toEqual({ id: 3, name: 'Charlie' });
    });
  });
});
