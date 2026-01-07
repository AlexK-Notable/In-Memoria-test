/**
 * CoreAnalysisTools - Common Utilities for MCP Tool Implementations
 *
 * This module extracts common utility functions from MCP tool implementations
 * to ensure DRY principles and consistent behavior across all tools.
 *
 * Features:
 * - File filtering by supported extensions
 * - Language detection from file paths
 * - Path normalization with security validation
 * - Batch processing helpers for async operations
 * - Ignored directory patterns
 *
 * @module CoreAnalysisTools
 */

import { detectLanguageFromPath, EXTENSION_LANGUAGE_MAP, PARSER_SUPPORTED_LANGUAGES } from '../../utils/language-registry.js';
import { PathValidator } from '../../utils/path-validator.js';
import { glob } from 'glob';

// ============================================================================
// Constants
// ============================================================================

/**
 * File extensions that are considered supported code files.
 * Used for filtering files during analysis operations.
 */
export const SUPPORTED_CODE_EXTENSIONS = new Set([
  // TypeScript / JavaScript
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'mts', 'cts',
  // Python
  'py',
  // Rust
  'rs',
  // Go
  'go',
  // Java
  'java',
  // C/C++
  'c', 'cpp', 'cc', 'cxx', 'h', 'hpp', 'hh', 'hxx',
  // C#
  'cs',
  // PHP
  'php', 'phtml',
  // Svelte
  'svelte',
  // Vue
  'vue',
  // SQL
  'sql',
  // Ruby
  'rb',
  // Swift
  'swift',
  // Kotlin
  'kt', 'kts'
]);

/**
 * Directories to ignore during file discovery and analysis.
 * This is the canonical list used across all tools.
 */
export const IGNORED_DIRECTORIES = [
  // Package managers and dependencies
  'node_modules',
  'bower_components',
  'jspm_packages',
  'vendor',

  // Version control
  '.git',
  '.svn',
  '.hg',

  // Build outputs and artifacts
  'dist',
  'build',
  'out',
  'output',
  'target',
  'bin',
  'obj',
  'Debug',
  'Release',

  // Framework-specific build directories
  '.next',
  '.nuxt',
  '.svelte-kit',
  '.vitepress',
  '_site',

  // Static assets and public files
  'public',
  'static',
  'assets',

  // Testing and coverage
  'coverage',
  '.coverage',
  'htmlcov',
  '.pytest_cache',
  '.nyc_output',
  'nyc_output',
  'lib-cov',

  // Python environments and cache
  '__pycache__',
  '.venv',
  'venv',
  'env',
  '.env',

  // Temporary and cache directories
  'tmp',
  'temp',
  '.tmp',
  'cache',
  '.cache',
  'logs',
  '.logs',

  // IDE and editor directories
  '.vscode',
  '.idea',
  '.DS_Store'
];

/**
 * Glob patterns for ignored files during analysis.
 * Complements IGNORED_DIRECTORIES for file-level filtering.
 */
export const IGNORED_FILE_PATTERNS = [
  // Generated/minified files
  '**/*.min.js',
  '**/*.min.css',
  '**/*.bundle.js',
  '**/*.chunk.js',
  '**/*.map',

  // Lock files
  '**/package-lock.json',
  '**/yarn.lock',
  '**/Cargo.lock',
  '**/Gemfile.lock',
  '**/Pipfile.lock',
  '**/poetry.lock'
];

// ============================================================================
// CoreAnalysisTools Class
// ============================================================================

/**
 * Common utility functions for MCP tool implementations.
 * Provides consistent file filtering, language detection, path normalization,
 * and batch processing across all analysis tools.
 */
export class CoreAnalysisTools {
  // ============================================================================
  // File Filtering Methods
  // ============================================================================

  /**
   * Filter a list of file paths to only include supported code files.
   *
   * @param files - Array of file paths to filter
   * @returns Array of file paths that are supported code files
   *
   * @example
   * ```typescript
   * const allFiles = ['main.ts', 'README.md', 'styles.css', 'utils.py'];
   * const codeFiles = CoreAnalysisTools.filterSupportedFiles(allFiles);
   * // Returns: ['main.ts', 'utils.py']
   * ```
   */
  static filterSupportedFiles(files: string[]): string[] {
    return files.filter(file => {
      const ext = this.getFileExtension(file);
      return ext !== null && SUPPORTED_CODE_EXTENSIONS.has(ext);
    });
  }

