/**
 * Security Utilities
 *
 * Provides security primitives for path validation, sensitive file detection,
 * SQL injection prevention, and error sanitization.
 *
 * Coordinates with:
 * - Core analysis tools for path validation
 * - SQLite database for LIKE pattern safety
 * - Error handling for information disclosure prevention
 */

import { resolve, normalize, relative, isAbsolute } from 'path';
import { realpathSync, lstatSync, existsSync } from 'fs';

// ============================================================================
// Path Validation Types
// ============================================================================

/**
 * Result of path validation
 */
export interface PathValidationResult {
  isValid: boolean;
  resolvedPath: string;
  error?: string;
}

/**
 * Options for path validation
 */
export interface PathValidationOptions {
  /** Allow following symlinks (default: false) */
  allowSymlinks?: boolean;
  /** Require path to exist (default: true) */
  requireExists?: boolean;
  /** Additional allowed root directories */
  allowedRoots?: string[];
}

// ============================================================================
// Sensitive File Detection Types
// ============================================================================

/**
 * Result of sensitive file check
 */
export interface SensitiveFileResult {
  isSensitive: boolean;
  pattern?: string;
  description?: string;
  severity?: 'critical' | 'high' | 'medium';
}

/**
 * Result of filtering sensitive files
 */
export interface FilteredFiles {
  safe: string[];
  blocked: Array<{ path: string; reason: string }>;
}

// ============================================================================
// SQL LIKE Pattern Types
// ============================================================================

/**
 * Safe LIKE pattern with escape clause
 */
