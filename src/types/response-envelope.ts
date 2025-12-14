/**
 * Response Envelope Types
 *
 * Defines standardized response structures for all MCP tools.
 * Enables consistent API responses, error handling, and pagination.
 *
 * Coordinates with:
 * - DX agent's ErrorClassifier for error categorization
 * - API Design agent's response wrapper utility
 */

// ============================================================================
// Error Categories
// ============================================================================

/**
 * Standard error categories for consistent error classification.
 * Coordinates with DX agent's ErrorClassifier.
 */
export const ERROR_CATEGORIES = [
  'validation',     // Invalid input parameters
  'resource',       // File/path not found
  'learning',       // Intelligence data missing or stale
  'execution',      // Tool execution failure
  'configuration',  // Setup/config issues
  'system',         // Internal errors
] as const;

export type ErrorCategory = (typeof ERROR_CATEGORIES)[number];

/**
 * Type guard to check if a value is a valid ErrorCategory
 */
export function isErrorCategory(value: unknown): value is ErrorCategory {
  return (
    typeof value === 'string' &&
    ERROR_CATEGORIES.includes(value as ErrorCategory)
  );
}

// ============================================================================
// Recovery Actions
// ============================================================================

/**
 * Suggested action to recover from an error.
 * Can be displayed to users or automated by AI agents.
 */
export interface RecoveryAction {
  /** Human-readable description of the recovery action */
  description: string;

  /** Command to execute (if applicable) */
  command?: string;

  /** Whether this action can be automated by an AI agent */
  automated?: boolean;
}

// ============================================================================
// Response Metadata
// ============================================================================

/**
 * Metadata about the response and the operation that produced it.
 */
export interface ResponseMeta {
  /** Name of the tool that generated this response */
  toolName: string;

  /** Optional request identifier for tracing */
  requestId?: string;

  /** ISO timestamp when the response was generated */
  timestamp: string;

  /** Duration of the operation in milliseconds */
  durationMs: number;

  /** Version of In-Memoria that generated the response */
  version: string;
}

// ============================================================================
// Pagination
// ============================================================================

/**
 * Pagination information for list responses.
 */
export interface Pagination {
  /** Starting offset (0-indexed) */
  offset: number;

  /** Maximum items per page */
  limit: number;

  /** Total number of items available */
  total: number;

  /** Whether more items are available beyond this page */
  hasMore: boolean;
}

// ============================================================================
// Response Error
// ============================================================================

/**
 * Structured error information for failed responses.
 */
export interface ResponseError {
  /** Error code for programmatic handling (e.g., "FILE_NOT_FOUND") */
  code: string;

  /** Category for error classification */
  category: ErrorCategory;

  /** Human-readable error details */
  details: string;

  /** Suggested recovery actions */
  recoveryActions?: RecoveryAction[];

  /** Additional context about the error */
  context?: Record<string, unknown>;
}

// ============================================================================
// Standard Response Envelope
// ============================================================================

/**
 * Standard response envelope for all MCP tools.
 *
 * Provides consistent structure for:
 * - Success/failure indication
 * - Typed data payloads
 * - Metadata for observability
 * - Error details with recovery guidance
 * - Pagination for list responses
 *
 * @template T - The type of the data payload
 *
 * @example
 * // Success response
 * const response: StandardResponse<ProjectBlueprint> = {
 *   success: true,
 *   data: { techStack: ['TypeScript'], ... },
 *   meta: { toolName: 'get_project_blueprint', ... },
 *   message: 'Blueprint generated successfully',
 * };
 *
 * @example
 * // Error response
 * const response: StandardResponse<null> = {
 *   success: false,
 *   data: null,
 *   meta: { toolName: 'get_project_blueprint', ... },
 *   message: 'Operation failed: Project not found',
 *   error: { code: 'PROJECT_NOT_FOUND', category: 'resource', ... },
 * };
 */
export interface StandardResponse<T = unknown> {
  /** Whether the operation succeeded */
  success: boolean;

  /** The data payload (typed by generic parameter T) */
  data: T;

  /** Metadata about the operation */
  meta: ResponseMeta;

  /** Human-readable summary of the result */
  message: string;

  /** Error details (only present when success=false) */
  error?: ResponseError;

  /** Pagination info (only present for list responses) */
  pagination?: Pagination;
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to check if a value is a valid StandardResponse structure.
 * Validates the shape without checking the data type.
 */
export function isStandardResponse(value: unknown): value is StandardResponse {
  if (value === null || typeof value !== 'object') {
    return false;
  }

  const obj = value as Record<string, unknown>;

  // Check required fields
  if (typeof obj.success !== 'boolean') {
    return false;
  }

  if (!('data' in obj)) {
    return false;
  }

  if (typeof obj.message !== 'string') {
    return false;
  }

  // Check meta object
  if (obj.meta === null || typeof obj.meta !== 'object') {
    return false;
  }

  const meta = obj.meta as Record<string, unknown>;
  if (
    typeof meta.toolName !== 'string' ||
    typeof meta.timestamp !== 'string' ||
    typeof meta.durationMs !== 'number' ||
    typeof meta.version !== 'string'
  ) {
    return false;
  }

  return true;
}
