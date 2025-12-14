/**
 * Tests for Repository Pattern Implementation
 * TDD: Write tests FIRST, then implementation
 *
 * Provides clean separation of data access logic from business logic.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Runtime import to verify the file exists and exports correctly
import * as RepositoriesModule from '../storage/repositories.js';

describe('Repositories', () => {
  describe('Module exports', () => {
    it('should export the RepositoriesModule', () => {
      expect(RepositoriesModule).toBeDefined();
    });

    it('should export IntelligenceRepository class', () => {
      expect(RepositoriesModule.IntelligenceRepository).toBeDefined();
      expect(typeof RepositoriesModule.IntelligenceRepository).toBe('function');
    });

    it('should export PatternRepository class', () => {
      expect(RepositoriesModule.PatternRepository).toBeDefined();
      expect(typeof RepositoriesModule.PatternRepository).toBe('function');
    });

    it('should export ConceptRepository class', () => {
      expect(RepositoriesModule.ConceptRepository).toBeDefined();
      expect(typeof RepositoriesModule.ConceptRepository).toBe('function');
    });
  });

  describe('IntelligenceRepository', () => {
    let mockDb: RepositoriesModule.DatabaseAdapter;
    let repo: RepositoriesModule.IntelligenceRepository;

    beforeEach(() => {
      // Create a mock database adapter
      mockDb = {
        query: vi.fn(),
        execute: vi.fn(),
        get: vi.fn(),
        all: vi.fn(),
        run: vi.fn(),
      };
      repo = new RepositoriesModule.IntelligenceRepository(mockDb);
    });

    it('should save intelligence record', async () => {
      vi.mocked(mockDb.run).mockResolvedValue({ changes: 1 });

      const record: RepositoriesModule.IntelligenceRecord = {
        id: 'int-123',
        projectPath: '/test/project',
        status: 'complete',
        fileCount: 100,
        conceptCount: 50,
        patternCount: 25,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await repo.save(record);

      expect(mockDb.run).toHaveBeenCalled();
    });

    it('should find intelligence by project path', async () => {
      const mockRecord = {
        id: 'int-123',
        project_path: '/test/project',
        status: 'complete',
        file_count: 100,
        concept_count: 50,
        pattern_count: 25,
        created_at: Date.now(),
        updated_at: Date.now(),
      };

      vi.mocked(mockDb.get).mockResolvedValue(mockRecord);

      const result = await repo.findByProjectPath('/test/project');

      expect(result).toBeDefined();
      expect(result?.projectPath).toBe('/test/project');
      expect(mockDb.get).toHaveBeenCalled();
    });

    it('should return null for missing project', async () => {
      vi.mocked(mockDb.get).mockResolvedValue(undefined);

      const result = await repo.findByProjectPath('/nonexistent');

      expect(result).toBeNull();
    });

    it('should update intelligence record', async () => {
      vi.mocked(mockDb.run).mockResolvedValue({ changes: 1 });

      await repo.update('int-123', {
        status: 'learning',
        fileCount: 150,
      });

      expect(mockDb.run).toHaveBeenCalled();
    });

    it('should delete intelligence record', async () => {
      vi.mocked(mockDb.run).mockResolvedValue({ changes: 1 });

      const result = await repo.delete('int-123');

      expect(result).toBe(true);
      expect(mockDb.run).toHaveBeenCalled();
    });

    it('should check if project has intelligence', async () => {
      vi.mocked(mockDb.get).mockResolvedValue({ count: 1 });

      const result = await repo.hasIntelligence('/test/project');

      expect(result).toBe(true);
    });

    it('should get intelligence status', async () => {
      vi.mocked(mockDb.get).mockResolvedValue({
        status: 'complete',
        file_count: 100,
        concept_count: 50,
      });

      const result = await repo.getStatus('/test/project');

      expect(result).toEqual({
        status: 'complete',
        fileCount: 100,
        conceptCount: 50,
      });
    });
  });

  describe('PatternRepository', () => {
    let mockDb: RepositoriesModule.DatabaseAdapter;
    let repo: RepositoriesModule.PatternRepository;

    beforeEach(() => {
      mockDb = {
        query: vi.fn(),
        execute: vi.fn(),
        get: vi.fn(),
        all: vi.fn(),
        run: vi.fn(),
      };
      repo = new RepositoriesModule.PatternRepository(mockDb);
    });

    it('should save pattern', async () => {
      vi.mocked(mockDb.run).mockResolvedValue({ changes: 1 });

      const pattern: RepositoriesModule.PatternRecord = {
        id: 'pat-123',
        name: 'Singleton',
        type: 'design_pattern',
        confidence: 0.85,
        occurrences: 5,
        projectPath: '/test/project',
        metadata: { files: ['file1.ts', 'file2.ts'] },
        createdAt: Date.now(),
      };

      await repo.save(pattern);

      expect(mockDb.run).toHaveBeenCalled();
    });

    it('should find patterns by project', async () => {
      vi.mocked(mockDb.all).mockResolvedValue([
        {
          id: 'pat-1',
          name: 'Singleton',
          type: 'design_pattern',
          confidence: 0.85,
          occurrences: 5,
          project_path: '/test/project',
          metadata: '{}',
          created_at: Date.now(),
        },
        {
          id: 'pat-2',
          name: 'Factory',
          type: 'design_pattern',
          confidence: 0.75,
          occurrences: 3,
          project_path: '/test/project',
          metadata: '{}',
          created_at: Date.now(),
        },
      ]);

      const results = await repo.findByProject('/test/project');

      expect(results).toHaveLength(2);
      expect(results[0].name).toBe('Singleton');
    });

    it('should find patterns by type', async () => {
      vi.mocked(mockDb.all).mockResolvedValue([
        {
          id: 'pat-1',
          name: 'Singleton',
          type: 'design_pattern',
          confidence: 0.85,
          occurrences: 5,
          project_path: '/test/project',
          metadata: '{}',
          created_at: Date.now(),
        },
      ]);

      const results = await repo.findByType('/test/project', 'design_pattern');

      expect(results).toHaveLength(1);
      expect(results[0].type).toBe('design_pattern');
    });

    it('should find high confidence patterns', async () => {
      vi.mocked(mockDb.all).mockResolvedValue([
        {
          id: 'pat-1',
          name: 'Singleton',
          type: 'design_pattern',
          confidence: 0.95,
          occurrences: 10,
          project_path: '/test/project',
          metadata: '{}',
          created_at: Date.now(),
        },
      ]);

      const results = await repo.findHighConfidence('/test/project', 0.9);

      expect(results).toHaveLength(1);
      expect(results[0].confidence).toBeGreaterThanOrEqual(0.9);
    });

    it('should delete patterns by project', async () => {
      vi.mocked(mockDb.run).mockResolvedValue({ changes: 5 });

      const count = await repo.deleteByProject('/test/project');

      expect(count).toBe(5);
    });

    it('should get pattern statistics', async () => {
      vi.mocked(mockDb.get).mockResolvedValue({
        total: 10,
        avgConfidence: 0.82,
        avgOccurrences: 4.5,
      });

      const stats = await repo.getStatistics('/test/project');

      expect(stats.total).toBe(10);
      expect(stats.avgConfidence).toBe(0.82);
    });
  });

  describe('ConceptRepository', () => {
    let mockDb: RepositoriesModule.DatabaseAdapter;
    let repo: RepositoriesModule.ConceptRepository;

    beforeEach(() => {
      mockDb = {
        query: vi.fn(),
        execute: vi.fn(),
        get: vi.fn(),
        all: vi.fn(),
        run: vi.fn(),
      };
      repo = new RepositoriesModule.ConceptRepository(mockDb);
    });

    it('should save concept', async () => {
      vi.mocked(mockDb.run).mockResolvedValue({ changes: 1 });

      const concept: RepositoriesModule.ConceptRecord = {
        id: 'con-123',
        name: 'UserService',
        type: 'class',
        filePath: '/src/services/user.ts',
        lineNumber: 10,
        projectPath: '/test/project',
        metadata: {},
        createdAt: Date.now(),
      };

      await repo.save(concept);

      expect(mockDb.run).toHaveBeenCalled();
    });

    it('should find concepts by file', async () => {
      vi.mocked(mockDb.all).mockResolvedValue([
        {
          id: 'con-1',
          name: 'UserService',
          type: 'class',
          file_path: '/src/services/user.ts',
          line_number: 10,
          project_path: '/test/project',
          metadata: '{}',
          created_at: Date.now(),
        },
        {
          id: 'con-2',
          name: 'getUser',
          type: 'function',
          file_path: '/src/services/user.ts',
          line_number: 25,
          project_path: '/test/project',
          metadata: '{}',
          created_at: Date.now(),
        },
      ]);

      const results = await repo.findByFile('/src/services/user.ts');

      expect(results).toHaveLength(2);
    });

    it('should find concepts by type', async () => {
      vi.mocked(mockDb.all).mockResolvedValue([
        {
          id: 'con-1',
          name: 'UserService',
          type: 'class',
          file_path: '/src/services/user.ts',
          line_number: 10,
          project_path: '/test/project',
          metadata: '{}',
          created_at: Date.now(),
        },
      ]);

      const results = await repo.findByType('/test/project', 'class');

      expect(results).toHaveLength(1);
      expect(results[0].type).toBe('class');
    });

    it('should search concepts by name', async () => {
      vi.mocked(mockDb.all).mockResolvedValue([
        {
          id: 'con-1',
          name: 'UserService',
          type: 'class',
          file_path: '/src/services/user.ts',
          line_number: 10,
          project_path: '/test/project',
          metadata: '{}',
          created_at: Date.now(),
        },
        {
          id: 'con-2',
          name: 'UserController',
          type: 'class',
          file_path: '/src/controllers/user.ts',
          line_number: 5,
          project_path: '/test/project',
          metadata: '{}',
          created_at: Date.now(),
        },
      ]);

      const results = await repo.searchByName('/test/project', 'User');

      expect(results).toHaveLength(2);
      expect(results.every((c) => c.name.includes('User'))).toBe(true);
    });

    it('should delete concepts by project', async () => {
      vi.mocked(mockDb.run).mockResolvedValue({ changes: 100 });

      const count = await repo.deleteByProject('/test/project');

      expect(count).toBe(100);
    });

    it('should get concept count', async () => {
      vi.mocked(mockDb.get).mockResolvedValue({ count: 50 });

      const count = await repo.getCount('/test/project');

      expect(count).toBe(50);
    });
  });

  describe('Repository integration', () => {
    it('should create repositories with shared database adapter', () => {
      const mockDb: RepositoriesModule.DatabaseAdapter = {
        query: vi.fn(),
        execute: vi.fn(),
        get: vi.fn(),
        all: vi.fn(),
        run: vi.fn(),
      };

      const intelligenceRepo = new RepositoriesModule.IntelligenceRepository(mockDb);
      const patternRepo = new RepositoriesModule.PatternRepository(mockDb);
      const conceptRepo = new RepositoriesModule.ConceptRepository(mockDb);

      expect(intelligenceRepo).toBeDefined();
      expect(patternRepo).toBeDefined();
      expect(conceptRepo).toBeDefined();
    });
  });

  describe('DatabaseAdapter interface', () => {
    it('should define required methods', () => {
      // This test validates the interface exists with proper methods
      const adapter: RepositoriesModule.DatabaseAdapter = {
        query: async () => [],
        execute: async () => {},
        get: async () => undefined,
        all: async () => [],
        run: async () => ({ changes: 0 }),
      };

      expect(typeof adapter.query).toBe('function');
      expect(typeof adapter.execute).toBe('function');
      expect(typeof adapter.get).toBe('function');
      expect(typeof adapter.all).toBe('function');
      expect(typeof adapter.run).toBe('function');
    });
  });
});
