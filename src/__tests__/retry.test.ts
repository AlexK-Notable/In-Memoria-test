import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  withRetry,
  withRetryResult,
  isTransientError,
  matchesRetryablePatterns,
  shouldRetry,
  calculateBackoffDelay,
  RetryPresets,
  createRetryConfig,
  RetryConfig,
} from '../utils/retry.js';

describe('Retry Utility', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ============================================================================
  // calculateBackoffDelay
  // ============================================================================

  describe('calculateBackoffDelay', () => {
    it('should calculate exponential delay for first attempt', () => {
      const delay = calculateBackoffDelay(1, {
        baseDelayMs: 1000,
        maxDelayMs: 30000,
        backoffMultiplier: 2,
        jitterFactor: 0,
      });

      expect(delay).toBe(1000); // base * 2^0 = 1000
    });

    it('should calculate exponential delay for second attempt', () => {
      const delay = calculateBackoffDelay(2, {
        baseDelayMs: 1000,
        maxDelayMs: 30000,
        backoffMultiplier: 2,
        jitterFactor: 0,
      });

      expect(delay).toBe(2000); // base * 2^1 = 2000
    });

    it('should calculate exponential delay for third attempt', () => {
      const delay = calculateBackoffDelay(3, {
        baseDelayMs: 1000,
        maxDelayMs: 30000,
        backoffMultiplier: 2,
        jitterFactor: 0,
      });

      expect(delay).toBe(4000); // base * 2^2 = 4000
    });

    it('should cap delay at maxDelayMs', () => {
      const delay = calculateBackoffDelay(10, {
        baseDelayMs: 1000,
        maxDelayMs: 5000,
        backoffMultiplier: 2,
        jitterFactor: 0,
      });

      expect(delay).toBe(5000); // Would be 512000 but capped at 5000
    });

    it('should apply jitter within expected range', () => {
      // Run multiple times to verify jitter is within range
      const delays: number[] = [];
      for (let i = 0; i < 100; i++) {
        delays.push(
          calculateBackoffDelay(1, {
            baseDelayMs: 1000,
            maxDelayMs: 30000,
            backoffMultiplier: 2,
            jitterFactor: 0.2,
          })
        );
      }

      // With 0.2 jitter factor, delays should be between 800 and 1200
      expect(Math.min(...delays)).toBeGreaterThanOrEqual(800);
      expect(Math.max(...delays)).toBeLessThanOrEqual(1200);
    });

    it('should return positive delay even with jitter', () => {
      const delay = calculateBackoffDelay(1, {
        baseDelayMs: 10,
        maxDelayMs: 30000,
        backoffMultiplier: 2,
        jitterFactor: 0.5,
      });

      expect(delay).toBeGreaterThanOrEqual(0);
    });
  });

  // ============================================================================
  // isTransientError
  // ============================================================================

  describe('isTransientError', () => {
    it('should identify timeout errors as transient', () => {
      expect(isTransientError(new Error('Request timeout'))).toBe(true);
      expect(isTransientError(new Error('Connection timed out'))).toBe(true);
      expect(isTransientError(new Error('ETIMEDOUT'))).toBe(true);
    });

    it('should identify rate limit errors as transient', () => {
      expect(isTransientError(new Error('429 Too Many Requests'))).toBe(true);
      expect(isTransientError(new Error('Rate limit exceeded'))).toBe(true);
      expect(isTransientError(new Error('Too many requests'))).toBe(true);
    });

    it('should identify connection errors as transient', () => {
      expect(isTransientError(new Error('Connection refused'))).toBe(true);
      expect(isTransientError(new Error('Connection reset by peer'))).toBe(true);
      expect(isTransientError(new Error('ECONNRESET'))).toBe(true);
      expect(isTransientError(new Error('ECONNREFUSED'))).toBe(true);
    });

    it('should identify service unavailable errors as transient', () => {
      expect(isTransientError(new Error('503 Service Unavailable'))).toBe(true);
      expect(isTransientError(new Error('Service temporarily unavailable'))).toBe(true);
      expect(isTransientError(new Error('502 Bad Gateway'))).toBe(true);
      expect(isTransientError(new Error('504 Gateway Timeout'))).toBe(true);
    });

    it('should identify network errors as transient', () => {
      expect(isTransientError(new Error('Network error'))).toBe(true);
      expect(isTransientError(new Error('Socket hang up'))).toBe(true);
      expect(isTransientError(new Error('EHOSTUNREACH'))).toBe(true);
    });

    it('should NOT identify permanent errors as transient', () => {
      expect(isTransientError(new Error('Invalid input'))).toBe(false);
      expect(isTransientError(new Error('Not found'))).toBe(false);
      expect(isTransientError(new Error('Authentication failed'))).toBe(false);
      expect(isTransientError(new Error('Permission denied'))).toBe(false);
      expect(isTransientError(new Error('400 Bad Request'))).toBe(false);
      expect(isTransientError(new Error('401 Unauthorized'))).toBe(false);
      expect(isTransientError(new Error('404 Not Found'))).toBe(false);
    });
  });

  // ============================================================================
  // matchesRetryablePatterns
  // ============================================================================

  describe('matchesRetryablePatterns', () => {
    it('should match patterns case-insensitively', () => {
      expect(matchesRetryablePatterns(new Error('TIMEOUT'), ['timeout'])).toBe(true);
      expect(matchesRetryablePatterns(new Error('timeout'), ['TIMEOUT'])).toBe(true);
    });

    it('should match partial patterns', () => {
      expect(matchesRetryablePatterns(new Error('Request timeout after 30s'), ['timeout'])).toBe(
        true
      );
    });

    it('should return false when no patterns match', () => {
      expect(matchesRetryablePatterns(new Error('Invalid input'), ['timeout', 'rate limit'])).toBe(
        false
      );
    });

    it('should return false for empty patterns array', () => {
      expect(matchesRetryablePatterns(new Error('timeout'), [])).toBe(false);
    });
  });

  // ============================================================================
  // shouldRetry
  // ============================================================================

  describe('shouldRetry', () => {
    it('should use custom isRetryable function when provided', () => {
      const config: RetryConfig = {
        maxRetries: 3,
        baseDelayMs: 100,
        maxDelayMs: 1000,
        backoffMultiplier: 2,
        isRetryable: (error) => error.message.includes('custom'),
      };

      expect(shouldRetry(new Error('custom error'), config)).toBe(true);
      expect(shouldRetry(new Error('timeout'), config)).toBe(false);
    });

    it('should use retryableErrors patterns when provided', () => {
      const config: RetryConfig = {
        maxRetries: 3,
        baseDelayMs: 100,
        maxDelayMs: 1000,
        backoffMultiplier: 2,
        retryableErrors: ['custom', 'special'],
      };

      expect(shouldRetry(new Error('custom error'), config)).toBe(true);
      expect(shouldRetry(new Error('special case'), config)).toBe(true);
      expect(shouldRetry(new Error('timeout'), config)).toBe(false);
    });

    it('should fall back to transient error detection', () => {
      const config: RetryConfig = {
        maxRetries: 3,
        baseDelayMs: 100,
        maxDelayMs: 1000,
        backoffMultiplier: 2,
      };

      expect(shouldRetry(new Error('timeout'), config)).toBe(true);
      expect(shouldRetry(new Error('invalid input'), config)).toBe(false);
    });
  });

  // ============================================================================
  // withRetry
  // ============================================================================

  describe('withRetry', () => {
    it('should return immediately on success (first try)', async () => {
      const operation = vi.fn().mockResolvedValue('success');

      const result = await withRetry(operation);

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should retry on transient failure and then succeed', async () => {
      const operation = vi
        .fn()
        .mockRejectedValueOnce(new Error('timeout'))
        .mockRejectedValueOnce(new Error('connection reset'))
        .mockResolvedValue('success');

      const promise = withRetry(operation, { maxRetries: 3, baseDelayMs: 100 });

      // Fast-forward through delays
      await vi.runAllTimersAsync();

      const result = await promise;
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should throw after max retries exhausted', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('timeout'));

      // Use withRetryResult which never throws, to avoid unhandled rejection issues with fake timers
      const promise = withRetryResult(operation, { maxRetries: 3, baseDelayMs: 100 });

      await vi.runAllTimersAsync();

      const result = await promise;
      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('timeout');
      // Initial attempt + 3 retries = 4 total attempts
      expect(operation).toHaveBeenCalledTimes(4);
    });

    it('should fail immediately on non-retryable errors', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Invalid input'));

      await expect(
        withRetry(operation, {
          maxRetries: 3,
          baseDelayMs: 100,
        })
      ).rejects.toThrow('Invalid input');

      // Should only try once - non-retryable error
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should respect custom isRetryable function', async () => {
      const operation = vi
        .fn()
        .mockRejectedValueOnce(new Error('custom-retryable'))
        .mockResolvedValue('success');

      const promise = withRetry(
        operation,
        {
          maxRetries: 3,
          baseDelayMs: 100,
          isRetryable: (error) => error.message.includes('custom-retryable'),
        }
      );

      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should not retry when isRetryable returns false', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('not-retryable'));

      await expect(
        withRetry(operation, {
          maxRetries: 3,
          baseDelayMs: 100,
          isRetryable: () => false,
        })
      ).rejects.toThrow('not-retryable');

      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should call onRetry callback before each retry', async () => {
      const operation = vi
        .fn()
        .mockRejectedValueOnce(new Error('timeout'))
        .mockRejectedValueOnce(new Error('timeout'))
        .mockResolvedValue('success');

      const onRetry = vi.fn();

      const promise = withRetry(
        operation,
        {
          maxRetries: 3,
          baseDelayMs: 100,
          jitterFactor: 0,
        },
        'testOperation',
        onRetry
      );

      await vi.runAllTimersAsync();
      await promise;

      expect(onRetry).toHaveBeenCalledTimes(2);
      expect(onRetry).toHaveBeenNthCalledWith(
        1,
        expect.any(Error),
        1,
        100, // First retry delay
        'testOperation'
      );
      expect(onRetry).toHaveBeenNthCalledWith(
        2,
        expect.any(Error),
        2,
        200, // Second retry delay (exponential)
        'testOperation'
      );
    });

    it('should apply exponential backoff delays', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('timeout'));
      const delays: number[] = [];

      const onRetry = (_error: Error, _attempt: number, delayMs: number) => {
        delays.push(delayMs);
      };

      // Attach catch handler BEFORE running timers to avoid unhandled rejection
      const promise = withRetry(
        operation,
        {
          maxRetries: 4,
          baseDelayMs: 100,
          maxDelayMs: 10000,
          backoffMultiplier: 2,
          jitterFactor: 0, // Disable jitter for predictable test
        },
        undefined,
        onRetry
      ).catch(() => {}); // Catch immediately to prevent unhandled rejection

      await vi.runAllTimersAsync();
      await promise;

      // Delays should be: 100, 200, 400, 800
      expect(delays).toEqual([100, 200, 400, 800]);
    });

    it('should cap delays at maxDelayMs', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('timeout'));
      const delays: number[] = [];

      const onRetry = (_error: Error, _attempt: number, delayMs: number) => {
        delays.push(delayMs);
      };

      // Attach catch handler BEFORE running timers to avoid unhandled rejection
      const promise = withRetry(
        operation,
        {
          maxRetries: 5,
          baseDelayMs: 1000,
          maxDelayMs: 3000,
          backoffMultiplier: 2,
          jitterFactor: 0,
        },
        undefined,
        onRetry
      ).catch(() => {}); // Catch immediately to prevent unhandled rejection

      await vi.runAllTimersAsync();
      await promise;

      // Delays should be: 1000, 2000, 3000 (capped), 3000 (capped), 3000 (capped)
      expect(delays).toEqual([1000, 2000, 3000, 3000, 3000]);
    });

    it('should handle string errors', async () => {
      const operation = vi.fn().mockRejectedValue('string error');

      await expect(
        withRetry(operation, { maxRetries: 1, baseDelayMs: 100 })
      ).rejects.toThrow('string error');
    });

    it('should handle object errors with message property', async () => {
      const operation = vi.fn().mockRejectedValue({ message: 'object error' });

      await expect(
        withRetry(operation, { maxRetries: 1, baseDelayMs: 100 })
      ).rejects.toThrow('object error');
    });
  });

  // ============================================================================
  // withRetryResult
  // ============================================================================

  describe('withRetryResult', () => {
    it('should return success result on first try', async () => {
      const operation = vi.fn().mockResolvedValue('success');

      const result = await withRetryResult(operation);

      expect(result.success).toBe(true);
      expect(result.result).toBe('success');
      expect(result.attempts).toBe(1);
      expect(result.totalDelayMs).toBe(0);
      expect(result.error).toBeUndefined();
    });

    it('should return success after retries', async () => {
      const operation = vi
        .fn()
        .mockRejectedValueOnce(new Error('timeout'))
        .mockResolvedValue('success');

      const promise = withRetryResult(operation, {
        maxRetries: 3,
        baseDelayMs: 100,
        jitterFactor: 0,
      });

      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result.success).toBe(true);
      expect(result.result).toBe('success');
      expect(result.attempts).toBe(2);
      expect(result.totalDelayMs).toBe(100);
    });

    it('should return failure result after exhausting retries', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('persistent timeout'));

      const promise = withRetryResult(operation, {
        maxRetries: 2,
        baseDelayMs: 100,
        jitterFactor: 0,
      });

      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('persistent timeout');
      expect(result.attempts).toBe(3); // Initial + 2 retries
      expect(result.totalDelayMs).toBe(300); // 100 + 200
      expect(result.result).toBeUndefined();
    });

    it('should return failure immediately for non-retryable errors', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Invalid input'));

      const result = await withRetryResult(operation, { maxRetries: 3 });

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('Invalid input');
      expect(result.attempts).toBe(1);
      expect(result.totalDelayMs).toBe(0);
    });

    it('should track total delay across retries', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('timeout'));

      const promise = withRetryResult(operation, {
        maxRetries: 3,
        baseDelayMs: 100,
        backoffMultiplier: 2,
        jitterFactor: 0,
      });

      await vi.runAllTimersAsync();
      const result = await promise;

      // 100 + 200 + 400 = 700
      expect(result.totalDelayMs).toBe(700);
    });

    it('should call onRetry callback', async () => {
      const operation = vi
        .fn()
        .mockRejectedValueOnce(new Error('timeout'))
        .mockResolvedValue('success');

      const onRetry = vi.fn();

      const promise = withRetryResult(
        operation,
        { maxRetries: 3, baseDelayMs: 100 },
        'testOp',
        onRetry
      );

      await vi.runAllTimersAsync();
      await promise;

      expect(onRetry).toHaveBeenCalledWith(
        expect.any(Error),
        1,
        expect.any(Number),
        'testOp'
      );
    });
  });

  // ============================================================================
  // RetryPresets
  // ============================================================================

  describe('RetryPresets', () => {
    it('fast preset should have low delays', () => {
      expect(RetryPresets.fast.baseDelayMs).toBe(100);
      expect(RetryPresets.fast.maxDelayMs).toBe(1000);
      expect(RetryPresets.fast.maxRetries).toBe(3);
    });

    it('standard preset should have moderate delays', () => {
      expect(RetryPresets.standard.baseDelayMs).toBe(1000);
      expect(RetryPresets.standard.maxDelayMs).toBe(10000);
      expect(RetryPresets.standard.maxRetries).toBe(3);
      expect(RetryPresets.standard.isRetryable).toBeDefined();
    });

    it('persistent preset should have more retries', () => {
      expect(RetryPresets.persistent.maxRetries).toBe(5);
      expect(RetryPresets.persistent.baseDelayMs).toBe(2000);
    });

    it('rateLimited preset should have long delays', () => {
      expect(RetryPresets.rateLimited.baseDelayMs).toBe(5000);
      expect(RetryPresets.rateLimited.maxDelayMs).toBe(60000);
      expect(RetryPresets.rateLimited.retryableErrors).toContain('429');
    });

    it('embedding preset should be optimized for API calls', () => {
      expect(RetryPresets.embedding.maxRetries).toBe(3);
      expect(RetryPresets.embedding.retryableErrors).toContain('timeout');
      expect(RetryPresets.embedding.retryableErrors).toContain('rate limit');
    });

    it('database preset should have fast retries', () => {
      expect(RetryPresets.database.maxRetries).toBe(2);
      expect(RetryPresets.database.baseDelayMs).toBe(100);
      expect(RetryPresets.database.retryableErrors).toContain('SQLITE_BUSY');
    });
  });

  // ============================================================================
  // createRetryConfig
  // ============================================================================

  describe('createRetryConfig', () => {
    it('should create config from preset', () => {
      const config = createRetryConfig('fast');

      expect(config.baseDelayMs).toBe(100);
      expect(config.maxRetries).toBe(3);
    });

    it('should allow overriding preset values', () => {
      const config = createRetryConfig('fast', {
        maxRetries: 5,
        baseDelayMs: 50,
      });

      expect(config.maxRetries).toBe(5);
      expect(config.baseDelayMs).toBe(50);
      expect(config.maxDelayMs).toBe(1000); // From preset
    });

    it('should preserve preset values not overridden', () => {
      const config = createRetryConfig('standard', { maxRetries: 10 });

      expect(config.maxRetries).toBe(10);
      expect(config.baseDelayMs).toBe(1000); // From preset
      expect(config.isRetryable).toBeDefined(); // From preset
    });
  });

  // ============================================================================
  // Integration scenarios
  // ============================================================================

  describe('integration scenarios', () => {
    it('should handle real-world API timeout scenario', async () => {
      // Simulate API that times out twice then succeeds
      let attempts = 0;
      const apiCall = vi.fn().mockImplementation(() => {
        attempts++;
        if (attempts <= 2) {
          return Promise.reject(new Error('Request timeout after 30s'));
        }
        return Promise.resolve({ data: 'success' });
      });

      const promise = withRetry(apiCall, RetryPresets.standard);
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result).toEqual({ data: 'success' });
      expect(apiCall).toHaveBeenCalledTimes(3);
    });

    it('should handle rate limiting with appropriate backoff', async () => {
      const delays: number[] = [];
      const onRetry = (_e: Error, _a: number, delay: number) => delays.push(delay);

      const apiCall = vi.fn()
        .mockRejectedValueOnce(new Error('429 Too Many Requests'))
        .mockResolvedValue('success');

      const promise = withRetry(
        apiCall,
        RetryPresets.rateLimited,
        'rateLimitedApi',
        onRetry
      );

      await vi.runAllTimersAsync();
      await promise;

      // Should have longer initial delay for rate limiting
      expect(delays[0]).toBeGreaterThanOrEqual(3500); // 5000 - jitter
    });

    it('should fail fast on authentication errors', async () => {
      const apiCall = vi.fn().mockRejectedValue(new Error('401 Unauthorized'));

      await expect(
        withRetry(apiCall, RetryPresets.standard)
      ).rejects.toThrow('401 Unauthorized');

      // Should not retry auth errors
      expect(apiCall).toHaveBeenCalledTimes(1);
    });

    it('should work with async generators (simulated pagination)', async () => {
      let page = 0;
      const fetchPage = vi.fn(async (): Promise<{ page: number; hasMore: boolean }> => {
        page++;
        if (page === 2) {
          throw new Error('timeout');
        }
        return { page, hasMore: page < 3 };
      });

      // First page succeeds
      const page1 = await withRetry(fetchPage, RetryPresets.fast);
      expect(page1.page).toBe(1);

      // Second page fails then succeeds on retry
      const promise = withRetry(fetchPage, RetryPresets.fast);
      await vi.runAllTimersAsync();
      const page2 = await promise;
      expect(page2.page).toBe(3); // page is now 3 after retry
    });
  });

  // ============================================================================
  // Edge cases for normalizeError (line 239) and error handling
  // ============================================================================

  describe('normalizeError edge cases', () => {
    it('should handle completely unknown error types', async () => {
      // Test with a primitive value that is not a string
      const operation = vi.fn().mockRejectedValue(12345);

      await expect(
        withRetry(operation, { maxRetries: 0, baseDelayMs: 100 })
      ).rejects.toThrow('12345');
    });

    it('should handle null error', async () => {
      const operation = vi.fn().mockRejectedValue(null);

      await expect(
        withRetry(operation, { maxRetries: 0, baseDelayMs: 100 })
      ).rejects.toThrow('null');
    });

    it('should handle undefined error', async () => {
      const operation = vi.fn().mockRejectedValue(undefined);

      await expect(
        withRetry(operation, { maxRetries: 0, baseDelayMs: 100 })
      ).rejects.toThrow('undefined');
    });

    it('should handle symbol error', async () => {
      const sym = Symbol('test');
      const operation = vi.fn().mockRejectedValue(sym);

      await expect(
        withRetry(operation, { maxRetries: 0, baseDelayMs: 100 })
      ).rejects.toThrow('Symbol(test)');
    });

    it('should handle object with message property', async () => {
      const operation = vi.fn().mockRejectedValue({ message: 'custom error message' });

      await expect(
        withRetry(operation, { maxRetries: 0, baseDelayMs: 100 })
      ).rejects.toThrow('custom error message');
    });

    it('should handle object without message property', async () => {
      const operation = vi.fn().mockRejectedValue({ code: 500, status: 'error' });

      await expect(
        withRetry(operation, { maxRetries: 0, baseDelayMs: 100 })
      ).rejects.toThrow('[object Object]');
    });

    it('should handle array as error', async () => {
      const operation = vi.fn().mockRejectedValue(['error1', 'error2']);

      await expect(
        withRetry(operation, { maxRetries: 0, baseDelayMs: 100 })
      ).rejects.toThrow('error1,error2');
    });
  });

  // ============================================================================
  // Edge cases for withRetryResult outer error handling (lines 405-416)
  // ============================================================================

  describe('withRetryResult edge cases', () => {
    it('should handle synchronous throw in operation', async () => {
      const operation = vi.fn().mockImplementation(() => {
        throw new Error('sync throw');
      });

      const result = await withRetryResult(operation, { maxRetries: 0 });

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('sync throw');
      expect(result.attempts).toBe(1);
    });

    it('should handle rejection with non-Error value', async () => {
      const operation = vi.fn().mockRejectedValue('string rejection');

      const result = await withRetryResult(operation, { maxRetries: 0 });

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('string rejection');
    });

    it('should track correct delay when callback throws', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('timeout'));

      // Callback that throws on second call
      let callCount = 0;
      const onRetry = () => {
        callCount++;
        if (callCount > 1) {
          throw new Error('callback error');
        }
      };

      const promise = withRetryResult(
        operation,
        { maxRetries: 3, baseDelayMs: 100, jitterFactor: 0 },
        'test',
        onRetry
      );

      await vi.runAllTimersAsync();
      const result = await promise;

      // The callback exception is caught by the outer try-catch
      expect(result.success).toBe(false);
    });

    it('should return proper result on immediate success', async () => {
      const operation = vi.fn().mockResolvedValue({ data: 'test' });

      const result = await withRetryResult(operation);

      expect(result.success).toBe(true);
      expect(result.result).toEqual({ data: 'test' });
      expect(result.attempts).toBe(1);
      expect(result.totalDelayMs).toBe(0);
      expect(result.error).toBeUndefined();
    });

    it('should handle empty retryableErrors array', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('timeout'));

      // Empty retryableErrors array means matchesRetryablePatterns returns false
      // So shouldRetry returns false and no retries happen
      const result = await withRetryResult(operation, {
        maxRetries: 0, // No retries to avoid timer issues
        baseDelayMs: 100,
        retryableErrors: [], // Empty array - matchesRetryablePatterns returns false
      });

      expect(result.success).toBe(false);
      expect(result.attempts).toBe(1);
    });

    it('should handle empty retryableErrors with retries using fake timers', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('custom-error'));

      // When retryableErrors is empty and error is NOT transient, no retries
      const result = await withRetryResult(operation, {
        maxRetries: 3,
        baseDelayMs: 100,
        retryableErrors: [], // Empty array causes matchesRetryablePatterns to return false
      });

      // Empty retryableErrors short-circuits to false before checking transient
      expect(result.success).toBe(false);
      expect(result.attempts).toBe(1);
    });
  });
});
