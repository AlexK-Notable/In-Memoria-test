/**
 * Tests for Response Wrapper utility
 * TDD: Write tests FIRST, then implementation
 */

import { describe, it, expect, beforeEach } from 'vitest';

// Runtime import to verify the file exists and exports correctly
import * as ResponseWrapperModule from '../utils/response-wrapper.js';

// Types are tested through function usage
export type { SuccessResponseOptions, ErrorResponseOptions } from '../utils/response-wrapper.js';

describe('Response Wrapper', () => {
  describe('Module exports', () => {
    it('should export the ResponseWrapperModule', () => {
      expect(ResponseWrapperModule).toBeDefined();
    });

    it('should export ResponseWrapper class', () => {
      expect(ResponseWrapperModule.ResponseWrapper).toBeDefined();
      expect(typeof ResponseWrapperModule.ResponseWrapper).toBe('function');
    });

    it('should export createSuccessResponse function', () => {
      expect(ResponseWrapperModule.createSuccessResponse).toBeDefined();
      expect(typeof ResponseWrapperModule.createSuccessResponse).toBe('function');
    });

    it('should export createErrorResponse function', () => {
      expect(ResponseWrapperModule.createErrorResponse).toBeDefined();
      expect(typeof ResponseWrapperModule.createErrorResponse).toBe('function');
    });
  });

  describe('createSuccessResponse', () => {
    it('should create a basic success response', () => {
      const data = { result: 'test' };
      const response = ResponseWrapperModule.createSuccessResponse({
        toolName: 'test_tool',
        data,
        message: 'Operation successful',
      });

      expect(response.success).toBe(true);
      expect(response.data).toEqual(data);
      expect(response.message).toBe('Operation successful');
      expect(response.error).toBeUndefined();
    });

    it('should include metadata', () => {
      const response = ResponseWrapperModule.createSuccessResponse({
        toolName: 'analyze_codebase',
        data: {},
        message: 'Done',
      });

      expect(response.meta.toolName).toBe('analyze_codebase');
      expect(response.meta.timestamp).toBeDefined();
      expect(response.meta.version).toBeDefined();
      expect(typeof response.meta.durationMs).toBe('number');
    });

    it('should accept optional requestId', () => {
      const response = ResponseWrapperModule.createSuccessResponse({
        toolName: 'test_tool',
        data: {},
        message: 'Done',
        requestId: 'req-123',
      });

      expect(response.meta.requestId).toBe('req-123');
    });

    it('should include pagination when provided', () => {
      const response = ResponseWrapperModule.createSuccessResponse({
        toolName: 'search_tool',
        data: ['item1', 'item2'],
        message: 'Found 2 items',
        pagination: {
          offset: 0,
          limit: 10,
          total: 100,
          hasMore: true,
        },
      });

      expect(response.pagination).toBeDefined();
      expect(response.pagination?.offset).toBe(0);
      expect(response.pagination?.limit).toBe(10);
      expect(response.pagination?.total).toBe(100);
      expect(response.pagination?.hasMore).toBe(true);
    });

    it('should calculate duration from startTime', () => {
      const startTime = Date.now() - 100; // 100ms ago
      const response = ResponseWrapperModule.createSuccessResponse({
        toolName: 'test_tool',
        data: {},
        message: 'Done',
        startTime,
      });

      expect(response.meta.durationMs).toBeGreaterThanOrEqual(100);
      expect(response.meta.durationMs).toBeLessThan(200);
    });
  });

  describe('createErrorResponse', () => {
    it('should create an error response from Error', () => {
      const error = new Error('Something went wrong');
      const response = ResponseWrapperModule.createErrorResponse({
        toolName: 'test_tool',
        error,
      });

      expect(response.success).toBe(false);
      expect(response.data).toBeNull();
      expect(response.error).toBeDefined();
      expect(response.error?.details).toContain('Something went wrong');
    });

    it('should use error classifier for categorization', () => {
      const error = new Error('ENOENT: no such file or directory');
      const response = ResponseWrapperModule.createErrorResponse({
        toolName: 'read_file',
        error,
      });

      expect(response.error?.category).toBe('resource');
      expect(response.error?.code).toBe('FILE_NOT_FOUND');
    });

    it('should include recovery actions from classifier', () => {
      const error = new Error('Intelligence data not available');
      const response = ResponseWrapperModule.createErrorResponse({
        toolName: 'get_blueprint',
        error,
      });

      expect(response.error?.recoveryActions).toBeDefined();
      expect(response.error?.recoveryActions?.length).toBeGreaterThan(0);
    });

    it('should include error context', () => {
      const error = new Error('Validation failed');
      const response = ResponseWrapperModule.createErrorResponse({
        toolName: 'analyze_codebase',
        error,
        context: {
          path: '/some/path',
          operation: 'analyze',
        },
      });

      expect(response.error?.context?.path).toBe('/some/path');
      expect(response.error?.context?.operation).toBe('analyze');
    });

    it('should handle string errors', () => {
      const response = ResponseWrapperModule.createErrorResponse({
        toolName: 'test_tool',
        error: 'String error message',
      });

      expect(response.success).toBe(false);
      expect(response.error?.details).toContain('String error message');
    });

    it('should generate appropriate message from error', () => {
      const error = new Error('EACCES: permission denied');
      const response = ResponseWrapperModule.createErrorResponse({
        toolName: 'write_file',
        error,
      });

      expect(response.message).toContain('error');
    });

    it('should allow custom message override', () => {
      const error = new Error('Internal problem');
      const response = ResponseWrapperModule.createErrorResponse({
        toolName: 'test_tool',
        error,
        message: 'Custom error message',
      });

      expect(response.message).toBe('Custom error message');
    });
  });

  describe('ResponseWrapper class', () => {
    let wrapper: ResponseWrapperModule.ResponseWrapper;

    beforeEach(() => {
      wrapper = new ResponseWrapperModule.ResponseWrapper({
        toolName: 'test_tool',
        version: '1.0.0',
      });
    });

    it('should create wrapper with toolName', () => {
      expect(wrapper).toBeDefined();
    });

    it('should create success response', () => {
      const response = wrapper.success({
        data: { value: 42 },
        message: 'Got value',
      });

      expect(response.success).toBe(true);
      expect(response.data.value).toBe(42);
      expect(response.meta.toolName).toBe('test_tool');
    });

    it('should create error response', () => {
      const response = wrapper.error({
        error: new Error('Test error'),
      });

      expect(response.success).toBe(false);
      expect(response.data).toBeNull();
    });

    it('should track timing automatically', () => {
      wrapper.startTimer();

      // Simulate some work
      const start = Date.now();
      while (Date.now() - start < 50) {
        // busy wait
      }

      const response = wrapper.success({
        data: {},
        message: 'Done',
      });

      expect(response.meta.durationMs).toBeGreaterThanOrEqual(50);
    });

    it('should allow requestId to be set', () => {
      wrapper.setRequestId('req-456');

      const response = wrapper.success({
        data: {},
        message: 'Done',
      });

      expect(response.meta.requestId).toBe('req-456');
    });

    it('should use custom version', () => {
      const customWrapper = new ResponseWrapperModule.ResponseWrapper({
        toolName: 'custom_tool',
        version: '2.0.0',
      });

      const response = customWrapper.success({
        data: {},
        message: 'Done',
      });

      expect(response.meta.version).toBe('2.0.0');
    });
  });

  describe('Response validation', () => {
    it('should create responses that pass isStandardResponse check', async () => {
      // Import the type guard
      const { isStandardResponse } = await import('../types/response-envelope.js');

      const successResponse = ResponseWrapperModule.createSuccessResponse({
        toolName: 'test',
        data: { value: 1 },
        message: 'OK',
      });

      const errorResponse = ResponseWrapperModule.createErrorResponse({
        toolName: 'test',
        error: new Error('Fail'),
      });

      expect(isStandardResponse(successResponse)).toBe(true);
      expect(isStandardResponse(errorResponse)).toBe(true);
    });
  });

  describe('Edge cases', () => {
    it('should handle null data in success response', () => {
      const response = ResponseWrapperModule.createSuccessResponse({
        toolName: 'void_operation',
        data: null,
        message: 'Operation completed with no return value',
      });

      expect(response.success).toBe(true);
      expect(response.data).toBeNull();
    });

    it('should handle undefined data as undefined', () => {
      const response = ResponseWrapperModule.createSuccessResponse({
        toolName: 'test',
        data: undefined,
        message: 'Done',
      });

      expect(response.success).toBe(true);
      expect(response.data).toBeUndefined();
    });

    it('should handle empty string message', () => {
      const response = ResponseWrapperModule.createSuccessResponse({
        toolName: 'test',
        data: {},
        message: '',
      });

      expect(response.message).toBe('');
    });

    it('should handle very long messages', () => {
      const longMessage = 'a'.repeat(10000);
      const response = ResponseWrapperModule.createSuccessResponse({
        toolName: 'test',
        data: {},
        message: longMessage,
      });

      expect(response.message.length).toBe(10000);
    });
  });
});
