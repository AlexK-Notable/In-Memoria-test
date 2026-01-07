/**
 * Safe logging utility for MCP server context
 *
 * MCP STDIO Transport Protocol:
 * - STDOUT: Reserved for JSON-RPC messages ONLY
 * - STDERR: May be used for logging (per MCP spec)
 *
 * When in MCP server mode, all logs go to STDERR to avoid polluting STDOUT.
 * When in CLI mode, logs go to their natural destinations (stdout/stderr).
 *
 * Correlation ID Support:
 * - Uses AsyncLocalStorage to propagate correlation IDs across async operations
 * - Automatically includes correlation ID in log output when present
 * - Use withCorrelationId() to wrap operations that should share a correlation ID
 */

import { AsyncLocalStorage } from 'async_hooks';

/**
 * Request context for correlation ID tracking
 */
export interface RequestContext {
  correlationId: string;
  toolName?: string;
  startTime?: number;
}

/**
 * AsyncLocalStorage instance for propagating request context
 */
const requestContext = new AsyncLocalStorage<RequestContext>();

/**
 * Run a function within a request context (correlation ID scope)
 * The correlation ID will be included in all log messages within this scope.
 * Works across async operations automatically.
 *
 * @param context - The request context containing correlationId and optional metadata
 * @param fn - The function to run within the context
 * @returns The result of the function
 */
export function runWithRequestContext<T>(
  context: RequestContext,
  fn: () => T
): T {
  return requestContext.run(context, fn);
}

/**
 * Get the current request context (if any)
 * Returns undefined if not within a runWithRequestContext scope
 */
export function getRequestContext(): RequestContext | undefined {
  return requestContext.getStore();
}

/**
 * Generate a unique request ID for correlation
 * Format: req_<timestamp_base36>_<random_base36>
 */