export interface SafeLikePattern {
  pattern: string;
  escapeClause: string;
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Safe error structure for external responses
 */
export interface SafeError {
  message: string;
  code: string;
}

// ============================================================================
// Sensitive File Patterns
// ============================================================================

interface SensitivePattern {
  pattern: string | RegExp;
  description: string;
  severity: 'critical' | 'high' | 'medium';
}

/**
 * Patterns for sensitive files that should never be read or analyzed
 */
export const SENSITIVE_PATTERNS: SensitivePattern[] = [
  // Environment and configuration secrets
  { pattern: /^\.env/, description: 'Environment files', severity: 'critical' },
  { pattern: '.env.local', description: 'Local environment file', severity: 'critical' },
  { pattern: '.env.production', description: 'Production environment', severity: 'critical' },

  // SSH and authentication
  { pattern: /\.ssh[\/\\]/, description: 'SSH directory', severity: 'critical' },
  { pattern: /id_rsa/, description: 'SSH private key', severity: 'critical' },
  { pattern: /id_ed25519/, description: 'SSH ED25519 key', severity: 'critical' },
  { pattern: /id_ecdsa/, description: 'SSH ECDSA key', severity: 'critical' },
  { pattern: /id_dsa/, description: 'SSH DSA key', severity: 'critical' },
  { pattern: /\.pem$/, description: 'PEM certificate/key', severity: 'critical' },
  { pattern: /\.key$/, description: 'Private key file', severity: 'critical' },
  { pattern: /\.p12$/, description: 'PKCS12 certificate', severity: 'critical' },
  { pattern: /\.pfx$/, description: 'PFX certificate', severity: 'critical' },

  // Credential files
  { pattern: 'credentials', description: 'Credentials file', severity: 'high' },
  { pattern: 'credentials.json', description: 'Google Cloud credentials', severity: 'critical' },
  { pattern: 'service-account.json', description: 'Service account key', severity: 'critical' },
  { pattern: 'serviceAccountKey.json', description: 'Firebase service account', severity: 'critical' },
  { pattern: '.htpasswd', description: 'Apache password file', severity: 'critical' },
  { pattern: '.npmrc', description: 'NPM config (may contain tokens)', severity: 'high' },
  { pattern: '.pypirc', description: 'PyPI config (may contain tokens)', severity: 'high' },

  // Cloud provider configs
  { pattern: '.aws/', description: 'AWS credentials directory', severity: 'critical' },
  { pattern: '.azure/', description: 'Azure credentials directory', severity: 'critical' },
  { pattern: '.gcloud/', description: 'GCloud credentials directory', severity: 'critical' },
  { pattern: '.kube/', description: 'Kubernetes config', severity: 'critical' },

  // Version control secrets
  { pattern: '.git-credentials', description: 'Git credentials', severity: 'critical' },

  // Secrets managers
  { pattern: /secrets?\.(ya?ml|json)$/i, description: 'Secrets file', severity: 'high' },
];

// ============================================================================
// Path Validation Functions
// ============================================================================

/**
 * Validates a path is safe and within allowed boundaries.
 *
 * Protects against path traversal attacks including:
 * - URL encoding (%2e%2e%2f)
 * - Unicode encoding variants
 * - Double encoding
 * - Null byte injection
 * - Symlink escapes
 *
 * @param inputPath - The path to validate
 * @param projectRoot - The project root directory
 * @param options - Validation options
 * @returns Validation result with resolved path or error
 */
export function validatePath(
  inputPath: string,
  projectRoot: string,
  options: PathValidationOptions = {}
): PathValidationResult {
  const {
    allowSymlinks = false,
    requireExists = true,
    allowedRoots = []
  } = options;

  // 1. Check for null bytes (before any processing)
  if (inputPath.includes('\0')) {
    return {
      isValid: false,
      resolvedPath: '',
      error: 'Path contains null bytes'
    };
  }

  // 2. URL decode the path to catch encoded traversal attempts
  let decodedPath: string;
  try {
    // Decode multiple times to catch double/triple encoding
    decodedPath = inputPath;
    let prevPath = '';
    let decodeAttempts = 0;
    while (prevPath !== decodedPath && decodeAttempts < 5) {
      prevPath = decodedPath;
      decodedPath = decodeURIComponent(decodedPath);
      decodeAttempts++;
    }
  } catch {
    // Invalid encoding - treat as suspicious
    return {
      isValid: false,
      resolvedPath: '',
      error: 'Path contains invalid encoding'
    };
  }

  // 3. Check for traversal patterns after decoding
  const traversalPatterns = [
    /\.\./,           // Standard traversal
    /\.\.\\/,         // Windows traversal
    /\.%2e/i,         // Partial encoding
    /%2e\./i,         // Partial encoding
  ];

  for (const pattern of traversalPatterns) {
    if (pattern.test(decodedPath)) {
      // Still might be valid if within project root after resolution
      // Continue to next checks
    }
  }

  // 4. Resolve to absolute path
  const resolvedProjectRoot = resolve(projectRoot);
  const absolutePath = isAbsolute(decodedPath)
    ? resolve(decodedPath)
    : resolve(resolvedProjectRoot, decodedPath);

  // 5. Normalize the path (removes redundant separators, resolves . and ..)
  const normalizedPath = normalize(absolutePath);

  // 6. Check if path is within project root or allowed roots
  const allRoots = [resolvedProjectRoot, ...allowedRoots.map(r => resolve(r))];
  const isWithinAllowedRoot = allRoots.some(root => {
    const relativePath = relative(root, normalizedPath);
    return !relativePath.startsWith('..') && !isAbsolute(relativePath);
  });

  if (!isWithinAllowedRoot) {
    return {
      isValid: false,
      resolvedPath: normalizedPath,
      error: 'Path is outside allowed project boundaries'
    };
  }

  // 7. If path exists, perform additional checks
  if (existsSync(normalizedPath)) {
    try {
      const stats = lstatSync(normalizedPath);

      // 8. Symlink handling
      if (stats.isSymbolicLink()) {
        if (!allowSymlinks) {
          return {
            isValid: false,
            resolvedPath: normalizedPath,
            error: 'Symlinks are not allowed'
          };
        }

        // Resolve symlink target and verify it's within bounds
        const realPath = realpathSync(normalizedPath);
        const isTargetWithinBounds = allRoots.some(root => {
          const relativePath = relative(root, realPath);
          return !relativePath.startsWith('..') && !isAbsolute(relativePath);
        });

        if (!isTargetWithinBounds) {
          return {
            isValid: false,
            resolvedPath: normalizedPath,
            error: 'Symlink target is outside allowed boundaries'
          };
        }
      }
    } catch (error) {
      return {
        isValid: false,
        resolvedPath: normalizedPath,
        error: `Cannot access path: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  } else if (requireExists) {
    return {
      isValid: false,
      resolvedPath: normalizedPath,
      error: 'Path does not exist'
    };
  }

  return {
    isValid: true,
    resolvedPath: normalizedPath
  };
}

// ============================================================================
// Sensitive File Detection Functions
// ============================================================================

/**
 * Checks if a file path matches any sensitive file pattern.
 *
 * @param filePath - The file path to check
 * @returns Object with match details if sensitive, or { isSensitive: false }
 */
export function isSensitiveFile(filePath: string): SensitiveFileResult {
  const normalizedPath = normalize(filePath).toLowerCase();
  const filename = normalizedPath.split(/[\/\\]/).pop() || '';

  for (const { pattern, description, severity } of SENSITIVE_PATTERNS) {
    let matches = false;

    if (typeof pattern === 'string') {
      matches = normalizedPath.includes(pattern.toLowerCase()) ||
                filename === pattern.toLowerCase();
    } else {
      matches = pattern.test(normalizedPath) || pattern.test(filename);
    }

    if (matches) {
      return {
        isSensitive: true,
        pattern: typeof pattern === 'string' ? pattern : pattern.source,
        description,
        severity
      };
    }
  }

  return { isSensitive: false };
}

/**
 * Filter multiple files and return safe and blocked lists.
 *
 * @param filePaths - Array of file paths to check
 * @returns Object with safe and blocked file arrays
 */
export function filterSensitiveFiles(filePaths: string[]): FilteredFiles {
  const safe: string[] = [];
  const blocked: Array<{ path: string; reason: string }> = [];

  for (const filePath of filePaths) {
    const check = isSensitiveFile(filePath);
    if (check.isSensitive) {
      blocked.push({
        path: filePath,
        reason: check.description || 'Sensitive file'
      });
    } else {
      safe.push(filePath);
    }
  }

  return { safe, blocked };
}

// ============================================================================
// SQL LIKE Pattern Functions
// ============================================================================

/**
 * Escape special LIKE pattern characters in SQL queries.
 * Prevents wildcard injection attacks.
 *
 * @param input - User-provided search string
 * @param escapeChar - The escape character to use (default: '\')
 * @returns Escaped string safe for use in LIKE patterns
 */
export function escapeLikePattern(input: string, escapeChar: string = '\\'): string {
  if (!input) return '';

  // Escape the escape character first, then the wildcards
  return input
    .replace(new RegExp(`\\${escapeChar}`, 'g'), escapeChar + escapeChar)
    .replace(/%/g, escapeChar + '%')
    .replace(/_/g, escapeChar + '_');
}

/**
 * Creates a safe LIKE pattern for substring search.
 *
 * @param searchTerm - User-provided search term
 * @param position - Where to match: 'contains', 'startsWith', 'endsWith', 'exact'
 * @returns Object with pattern and escape clause for SQL
 */
export function createSafeLikePattern(
  searchTerm: string,
  position: 'contains' | 'startsWith' | 'endsWith' | 'exact' = 'contains'
): SafeLikePattern {
  const escaped = escapeLikePattern(searchTerm);

  let pattern: string;
  switch (position) {
    case 'startsWith':
      pattern = `${escaped}%`;
      break;
    case 'endsWith':
      pattern = `%${escaped}`;
      break;
    case 'exact':
      pattern = escaped;
      break;
    case 'contains':
    default:
      pattern = `%${escaped}%`;
      break;
  }

  return {
    pattern,
    escapeClause: "ESCAPE '\\'"  // For SQLite
  };
}

// ============================================================================
// Error Sanitization Functions
// ============================================================================

/**
 * Options for error message sanitization
 */
export interface SanitizeErrorOptions {
  /** Include error type prefix (e.g., [TypeError]) */
  includeType?: boolean;
  /** Project root for relative path conversion */
  projectRoot?: string;
  /** Allow relative paths in output (converts absolute to relative) */
  allowRelativePaths?: boolean;
}

/**
 * Sanitize error messages to prevent information disclosure.
 *
 * Removes sensitive information like:
 * - Absolute file paths
 * - Stack traces
 * - Internal system details
 *
 * @param error - The error to sanitize
 * @param options - Sanitization options
 * @returns Sanitized error message
 */
export function sanitizeErrorMessage(
  error: unknown,
  options: SanitizeErrorOptions = {}
): string {
  const {
    includeType = false,
    projectRoot = process.cwd(),
    allowRelativePaths = true
  } = options;

  let message: string;

  if (error instanceof Error) {
    message = error.message;
  } else if (typeof error === 'string') {
    message = error;
  } else {
    return 'An unexpected error occurred';
  }

  // Remove absolute paths, optionally keeping relative paths
  if (allowRelativePaths && projectRoot) {
    // Replace absolute paths with relative ones
    const escapedRoot = projectRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pathRegex = new RegExp(`${escapedRoot}[\\/\\\\]?`, 'g');
    message = message.replace(pathRegex, './');
  } else {
    // Remove all absolute paths entirely
    message = message.replace(/([A-Za-z]:)?[\/\\][\w\/\\.\\-]+/g, '[path]');
  }

  // Remove stack trace patterns
  message = message.replace(/\s+at\s+.+\(.+:\d+:\d+\)/g, '');
  message = message.replace(/\s+at\s+\S+:\d+:\d+/g, '');

  // Remove line numbers that might indicate code structure
  message = message.replace(/:\d+:\d+/g, '');

  // Remove Node.js internal error codes that reveal implementation
  message = message.replace(/\[ERR_\w+\]/g, '');

  // Remove internal module paths
  message = message.replace(/node:internal\/\S+/g, '[internal]');
  message = message.replace(/node_modules\/\S+/g, '[module]');

  // Clean up whitespace
  message = message.replace(/\s+/g, ' ').trim();

  // Add error type prefix if requested
  if (includeType && error instanceof Error) {
    return `[${error.name}] ${message}`;
  }

  return message || 'An error occurred';
}

/**
 * Create a user-safe error from any error type.
 * For use in external-facing responses.
 *
 * @param error - The original error
 * @param context - Context message for the error
 * @param projectRoot - Project root for path sanitization
 * @returns Safe error object with message and code
 */
export function createSafeError(
  error: unknown,
  context: string,
  projectRoot?: string
): SafeError {
  const safeMessage = sanitizeErrorMessage(error, { projectRoot });

  // Generate a generic error code
  let code = 'INTERNAL_ERROR';
  if (error instanceof Error) {
    const lowerMessage = error.message.toLowerCase();
    if (lowerMessage.includes('not found') || lowerMessage.includes('enoent')) {
      code = 'NOT_FOUND';
    } else if (lowerMessage.includes('permission') || lowerMessage.includes('eacces')) {
      code = 'PERMISSION_DENIED';
    } else if (lowerMessage.includes('invalid') || lowerMessage.includes('validation')) {
      code = 'INVALID_INPUT';
    }
  }

  return {
    message: `${context}: ${safeMessage}`,
    code
  };
}
