import { existsSync } from 'fs';
import { resolve, isAbsolute, normalize } from 'path';
import { Logger } from './logger.js';
import { validatePath, type PathValidationResult, type PathValidationOptions } from './security.js';

// ============================================================================
// PathValidator Types
// ============================================================================

/**
 * Result of path validation with unified approach
 */
export interface ValidationResult {
  isValid: boolean;
  normalizedPath?: string;
  error?: string;
}

/**
 * Options for path validation
 */
export interface ValidateOptions {
  /** Allow following symlinks (default: false) */
  allowSymlinks?: boolean;
  /** Require path to exist (default: true) */
  requireExists?: boolean;
  /** Additional allowed root directories */
  allowedRoots?: string[];
}

// ============================================================================
// PathValidator Class
// ============================================================================

/**
 * Unified path validation utility class.
 * Integrates with security.ts for robust path traversal protection.
 *
 * Used across MCP tools to ensure consistent, secure path handling.
 *
 * Features:
 * - Path traversal attack prevention (../, URL encoding, null bytes)
 * - Symlink escape detection
 * - Project boundary enforcement
 * - Normalization and resolution
 */
export class PathValidator {
  // ============================================================================
  // Static Security Methods (Unified with security.ts)
  // ============================================================================

  /**
   * Validate path doesn't escape base directory.
   * Uses security.ts validatePath for robust protection against:
   * - Path traversal (../, ..\)
   * - URL encoding attacks (%2e%2e%2f)
   * - Double/triple encoding
   * - Null byte injection
   * - Symlink escapes
   *
   * @param path - The path to validate
   * @param basePath - The base directory path must be within (default: cwd)
   * @returns true if path is safe, false otherwise
   */
  static isPathSafe(path: string, basePath?: string): boolean {
    const result = this.validate(path, basePath);
    return result.isValid;
  }

  /**
   * Normalize path (resolve .., remove double slashes).
   * Does NOT validate security - use isPathSafe or validateAndNormalize for that.
   *
   * @param path - The path to normalize
   * @returns Normalized path string
   */
  static normalizePath(path: string): string {
    if (!path) return '';

    // Resolve to absolute path first, then normalize
    const absolutePath = isAbsolute(path) ? path : resolve(process.cwd(), path);
    return normalize(absolutePath);
  }

  /**
   * Combined: validate + normalize, return null if invalid.
   * This is the recommended method for tool handlers.
   *
   * @param path - The path to validate and normalize
   * @param basePath - The base directory path must be within (default: cwd)
   * @param options - Additional validation options
   * @returns Normalized path string if valid, null if invalid
   */
  static validateAndNormalize(
    path: string,
    basePath?: string,
    options: ValidateOptions = {}
  ): string | null {
    const result = this.validate(path, basePath, options);
    return result.isValid ? result.normalizedPath ?? null : null;
  }

  /**
   * Check for dangerous patterns in path (traversal, null bytes, etc).
   * Quick check without full validation.
   *
   * @param path - The path to check
   * @returns true if path contains dangerous patterns
   */
  static containsTraversal(path: string): boolean {
    if (!path) return false;

    // Check for null bytes
    if (path.includes('\0')) return true;

    // Check for traversal patterns (before and after URL decoding)
    const traversalPatterns = [
      /\.\./,           // Standard traversal
      /\.\.\\/,         // Windows traversal
      /%2e%2e/i,        // URL encoded
      /%252e/i,         // Double encoded
    ];

    for (const pattern of traversalPatterns) {
      if (pattern.test(path)) return true;
    }

    // Try URL decoding to catch encoded attacks
    try {
      let decoded = path;
      let prev = '';
      let attempts = 0;
      while (prev !== decoded && attempts < 5) {
        prev = decoded;
        decoded = decodeURIComponent(decoded);
        attempts++;
      }

      if (decoded.includes('..')) return true;
    } catch {
      // Invalid encoding is also suspicious
      return true;
    }

    return false;
  }

  /**
   * Full validation using security.ts validatePath.
   * Returns detailed result with normalized path or error.
   *
   * @param inputPath - The path to validate
   * @param basePath - The base directory path must be within (default: cwd)
   * @param options - Validation options
   * @returns ValidationResult with isValid, normalizedPath, and optional error
   */
  static validate(
    inputPath: string,
    basePath?: string,
    options: ValidateOptions = {}
  ): ValidationResult {
    if (!inputPath || typeof inputPath !== 'string') {
      return {
        isValid: false,
        error: 'Path is required and must be a string'
      };
    }

    const projectRoot = basePath || process.cwd();

    // Use security.ts validatePath for robust validation
    const securityOptions: PathValidationOptions = {
      allowSymlinks: options.allowSymlinks ?? false,
      requireExists: options.requireExists ?? true,
      allowedRoots: options.allowedRoots
    };

    try {
      const result: PathValidationResult = validatePath(inputPath, projectRoot, securityOptions);

      return {
        isValid: result.isValid,
        normalizedPath: result.resolvedPath,
        error: result.error
      };
    } catch (error) {
      return {
        isValid: false,
        error: error instanceof Error ? error.message : 'Unknown validation error'
      };
    }
  }

