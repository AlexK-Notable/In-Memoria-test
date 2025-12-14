/**
 * CLI Error Handler
 *
 * Provides user-friendly error messages for CLI operations.
 * Integrates with ErrorClassifier for consistent error categorization
 * and recovery suggestions.
 *
 * @example
 * ```typescript
 * import { handleError, formatError, CLIErrorHandler } from './cli-error-handler.js';
 *
 * try {
 *   await riskyOperation();
 * } catch (error) {
 *   handleError(error, { exitOnError: true });
 * }
 * ```
 */

import { classifyError, type ClassifiedError } from '../utils/error-classifier.js';

// ============================================================================
// ANSI Color Codes (for terminal output)
// ============================================================================

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  bold: '\x1b[1m',
};

// ============================================================================
// Types
// ============================================================================

/**
 * Options for error handling
 */
export interface HandleErrorOptions {
  /** Whether to exit the process on error */
  exitOnError?: boolean;

  /** Exit code to use (default: 1) */
  exitCode?: number;

  /** Additional context about the error */
  context?: ErrorContext;
}

/**
 * Options for CLIErrorHandler
 */
export interface CLIErrorHandlerOptions {
  /** Show verbose output including stack traces */
  verbose?: boolean;

  /** Use colors in output */
  useColors?: boolean;
}

/**
 * Error context for additional information
 */
export interface ErrorContext {
  /** The operation being performed */
  operation?: string;

  /** Path being operated on */
  path?: string;

  /** Additional context */
  [key: string]: unknown;
}

// ============================================================================
// Formatting Helpers
// ============================================================================

/**
 * Get color code (or empty if colors disabled)
 */
function c(color: keyof typeof colors, useColors: boolean): string {
  return useColors ? colors[color] : '';
}

/**
 * Get category emoji
 */
function getCategoryEmoji(category: string): string {
  const emojis: Record<string, string> = {
    validation: '⚠️',
    resource: '📁',
    learning: '🧠',
    configuration: '⚙️',
    execution: '💥',
    system: '🔧',
  };
  return emojis[category] || '❌';
}

/**
 * Format a classified error for CLI display
 */
function formatClassifiedError(
  classified: ClassifiedError,
  options: { verbose?: boolean; useColors?: boolean; context?: ErrorContext } = {}
): string {
  const { verbose = false, useColors = true, context } = options;
  const lines: string[] = [];

  // Header with category and code
  const emoji = getCategoryEmoji(classified.category);
  lines.push(
    `${c('red', useColors)}${c('bold', useColors)}${emoji} Error [${classified.category}] ${classified.code}${c('reset', useColors)}`
  );
  lines.push('');

  // Error details
  lines.push(`${c('cyan', useColors)}Details:${c('reset', useColors)} ${classified.details}`);
  lines.push('');

  // Context if provided
  if (context && Object.keys(context).length > 0) {
    lines.push(`${c('cyan', useColors)}Context:${c('reset', useColors)}`);
    for (const [key, value] of Object.entries(context)) {
      lines.push(`  ${key}: ${String(value)}`);
    }
    lines.push('');
  }

  // Recovery suggestions
  if (classified.recoveryActions && classified.recoveryActions.length > 0) {
    lines.push(`${c('cyan', useColors)}Suggestions:${c('reset', useColors)}`);
    for (const action of classified.recoveryActions) {
      const marker = action.automated ? '⚡' : '→';
      lines.push(`  ${marker} ${action.description}`);
      if (action.command) {
        lines.push(`    ${c('gray', useColors)}Command: ${action.command}${c('reset', useColors)}`);
      }
    }
    lines.push('');
  }

  // Stack trace in verbose mode
  if (verbose && classified.originalError instanceof Error) {
    const stack = classified.originalError.stack;
    if (stack) {
      lines.push(`${c('gray', useColors)}Stack trace:${c('reset', useColors)}`);
      lines.push(`${c('gray', useColors)}${stack}${c('reset', useColors)}`);
    }
  }

  return lines.join('\n');
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Format an error for CLI display.
 *
 * Uses ErrorClassifier to categorize the error and provide
 * recovery suggestions.
 *
 * @param error - The error to format
 * @param context - Optional context information
 * @returns Formatted error string for CLI display
 */
export function formatError(
  error: unknown,
  context?: ErrorContext
): string {
  const classified = classifyError(error, context);
  return formatClassifiedError(classified, { useColors: true, context });
}

/**
 * Handle an error by logging it and optionally exiting.
 *
 * @param error - The error to handle
 * @param options - Handling options
 */
export function handleError(
  error: unknown,
  options: HandleErrorOptions = {}
): void {
  const { exitOnError = true, exitCode = 1, context } = options;

  const formatted = formatError(error, context);
  console.error(formatted);

  if (exitOnError) {
    process.exit(exitCode);
  }
}

/**
 * CLI Error Handler class for more control over error formatting.
 */
export class CLIErrorHandler {
  private verbose: boolean;
  private useColors: boolean;

  /**
   * Create a new CLIErrorHandler
   *
   * @param options - Handler options
   */
  constructor(options: CLIErrorHandlerOptions = {}) {
    this.verbose = options.verbose ?? false;
    this.useColors = options.useColors ?? true;
  }

  /**
   * Format an error for display
   *
   * @param error - The error to format
   * @param context - Optional context
   * @returns Formatted error string
   */
  format(error: unknown, context?: ErrorContext): string {
    const classified = classifyError(error, context);
    return formatClassifiedError(classified, {
      verbose: this.verbose,
      useColors: this.useColors,
      context,
    });
  }

  /**
   * Log an error to console.error
   *
   * @param error - The error to log
   * @param context - Optional context
   */
  log(error: unknown, context?: ErrorContext): void {
    const formatted = this.format(error, context);
    console.error(formatted);
  }

  /**
   * Handle an error (log and optionally exit)
   *
   * @param error - The error to handle
   * @param options - Handling options
   */
  handle(error: unknown, options: HandleErrorOptions = {}): void {
    const { exitOnError = true, exitCode = 1, context } = options;

    this.log(error, context);

    if (exitOnError) {
      process.exit(exitCode);
    }
  }
}
