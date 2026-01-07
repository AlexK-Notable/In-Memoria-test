/**
 * Retry Utility with Exponential Backoff
 *
 * Provides robust retry logic for handling transient failures in external
 * service calls (vector DB, embedding generation, etc.).
 *
 * Features:
 * - Exponential backoff with configurable multiplier
 * - Jitter to prevent thundering herd problem
 * - Customizable error classification (retryable vs permanent)
 * - Logging integration via callbacks
 * - Pre-configured presets for common scenarios
 *
 * @example
 * ```typescript
 * const result = await withRetry(
 *   () => fetchExternalAPI(),
 *   { maxRetries: 3, baseDelayMs: 1000 }
 * );
 * ```
 */

import { Logger } from './logger.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration for retry behavior
 */
export interface RetryConfig {
  /** Maximum number of retry attempts (not counting initial attempt) */
  maxRetries: number;

  /** Base delay in milliseconds before first retry */
  baseDelayMs: number;

  /** Maximum delay cap in milliseconds */
  maxDelayMs: number;

  /** Multiplier for exponential backoff (default: 2) */
  backoffMultiplier: number;

  /** Jitter factor 0-1 to randomize delays (default: 0.2) */
  jitterFactor?: number;

  /** List of error message patterns that are retryable */
  retryableErrors?: string[];

  /** Custom function to determine if an error is retryable */
  isRetryable?: (error: Error) => boolean;
}

/**
 * Result of a retry operation with detailed metadata
 */
export interface RetryResult<T> {
  /** Whether the operation ultimately succeeded */
  success: boolean;

  /** The result value if successful */
  result?: T;

  /** The final error if all retries failed */
  error?: Error;

  /** Total number of attempts made (1 = success on first try) */
  attempts: number;

  /** Total time spent waiting between retries in milliseconds */
  totalDelayMs: number;
}

/**
 * Callback invoked before each retry attempt
 */
export type OnRetryCallback = (
  error: Error,
  attempt: number,
  delayMs: number,
  operationName?: string
) => void;

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  jitterFactor: 0.2,
};

/**
 * Common transient error patterns that should trigger retries
 */
const TRANSIENT_ERROR_PATTERNS = [
  'timeout',
  'timed out',
  'temporarily unavailable',
  'rate limit',
  'too many requests',
  'service unavailable',
  'connection refused',
  'connection reset',
  'econnreset',
  'econnrefused',
  'etimedout',
  'network error',
  'socket hang up',
  'EHOSTUNREACH',
  '503',
  '429',
  '502',
  '504',
  '520',
  '521',
  '522',
  '523',
  '524',
];

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Calculate delay with exponential backoff and optional jitter
 *
 * Formula: min(maxDelay, baseDelay * multiplier^attempt) * (1 + jitter)
 *
 * @param attempt - Current attempt number (1-based)
 * @param config - Retry configuration
 * @returns Delay in milliseconds
 */
export function calculateBackoffDelay(
  attempt: number,
  config: Pick<RetryConfig, 'baseDelayMs' | 'maxDelayMs' | 'backoffMultiplier' | 'jitterFactor'>
): number {
  const { baseDelayMs, maxDelayMs, backoffMultiplier, jitterFactor = 0 } = config;

  // Exponential backoff: base * multiplier^(attempt-1)
  // attempt 1 -> base, attempt 2 -> base*mult, attempt 3 -> base*mult^2
  const exponentialDelay = baseDelayMs * Math.pow(backoffMultiplier, attempt - 1);

  // Cap at maximum delay
  const cappedDelay = Math.min(exponentialDelay, maxDelayMs);

  // Add jitter: delay * (1 + random(-jitter, +jitter))
  if (jitterFactor > 0) {
    const jitter = cappedDelay * jitterFactor * (Math.random() * 2 - 1);
    return Math.max(0, Math.round(cappedDelay + jitter));
  }

  return Math.round(cappedDelay);
}

/**
 * Sleep for specified milliseconds
 *
 * @param ms - Duration to sleep in milliseconds
 * @returns Promise that resolves after the delay
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if an error is a transient error based on common patterns
 *
 * @param error - The error to check
 * @returns true if the error appears to be transient
 */
export function isTransientError(error: Error): boolean {
  const message = error.message.toLowerCase();
  const name = error.name.toLowerCase();
  const combined = `${name} ${message}`;

  return TRANSIENT_ERROR_PATTERNS.some((pattern) => combined.includes(pattern.toLowerCase()));
}

/**
 * Check if an error matches custom retryable patterns
 *
 * @param error - The error to check
 * @param patterns - List of patterns to match against
 * @returns true if the error matches any pattern
 */
