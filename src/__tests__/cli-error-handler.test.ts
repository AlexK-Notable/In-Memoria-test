/**
 * Tests for CLI Error Handler
 * TDD: Write tests FIRST, then implementation
 *
 * Provides user-friendly error messages for CLI operations
 * by integrating with ErrorClassifier.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Runtime import to verify the file exists and exports correctly
import * as CLIErrorHandlerModule from '../cli/cli-error-handler.js';

describe('CLI Error Handler', () => {
  describe('Module exports', () => {
    it('should export the CLIErrorHandlerModule', () => {
      expect(CLIErrorHandlerModule).toBeDefined();
    });

    it('should export CLIErrorHandler class', () => {
      expect(CLIErrorHandlerModule.CLIErrorHandler).toBeDefined();
      expect(typeof CLIErrorHandlerModule.CLIErrorHandler).toBe('function');
    });

    it('should export formatError function', () => {
      expect(CLIErrorHandlerModule.formatError).toBeDefined();
      expect(typeof CLIErrorHandlerModule.formatError).toBe('function');
    });

    it('should export handleError function', () => {
      expect(CLIErrorHandlerModule.handleError).toBeDefined();
      expect(typeof CLIErrorHandlerModule.handleError).toBe('function');
    });
  });

  describe('formatError', () => {
    it('should format error with category and code', () => {
      const error = new Error('ENOENT: no such file or directory');
      const formatted = CLIErrorHandlerModule.formatError(error);

      expect(formatted).toContain('FILE_NOT_FOUND');
      expect(formatted).toContain('resource');
    });

    it('should include error message', () => {
      const error = new Error('Something went wrong');
      const formatted = CLIErrorHandlerModule.formatError(error);

      expect(formatted).toContain('Something went wrong');
    });

    it('should include recovery suggestions when available', () => {
      const error = new Error('Intelligence data not available');
      const formatted = CLIErrorHandlerModule.formatError(error);

      expect(formatted).toContain('learn');
    });

    it('should format string errors', () => {
      const formatted = CLIErrorHandlerModule.formatError('String error');

      expect(formatted).toContain('String error');
    });

    it('should format unknown error types', () => {
      const formatted = CLIErrorHandlerModule.formatError({ custom: 'error' });

      // Unknown error types are classified as system/INTERNAL_ERROR
      expect(formatted).toContain('INTERNAL_ERROR');
      expect(formatted).toContain('system');
    });
  });

  describe('handleError', () => {
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
    let processExitSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });
    });

    afterEach(() => {
      consoleErrorSpy.mockRestore();
      processExitSpy.mockRestore();
    });

    it('should log error to console', () => {
      const error = new Error('Test error');

      try {
        CLIErrorHandlerModule.handleError(error);
      } catch {
        // Expected process.exit
      }

      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('should not exit when exitOnError is false', () => {
      const error = new Error('Test error');

      CLIErrorHandlerModule.handleError(error, { exitOnError: false });

      expect(processExitSpy).not.toHaveBeenCalled();
    });

    it('should exit with code 1 by default', () => {
      const error = new Error('Test error');

      expect(() => {
        CLIErrorHandlerModule.handleError(error, { exitOnError: true });
      }).toThrow('process.exit called');

      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should allow custom exit code', () => {
      const error = new Error('Test error');

      expect(() => {
        CLIErrorHandlerModule.handleError(error, { exitOnError: true, exitCode: 2 });
      }).toThrow('process.exit called');

      expect(processExitSpy).toHaveBeenCalledWith(2);
    });
  });

  describe('CLIErrorHandler class', () => {
    let handler: CLIErrorHandlerModule.CLIErrorHandler;
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      handler = new CLIErrorHandlerModule.CLIErrorHandler({ verbose: false });
      consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleErrorSpy.mockRestore();
    });

    it('should create handler with options', () => {
      expect(handler).toBeDefined();
    });

    it('should format errors', () => {
      const error = new Error('Test error');
      const formatted = handler.format(error);

      expect(formatted).toBeDefined();
      expect(typeof formatted).toBe('string');
    });

    it('should include stack trace in verbose mode', () => {
      const verboseHandler = new CLIErrorHandlerModule.CLIErrorHandler({ verbose: true });
      const error = new Error('Test error');
      const formatted = verboseHandler.format(error);

      expect(formatted).toContain('Stack');
    });

    it('should not include stack trace in non-verbose mode', () => {
      const error = new Error('Test error');
      const formatted = handler.format(error);

      // Stack trace should not appear in non-verbose mode
      expect(formatted).not.toContain('at Object');
    });

    it('should log errors', () => {
      const error = new Error('Test error');

      handler.log(error);

      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  describe('Error categorization display', () => {
    it('should display validation errors correctly', () => {
      const error = new Error('Invalid parameter: path is required');
      const formatted = CLIErrorHandlerModule.formatError(error);

      expect(formatted).toContain('validation');
    });

    it('should display resource errors correctly', () => {
      const error = new Error('EACCES: permission denied');
      const formatted = CLIErrorHandlerModule.formatError(error);

      expect(formatted).toContain('resource');
      expect(formatted).toContain('PERMISSION_DENIED');
    });

    it('should display learning errors correctly', () => {
      const error = new Error('Intelligence data is stale');
      const formatted = CLIErrorHandlerModule.formatError(error);

      expect(formatted).toContain('learning');
      expect(formatted).toContain('LEARNING_STALE');
    });

    it('should display database errors correctly', () => {
      const error = new Error('SQLITE_CONSTRAINT: FOREIGN KEY constraint failed');
      const formatted = CLIErrorHandlerModule.formatError(error);

      expect(formatted).toContain('execution');
      expect(formatted).toContain('DATABASE_ERROR');
    });
  });

  describe('Context in error messages', () => {
    it('should include operation context', () => {
      const error = new Error('Operation failed');
      const formatted = CLIErrorHandlerModule.formatError(error, {
        operation: 'analyze_codebase',
      });

      expect(formatted).toContain('analyze_codebase');
    });

    it('should include path context', () => {
      const error = new Error('File error');
      const formatted = CLIErrorHandlerModule.formatError(error, {
        path: '/some/path/file.ts',
      });

      expect(formatted).toContain('/some/path/file.ts');
    });
  });

  describe('Recovery action display', () => {
    it('should display manual recovery actions', () => {
      const error = new Error('ENOENT: no such file');
      const formatted = CLIErrorHandlerModule.formatError(error);

      expect(formatted).toContain('Suggestions');
    });

    it('should display automated recovery commands', () => {
      const error = new Error('Intelligence data not available');
      const formatted = CLIErrorHandlerModule.formatError(error);

      expect(formatted).toContain('learn');
    });
  });
});
