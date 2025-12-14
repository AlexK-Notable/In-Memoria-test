/**
 * Tests for LRU Cache utility
 * TDD: Write tests FIRST, then implementation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Runtime import to verify the file exists and exports correctly
import * as LRUCacheModule from '../utils/lru-cache.js';

// Type imports for documentation - the tests use LRUCacheModule.LRUCache directly
// LRUCacheOptions and LRUCacheStats are tested via the class instantiation
export type { LRUCacheOptions, LRUCacheStats } from '../utils/lru-cache.js';

describe('LRU Cache', () => {
  describe('Module exports', () => {
    it('should export the LRUCacheModule', () => {
      expect(LRUCacheModule).toBeDefined();
    });

    it('should export LRUCache class', () => {
      expect(LRUCacheModule.LRUCache).toBeDefined();
      expect(typeof LRUCacheModule.LRUCache).toBe('function');
    });
  });

  describe('Basic operations', () => {
    it('should create a cache with maxSize', () => {
      const cache = new LRUCacheModule.LRUCache<string>({ maxSize: 10 });
      expect(cache.size).toBe(0);
    });

    it('should set and get values', () => {
      const cache = new LRUCacheModule.LRUCache<number>({ maxSize: 10 });

      cache.set('key1', 100);
      cache.set('key2', 200);

      expect(cache.get('key1')).toBe(100);
      expect(cache.get('key2')).toBe(200);
    });

    it('should return undefined for missing keys', () => {
      const cache = new LRUCacheModule.LRUCache<string>({ maxSize: 10 });
      expect(cache.get('nonexistent')).toBeUndefined();
    });

    it('should update existing keys', () => {
      const cache = new LRUCacheModule.LRUCache<number>({ maxSize: 10 });

      cache.set('key', 100);
      expect(cache.get('key')).toBe(100);

      cache.set('key', 200);
      expect(cache.get('key')).toBe(200);
      expect(cache.size).toBe(1);  // Size shouldn't increase
    });

    it('should check if key exists with has()', () => {
      const cache = new LRUCacheModule.LRUCache<string>({ maxSize: 10 });

      cache.set('key', 'value');

      expect(cache.has('key')).toBe(true);
      expect(cache.has('missing')).toBe(false);
    });

    it('should delete keys', () => {
      const cache = new LRUCacheModule.LRUCache<string>({ maxSize: 10 });

      cache.set('key', 'value');
      expect(cache.has('key')).toBe(true);

      const deleted = cache.delete('key');
      expect(deleted).toBe(true);
      expect(cache.has('key')).toBe(false);
    });

    it('should return false when deleting nonexistent key', () => {
      const cache = new LRUCacheModule.LRUCache<string>({ maxSize: 10 });
      expect(cache.delete('nonexistent')).toBe(false);
    });

    it('should clear all entries', () => {
      const cache = new LRUCacheModule.LRUCache<string>({ maxSize: 10 });

      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');

      expect(cache.size).toBe(3);

      cache.clear();

      expect(cache.size).toBe(0);
      expect(cache.get('key1')).toBeUndefined();
    });
  });

  describe('LRU eviction', () => {
    it('should evict least recently used item when at capacity', () => {
      const cache = new LRUCacheModule.LRUCache<number>({ maxSize: 3 });

      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);

      // All items present
      expect(cache.get('a')).toBe(1);
      expect(cache.get('b')).toBe(2);
      expect(cache.get('c')).toBe(3);

      // Add new item - 'a' should be evicted (least recently used since we just accessed b, c)
      // After get('a'), 'a' was accessed, so actually 'b' is now LRU
      cache.set('d', 4);

      expect(cache.size).toBe(3);
      expect(cache.has('d')).toBe(true);
    });

    it('should not evict recently accessed items', () => {
      const cache = new LRUCacheModule.LRUCache<number>({ maxSize: 3 });

      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);

      // Access 'a' to make it recently used
      cache.get('a');

      // Add 'd' - should evict 'b' (least recently accessed)
      cache.set('d', 4);

      expect(cache.has('a')).toBe(true);  // 'a' was accessed recently
      expect(cache.has('d')).toBe(true);  // 'd' just added
      expect(cache.size).toBe(3);
    });

    it('should track access order correctly', () => {
      const evicted: string[] = [];
      const cache = new LRUCacheModule.LRUCache<number>({
        maxSize: 2,
        onEvict: (key) => evicted.push(key)
      });

      cache.set('first', 1);
      cache.set('second', 2);

      // Access first to make it recently used
      cache.get('first');

      // Add third - should evict 'second' (not accessed since insertion)
      cache.set('third', 3);

      expect(evicted).toContain('second');
      expect(evicted).not.toContain('first');
    });
  });

  describe('TTL (maxAge) support', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should expire entries after maxAge', () => {
      const cache = new LRUCacheModule.LRUCache<string>({
        maxSize: 10,
        maxAge: 1000  // 1 second
      });

      cache.set('key', 'value');
      expect(cache.get('key')).toBe('value');

      // Advance time past TTL
      vi.advanceTimersByTime(1500);

      expect(cache.get('key')).toBeUndefined();
    });

    it('should return value before TTL expires', () => {
      const cache = new LRUCacheModule.LRUCache<string>({
        maxSize: 10,
        maxAge: 1000
      });

      cache.set('key', 'value');

      // Advance time but not past TTL
      vi.advanceTimersByTime(500);

      expect(cache.get('key')).toBe('value');
    });

    it('should report missing for expired entries with has()', () => {
      const cache = new LRUCacheModule.LRUCache<string>({
        maxSize: 10,
        maxAge: 1000
      });

      cache.set('key', 'value');

      vi.advanceTimersByTime(1500);

      expect(cache.has('key')).toBe(false);
    });

    it('should clean expired entries with cleanExpired()', () => {
      const cache = new LRUCacheModule.LRUCache<string>({
        maxSize: 10,
        maxAge: 1000
      });

      cache.set('key1', 'value1');

      vi.advanceTimersByTime(500);

      cache.set('key2', 'value2');

      vi.advanceTimersByTime(600);  // Total: 1100ms for key1, 600ms for key2

      const cleaned = cache.cleanExpired();

      expect(cleaned).toBe(1);  // Only key1 should be cleaned
      expect(cache.has('key1')).toBe(false);
      expect(cache.has('key2')).toBe(true);
    });

    it('should return 0 from cleanExpired when no maxAge configured', () => {
      const cache = new LRUCacheModule.LRUCache<string>({ maxSize: 10 });

      cache.set('key', 'value');

      const cleaned = cache.cleanExpired();
      expect(cleaned).toBe(0);
    });
  });

  describe('onEvict callback', () => {
    it('should call onEvict when item is evicted', () => {
      const evictedItems: Array<{ key: string; value: number }> = [];

      const cache = new LRUCacheModule.LRUCache<number>({
        maxSize: 2,
        onEvict: (key, value) => {
          evictedItems.push({ key, value: value as number });
        }
      });

      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);  // Should evict 'a'

      expect(evictedItems).toHaveLength(1);
      expect(evictedItems[0].key).toBe('a');
      expect(evictedItems[0].value).toBe(1);
    });

    it('should not call onEvict on update', () => {
      const evictCallback = vi.fn();

      const cache = new LRUCacheModule.LRUCache<number>({
        maxSize: 2,
        onEvict: evictCallback
      });

      cache.set('key', 1);
      cache.set('key', 2);  // Update, not eviction

      expect(evictCallback).not.toHaveBeenCalled();
    });

    it('should not call onEvict on delete', () => {
      const evictCallback = vi.fn();

      const cache = new LRUCacheModule.LRUCache<number>({
        maxSize: 10,
        onEvict: evictCallback
      });

      cache.set('key', 1);
      cache.delete('key');

      expect(evictCallback).not.toHaveBeenCalled();
    });
  });

  describe('Statistics', () => {
    it('should track hits and misses', () => {
      const cache = new LRUCacheModule.LRUCache<string>({ maxSize: 10 });

      cache.set('exists', 'value');

      cache.get('exists');  // Hit
      cache.get('exists');  // Hit
      cache.get('missing'); // Miss
      cache.get('missing'); // Miss
      cache.get('missing'); // Miss

      const stats = cache.getStats();

      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(3);
      expect(stats.size).toBe(1);
    });

    it('should calculate hit rate correctly', () => {
      const cache = new LRUCacheModule.LRUCache<string>({ maxSize: 10 });

      cache.set('key', 'value');

      // 4 hits
      cache.get('key');
      cache.get('key');
      cache.get('key');
      cache.get('key');

      // 1 miss
      cache.get('missing');

      const stats = cache.getStats();

      expect(stats.hitRate).toBe(0.8);  // 4/5 = 0.8
    });

    it('should return 0 hit rate when no accesses', () => {
      const cache = new LRUCacheModule.LRUCache<string>({ maxSize: 10 });

      const stats = cache.getStats();

      expect(stats.hitRate).toBe(0);
    });

    it('should reset stats on clear', () => {
      const cache = new LRUCacheModule.LRUCache<string>({ maxSize: 10 });

      cache.set('key', 'value');
      cache.get('key');
      cache.get('missing');

      cache.clear();

      const stats = cache.getStats();

      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.size).toBe(0);
    });
  });

  describe('Type safety', () => {
    it('should work with object values', () => {
      interface User {
        id: number;
        name: string;
      }

      const cache = new LRUCacheModule.LRUCache<User>({ maxSize: 10 });

      const user: User = { id: 1, name: 'Alice' };
      cache.set('user-1', user);

      const retrieved = cache.get('user-1');
      expect(retrieved?.id).toBe(1);
      expect(retrieved?.name).toBe('Alice');
    });

    it('should work with array values', () => {
      const cache = new LRUCacheModule.LRUCache<number[]>({ maxSize: 10 });

      const embedding = [0.1, 0.2, 0.3, 0.4, 0.5];
      cache.set('embedding-1', embedding);

      const retrieved = cache.get('embedding-1');
      expect(retrieved).toEqual(embedding);
    });

    it('should work with primitive values', () => {
      const numCache = new LRUCacheModule.LRUCache<number>({ maxSize: 10 });
      const strCache = new LRUCacheModule.LRUCache<string>({ maxSize: 10 });
      const boolCache = new LRUCacheModule.LRUCache<boolean>({ maxSize: 10 });

      numCache.set('num', 42);
      strCache.set('str', 'hello');
      boolCache.set('bool', true);

      expect(numCache.get('num')).toBe(42);
      expect(strCache.get('str')).toBe('hello');
      expect(boolCache.get('bool')).toBe(true);
    });
  });

  describe('Iteration', () => {
    it('should iterate over all entries with forEach', () => {
      const cache = new LRUCacheModule.LRUCache<number>({ maxSize: 10 });

      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);

      const entries: Array<{ key: string; value: number }> = [];
      cache.forEach((value, key) => {
        entries.push({ key, value });
      });

      expect(entries).toHaveLength(3);
      expect(entries).toContainEqual({ key: 'a', value: 1 });
      expect(entries).toContainEqual({ key: 'b', value: 2 });
      expect(entries).toContainEqual({ key: 'c', value: 3 });
    });

    it('should iterate in insertion order', () => {
      const cache = new LRUCacheModule.LRUCache<number>({ maxSize: 10 });

      cache.set('first', 1);
      cache.set('second', 2);
      cache.set('third', 3);

      const keys: string[] = [];
      cache.forEach((_, key) => {
        keys.push(key);
      });

      expect(keys).toEqual(['first', 'second', 'third']);
    });

    it('should handle empty cache forEach', () => {
      const cache = new LRUCacheModule.LRUCache<string>({ maxSize: 10 });

      const entries: string[] = [];
      cache.forEach((value) => {
        entries.push(value);
      });

      expect(entries).toHaveLength(0);
    });
  });

  describe('Edge cases', () => {
    it('should handle maxSize of 1', () => {
      const cache = new LRUCacheModule.LRUCache<number>({ maxSize: 1 });

      cache.set('a', 1);
      expect(cache.get('a')).toBe(1);

      cache.set('b', 2);
      expect(cache.get('a')).toBeUndefined();
      expect(cache.get('b')).toBe(2);
    });

    it('should handle empty string keys', () => {
      const cache = new LRUCacheModule.LRUCache<string>({ maxSize: 10 });

      cache.set('', 'empty key');
      expect(cache.get('')).toBe('empty key');
    });

    it('should handle null and undefined values', () => {
      const cache = new LRUCacheModule.LRUCache<string | null | undefined>({ maxSize: 10 });

      cache.set('null', null);
      cache.set('undefined', undefined);

      expect(cache.get('null')).toBeNull();
      expect(cache.get('undefined')).toBeUndefined();
      // Note: undefined value is different from missing key
      expect(cache.has('undefined')).toBe(true);
    });

    it('should handle large number of entries', () => {
      const cache = new LRUCacheModule.LRUCache<number>({ maxSize: 1000 });

      // Add 2000 entries
      for (let i = 0; i < 2000; i++) {
        cache.set(`key-${i}`, i);
      }

      expect(cache.size).toBe(1000);

      // Recent entries should still be present
      expect(cache.get('key-1999')).toBe(1999);
      expect(cache.get('key-1500')).toBe(1500);

      // Old entries should be evicted
      expect(cache.get('key-0')).toBeUndefined();
      expect(cache.get('key-500')).toBeUndefined();
    });

    it('should throw error for invalid maxSize', () => {
      expect(() => new LRUCacheModule.LRUCache<string>({ maxSize: 0 })).toThrow('maxSize must be at least 1');
      expect(() => new LRUCacheModule.LRUCache<string>({ maxSize: -1 })).toThrow('maxSize must be at least 1');
    });
  });
});
