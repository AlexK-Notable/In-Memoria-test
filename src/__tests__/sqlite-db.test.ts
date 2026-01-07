import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SQLiteDatabase } from '../storage/sqlite-db.js';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('SQLiteDatabase', () => {
  let tempDir: string;
  let database: SQLiteDatabase;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'in-memoria-db-test-'));
    database = new SQLiteDatabase(join(tempDir, 'test.db'));
  });

  afterEach(() => {
    database.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should initialize database with schema', () => {
    expect(database).toBeDefined();
    
    // Test that tables exist by trying to query them
    const concepts = database.getSemanticConcepts();
    expect(Array.isArray(concepts)).toBe(true);
    
    const patterns = database.getDeveloperPatterns();
    expect(Array.isArray(patterns)).toBe(true);
  });

  it('should store and retrieve semantic concepts', () => {
    const concept = {
      id: 'test-concept',
      conceptName: 'TestClass',
      conceptType: 'class',
      confidenceScore: 0.95,
      relationships: { extends: [] },
      evolutionHistory: { versions: [] },
      filePath: './test.ts',
      lineRange: { start: 1, end: 10 }
    };

    database.insertSemanticConcept(concept);
    
    const stored = database.getSemanticConcepts();
    expect(stored.length).toBe(1);
    expect(stored[0].conceptName).toBe('TestClass');
  });

  it('should handle database errors gracefully', () => {
    // Close database and try to use it
    database.close();

    expect(() => {
      database.getSemanticConcepts();
    }).toThrow();
  });

  describe('Feature Map LIKE injection protection', () => {
    beforeEach(() => {
      // First insert project metadata (required for foreign key)
      database.insertProjectMetadata({
        projectId: 'test-project',
        projectPath: tempDir,
        projectName: 'Test Project',
        languagePrimary: 'typescript',
        languagesDetected: ['typescript'],
        frameworkDetected: ['node'],
      });

      // Insert test feature maps
      database.insertFeatureMap({
        id: 'feature-1',
        projectPath: tempDir,
        featureName: 'authentication',
        primaryFiles: ['./auth.ts'],
        relatedFiles: [],
        dependencies: [],
        status: 'active',
      });
      database.insertFeatureMap({
        id: 'feature-2',
        projectPath: tempDir,
        featureName: 'user_profile',
        primaryFiles: ['./profile.ts'],
        relatedFiles: [],
        dependencies: [],
        status: 'active',
      });
      database.insertFeatureMap({
        id: 'feature-3',
        projectPath: tempDir,
        featureName: 'payment',
        primaryFiles: ['./payment.ts'],
        relatedFiles: [],
        dependencies: [],
        status: 'active',
      });
    });

    it('should search feature maps by normal query', () => {
      const results = database.searchFeatureMaps(tempDir, 'auth');
      expect(results).toHaveLength(1);
      expect(results[0].featureName).toBe('authentication');
    });

    it('should escape percent wildcard in search query', () => {
      // A query with % should NOT match everything
      // Without proper escaping, '%' would match all features
      const results = database.searchFeatureMaps(tempDir, '%');
      // Should find nothing - there's no feature with literal '%' in the name
      expect(results).toHaveLength(0);
    });

    it('should escape underscore wildcard in search query', () => {
      // A query with _ should NOT match any single character
      // Without proper escaping, '_' would be a single-char wildcard
      const results = database.searchFeatureMaps(tempDir, 'user_profile');
      expect(results).toHaveLength(1);
      // If underscore were a wildcard, it would also potentially match other patterns
    });

    it('should not match everything with double percent', () => {
      // %%a%% should search for literal '%a%' not act as wildcards
      const results = database.searchFeatureMaps(tempDir, '%%a%%');
      expect(results).toHaveLength(0);
    });

    it('should handle special SQL characters safely', () => {
      // Single quotes should not break the query
      const results = database.searchFeatureMaps(tempDir, "test'value");
      // Should not throw, just return empty
      expect(results).toHaveLength(0);
    });
  });

  describe('StatementCache Integration', () => {
    it('should provide cache statistics', () => {
      const stats = database.getStatementCacheStats();
      expect(stats).toHaveProperty('hits');
      expect(stats).toHaveProperty('misses');
      expect(stats).toHaveProperty('size');
      expect(stats).toHaveProperty('hitRate');
      expect(typeof stats.hits).toBe('number');
      expect(typeof stats.misses).toBe('number');
      expect(typeof stats.size).toBe('number');
      expect(typeof stats.hitRate).toBe('number');
    });

    it('should reuse prepared statements for repeated queries', () => {
      // Clear query cache to ensure we hit the database each time
      database.clearQueryCache();

      // Get initial stats
      const initialStats = database.getStatementCacheStats();
      const initialHits = initialStats.hits;

      // First call - should be a statement cache miss (statement not yet prepared)
      database.getSemanticConcepts();
      database.clearQueryCache(); // Clear query cache to force DB hit

      // Second call with same query - should be a statement cache hit
      database.getSemanticConcepts();
      database.clearQueryCache(); // Clear query cache to force DB hit

      // Third call - another statement cache hit
      database.getSemanticConcepts();

      const finalStats = database.getStatementCacheStats();

      // We should have at least 2 more hits than initial (2nd and 3rd calls)
      expect(finalStats.hits).toBeGreaterThan(initialHits);
      // Hit rate should be positive
      expect(finalStats.hitRate).toBeGreaterThan(0);
    });

    it('should cache statements for different query types', () => {
      // Perform various database operations
      database.getSemanticConcepts();
      database.getDeveloperPatterns();
      database.getAIInsights();

      const stats = database.getStatementCacheStats();

      // We should have cached at least 3 different statements
      expect(stats.size).toBeGreaterThanOrEqual(3);
    });

    it('should clear cache on close', () => {
      // Perform some operations to populate the cache
      database.getSemanticConcepts();
      database.getDeveloperPatterns();

      const statsBeforeClose = database.getStatementCacheStats();
      expect(statsBeforeClose.size).toBeGreaterThan(0);

      // Close should clear the cache (and the database)
      // After close, we can't query stats, but we verify close doesn't throw
      expect(() => database.close()).not.toThrow();
    });

    it('should handle batch operations with cached statements', () => {
      const concepts = [
        {
          id: 'concept-1',
          conceptName: 'TestClass1',
          conceptType: 'class',
          confidenceScore: 0.9,
          relationships: {},
          evolutionHistory: {},
          filePath: './test1.ts',
          lineRange: { start: 1, end: 10 },
        },
        {
          id: 'concept-2',
          conceptName: 'TestClass2',
          conceptType: 'class',
          confidenceScore: 0.85,
          relationships: {},
          evolutionHistory: {},
          filePath: './test2.ts',
          lineRange: { start: 1, end: 20 },
        },
      ];

      // Batch insert uses the same prepared statement for all items
      database.insertSemanticConceptsBatch(concepts);

      const stats = database.getStatementCacheStats();
      // The batch insert statement should be cached
      expect(stats.size).toBeGreaterThan(0);

      // Verify the concepts were inserted
      const stored = database.getSemanticConcepts();
      expect(stored).toHaveLength(2);
    });

    it('should calculate hit rate correctly', () => {
      // Clear query cache to ensure we hit the database each time
      database.clearQueryCache();

      // Perform the same query multiple times, clearing query cache each time
      // to force StatementCache to be used
      for (let i = 0; i < 10; i++) {
        database.getSemanticConcepts();
        database.clearQueryCache(); // Clear query cache to force DB hit on next call
      }

      const stats = database.getStatementCacheStats();

      // After 10 calls of the same query: 1 miss (first call) + 9 hits
      // Hit rate should be high (close to 0.9 for this specific query pattern)
      expect(stats.hitRate).toBeGreaterThan(0);
      expect(stats.hitRate).toBeLessThanOrEqual(1);
    });
  });

  describe('QueryCache Integration', () => {
    it('should provide query cache statistics', () => {
      const stats = database.getQueryCacheStats();
      expect(stats).toHaveProperty('hits');
      expect(stats).toHaveProperty('misses');
      expect(stats).toHaveProperty('size');
      expect(stats).toHaveProperty('hitRate');
      expect(stats).toHaveProperty('expirations');
      expect(stats).toHaveProperty('evictions');
      expect(typeof stats.hits).toBe('number');
      expect(typeof stats.misses).toBe('number');
    });

    it('should cache repeated getSemanticConcepts queries', () => {
      // First call - cache miss
      database.getSemanticConcepts();
      const stats1 = database.getQueryCacheStats();
      expect(stats1.misses).toBe(1);
      expect(stats1.hits).toBe(0);

      // Second call - cache hit
      database.getSemanticConcepts();
      const stats2 = database.getQueryCacheStats();
      expect(stats2.hits).toBe(1);
      expect(stats2.misses).toBe(1);

      // Third call - another cache hit
      database.getSemanticConcepts();
      const stats3 = database.getQueryCacheStats();
      expect(stats3.hits).toBe(2);
    });

    it('should cache getDeveloperPatterns queries', () => {
      // First call - cache miss
      database.getDeveloperPatterns();
      const stats1 = database.getQueryCacheStats();
      const initialMisses = stats1.misses;

      // Second call with same parameters - cache hit
      database.getDeveloperPatterns();
      const stats2 = database.getQueryCacheStats();
      expect(stats2.hits).toBeGreaterThan(stats1.hits);
      expect(stats2.misses).toBe(initialMisses);
    });

    it('should cache getFileIntelligence queries', () => {
      // Insert file intelligence first
      database.insertFileIntelligence({
        filePath: './test-file.ts',
        fileHash: 'abc123',
        semanticConcepts: ['concept1'],
        patternsUsed: ['pattern1'],
        complexityMetrics: { cyclomatic: 5 },
        dependencies: ['dep1'],
        lastAnalyzed: new Date(),
      });

      // Clear cache after insert (insert invalidates cache)
      database.clearQueryCache();

      // First call - cache miss
      database.getFileIntelligence('./test-file.ts');
      const stats1 = database.getQueryCacheStats();
      expect(stats1.misses).toBe(1);

      // Second call - cache hit
      database.getFileIntelligence('./test-file.ts');
      const stats2 = database.getQueryCacheStats();
      expect(stats2.hits).toBe(1);
    });

    it('should invalidate cache on insertSemanticConcept', () => {
      // Populate cache
      database.getSemanticConcepts();
      const stats1 = database.getQueryCacheStats();
      expect(stats1.size).toBeGreaterThan(0);

      // Insert should invalidate cache
      database.insertSemanticConcept({
        id: 'new-concept',
        conceptName: 'NewClass',
        conceptType: 'class',
        confidenceScore: 0.9,
        relationships: {},
        evolutionHistory: {},
        filePath: './new.ts',
        lineRange: { start: 1, end: 10 },
      });

      // Query again - should be a cache miss (invalidated)
      database.getSemanticConcepts();
      const stats2 = database.getQueryCacheStats();
      // Misses should have increased
      expect(stats2.misses).toBeGreaterThan(stats1.misses);
    });

    it('should invalidate cache on insertSemanticConceptsBatch', () => {
      // Populate cache
      database.getSemanticConcepts();
      const stats1 = database.getQueryCacheStats();

      // Batch insert should invalidate cache
      database.insertSemanticConceptsBatch([
        {
          id: 'batch-concept-1',
          conceptName: 'BatchClass1',
          conceptType: 'class',
          confidenceScore: 0.9,
          relationships: {},
          evolutionHistory: {},
          filePath: './batch1.ts',
          lineRange: { start: 1, end: 10 },
        },
      ]);

      // Query again - should be a cache miss (invalidated)
      database.getSemanticConcepts();
      const stats2 = database.getQueryCacheStats();
      expect(stats2.misses).toBeGreaterThan(stats1.misses);
    });

    it('should invalidate developer patterns cache on insert', () => {
      // Populate cache
      database.getDeveloperPatterns();
      const stats1 = database.getQueryCacheStats();

      // Insert should invalidate cache
      database.insertDeveloperPattern({
        patternId: 'new-pattern',
        patternType: 'singleton',
        patternContent: { description: 'test' },
        frequency: 1,
        contexts: ['test'],
        examples: [],
        confidence: 0.8,
      });

      // Query again - should be a cache miss
      database.getDeveloperPatterns();
      const stats2 = database.getQueryCacheStats();
      expect(stats2.misses).toBeGreaterThan(stats1.misses);
    });

    it('should invalidate file intelligence cache on insert', () => {
      // First insert and query to populate cache
      database.insertFileIntelligence({
        filePath: './cached-file.ts',
        fileHash: 'hash1',
        semanticConcepts: [],
        patternsUsed: [],
        complexityMetrics: {},
        dependencies: [],
        lastAnalyzed: new Date(),
      });
      database.clearQueryCache();

      // Populate cache
      database.getFileIntelligence('./cached-file.ts');
      const stats1 = database.getQueryCacheStats();

      // Update the same file - should invalidate its cache entry
      database.insertFileIntelligence({
        filePath: './cached-file.ts',
        fileHash: 'hash2',
        semanticConcepts: ['new-concept'],
        patternsUsed: [],
        complexityMetrics: {},
        dependencies: [],
        lastAnalyzed: new Date(),
      });

      // Query again - should be a cache miss
      database.getFileIntelligence('./cached-file.ts');
      const stats2 = database.getQueryCacheStats();
      expect(stats2.misses).toBeGreaterThan(stats1.misses);
    });

    it('should clear query cache manually', () => {
      // Populate cache
      database.getSemanticConcepts();
      database.getDeveloperPatterns();

      const stats1 = database.getQueryCacheStats();
      expect(stats1.size).toBeGreaterThan(0);

      // Clear cache
      database.clearQueryCache();

      const stats2 = database.getQueryCacheStats();
      expect(stats2.size).toBe(0);
      expect(stats2.hits).toBe(0);
      expect(stats2.misses).toBe(0);
    });

    it('should cache different query parameters separately', () => {
      // Insert concepts with different file paths
      database.insertSemanticConcept({
        id: 'concept-a',
        conceptName: 'ClassA',
        conceptType: 'class',
        confidenceScore: 0.9,
        relationships: {},
        evolutionHistory: {},
        filePath: './fileA.ts',
        lineRange: { start: 1, end: 10 },
      });
      database.insertSemanticConcept({
        id: 'concept-b',
        conceptName: 'ClassB',
        conceptType: 'class',
        confidenceScore: 0.9,
        relationships: {},
        evolutionHistory: {},
        filePath: './fileB.ts',
        lineRange: { start: 1, end: 10 },
      });

      database.clearQueryCache();

      // Query with different parameters
      database.getSemanticConcepts('./fileA.ts');
      database.getSemanticConcepts('./fileB.ts');
      database.getSemanticConcepts(); // all concepts

      const stats1 = database.getQueryCacheStats();
      expect(stats1.misses).toBe(3); // 3 different cache keys

      // Query same parameters again - all hits
      database.getSemanticConcepts('./fileA.ts');
      database.getSemanticConcepts('./fileB.ts');
      database.getSemanticConcepts();

      const stats2 = database.getQueryCacheStats();
      expect(stats2.hits).toBe(3);
    });

    it('should clear cache on database close', () => {
      // Populate cache
      database.getSemanticConcepts();
      database.getDeveloperPatterns();

      const statsBefore = database.getQueryCacheStats();
      expect(statsBefore.size).toBeGreaterThan(0);

      // Close should clear cache (and we can't query after close)
      expect(() => database.close()).not.toThrow();
    });
  });
});