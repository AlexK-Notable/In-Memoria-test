/**
 * Parameter Validator
 *
 * Centralized validation for MCP tool parameters.
 * Provides type-safe validation with detailed error messages.
 *
 * @example
 * ```typescript
 * import { validatePath, validateParams } from './param-validator.js';
 *
 * const pathResult = validatePath('/some/path');
 * if (!pathResult.valid) {
 *   throw new ValidationError(pathResult.error);
 * }
 *
 * const paramsResult = validateParams(args, {
 *   path: { type: 'path', required: true },
 *   limit: { type: 'number', min: 1, max: 100 },
 * });
 * ```
 */

import { resolve, isAbsolute } from 'path';

// ============================================================================
// Types
// ============================================================================

/**
 * Result of a validation operation
 */
export interface ValidationResult<T> {
  /** Whether validation passed */
  valid: boolean;

  /** The validated/transformed value */
  value?: T;

  /** Error message if validation failed */
  error?: string;
}

/**
 * Options for path validation
 */
export interface PathValidationOptions {
  /** List of allowed base directories */
  allowedDirs?: string[];

  /** Allow relative paths */
  allowRelative?: boolean;
}

/**
 * Options for string validation
 */
export interface StringValidationOptions {
  /** Whether the string is required */
  required?: boolean;

  /** Minimum length */
  minLength?: number;

  /** Maximum length */
  maxLength?: number;

  /** Pattern to match */
  pattern?: RegExp;

  /** Trim whitespace */
  trim?: boolean;
}

/**
 * Options for number validation
 */
export interface NumberValidationOptions {
  /** Whether the number is required */
  required?: boolean;

  /** Minimum value */
  min?: number;

  /** Maximum value */
  max?: number;

  /** Must be an integer */
  integer?: boolean;

  /** Coerce strings to numbers */
  coerce?: boolean;
}

/**
 * Schema definition for parameter validation
 */
export interface ParamSchema {
  type: 'path' | 'string' | 'number';
  required?: boolean;
  // Path options
  allowedDirs?: string[];
  allowRelative?: boolean;
  // String options
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  trim?: boolean;
  // Number options
  min?: number;
  max?: number;
  integer?: boolean;
  coerce?: boolean;
}

/**
 * Result of validating multiple parameters
 */
export interface ParamsValidationResult {
  /** Whether all validations passed */
  valid: boolean;

  /** Validated values (only present if valid) */
  values: Record<string, unknown>;

  /** Errors by field name */
  errors: Record<string, string>;
}

// ============================================================================
// ValidationError
// ============================================================================

/**
 * Error thrown when validation fails
 */
export class ValidationError extends Error {
  name = 'ValidationError';

  /** The field that failed validation */
  field?: string;

  /** The invalid value */
  value?: unknown;

  constructor(message: string, details?: { field?: string; value?: unknown }) {
    super(message);
    this.field = details?.field;
    this.value = details?.value;
  }
}

// ============================================================================
// Path Validation
// ============================================================================

/**
 * Validate a file path parameter.
 *
 * @param value - The path to validate
 * @param options - Validation options
 * @returns Validation result
 */
export function validatePath(
  value: unknown,
  options: PathValidationOptions = {}
): ValidationResult<string> {
  const { allowedDirs, allowRelative = false } = options;

  // Check if undefined/null
  if (value === undefined || value === null) {
    return { valid: false, error: 'Path is required' };
  }

  // Check if string
  if (typeof value !== 'string') {
    return { valid: false, error: 'Path must be a string' };
  }

  // Check if empty
  if (value.trim() === '') {
    return { valid: false, error: 'Path cannot be empty' };
  }

  // Check for null bytes (security)
  if (value.includes('\x00')) {
    return { valid: false, error: 'Path contains invalid characters' };
  }

  // Check for path traversal (security)
  if (value.includes('..')) {
    return { valid: false, error: 'Path traversal is not allowed' };
  }

  // Check if absolute path required
  if (!allowRelative && !isAbsolute(value)) {
    return { valid: false, error: 'Absolute path is required' };
  }

  // Check if within allowed directories
  if (allowedDirs && allowedDirs.length > 0) {
    const resolvedPath = resolve(value);
    const isAllowed = allowedDirs.some((dir) =>
      resolvedPath.startsWith(resolve(dir))
    );

    if (!isAllowed) {
      return {
        valid: false,
        error: `Path is outside allowed directories: ${allowedDirs.join(', ')}`,
      };
    }
  }

  return { valid: true, value };
}

// ============================================================================
// String Validation
// ============================================================================

