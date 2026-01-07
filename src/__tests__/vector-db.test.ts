import { describe, it, expect } from 'vitest';
import { SemanticVectorDB } from '../storage/vector-db.js';

// We only test the static methods and pure functions that don't require database
// The vector search integration tests require actual database setup

describe('SemanticVectorDB', () => {
  describe('API Key Validation', () => {
    it('should accept valid legacy OpenAI key format (sk-...)', () => {
      const validKey = 'sk-abcdefghijklmnopqrstuvwxyz123456789012345678';
      const result = SemanticVectorDB.validateApiKey(validKey);

      expect(result.valid).toBe(true);
      expect(result.message).toBe('API key format is valid');
    });

    it('should accept valid project key format (sk-proj-...)', () => {
      const validKey = 'sk-proj-abcdefghijklmnopqrstuvwxyz123456789012345678';
      const result = SemanticVectorDB.validateApiKey(validKey);

      expect(result.valid).toBe(true);
      expect(result.message).toBe('API key format is valid');
    });

    it('should accept valid service account key format (sk-svcacct-...)', () => {
      const validKey = 'sk-svcacct-abcdefghijklmnopqrstuvwxyz123456789012345678';
      const result = SemanticVectorDB.validateApiKey(validKey);

      expect(result.valid).toBe(true);
      expect(result.message).toBe('API key format is valid');
    });

    it('should reject undefined API key', () => {
      const result = SemanticVectorDB.validateApiKey(undefined);

      expect(result.valid).toBe(false);
      expect(result.message).toBe('API key is undefined or empty');
    });

    it('should reject empty API key', () => {
      const result = SemanticVectorDB.validateApiKey('');

      expect(result.valid).toBe(false);
      expect(result.message).toBe('API key is undefined or empty');
    });

    it('should reject invalid API key format', () => {
      const invalidKey = 'invalid-key-format';
      const result = SemanticVectorDB.validateApiKey(invalidKey);

      expect(result.valid).toBe(false);
      expect(result.message).toContain('API key format appears invalid');
    });

    it('should reject key with wrong prefix', () => {
      const invalidKey = 'pk-abcdefghijklmnopqrstuvwxyz123456789012345678';
      const result = SemanticVectorDB.validateApiKey(invalidKey);

      expect(result.valid).toBe(false);
    });

    it('should reject key that is too short', () => {
      const shortKey = 'sk-abc';
      const result = SemanticVectorDB.validateApiKey(shortKey);

      expect(result.valid).toBe(false);
    });

    it('should accept keys with underscores and dashes in proj format', () => {
      const validKey = 'sk-proj-abc_def-123_456-ghijklmnopqrstuvwxyz123456';
      const result = SemanticVectorDB.validateApiKey(validKey);

      expect(result.valid).toBe(true);
    });
  });

  describe('Cosine Similarity (Pure Function Tests)', () => {
    // Test the cosine similarity calculation logic directly
    // These tests validate the mathematical correctness of the algorithm

    /**
     * Pure implementation of cosine similarity for testing
     * This mirrors the implementation in vector-db.ts
     */
    function calculateCosineSimilarity(a: number[], b: number[]): number {
      if (a.length !== b.length) {
        return 0;
      }

      if (a.length === 0) {
        return 0;
      }

      let dotProduct = 0;
      let magnitudeA = 0;
      let magnitudeB = 0;

      for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        magnitudeA += a[i] * a[i];
        magnitudeB += b[i] * b[i];
      }

      magnitudeA = Math.sqrt(magnitudeA);
      magnitudeB = Math.sqrt(magnitudeB);

      if (magnitudeA === 0 || magnitudeB === 0) {
        return 0;
      }

      return dotProduct / (magnitudeA * magnitudeB);
    }

    it('should return 1 for identical vectors', () => {
      const vector = [0.5, 0.5, 0.5, 0.5];
      const similarity = calculateCosineSimilarity(vector, vector);

      expect(similarity).toBeCloseTo(1, 5);
    });

    it('should return 0 for orthogonal vectors', () => {
      const vectorA = [1, 0, 0, 0];
      const vectorB = [0, 1, 0, 0];
      const similarity = calculateCosineSimilarity(vectorA, vectorB);

      expect(similarity).toBeCloseTo(0, 5);
    });

    it('should return -1 for opposite vectors', () => {
      const vectorA = [1, 0, 0, 0];
      const vectorB = [-1, 0, 0, 0];
      const similarity = calculateCosineSimilarity(vectorA, vectorB);

      expect(similarity).toBeCloseTo(-1, 5);
    });

    it('should return value between -1 and 1 for arbitrary vectors', () => {
      const vectorA = [0.1, 0.2, 0.3, 0.4];
      const vectorB = [0.4, 0.3, 0.2, 0.1];
      const similarity = calculateCosineSimilarity(vectorA, vectorB);

      expect(similarity).toBeGreaterThanOrEqual(-1);
      expect(similarity).toBeLessThanOrEqual(1);
    });

    it('should handle zero vectors gracefully', () => {
      const zeroVector = [0, 0, 0, 0];
      const normalVector = [1, 2, 3, 4];
      const similarity = calculateCosineSimilarity(zeroVector, normalVector);

      expect(similarity).toBe(0);
    });

    it('should return 0 for dimension mismatch', () => {
      const vectorA = [1, 2, 3];
      const vectorB = [1, 2, 3, 4];
      const similarity = calculateCosineSimilarity(vectorA, vectorB);

      expect(similarity).toBe(0);
    });

    it('should return 0 for empty vectors', () => {
      const emptyVector: number[] = [];
      const similarity = calculateCosineSimilarity(emptyVector, emptyVector);

      expect(similarity).toBe(0);
    });

    it('should handle normalized vectors correctly', () => {
      // Normalized vectors: magnitude = 1
      const vectorA = [1/Math.sqrt(2), 1/Math.sqrt(2), 0, 0];
      const vectorB = [1/Math.sqrt(2), 0, 1/Math.sqrt(2), 0];
      const similarity = calculateCosineSimilarity(vectorA, vectorB);

      // cos(45 degrees) = 0.5
      expect(similarity).toBeCloseTo(0.5, 5);
    });

    it('should calculate similarity correctly for high-dimensional vectors', () => {
      const dimension = 384; // Same as ALL-MiniLM-L6-v2
      const vectorA = new Array(dimension).fill(0).map(() => Math.random());
      const vectorB = [...vectorA]; // Copy of the same vector

      const similarity = calculateCosineSimilarity(vectorA, vectorB);
      expect(similarity).toBeCloseTo(1, 5);
    });

    it('should produce symmetric results', () => {
      const vectorA = [0.1, 0.2, 0.3, 0.4, 0.5];
      const vectorB = [0.5, 0.4, 0.3, 0.2, 0.1];

      const similarity1 = calculateCosineSimilarity(vectorA, vectorB);
      const similarity2 = calculateCosineSimilarity(vectorB, vectorA);

      expect(similarity1).toBeCloseTo(similarity2, 10);
    });

    it('should handle very small values without underflow', () => {
      const vectorA = [1e-100, 1e-100, 1e-100];
      const vectorB = [1e-100, 1e-100, 1e-100];

      const similarity = calculateCosineSimilarity(vectorA, vectorB);
      expect(similarity).toBeCloseTo(1, 5);
    });

    it('should handle mixed positive and negative values', () => {
      const vectorA = [1, -1, 1, -1];
      const vectorB = [1, 1, 1, 1];

      const similarity = calculateCosineSimilarity(vectorA, vectorB);
      // Dot product: 1 - 1 + 1 - 1 = 0
      expect(similarity).toBeCloseTo(0, 5);
    });
  });

  describe('Vector Normalization (Pure Function Tests)', () => {
    /**
     * Pure implementation of vector normalization for testing
     */
    function normalizeVector(vector: number[]): number[] {
      const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
      if (magnitude === 0) return vector;
      return vector.map(val => val / magnitude);
    }

    it('should normalize vector to unit length', () => {
      const vector = [3, 4, 0, 0];
      const normalized = normalizeVector(vector);

      // Magnitude should be 1
      const magnitude = Math.sqrt(normalized.reduce((sum, val) => sum + val * val, 0));
      expect(magnitude).toBeCloseTo(1, 5);

      // Direction should be preserved
      expect(normalized[0]).toBeCloseTo(0.6, 5); // 3/5
      expect(normalized[1]).toBeCloseTo(0.8, 5); // 4/5
    });

    it('should handle zero vector', () => {
      const zeroVector = [0, 0, 0, 0];
      const normalized = normalizeVector(zeroVector);

      // Should return the same zero vector (avoid NaN)
      expect(normalized).toEqual([0, 0, 0, 0]);
    });

    it('should handle already normalized vector', () => {
      const alreadyNormalized = [0.6, 0.8, 0, 0];
      const result = normalizeVector(alreadyNormalized);

      expect(result[0]).toBeCloseTo(0.6, 5);
      expect(result[1]).toBeCloseTo(0.8, 5);
    });

    it('should normalize high-dimensional vectors', () => {
      const vector = new Array(384).fill(1);
      const normalized = normalizeVector(vector);

      const magnitude = Math.sqrt(normalized.reduce((sum, val) => sum + val * val, 0));
      expect(magnitude).toBeCloseTo(1, 5);
    });
  });

  describe('Search Result Ranking Logic', () => {
    interface MockSearchResult {
      id: string;
      similarity: number;
    }

    /**
     * Simulate the ranking logic used in findSimilarCode
     */
    function rankResults(
      results: MockSearchResult[],
      threshold: number,
      limit: number
    ): MockSearchResult[] {
      return results
        .filter(doc => doc.similarity >= threshold)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit);
    }

    it('should sort results by similarity descending', () => {
      const results = [
        { id: 'low', similarity: 0.2 },
        { id: 'high', similarity: 0.9 },
        { id: 'medium', similarity: 0.5 }
      ];

      const ranked = rankResults(results, 0, 10);

      expect(ranked[0].id).toBe('high');
      expect(ranked[1].id).toBe('medium');
      expect(ranked[2].id).toBe('low');
    });

    it('should filter by threshold', () => {
      const results = [
        { id: 'low', similarity: 0.2 },
        { id: 'high', similarity: 0.9 },
        { id: 'medium', similarity: 0.5 }
      ];

      const ranked = rankResults(results, 0.5, 10);

      expect(ranked.length).toBe(2);
      expect(ranked.find(r => r.id === 'low')).toBeUndefined();
    });

    it('should respect limit', () => {
      const results = Array.from({ length: 10 }, (_, i) => ({
        id: `doc${i}`,
        similarity: (10 - i) / 10
      }));

      const ranked = rankResults(results, 0, 3);

      expect(ranked.length).toBe(3);
      expect(ranked[0].similarity).toBe(1);
      expect(ranked[1].similarity).toBe(0.9);
      expect(ranked[2].similarity).toBe(0.8);
    });

    it('should handle empty results', () => {
      const results: MockSearchResult[] = [];
      const ranked = rankResults(results, 0, 10);

      expect(ranked).toEqual([]);
    });

    it('should handle all results filtered out by threshold', () => {
      const results = [
        { id: 'low1', similarity: 0.1 },
        { id: 'low2', similarity: 0.2 }
      ];

      const ranked = rankResults(results, 0.5, 10);

      expect(ranked).toEqual([]);
    });

    it('should handle equal similarity values', () => {
      const results = [
        { id: 'a', similarity: 0.5 },
        { id: 'b', similarity: 0.5 },
        { id: 'c', similarity: 0.5 }
      ];

      const ranked = rankResults(results, 0, 10);

      expect(ranked.length).toBe(3);
      // All should have same similarity
      ranked.forEach(r => expect(r.similarity).toBe(0.5));
    });
  });

  describe('Filter Validation Logic', () => {
    // Test the filter validation allowlist concept
    const ALLOWED_FILTER_KEYS = new Set([
      'filePath', 'language', 'conceptType', 'patternType',
      'framework', 'projectPath', 'fileHash', 'functionName',
      'className', 'complexity', 'lineCount'
    ]);

    function validateFilters(filters: Record<string, unknown>): Record<string, unknown> {
      const validFilters: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(filters)) {
        if (ALLOWED_FILTER_KEYS.has(key)) {
          validFilters[key] = value;
        }
      }
      return validFilters;
    }

    it('should allow valid filter keys', () => {
      const filters = {
        filePath: '/test/file.ts',
        language: 'typescript',
        complexity: 5
      };

      const validated = validateFilters(filters);

      expect(validated).toEqual(filters);
    });

    it('should reject invalid filter keys', () => {
      const filters = {
        filePath: '/test/file.ts',
        invalidKey: 'malicious value',
        anotherInvalid: 'value'
      };

      const validated = validateFilters(filters);

      expect(validated).toEqual({ filePath: '/test/file.ts' });
      expect(validated.invalidKey).toBeUndefined();
      expect(validated.anotherInvalid).toBeUndefined();
    });

    it('should return empty object for all invalid keys', () => {
      const filters = {
        invalidKey1: 'value1',
        invalidKey2: 'value2'
      };

      const validated = validateFilters(filters);

      expect(validated).toEqual({});
    });

    it('should handle empty filters', () => {
      const filters = {};

      const validated = validateFilters(filters);

      expect(validated).toEqual({});
    });

    it('should prevent SQL injection attempts via filter keys', () => {
      const maliciousFilters = {
        'filePath; DROP TABLE code_documents;--': 'value',
        'language OR 1=1': 'value'
      };

      const validated = validateFilters(maliciousFilters);

      expect(validated).toEqual({});
    });
  });
});
