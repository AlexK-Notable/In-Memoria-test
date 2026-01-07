/**
 * Tests for LearningService with Dependency Injection
 *
 * These tests verify that:
 * 1. LearningService can accept injected dependencies via constructor
 * 2. The static factory method maintains backward compatibility
 * 3. Mock dependencies can be used for testing
 * 4. The LearningServiceFactory pattern works correctly
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  LearningService,
  LearningDependencies,
  LearningServiceFactory,
  DefaultLearningServiceFactory,
  getDefaultFactory,
  setDefaultFactory,
  resetDefaultFactory,
  type ExtendedDatabase,
} from '../services/learning-service.js';
import type {
  ISemanticEngine,
  IPatternEngine,
  IStorageProvider,
  IVectorDatabase,
  CodebaseAnalysisResult,
  LearnedConcept,
  LearnedPattern,
  FeatureMapResult,
} from '../interfaces/engines.js';

// ============================================================================
// Mock Factory Helpers
// ============================================================================

/**
 * Create a mock storage provider
 */
function createMockDatabase(): IStorageProvider & ExtendedDatabase {
  return {
    insertSemanticConcept: vi.fn(),
    insertSemanticConceptsBatch: vi.fn(),
    getSemanticConcepts: vi.fn().mockReturnValue([]),
    insertDeveloperPattern: vi.fn(),
    insertDeveloperPatternsBatch: vi.fn(),
    getDeveloperPatterns: vi.fn().mockReturnValue([]),
    getFeatureMaps: vi.fn().mockReturnValue([]),
    insertFeatureMap: vi.fn(),
    transaction: vi.fn((fn) => fn()),
    // ExtendedDatabase methods
    getProjectMetadata: vi.fn().mockReturnValue(null),
    insertProjectMetadata: vi.fn(),
    insertEntryPoint: vi.fn(),
    insertKeyDirectory: vi.fn(),
    close: vi.fn(),
  };
}

/**
 * Create a mock vector database
 */
