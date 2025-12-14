/**
 * Tests for response envelope types
 * TDD: Write tests FIRST, then implementation
 */

import { describe, it, expect } from 'vitest';

// Runtime import to verify the file exists and exports correctly
import * as ResponseEnvelope from '../types/response-envelope.js';

// Import types - ErrorCategory is tested via ERROR_CATEGORIES constant
import type {
  StandardResponse,
  RecoveryAction,
  ResponseMeta,
  Pagination,
  ResponseError,
} from '../types/response-envelope.js';

describe('Response Envelope Types', () => {
  describe('Module exports', () => {
    it('should export the ResponseEnvelope module', () => {
      expect(ResponseEnvelope).toBeDefined();
    });

    it('should export ERROR_CATEGORIES constant', () => {
      expect(ResponseEnvelope.ERROR_CATEGORIES).toBeDefined();
      expect(Array.isArray(ResponseEnvelope.ERROR_CATEGORIES)).toBe(true);
    });
  });

  describe('ErrorCategory type', () => {
    it('should include all standard error categories', () => {
      const categories = ResponseEnvelope.ERROR_CATEGORIES;

      expect(categories).toContain('validation');
      expect(categories).toContain('resource');
      expect(categories).toContain('learning');
      expect(categories).toContain('execution');
      expect(categories).toContain('configuration');
      expect(categories).toContain('system');
    });
  });

  describe('RecoveryAction interface', () => {
    it('should accept a minimal recovery action', () => {
      const action: RecoveryAction = {
        description: 'Restart the service',
      };

      expect(action.description).toBe('Restart the service');
      expect(action.command).toBeUndefined();
      expect(action.automated).toBeUndefined();
    });

    it('should accept a full recovery action', () => {
      const action: RecoveryAction = {
        description: 'Run learning to update intelligence',
        command: 'in-memoria learn',
        automated: true,
      };

      expect(action.description).toBe('Run learning to update intelligence');
      expect(action.command).toBe('in-memoria learn');
      expect(action.automated).toBe(true);
    });
  });

  describe('ResponseMeta interface', () => {
    it('should accept required metadata fields', () => {
      const meta: ResponseMeta = {
        toolName: 'get_project_blueprint',
        timestamp: '2025-01-01T00:00:00.000Z',
        durationMs: 150,
        version: '0.6.0',
      };

      expect(meta.toolName).toBe('get_project_blueprint');
      expect(meta.timestamp).toBe('2025-01-01T00:00:00.000Z');
      expect(meta.durationMs).toBe(150);
      expect(meta.version).toBe('0.6.0');
    });

    it('should accept optional requestId', () => {
      const meta: ResponseMeta = {
        toolName: 'analyze_codebase',
        requestId: 'req-12345',
        timestamp: '2025-01-01T00:00:00.000Z',
        durationMs: 200,
        version: '0.6.0',
      };

      expect(meta.requestId).toBe('req-12345');
    });
  });

  describe('Pagination interface', () => {
    it('should accept all pagination fields', () => {
      const pagination: Pagination = {
        offset: 0,
        limit: 20,
        total: 150,
        hasMore: true,
      };

      expect(pagination.offset).toBe(0);
      expect(pagination.limit).toBe(20);
      expect(pagination.total).toBe(150);
      expect(pagination.hasMore).toBe(true);
    });

    it('should indicate no more results correctly', () => {
      const pagination: Pagination = {
        offset: 80,
        limit: 20,
        total: 100,
        hasMore: false,
      };

      expect(pagination.hasMore).toBe(false);
    });
  });

  describe('ResponseError interface', () => {
    it('should accept minimal error fields', () => {
      const error: ResponseError = {
        code: 'FILE_NOT_FOUND',
        category: 'resource',
        details: 'The specified file does not exist',
      };

      expect(error.code).toBe('FILE_NOT_FOUND');
      expect(error.category).toBe('resource');
      expect(error.details).toBe('The specified file does not exist');
    });

    it('should accept full error with recovery actions', () => {
      const error: ResponseError = {
        code: 'LEARNING_REQUIRED',
        category: 'learning',
        details: 'Intelligence data not available for this project',
        recoveryActions: [
          {
            description: 'Run learning to build intelligence',
            command: 'in-memoria learn',
            automated: true,
          },
        ],
        context: {
          projectPath: '/home/user/project',
          lastLearned: null,
        },
      };

      expect(error.code).toBe('LEARNING_REQUIRED');
      expect(error.recoveryActions).toHaveLength(1);
      expect(error.recoveryActions![0].command).toBe('in-memoria learn');
      expect(error.context?.projectPath).toBe('/home/user/project');
    });
  });

  describe('StandardResponse interface', () => {
    it('should accept a successful response with data', () => {
      interface TestData {
        items: string[];
        count: number;
      }

      const response: StandardResponse<TestData> = {
        success: true,
        data: {
          items: ['a', 'b', 'c'],
          count: 3,
        },
        meta: {
          toolName: 'get_items',
          timestamp: '2025-01-01T00:00:00.000Z',
          durationMs: 50,
          version: '0.6.0',
        },
        message: 'Successfully retrieved 3 items',
      };

      expect(response.success).toBe(true);
      expect(response.data.items).toHaveLength(3);
      expect(response.data.count).toBe(3);
      expect(response.message).toBe('Successfully retrieved 3 items');
      expect(response.error).toBeUndefined();
    });

    it('should accept a successful response with pagination', () => {
      interface ListData {
        results: Array<{ id: string; name: string }>;
      }

      const response: StandardResponse<ListData> = {
        success: true,
        data: {
          results: [
            { id: '1', name: 'Item 1' },
            { id: '2', name: 'Item 2' },
          ],
        },
        meta: {
          toolName: 'list_items',
          timestamp: '2025-01-01T00:00:00.000Z',
          durationMs: 100,
          version: '0.6.0',
        },
        message: 'Found 2 of 50 items',
        pagination: {
          offset: 0,
          limit: 10,
          total: 50,
          hasMore: true,
        },
      };

      expect(response.success).toBe(true);
      expect(response.pagination).toBeDefined();
      expect(response.pagination!.hasMore).toBe(true);
    });

    it('should accept an error response', () => {
      const response: StandardResponse<null> = {
        success: false,
        data: null,
        meta: {
          toolName: 'get_blueprint',
          timestamp: '2025-01-01T00:00:00.000Z',
          durationMs: 10,
          version: '0.6.0',
        },
        message: 'Operation failed: Project not found',
        error: {
          code: 'PROJECT_NOT_FOUND',
          category: 'resource',
          details: 'No project found at the specified path',
          recoveryActions: [
            {
              description: 'Check the path and try again',
            },
          ],
        },
      };

      expect(response.success).toBe(false);
      expect(response.data).toBeNull();
      expect(response.error).toBeDefined();
      expect(response.error!.code).toBe('PROJECT_NOT_FOUND');
    });

    it('should support generic null data type', () => {
      const response: StandardResponse<null> = {
        success: true,
        data: null,
        meta: {
          toolName: 'delete_item',
          timestamp: '2025-01-01T00:00:00.000Z',
          durationMs: 30,
          version: '0.6.0',
        },
        message: 'Item deleted successfully',
      };

      expect(response.success).toBe(true);
      expect(response.data).toBeNull();
    });

    it('should preserve type safety for data', () => {
      interface SpecificData {
        name: string;
        value: number;
      }

      const response: StandardResponse<SpecificData> = {
        success: true,
        data: {
          name: 'test',
          value: 42,
        },
        meta: {
          toolName: 'get_specific',
          timestamp: '2025-01-01T00:00:00.000Z',
          durationMs: 20,
          version: '0.6.0',
        },
        message: 'Data retrieved',
      };

      // TypeScript will enforce that data.name is string and data.value is number
      expect(typeof response.data.name).toBe('string');
      expect(typeof response.data.value).toBe('number');
    });
  });

  describe('Helper functions', () => {
    it('isErrorCategory should validate error categories', () => {
      expect(ResponseEnvelope.isErrorCategory('validation')).toBe(true);
      expect(ResponseEnvelope.isErrorCategory('resource')).toBe(true);
      expect(ResponseEnvelope.isErrorCategory('learning')).toBe(true);
      expect(ResponseEnvelope.isErrorCategory('execution')).toBe(true);
      expect(ResponseEnvelope.isErrorCategory('configuration')).toBe(true);
      expect(ResponseEnvelope.isErrorCategory('system')).toBe(true);

      // Invalid categories
      expect(ResponseEnvelope.isErrorCategory('invalid')).toBe(false);
      expect(ResponseEnvelope.isErrorCategory('')).toBe(false);
      expect(ResponseEnvelope.isErrorCategory(null)).toBe(false);
      expect(ResponseEnvelope.isErrorCategory(undefined)).toBe(false);
      expect(ResponseEnvelope.isErrorCategory(123)).toBe(false);
    });

    it('isStandardResponse should validate response structure', () => {
      const validResponse: StandardResponse<string> = {
        success: true,
        data: 'test',
        meta: {
          toolName: 'test_tool',
          timestamp: '2025-01-01T00:00:00.000Z',
          durationMs: 10,
          version: '0.6.0',
        },
        message: 'Test message',
      };

      expect(ResponseEnvelope.isStandardResponse(validResponse)).toBe(true);
      expect(ResponseEnvelope.isStandardResponse({})).toBe(false);
      expect(ResponseEnvelope.isStandardResponse(null)).toBe(false);
      expect(ResponseEnvelope.isStandardResponse({ success: true })).toBe(false);
    });
  });
});
