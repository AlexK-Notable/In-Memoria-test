/**
 * Tests for Query Result Caching
 * TDD: Write tests FIRST, then implementation
 *
 * Integrates LRU cache with database query results
 * for expensive operations like semantic search.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Runtime import to verify the file exists and exports correctly
import * as QueryCacheModule from '../storage/query-cache.js';

describe('Query Cache', () => {
  describe('Module exports', () => {
    it('should export the QueryCacheModule', () => {
      expect(QueryCacheModule).toBeDefined();
    });

    it('should export QueryCache class', () => {
      expect(QueryCacheModule.QueryCache).toBeDefined();
      expect(typeof QueryCacheModule.QueryCache).toBe('function');
    });

    it('should export createQueryCache function', () => {
      expect(QueryCacheModule.createQueryCache).toBeDefined();
      expect(typeof QueryCacheModule.createQueryCache).toBe('function');
    });
  });

  describe('Basic operations', () => {
    let cache: QueryCacheModule.QueryCache<string>;

    beforeEach(() => {
      cache = new QueryCacheModule.QueryCache<string>({ maxSize: 10, ttlMs: 60000 });
    });

    it('should cache and retrieve values', () => {
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');
    });

    it('should return undefined for missing keys', () => {
      expect(cache.get('nonexistent')).toBeUndefined();
    });

    it('should track cache hits and misses', () => {
      cache.set('key1', 'value1');

      cache.get('key1'); // Hit
      cache.get('key1'); // Hit
      cache.get('missing'); // Miss

      const stats = cache.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
    });

    it('should clear cache', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      cache.clear();

      expect(cache.get('key1')).toBeUndefined();
      expect(cache.get('key2')).toBeUndefined();
      expect(cache.getStats().size).toBe(0);
    });
  });

  describe('TTL (Time To Live)', () => {
    it('should expire entries after TTL', async () => {
      const cache = new QueryCacheModule.QueryCache<string>({
        maxSize: 10,
        ttlMs: 50, // 50ms TTL
      });

      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');

      // Wait for TTL to expire
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(cache.get('key1')).toBeUndefined();
    });

    it('should refresh TTL on access when configured', async () => {
      const cache = new QueryCacheModule.QueryCache<string>({
        maxSize: 10,
        ttlMs: 100,
        refreshOnAccess: true,
      });

      cache.set('key1', 'value1');

      // Access at 50ms (before expiry)
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(cache.get('key1')).toBe('value1');

      // Access at 100ms (would have expired without refresh)
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(cache.get('key1')).toBe('value1');
    });
  });

  describe('LRU eviction', () => {
    it('should evict least recently used entries when at capacity', () => {
      const cache = new QueryCacheModule.QueryCache<string>({
        maxSize: 3,
        ttlMs: 60000,
      });

      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');

      // Access key1 to make it recently used
      cache.get('key1');

      // Add key4 - should evict key2 (LRU)
      cache.set('key4', 'value4');

      expect(cache.get('key1')).toBe('value1');
      expect(cache.get('key2')).toBeUndefined(); // Evicted
      expect(cache.get('key3')).toBe('value3');
      expect(cache.get('key4')).toBe('value4');
    });
  });

  describe('getOrCompute', () => {
    it('should compute and cache value on miss', async () => {
      const cache = new QueryCacheModule.QueryCache<number>({
        maxSize: 10,
        ttlMs: 60000,
      });

      const computeFn = vi.fn().mockReturnValue(42);

      const result = await cache.getOrCompute('key1', computeFn);

      expect(result).toBe(42);
      expect(computeFn).toHaveBeenCalledTimes(1);

      // Second call should use cached value
      const result2 = await cache.getOrCompute('key1', computeFn);

      expect(result2).toBe(42);
      expect(computeFn).toHaveBeenCalledTimes(1); // Not called again
    });

    it('should handle async compute functions', async () => {
      const cache = new QueryCacheModule.QueryCache<string>({
        maxSize: 10,
        ttlMs: 60000,
      });

      const asyncComputeFn = vi.fn().mockResolvedValue('async result');

      const result = await cache.getOrCompute('key1', asyncComputeFn);

      expect(result).toBe('async result');
    });

    it('should not cache failed computations', async () => {
      const cache = new QueryCacheModule.QueryCache<string>({
        maxSize: 10,
        ttlMs: 60000,
      });

      let callCount = 0;
      const failingComputeFn = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          throw new Error('Compute failed');
        }
        return 'success';
      });

      // First call should fail
      await expect(cache.getOrCompute('key1', failingComputeFn)).rejects.toThrow('Compute failed');

      // Second call should retry (not cached)
      const result = await cache.getOrCompute('key1', failingComputeFn);
      expect(result).toBe('success');
      expect(failingComputeFn).toHaveBeenCalledTimes(2);
    });
  });

  describe('Key generation', () => {
    it('should support custom key generation', () => {
      const key = QueryCacheModule.generateCacheKey('query', { path: '/test', limit: 10 });

      expect(typeof key).toBe('string');
      expect(key.length).toBeGreaterThan(0);
    });

    it('should generate different keys for different parameters', () => {
      const key1 = QueryCacheModule.generateCacheKey('query', { path: '/test1' });
      const key2 = QueryCacheModule.generateCacheKey('query', { path: '/test2' });

      expect(key1).not.toBe(key2);
    });

    it('should generate same key for same parameters', () => {
      const key1 = QueryCacheModule.generateCacheKey('query', { path: '/test', limit: 10 });
      const key2 = QueryCacheModule.generateCacheKey('query', { path: '/test', limit: 10 });

      expect(key1).toBe(key2);
    });

    it('should handle parameter order consistently', () => {
      const key1 = QueryCacheModule.generateCacheKey('query', { a: 1, b: 2 });
      const key2 = QueryCacheModule.generateCacheKey('query', { b: 2, a: 1 });

      expect(key1).toBe(key2);
    });
  });

  describe('Invalidation patterns', () => {
    let cache: QueryCacheModule.QueryCache<string>;

    beforeEach(() => {
      cache = new QueryCacheModule.QueryCache<string>({ maxSize: 10, ttlMs: 60000 });
    });

    it('should invalidate by prefix', () => {
      cache.set('project:/path1:data', 'value1');
      cache.set('project:/path1:meta', 'value2');
      cache.set('project:/path2:data', 'value3');

      cache.invalidateByPrefix('project:/path1');

      expect(cache.get('project:/path1:data')).toBeUndefined();
      expect(cache.get('project:/path1:meta')).toBeUndefined();
      expect(cache.get('project:/path2:data')).toBe('value3');
    });

    it('should invalidate all entries matching a pattern', () => {
      cache.set('concepts:/path1', 'value1');
      cache.set('concepts:/path2', 'value2');
      cache.set('patterns:/path1', 'value3');

      cache.invalidateByPrefix('concepts:');

      expect(cache.get('concepts:/path1')).toBeUndefined();
      expect(cache.get('concepts:/path2')).toBeUndefined();
      expect(cache.get('patterns:/path1')).toBe('value3');
    });
  });

  describe('Factory function', () => {
    it('should create cache with default options', () => {
      const cache = QueryCacheModule.createQueryCache<string>();

      expect(cache).toBeInstanceOf(QueryCacheModule.QueryCache);
      cache.set('key', 'value');
      expect(cache.get('key')).toBe('value');
    });

    it('should create cache with custom options', () => {
      const cache = QueryCacheModule.createQueryCache<number>({
        maxSize: 5,
        ttlMs: 1000,
      });

      // Fill to capacity
      for (let i = 0; i < 6; i++) {
        cache.set(`key${i}`, i);
      }

      // First key should be evicted
      expect(cache.get('key0')).toBeUndefined();
      expect(cache.get('key5')).toBe(5);
    });
  });
});
