import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  Logger,
  runWithRequestContext,
  getRequestContext,
  generateRequestId,
  RequestContext,
} from '../utils/logger.js';

describe('Logger Correlation ID Support', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let originalMCPServer: string | undefined;
  let originalDebug: string | undefined;

  beforeEach(() => {
    // Capture console output
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Save original env vars
    originalMCPServer = process.env.MCP_SERVER;
    originalDebug = process.env.DEBUG;
  });

  afterEach(() => {
    // Restore spies
    consoleErrorSpy.mockRestore();
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();

    // Restore env vars
    if (originalMCPServer === undefined) {
      delete process.env.MCP_SERVER;
    } else {
      process.env.MCP_SERVER = originalMCPServer;
    }
    if (originalDebug === undefined) {
      delete process.env.DEBUG;
    } else {
      process.env.DEBUG = originalDebug;
    }
  });

  // ============================================================================
  // generateRequestId
  // ============================================================================

  describe('generateRequestId', () => {
    it('should generate unique request IDs', () => {
      const id1 = generateRequestId();
      const id2 = generateRequestId();

      expect(id1).not.toBe(id2);
    });

    it('should generate IDs with req_ prefix', () => {
      const id = generateRequestId();

      expect(id).toMatch(/^req_/);
    });

    it('should generate IDs with expected format', () => {
      const id = generateRequestId();

      // Format: req_<timestamp_base36>_<random_base36>
      expect(id).toMatch(/^req_[a-z0-9]+_[a-z0-9]+$/);
    });
  });

  // ============================================================================
  // runWithRequestContext / getRequestContext
  // ============================================================================

  describe('runWithRequestContext', () => {
    it('should provide context within the function', () => {
      const context: RequestContext = {
        correlationId: 'test-123',
        toolName: 'test_tool',
      };

      runWithRequestContext(context, () => {
        const retrieved = getRequestContext();
        expect(retrieved).toEqual(context);
      });
    });

    it('should return function result', () => {
      const result = runWithRequestContext({ correlationId: 'test' }, () => {
        return 'test-result';
      });

      expect(result).toBe('test-result');
    });

    it('should clear context after function completes', () => {
      runWithRequestContext({ correlationId: 'test' }, () => {
        // Context exists inside
        expect(getRequestContext()).toBeDefined();
      });

      // Context is cleared outside
      expect(getRequestContext()).toBeUndefined();
    });

    it('should work with async functions', async () => {
      const context: RequestContext = {
        correlationId: 'async-test',
        toolName: 'async_tool',
      };

      const result = await runWithRequestContext(context, async () => {
        // Simulate async work
        await new Promise((resolve) => setTimeout(resolve, 10));
        return getRequestContext();
      });

      expect(result).toEqual(context);
    });

    it('should propagate context through nested async calls', async () => {
      const correlationId = 'nested-async-test';
      const captured: (string | undefined)[] = [];

      await runWithRequestContext({ correlationId }, async () => {
        captured.push(getRequestContext()?.correlationId);

        await Promise.all([
          (async () => {
            await new Promise((resolve) => setTimeout(resolve, 5));
            captured.push(getRequestContext()?.correlationId);
          })(),
          (async () => {
            await new Promise((resolve) => setTimeout(resolve, 10));
            captured.push(getRequestContext()?.correlationId);
          })(),
        ]);

        captured.push(getRequestContext()?.correlationId);
      });

      // All captured IDs should be the same
      expect(captured).toEqual([
        correlationId,
        correlationId,
        correlationId,
        correlationId,
      ]);
    });
  });

  // ============================================================================
  // Logger.getCorrelationId
  // ============================================================================

  describe('Logger.getCorrelationId', () => {
    it('should return correlation ID when in context', () => {
      runWithRequestContext({ correlationId: 'static-test' }, () => {
        expect(Logger.getCorrelationId()).toBe('static-test');
      });
    });

    it('should return undefined when not in context', () => {
      expect(Logger.getCorrelationId()).toBeUndefined();
    });
  });

  // ============================================================================
  // Logger.withCorrelationId
  // ============================================================================

  describe('Logger.withCorrelationId', () => {
    it('should set correlation ID in context', () => {
      Logger.withCorrelationId('method-test', () => {
        expect(Logger.getCorrelationId()).toBe('method-test');
      });
    });

    it('should return function result', () => {
      const result = Logger.withCorrelationId('test', () => 42);
      expect(result).toBe(42);
    });

    it('should work with async functions', async () => {
      const result = await Logger.withCorrelationId('async', async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return Logger.getCorrelationId();
      });

      expect(result).toBe('async');
    });
  });

  // ============================================================================
  // Logger.withRequestContext
  // ============================================================================

  describe('Logger.withRequestContext', () => {
    it('should set full request context', () => {
      Logger.withRequestContext(
        {
          correlationId: 'full-context',
          toolName: 'my_tool',
          startTime: 12345,
        },
        () => {
          const ctx = getRequestContext();
          expect(ctx?.correlationId).toBe('full-context');
          expect(ctx?.toolName).toBe('my_tool');
          expect(ctx?.startTime).toBe(12345);
        }
      );
    });
  });

  // ============================================================================
  // Logger.info with correlation ID
  // ============================================================================

  describe('Logger.info', () => {
    it('should include correlation ID in log output', () => {
      runWithRequestContext({ correlationId: 'info-test-123' }, () => {
        Logger.info('Test message');
      });

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const logOutput = consoleLogSpy.mock.calls[0][0];
      expect(logOutput).toContain('[INFO]');
      expect(logOutput).toContain('[info-test-123]');
      expect(logOutput).toContain('Test message');
    });

    it('should include tool name in log output', () => {
      runWithRequestContext(
        { correlationId: 'tool-test', toolName: 'test_tool' },
        () => {
          Logger.info('Test message');
        }
      );

      const logOutput = consoleLogSpy.mock.calls[0][0];
      expect(logOutput).toContain('[tool-test]');
      expect(logOutput).toContain('[test_tool]');
    });

    it('should include timestamp in log output', () => {
      Logger.info('Test message');

      const logOutput = consoleLogSpy.mock.calls[0][0];
      // ISO timestamp format: 2024-01-01T00:00:00.000Z
      expect(logOutput).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
    });

    it('should include data as JSON in log output', () => {
      Logger.info('Test message', { key: 'value', count: 42 });

      const logOutput = consoleLogSpy.mock.calls[0][0];
      expect(logOutput).toContain('{"key":"value","count":42}');
    });

    it('should work without context (no correlation ID)', () => {
      Logger.info('No context message');

      const logOutput = consoleLogSpy.mock.calls[0][0];
      expect(logOutput).toContain('[INFO]');
      expect(logOutput).toContain('No context message');
      // Should not have a correlation ID bracket after [INFO]
      expect(logOutput).not.toMatch(/\[INFO\]\s+\[req_/);
    });

    it('should write to stderr in MCP mode', () => {
      process.env.MCP_SERVER = 'true';

      Logger.info('MCP message');

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // Logger.warn with correlation ID
  // ============================================================================

  describe('Logger.warn', () => {
    it('should include correlation ID in log output', () => {
      runWithRequestContext({ correlationId: 'warn-test' }, () => {
        Logger.warn('Warning message');
      });

      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      const logOutput = consoleWarnSpy.mock.calls[0][0];
      expect(logOutput).toContain('[WARN]');
      expect(logOutput).toContain('[warn-test]');
      expect(logOutput).toContain('Warning message');
    });

    it('should include data in log output', () => {
      Logger.warn('Warning', { level: 'high' });

      const logOutput = consoleWarnSpy.mock.calls[0][0];
      expect(logOutput).toContain('{"level":"high"}');
    });
  });

  // ============================================================================
  // Logger.error with correlation ID
  // ============================================================================

  describe('Logger.error', () => {
    it('should include correlation ID in log output', () => {
      runWithRequestContext({ correlationId: 'error-test' }, () => {
        Logger.error('Error message');
      });

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      const logOutput = consoleErrorSpy.mock.calls[0][0];
      expect(logOutput).toContain('[ERROR]');
      expect(logOutput).toContain('[error-test]');
      expect(logOutput).toContain('Error message');
    });

    it('should include Error object details', () => {
      const error = new Error('Test error');
      Logger.error('Operation failed', error);

      const logOutput = consoleErrorSpy.mock.calls[0][0];
      expect(logOutput).toContain('[ERROR]');
      expect(logOutput).toContain('Operation failed');
      expect(logOutput).toContain('"error":"Test error"');
      expect(logOutput).toContain('"stack"');
    });

    it('should handle non-Error objects', () => {
      Logger.error('Operation failed', 'string error');

      const logOutput = consoleErrorSpy.mock.calls[0][0];
      expect(logOutput).toContain('"error":"string error"');
    });

    it('should include additional data with error', () => {
      const error = new Error('Test error');
      Logger.error('Failed', error, { operation: 'test' });

      const logOutput = consoleErrorSpy.mock.calls[0][0];
      expect(logOutput).toContain('"operation":"test"');
      expect(logOutput).toContain('"error":"Test error"');
    });
  });

  // ============================================================================
  // Logger.debug with correlation ID
  // ============================================================================

  describe('Logger.debug', () => {
    it('should include correlation ID when DEBUG=true', () => {
      process.env.DEBUG = 'true';

      runWithRequestContext({ correlationId: 'debug-test' }, () => {
        Logger.debug('Debug message');
      });

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      const logOutput = consoleErrorSpy.mock.calls[0][0];
      expect(logOutput).toContain('[DEBUG]');
      expect(logOutput).toContain('[debug-test]');
      expect(logOutput).toContain('Debug message');
    });

    it('should not log when DEBUG is not set', () => {
      delete process.env.DEBUG;

      Logger.debug('Debug message');

      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should not log when DEBUG is false', () => {
      process.env.DEBUG = 'false';

      Logger.debug('Debug message');

      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should include data object in debug output when DEBUG=true', () => {
      process.env.DEBUG = 'true';

      Logger.debug('Debug with data', { key: 'value', count: 42 });

      const logOutput = consoleErrorSpy.mock.calls[0][0];
      expect(logOutput).toContain('[DEBUG]');
      expect(logOutput).toContain('Debug with data');
      expect(logOutput).toContain('{"key":"value","count":42}');
    });

    it('should handle legacy spread args in debug output when DEBUG=true', () => {
      process.env.DEBUG = 'true';

      Logger.debug('Debug message', 'arg1', 'arg2', 123);

      const logOutput = consoleErrorSpy.mock.calls[0][0];
      expect(logOutput).toContain('[DEBUG]');
      expect(logOutput).toContain('Debug message');
      expect(logOutput).toContain('arg1');
      expect(logOutput).toContain('arg2');
      expect(logOutput).toContain('123');
    });

    it('should handle mixed spread args in debug output when DEBUG=true', () => {
      process.env.DEBUG = 'true';

      Logger.debug('Debug', { nested: 'object' }, ['array'], 42);

      const logOutput = consoleErrorSpy.mock.calls[0][0];
      expect(logOutput).toContain('[DEBUG]');
      expect(logOutput).toContain('Debug');
      // Arrays and objects get JSON stringified in legacy mode
      expect(logOutput).toContain('{"nested":"object"}');
      expect(logOutput).toContain('["array"]');
      expect(logOutput).toContain('42');
    });

    it('should not treat Error as data object in debug', () => {
      process.env.DEBUG = 'true';

      const error = new Error('test error');
      Logger.debug('Debug with error', error);

      const logOutput = consoleErrorSpy.mock.calls[0][0];
      expect(logOutput).toContain('[DEBUG]');
      expect(logOutput).toContain('Debug with error');
      // Error is not treated as data object, so it goes through legacy path
    });

    it('should not treat array as data object in debug', () => {
      process.env.DEBUG = 'true';

      Logger.debug('Debug with array', ['item1', 'item2']);

      const logOutput = consoleErrorSpy.mock.calls[0][0];
      expect(logOutput).toContain('[DEBUG]');
      expect(logOutput).toContain('Debug with array');
      expect(logOutput).toContain('["item1","item2"]');
    });
  });

  // ============================================================================
  // Logger.structured
  // ============================================================================

  describe('Logger.structured', () => {
    it('should output JSON with correlation ID', () => {
      runWithRequestContext(
        { correlationId: 'structured-test', toolName: 'my_tool' },
        () => {
          Logger.structured({
            level: 'info',
            message: 'Structured log',
            customField: 'value',
          });
        }
      );

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      const logOutput = consoleErrorSpy.mock.calls[0][0];
      const parsed = JSON.parse(logOutput);

      expect(parsed.level).toBe('info');
      expect(parsed.message).toBe('Structured log');
      expect(parsed.correlationId).toBe('structured-test');
      expect(parsed.toolName).toBe('my_tool');
      expect(parsed.customField).toBe('value');
      expect(parsed.timestamp).toMatch(
        /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/
      );
    });

    it('should work without context', () => {
      Logger.structured({
        level: 'warn',
        message: 'No context',
      });

      const parsed = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
      expect(parsed.correlationId).toBeUndefined();
      expect(parsed.toolName).toBeUndefined();
    });
  });

  // ============================================================================
  // Integration: Correlation ID across async operations
  // ============================================================================

  describe('Correlation ID propagation across async operations', () => {
    it('should maintain correlation ID through promise chain', async () => {
      const logs: string[] = [];
      consoleLogSpy.mockImplementation((msg: string) => logs.push(msg));

      const correlationId = 'promise-chain-test';

      await runWithRequestContext({ correlationId }, async () => {
        Logger.info('Step 1');

        await Promise.resolve().then(() => {
          Logger.info('Step 2');
        });

        await new Promise<void>((resolve) => {
          setTimeout(() => {
            Logger.info('Step 3');
            resolve();
          }, 10);
        });

        Logger.info('Step 4');
      });

      expect(logs).toHaveLength(4);
      logs.forEach((log) => {
        expect(log).toContain(`[${correlationId}]`);
      });
    });

    it('should isolate correlation IDs between concurrent contexts', async () => {
      const logs: string[] = [];
      consoleLogSpy.mockImplementation((msg: string) => logs.push(msg));

      await Promise.all([
        runWithRequestContext({ correlationId: 'context-A' }, async () => {
          Logger.info('From A - start');
          await new Promise((resolve) => setTimeout(resolve, 15));
          Logger.info('From A - end');
        }),
        runWithRequestContext({ correlationId: 'context-B' }, async () => {
          await new Promise((resolve) => setTimeout(resolve, 5));
          Logger.info('From B - middle');
          await new Promise((resolve) => setTimeout(resolve, 15));
          Logger.info('From B - end');
        }),
      ]);

      const logsA = logs.filter((l) => l.includes('[context-A]'));
      const logsB = logs.filter((l) => l.includes('[context-B]'));

      expect(logsA).toHaveLength(2);
      expect(logsB).toHaveLength(2);

      // Verify no cross-contamination
      logsA.forEach((log) => expect(log).not.toContain('[context-B]'));
      logsB.forEach((log) => expect(log).not.toContain('[context-A]'));
    });

    it('should work with nested contexts (inner takes precedence)', () => {
      const logs: string[] = [];
      consoleLogSpy.mockImplementation((msg: string) => logs.push(msg));

      runWithRequestContext({ correlationId: 'outer' }, () => {
        Logger.info('Outer before');

        runWithRequestContext({ correlationId: 'inner' }, () => {
          Logger.info('Inner');
        });

        Logger.info('Outer after');
      });

      expect(logs[0]).toContain('[outer]');
      expect(logs[1]).toContain('[inner]');
      expect(logs[2]).toContain('[outer]');
    });
  });
});
