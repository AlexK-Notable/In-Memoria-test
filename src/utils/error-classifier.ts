/**
 * Error Classifier Utility
 *
 * Classifies errors into categories and provides recovery actions.
 * Supports custom classification rules for project-specific error handling.
 *
 * @example
 * ```typescript
 * const result = classifyError(new Error('ENOENT: no such file'));
 * console.log(result.category); // 'resource'
 * console.log(result.code); // 'FILE_NOT_FOUND'
 * console.log(result.recoveryActions); // [{ description: '...', automated: false }]
 * ```
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Error category for classification
 */
export type ErrorCategory =
  | 'validation'
  | 'resource'
  | 'learning'
  | 'configuration'
  | 'execution'
  | 'system';

/**
 * Recovery action that can be taken for an error
 */
export interface RecoveryAction {
  /** Human-readable description of the recovery action */
  description: string;

  /** Whether this action can be performed automatically */
  automated: boolean;

  /** Command to execute for automated recovery (if applicable) */
  command?: string;
}

/**
 * Context information about where the error occurred
 */
export interface ErrorContext {
  /** The operation being performed when the error occurred */
  operation?: string;

  /** The path being operated on */
  path?: string;

  /** Additional context-specific information */
  [key: string]: unknown;
}

/**
 * A classified error with category, code, and recovery information
 */
export interface ClassifiedError {
  /** Error category */
  category: ErrorCategory;

  /** Specific error code (uppercase) */
  code: string;

  /** Human-readable error details */
  details: string;

  /** Original error object */
  originalError: unknown;

  /** Suggested recovery actions */
  recoveryActions?: RecoveryAction[];

  /** Context information about where the error occurred */
  context?: ErrorContext;
}

/**
 * Rule for classifying errors
 */
export interface ClassificationRule {
  /** Pattern to match against error message */
  pattern: RegExp;

  /** Category to assign when pattern matches */
  category: ErrorCategory;

  /** Error code to assign when pattern matches */
  code: string;

  /** Function to generate human-readable message */
  getMessage: (error: Error) => string;

  /** Function to generate recovery actions */
  getRecoveryActions: (error: Error) => RecoveryAction[];
}

// ============================================================================
// Default Classification Rules
// ============================================================================

/**
 * Default rules for classifying common errors
 */
const DEFAULT_RULES: ClassificationRule[] = [
  // File not found
  {
    pattern: /ENOENT|no such file|file not found/i,
    category: 'resource',
    code: 'FILE_NOT_FOUND',
    getMessage: (e) => `File not found: ${e.message}`,
    getRecoveryActions: () => [
      {
        description: 'Verify the file path exists and is accessible',
        automated: false,
      },
      {
        description: 'Check for typos in the file path',
        automated: false,
      },
    ],
  },

  // Permission denied
  {
    pattern: /EACCES|permission denied/i,
    category: 'resource',
    code: 'PERMISSION_DENIED',
    getMessage: (e) => `Permission denied: ${e.message}`,
    getRecoveryActions: () => [
      {
        description: 'Check file permissions and ownership',
        automated: false,
      },
      {
        description: 'Try running with elevated permissions if appropriate',
        automated: false,
      },
    ],
  },

  // Learning required
  {
    pattern: /intelligence data not available|run learn first|learning required/i,
    category: 'learning',
    code: 'LEARNING_REQUIRED',
    getMessage: (e) => `Learning required: ${e.message}`,
    getRecoveryActions: () => [
      {
        description: 'Run the learning process to build intelligence data',
        automated: true,
        command: 'learn_codebase_intelligence',
      },
      {
        description: 'Use auto_learn_if_needed for automatic learning',
        automated: true,
        command: 'auto_learn_if_needed',
      },
    ],
  },

  // Learning stale
  {
    pattern: /intelligence data is stale|re-run learning|learning stale/i,
    category: 'learning',
    code: 'LEARNING_STALE',
    getMessage: (e) => `Learning data is stale: ${e.message}`,
    getRecoveryActions: () => [
      {
        description: 'Re-run the learning process to refresh intelligence data',
        automated: true,
        command: 'learn_codebase_intelligence --force',
      },
    ],
  },

  // Configuration errors
  {
    pattern: /configuration error|missing required setting|invalid config/i,
    category: 'configuration',
    code: 'CONFIGURATION_ERROR',
    getMessage: (e) => `Configuration error: ${e.message}`,
    getRecoveryActions: () => [
      {
        description: 'Review configuration settings and ensure all required values are provided',
        automated: false,
      },
    ],
  },

  // Database errors
  {
    pattern: /SQLITE|database|constraint failed/i,
    category: 'execution',
    code: 'DATABASE_ERROR',
    getMessage: (e) => `Database error: ${e.message}`,
    getRecoveryActions: () => [
      {
        description: 'Check database connectivity and integrity',
        automated: false,
      },
      {
        description: 'Try rebuilding the database if corruption is suspected',
        automated: false,
      },
    ],
  },

  // Validation errors
  {
    pattern: /invalid|validation|required|parameter/i,
    category: 'validation',
    code: 'VALIDATION_ERROR',
    getMessage: (e) => `Validation error: ${e.message}`,
    getRecoveryActions: () => [
      {
        description: 'Check input parameters and ensure all required fields are provided',
        automated: false,
      },
    ],
  },
];

