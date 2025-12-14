/**
 * Response Wrapper Utility
 *
 * Creates standardized response envelopes for all MCP tools.
 * Integrates with ErrorClassifier for error categorization.
 *
 * @example
 * ```typescript
 * // Success response
 * const response = createSuccessResponse({
 *   toolName: 'get_project_blueprint',
 *   data: blueprint,
 *   message: 'Blueprint generated successfully',
 * });
 *
 * // Error response
 * const response = createErrorResponse({
 *   toolName: 'analyze_codebase',
 *   error: new Error('ENOENT: file not found'),
 * });
 * ```
 */

import type {
  StandardResponse,
  ResponseMeta,
  Pagination,
  ResponseError,
} from '../types/response-envelope.js';
import { classifyError } from './error-classifier.js';

// ============================================================================
// Version
// ============================================================================

/**
 * Default version (can be overridden by wrapper instances)
 */
const DEFAULT_VERSION = '0.6.0';

// ============================================================================
// Options Types
// ============================================================================

/**
 * Options for creating a success response
 */
export interface SuccessResponseOptions<T = unknown> {
  /** Name of the tool generating the response */
  toolName: string;

  /** The data payload */
  data: T;

  /** Human-readable success message */
  message: string;

  /** Optional request ID for tracing */
  requestId?: string;

  /** Start time for duration calculation */
  startTime?: number;

  /** Pagination info (for list responses) */
  pagination?: Pagination;

  /** Version string (defaults to package version) */
  version?: string;
}

/**
 * Options for creating an error response
 */
export interface ErrorResponseOptions {
  /** Name of the tool generating the response */
  toolName: string;

  /** The error that occurred */
  error: unknown;

  /** Optional custom message (overrides generated message) */
  message?: string;

  /** Optional request ID for tracing */
  requestId?: string;

  /** Start time for duration calculation */
  startTime?: number;

  /** Additional context about the error */
  context?: Record<string, unknown>;

  /** Version string (defaults to package version) */
  version?: string;
}

/**
 * Options for creating a ResponseWrapper instance
 */
export interface ResponseWrapperOptions {
  /** Name of the tool */
  toolName: string;

  /** Version string */
  version?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create response metadata
 */
function createMeta(options: {
  toolName: string;
  requestId?: string;
  startTime?: number;
  version?: string;
}): ResponseMeta {
  const now = Date.now();
  const durationMs = options.startTime ? now - options.startTime : 0;

  return {
    toolName: options.toolName,
    requestId: options.requestId,
    timestamp: new Date(now).toISOString(),
    durationMs,
    version: options.version ?? DEFAULT_VERSION,
  };
}

// ============================================================================
// Response Functions
// ============================================================================

/**
 * Create a success response with the standard envelope format.
 *
 * @param options - Success response options
 * @returns A StandardResponse with success=true
 *
 * @example
 * ```typescript
 * const response = createSuccessResponse({
 *   toolName: 'search_codebase',
 *   data: { results: [...] },
 *   message: 'Found 42 matches',
 *   pagination: { offset: 0, limit: 10, total: 42, hasMore: true },
 * });
 * ```
 */
export function createSuccessResponse<T = unknown>(
  options: SuccessResponseOptions<T>
): StandardResponse<T> {
  const meta = createMeta({
    toolName: options.toolName,
    requestId: options.requestId,
    startTime: options.startTime,
    version: options.version,
  });

  const response: StandardResponse<T> = {
    success: true,
    data: options.data,
    meta,
    message: options.message,
  };

  if (options.pagination) {
    response.pagination = options.pagination;
  }

  return response;
}

/**
 * Create an error response with the standard envelope format.
 *
 * Uses the ErrorClassifier to categorize the error and generate
 * recovery actions.
 *
 * @param options - Error response options
 * @returns A StandardResponse with success=false and error details
 *
 * @example
 * ```typescript
 * const response = createErrorResponse({
 *   toolName: 'read_file',
 *   error: new Error('ENOENT: no such file'),
 *   context: { path: '/missing/file.txt' },
 * });
 * // response.error.category === 'resource'
 * // response.error.code === 'FILE_NOT_FOUND'
 * ```
 */
export function createErrorResponse(
  options: ErrorResponseOptions
): StandardResponse<null> {
  const meta = createMeta({
    toolName: options.toolName,
    requestId: options.requestId,
    startTime: options.startTime,
    version: options.version,
  });

  // Use error classifier for categorization
  const classified = classifyError(options.error, options.context);

  const responseError: ResponseError = {
    code: classified.code,
    category: classified.category,
    details: classified.details,
    recoveryActions: classified.recoveryActions,
    context: options.context,
  };

  // Generate message if not provided
  const message =
    options.message ??
    `Operation failed with ${classified.category} error: ${classified.code}`;

  return {
    success: false,
    data: null,
    meta,
    message,
    error: responseError,
  };
}

// ============================================================================
// ResponseWrapper Class
// ============================================================================

/**
 * A wrapper class for creating standardized responses.
 *
 * Provides a stateful way to create responses with automatic
 * timing and consistent configuration.
 *
 * @example
 * ```typescript
 * const wrapper = new ResponseWrapper({
 *   toolName: 'analyze_codebase',
 *   version: '1.0.0',
 * });
 *
 * wrapper.startTimer();
 *
 * // ... do work ...
 *
 * const response = wrapper.success({
 *   data: results,
 *   message: 'Analysis complete',
 * });
 * ```
 */
export class ResponseWrapper {
  private toolName: string;
  private version: string;
  private requestId?: string;
  private startTime?: number;

  /**
   * Create a new ResponseWrapper instance.
   *
   * @param options - Wrapper configuration
   */
  constructor(options: ResponseWrapperOptions) {
    this.toolName = options.toolName;
    this.version = options.version ?? DEFAULT_VERSION;
  }

  /**
   * Start the timer for duration tracking.
   *
   * Call this at the beginning of an operation to
   * automatically calculate duration in responses.
   */
  startTimer(): void {
    this.startTime = Date.now();
  }

  /**
   * Set the request ID for tracing.
   *
   * @param requestId - The request identifier
   */
  setRequestId(requestId: string): void {
    this.requestId = requestId;
  }

  /**
   * Create a success response.
   *
   * @param options - Success options (toolName and version inherited from wrapper)
   * @returns A StandardResponse with success=true
   */
  success<T = unknown>(options: {
    data: T;
    message: string;
    pagination?: Pagination;
  }): StandardResponse<T> {
    return createSuccessResponse({
      toolName: this.toolName,
      version: this.version,
      requestId: this.requestId,
      startTime: this.startTime,
      data: options.data,
      message: options.message,
      pagination: options.pagination,
    });
  }

  /**
   * Create an error response.
   *
   * @param options - Error options (toolName and version inherited from wrapper)
   * @returns A StandardResponse with success=false
   */
  error(options: {
    error: unknown;
    message?: string;
    context?: Record<string, unknown>;
  }): StandardResponse<null> {
    return createErrorResponse({
      toolName: this.toolName,
      version: this.version,
      requestId: this.requestId,
      startTime: this.startTime,
      error: options.error,
      message: options.message,
      context: options.context,
    });
  }
}
