/**
 * Tests for engine interfaces
 * TDD: Write tests FIRST, then implementation
 */

import { describe, it, expect, vi } from 'vitest';

// Runtime import to verify the file exists and exports correctly
// This will fail if the implementation file doesn't exist
import * as EngineInterfaces from '../interfaces/engines.js';

// Import types from the interface file
import type {
  ProgressCallback,
  IStorageProvider,
  ISemanticEngine,
  IPatternEngine,
  IRustBridgeService,
  SemanticSearchResult,
  EntryPoint,
  KeyDirectory,
  ApproachPrediction,
  FileRouting,
  RustBridgeHealth,
} from '../interfaces/engines.js';

// Note: SemanticConcept, DeveloperPattern, FeatureMap from '../types/index.js' are
// referenced by the interfaces but we don't need to import them directly in tests

describe('Engine Interfaces', () => {
  describe('Module exports', () => {
    it('should export the EngineInterfaces module', () => {
      // This test verifies the module file exists and is importable
      expect(EngineInterfaces).toBeDefined();
    });
  });

  describe('ProgressCallback type', () => {
    it('should accept a valid progress callback function', () => {
      // Define a function matching ProgressCallback signature
      const callback: ProgressCallback = (current: number, total: number, message: string) => {
        expect(typeof current).toBe('number');
        expect(typeof total).toBe('number');
        expect(typeof message).toBe('string');
      };

      // Invoke it to verify it works
      callback(1, 10, 'Processing...');
    });

    it('should be usable as a callback parameter', () => {
      // Function that accepts a ProgressCallback
      const processWithProgress = (
        items: string[],
        onProgress?: ProgressCallback
      ): string[] => {
        items.forEach((item, index) => {
          onProgress?.(index + 1, items.length, `Processing ${item}`);
        });
        return items;
      };

      const progressCalls: Array<{ current: number; total: number; message: string }> = [];
      const trackingCallback: ProgressCallback = (current, total, message) => {
        progressCalls.push({ current, total, message });
      };

      processWithProgress(['a', 'b', 'c'], trackingCallback);

      expect(progressCalls).toHaveLength(3);
      expect(progressCalls[0]).toEqual({ current: 1, total: 3, message: 'Processing a' });
      expect(progressCalls[2]).toEqual({ current: 3, total: 3, message: 'Processing c' });
    });
  });

  describe('IStorageProvider interface', () => {
    it('should be implementable with required methods', () => {
      // Mock implementation to verify interface structure
      const mockStorage: IStorageProvider = {
        insertSemanticConcept: vi.fn(),
        insertSemanticConceptsBatch: vi.fn(),
        getSemanticConcepts: vi.fn().mockReturnValue([]),
        insertDeveloperPattern: vi.fn(),
        insertDeveloperPatternsBatch: vi.fn(),
        getDeveloperPatterns: vi.fn().mockReturnValue([]),
        getFeatureMaps: vi.fn().mockReturnValue([]),
        insertFeatureMap: vi.fn(),
        transaction: vi.fn((fn) => fn()),
      };

      // Verify all methods exist and are callable
      expect(typeof mockStorage.insertSemanticConcept).toBe('function');
      expect(typeof mockStorage.insertSemanticConceptsBatch).toBe('function');
      expect(typeof mockStorage.getSemanticConcepts).toBe('function');
      expect(typeof mockStorage.insertDeveloperPattern).toBe('function');
      expect(typeof mockStorage.insertDeveloperPatternsBatch).toBe('function');
      expect(typeof mockStorage.getDeveloperPatterns).toBe('function');
      expect(typeof mockStorage.getFeatureMaps).toBe('function');
      expect(typeof mockStorage.insertFeatureMap).toBe('function');
      expect(typeof mockStorage.transaction).toBe('function');
    });

    it('should support batch operations returning void', () => {
      const mockStorage: IStorageProvider = {
        insertSemanticConcept: vi.fn(),
        insertSemanticConceptsBatch: vi.fn(),
        getSemanticConcepts: vi.fn().mockReturnValue([]),
        insertDeveloperPattern: vi.fn(),
        insertDeveloperPatternsBatch: vi.fn(),
        getDeveloperPatterns: vi.fn().mockReturnValue([]),
        getFeatureMaps: vi.fn().mockReturnValue([]),
        insertFeatureMap: vi.fn(),
        transaction: vi.fn((fn) => fn()),
      };

      // Call batch method - should not throw
      const concepts: Parameters<IStorageProvider['insertSemanticConceptsBatch']>[0] = [];
      mockStorage.insertSemanticConceptsBatch(concepts);

      expect(mockStorage.insertSemanticConceptsBatch).toHaveBeenCalledWith(concepts);
    });

    it('should support transaction wrapper', () => {
      let transactionCalled = false;
      const mockStorage: IStorageProvider = {
        insertSemanticConcept: vi.fn(),
        insertSemanticConceptsBatch: vi.fn(),
        getSemanticConcepts: vi.fn().mockReturnValue([]),
        insertDeveloperPattern: vi.fn(),
        insertDeveloperPatternsBatch: vi.fn(),
        getDeveloperPatterns: vi.fn().mockReturnValue([]),
        getFeatureMaps: vi.fn().mockReturnValue([]),
        insertFeatureMap: vi.fn(),
        transaction: <T>(fn: () => T): T => {
          transactionCalled = true;
          return fn();
        },
      };

      const result = mockStorage.transaction(() => 'result');

      expect(transactionCalled).toBe(true);
      expect(result).toBe('result');
    });
  });

  describe('ISemanticEngine interface', () => {
    it('should be implementable with async methods', async () => {
      const mockEngine: ISemanticEngine = {
        analyzeCodebase: vi.fn().mockResolvedValue({
          languages: ['typescript'],
          frameworks: [],
          concepts: [],
          complexity: { cyclomatic: 0, cognitive: 0 },
        }),
        analyzeFileContent: vi.fn().mockResolvedValue([]),
        learnFromCodebase: vi.fn().mockResolvedValue([]),
        searchSemanticallySimilar: vi.fn().mockResolvedValue([]),
        detectEntryPoints: vi.fn().mockResolvedValue([]),
        mapKeyDirectories: vi.fn().mockResolvedValue([]),
        getCacheStats: vi.fn().mockReturnValue({
          fileCache: { size: 0 },
          codebaseCache: { size: 0 },
        }),
        cleanup: vi.fn(),
      };

      // Verify async methods return promises
      expect(mockEngine.analyzeCodebase('/path')).toBeInstanceOf(Promise);
      expect(mockEngine.learnFromCodebase('/path')).toBeInstanceOf(Promise);
      expect(mockEngine.searchSemanticallySimilar('query')).toBeInstanceOf(Promise);

      // Verify sync methods
      expect(mockEngine.getCacheStats()).toEqual({
        fileCache: { size: 0 },
        codebaseCache: { size: 0 },
      });
    });

    it('should support progress callback in learnFromCodebase', async () => {
      const progressUpdates: string[] = [];

      const mockEngine: ISemanticEngine = {
        analyzeCodebase: vi.fn().mockResolvedValue({ languages: [], frameworks: [], concepts: [], complexity: {} }),
        analyzeFileContent: vi.fn().mockResolvedValue([]),
        learnFromCodebase: vi.fn(async (_path: string, progressCallback?: ProgressCallback) => {
          progressCallback?.(1, 3, 'Step 1');
          progressCallback?.(2, 3, 'Step 2');
          progressCallback?.(3, 3, 'Step 3');
          return [];
        }),
        searchSemanticallySimilar: vi.fn().mockResolvedValue([]),
        detectEntryPoints: vi.fn().mockResolvedValue([]),
        mapKeyDirectories: vi.fn().mockResolvedValue([]),
        getCacheStats: vi.fn().mockReturnValue({ fileCache: { size: 0 }, codebaseCache: { size: 0 } }),
        cleanup: vi.fn(),
      };

      await mockEngine.learnFromCodebase('/path', (_c, _t, msg) => {
        progressUpdates.push(msg);
      });

      expect(progressUpdates).toEqual(['Step 1', 'Step 2', 'Step 3']);
    });
  });

  describe('IPatternEngine interface', () => {
    it('should be implementable with async methods', async () => {
      const mockEngine: IPatternEngine = {
        extractPatterns: vi.fn().mockResolvedValue([]),
        analyzeFilePatterns: vi.fn().mockResolvedValue([]),
        learnFromCodebase: vi.fn().mockResolvedValue([]),
        findRelevantPatterns: vi.fn().mockResolvedValue([]),
        predictApproach: vi.fn().mockResolvedValue({
          approach: 'test',
          confidence: 0.9,
          reasoning: 'reasoning',
          patterns: [],
          complexity: 'low',
        }),
        buildFeatureMap: vi.fn().mockResolvedValue([]),
        routeRequestToFiles: vi.fn().mockResolvedValue(null),
      };

      // Verify methods return promises
      expect(mockEngine.extractPatterns('/path')).toBeInstanceOf(Promise);
      expect(mockEngine.findRelevantPatterns('problem')).toBeInstanceOf(Promise);

      const approach = await mockEngine.predictApproach('problem', {});
      expect(approach).toHaveProperty('approach');
      expect(approach).toHaveProperty('confidence');
    });

    it('should support optional parameters', async () => {
      const mockEngine: IPatternEngine = {
        extractPatterns: vi.fn().mockResolvedValue([]),
        analyzeFilePatterns: vi.fn().mockResolvedValue([]),
        learnFromCodebase: vi.fn().mockResolvedValue([]),
        findRelevantPatterns: vi.fn().mockResolvedValue([]),
        predictApproach: vi.fn().mockResolvedValue({
          approach: 'test',
          confidence: 0.9,
          reasoning: '',
          patterns: [],
          complexity: 'low',
        }),
        buildFeatureMap: vi.fn().mockResolvedValue([]),
        routeRequestToFiles: vi.fn().mockResolvedValue(null),
      };

      // Call with optional parameters
      await mockEngine.findRelevantPatterns('problem', 'current.ts', 'selected code');
      expect(mockEngine.findRelevantPatterns).toHaveBeenCalledWith('problem', 'current.ts', 'selected code');

      // Call without optional parameters
      await mockEngine.findRelevantPatterns('problem');
      expect(mockEngine.findRelevantPatterns).toHaveBeenCalledWith('problem');
    });
  });

  describe('IRustBridgeService interface', () => {
    it('should be implementable with health monitoring', () => {
      const mockHealth: RustBridgeHealth = {
        isHealthy: true,
        circuitState: 'CLOSED',
        degradationMode: false,
        failureCount: 0,
        lastSuccessTime: new Date(),
        lastFailureTime: undefined,
      };

      const mockService: IRustBridgeService = {
        execute: vi.fn().mockResolvedValue('result'),
        getHealth: vi.fn().mockReturnValue(mockHealth),
        isInDegradedMode: vi.fn().mockReturnValue(false),
        forceReset: vi.fn(),
      };

      expect(mockService.getHealth()).toEqual(mockHealth);
      expect(mockService.isInDegradedMode()).toBe(false);
    });

    it('should support execute with fallback', async () => {
      let primaryCalled = false;
      let fallbackCalled = false;

      // Implementation for execute that handles generics properly
      const executeImpl = async <T>(operation: () => Promise<T>, fallback?: () => Promise<T>): Promise<T> => {
        try {
          primaryCalled = true;
          return await operation();
        } catch {
          if (fallback) {
            fallbackCalled = true;
            return await fallback();
          }
          throw new Error('No fallback');
        }
      };

      const mockService: IRustBridgeService = {
        execute: executeImpl,
        getHealth: vi.fn().mockReturnValue({ isHealthy: true, circuitState: 'CLOSED', degradationMode: false, failureCount: 0 }),
        isInDegradedMode: vi.fn().mockReturnValue(false),
        forceReset: vi.fn(),
      };

      // Test with successful operation
      const result = await mockService.execute(async () => 'success');
      expect(result).toBe('success');
      expect(primaryCalled).toBe(true);

      // Test with failing operation and fallback
      primaryCalled = false;
      const failingOp = async () => {
        throw new Error('fail');
      };
      const fallbackOp = async () => 'fallback';

      const fallbackResult = await mockService.execute(failingOp, fallbackOp);
      expect(fallbackResult).toBe('fallback');
      expect(fallbackCalled).toBe(true);
    });
  });

  describe('Supporting types', () => {
    it('SemanticSearchResult should have required fields', () => {
      const result: SemanticSearchResult = {
        concept: 'TestConcept',
        similarity: 0.95,
        filePath: '/path/to/file.ts',
      };

      expect(result.concept).toBe('TestConcept');
      expect(result.similarity).toBeGreaterThanOrEqual(0);
      expect(result.similarity).toBeLessThanOrEqual(1);
    });

    it('EntryPoint should have required fields', () => {
      const entryPoint: EntryPoint = {
        type: 'main',
        filePath: '/src/index.ts',
        framework: 'express',
      };

      expect(entryPoint.type).toBe('main');
      expect(entryPoint.filePath).toBeTruthy();
    });

    it('KeyDirectory should have required fields', () => {
      const keyDir: KeyDirectory = {
        path: '/src/components',
        type: 'components',
        fileCount: 15,
      };

      expect(keyDir.path).toBeTruthy();
      expect(keyDir.type).toBeTruthy();
      expect(keyDir.fileCount).toBeGreaterThanOrEqual(0);
    });

    it('ApproachPrediction should have required fields', () => {
      const prediction: ApproachPrediction = {
        approach: 'Add new component',
        confidence: 0.85,
        reasoning: 'Based on existing patterns',
        patterns: ['Factory', 'Singleton'],
        complexity: 'medium',
      };

      expect(prediction.approach).toBeTruthy();
      expect(prediction.confidence).toBeGreaterThanOrEqual(0);
      expect(prediction.confidence).toBeLessThanOrEqual(1);
      expect(['low', 'medium', 'high']).toContain(prediction.complexity);
    });

    it('FileRouting should have required fields', () => {
      const routing: FileRouting = {
        intendedFeature: 'Add authentication',
        targetFiles: ['/src/auth/login.ts', '/src/auth/logout.ts'],
        workType: 'feature',
        suggestedStartPoint: '/src/auth/login.ts',
        confidence: 0.9,
        reasoning: 'Matched keywords: auth, login. Found 2 relevant files.',
      };

      expect(routing.intendedFeature).toBeTruthy();
      expect(routing.targetFiles.length).toBeGreaterThan(0);
      expect(routing.suggestedStartPoint).toBeTruthy();
    });
  });
});