  /**
   * Check if a file is a supported code file.
   *
   * @param filePath - Path to the file
   * @returns true if the file is a supported code file
   */
  static isSupportedFile(filePath: string): boolean {
    const ext = this.getFileExtension(filePath);
    return ext !== null && SUPPORTED_CODE_EXTENSIONS.has(ext);
  }

  /**
   * Get the file extension from a path (without the leading dot).
   *
   * @param filePath - Path to the file
   * @returns Extension string or null if no extension
   */
  static getFileExtension(filePath: string): string | null {
    const parts = filePath.toLowerCase().split('.');
    if (parts.length < 2) {
      return null;
    }
    return parts.pop() ?? null;
  }

  /**
   * Check if a directory should be ignored during analysis.
   *
   * @param dirName - Name of the directory (not full path)
   * @returns true if directory should be ignored
   */
  static shouldIgnoreDirectory(dirName: string): boolean {
    return IGNORED_DIRECTORIES.includes(dirName) || dirName.startsWith('.');
  }

  /**
   * Get glob ignore patterns for file discovery.
   * Returns patterns suitable for use with the glob library.
   *
   * @returns Array of glob patterns to ignore
   */
  static getIgnorePatterns(): string[] {
    const dirPatterns = IGNORED_DIRECTORIES.map(dir => `**/${dir}/**`);
    return [...dirPatterns, ...IGNORED_FILE_PATTERNS];
  }

  // ============================================================================
  // Language Detection Methods
  // ============================================================================

  /**
   * Detect the programming language from a file path.
   * Uses the canonical language registry for consistent detection.
   *
   * @param filePath - Path to the file
   * @returns Language identifier string (e.g., 'typescript', 'python') or 'unknown'
   *
   * @example
   * ```typescript
   * CoreAnalysisTools.detectLanguage('src/utils.ts');  // Returns: 'typescript'
   * CoreAnalysisTools.detectLanguage('main.py');       // Returns: 'python'
   * CoreAnalysisTools.detectLanguage('README.md');     // Returns: 'unknown'
   * ```
   */
  static detectLanguage(filePath: string): string {
    return detectLanguageFromPath(filePath);
  }

  /**
   * Check if a language has parser support (tree-sitter).
   *
   * @param language - Language identifier
   * @returns true if language has parser support
   */
  static isParserSupported(language: string): boolean {
    return PARSER_SUPPORTED_LANGUAGES.has(language);
  }

  /**
   * Get file extensions for a given language.
   *
   * @param language - Language identifier (e.g., 'typescript', 'python')
   * @returns Comma-separated string of extensions, or default set
   */
  static getFileExtensionsForLanguage(language: string): string {
    const extensions: Record<string, string> = {
      'typescript': 'ts,tsx,mts,cts',
      'javascript': 'js,jsx,mjs,cjs',
      'python': 'py',
      'rust': 'rs',
      'go': 'go',
      'java': 'java',
      'cpp': 'cpp,cc,cxx,hpp,h',
      'c': 'c,h',
      'csharp': 'cs',
      'php': 'php,phtml',
      'ruby': 'rb',
      'swift': 'swift',
      'kotlin': 'kt,kts',
      'svelte': 'svelte',
      'vue': 'vue',
      'sql': 'sql'
    };

    return extensions[language.toLowerCase()] ?? 'ts,js,py,rs';
  }

  /**
   * Get all supported languages.
   *
   * @returns Array of language identifiers
   */
  static getSupportedLanguages(): string[] {
    return [...new Set(Object.values(EXTENSION_LANGUAGE_MAP))];
  }

  // ============================================================================
  // Path Normalization Methods
  // ============================================================================

  /**
   * Normalize a path for consistent handling.
   * Resolves relative paths, removes redundant separators, etc.
   *
   * @param path - The path to normalize
   * @returns Normalized absolute path
   */
  static normalizePath(path: string): string {
    return PathValidator.normalizePath(path);
  }

  /**
   * Validate and normalize a path with security checks.
   *
   * @param path - The path to validate
   * @param basePath - Base directory for security validation (default: cwd)
   * @param options - Validation options
   * @returns Validated normalized path or null if invalid
   */
  static validatePath(
    path: string,
    basePath?: string,
    options?: { requireExists?: boolean }
  ): string | null {
    return PathValidator.validateAndNormalize(path, basePath, options);
  }

