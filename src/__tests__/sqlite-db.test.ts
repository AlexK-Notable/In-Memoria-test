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
});