export function generateRequestId(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 11)}`;
}

export class Logger {
  /**
   * Check if we're in MCP server mode (checked dynamically at each call)
   */
  private static isMCPServer(): boolean {
    return process.env.MCP_SERVER === 'true';
  }

  /**
   * Get the current correlation ID (if any)
   * Returns undefined if not within a runWithRequestContext scope
   */
  static getCorrelationId(): string | undefined {
    return getRequestContext()?.correlationId;
  }

  /**
   * Run a function with a correlation ID context.
   * All log messages within this context will include the correlation ID.
   * Works across async operations automatically.
   *
   * @param correlationId - The correlation ID to use
   * @param fn - The function to run within the context
   * @returns The result of the function
   */
  static withCorrelationId<T>(correlationId: string, fn: () => T): T {
    return runWithRequestContext({ correlationId }, fn);
  }

  /**
   * Run a function with a full request context.
   * All log messages within this context will include the correlation ID and tool name.
   *
   * @param context - The request context containing correlationId and optional metadata
   * @param fn - The function to run within the context
   * @returns The result of the function
   */
  static withRequestContext<T>(context: RequestContext, fn: () => T): T {
    return runWithRequestContext(context, fn);
  }

  /**
   * Format a log message with timestamp, level, correlation ID, and optional tool name
   */
  private static formatMessage(
    level: string,
    message: string,
    data?: Record<string, unknown>
  ): string {
    const context = getRequestContext();
    const timestamp = new Date().toISOString();

    const parts = [timestamp, `[${level}]`];

    if (context?.correlationId) {
      parts.push(`[${context.correlationId}]`);
    }

    if (context?.toolName) {
      parts.push(`[${context.toolName}]`);
    }

    parts.push(message);

    if (data && Object.keys(data).length > 0) {
      parts.push(JSON.stringify(data));
    }

    return parts.join(' ');
  }

  /**
   * Log an error message
   * - MCP mode: writes to stderr (allowed by MCP spec)
   * - CLI mode: writes to stderr
   * - Includes correlation ID when present in context
   *
   * @param message - The error message
   * @param errorOrData - Optional Error object or additional data
   * @param data - Optional additional data (when errorOrData is an Error)
   */
  static error(
    message: string,
    errorOrData?: Error | unknown | Record<string, unknown>,
    data?: Record<string, unknown>
  ): void {
    const errorData: Record<string, unknown> = { ...data };

    if (errorOrData instanceof Error) {
      errorData.error = errorOrData.message;
      if (errorOrData.stack) {
        errorData.stack = errorOrData.stack.split('\n').slice(0, 3).join('\n');
      }
    } else if (
      errorOrData !== undefined &&
      typeof errorOrData === 'object' &&
      errorOrData !== null &&
      !Array.isArray(errorOrData)
    ) {
      // It's a data object, merge it
      Object.assign(errorData, errorOrData as Record<string, unknown>);
    } else if (errorOrData !== undefined) {
      errorData.error = String(errorOrData);
    }

    const formatted = this.formatMessage('ERROR', message, errorData);
    console.error(formatted);
  }

  /**
   * Log an info message
   * - MCP mode: writes to stderr (allowed by MCP spec)
   * - CLI mode: writes to stdout
   * - Includes correlation ID when present in context
   *
   * Supports both new API and legacy spread args for backward compatibility:
   * - New: Logger.info('message', { key: 'value' })
   * - Legacy: Logger.info('message', arg1, arg2, ...)
   */
  static info(message: string, ...args: unknown[]): void {
    let formatted: string;

    if (
      args.length === 1 &&
      typeof args[0] === 'object' &&
      args[0] !== null &&
      !Array.isArray(args[0]) &&
      !(args[0] instanceof Error)
    ) {
      // New API: data object
      formatted = this.formatMessage('INFO', message, args[0] as Record<string, unknown>);
    } else if (args.length > 0) {
      // Legacy API: spread args - append them to message
      const argsStr = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
      formatted = this.formatMessage('INFO', `${message} ${argsStr}`);
    } else {
      formatted = this.formatMessage('INFO', message);
    }

    if (this.isMCPServer()) {
      // In MCP mode, write to stderr instead of stdout
      // MCP spec allows stderr for logging
      console.error(formatted);
    } else {
      console.log(formatted);
    }
  }

  /**
   * Log a warning message
   * - MCP mode: writes to stderr (allowed by MCP spec)
   * - CLI mode: writes to stderr
   * - Includes correlation ID when present in context
   *
   * Supports both new API and legacy spread args for backward compatibility:
   * - New: Logger.warn('message', { key: 'value' })
   * - Legacy: Logger.warn('message', arg1, arg2, ...)
   */
  static warn(message: string, ...args: unknown[]): void {
    let formatted: string;

    if (
      args.length === 1 &&
      typeof args[0] === 'object' &&
      args[0] !== null &&
      !Array.isArray(args[0]) &&
      !(args[0] instanceof Error)
    ) {
      // New API: data object
      formatted = this.formatMessage('WARN', message, args[0] as Record<string, unknown>);
    } else if (args.length > 0) {
      // Legacy API: spread args - append them to message
      const argsStr = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
      formatted = this.formatMessage('WARN', `${message} ${argsStr}`);
    } else {
      formatted = this.formatMessage('WARN', message);
    }

    console.warn(formatted);
  }

  /**
   * Log a debug message (only when DEBUG=true)
   * - MCP mode: writes to stderr (allowed by MCP spec)
   * - CLI mode: writes to stderr
   * - Includes correlation ID when present in context
   *
   * Supports both new API and legacy spread args for backward compatibility:
   * - New: Logger.debug('message', { key: 'value' })
   * - Legacy: Logger.debug('message', arg1, arg2, ...)
   */
  static debug(message: string, ...args: unknown[]): void {
    if (process.env.DEBUG === 'true') {
      let formatted: string;

      if (
        args.length === 1 &&
        typeof args[0] === 'object' &&
        args[0] !== null &&
        !Array.isArray(args[0]) &&
        !(args[0] instanceof Error)
      ) {
        // New API: data object
        formatted = this.formatMessage('DEBUG', message, args[0] as Record<string, unknown>);
      } else if (args.length > 0) {
        // Legacy API: spread args - append them to message
        const argsStr = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
        formatted = this.formatMessage('DEBUG', `${message} ${argsStr}`);
      } else {
        formatted = this.formatMessage('DEBUG', message);
      }

      console.error(formatted);
    }
  }

  /**
   * Log a structured entry as JSON
   * Useful for machine-parseable logs and log aggregation systems
   */
  static structured(entry: {
    level: 'info' | 'warn' | 'error' | 'debug';
    message: string;
    [key: string]: unknown;
  }): void {
    const context = getRequestContext();
    const output = {
      timestamp: new Date().toISOString(),
      ...entry,
      correlationId: context?.correlationId,
      toolName: context?.toolName,
    };

    console.error(JSON.stringify(output));
  }
}
