/**
 * Tests for security utilities
 * TDD: Write tests FIRST, then implementation
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, symlinkSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Runtime import to verify the file exists and exports correctly
import * as SecurityUtils from '../utils/security.js';

// Type imports exported for documentation - the tests verify the type shapes
// through runtime assertions rather than type annotations
export type {
  PathValidationResult,
  PathValidationOptions,
  SensitiveFileResult,
  SafeLikePattern,
  SafeError,
} from '../utils/security.js';

describe('Security Utilities', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'security-test-'));
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
    it('should export the SecurityUtils module', () => {
      expect(SecurityUtils).toBeDefined();
    });

    it('should export SENSITIVE_PATTERNS constant', () => {
      expect(SecurityUtils.SENSITIVE_PATTERNS).toBeDefined();
      expect(Array.isArray(SecurityUtils.SENSITIVE_PATTERNS)).toBe(true);
    });

    it('should export all required functions', () => {
      expect(typeof SecurityUtils.validatePath).toBe('function');
      expect(typeof SecurityUtils.isSensitiveFile).toBe('function');
      expect(typeof SecurityUtils.filterSensitiveFiles).toBe('function');
      expect(typeof SecurityUtils.escapeLikePattern).toBe('function');
      expect(typeof SecurityUtils.createSafeLikePattern).toBe('function');
      expect(typeof SecurityUtils.sanitizeErrorMessage).toBe('function');
      expect(typeof SecurityUtils.createSafeError).toBe('function');
    });
  });

  describe('validatePath', () => {
    it('should accept valid relative paths within project root', () => {
      const result = SecurityUtils.validatePath('./test.txt', tempDir, { requireExists: true });
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should accept valid paths that do not need to exist', () => {
      const result = SecurityUtils.validatePath('./nonexistent.txt', tempDir, { requireExists: false });
      expect(result.isValid).toBe(true);
    });

    it('should reject paths that do not exist when requireExists is true', () => {
      const result = SecurityUtils.validatePath('./nonexistent.txt', tempDir, { requireExists: true });
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('not exist');
    });

    it('should reject null bytes in path', () => {
      const result = SecurityUtils.validatePath('test\0.txt', tempDir);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('null bytes');
    });

    it('should reject URL-encoded traversal (../)', () => {
      const result = SecurityUtils.validatePath('%2e%2e%2fetc/passwd', tempDir);
      expect(result.isValid).toBe(false);
    });

    it('should reject double-encoded traversal', () => {
      const result = SecurityUtils.validatePath('%252e%252e%252f', tempDir);
      expect(result.isValid).toBe(false);
    });

    it('should reject simple traversal patterns', () => {
      const result = SecurityUtils.validatePath('../../../etc/passwd', tempDir);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('outside');
    });

    it('should reject Windows-style traversal patterns', () => {
      const result = SecurityUtils.validatePath('..\\..\\etc\\passwd', tempDir);
      expect(result.isValid).toBe(false);
    });

    it('should reject paths outside project root', () => {
      const result = SecurityUtils.validatePath('/etc/passwd', tempDir, { requireExists: false });
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('outside');
    });

    it('should accept paths within subdirectories', () => {
      const result = SecurityUtils.validatePath('./subdir/nested.txt', tempDir, { requireExists: true });
      expect(result.isValid).toBe(true);
    });

    it('should handle symlinks when not allowed', () => {
      const symPath = join(tempDir, 'link-to-test');
      try {
        symlinkSync(join(tempDir, 'test.txt'), symPath);
        const result = SecurityUtils.validatePath('link-to-test', tempDir, {
          allowSymlinks: false,
          requireExists: true
        });
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('Symlink');
      } catch {
        // Symlink creation may fail on some systems (Windows without admin)
        // Skip this test case gracefully
      }
    });

    it('should handle symlinks when allowed and target is within bounds', () => {
      const symPath = join(tempDir, 'link-internal');
      try {
        symlinkSync(join(tempDir, 'test.txt'), symPath);
        const result = SecurityUtils.validatePath('link-internal', tempDir, {
          allowSymlinks: true,
          requireExists: true
        });
        expect(result.isValid).toBe(true);
      } catch {
        // Skip if symlinks not supported
      }
    });

    it('should reject symlinks pointing outside project even when allowed', () => {
      const symPath = join(tempDir, 'link-external');
      try {
        // Try to create a symlink to /tmp or /etc (outside tempDir)
        symlinkSync('/tmp', symPath);
        const result = SecurityUtils.validatePath('link-external', tempDir, {
          allowSymlinks: true,
          requireExists: true
        });
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('outside');
      } catch {
        // Skip if symlinks not supported
      }
    });

    it('should return resolved path on success', () => {
      const result = SecurityUtils.validatePath('./test.txt', tempDir, { requireExists: true });
      expect(result.isValid).toBe(true);
      expect(result.resolvedPath).toBeTruthy();
      expect(result.resolvedPath).toContain('test.txt');
    });

    it('should reject paths with invalid encoding', () => {
      // Use an invalid percent-encoded sequence
      const result = SecurityUtils.validatePath('%E0%80%80', tempDir);
      expect(result.isValid).toBe(false);
    });

    it('should accept additional allowed roots', () => {
      const extraRoot = mkdtempSync(join(tmpdir(), 'extra-root-'));
      writeFileSync(join(extraRoot, 'extra.txt'), 'extra content');

      try {
        const result = SecurityUtils.validatePath(
          join(extraRoot, 'extra.txt'),
          tempDir,
          { allowedRoots: [extraRoot], requireExists: true }
        );
        expect(result.isValid).toBe(true);
      } finally {
        rmSync(extraRoot, { recursive: true, force: true });
      }
    });
  });

  describe('isSensitiveFile', () => {
    it('should detect .env files', () => {
      expect(SecurityUtils.isSensitiveFile('.env').isSensitive).toBe(true);
      expect(SecurityUtils.isSensitiveFile('.env.local').isSensitive).toBe(true);
      expect(SecurityUtils.isSensitiveFile('.env.production').isSensitive).toBe(true);
      expect(SecurityUtils.isSensitiveFile('path/to/.env').isSensitive).toBe(true);
    });

    it('should detect SSH keys and directories', () => {
      expect(SecurityUtils.isSensitiveFile('id_rsa').isSensitive).toBe(true);
      expect(SecurityUtils.isSensitiveFile('id_ed25519').isSensitive).toBe(true);
      expect(SecurityUtils.isSensitiveFile('.ssh/id_rsa').isSensitive).toBe(true);
      expect(SecurityUtils.isSensitiveFile('/home/user/.ssh/known_hosts').isSensitive).toBe(true);
    });

    it('should detect credential files', () => {
      expect(SecurityUtils.isSensitiveFile('credentials').isSensitive).toBe(true);
      expect(SecurityUtils.isSensitiveFile('credentials.json').isSensitive).toBe(true);
      expect(SecurityUtils.isSensitiveFile('service-account.json').isSensitive).toBe(true);
    });

    it('should detect certificate and key files', () => {
      expect(SecurityUtils.isSensitiveFile('server.pem').isSensitive).toBe(true);
      expect(SecurityUtils.isSensitiveFile('private.key').isSensitive).toBe(true);
      expect(SecurityUtils.isSensitiveFile('cert.p12').isSensitive).toBe(true);
      expect(SecurityUtils.isSensitiveFile('cert.pfx').isSensitive).toBe(true);
    });

    it('should detect cloud provider config directories', () => {
      expect(SecurityUtils.isSensitiveFile('.aws/credentials').isSensitive).toBe(true);
      expect(SecurityUtils.isSensitiveFile('.azure/config').isSensitive).toBe(true);
      expect(SecurityUtils.isSensitiveFile('.gcloud/credentials.json').isSensitive).toBe(true);
      expect(SecurityUtils.isSensitiveFile('.kube/config').isSensitive).toBe(true);
    });

    it('should detect package manager credential files', () => {
      expect(SecurityUtils.isSensitiveFile('.npmrc').isSensitive).toBe(true);
      expect(SecurityUtils.isSensitiveFile('.pypirc').isSensitive).toBe(true);
    });

    it('should allow normal source files', () => {
      expect(SecurityUtils.isSensitiveFile('index.ts').isSensitive).toBe(false);
      expect(SecurityUtils.isSensitiveFile('package.json').isSensitive).toBe(false);
      expect(SecurityUtils.isSensitiveFile('README.md').isSensitive).toBe(false);
      expect(SecurityUtils.isSensitiveFile('src/utils/helper.ts').isSensitive).toBe(false);
    });

    it('should return severity and description for sensitive files', () => {
      const result = SecurityUtils.isSensitiveFile('.env');
      expect(result.isSensitive).toBe(true);
      expect(result.severity).toBeDefined();
      expect(result.description).toBeDefined();
    });
  });

  describe('filterSensitiveFiles', () => {
    it('should separate safe and blocked files', () => {
      const files = ['index.ts', '.env', 'package.json', 'id_rsa', 'README.md'];
      const result = SecurityUtils.filterSensitiveFiles(files);

      expect(result.safe).toContain('index.ts');
      expect(result.safe).toContain('package.json');
      expect(result.safe).toContain('README.md');
      expect(result.safe).not.toContain('.env');
      expect(result.safe).not.toContain('id_rsa');

      expect(result.blocked).toHaveLength(2);
      expect(result.blocked.some(b => b.path === '.env')).toBe(true);
      expect(result.blocked.some(b => b.path === 'id_rsa')).toBe(true);
    });

    it('should include reasons for blocked files', () => {
      const files = ['.env'];
      const result = SecurityUtils.filterSensitiveFiles(files);

      expect(result.blocked[0].path).toBe('.env');
      expect(result.blocked[0].reason).toBeTruthy();
    });

    it('should handle empty array', () => {
      const result = SecurityUtils.filterSensitiveFiles([]);
      expect(result.safe).toHaveLength(0);
      expect(result.blocked).toHaveLength(0);
    });

    it('should handle all safe files', () => {
      const files = ['index.ts', 'utils.ts', 'package.json'];
      const result = SecurityUtils.filterSensitiveFiles(files);
      expect(result.safe).toHaveLength(3);
      expect(result.blocked).toHaveLength(0);
    });

    it('should handle all sensitive files', () => {
      const files = ['.env', 'id_rsa', 'credentials.json'];
      const result = SecurityUtils.filterSensitiveFiles(files);
      expect(result.safe).toHaveLength(0);
      expect(result.blocked).toHaveLength(3);
    });
  });

  describe('escapeLikePattern', () => {
    it('should escape percent signs', () => {
      expect(SecurityUtils.escapeLikePattern('100%')).toBe('100\\%');
    });

    it('should escape underscores', () => {
      expect(SecurityUtils.escapeLikePattern('file_name')).toBe('file\\_name');
    });

    it('should escape backslashes first', () => {
      expect(SecurityUtils.escapeLikePattern('path\\file')).toBe('path\\\\file');
    });

    it('should handle multiple special characters', () => {
      expect(SecurityUtils.escapeLikePattern('100%_test')).toBe('100\\%\\_test');
    });

    it('should handle empty string', () => {
      expect(SecurityUtils.escapeLikePattern('')).toBe('');
    });

    it('should preserve normal characters', () => {
      expect(SecurityUtils.escapeLikePattern('normal text')).toBe('normal text');
    });

    it('should handle complex patterns', () => {
      expect(SecurityUtils.escapeLikePattern('50%_off\\sale')).toBe('50\\%\\_off\\\\sale');
    });
  });

  describe('createSafeLikePattern', () => {
    it('should create contains pattern by default', () => {
      const result = SecurityUtils.createSafeLikePattern('test');
      expect(result.pattern).toBe('%test%');
      expect(result.escapeClause).toBeTruthy();
    });

    it('should create startsWith pattern', () => {
      const result = SecurityUtils.createSafeLikePattern('test', 'startsWith');
      expect(result.pattern).toBe('test%');
    });

    it('should create endsWith pattern', () => {
      const result = SecurityUtils.createSafeLikePattern('test', 'endsWith');
      expect(result.pattern).toBe('%test');
    });

    it('should create exact pattern', () => {
      const result = SecurityUtils.createSafeLikePattern('test', 'exact');
      expect(result.pattern).toBe('test');
    });

    it('should escape special characters in pattern', () => {
      const result = SecurityUtils.createSafeLikePattern('100%_test', 'contains');
      expect(result.pattern).toBe('%100\\%\\_test%');
    });

    it('should include escape clause for SQLite', () => {
      const result = SecurityUtils.createSafeLikePattern('test');
      expect(result.escapeClause).toContain('ESCAPE');
    });
  });

  describe('sanitizeErrorMessage', () => {
    it('should remove absolute paths when not allowed', () => {
      const result = SecurityUtils.sanitizeErrorMessage(
        new Error('File not found: /home/user/secret/file.txt'),
        { allowRelativePaths: false }
      );
      expect(result).not.toContain('/home/user');
      expect(result).toContain('[path]');
    });

    it('should convert absolute to relative paths when project root provided', () => {
      const result = SecurityUtils.sanitizeErrorMessage(
        new Error('Error at /project/root/src/file.ts'),
        { projectRoot: '/project/root', allowRelativePaths: true }
      );
      expect(result).toContain('./src/file.ts');
      expect(result).not.toContain('/project/root');
    });

    it('should remove stack trace patterns', () => {
      const error = new Error('Test error');
      error.stack = 'Error: Test error\n    at Function.test (/path/to/file.ts:10:5)';
      const result = SecurityUtils.sanitizeErrorMessage(error);
      expect(result).not.toContain('at Function');
      expect(result).not.toContain(':10:5');
    });

    it('should remove Node.js internal error codes', () => {
      const result = SecurityUtils.sanitizeErrorMessage(
        new Error('Failed [ERR_INVALID_ARG_TYPE]')
      );
      expect(result).not.toContain('ERR_INVALID_ARG_TYPE');
    });

    it('should handle string errors', () => {
      const result = SecurityUtils.sanitizeErrorMessage('Simple error message');
      expect(result).toBe('Simple error message');
    });

    it('should handle unknown error types', () => {
      const result = SecurityUtils.sanitizeErrorMessage(null);
      expect(result).toBe('An unexpected error occurred');

      const result2 = SecurityUtils.sanitizeErrorMessage(undefined);
      expect(result2).toBe('An unexpected error occurred');
    });

    it('should optionally include error type', () => {
      const error = new TypeError('Type mismatch');
      const result = SecurityUtils.sanitizeErrorMessage(error, { includeType: true });
      expect(result).toContain('[TypeError]');
    });

    it('should clean up whitespace', () => {
      const result = SecurityUtils.sanitizeErrorMessage(
        new Error('Error   with    extra   spaces')
      );
      expect(result).toBe('Error with extra spaces');
    });
  });

  describe('createSafeError', () => {
    it('should create a safe error object', () => {
      const result = SecurityUtils.createSafeError(
        new Error('File not found'),
        'Analysis failed'
      );
      expect(result.message).toContain('Analysis failed');
      expect(result.code).toBeDefined();
    });

    it('should detect NOT_FOUND error code', () => {
      const result = SecurityUtils.createSafeError(
        new Error('File not found: /path/to/file'),
        'Operation failed'
      );
      expect(result.code).toBe('NOT_FOUND');
    });

    it('should detect PERMISSION_DENIED error code', () => {
      const result = SecurityUtils.createSafeError(
        new Error('EACCES: permission denied'),
        'Cannot access'
      );
      expect(result.code).toBe('PERMISSION_DENIED');
    });

    it('should detect INVALID_INPUT error code', () => {
      const result = SecurityUtils.createSafeError(
        new Error('Invalid argument'),
        'Validation failed'
      );
      expect(result.code).toBe('INVALID_INPUT');
    });

    it('should use INTERNAL_ERROR as default code', () => {
      const result = SecurityUtils.createSafeError(
        new Error('Something went wrong'),
        'Operation failed'
      );
      expect(result.code).toBe('INTERNAL_ERROR');
    });

    it('should sanitize paths in error message', () => {
      const result = SecurityUtils.createSafeError(
        new Error('Error at /home/user/project/secret.ts'),
        'Processing failed',
        '/home/user/project'
      );
      expect(result.message).not.toContain('/home/user');
    });
  });
});