export function matchesRetryablePatterns(error: Error, patterns: string[]): boolean {
  const message = error.message.toLowerCase();

  return patterns.some((pattern) => message.includes(pattern.toLowerCase()));
}

/**
 * Determine if an error should trigger a retry based on configuration
 *
 * @param error - The error to evaluate
 * @param config - Retry configuration
 * @returns true if the error should trigger a retry
 */
export function shouldRetry(error: Error, config: RetryConfig): boolean {
  // If custom isRetryable function is provided, use it
  if (config.isRetryable) {
    return config.isRetryable(error);
  }

  // If specific retryable error patterns are provided, use them
  if (config.retryableErrors && config.retryableErrors.length > 0) {
    return matchesRetryablePatterns(error, config.retryableErrors);
  }

  // Default: use transient error detection
  return isTransientError(error);
}

/**
 * Normalize various error types to a standard Error object
 *
 * @param error - The error to normalize
 * @returns A proper Error instance
 */
function normalizeError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  if (typeof error === 'string') {
    return new Error(error);
  }

  if (error && typeof error === 'object' && 'message' in error) {
    return new Error(String((error as { message: unknown }).message));
  }

  return new Error(String(error));
}

// ============================================================================
// Main Functions
// ============================================================================

/**
 * Execute an operation with retry logic and exponential backoff
 *
 * @param operation - The async operation to execute
 * @param config - Retry configuration (uses defaults if not provided)
 * @param operationName - Optional name for logging purposes
 * @param onRetry - Optional callback invoked before each retry
 * @returns The result of the operation
 * @throws The last error if all retries are exhausted
 *
 * @example
 * ```typescript
 * const result = await withRetry(
 *   () => externalAPI.fetchData(),
 *   { maxRetries: 3, baseDelayMs: 1000 },
 *   'fetchData',
 *   (error, attempt, delay) => console.log(`Retry ${attempt} in ${delay}ms`)
 * );
 * ```
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  config: Partial<RetryConfig> = {},
  operationName?: string,
  onRetry?: OnRetryCallback
): Promise<T> {
  const fullConfig: RetryConfig = { ...DEFAULT_CONFIG, ...config };
  const { maxRetries } = fullConfig;

  let lastError: Error | undefined;

  // Attempt the operation up to maxRetries + 1 times (initial + retries)
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = normalizeError(error);

      // Check if we should retry
      const hasRetriesLeft = attempt <= maxRetries;
      const isRetryableError = shouldRetry(lastError, fullConfig);

      if (!hasRetriesLeft || !isRetryableError) {
        // No more retries or error is not retryable
        if (!isRetryableError) {
          Logger.debug(
            `[Retry] ${operationName || 'Operation'} failed with non-retryable error: ${lastError.message}`
          );
        }
        throw lastError;
      }

      // Calculate delay for next retry
      const delayMs = calculateBackoffDelay(attempt, fullConfig);

      // Invoke callback before retry
      if (onRetry) {
        onRetry(lastError, attempt, delayMs, operationName);
      } else {
        // Default logging
        Logger.debug(
          `[Retry] ${operationName || 'Operation'} attempt ${attempt} failed: ${lastError.message}. Retrying in ${delayMs}ms...`
        );
      }

      // Wait before retry
      await sleep(delayMs);
    }
  }

  // Should not reach here, but TypeScript needs this
  throw lastError ?? new Error('Retry failed with no error captured');
}

/**
 * Execute an operation with retry logic, returning detailed result metadata
 *
 * Unlike `withRetry`, this function never throws. Instead, it returns a
 * `RetryResult` object with success/failure status and metadata.
 *
 * @param operation - The async operation to execute
 * @param config - Retry configuration (uses defaults if not provided)
 * @param operationName - Optional name for logging purposes
 * @param onRetry - Optional callback invoked before each retry
 * @returns RetryResult with success status, result/error, and metadata
 *
 * @example
 * ```typescript
 * const result = await withRetryResult(
 *   () => externalAPI.fetchData(),
 *   { maxRetries: 3 }
 * );
 *
 * if (result.success) {
 *   console.log('Data:', result.result);
 * } else {
 *   console.log(`Failed after ${result.attempts} attempts: ${result.error?.message}`);
 * }
 * ```
 */
