import { describe, it, expect, beforeAll } from 'vitest';
import {
  isLineRange,
  isSemanticConcept,
  isDeveloperPattern,
  isComplexityMetrics,
  isFileMetadata,
  isPatternContent,
  isEntryPoint,
  isKeyDirectory,
  isFeatureMap,
  isWorkSession,
  isValidDate,
  toDate,
  hasStringProp,
  hasNumberProp,
  assertSemanticConcept,
  assertDeveloperPattern,
  safeParseJSON,
  isObject,
  isStringArray,
  isNumberInRange,
} from '../types/guards.js';

beforeAll(() => {
  console.log('🧪 Starting In-Memoria test suite...');
});

describe('Type Guards', () => {
  describe('isLineRange', () => {
    it('should return true for valid LineRange', () => {
      expect(isLineRange({ start: 1, end: 10 })).toBe(true);
      expect(isLineRange({ start: 0, end: 0 })).toBe(true);
    });

    it('should return false for invalid LineRange', () => {
      expect(isLineRange(null)).toBe(false);
      expect(isLineRange(undefined)).toBe(false);
      expect(isLineRange({})).toBe(false);
      expect(isLineRange({ start: 1 })).toBe(false);
      expect(isLineRange({ start: '1', end: 10 })).toBe(false);
    });
  });

  describe('isSemanticConcept', () => {
    it('should return true for valid SemanticConcept', () => {
      const concept = {
        id: 'test-id',
        conceptName: 'TestConcept',
        conceptType: 'class',
        confidenceScore: 0.9,
        filePath: '/test/path.ts',
        lineRange: { start: 1, end: 10 }
      };
      expect(isSemanticConcept(concept)).toBe(true);
    });

    it('should return false for invalid SemanticConcept', () => {
      expect(isSemanticConcept(null)).toBe(false);
      expect(isSemanticConcept({})).toBe(false);
      expect(isSemanticConcept({ id: 'test' })).toBe(false);
    });
  });

  describe('isDeveloperPattern', () => {
    it('should return true for valid DeveloperPattern', () => {
      const pattern = {
        patternId: 'test-pattern',
        patternType: 'naming',
        frequency: 5,
        confidence: 0.8,
        contexts: ['context1', 'context2']
      };
      expect(isDeveloperPattern(pattern)).toBe(true);
    });

    it('should return false for invalid DeveloperPattern', () => {
      expect(isDeveloperPattern(null)).toBe(false);
      expect(isDeveloperPattern({})).toBe(false);
      expect(isDeveloperPattern({ patternId: 'test' })).toBe(false);
    });
  });

  describe('isComplexityMetrics', () => {
    it('should return true for valid ComplexityMetrics', () => {
      expect(isComplexityMetrics({ cyclomatic: 5, cognitive: 10 })).toBe(true);
      expect(isComplexityMetrics({ cyclomatic: 0, cognitive: 0 })).toBe(true);
    });

    it('should return false for invalid ComplexityMetrics', () => {
      expect(isComplexityMetrics(null)).toBe(false);
      expect(isComplexityMetrics({})).toBe(false);
      expect(isComplexityMetrics({ cyclomatic: 5 })).toBe(false);
    });
  });

  describe('isFileMetadata', () => {
    it('should return true for valid FileMetadata', () => {
      expect(isFileMetadata({})).toBe(true);
      expect(isFileMetadata({ language: 'typescript' })).toBe(true);
      expect(isFileMetadata({ lineCount: 100, complexity: 5 })).toBe(true);
    });

    it('should return false for invalid FileMetadata', () => {
      expect(isFileMetadata(null)).toBe(false);
      expect(isFileMetadata({ language: 123 })).toBe(false);
      expect(isFileMetadata({ lineCount: '100' })).toBe(false);
    });
  });

  describe('isPatternContent', () => {
    it('should return true for valid PatternContent', () => {
      expect(isPatternContent({ description: 'test pattern' })).toBe(true);
    });

    it('should return false for invalid PatternContent', () => {
      expect(isPatternContent(null)).toBe(false);
      expect(isPatternContent({})).toBe(false);
      expect(isPatternContent({ description: 123 })).toBe(false);
    });
  });

  describe('isEntryPoint', () => {
    it('should return true for valid EntryPoint', () => {
      const entryPoint = {
        id: 'ep-1',
        projectPath: '/project',
        entryType: 'main',
        filePath: '/project/index.ts',
        createdAt: new Date()
      };
      expect(isEntryPoint(entryPoint)).toBe(true);
    });

    it('should return false for invalid EntryPoint', () => {
      expect(isEntryPoint(null)).toBe(false);
      expect(isEntryPoint({})).toBe(false);
      expect(isEntryPoint({ id: 'test' })).toBe(false);
    });
  });

  describe('isKeyDirectory', () => {
    it('should return true for valid KeyDirectory', () => {
      const keyDir = {
        id: 'kd-1',
        projectPath: '/project',
        directoryPath: '/project/src',
        directoryType: 'source',
        fileCount: 10,
        createdAt: new Date()
      };
      expect(isKeyDirectory(keyDir)).toBe(true);
    });

    it('should return false for invalid KeyDirectory', () => {
      expect(isKeyDirectory(null)).toBe(false);
      expect(isKeyDirectory({})).toBe(false);
    });
  });

  describe('isFeatureMap', () => {
    it('should return true for valid FeatureMap', () => {
      const featureMap = {
        id: 'fm-1',
        projectPath: '/project',
        featureName: 'auth',
        primaryFiles: ['auth.ts'],
        relatedFiles: ['user.ts'],
        dependencies: ['bcrypt'],
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date()
      };
      expect(isFeatureMap(featureMap)).toBe(true);
    });

    it('should return false for invalid FeatureMap', () => {
      expect(isFeatureMap(null)).toBe(false);
      expect(isFeatureMap({})).toBe(false);
    });
  });

  describe('isWorkSession', () => {
    it('should return true for valid WorkSession', () => {
      const session = {
        id: 'ws-1',
        projectPath: '/project',
        sessionStart: new Date(),
        currentFiles: ['file1.ts'],
        completedTasks: ['task1'],
        pendingTasks: ['task2'],
        blockers: [],
        lastUpdated: new Date()
      };
      expect(isWorkSession(session)).toBe(true);
    });

    it('should return false for invalid WorkSession', () => {
      expect(isWorkSession(null)).toBe(false);
      expect(isWorkSession({})).toBe(false);
    });
  });

  describe('isValidDate', () => {
    it('should return true for valid dates', () => {
      expect(isValidDate(new Date())).toBe(true);
      expect(isValidDate('2024-01-01')).toBe(true);
      expect(isValidDate(1704067200000)).toBe(true);
    });

    it('should return false for invalid dates', () => {
      expect(isValidDate(null)).toBe(false);
      expect(isValidDate('not a date')).toBe(false);
      expect(isValidDate(new Date('invalid'))).toBe(false);
    });
  });

  describe('toDate', () => {
    it('should convert valid values to Date', () => {
      const date = new Date('2024-01-01');
      expect(toDate(date)).toEqual(date);
      expect(toDate('2024-01-01')).toBeInstanceOf(Date);
      expect(toDate(1704067200000)).toBeInstanceOf(Date);
    });

    it('should return undefined for invalid values', () => {
      expect(toDate(null)).toBeUndefined();
      expect(toDate('not a date')).toBeUndefined();
    });
  });

  describe('hasStringProp', () => {
    it('should return true when property exists and is string', () => {
      expect(hasStringProp({ name: 'test' }, 'name')).toBe(true);
    });

    it('should return false when property is missing or wrong type', () => {
      expect(hasStringProp({}, 'name')).toBe(false);
      expect(hasStringProp({ name: 123 }, 'name')).toBe(false);
      expect(hasStringProp(null, 'name')).toBe(false);
    });
  });

  describe('hasNumberProp', () => {
    it('should return true when property exists and is number', () => {
      expect(hasNumberProp({ count: 5 }, 'count')).toBe(true);
    });

    it('should return false when property is missing or wrong type', () => {
      expect(hasNumberProp({}, 'count')).toBe(false);
      expect(hasNumberProp({ count: '5' }, 'count')).toBe(false);
      expect(hasNumberProp(null, 'count')).toBe(false);
    });
  });

  describe('assertSemanticConcept', () => {
    it('should not throw for valid SemanticConcept', () => {
      const concept = {
        id: 'test-id',
        conceptName: 'TestConcept',
        conceptType: 'class',
        confidenceScore: 0.9,
        filePath: '/test/path.ts',
        lineRange: { start: 1, end: 10 }
      };
      expect(() => assertSemanticConcept(concept)).not.toThrow();
    });

    it('should throw for invalid SemanticConcept', () => {
      expect(() => assertSemanticConcept({})).toThrow('Invalid SemanticConcept structure');
    });
  });

  describe('assertDeveloperPattern', () => {
    it('should not throw for valid DeveloperPattern', () => {
      const pattern = {
        patternId: 'test-pattern',
        patternType: 'naming',
        frequency: 5,
        confidence: 0.8,
        contexts: ['context1']
      };
      expect(() => assertDeveloperPattern(pattern)).not.toThrow();
    });

    it('should throw for invalid DeveloperPattern', () => {
      expect(() => assertDeveloperPattern({})).toThrow('Invalid DeveloperPattern structure');
    });
  });

  describe('safeParseJSON', () => {
    const isStringObj = (v: unknown): v is { name: string } =>
      isObject(v) && typeof v.name === 'string';

    it('should parse valid JSON with matching structure', () => {
      const result = safeParseJSON('{"name": "test"}', isStringObj, { name: 'default' });
      expect(result).toEqual({ name: 'test' });
    });

    it('should return default for invalid JSON', () => {
      const result = safeParseJSON('invalid', isStringObj, { name: 'default' });
      expect(result).toEqual({ name: 'default' });
    });

    it('should return default for non-matching structure', () => {
      const result = safeParseJSON('{"other": "value"}', isStringObj, { name: 'default' });
      expect(result).toEqual({ name: 'default' });
    });
  });

  describe('isObject', () => {
    it('should return true for objects', () => {
      expect(isObject({})).toBe(true);
      expect(isObject({ key: 'value' })).toBe(true);
    });

    it('should return false for non-objects', () => {
      expect(isObject(null)).toBe(false);
      expect(isObject(undefined)).toBe(false);
      expect(isObject([])).toBe(false);
      expect(isObject('string')).toBe(false);
      expect(isObject(123)).toBe(false);
    });
  });

  describe('isStringArray', () => {
    it('should return true for string arrays', () => {
      expect(isStringArray([])).toBe(true);
      expect(isStringArray(['a', 'b', 'c'])).toBe(true);
    });

    it('should return false for non-string arrays', () => {
      expect(isStringArray(null)).toBe(false);
      expect(isStringArray([1, 2, 3])).toBe(false);
      expect(isStringArray(['a', 1])).toBe(false);
    });
  });

  describe('isNumberInRange', () => {
    it('should return true for numbers in range', () => {
      expect(isNumberInRange(5, 0, 10)).toBe(true);
      expect(isNumberInRange(0, 0, 10)).toBe(true);
      expect(isNumberInRange(10, 0, 10)).toBe(true);
    });

    it('should return false for numbers out of range', () => {
      expect(isNumberInRange(-1, 0, 10)).toBe(false);
      expect(isNumberInRange(11, 0, 10)).toBe(false);
    });

    it('should return false for non-numbers', () => {
      expect(isNumberInRange('5', 0, 10)).toBe(false);
      expect(isNumberInRange(null, 0, 10)).toBe(false);
    });
  });
});

console.log('\n✅ Test suite completed\n');
