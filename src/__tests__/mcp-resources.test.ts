/**
 * MCP Resources Tests
 *
 * Tests for the MCP resource handlers in In-Memoria.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { SQLiteDatabase } from '../storage/sqlite-db.js';
import {
  InMemoriaResourceHandler,
  RESOURCE_URIS,
  RESOURCE_TEMPLATES,
} from '../mcp-server/resources.js';

describe('MCP Resources', () => {
  let tempDir: string;
  let database: SQLiteDatabase;
  let resourceHandler: InMemoriaResourceHandler;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'in-memoria-resources-test-'));
    const dbPath = join(tempDir, 'test.db');
    database = new SQLiteDatabase(dbPath);
    resourceHandler = new InMemoriaResourceHandler(database, tempDir);
  });

  afterEach(() => {
    database.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('listResources', () => {
    it('should return base resources when database is empty', async () => {
      const resources = await resourceHandler.listResources();

      // Should have at least the 4 base resources
      expect(resources.length).toBeGreaterThanOrEqual(4);

      // Check that base resources are present
      const uris = resources.map(r => r.uri);
      expect(uris).toContain(RESOURCE_URIS.PROJECT_BLUEPRINT);
      expect(uris).toContain(RESOURCE_URIS.INTELLIGENCE_STATUS);
      expect(uris).toContain(RESOURCE_URIS.INTELLIGENCE_CONCEPTS);
      expect(uris).toContain(RESOURCE_URIS.INTELLIGENCE_PATTERNS);
    });

    it('should include dynamic resources for concept types', async () => {
      // Insert test concepts
      database.insertSemanticConcept({
        id: 'test-concept-1',
        conceptName: 'TestFunction',
        conceptType: 'function',
        confidenceScore: 0.9,
        relationships: {},
        evolutionHistory: {},
        filePath: '/test/file.ts',
        lineRange: { start: 1, end: 10 },
      });

      database.insertSemanticConcept({
        id: 'test-concept-2',
        conceptName: 'TestClass',
        conceptType: 'class',
        confidenceScore: 0.85,
        relationships: {},
        evolutionHistory: {},
        filePath: '/test/file.ts',
        lineRange: { start: 20, end: 50 },
      });

      const resources = await resourceHandler.listResources();
      const uris = resources.map(r => r.uri);

      // Should have dynamic resources for function and class types
      expect(uris).toContain('in-memoria://intelligence/concepts/class');
      expect(uris).toContain('in-memoria://intelligence/concepts/function');
    });

    it('should include dynamic resources for pattern types', async () => {
      // Insert test pattern
      database.insertDeveloperPattern({
        patternId: 'test-pattern-1',
        patternType: 'naming',
        patternContent: { convention: 'camelCase' },
        frequency: 10,
        contexts: ['typescript'],
        examples: [{ code: 'const myVar = 1;' }],
        confidence: 0.95,
      });

      const resources = await resourceHandler.listResources();
      const uris = resources.map(r => r.uri);

      // Should have dynamic resource for naming type
      expect(uris).toContain('in-memoria://intelligence/patterns/naming');
    });
  });

  describe('readResource', () => {
    describe('project/blueprint', () => {
      it('should return project blueprint with empty database', async () => {
        const result = await resourceHandler.readResource(RESOURCE_URIS.PROJECT_BLUEPRINT);

        expect(result.uri).toBe(RESOURCE_URIS.PROJECT_BLUEPRINT);
        expect(result.mimeType).toBe('application/json');

        const data = JSON.parse(result.text);
        expect(data).toHaveProperty('projectPath');
        expect(data).toHaveProperty('techStack');
        expect(data).toHaveProperty('entryPoints');
        expect(data).toHaveProperty('keyDirectories');
        expect(data).toHaveProperty('lastUpdated');
        expect(Array.isArray(data.techStack)).toBe(true);
        expect(Array.isArray(data.entryPoints)).toBe(true);
        expect(Array.isArray(data.keyDirectories)).toBe(true);
      });

      it('should include entry points when present', async () => {
        // First insert project metadata (required for foreign key constraint)
        database.insertProjectMetadata({
          projectId: 'test-project-1',
          projectPath: tempDir,
        });

        // Insert test entry point
        database.insertEntryPoint({
          id: 'test-entry-1',
          projectPath: tempDir,
          entryType: 'api',
          filePath: '/src/index.ts',
          description: 'Main API entry',
          framework: 'express',
        });

        const result = await resourceHandler.readResource(RESOURCE_URIS.PROJECT_BLUEPRINT);
        const data = JSON.parse(result.text);

        expect(data.entryPoints.length).toBe(1);
        expect(data.entryPoints[0].type).toBe('api');
        expect(data.entryPoints[0].framework).toBe('express');
        expect(data.techStack).toContain('express');
      });
    });

    describe('intelligence/status', () => {
      it('should return status indicating no intelligence when empty', async () => {
        const result = await resourceHandler.readResource(RESOURCE_URIS.INTELLIGENCE_STATUS);

        expect(result.uri).toBe(RESOURCE_URIS.INTELLIGENCE_STATUS);
        expect(result.mimeType).toBe('application/json');

        const data = JSON.parse(result.text);
        expect(data.hasIntelligence).toBe(false);
        expect(data.conceptsCount).toBe(0);
        expect(data.patternsCount).toBe(0);
        expect(data.conceptTypes).toEqual([]);
        expect(data.patternTypes).toEqual([]);
      });

      it('should return accurate counts when intelligence is present', async () => {
        // Insert test data
        database.insertSemanticConcept({
          id: 'concept-1',
          conceptName: 'TestConcept',
          conceptType: 'function',
          confidenceScore: 0.9,
          relationships: {},
          evolutionHistory: {},
          filePath: '/test.ts',
          lineRange: { start: 1, end: 10 },
        });

        database.insertDeveloperPattern({
          patternId: 'pattern-1',
          patternType: 'structural',
          patternContent: {},
          frequency: 5,
          contexts: [],
          examples: [],
          confidence: 0.8,
        });

        const result = await resourceHandler.readResource(RESOURCE_URIS.INTELLIGENCE_STATUS);
        const data = JSON.parse(result.text);

        expect(data.hasIntelligence).toBe(true);
        expect(data.conceptsCount).toBe(1);
        expect(data.patternsCount).toBe(1);
        expect(data.conceptTypes).toContain('function');
        expect(data.patternTypes).toContain('structural');
      });
    });

    describe('intelligence/concepts', () => {
      it('should return empty concepts list when none exist', async () => {
        const result = await resourceHandler.readResource(RESOURCE_URIS.INTELLIGENCE_CONCEPTS);

        expect(result.mimeType).toBe('application/json');

        const data = JSON.parse(result.text);
        expect(data.count).toBe(0);
        expect(data.concepts).toEqual([]);
      });

      it('should return all concepts with formatted data', async () => {
        database.insertSemanticConcept({
          id: 'concept-1',
          conceptName: 'MyFunction',
          conceptType: 'function',
          confidenceScore: 0.95,
          relationships: { calls: ['helper'] },
          evolutionHistory: {},
          filePath: '/src/main.ts',
          lineRange: { start: 5, end: 15 },
        });

        const result = await resourceHandler.readResource(RESOURCE_URIS.INTELLIGENCE_CONCEPTS);
        const data = JSON.parse(result.text);

        expect(data.count).toBe(1);
        expect(data.concepts[0]).toEqual(expect.objectContaining({
          id: 'concept-1',
          name: 'MyFunction',
          type: 'function',
          confidence: 0.95,
          filePath: '/src/main.ts',
        }));
      });
    });

    describe('intelligence/patterns', () => {
      it('should return empty patterns list when none exist', async () => {
        const result = await resourceHandler.readResource(RESOURCE_URIS.INTELLIGENCE_PATTERNS);

        const data = JSON.parse(result.text);
        expect(data.count).toBe(0);
        expect(data.patterns).toEqual([]);
      });

      it('should return all patterns with formatted data', async () => {
        database.insertDeveloperPattern({
          patternId: 'pattern-1',
          patternType: 'naming',
          patternContent: { convention: 'camelCase' },
          frequency: 25,
          contexts: ['variables', 'functions'],
          examples: [{ code: 'const myVar = 1;' }],
          confidence: 0.92,
        });

        const result = await resourceHandler.readResource(RESOURCE_URIS.INTELLIGENCE_PATTERNS);
        const data = JSON.parse(result.text);

        expect(data.count).toBe(1);
        expect(data.patterns[0]).toEqual(expect.objectContaining({
          id: 'pattern-1',
          type: 'naming',
          frequency: 25,
          confidence: 0.92,
        }));
      });
    });

    describe('dynamic concepts by type', () => {
      beforeEach(() => {
        database.insertSemanticConcept({
          id: 'func-1',
          conceptName: 'function1',
          conceptType: 'function',
          confidenceScore: 0.9,
          relationships: {},
          evolutionHistory: {},
          filePath: '/a.ts',
          lineRange: { start: 1, end: 10 },
        });

        database.insertSemanticConcept({
          id: 'class-1',
          conceptName: 'Class1',
          conceptType: 'class',
          confidenceScore: 0.85,
          relationships: {},
          evolutionHistory: {},
          filePath: '/b.ts',
          lineRange: { start: 1, end: 50 },
        });
      });

      it('should filter concepts by type', async () => {
        const result = await resourceHandler.readResource('in-memoria://intelligence/concepts/function');
        const data = JSON.parse(result.text);

        expect(data.type).toBe('function');
        expect(data.count).toBe(1);
        expect(data.concepts[0].name).toBe('function1');
      });

      it('should return empty for valid type with no matches', async () => {
        // First add a concept of a different type so 'interface' is not a known type
        const result = await resourceHandler.readResource('in-memoria://intelligence/concepts/class');
        const data = JSON.parse(result.text);

        expect(data.type).toBe('class');
        expect(data.count).toBe(1);
      });

      it('should throw error for unknown concept type', async () => {
        await expect(
          resourceHandler.readResource('in-memoria://intelligence/concepts/unknowntype')
        ).rejects.toThrow('Unknown concept type: unknowntype');
      });
    });

    describe('dynamic patterns by type', () => {
      beforeEach(() => {
        database.insertDeveloperPattern({
          patternId: 'naming-1',
          patternType: 'naming',
          patternContent: {},
          frequency: 10,
          contexts: [],
          examples: [],
          confidence: 0.9,
        });

        database.insertDeveloperPattern({
          patternId: 'structural-1',
          patternType: 'structural',
          patternContent: {},
          frequency: 5,
          contexts: [],
          examples: [],
          confidence: 0.8,
        });
      });

      it('should filter patterns by type', async () => {
        const result = await resourceHandler.readResource('in-memoria://intelligence/patterns/naming');
        const data = JSON.parse(result.text);

        expect(data.type).toBe('naming');
        expect(data.count).toBe(1);
        expect(data.patterns[0].id).toBe('naming-1');
      });

      it('should throw error for unknown pattern type', async () => {
        await expect(
          resourceHandler.readResource('in-memoria://intelligence/patterns/unknowntype')
        ).rejects.toThrow('Unknown pattern type: unknowntype');
      });
    });

    describe('error handling', () => {
      it('should throw error for unknown resource URI', async () => {
        await expect(
          resourceHandler.readResource('in-memoria://unknown/resource')
        ).rejects.toThrow('Unknown resource URI');
      });

      it('should throw error for malformed URI', async () => {
        await expect(
          resourceHandler.readResource('not-a-valid-uri')
        ).rejects.toThrow('Unknown resource URI');
      });
    });
  });

  describe('RESOURCE_TEMPLATES', () => {
    it('should define concept type template', () => {
      const conceptTemplate = RESOURCE_TEMPLATES.find(
        t => t.uriTemplate === 'in-memoria://intelligence/concepts/{type}'
      );
      expect(conceptTemplate).toBeDefined();
      expect(conceptTemplate?.mimeType).toBe('application/json');
    });

    it('should define pattern type template', () => {
      const patternTemplate = RESOURCE_TEMPLATES.find(
        t => t.uriTemplate === 'in-memoria://intelligence/patterns/{type}'
      );
      expect(patternTemplate).toBeDefined();
      expect(patternTemplate?.mimeType).toBe('application/json');
    });
  });
});

describe('MCP Resources Integration with Server', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'in-memoria-mcp-resources-'));
    process.env.IN_MEMORIA_DB_PATH = join(tempDir, 'test.db');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    delete process.env.IN_MEMORIA_DB_PATH;
  });

  it('should initialize resource handler with server', async () => {
    // Dynamic import to avoid issues with vitest
    const { CodeCartographerMCP } = await import('../mcp-server/server.js');

    const server = new CodeCartographerMCP();
    await server.initializeForTesting();

    const resourceHandler = server.getResourceHandler();
    expect(resourceHandler).toBeDefined();

    const resources = await resourceHandler.listResources();
    expect(resources.length).toBeGreaterThanOrEqual(4);

    await server.stop();
  });
});