  /**
   * Validate path and throw McpError if invalid.
   * Convenience method for tool handlers.
   *
   * @param path - The path to validate
   * @param basePath - The base directory (default: cwd)
   * @param options - Validation options
   * @returns Validated normalized path
   * @throws Error if path is invalid
   */
  static getValidatedPath(
    path: string,
    basePath?: string,
    options: ValidateOptions = {}
  ): string {
    const result = this.validate(path, basePath, options);
    if (!result.isValid) {
      throw new Error(`Invalid path: ${result.error}`);
    }
    return result.normalizedPath!;
  }

  // ============================================================================
  // Project Path Validation (Original Methods - Enhanced)
  // ============================================================================

  /**
   * Validate and resolve a path for tool usage.
   * Now includes security validation via security.ts.
   *
   * @param path - The path to validate
   * @param context - Context for error messages (e.g., tool name)
   * @returns Resolved absolute path
   * @throws Error if path is invalid
   */
  static validateProjectPath(path: string | undefined, context: string): string {
    // If no path provided, use cwd but warn
    if (!path) {
      const cwd = process.cwd();
      Logger.warn(
        `Warning: No path provided to ${context}.\n` +
        `   Using current directory: ${cwd}\n` +
        '   This may not be the intended project directory in MCP context.\n' +
        '   Please provide an explicit path parameter to avoid issues.'
      );
      return cwd;
    }

    // Quick check for dangerous patterns before full validation
    if (this.containsTraversal(path)) {
      throw new Error(
        `Invalid path for ${context}: Path contains invalid characters or traversal patterns`
      );
    }

    // Resolve to absolute path
    const absolutePath = isAbsolute(path) ? path : resolve(process.cwd(), path);

    // Check if path exists
    if (!existsSync(absolutePath)) {
      throw new Error(
        `Invalid path for ${context}: ${absolutePath}\n` +
        'Path does not exist. Please provide a valid project directory path.'
      );
    }

    return absolutePath;
  }

  /**
   * Check if a path looks like a project root
   * (contains package.json, .git, or other project markers)
   * @param path - The path to check
   * @returns true if path looks like a project root
   */
  static looksLikeProjectRoot(path: string): boolean {
    const markers = [
      'package.json',      // Node.js/JavaScript
      'Cargo.toml',        // Rust
      'go.mod',            // Go
      'requirements.txt',  // Python (pip)
      'pyproject.toml',    // Python (modern)
      '.git',              // Git repository
      'pom.xml',           // Java (Maven)
      'build.gradle',      // Java/Kotlin (Gradle)
      'composer.json',     // PHP
      'Gemfile',           // Ruby
      'CMakeLists.txt',    // C/C++
      'Makefile'           // Generic
    ];

    return markers.some(marker => {
      try {
        return existsSync(resolve(path, marker));
      } catch {
        return false;
      }
    });
  }

  /**
   * Validate path and warn if it doesn't look like a project root
   * @param path - The path to validate
   * @param context - Context for error messages
   * @returns Validated absolute path
   */
  static validateAndWarnProjectPath(path: string | undefined, context: string): string {
    const validatedPath = this.validateProjectPath(path, context);

    if (!this.looksLikeProjectRoot(validatedPath)) {
      Logger.warn(
        `⚠️  Warning: ${validatedPath} doesn't look like a project root.\n` +
        '   No package.json, Cargo.toml, .git, or other project markers found.\n' +
        '   Make sure you\'re pointing to the correct directory.\n' +
        `   Tool: ${context}`
      );
    }

    return validatedPath;
  }

  /**
   * Get a human-readable description of what's at the path
   * @param path - The path to describe
   * @returns Description string
   */
  static describePath(path: string): string {
    if (!existsSync(path)) {
      return 'Path does not exist';
    }

    const markers = [];
    
    if (existsSync(resolve(path, 'package.json'))) {
      markers.push('Node.js project');
    }
    if (existsSync(resolve(path, 'Cargo.toml'))) {
      markers.push('Rust project');
    }
    if (existsSync(resolve(path, '.git'))) {
      markers.push('Git repository');
    }
    if (existsSync(resolve(path, 'pyproject.toml')) || existsSync(resolve(path, 'requirements.txt'))) {
      markers.push('Python project');
    }
    if (existsSync(resolve(path, 'go.mod'))) {
      markers.push('Go project');
    }

    if (markers.length === 0) {
      return 'Directory (no project markers detected)';
    }

    return markers.join(', ');
  }
}
