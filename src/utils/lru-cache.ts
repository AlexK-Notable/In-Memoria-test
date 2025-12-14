/**
 * LRU (Least Recently Used) Cache Implementation
 *
 * A generic, type-safe LRU cache with:
 * - Configurable max size
 * - Optional TTL (time-to-live) support
 * - Eviction callbacks
 * - Hit/miss statistics
 *
 * Coordinates with:
 * - Embedding cache for vector similarity results
 * - Pattern cache for frequently accessed patterns
 * - Query result caching in semantic engine
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Options for creating an LRU cache
 */
export interface LRUCacheOptions<T> {
  /** Maximum number of items to store */
  maxSize: number;

  /** Optional TTL in milliseconds - items expire after this duration */
  maxAge?: number;

  /** Callback invoked when an item is evicted due to capacity */
  onEvict?: (key: string, value: T) => void;
}

/**
 * Statistics about cache usage
 */
export interface LRUCacheStats {
  /** Number of cache hits */
  hits: number;

  /** Number of cache misses */
  misses: number;

  /** Current number of items in cache */
  size: number;

  /** Hit rate (0-1), returns 0 if no accesses */
  hitRate: number;
}

// ============================================================================
// Internal Types
// ============================================================================

/**
 * Internal cache entry with metadata
 */
interface CacheEntry<T> {
  value: T;
  timestamp: number;
}

// ============================================================================
// LRU Cache Implementation
// ============================================================================

/**
 * LRU Cache with TTL support and statistics tracking.
 *
 * Uses a Map for O(1) access and maintains insertion order for LRU eviction.
 * Map iteration order is guaranteed to be insertion order in JavaScript.
 *
 * @template T - The type of values stored in the cache
 *
 * @example
 * ```typescript
 * // Basic usage
 * const cache = new LRUCache<number>({ maxSize: 100 });
 * cache.set('key', 42);
 * const value = cache.get('key'); // 42
 *
 * // With TTL
 * const ttlCache = new LRUCache<string>({
 *   maxSize: 50,
 *   maxAge: 60000 // 1 minute
 * });
 *
 * // With eviction callback
 * const cache = new LRUCache<object>({
 *   maxSize: 10,
 *   onEvict: (key, value) => {
 *     console.log(`Evicted ${key}`);
 *   }
 * });
 * ```
 */
export class LRUCache<T> {
  private cache: Map<string, CacheEntry<T>>;
  private readonly maxSize: number;
  private readonly maxAge?: number;
  private readonly onEvict?: (key: string, value: T) => void;

  // Statistics
  private hits: number = 0;
  private misses: number = 0;

  constructor(options: LRUCacheOptions<T>) {
    if (options.maxSize < 1) {
      throw new Error('maxSize must be at least 1');
    }

    this.maxSize = options.maxSize;
    this.maxAge = options.maxAge;
    this.onEvict = options.onEvict;
    this.cache = new Map();
  }

  /**
   * Get the current number of items in the cache
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Get a value from the cache.
   * Updates the item's position to most recently used.
   *
   * @param key - The key to look up
   * @returns The value if found and not expired, undefined otherwise
   */
  get(key: string): T | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      this.misses++;
      return undefined;
    }

    // Check TTL
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      this.misses++;
      return undefined;
    }

    // Move to end (most recently used) by re-inserting
    this.cache.delete(key);
    this.cache.set(key, entry);

    this.hits++;
    return entry.value;
  }

  /**
   * Store a value in the cache.
   * If key exists, updates the value and moves to most recently used.
   * If at capacity, evicts the least recently used item.
   *
   * @param key - The key to store under
   * @param value - The value to store
   */
  set(key: string, value: T): void {
    // If key exists, delete it first (will be re-added at end)
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Need to evict - get first (oldest) entry
      const firstKey = this.cache.keys().next().value as string;
      const firstEntry = this.cache.get(firstKey);
      this.cache.delete(firstKey);

      // Call eviction callback if provided
      if (this.onEvict && firstEntry) {
        this.onEvict(firstKey, firstEntry.value);
      }
    }

    // Add new entry at end (most recently used)
    this.cache.set(key, {
      value,
      timestamp: Date.now(),
    });
  }

  /**
   * Check if a key exists in the cache (and is not expired).
   * Does NOT update the item's position.
   *
   * @param key - The key to check
   * @returns true if the key exists and is not expired
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);

    if (!entry) {
      return false;
    }

    // Check TTL
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Delete a key from the cache.
   * Does NOT trigger onEvict callback (explicit deletion is not eviction).
   *
   * @param key - The key to delete
   * @returns true if the key was found and deleted
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clear all entries from the cache and reset statistics.
   */
  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Get cache usage statistics.
   *
   * @returns Statistics object with hits, misses, size, and hit rate
   */
  getStats(): LRUCacheStats {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      size: this.cache.size,
      hitRate: total > 0 ? this.hits / total : 0,
    };
  }

  /**
   * Iterate over all entries in the cache.
   * Entries are visited in insertion order (oldest first).
   *
   * @param callback - Function to call for each entry
   */
  forEach(callback: (value: T, key: string) => void): void {
    for (const [key, entry] of this.cache) {
      callback(entry.value, key);
    }
  }

  /**
   * Clean up expired entries.
   * Call this periodically if using TTL to free memory.
   *
   * @returns Number of entries cleaned
   */
  cleanExpired(): number {
    // If no maxAge configured, nothing to clean
    if (!this.maxAge) {
      return 0;
    }

    let cleaned = 0;
    const now = Date.now();

    for (const [key, entry] of this.cache) {
      if (now - entry.timestamp > this.maxAge) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * Check if an entry has expired.
   * @internal
   */
  private isExpired(entry: CacheEntry<T>): boolean {
    if (!this.maxAge) {
      return false;
    }
    return Date.now() - entry.timestamp > this.maxAge;
  }
}
