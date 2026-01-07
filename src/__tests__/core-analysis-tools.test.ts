/**
 * Tests for CoreAnalysisTools - Common Utilities for MCP Tool Implementations
 *
 * Tests the CoreAnalysisTools class which provides shared utility functions
 * for file filtering, language detection, path normalization, and batch processing.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import {
  CoreAnalysisTools,
  SUPPORTED_CODE_EXTENSIONS,
  IGNORED_DIRECTORIES,
  IGNORED_FILE_PATTERNS
} from '../mcp-server/tools/core-analysis-tools.js';

describe('CoreAnalysisTools', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'core-analysis-tools-test-'));
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('Module exports', () => {
    it('should export CoreAnalysisTools class', () => {
      expect(CoreAnalysisTools).toBeDefined();
    });

    it('should export SUPPORTED_CODE_EXTENSIONS constant', () => {
      expect(SUPPORTED_CODE_EXTENSIONS).toBeDefined();
      expect(SUPPORTED_CODE_EXTENSIONS instanceof Set).toBe(true);
      expect(SUPPORTED_CODE_EXTENSIONS.has('ts')).toBe(true);
      expect(SUPPORTED_CODE_EXTENSIONS.has('py')).toBe(true);
    });

    it('should export IGNORED_DIRECTORIES constant', () => {
      expect(IGNORED_DIRECTORIES).toBeDefined();
      expect(Array.isArray(IGNORED_DIRECTORIES)).toBe(true);
      expect(IGNORED_DIRECTORIES).toContain('node_modules');
      expect(IGNORED_DIRECTORIES).toContain('.git');
    });

    it('should export IGNORED_FILE_PATTERNS constant', () => {
      expect(IGNORED_FILE_PATTERNS).toBeDefined();
      expect(Array.isArray(IGNORED_FILE_PATTERNS)).toBe(true);
    });

    it('should export all static methods', () => {
      expect(typeof CoreAnalysisTools.filterSupportedFiles).toBe('function');
      expect(typeof CoreAnalysisTools.isSupportedFile).toBe('function');
      expect(typeof CoreAnalysisTools.getFileExtension).toBe('function');
      expect(typeof CoreAnalysisTools.shouldIgnoreDirectory).toBe('function');
      expect(typeof CoreAnalysisTools.getIgnorePatterns).toBe('function');
      expect(typeof CoreAnalysisTools.detectLanguage).toBe('function');
      expect(typeof CoreAnalysisTools.isParserSupported).toBe('function');
      expect(typeof CoreAnalysisTools.getFileExtensionsForLanguage).toBe('function');
      expect(typeof CoreAnalysisTools.getSupportedLanguages).toBe('function');
      expect(typeof CoreAnalysisTools.normalizePath).toBe('function');
      expect(typeof CoreAnalysisTools.validatePath).toBe('function');
      expect(typeof CoreAnalysisTools.isPathSafe).toBe('function');
      expect(typeof CoreAnalysisTools.processBatch).toBe('function');
      expect(typeof CoreAnalysisTools.processBatchWithResults).toBe('function');
      expect(typeof CoreAnalysisTools.processBatchSafe).toBe('function');
      expect(typeof CoreAnalysisTools.discoverCodeFiles).toBe('function');
      expect(typeof CoreAnalysisTools.countFiles).toBe('function');
    });
  });

  describe('filterSupportedFiles', () => {
    it('should filter to only supported code files', () => {
      const files = ['main.ts', 'README.md', 'styles.css', 'utils.py', 'config.json'];
      const result = CoreAnalysisTools.filterSupportedFiles(files);
      expect(result).toEqual(['main.ts', 'utils.py']);
    });

    it('should handle empty array', () => {
      expect(CoreAnalysisTools.filterSupportedFiles([])).toEqual([]);
    });

    it('should handle files without extensions', () => {
      const files = ['Makefile', 'Dockerfile', 'LICENSE'];
      expect(CoreAnalysisTools.filterSupportedFiles(files)).toEqual([]);
    });

    it('should support all major language extensions', () => {
      const files = [
        'main.ts', 'component.tsx', 'index.js', 'app.jsx',
        'script.py', 'lib.rs', 'main.go', 'App.java',
        'main.c', 'main.cpp', 'header.h', 'code.cs'
      ];
      const result = CoreAnalysisTools.filterSupportedFiles(files);
      expect(result.length).toBe(12);
    });
  });

  describe('isSupportedFile', () => {
    it('should return true for TypeScript files', () => {
      expect(CoreAnalysisTools.isSupportedFile('main.ts')).toBe(true);
      expect(CoreAnalysisTools.isSupportedFile('component.tsx')).toBe(true);
    });

    it('should return true for JavaScript files', () => {
      expect(CoreAnalysisTools.isSupportedFile('index.js')).toBe(true);
      expect(CoreAnalysisTools.isSupportedFile('app.jsx')).toBe(true);
    });

    it('should return true for Python files', () => {
      expect(CoreAnalysisTools.isSupportedFile('script.py')).toBe(true);
    });

    it('should return true for Rust files', () => {
      expect(CoreAnalysisTools.isSupportedFile('lib.rs')).toBe(true);
    });

    it('should return false for non-code files', () => {
      expect(CoreAnalysisTools.isSupportedFile('README.md')).toBe(false);
      expect(CoreAnalysisTools.isSupportedFile('styles.css')).toBe(false);
      expect(CoreAnalysisTools.isSupportedFile('config.json')).toBe(false);
    });

    it('should handle case insensitivity', () => {
      expect(CoreAnalysisTools.isSupportedFile('Main.TS')).toBe(true);
      expect(CoreAnalysisTools.isSupportedFile('SCRIPT.PY')).toBe(true);
    });
  });

  describe('getFileExtension', () => {
    it('should return extension without dot', () => {
      expect(CoreAnalysisTools.getFileExtension('file.ts')).toBe('ts');
      expect(CoreAnalysisTools.getFileExtension('file.py')).toBe('py');
    });

    it('should return null for files without extension', () => {
      expect(CoreAnalysisTools.getFileExtension('Makefile')).toBeNull();
      expect(CoreAnalysisTools.getFileExtension('LICENSE')).toBeNull();
    });

    it('should handle multiple dots in filename', () => {
      expect(CoreAnalysisTools.getFileExtension('file.test.ts')).toBe('ts');
      expect(CoreAnalysisTools.getFileExtension('config.prod.json')).toBe('json');
    });

    it('should handle lowercase conversion', () => {
      expect(CoreAnalysisTools.getFileExtension('file.TS')).toBe('ts');
      expect(CoreAnalysisTools.getFileExtension('file.PY')).toBe('py');
    });
  });

  describe('shouldIgnoreDirectory', () => {
    it('should return true for node_modules', () => {
      expect(CoreAnalysisTools.shouldIgnoreDirectory('node_modules')).toBe(true);
    });

    it('should return true for .git', () => {
      expect(CoreAnalysisTools.shouldIgnoreDirectory('.git')).toBe(true);
    });

    it('should return true for build directories', () => {
      expect(CoreAnalysisTools.shouldIgnoreDirectory('dist')).toBe(true);
      expect(CoreAnalysisTools.shouldIgnoreDirectory('build')).toBe(true);
      expect(CoreAnalysisTools.shouldIgnoreDirectory('target')).toBe(true);
    });

    it('should return true for hidden directories', () => {
      expect(CoreAnalysisTools.shouldIgnoreDirectory('.cache')).toBe(true);
      expect(CoreAnalysisTools.shouldIgnoreDirectory('.vscode')).toBe(true);
    });

    it('should return false for source directories', () => {
      expect(CoreAnalysisTools.shouldIgnoreDirectory('src')).toBe(false);
      expect(CoreAnalysisTools.shouldIgnoreDirectory('lib')).toBe(false);
      expect(CoreAnalysisTools.shouldIgnoreDirectory('utils')).toBe(false);
    });
  });

  describe('getIgnorePatterns', () => {
    it('should return array of glob patterns', () => {
      const patterns = CoreAnalysisTools.getIgnorePatterns();
      expect(Array.isArray(patterns)).toBe(true);
      expect(patterns.length).toBeGreaterThan(0);
    });

    it('should include node_modules pattern', () => {
      const patterns = CoreAnalysisTools.getIgnorePatterns();
      expect(patterns.some(p => p.includes('node_modules'))).toBe(true);
    });

    it('should include minified file patterns', () => {
      const patterns = CoreAnalysisTools.getIgnorePatterns();
      expect(patterns.some(p => p.includes('.min.js'))).toBe(true);
    });
  });

  describe('detectLanguage', () => {
    it('should detect TypeScript', () => {
      expect(CoreAnalysisTools.detectLanguage('main.ts')).toBe('typescript');
      expect(CoreAnalysisTools.detectLanguage('component.tsx')).toBe('typescript');
    });

    it('should detect JavaScript', () => {
      expect(CoreAnalysisTools.detectLanguage('index.js')).toBe('javascript');
      expect(CoreAnalysisTools.detectLanguage('app.jsx')).toBe('javascript');
    });

    it('should detect Python', () => {
      expect(CoreAnalysisTools.detectLanguage('script.py')).toBe('python');
    });

    it('should detect Rust', () => {
      expect(CoreAnalysisTools.detectLanguage('lib.rs')).toBe('rust');
    });

    it('should detect Go', () => {
      expect(CoreAnalysisTools.detectLanguage('main.go')).toBe('go');
    });

    it('should return unknown for unsupported extensions', () => {
      expect(CoreAnalysisTools.detectLanguage('README.md')).toBe('unknown');
      expect(CoreAnalysisTools.detectLanguage('Makefile')).toBe('unknown');
    });

    it('should handle paths with directories', () => {
      expect(CoreAnalysisTools.detectLanguage('src/utils/helpers.ts')).toBe('typescript');
      expect(CoreAnalysisTools.detectLanguage('/home/user/project/main.py')).toBe('python');
    });
  });

  describe('isParserSupported', () => {
    it('should return true for supported languages', () => {
      expect(CoreAnalysisTools.isParserSupported('typescript')).toBe(true);
      expect(CoreAnalysisTools.isParserSupported('python')).toBe(true);
      expect(CoreAnalysisTools.isParserSupported('rust')).toBe(true);
    });

    it('should return false for unsupported languages', () => {
      expect(CoreAnalysisTools.isParserSupported('unknown')).toBe(false);
      expect(CoreAnalysisTools.isParserSupported('markdown')).toBe(false);
    });
  });

  describe('getFileExtensionsForLanguage', () => {
    it('should return TypeScript extensions', () => {
      const exts = CoreAnalysisTools.getFileExtensionsForLanguage('typescript');
      expect(exts).toContain('ts');
      expect(exts).toContain('tsx');
    });

    it('should return JavaScript extensions', () => {
      const exts = CoreAnalysisTools.getFileExtensionsForLanguage('javascript');
      expect(exts).toContain('js');
      expect(exts).toContain('jsx');
    });

    it('should return Python extension', () => {
      expect(CoreAnalysisTools.getFileExtensionsForLanguage('python')).toBe('py');
    });

    it('should return default for unknown language', () => {
      const exts = CoreAnalysisTools.getFileExtensionsForLanguage('unknown');
      expect(exts).toBeDefined();
      expect(exts.length).toBeGreaterThan(0);
    });

    it('should be case insensitive', () => {
      expect(CoreAnalysisTools.getFileExtensionsForLanguage('TYPESCRIPT')).toContain('ts');
      expect(CoreAnalysisTools.getFileExtensionsForLanguage('Python')).toBe('py');
    });
  });

  describe('getSupportedLanguages', () => {
    it('should return array of languages', () => {
      const languages = CoreAnalysisTools.getSupportedLanguages();
      expect(Array.isArray(languages)).toBe(true);
      expect(languages.length).toBeGreaterThan(0);
    });

    it('should include major languages', () => {
      const languages = CoreAnalysisTools.getSupportedLanguages();
      expect(languages).toContain('typescript');
      expect(languages).toContain('javascript');
      expect(languages).toContain('python');
      expect(languages).toContain('rust');
    });
  });

  describe('normalizePath', () => {
    it('should return empty string for empty input', () => {
      expect(CoreAnalysisTools.normalizePath('')).toBe('');
    });

    it('should normalize paths with redundant separators', () => {
      const result = CoreAnalysisTools.normalizePath('/path//to///file');
      expect(result).not.toContain('//');
    });

    it('should return absolute path', () => {
      const result = CoreAnalysisTools.normalizePath('./test');
      expect(result.startsWith('/')).toBe(true);
    });
  });

  describe('validatePath', () => {
    it('should return null for traversal attempts', () => {
      expect(CoreAnalysisTools.validatePath('../../../etc/passwd', tempDir)).toBeNull();
    });

    it('should return valid path for safe paths', () => {
      writeFileSync(join(tempDir, 'test.txt'), 'content');
      const result = CoreAnalysisTools.validatePath('./test.txt', tempDir);
      expect(result).not.toBeNull();
    });

    it('should handle requireExists option', () => {
      // Non-existent file with requireExists=true should return null
      expect(CoreAnalysisTools.validatePath('./nonexistent.txt', tempDir, { requireExists: true })).toBeNull();

      // Non-existent file with requireExists=false should return path
      const result = CoreAnalysisTools.validatePath('./nonexistent.txt', tempDir, { requireExists: false });
      expect(result).not.toBeNull();
    });
  });

  describe('isPathSafe', () => {
    it('should return true for safe paths', () => {
      // Create the test file first since isPathSafe checks existence
      writeFileSync(join(tempDir, 'test.txt'), 'content');
      expect(CoreAnalysisTools.isPathSafe('./test.txt', tempDir)).toBe(true);
    });

    it('should return false for traversal paths', () => {
      expect(CoreAnalysisTools.isPathSafe('../../../etc/passwd', tempDir)).toBe(false);
    });

    it('should return false for paths outside base', () => {
      expect(CoreAnalysisTools.isPathSafe('/etc/passwd', tempDir)).toBe(false);
    });
  });

  describe('processBatch', () => {
    it('should process all items', async () => {
      const items = [1, 2, 3, 4, 5];
      const processed: number[] = [];

      await CoreAnalysisTools.processBatch(
        items,
        async (item) => {
          processed.push(item);
        },
        2
      );

      expect(processed.sort()).toEqual([1, 2, 3, 4, 5]);
    });

    it('should respect batch size', async () => {
      const items = [1, 2, 3, 4, 5];
      let maxConcurrent = 0;
      let currentConcurrent = 0;

      await CoreAnalysisTools.processBatch(
        items,
        async () => {
          currentConcurrent++;
          maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
          await new Promise(resolve => setTimeout(resolve, 10));
          currentConcurrent--;
        },
        2
      );

      expect(maxConcurrent).toBeLessThanOrEqual(2);
    });

    it('should handle empty array', async () => {
      const processed: number[] = [];
      await CoreAnalysisTools.processBatch(
        [],
        async (item: number) => { processed.push(item); },
        2
      );
      expect(processed).toEqual([]);
    });
  });

  describe('processBatchWithResults', () => {
    it('should return results in order', async () => {
      const items = [1, 2, 3];
      const results = await CoreAnalysisTools.processBatchWithResults(
        items,
        async (item) => item * 2,
        2
      );
      expect(results).toEqual([2, 4, 6]);
    });

    it('should handle empty array', async () => {
      const results = await CoreAnalysisTools.processBatchWithResults(
        [],
        async (item: number) => item * 2,
        2
      );
      expect(results).toEqual([]);
    });
  });

  describe('processBatchSafe', () => {
    it('should count successful operations', async () => {
      const items = [1, 2, 3];
      const result = await CoreAnalysisTools.processBatchSafe(
        items,
        async () => { /* success */ },
        2
      );
      expect(result.successful).toBe(3);
      expect(result.failed).toBe(0);
    });

    it('should count failed operations', async () => {
      const items = [1, 2, 3];
      const result = await CoreAnalysisTools.processBatchSafe(
        items,
        async (item) => {
          if (item === 2) throw new Error('fail');
        },
        2
      );
      expect(result.successful).toBe(2);
      expect(result.failed).toBe(1);
      expect(result.errors.length).toBe(1);
    });

    it('should continue processing after errors', async () => {
      const items = [1, 2, 3, 4, 5];
      const processed: number[] = [];

      await CoreAnalysisTools.processBatchSafe(
        items,
        async (item) => {
          if (item % 2 === 0) throw new Error('even');
          processed.push(item);
        },
        2
      );

      expect(processed).toContain(1);
      expect(processed).toContain(3);
      expect(processed).toContain(5);
    });
  });

  describe('discoverCodeFiles', () => {
    beforeEach(() => {
      // Create test files
      mkdirSync(join(tempDir, 'src'), { recursive: true });
      mkdirSync(join(tempDir, 'node_modules', 'pkg'), { recursive: true });
      writeFileSync(join(tempDir, 'src', 'main.ts'), 'console.log("hello");');
      writeFileSync(join(tempDir, 'src', 'utils.py'), 'print("hello")');
      writeFileSync(join(tempDir, 'README.md'), '# Readme');
      writeFileSync(join(tempDir, 'node_modules', 'pkg', 'index.js'), 'module.exports = {}');
    });

    it('should discover code files', async () => {
      const files = await CoreAnalysisTools.discoverCodeFiles(tempDir);
      expect(files.length).toBeGreaterThan(0);
      expect(files.some(f => f.includes('main.ts'))).toBe(true);
    });

    it('should ignore node_modules', async () => {
      const files = await CoreAnalysisTools.discoverCodeFiles(tempDir);
      expect(files.every(f => !f.includes('node_modules'))).toBe(true);
    });

    it('should filter by language', async () => {
      const files = await CoreAnalysisTools.discoverCodeFiles(tempDir, {
        language: 'typescript'
      });
      expect(files.every(f => f.endsWith('.ts') || f.endsWith('.tsx'))).toBe(true);
    });
  });

  describe('countFiles', () => {
    beforeEach(() => {
      // Create test files
      mkdirSync(join(tempDir, 'src'), { recursive: true });
      writeFileSync(join(tempDir, 'src', 'main.ts'), 'code');
      writeFileSync(join(tempDir, 'src', 'utils.py'), 'code');
      writeFileSync(join(tempDir, 'README.md'), 'readme');
    });

    it('should count total files', async () => {
      const result = await CoreAnalysisTools.countFiles(tempDir);
      expect(result.total).toBeGreaterThanOrEqual(3);
    });

    it('should count code files separately', async () => {
      const result = await CoreAnalysisTools.countFiles(tempDir);
      expect(result.codeFiles).toBeGreaterThanOrEqual(2);
      expect(result.codeFiles).toBeLessThanOrEqual(result.total);
    });

    it('should count by language', async () => {
      const result = await CoreAnalysisTools.countFiles(tempDir);
      expect(result.byLanguage).toBeDefined();
      expect(result.byLanguage['typescript']).toBeGreaterThanOrEqual(1);
      expect(result.byLanguage['python']).toBeGreaterThanOrEqual(1);
    });
  });
});
