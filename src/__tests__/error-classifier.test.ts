/**
 * Tests for Error Classifier utility
 * TDD: Write tests FIRST, then implementation
 */

import { describe, it, expect, beforeEach } from 'vitest';

// Runtime import to verify the file exists and exports correctly
import * as ErrorClassifierModule from '../utils/error-classifier.js';

// Types are tested through function usage
export type { ClassifiedError, ClassificationRule } from '../utils/error-classifier.js';

describe('Error Classifier', () => {
  describe('Module exports', () => {
    it('should export the ErrorClassifierModule', () => {
      expect(ErrorClassifierModule).toBeDefined();
    });

    it('should export ErrorClassifier class', () => {
      expect(ErrorClassifierModule.ErrorClassifier).toBeDefined();
      expect(typeof ErrorClassifierModule.ErrorClassifier).toBe('function');
    });

    it('should export classifyError function', () => {
      expect(ErrorClassifierModule.classifyError).toBeDefined();
      expect(typeof ErrorClassifierModule.classifyError).toBe('function');
    });
  });

  describe('classifyError function', () => {
    it('should classify validation errors', () => {
      const error = new Error('Invalid parameter: path is required');
      const result = ErrorClassifierModule.classifyError(error);

      expect(result.category).toBe('validation');
      expect(result.code).toBeDefined();
      expect(result.details).toContain('Invalid parameter');
    });

    it('should classify file not found errors', () => {
      const error = new Error('ENOENT: no such file or directory');
      const result = ErrorClassifierModule.classifyError(error);

      expect(result.category).toBe('resource');
      expect(result.code).toBe('FILE_NOT_FOUND');
    });

    it('should classify permission errors', () => {
      const error = new Error('EACCES: permission denied');
      const result = ErrorClassifierModule.classifyError(error);

      expect(result.category).toBe('resource');
      expect(result.code).toBe('PERMISSION_DENIED');
    });

    it('should classify learning required errors', () => {
      const error = new Error('Intelligence data not available. Run learn first.');
      const result = ErrorClassifierModule.classifyError(error);

      expect(result.category).toBe('learning');
      expect(result.code).toBe('LEARNING_REQUIRED');
    });

    it('should classify stale learning errors', () => {
      const error = new Error('Intelligence data is stale. Re-run learning.');
      const result = ErrorClassifierModule.classifyError(error);

      expect(result.category).toBe('learning');
      expect(result.code).toBe('LEARNING_STALE');
    });

    it('should classify configuration errors', () => {
      const error = new Error('Configuration error: missing required setting');
      const result = ErrorClassifierModule.classifyError(error);

      expect(result.category).toBe('configuration');
    });

    it('should classify database errors', () => {
      const error = new Error('SQLITE_CONSTRAINT: FOREIGN KEY constraint failed');
      const result = ErrorClassifierModule.classifyError(error);

      expect(result.category).toBe('execution');
      expect(result.code).toBe('DATABASE_ERROR');
    });

    it('should classify unknown errors as system errors', () => {
      const error = new Error('Something went terribly wrong');
      const result = ErrorClassifierModule.classifyError(error);

      expect(result.category).toBe('system');
      expect(result.code).toBe('INTERNAL_ERROR');
    });

    it('should handle string errors', () => {
      const result = ErrorClassifierModule.classifyError('File not found');

      expect(result.category).toBe('resource');
    });

    it('should handle non-Error objects', () => {
      const result = ErrorClassifierModule.classifyError({ message: 'custom error' });

      expect(result.category).toBe('system');
      expect(result.code).toBe('INTERNAL_ERROR');
    });
  });

  describe('Recovery actions', () => {
    it('should provide recovery actions for learning errors', () => {
      const error = new Error('Intelligence data not available');
      const result = ErrorClassifierModule.classifyError(error);

      expect(result.recoveryActions).toBeDefined();
      expect(result.recoveryActions!.length).toBeGreaterThan(0);
      expect(result.recoveryActions![0].description).toBeDefined();
    });

    it('should provide automated recovery for learning errors', () => {
      const error = new Error('Intelligence data not available');
      const result = ErrorClassifierModule.classifyError(error);

      const automatedAction = result.recoveryActions?.find(a => a.automated);
      expect(automatedAction).toBeDefined();
      expect(automatedAction?.command).toContain('learn');
    });

    it('should provide recovery actions for file not found', () => {
      const error = new Error('ENOENT: no such file or directory');
      const result = ErrorClassifierModule.classifyError(error);

      expect(result.recoveryActions).toBeDefined();
      expect(result.recoveryActions!.length).toBeGreaterThan(0);
    });

    it('should provide recovery actions for validation errors', () => {
      const error = new Error('Invalid path parameter');
      const result = ErrorClassifierModule.classifyError(error);

      expect(result.recoveryActions).toBeDefined();
    });
  });

  describe('ErrorClassifier class', () => {
    let classifier: ErrorClassifierModule.ErrorClassifier;

    beforeEach(() => {
      classifier = new ErrorClassifierModule.ErrorClassifier();
    });

    it('should classify errors using instance method', () => {
      const error = new Error('ENOENT: file not found');
      const result = classifier.classify(error);

      expect(result.category).toBe('resource');
    });

    it('should allow adding custom rules', () => {
      classifier.addRule({
        pattern: /custom error pattern/i,
        category: 'validation',
        code: 'CUSTOM_ERROR',
        getMessage: () => 'A custom error occurred',
        getRecoveryActions: () => [{
          description: 'Custom recovery action',
          automated: false,
        }],
      });

      const error = new Error('This is a custom error pattern test');
      const result = classifier.classify(error);

      expect(result.category).toBe('validation');
      expect(result.code).toBe('CUSTOM_ERROR');
      expect(result.recoveryActions![0].description).toBe('Custom recovery action');
    });

    it('should prioritize custom rules over default rules', () => {
      classifier.addRule({
        pattern: /ENOENT/i,
        category: 'configuration',
        code: 'CUSTOM_ENOENT',
        getMessage: (e) => `Custom handler: ${e.message}`,
        getRecoveryActions: () => [],
      });

      const error = new Error('ENOENT: no such file');
      const result = classifier.classify(error);

      // Custom rule should match first
      expect(result.category).toBe('configuration');
      expect(result.code).toBe('CUSTOM_ENOENT');
    });
  });

  describe('Context handling', () => {
    it('should include context in classified error', () => {
      const error = new Error('Invalid input');
      const result = ErrorClassifierModule.classifyError(error, {
        operation: 'analyze_codebase',
        path: '/some/path',
      });

      expect(result.context).toBeDefined();
      expect(result.context?.operation).toBe('analyze_codebase');
      expect(result.context?.path).toBe('/some/path');
    });
  });

  describe('Error code consistency', () => {
    it('should use consistent error codes', () => {
      // Test that similar errors produce the same code
      const error1 = new Error('ENOENT: no such file');
      const error2 = new Error('File ENOENT error occurred');

      const result1 = ErrorClassifierModule.classifyError(error1);
      const result2 = ErrorClassifierModule.classifyError(error2);

      expect(result1.code).toBe(result2.code);
    });

    it('should produce uppercase error codes', () => {
      const error = new Error('Some validation error');
      const result = ErrorClassifierModule.classifyError(error);

      expect(result.code).toBe(result.code.toUpperCase());
    });
  });
});