/**
 * Validate a string parameter.
 *
 * @param value - The string to validate
 * @param options - Validation options
 * @returns Validation result
 */
export function validateString(
  value: unknown,
  options: StringValidationOptions = {}
): ValidationResult<string> {
  const {
    required = true,
    minLength,
    maxLength,
    pattern,
    trim = false,
  } = options;

  // Handle undefined/null
  if (value === undefined || value === null) {
    if (required) {
      return { valid: false, error: 'Value is required' };
    }
    return { valid: true, value: undefined };
  }

  // Check if string
  if (typeof value !== 'string') {
    return { valid: false, error: 'Value must be a string' };
  }

  // Trim if configured
  let processedValue = trim ? value.trim() : value;

  // Check empty
  if (processedValue === '' && required) {
    return { valid: false, error: 'Value cannot be empty' };
  }

  // Check minimum length
  if (minLength !== undefined && processedValue.length < minLength) {
    return {
      valid: false,
      error: `Value must have minimum length of ${minLength}`,
    };
  }

  // Check maximum length
  if (maxLength !== undefined && processedValue.length > maxLength) {
    return {
      valid: false,
      error: `Value exceeds maximum length of ${maxLength}`,
    };
  }

  // Check pattern
  if (pattern && !pattern.test(processedValue)) {
    return { valid: false, error: 'Value does not match required pattern' };
  }

  return { valid: true, value: processedValue };
}

// ============================================================================
// Number Validation
// ============================================================================

/**
 * Validate a number parameter.
 *
 * @param value - The number to validate
 * @param options - Validation options
 * @returns Validation result
 */
export function validateNumber(
  value: unknown,
  options: NumberValidationOptions = {}
): ValidationResult<number> {
  const { required = true, min, max, integer = false, coerce = false } = options;

  // Handle undefined/null
  if (value === undefined || value === null) {
    if (required) {
      return { valid: false, error: 'Value is required' };
    }
    return { valid: true, value: undefined };
  }

  // Coerce string to number if configured
  let numValue: number;
  if (coerce && typeof value === 'string') {
    numValue = Number(value);
  } else if (typeof value === 'number') {
    numValue = value;
  } else {
    return { valid: false, error: 'Value must be a number' };
  }

  // Check NaN
  if (Number.isNaN(numValue)) {
    return { valid: false, error: 'Value is not a valid number' };
  }

  // Check Infinity
  if (!Number.isFinite(numValue)) {
    return { valid: false, error: 'Value must be finite' };
  }

  // Check integer
  if (integer && !Number.isInteger(numValue)) {
    return { valid: false, error: 'Value must be an integer' };
  }

  // Check minimum
  if (min !== undefined && numValue < min) {
    return { valid: false, error: `Value must be at least ${min} (minimum)` };
  }

  // Check maximum
  if (max !== undefined && numValue > max) {
    return { valid: false, error: `Value cannot exceed ${max} (maximum)` };
  }

  return { valid: true, value: numValue };
}

// ============================================================================
// Schema-based Validation
// ============================================================================

/**
 * Validate multiple parameters against a schema.
 *
 * @param params - The parameters to validate
 * @param schema - Schema defining validation rules for each parameter
 * @returns Validation result with all values or all errors
 */
export function validateParams(
  params: Record<string, unknown>,
  schema: Record<string, ParamSchema>
): ParamsValidationResult {
  const values: Record<string, unknown> = {};
  const errors: Record<string, string> = {};
  let valid = true;

  for (const [key, config] of Object.entries(schema)) {
    const value = params[key];
    let result: ValidationResult<unknown>;

    switch (config.type) {
      case 'path':
        result = validatePath(value, {
          allowedDirs: config.allowedDirs,
          allowRelative: config.allowRelative,
        });
        // Path is always required unless value is undefined and not required
        if (!config.required && value === undefined) {
          result = { valid: true, value: undefined };
        }
        break;

      case 'string':
        result = validateString(value, {
          required: config.required ?? true,
          minLength: config.minLength,
          maxLength: config.maxLength,
          pattern: config.pattern,
          trim: config.trim,
        });
        break;

      case 'number':
        result = validateNumber(value, {
          required: config.required ?? true,
          min: config.min,
          max: config.max,
          integer: config.integer,
          coerce: config.coerce,
        });
        break;

      default:
        result = { valid: false, error: `Unknown type: ${(config as ParamSchema).type}` };
    }

    if (result.valid) {
      if (result.value !== undefined) {
        values[key] = result.value;
      }
    } else {
      valid = false;
      errors[key] = result.error || 'Validation failed';
    }
  }

  return { valid, values, errors };
}