function createMockVectorDB(): IVectorDatabase {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    storeCodeEmbedding: vi.fn().mockResolvedValue(undefined),
    storeMultipleEmbeddings: vi.fn().mockResolvedValue(undefined),
    findSimilarCode: vi.fn().mockResolvedValue([]),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

/**
 * Create a mock semantic engine
 */
function createMockSemanticEngine(): ISemanticEngine {
  const mockConcepts: LearnedConcept[] = [
    {
      id: 'concept-1',
      name: 'TestClass',
      type: 'class',
      confidence: 0.9,
      filePath: '/test/file.ts',
      lineRange: { start: 1, end: 10 },
      relationships: {},
    },
    {
      id: 'concept-2',
      name: 'testFunction',
      type: 'function',
      confidence: 0.85,
      filePath: '/test/file.ts',
      lineRange: { start: 12, end: 20 },
      relationships: {},
    },
  ];

  const mockAnalysis: CodebaseAnalysisResult = {
    languages: ['typescript'],
    frameworks: ['node', 'express'],
    concepts: [],
    complexity: {
      cyclomatic: 5.5,
      cognitive: 3.2,
      lines: 1000,
    },
    entryPoints: [
      { type: 'main', filePath: '/src/index.ts' },
    ],
    keyDirectories: [
      { path: '/src', type: 'source', fileCount: 50 },
    ],
  };

  return {
    analyzeCodebase: vi.fn().mockResolvedValue(mockAnalysis),
    analyzeFileContent: vi.fn().mockResolvedValue([]),
    learnFromCodebase: vi.fn().mockResolvedValue(mockConcepts),
    searchSemanticallySimilar: vi.fn().mockResolvedValue([]),
    detectEntryPoints: vi.fn().mockResolvedValue([]),
    mapKeyDirectories: vi.fn().mockResolvedValue([]),
    getCacheStats: vi.fn().mockReturnValue({
      fileCache: { size: 0 },
      codebaseCache: { size: 0 },
    }),
    cleanup: vi.fn(),
  };
}

/**
 * Create a mock pattern engine
 */
function createMockPatternEngine(): IPatternEngine {
  const mockPatterns: LearnedPattern[] = [
    {
      id: 'pattern-1',
      type: 'naming_convention',
      content: { description: 'camelCase naming' },
      frequency: 10,
      confidence: 0.9,
      contexts: ['functions', 'variables'],
      examples: [{ code: 'const myVariable = 1;' }],
    },
  ];

  const mockFeatureMaps: FeatureMapResult[] = [
    {
      id: 'feature-1',
      featureName: 'Authentication',
      primaryFiles: ['/src/auth.ts'],
      relatedFiles: ['/src/user.ts'],
      dependencies: [],
    },
  ];

  return {
    extractPatterns: vi.fn().mockResolvedValue([]),
    analyzeFilePatterns: vi.fn().mockResolvedValue([]),
    learnFromCodebase: vi.fn().mockResolvedValue(mockPatterns),
    findRelevantPatterns: vi.fn().mockResolvedValue([]),
    predictApproach: vi.fn().mockResolvedValue({
      approach: 'test',
      confidence: 0.9,
      reasoning: 'test reasoning',
      patterns: [],
      complexity: 'low',
    }),
    buildFeatureMap: vi.fn().mockResolvedValue(mockFeatureMaps),
    routeRequestToFiles: vi.fn().mockResolvedValue(null),
  };
}

/**
 * Create mock dependencies for testing
 */
function createMockDependencies(): LearningDependencies {
  return {
    database: createMockDatabase(),
    vectorDB: createMockVectorDB(),
    semanticEngine: createMockSemanticEngine(),
    patternEngine: createMockPatternEngine(),
  };
}

/**
 * Create a mock learning service factory
 */
class MockLearningFactory implements LearningServiceFactory {
  public createdDeps: LearningDependencies[] = [];
  private mockDeps: Partial<LearningDependencies>;

  constructor(mockDeps: Partial<LearningDependencies> = {}) {
    this.mockDeps = mockDeps;
  }

  createForProject(_projectPath: string): LearningDependencies {
    const deps: LearningDependencies = {
      database: this.mockDeps.database ?? createMockDatabase(),
      vectorDB: this.mockDeps.vectorDB ?? createMockVectorDB(),
      semanticEngine: this.mockDeps.semanticEngine ?? createMockSemanticEngine(),
      patternEngine: this.mockDeps.patternEngine ?? createMockPatternEngine(),
    };
    this.createdDeps.push(deps);
    return deps;
  }
}

// ============================================================================
// Tests
// ============================================================================

describe('LearningService', () => {
  afterEach(() => {
    // Reset the default factory after each test
    resetDefaultFactory();
    vi.clearAllMocks();
  });

  describe('Constructor Dependency Injection', () => {
    it('should accept dependencies via constructor', () => {
      const mockDeps = createMockDependencies();
      const service = new LearningService(mockDeps, '/test/project');

      expect(service).toBeInstanceOf(LearningService);
      expect(service.getDependencies()).toBe(mockDeps);
    });

    it('should use injected database for learning', async () => {
      const mockDeps = createMockDependencies();
      const service = new LearningService(mockDeps, '/test/project');

      await service.learn({ force: true });

      // Verify database was used
      expect(mockDeps.database.insertSemanticConcept).toHaveBeenCalled();
      expect(mockDeps.database.insertDeveloperPattern).toHaveBeenCalled();
    });

    it('should use injected semantic engine for analysis', async () => {
      const mockDeps = createMockDependencies();
      const service = new LearningService(mockDeps, '/test/project');

      await service.learn({ force: true });

      expect(mockDeps.semanticEngine.analyzeCodebase).toHaveBeenCalledWith('/test/project');
      expect(mockDeps.semanticEngine.learnFromCodebase).toHaveBeenCalled();
    });

    it('should use injected pattern engine for pattern detection', async () => {
      const mockDeps = createMockDependencies();
      const service = new LearningService(mockDeps, '/test/project');

      await service.learn({ force: true });

      expect(mockDeps.patternEngine.learnFromCodebase).toHaveBeenCalled();
      expect(mockDeps.patternEngine.buildFeatureMap).toHaveBeenCalledWith('/test/project');
    });

    it('should use injected vector database for embeddings', async () => {
      const mockDeps = createMockDependencies();
      const service = new LearningService(mockDeps, '/test/project');

      await service.learn({ force: true });

      expect(mockDeps.vectorDB.initialize).toHaveBeenCalledWith('in-memoria-intelligence');
      expect(mockDeps.vectorDB.storeCodeEmbedding).toHaveBeenCalled();
    });

    it('should cleanup resources after learning', async () => {
      const mockDeps = createMockDependencies();
      const mockCleanup = vi.fn();
      (mockDeps.semanticEngine as any).cleanup = mockCleanup;

      const service = new LearningService(mockDeps, '/test/project');
      await service.learn({ force: true });

      expect(mockDeps.vectorDB.close).toHaveBeenCalled();
      expect((mockDeps.database as ExtendedDatabase).close).toHaveBeenCalled();
    });
  });

  describe('Instance learn() method', () => {
    it('should return successful result with learning statistics', async () => {
      const mockDeps = createMockDependencies();
      const service = new LearningService(mockDeps, '/test/project');

      const result = await service.learn({ force: true });

      expect(result.success).toBe(true);
      expect(result.conceptsLearned).toBe(2); // From mockSemanticEngine
      expect(result.patternsLearned).toBe(1); // From mockPatternEngine
      expect(result.featuresLearned).toBe(1); // From mockPatternEngine
      expect(result.insights.length).toBeGreaterThan(0);
      expect(result.timeElapsed).toBeGreaterThanOrEqual(0); // Can be 0 for very fast operations
    });

    it('should return blueprint with architecture info', async () => {
      const mockDeps = createMockDependencies();
      const service = new LearningService(mockDeps, '/test/project');

      const result = await service.learn({ force: true });

      expect(result.blueprint).toMatchObject({
        techStack: ['node', 'express'],
        entryPoints: { main: '/src/index.ts' },
      });
    });

    it('should skip learning if existing intelligence and force is false', async () => {
      const mockDeps = createMockDependencies();
      // Mock existing concepts
      (mockDeps.database.getSemanticConcepts as any).mockReturnValue([{ id: '1' }]);

      const service = new LearningService(mockDeps, '/test/project');
      const result = await service.learn({ force: false });

      expect(result.success).toBe(true);
      expect(result.insights).toContain('Using existing intelligence (use force: true to re-learn)');
      expect(mockDeps.semanticEngine.learnFromCodebase).not.toHaveBeenCalled();
    });

    it('should force re-learn when force option is true', async () => {
      const mockDeps = createMockDependencies();
      // Mock existing concepts
      (mockDeps.database.getSemanticConcepts as any).mockReturnValue([{ id: '1' }]);

      const service = new LearningService(mockDeps, '/test/project');
      const result = await service.learn({ force: true });

      expect(result.success).toBe(true);
      expect(mockDeps.semanticEngine.learnFromCodebase).toHaveBeenCalled();
    });

    it('should call progress callback during learning', async () => {
      const mockDeps = createMockDependencies();
      const progressCallback = vi.fn();

      const service = new LearningService(mockDeps, '/test/project');
      await service.learn({ force: true, progressCallback });

      // Progress callback is passed to semantic and pattern engines
      expect(mockDeps.semanticEngine.learnFromCodebase).toHaveBeenCalledWith(
        '/test/project',
        progressCallback
      );
      expect(mockDeps.patternEngine.learnFromCodebase).toHaveBeenCalledWith(
        '/test/project',
        progressCallback
      );
    });

    it('should handle errors gracefully', async () => {
      const mockDeps = createMockDependencies();
      const error = new Error('Database connection failed');
      (mockDeps.semanticEngine.analyzeCodebase as any).mockRejectedValue(error);

      const service = new LearningService(mockDeps, '/test/project');
      const result = await service.learn({ force: true });

      expect(result.success).toBe(false);
      expect(result.insights[0]).toContain('Database connection failed');
    });
  });

  describe('Static learnFromCodebase() backward compatibility', () => {
    it('should work with default factory (backward compatible API)', async () => {
      const mockFactory = new MockLearningFactory();
      setDefaultFactory(mockFactory);

      const result = await LearningService.learnFromCodebase('/test/project', { force: true });

      expect(result.success).toBe(true);
      expect(mockFactory.createdDeps.length).toBe(1);
    });

    it('should accept optional custom factory', async () => {
      const mockFactory = new MockLearningFactory();

      const result = await LearningService.learnFromCodebase(
        '/test/project',
        { force: true },
        mockFactory
      );

      expect(result.success).toBe(true);
      expect(mockFactory.createdDeps.length).toBe(1);
    });

    it('should pass options through to learn()', async () => {
      const mockSemanticEngine = createMockSemanticEngine();
      const mockFactory = new MockLearningFactory({ semanticEngine: mockSemanticEngine });
      const progressCallback = vi.fn();

      await LearningService.learnFromCodebase(
        '/test/project',
        { force: true, progressCallback },
        mockFactory
      );

      expect(mockSemanticEngine.learnFromCodebase).toHaveBeenCalledWith(
        '/test/project',
        progressCallback
      );
    });
  });

  describe('LearningServiceFactory', () => {
    it('should provide MockLearningFactory for testing', () => {
      const mockFactory = new MockLearningFactory();
      const deps = mockFactory.createForProject('/test/project');

      expect(deps).toMatchObject({
        database: expect.any(Object),
        vectorDB: expect.any(Object),
        semanticEngine: expect.any(Object),
        patternEngine: expect.any(Object),
      });
    });

    it('should track created dependencies for verification', () => {
      const mockFactory = new MockLearningFactory();

      mockFactory.createForProject('/project1');
      mockFactory.createForProject('/project2');

      expect(mockFactory.createdDeps.length).toBe(2);
    });

    it('should allow custom mock dependencies', () => {
      const customSemanticEngine = createMockSemanticEngine();
      const mockFactory = new MockLearningFactory({
        semanticEngine: customSemanticEngine,
      });

      const deps = mockFactory.createForProject('/test/project');

      expect(deps.semanticEngine).toBe(customSemanticEngine);
    });
  });

  describe('Factory management functions', () => {
    it('getDefaultFactory should return a factory', () => {
      const factory = getDefaultFactory();

      expect(factory).toMatchObject({
        createForProject: expect.any(Function),
      });
    });

    it('setDefaultFactory should override the default factory', () => {
      const mockFactory = new MockLearningFactory();
      setDefaultFactory(mockFactory);

      const factory = getDefaultFactory();
      expect(factory).toBe(mockFactory);
    });

    it('resetDefaultFactory should clear the factory', () => {
      const mockFactory = new MockLearningFactory();
      setDefaultFactory(mockFactory);
      resetDefaultFactory();

      // After reset, getDefaultFactory should create a new default factory
      const factory = getDefaultFactory();
      expect(factory).not.toBe(mockFactory);
    });
  });

  describe('Feature map storage', () => {
    it('should store valid feature maps', async () => {
      const mockDeps = createMockDependencies();
      const service = new LearningService(mockDeps, '/test/project');

      await service.learn({ force: true });

      expect(mockDeps.database.insertFeatureMap).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'feature-1',
          projectPath: '/test/project',
          featureName: 'Authentication',
        })
      );
    });

    it('should skip feature maps with missing id', async () => {
      const mockDeps = createMockDependencies();
      (mockDeps.patternEngine.buildFeatureMap as any).mockResolvedValue([
        { featureName: 'NoId', primaryFiles: [] }, // Missing id
        { id: 'valid', featureName: 'Valid', primaryFiles: [] },
      ]);

      const service = new LearningService(mockDeps, '/test/project');
      const result = await service.learn({ force: true });

      expect(mockDeps.database.insertFeatureMap).toHaveBeenCalledTimes(1);
      expect(result.featuresLearned).toBe(1);
    });

    it('should skip feature maps with missing featureName', async () => {
      const mockDeps = createMockDependencies();
      (mockDeps.patternEngine.buildFeatureMap as any).mockResolvedValue([
        { id: 'noname', primaryFiles: [] }, // Missing featureName
        { id: 'valid', featureName: 'Valid', primaryFiles: [] },
      ]);

      const service = new LearningService(mockDeps, '/test/project');
      const result = await service.learn({ force: true });

      expect(mockDeps.database.insertFeatureMap).toHaveBeenCalledTimes(1);
      expect(result.featuresLearned).toBe(1);
    });
  });

  describe('Project metadata handling', () => {
    it('should create project metadata if not exists', async () => {
      const mockDeps = createMockDependencies();
      (mockDeps.database as ExtendedDatabase).getProjectMetadata = vi.fn().mockReturnValue(null);

      const service = new LearningService(mockDeps, '/test/project');
      await service.learn({ force: true });

      expect((mockDeps.database as ExtendedDatabase).insertProjectMetadata).toHaveBeenCalledWith(
        expect.objectContaining({
          projectPath: '/test/project',
          languagePrimary: 'typescript',
          languagesDetected: ['typescript'],
          frameworkDetected: ['node', 'express'],
        })
      );
    });

    it('should not create project metadata if already exists', async () => {
      const mockDeps = createMockDependencies();
      (mockDeps.database as ExtendedDatabase).getProjectMetadata = vi.fn().mockReturnValue({
        projectId: 'existing',
      });

      const service = new LearningService(mockDeps, '/test/project');
      await service.learn({ force: true });

      expect((mockDeps.database as ExtendedDatabase).insertProjectMetadata).not.toHaveBeenCalled();
    });
  });
});

describe('DefaultLearningServiceFactory', () => {
  it('should be a valid factory implementation', () => {
    // This test just verifies the type is correct
    const factory: LearningServiceFactory = new DefaultLearningServiceFactory();
    expect(factory).toMatchObject({
      createForProject: expect.any(Function),
    });
  });

  // Note: We don't test DefaultLearningServiceFactory.createForProject() directly
  // because it creates real database connections. Integration tests would cover this.
});
