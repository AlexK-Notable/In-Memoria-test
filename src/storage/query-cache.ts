/**
 * Query Result Cache
 *
 * Caches expensive database query results using LRU eviction strategy
 * with TTL (Time-To-Live) support. Designed for caching computed results
 * like semantic search results, pattern recommendations, etc.
 *
 * @example
 * ```typescript
 * const cache = new QueryCache<SearchResult[]>({ maxSize: 100, ttlMs: 60000 });
 *
 * // Cache and retrieve
 * const results = await cache.getOrCompute('search:query', () => expensiveSearch());
 *
 * // Invalidate on data changes
 * cache.invalidateByPrefix('search:');
 * ```
 */

import { LRUCache } from '../utils/lru-cache.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Options for creating a QueryCache
 */
export interface QueryCacheOptions {
  /** Maximum number of entries to cache */
  maxSize: number;

  /** Time-to-live in milliseconds (0 = no TTL) */
  ttlMs: number;

  /** Whether to refresh TTL on cache access */
  refreshOnAccess?: boolean;
}

/**
 * Statistics about query cache usage
 */
export interface QueryCacheStats {
  /** Number of cache hits */
  hits: number;

  /** Number of cache misses */
  misses: number;

  /** Current number of cached entries */
  size: number;

  /** Hit rate (0-1) */
  hitRate: number;

  /** Number of TTL expirations */
  expirations: number;

  /** Number of LRU evictions */
  evictions: number;
}

/**
 * Internal cache entry with TTL tracking
 */
interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

// ============================================================================
// Key Generation
// ============================================================================

/**
 * Generate a cache key from a query name and parameters.
 * Ensures consistent key generation regardless of parameter order.
 *
 * @param queryName - Name of the query operation
 * @param params - Query parameters
 * @returns A deterministic cache key
 */
export function generateCacheKey(
  queryName: string,
  params: Record<string, unknown>
): string {
  // Sort keys for consistent ordering
  const sortedKeys = Object.keys(params).sort();
  const sortedParams: Record<string, unknown> = {};

  for (const key of sortedKeys) {
    sortedParams[key] = params[key];
  }

  return `${queryName}:${JSON.stringify(sortedParams)}`;
}

// ============================================================================
// QueryCache Implementation
// ============================================================================

/**
 * Cache for query results with TTL and LRU eviction.
 *
 * @template T - Type of values to cache
 */
export class QueryCache<T> {
  private cache: LRUCache<CacheEntry<T>>;
  private ttlMs: number;
  private refreshOnAccess: boolean;
  private hits: number = 0;
  private misses: number = 0;
  private expirations: number = 0;
  private evictions: number = 0;

  /**
   * Create a new QueryCache
   *
   * @param options - Cache configuration
   */
  constructor(options: QueryCacheOptions) {
    this.ttlMs = options.ttlMs;
    this.refreshOnAccess = options.refreshOnAccess ?? false;

    // Create LRU cache with onEvict callback to track evictions
    this.cache = new LRUCache<CacheEntry<T>>({
      maxSize: options.maxSize,
      onEvict: () => {
        this.evictions++;
      },
    });
  }

  /**
   * Get a value from the cache.
   *
   * @param key - Cache key
   * @returns Cached value or undefined if not found or expired
   */
  get(key: string): T | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      this.misses++;
      return undefined;
    }

    // Check TTL
    if (this.ttlMs > 0 && Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.misses++;
      this.expirations++;
      return undefined;
    }

    // Refresh TTL on access if configured
    if (this.refreshOnAccess && this.ttlMs > 0) {
      entry.expiresAt = Date.now() + this.ttlMs;
    }

    this.hits++;
    return entry.value;
  }

  /**
   * Set a value in the cache.
   *
   * @param key - Cache key
   * @param value - Value to cache
   */
  set(key: string, value: T): void {
    const entry: CacheEntry<T> = {
      value,
      expiresAt: this.ttlMs > 0 ? Date.now() + this.ttlMs : Infinity,
    };

    this.cache.set(key, entry);
  }

  /**
   * Get a value from cache, or compute and cache it if missing.
   *
   * The compute function is only called on cache miss.
   * Failed computations are not cached.
   *
   * @param key - Cache key
   * @param computeFn - Function to compute the value on cache miss
   * @returns The cached or computed value
   */
  async getOrCompute(
    key: string,
    computeFn: () => T | Promise<T>
  ): Promise<T> {
    const cached = this.get(key);
    if (cached !== undefined) {
      return cached;
    }

    // Compute the value (may be async)
    const value = await computeFn();

    // Cache the successful result
    this.set(key, value);

    return value;
  }

  /**
   * Clear all entries from the cache.
   */
  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
    this.expirations = 0;
    this.evictions = 0;
  }

  /**
   * Invalidate all entries with keys starting with a given prefix.
   * Useful for invalidating related cache entries when data changes.
   *
   * @param prefix - Key prefix to match
   */
  invalidateByPrefix(prefix: string): void {
    const keysToDelete: string[] = [];

    // Find all keys matching the prefix
    this.cache.forEach((_, key) => {
      if (key.startsWith(prefix)) {
        keysToDelete.push(key);
      }
    });

    // Delete matching entries
    for (const key of keysToDelete) {
      this.cache.delete(key);
    }
  }

  /**
   * Get cache statistics.
   *
   * @returns Statistics object
   */
  getStats(): QueryCacheStats {
    const total = this.hits + this.misses;
    const cacheStats = this.cache.getStats();

    return {
      hits: this.hits,
      misses: this.misses,
      size: cacheStats.size,
      hitRate: total > 0 ? this.hits / total : 0,
      expirations: this.expirations,
      evictions: this.evictions,
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Default cache options
 */
const DEFAULT_OPTIONS: QueryCacheOptions = {
  maxSize: 100,
  ttlMs: 5 * 60 * 1000, // 5 minutes
  refreshOnAccess: false,
};

/**
 * Create a new QueryCache with optional custom options.
 *
 * @param options - Custom cache options (merged with defaults)
 * @returns A new QueryCache instance
 */
export function createQueryCache<T>(
  options?: Partial<QueryCacheOptions>
): QueryCache<T> {
  return new QueryCache<T>({
    ...DEFAULT_OPTIONS,
    ...options,
  });
}