export async function withRetryResult<T>(
  operation: () => Promise<T>,
  config: Partial<RetryConfig> = {},
  operationName?: string,
  onRetry?: OnRetryCallback
): Promise<RetryResult<T>> {
  const fullConfig: RetryConfig = { ...DEFAULT_CONFIG, ...config };
  const { maxRetries } = fullConfig;

  let attempts = 0;
  let totalDelayMs = 0;

  // Wrap the callback to track delays
  const trackingCallback: OnRetryCallback = (error, attempt, delayMs, opName) => {
    totalDelayMs += delayMs;
    if (onRetry) {
      onRetry(error, attempt, delayMs, opName);
    }
  };

  try {
    // Attempt the operation up to maxRetries + 1 times
    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      attempts = attempt;

      try {
        const result = await operation();
        return {
          success: true,
          result,
          attempts,
          totalDelayMs,
        };
      } catch (error) {
        const normalizedError = normalizeError(error);

        // Check if we should retry
        const hasRetriesLeft = attempt <= maxRetries;
        const isRetryableError = shouldRetry(normalizedError, fullConfig);

        if (!hasRetriesLeft || !isRetryableError) {
          return {
            success: false,
            error: normalizedError,
            attempts,
            totalDelayMs,
          };
        }

        // Calculate delay for next retry
        const delayMs = calculateBackoffDelay(attempt, fullConfig);

        // Invoke callback before retry
        trackingCallback(normalizedError, attempt, delayMs, operationName);

        // Wait before retry
        await sleep(delayMs);
      }
    }
  } catch (error) {
    // Unexpected error during retry logic itself
    return {
      success: false,
      error: normalizeError(error),
      attempts,
      totalDelayMs,
    };
  }

  // Should not reach here
  return {
    success: false,
    error: new Error('Retry failed unexpectedly'),
    attempts,
    totalDelayMs,
  };
}

// ============================================================================
// Pre-configured Presets
// ============================================================================

/**
 * Pre-configured retry options for common scenarios
 */
export const RetryPresets = {
  /**
   * Quick retry for local/fast operations
   * - 3 retries, 100ms base delay, max 1s
   */
  fast: {
    maxRetries: 3,
    baseDelayMs: 100,
    maxDelayMs: 1000,
    backoffMultiplier: 2,
    jitterFactor: 0.1,
  } as RetryConfig,

  /**
   * Standard retry for API calls
   * - 3 retries, 1s base delay, max 10s
   * - Uses transient error detection
   */
  standard: {
    maxRetries: 3,
    baseDelayMs: 1000,
    maxDelayMs: 10000,
    backoffMultiplier: 2,
    jitterFactor: 0.2,
    isRetryable: isTransientError,
  } as RetryConfig,

  /**
   * Persistent retry for critical operations
   * - 5 retries, 2s base delay, max 30s
   * - Uses transient error detection
   */
  persistent: {
    maxRetries: 5,
    baseDelayMs: 2000,
    maxDelayMs: 30000,
    backoffMultiplier: 2,
    jitterFactor: 0.2,
    isRetryable: isTransientError,
  } as RetryConfig,

  /**
   * Retry specifically for rate-limited APIs
   * - 5 retries, 5s base delay, max 60s
   * - Only retries rate limit errors
   */
  rateLimited: {
    maxRetries: 5,
    baseDelayMs: 5000,
    maxDelayMs: 60000,
    backoffMultiplier: 2,
    jitterFactor: 0.3,
    retryableErrors: ['429', 'rate limit', 'too many requests', 'quota exceeded'],
  } as RetryConfig,

  /**
   * Retry for embedding/vector operations
   * - 3 retries, 500ms base delay, max 5s
   * - Retries on transient + API errors
   */
  embedding: {
    maxRetries: 3,
    baseDelayMs: 500,
    maxDelayMs: 5000,
    backoffMultiplier: 2,
    jitterFactor: 0.2,
    retryableErrors: ['timeout', 'rate limit', '429', '503', '502', 'connection', 'network'],
  } as RetryConfig,

  /**
   * Retry for database operations
   * - 2 retries, 100ms base delay, max 1s
   * - Fast retries for database locks
   */
  database: {
    maxRetries: 2,
    baseDelayMs: 100,
    maxDelayMs: 1000,
    backoffMultiplier: 2,
    jitterFactor: 0.1,
    retryableErrors: ['SQLITE_BUSY', 'database is locked', 'EBUSY'],
  } as RetryConfig,
};

/**
 * Create a custom retry configuration by extending a preset
 *
 * @param preset - The preset to extend
 * @param overrides - Configuration values to override
 * @returns A new retry configuration
 *
 * @example
 * ```typescript
 * const config = createRetryConfig('standard', { maxRetries: 5 });
 * ```
 */
export function createRetryConfig(
  preset: keyof typeof RetryPresets,
  overrides: Partial<RetryConfig> = {}
): RetryConfig {
  return { ...RetryPresets[preset], ...overrides };
}