  /**
   * Check if a path is safe (no traversal attacks, within bounds).
   *
   * @param path - The path to check
   * @param basePath - Base directory (default: cwd)
   * @returns true if path is safe
   */
  static isPathSafe(path: string, basePath?: string): boolean {
    return PathValidator.isPathSafe(path, basePath);
  }

  // ============================================================================
  // Batch Processing Helpers
  // ============================================================================

  /**
   * Process items in batches with async operations.
   * Useful for parallel processing with controlled concurrency.
   *
   * @param items - Array of items to process
   * @param processor - Async function to process each item
   * @param batchSize - Number of items to process in parallel (default: 10)
   *
   * @example
   * ```typescript
   * const files = ['file1.ts', 'file2.ts', 'file3.ts'];
   * await CoreAnalysisTools.processBatch(
   *   files,
   *   async (file) => { await analyzeFile(file); },
   *   5
   * );
   * ```
   */
  static async processBatch<T>(
    items: T[],
    processor: (item: T) => Promise<void>,
    batchSize: number = 10
  ): Promise<void> {
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      await Promise.all(batch.map(processor));
    }
  }

  /**
   * Process items in batches and collect results.
   *
   * @param items - Array of items to process
   * @param processor - Async function that returns a result
   * @param batchSize - Number of items to process in parallel (default: 10)
   * @returns Array of results in order
   */
  static async processBatchWithResults<T, R>(
    items: T[],
    processor: (item: T) => Promise<R>,
    batchSize: number = 10
  ): Promise<R[]> {
    const results: R[] = [];

    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const batchResults = await Promise.all(batch.map(processor));
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Process items in batches with error handling.
   * Continues processing even if some items fail.
   *
   * @param items - Array of items to process
   * @param processor - Async function to process each item
   * @param batchSize - Number of items to process in parallel
   * @returns Object with successful and failed counts
   */
  static async processBatchSafe<T>(
    items: T[],
    processor: (item: T) => Promise<void>,
    batchSize: number = 10
  ): Promise<{ successful: number; failed: number; errors: Error[] }> {
    let successful = 0;
    let failed = 0;
    const errors: Error[] = [];

    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const results = await Promise.allSettled(batch.map(processor));

      for (const result of results) {
        if (result.status === 'fulfilled') {
          successful++;
        } else {
          failed++;
          errors.push(result.reason);
        }
      }
    }

    return { successful, failed, errors };
  }

  // ============================================================================
  // File Discovery Helpers
  // ============================================================================

  /**
   * Discover code files in a directory using glob patterns.
   *
   * @param directory - Directory to search
   * @param options - Discovery options
   * @returns Array of discovered file paths
   */
  static async discoverCodeFiles(
    directory: string,
    options: {
      language?: string;
      includePatterns?: string[];
      recursive?: boolean;
    } = {}
  ): Promise<string[]> {
    const { language, includePatterns, recursive = true } = options;

    let pattern: string;
    if (includePatterns && includePatterns.length > 0) {
      pattern = includePatterns.length === 1
        ? includePatterns[0]
        : `{${includePatterns.join(',')}}`;
    } else if (language) {
      const extensions = this.getFileExtensionsForLanguage(language);
      pattern = `**/*.{${extensions}}`;
    } else {
      // All supported code files
      const allExtensions = [...SUPPORTED_CODE_EXTENSIONS].join(',');
      pattern = `**/*.{${allExtensions}}`;
    }

    if (!recursive) {
      pattern = pattern.replace('**/', '');
    }

    const files = await glob(pattern, {
      cwd: directory,
      ignore: this.getIgnorePatterns(),
      absolute: true,
      nodir: true
    });

    return files;
  }

  /**
   * Count files in a directory, categorized by type.
   *
   * @param directory - Directory to count
   * @returns Object with total and code file counts
   */
  static async countFiles(directory: string): Promise<{
    total: number;
    codeFiles: number;
    byLanguage: Record<string, number>;
  }> {
    const allFiles = await glob('**/*', {
      cwd: directory,
      ignore: this.getIgnorePatterns(),
      nodir: true
    });

    const codeFiles = this.filterSupportedFiles(allFiles);
    const byLanguage: Record<string, number> = {};

    for (const file of codeFiles) {
      const language = this.detectLanguage(file);
      byLanguage[language] = (byLanguage[language] || 0) + 1;
    }

    return {
      total: allFiles.length,
      codeFiles: codeFiles.length,
      byLanguage
    };
  }
}
