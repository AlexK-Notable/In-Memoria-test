import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MonitoringTools } from '../mcp-server/tools/monitoring-tools.js';
import { SemanticEngine } from '../engines/semantic-engine.js';
import { PatternEngine } from '../engines/pattern-engine.js';
import { SQLiteDatabase } from '../storage/sqlite-db.js';
import { SemanticVectorDB } from '../storage/vector-db.js';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('MonitoringTools', () => {
  let tempDir: string;
  let database: SQLiteDatabase;
  let vectorDB: SemanticVectorDB;
  let semanticEngine: SemanticEngine;
  let patternEngine: PatternEngine;
  let monitoringTools: MonitoringTools;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'monitoring-test-'));
    const dbPath = join(tempDir, 'test.db');
    database = new SQLiteDatabase(dbPath);
    vectorDB = new SemanticVectorDB();
    semanticEngine = new SemanticEngine(database, vectorDB);
    patternEngine = new PatternEngine(database);
    monitoringTools = new MonitoringTools(semanticEngine, patternEngine, database, dbPath);
  });

  afterEach(() => {
    database.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('getSystemStatus', () => {
    it('should return comprehensive system status', async () => {
      const result = await monitoringTools.getSystemStatus({
        includeMetrics: true,
        includeDiagnostics: true
      });

      expect(result).toMatchObject({
        success: true,
        status: expect.objectContaining({
          version: '0.6.0',
          timestamp: expect.any(String),
          components: expect.objectContaining({
            database: expect.any(Object),
          }),
          intelligence: expect.any(Object),
          performance: expect.any(Object),
          diagnostics: expect.any(Object),
        }),
      });
    });

    it('should handle minimal status request', async () => {
      const result = await monitoringTools.getSystemStatus({
        includeMetrics: false,
        includeDiagnostics: false
      });

      expect(result.success).toBe(true);
      expect(result.status.performance).toEqual({});
      expect(result.status.diagnostics).toEqual({});
    });

    it('should assess overall health correctly', async () => {
      const result = await monitoringTools.getSystemStatus({});

      expect(result).toMatchObject({
        status: expect.objectContaining({
          status: expect.stringMatching(/operational|ready_for_learning|degraded|critical/),
        }),
        message: expect.stringContaining('System is'),
        summary: expect.any(String),
      });
    });
  });

  describe('getIntelligenceMetrics', () => {
    it('should return metrics for empty database', async () => {
      const result = await monitoringTools.getIntelligenceMetrics({
        includeBreakdown: true
      });

      expect(result.success).toBe(true);
      expect(result.metrics.concepts.total).toBe(0);
      expect(result.metrics.patterns.total).toBe(0);
    });

    it('should return detailed metrics with data', async () => {
      // Add test data
      database.insertSemanticConcept({
        id: 'test-concept-1',
        conceptName: 'TestClass',
        conceptType: 'class',
        confidenceScore: 0.9,
        relationships: {},
        evolutionHistory: {},
        filePath: 'test.ts',
        lineRange: { start: 1, end: 10 }
      });

      database.insertSemanticConcept({
        id: 'test-concept-2',
        conceptName: 'TestFunction',
        conceptType: 'function',
        confidenceScore: 0.6,
        relationships: {},
        evolutionHistory: {},
        filePath: 'test.ts',
        lineRange: { start: 12, end: 15 }
      });

      const result = await monitoringTools.getIntelligenceMetrics({
        includeBreakdown: true
      });

      expect(result.success).toBe(true);
      expect(result.metrics.concepts.total).toBe(2);
      expect(result.metrics.concepts.breakdown.byType).toEqual({
        class: 1,
        function: 1
      });
      expect(result.metrics.concepts.breakdown.byConfidence.high).toBe(1);
      expect(result.metrics.concepts.breakdown.byConfidence.medium).toBe(1);
      expect(result.metrics.quality.averageConfidence).toBe(0.75);
    });

    it('should skip breakdown when requested', async () => {
      const result = await monitoringTools.getIntelligenceMetrics({
        includeBreakdown: false
      });

      expect(result.success).toBe(true);
      expect(result.metrics.concepts.breakdown).toBeUndefined();
    });
  });

  describe('getPerformanceStatus', () => {
    it('should return performance metrics', async () => {
      const result = await monitoringTools.getPerformanceStatus({
        runBenchmark: false
      });

      expect(result).toMatchObject({
        success: true,
        performance: expect.objectContaining({
          memory: expect.objectContaining({
            heapUsed: expect.any(Number),
          }),
          system: expect.objectContaining({
            nodeVersion: expect.any(String),
            platform: expect.any(String),
          }),
        }),
      });
      expect(result.performance.memory.heapUsed).toBeGreaterThan(0);
    });

    it('should include database performance metrics', async () => {
      const result = await monitoringTools.getPerformanceStatus({});

      expect(result).toMatchObject({
        success: true,
        performance: expect.objectContaining({
          database: expect.objectContaining({
            queryPerformance: expect.objectContaining({
              performanceRating: expect.stringMatching(/excellent|good|fair|poor/),
            }),
          }),
        }),
      });
    });

    it('should run benchmark when requested', async () => {
      const result = await monitoringTools.getPerformanceStatus({
        runBenchmark: true
      });

      expect(result).toMatchObject({
        success: true,
        performance: expect.objectContaining({
          benchmark: expect.objectContaining({
            conceptQuery: expect.any(Number),
            patternQuery: expect.any(Number),
          }),
        }),
      });
      expect(result.performance.benchmark.conceptQuery).toBeGreaterThanOrEqual(0);
      expect(result.performance.benchmark.patternQuery).toBeGreaterThanOrEqual(0);
    });
  });

  describe('tools property', () => {
    it('should expose correct tool definitions', () => {
      const tools = monitoringTools.tools;

      expect(tools).toHaveLength(4);
      expect(tools.map(t => t.name)).toEqual([
        'get_system_status',
        'get_intelligence_metrics',
        'get_performance_status',
        'health_check'
      ]);

      // Verify all tools have proper schemas
      tools.forEach(tool => {
        expect(tool).toMatchObject({
          name: expect.any(String),
          description: expect.any(String),
          inputSchema: expect.objectContaining({
            type: 'object',
          }),
        });
      });
    });
  });
});