// ============================================================================
// Error Classifier Class
// ============================================================================

/**
 * Error classifier with customizable rules.
 *
 * Allows adding custom rules that take precedence over default rules.
 */
export class ErrorClassifier {
  private customRules: ClassificationRule[] = [];

  /**
   * Add a custom classification rule.
   *
   * Custom rules are checked before default rules, so they take precedence.
   *
   * @param rule - The classification rule to add
   */
  addRule(rule: ClassificationRule): void {
    this.customRules.push(rule);
  }

  /**
   * Classify an error.
   *
   * @param error - The error to classify
   * @param context - Optional context information
   * @returns Classified error with category, code, and recovery actions
   */
  classify(error: unknown, context?: ErrorContext): ClassifiedError {
    const normalizedError = this.normalizeError(error);

    // Check custom rules first (in order of addition)
    for (const rule of this.customRules) {
      if (rule.pattern.test(normalizedError.message)) {
        return this.createClassifiedError(normalizedError, rule, context);
      }
    }

    // Check default rules
    for (const rule of DEFAULT_RULES) {
      if (rule.pattern.test(normalizedError.message)) {
        return this.createClassifiedError(normalizedError, rule, context);
      }
    }

    // Fallback to system/internal error
    return {
      category: 'system',
      code: 'INTERNAL_ERROR',
      details: normalizedError.message,
      originalError: error,
      recoveryActions: [
        {
          description: 'Check logs for more details',
          automated: false,
        },
        {
          description: 'If the issue persists, report it to the maintainers',
          automated: false,
        },
      ],
      context,
    };
  }

  /**
   * Normalize various error types to a standard Error object.
   */
  private normalizeError(error: unknown): Error {
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

  /**
   * Create a classified error from a rule match.
   */
  private createClassifiedError(
    error: Error,
    rule: ClassificationRule,
    context?: ErrorContext
  ): ClassifiedError {
    return {
      category: rule.category,
      code: rule.code,
      details: rule.getMessage(error),
      originalError: error,
      recoveryActions: rule.getRecoveryActions(error),
      context,
    };
  }
}

// ============================================================================
// Convenience Function
// ============================================================================

/**
 * Default classifier instance for convenience.
 */
const defaultClassifier = new ErrorClassifier();

/**
 * Classify an error using the default classifier.
 *
 * @param error - The error to classify (Error, string, or object with message)
 * @param context - Optional context information
 * @returns Classified error with category, code, and recovery actions
 *
 * @example
 * ```typescript
 * const result = classifyError(new Error('ENOENT: no such file'));
 * console.log(result.category); // 'resource'
 * console.log(result.code); // 'FILE_NOT_FOUND'
 * ```
 */
export function classifyError(error: unknown, context?: ErrorContext): ClassifiedError {
  return defaultClassifier.classify(error, context);
}
