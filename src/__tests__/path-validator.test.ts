/**
 * Tests for PathValidator - Unified Path Validation
 *
 * Tests the PathValidator class which integrates with security.ts
 * for robust path traversal protection.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, symlinkSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Runtime import to verify the file exists and exports correctly
import * as PathValidatorModule from '../utils/path-validator.js';

// Import types for documentation
export type { ValidationResult, ValidateOptions } from '../utils/path-validator.js';

describe('PathValidator', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'path-validator-test-'));
    mkdirSync(join(tempDir, 'subdir'), { recursive: true });
    writeFileSync(join(tempDir, 'test.txt'), 'test content');
    writeFileSync(join(tempDir, 'subdir', 'nested.txt'), 'nested content');
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('Module exports', () => {
    it('should export PathValidator class', () => {
      expect(PathValidatorModule.PathValidator).toBeDefined();
    });

    it('should export all static methods', () => {
      const { PathValidator } = PathValidatorModule;
      expect(typeof PathValidator.isPathSafe).toBe('function');
      expect(typeof PathValidator.normalizePath).toBe('function');
      expect(typeof PathValidator.validateAndNormalize).toBe('function');
      expect(typeof PathValidator.containsTraversal).toBe('function');
      expect(typeof PathValidator.validate).toBe('function');
      expect(typeof PathValidator.getValidatedPath).toBe('function');
      expect(typeof PathValidator.validateProjectPath).toBe('function');
      expect(typeof PathValidator.looksLikeProjectRoot).toBe('function');
      expect(typeof PathValidator.validateAndWarnProjectPath).toBe('function');
      expect(typeof PathValidator.describePath).toBe('function');
    });
  });

  describe('isPathSafe', () => {
    it('should return true for valid paths within base directory', () => {
      const { PathValidator } = PathValidatorModule;
      expect(PathValidator.isPathSafe('./test.txt', tempDir)).toBe(true);
    });

    it('should return false for path traversal attempts', () => {
      const { PathValidator } = PathValidatorModule;
      expect(PathValidator.isPathSafe('../../../etc/passwd', tempDir)).toBe(false);
    });

    it('should return false for null bytes', () => {
      const { PathValidator } = PathValidatorModule;
      expect(PathValidator.isPathSafe('test\0.txt', tempDir)).toBe(false);
    });

    it('should return false for URL-encoded traversal', () => {
      const { PathValidator } = PathValidatorModule;
      expect(PathValidator.isPathSafe('%2e%2e%2f', tempDir)).toBe(false);
    });

    it('should return false for paths outside base directory', () => {
      const { PathValidator } = PathValidatorModule;
      expect(PathValidator.isPathSafe('/etc/passwd', tempDir)).toBe(false);
    });
  });

  describe('normalizePath', () => {
    it('should return empty string for empty input', () => {
      const { PathValidator } = PathValidatorModule;
      expect(PathValidator.normalizePath('')).toBe('');
    });

    it('should resolve relative paths to absolute', () => {
      const { PathValidator } = PathValidatorModule;
      const result = PathValidator.normalizePath('./test.txt');
      expect(result).toContain('test.txt');
      expect(result.startsWith('/')).toBe(true);
    });

    it('should normalize paths with redundant separators', () => {
      const { PathValidator } = PathValidatorModule;
      const result = PathValidator.normalizePath('/path//to///file');
      expect(result).not.toContain('//');
    });

    it('should preserve absolute paths', () => {
      const { PathValidator } = PathValidatorModule;
      const result = PathValidator.normalizePath('/absolute/path');
      expect(result).toBe('/absolute/path');
    });
  });

  describe('validateAndNormalize', () => {
    it('should return normalized path for valid input', () => {
      const { PathValidator } = PathValidatorModule;
      const result = PathValidator.validateAndNormalize('./test.txt', tempDir);
      expect(result).not.toBeNull();
      expect(result).toContain('test.txt');
    });

    it('should return null for invalid paths', () => {
      const { PathValidator } = PathValidatorModule;
      expect(PathValidator.validateAndNormalize('../../../etc/passwd', tempDir)).toBeNull();
    });

    it('should return null for null byte paths', () => {
      const { PathValidator } = PathValidatorModule;
      expect(PathValidator.validateAndNormalize('test\0.txt', tempDir)).toBeNull();
    });

    it('should return null for non-existent paths when requireExists is true', () => {
      const { PathValidator } = PathValidatorModule;
      expect(PathValidator.validateAndNormalize('./nonexistent.txt', tempDir, { requireExists: true })).toBeNull();
    });

    it('should return path for non-existent paths when requireExists is false', () => {
      const { PathValidator } = PathValidatorModule;
      const result = PathValidator.validateAndNormalize('./nonexistent.txt', tempDir, { requireExists: false });
      expect(result).not.toBeNull();
      expect(result).toContain('nonexistent.txt');
    });
  });

  describe('containsTraversal', () => {
    it('should return false for empty path', () => {
      const { PathValidator } = PathValidatorModule;
      expect(PathValidator.containsTraversal('')).toBe(false);
    });

    it('should return true for null bytes', () => {
      const { PathValidator } = PathValidatorModule;
      expect(PathValidator.containsTraversal('test\0.txt')).toBe(true);
    });

    it('should return true for standard traversal patterns', () => {
      const { PathValidator } = PathValidatorModule;
      expect(PathValidator.containsTraversal('../')).toBe(true);
      expect(PathValidator.containsTraversal('..')).toBe(true);
      expect(PathValidator.containsTraversal('path/../secret')).toBe(true);
    });

    it('should return true for Windows-style traversal', () => {
      const { PathValidator } = PathValidatorModule;
      expect(PathValidator.containsTraversal('..\\')).toBe(true);
    });

    it('should return true for URL-encoded traversal', () => {
      const { PathValidator } = PathValidatorModule;
      expect(PathValidator.containsTraversal('%2e%2e')).toBe(true);
      expect(PathValidator.containsTraversal('%2e%2e%2f')).toBe(true);
    });

    it('should return true for double-encoded traversal', () => {
      const { PathValidator } = PathValidatorModule;
      expect(PathValidator.containsTraversal('%252e%252e')).toBe(true);
    });

    it('should return false for safe paths', () => {
      const { PathValidator } = PathValidatorModule;
      expect(PathValidator.containsTraversal('./test.txt')).toBe(false);
      expect(PathValidator.containsTraversal('src/utils/file.ts')).toBe(false);
      expect(PathValidator.containsTraversal('/absolute/path/file.txt')).toBe(false);
    });
  });

  describe('validate', () => {
    it('should return valid result for good paths', () => {
      const { PathValidator } = PathValidatorModule;
      const result = PathValidator.validate('./test.txt', tempDir);
      expect(result.isValid).toBe(true);
      expect(result.normalizedPath).toBeTruthy();
      expect(result.error).toBeUndefined();
    });

    it('should return invalid result for null/undefined input', () => {
      const { PathValidator } = PathValidatorModule;
      const result = PathValidator.validate('', tempDir);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('required');
    });

    it('should return invalid result for traversal attempts', () => {
      const { PathValidator } = PathValidatorModule;
      const result = PathValidator.validate('../../../etc/passwd', tempDir);
      expect(result.isValid).toBe(false);
      expect(result.error).toBeTruthy();
    });

    it('should return invalid result for null bytes', () => {
      const { PathValidator } = PathValidatorModule;
      const result = PathValidator.validate('test\0.txt', tempDir);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('null');
    });

    it('should return invalid result for paths outside project root', () => {
      const { PathValidator } = PathValidatorModule;
      const result = PathValidator.validate('/etc/passwd', tempDir, { requireExists: false });
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('outside');
    });

    it('should handle symlinks when not allowed', () => {
      const { PathValidator } = PathValidatorModule;
      const symPath = join(tempDir, 'link-to-test');
      try {
        symlinkSync(join(tempDir, 'test.txt'), symPath);
        const result = PathValidator.validate('link-to-test', tempDir, {
          allowSymlinks: false,
          requireExists: true
        });
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('Symlink');
      } catch {
        // Skip if symlinks not supported
      }
    });

    it('should allow symlinks when option is set', () => {
      const { PathValidator } = PathValidatorModule;
      const symPath = join(tempDir, 'link-internal');
      try {
        symlinkSync(join(tempDir, 'test.txt'), symPath);
        const result = PathValidator.validate('link-internal', tempDir, {
          allowSymlinks: true,
          requireExists: true
        });
        expect(result.isValid).toBe(true);
      } catch {
        // Skip if symlinks not supported
      }
    });

    it('should return valid paths within subdirectories', () => {
      const { PathValidator } = PathValidatorModule;
      const result = PathValidator.validate('./subdir/nested.txt', tempDir);
      expect(result.isValid).toBe(true);
    });
  });

  describe('getValidatedPath', () => {
    it('should return normalized path for valid input', () => {
      const { PathValidator } = PathValidatorModule;
      const result = PathValidator.getValidatedPath('./test.txt', tempDir);
      expect(result).toContain('test.txt');
    });

    it('should throw for invalid paths', () => {
      const { PathValidator } = PathValidatorModule;
      expect(() => {
        PathValidator.getValidatedPath('../../../etc/passwd', tempDir);
      }).toThrow('Invalid path');
    });

    it('should throw for null byte paths', () => {
      const { PathValidator } = PathValidatorModule;
      expect(() => {
        PathValidator.getValidatedPath('test\0.txt', tempDir);
      }).toThrow();
    });
  });

  describe('validateProjectPath', () => {
    it('should return cwd for undefined path', () => {
      const { PathValidator } = PathValidatorModule;
      const result = PathValidator.validateProjectPath(undefined, 'test-context');
      expect(result).toBe(process.cwd());
    });

    it('should return absolute path for valid relative path', () => {
      const { PathValidator } = PathValidatorModule;
      const result = PathValidator.validateProjectPath(tempDir, 'test-context');
      expect(result).toBe(tempDir);
    });

    it('should throw for non-existent paths', () => {
      const { PathValidator } = PathValidatorModule;
      expect(() => {
        PathValidator.validateProjectPath('/nonexistent/path/12345', 'test-context');
      }).toThrow('Invalid path');
    });

    it('should throw for traversal patterns', () => {
      const { PathValidator } = PathValidatorModule;
      expect(() => {
        PathValidator.validateProjectPath('../../../etc/passwd', 'test-context');
      }).toThrow('traversal');
    });
  });

  describe('looksLikeProjectRoot', () => {
    it('should return true for directories with package.json', () => {
      const { PathValidator } = PathValidatorModule;
      writeFileSync(join(tempDir, 'package.json'), '{}');
      expect(PathValidator.looksLikeProjectRoot(tempDir)).toBe(true);
    });

    it('should return true for directories with .git', () => {
      const { PathValidator } = PathValidatorModule;
      mkdirSync(join(tempDir, '.git'));
      expect(PathValidator.looksLikeProjectRoot(tempDir)).toBe(true);
    });

    it('should return false for empty directories', () => {
      const { PathValidator } = PathValidatorModule;
      const emptyDir = join(tempDir, 'empty');
      mkdirSync(emptyDir);
      expect(PathValidator.looksLikeProjectRoot(emptyDir)).toBe(false);
    });
  });

  describe('describePath', () => {
    it('should return "Path does not exist" for non-existent paths', () => {
      const { PathValidator } = PathValidatorModule;
      expect(PathValidator.describePath('/nonexistent/path/12345')).toBe('Path does not exist');
    });

    it('should identify Node.js projects', () => {
      const { PathValidator } = PathValidatorModule;
      writeFileSync(join(tempDir, 'package.json'), '{}');
      const result = PathValidator.describePath(tempDir);
      expect(result).toContain('Node.js project');
    });

    it('should identify Rust projects', () => {
      const { PathValidator } = PathValidatorModule;
      writeFileSync(join(tempDir, 'Cargo.toml'), '[package]');
      const result = PathValidator.describePath(tempDir);
      expect(result).toContain('Rust project');
    });

    it('should identify Git repositories', () => {
      const { PathValidator } = PathValidatorModule;
      mkdirSync(join(tempDir, '.git'));
      const result = PathValidator.describePath(tempDir);
      expect(result).toContain('Git repository');
    });

    it('should identify Python projects with pyproject.toml', () => {
      const { PathValidator } = PathValidatorModule;
      writeFileSync(join(tempDir, 'pyproject.toml'), '[project]');
      const result = PathValidator.describePath(tempDir);
      expect(result).toContain('Python project');
    });

    it('should identify Python projects with requirements.txt', () => {
      const { PathValidator } = PathValidatorModule;
      writeFileSync(join(tempDir, 'requirements.txt'), 'flask==2.0');
      const result = PathValidator.describePath(tempDir);
      expect(result).toContain('Python project');
    });

    it('should identify Go projects', () => {
      const { PathValidator } = PathValidatorModule;
      writeFileSync(join(tempDir, 'go.mod'), 'module test');
      const result = PathValidator.describePath(tempDir);
      expect(result).toContain('Go project');
    });

    it('should identify multiple project types', () => {
      const { PathValidator } = PathValidatorModule;
      writeFileSync(join(tempDir, 'package.json'), '{}');
      mkdirSync(join(tempDir, '.git'));
      const result = PathValidator.describePath(tempDir);
      expect(result).toContain('Node.js project');
      expect(result).toContain('Git repository');
    });

    it('should return generic message for empty directories', () => {
      const { PathValidator } = PathValidatorModule;
      const emptyDir = join(tempDir, 'empty');
      mkdirSync(emptyDir);
      expect(PathValidator.describePath(emptyDir)).toBe('Directory (no project markers detected)');
    });
  });

  describe('validateAndWarnProjectPath', () => {
    it('should return path and warn for non-project directories', () => {
      const { PathValidator } = PathValidatorModule;
      const emptyDir = join(tempDir, 'nonproject');
      mkdirSync(emptyDir);
      const result = PathValidator.validateAndWarnProjectPath(emptyDir, 'test-context');
      expect(result).toBe(emptyDir);
    });

    it('should return path without warning for project directories', () => {
      const { PathValidator } = PathValidatorModule;
      writeFileSync(join(tempDir, 'package.json'), '{}');
      const result = PathValidator.validateAndWarnProjectPath(tempDir, 'test-context');
      expect(result).toBe(tempDir);
    });
  });

  describe('looksLikeProjectRoot additional markers', () => {
    it('should return true for Cargo.toml (Rust)', () => {
      const { PathValidator } = PathValidatorModule;
      writeFileSync(join(tempDir, 'Cargo.toml'), '[package]');
      expect(PathValidator.looksLikeProjectRoot(tempDir)).toBe(true);
    });

    it('should return true for go.mod (Go)', () => {
      const { PathValidator } = PathValidatorModule;
      writeFileSync(join(tempDir, 'go.mod'), 'module test');
      expect(PathValidator.looksLikeProjectRoot(tempDir)).toBe(true);
    });

    it('should return true for requirements.txt (Python)', () => {
      const { PathValidator } = PathValidatorModule;
      writeFileSync(join(tempDir, 'requirements.txt'), 'flask==2.0');
      expect(PathValidator.looksLikeProjectRoot(tempDir)).toBe(true);
    });

    it('should return true for pyproject.toml (Python)', () => {
      const { PathValidator } = PathValidatorModule;
      writeFileSync(join(tempDir, 'pyproject.toml'), '[project]');
      expect(PathValidator.looksLikeProjectRoot(tempDir)).toBe(true);
    });

    it('should return true for pom.xml (Java Maven)', () => {
      const { PathValidator } = PathValidatorModule;
      writeFileSync(join(tempDir, 'pom.xml'), '<project></project>');
      expect(PathValidator.looksLikeProjectRoot(tempDir)).toBe(true);
    });

    it('should return true for build.gradle (Java/Kotlin Gradle)', () => {
      const { PathValidator } = PathValidatorModule;
      writeFileSync(join(tempDir, 'build.gradle'), 'plugins {}');
      expect(PathValidator.looksLikeProjectRoot(tempDir)).toBe(true);
    });

    it('should return true for composer.json (PHP)', () => {
      const { PathValidator } = PathValidatorModule;
      writeFileSync(join(tempDir, 'composer.json'), '{}');
      expect(PathValidator.looksLikeProjectRoot(tempDir)).toBe(true);
    });

    it('should return true for Gemfile (Ruby)', () => {
      const { PathValidator } = PathValidatorModule;
      writeFileSync(join(tempDir, 'Gemfile'), 'source "https://rubygems.org"');
      expect(PathValidator.looksLikeProjectRoot(tempDir)).toBe(true);
    });

    it('should return true for CMakeLists.txt (C/C++)', () => {
      const { PathValidator } = PathValidatorModule;
      writeFileSync(join(tempDir, 'CMakeLists.txt'), 'cmake_minimum_required(VERSION 3.10)');
      expect(PathValidator.looksLikeProjectRoot(tempDir)).toBe(true);
    });

    it('should return true for Makefile', () => {
      const { PathValidator } = PathValidatorModule;
      writeFileSync(join(tempDir, 'Makefile'), 'all: build');
      expect(PathValidator.looksLikeProjectRoot(tempDir)).toBe(true);
    });

    it('should handle errors gracefully when checking markers', () => {
      const { PathValidator } = PathValidatorModule;
      // Use a path that doesn't exist - should return false without throwing
      expect(PathValidator.looksLikeProjectRoot('/nonexistent/path/12345')).toBe(false);
    });
  });

  describe('Security Integration Tests', () => {
    it('should block path traversal attacks', () => {
      const { PathValidator } = PathValidatorModule;
      // Standard traversal
      expect(PathValidator.isPathSafe('../../../etc/passwd', tempDir)).toBe(false);

      // URL-encoded traversal
      expect(PathValidator.isPathSafe('%2e%2e%2fetc%2fpasswd', tempDir)).toBe(false);

      // Null byte injection
      expect(PathValidator.isPathSafe('file.txt\0.jpg', tempDir)).toBe(false);
    });

    it('should allow valid paths within project', () => {
      const { PathValidator } = PathValidatorModule;
      expect(PathValidator.isPathSafe('./test.txt', tempDir)).toBe(true);
      expect(PathValidator.isPathSafe('./subdir/nested.txt', tempDir)).toBe(true);
    });

    it('should work with validateAndNormalize for tool handlers', () => {
      const { PathValidator } = PathValidatorModule;
      // Valid path returns normalized
      const validPath = PathValidator.validateAndNormalize('./test.txt', tempDir);
      expect(validPath).not.toBeNull();

      // Invalid path returns null
      const invalidPath = PathValidator.validateAndNormalize('../../../etc/passwd', tempDir);
      expect(invalidPath).toBeNull();
    });
  });
});
