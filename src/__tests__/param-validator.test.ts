/**
 * Tests for Parameter Validator utility
 * TDD: Write tests FIRST, then implementation
 *
 * Provides centralized validation for MCP tool parameters.
 */

import { describe, it, expect } from 'vitest';

// Runtime import to verify the file exists and exports correctly
import * as ParamValidatorModule from '../utils/param-validator.js';

describe('Parameter Validator', () => {
  describe('Module exports', () => {
    it('should export the ParamValidatorModule', () => {
      expect(ParamValidatorModule).toBeDefined();
    });

    it('should export validatePath function', () => {
      expect(ParamValidatorModule.validatePath).toBeDefined();
      expect(typeof ParamValidatorModule.validatePath).toBe('function');
    });

    it('should export validateString function', () => {
      expect(ParamValidatorModule.validateString).toBeDefined();
      expect(typeof ParamValidatorModule.validateString).toBe('function');
    });

    it('should export validateNumber function', () => {
      expect(ParamValidatorModule.validateNumber).toBeDefined();
      expect(typeof ParamValidatorModule.validateNumber).toBe('function');
    });

    it('should export validateParams function', () => {
      expect(ParamValidatorModule.validateParams).toBeDefined();
      expect(typeof ParamValidatorModule.validateParams).toBe('function');
    });

    it('should export ValidationError class', () => {
      expect(ParamValidatorModule.ValidationError).toBeDefined();
      expect(typeof ParamValidatorModule.ValidationError).toBe('function');
    });
  });

  describe('validatePath', () => {
    it('should accept valid paths', () => {
      const result = ParamValidatorModule.validatePath('/valid/path');
      expect(result.valid).toBe(true);
      expect(result.value).toBe('/valid/path');
    });

    it('should reject empty paths', () => {
      const result = ParamValidatorModule.validatePath('');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('empty');
    });

    it('should reject undefined paths', () => {
      const result = ParamValidatorModule.validatePath(undefined);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('required');
    });

    it('should reject paths with null bytes', () => {
      const result = ParamValidatorModule.validatePath('/path/with\x00null');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('invalid');
    });

    it('should reject paths outside allowed directories', () => {
      const result = ParamValidatorModule.validatePath(
        '/etc/passwd',
        { allowedDirs: ['/home', '/tmp'] }
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain('outside');
    });

    it('should accept paths inside allowed directories', () => {
      const result = ParamValidatorModule.validatePath(
        '/home/user/file.ts',
        { allowedDirs: ['/home', '/tmp'] }
      );
      expect(result.valid).toBe(true);
    });

    it('should reject paths with path traversal', () => {
      const result = ParamValidatorModule.validatePath('/home/../etc/passwd');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('traversal');
    });

    it('should allow relative paths when configured', () => {
      const result = ParamValidatorModule.validatePath(
        './relative/path',
        { allowRelative: true }
      );
      expect(result.valid).toBe(true);
    });

    it('should reject relative paths by default', () => {
      const result = ParamValidatorModule.validatePath('./relative/path');
      expect(result.valid).toBe(false);
    });
  });

  describe('validateString', () => {
    it('should accept valid strings', () => {
      const result = ParamValidatorModule.validateString('valid string');
      expect(result.valid).toBe(true);
      expect(result.value).toBe('valid string');
    });

    it('should reject empty strings when required', () => {
      const result = ParamValidatorModule.validateString('', { required: true });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('empty');
    });

    it('should accept empty strings when not required', () => {
      const result = ParamValidatorModule.validateString('', { required: false });
      expect(result.valid).toBe(true);
    });

    it('should reject undefined when required', () => {
      const result = ParamValidatorModule.validateString(undefined, { required: true });
      expect(result.valid).toBe(false);
    });

    it('should accept undefined when not required', () => {
      const result = ParamValidatorModule.validateString(undefined, { required: false });
      expect(result.valid).toBe(true);
    });

    it('should enforce minLength', () => {
      const result = ParamValidatorModule.validateString('ab', { minLength: 3 });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('minimum');
    });

    it('should enforce maxLength', () => {
      const result = ParamValidatorModule.validateString('abcdef', { maxLength: 3 });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('maximum');
    });

    it('should validate against pattern', () => {
      const result = ParamValidatorModule.validateString('invalid!', {
        pattern: /^[a-z]+$/,
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('pattern');
    });

    it('should accept strings matching pattern', () => {
      const result = ParamValidatorModule.validateString('valid', {
        pattern: /^[a-z]+$/,
      });
      expect(result.valid).toBe(true);
    });

    it('should trim whitespace when configured', () => {
      const result = ParamValidatorModule.validateString('  value  ', { trim: true });
      expect(result.valid).toBe(true);
      expect(result.value).toBe('value');
    });
  });

  describe('validateNumber', () => {
    it('should accept valid numbers', () => {
      const result = ParamValidatorModule.validateNumber(42);
      expect(result.valid).toBe(true);
      expect(result.value).toBe(42);
    });

    it('should reject NaN', () => {
      const result = ParamValidatorModule.validateNumber(NaN);
      expect(result.valid).toBe(false);
    });

    it('should reject Infinity', () => {
      const result = ParamValidatorModule.validateNumber(Infinity);
      expect(result.valid).toBe(false);
    });

    it('should enforce min value', () => {
      const result = ParamValidatorModule.validateNumber(5, { min: 10 });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('minimum');
    });

    it('should enforce max value', () => {
      const result = ParamValidatorModule.validateNumber(100, { max: 50 });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('maximum');
    });

    it('should enforce integer constraint', () => {
      const result = ParamValidatorModule.validateNumber(3.14, { integer: true });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('integer');
    });

    it('should accept integers when integer constraint is set', () => {
      const result = ParamValidatorModule.validateNumber(42, { integer: true });
      expect(result.valid).toBe(true);
    });

    it('should coerce strings to numbers when configured', () => {
      const result = ParamValidatorModule.validateNumber('42' as unknown as number, {
        coerce: true,
      });
      expect(result.valid).toBe(true);
      expect(result.value).toBe(42);
    });
  });

  describe('validateParams', () => {
    const schema = {
      path: { type: 'path' as const, required: true },
      limit: { type: 'number' as const, required: false, min: 1, max: 100 },
      query: { type: 'string' as const, required: false, minLength: 1 },
    };

    it('should validate all parameters against schema', () => {
      const result = ParamValidatorModule.validateParams(
        { path: '/valid/path', limit: 10 },
        schema
      );

      expect(result.valid).toBe(true);
      expect(result.values.path).toBe('/valid/path');
      expect(result.values.limit).toBe(10);
    });

    it('should collect all validation errors', () => {
      const result = ParamValidatorModule.validateParams(
        { path: '', limit: 200 },
        schema
      );

      expect(result.valid).toBe(false);
      expect(result.errors.path).toBeDefined();
      expect(result.errors.limit).toBeDefined();
    });

    it('should report missing required parameters', () => {
      const result = ParamValidatorModule.validateParams({}, schema);

      expect(result.valid).toBe(false);
      expect(result.errors.path).toContain('required');
    });

    it('should skip optional parameters when not provided', () => {
      const result = ParamValidatorModule.validateParams(
        { path: '/valid/path' },
        schema
      );

      expect(result.valid).toBe(true);
      expect(result.values.limit).toBeUndefined();
    });
  });

  describe('ValidationError', () => {
    it('should be an Error', () => {
      const error = new ParamValidatorModule.ValidationError('test', {
        field: 'testField',
        value: 'testValue',
      });

      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('ValidationError');
    });

    it('should include field and value in details', () => {
      const error = new ParamValidatorModule.ValidationError('Invalid value', {
        field: 'path',
        value: '/bad/path',
      });

      expect(error.field).toBe('path');
      expect(error.value).toBe('/bad/path');
    });

    it('should include message', () => {
      const error = new ParamValidatorModule.ValidationError('Path is required');

      expect(error.message).toBe('Path is required');
    });
  });
});
