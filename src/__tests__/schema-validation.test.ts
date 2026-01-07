/**
 * Schema Validation Tests
 *
 * Validates that the database schema matches expected structure
 * and that all required tables, columns, and indexes exist.
 *
 * Part of Task 4C: Schema Reconciliation
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('Schema Validation', () => {
  let db: Database.Database;

  beforeAll(() => {
    // Create in-memory database and load schema
    db = new Database(':memory:');
    const schemaPath = join(__dirname, '../storage/schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.exec(schema);
  });

  afterAll(() => {
    db.close();
  });

  describe('Required Tables', () => {
    const requiredTables = [
      // Core tables
      'semantic_concepts',
      'developer_patterns',
      'architectural_decisions',
      'file_intelligence',
      'shared_patterns',
      'ai_insights',
      'project_metadata',
      // Blueprint tables
      'feature_map',
      'entry_points',
      'key_directories',
      // Session tables
      'work_sessions',
      'project_decisions',
      // Repository pattern tables
      'intelligence',
      'patterns',
      'concepts',
    ];

    it.each(requiredTables)('should have table: %s', (tableName) => {
      const result = db
        .prepare(
          `SELECT name FROM sqlite_master WHERE type='table' AND name=?`
        )
        .get(tableName);
      expect(result).toBeDefined();
    });
  });

  describe('semantic_concepts Table', () => {
    it('should have all required columns', () => {
      const columns = db.prepare(`PRAGMA table_info(semantic_concepts)`).all() as {
        name: string;
        type: string;
        notnull: number;
        pk: number;
      }[];

      const columnNames = columns.map((c) => c.name);
      expect(columnNames).toContain('id');
      expect(columnNames).toContain('concept_name');
      expect(columnNames).toContain('concept_type');
      expect(columnNames).toContain('confidence_score');
      expect(columnNames).toContain('relationships');
      expect(columnNames).toContain('evolution_history');
      expect(columnNames).toContain('file_path');
      expect(columnNames).toContain('line_range');
      expect(columnNames).toContain('created_at');
      expect(columnNames).toContain('updated_at');
    });

    it('should have id as primary key', () => {
      const columns = db.prepare(`PRAGMA table_info(semantic_concepts)`).all() as {
        name: string;
        pk: number;
      }[];
      const idColumn = columns.find((c) => c.name === 'id');
      expect(idColumn?.pk).toBe(1);
    });
  });

  describe('developer_patterns Table', () => {
    it('should have all required columns', () => {
      const columns = db.prepare(`PRAGMA table_info(developer_patterns)`).all() as {
        name: string;
      }[];
      const columnNames = columns.map((c) => c.name);

      expect(columnNames).toContain('pattern_id');
      expect(columnNames).toContain('pattern_type');
      expect(columnNames).toContain('pattern_content');
      expect(columnNames).toContain('frequency');
      expect(columnNames).toContain('contexts');
      expect(columnNames).toContain('examples');
      expect(columnNames).toContain('confidence');
      expect(columnNames).toContain('created_at');
      expect(columnNames).toContain('last_seen');
    });
  });

  describe('Repository Pattern Tables', () => {
    describe('intelligence table', () => {
      it('should have all required columns', () => {
        const columns = db.prepare(`PRAGMA table_info(intelligence)`).all() as {
          name: string;
          type: string;
          notnull: number;
        }[];
        const columnNames = columns.map((c) => c.name);

        expect(columnNames).toContain('id');
        expect(columnNames).toContain('project_path');
        expect(columnNames).toContain('status');
        expect(columnNames).toContain('file_count');
        expect(columnNames).toContain('concept_count');
        expect(columnNames).toContain('pattern_count');
        expect(columnNames).toContain('created_at');
        expect(columnNames).toContain('updated_at');
        expect(columnNames).toContain('metadata');
      });

      it('should have project_path as NOT NULL', () => {
        const columns = db.prepare(`PRAGMA table_info(intelligence)`).all() as {
          name: string;
          notnull: number;
        }[];
        const projectPathCol = columns.find((c) => c.name === 'project_path');
        expect(projectPathCol?.notnull).toBe(1);
      });
    });

    describe('patterns table', () => {
      it('should have all required columns', () => {
        const columns = db.prepare(`PRAGMA table_info(patterns)`).all() as {
          name: string;
        }[];
        const columnNames = columns.map((c) => c.name);

        expect(columnNames).toContain('id');
        expect(columnNames).toContain('name');
        expect(columnNames).toContain('type');
        expect(columnNames).toContain('confidence');
        expect(columnNames).toContain('occurrences');
        expect(columnNames).toContain('project_path');
        expect(columnNames).toContain('metadata');
        expect(columnNames).toContain('created_at');
      });
    });

    describe('concepts table', () => {
      it('should have all required columns', () => {
        const columns = db.prepare(`PRAGMA table_info(concepts)`).all() as {
          name: string;
        }[];
        const columnNames = columns.map((c) => c.name);

        expect(columnNames).toContain('id');
        expect(columnNames).toContain('name');
        expect(columnNames).toContain('type');
        expect(columnNames).toContain('file_path');
        expect(columnNames).toContain('line_number');
        expect(columnNames).toContain('project_path');
        expect(columnNames).toContain('metadata');
        expect(columnNames).toContain('created_at');
      });
    });
  });

  describe('Required Indexes', () => {
    const requiredIndexes = [
      // Semantic concepts indexes
      'idx_semantic_concepts_type',
      'idx_semantic_concepts_file',
      // Developer patterns indexes
      'idx_developer_patterns_type',
      'idx_developer_patterns_frequency',
      'idx_developer_patterns_type_freq_conf',
      // File intelligence indexes
      'idx_file_intelligence_analyzed',
      // AI insights indexes
      'idx_ai_insights_type',
      'idx_ai_insights_confidence',
      'idx_ai_insights_type_conf_created',
      // Feature map indexes
      'idx_feature_map_project',
      'idx_feature_map_name',
      'idx_feature_map_project_status',
      'idx_feature_map_project_name',
      // Entry points indexes
      'idx_entry_points_project',
      // Key directories indexes
      'idx_key_directories_project',
      // Work sessions indexes
      'idx_work_sessions_project',
      'idx_work_sessions_updated',
      'idx_work_sessions_active',
      // Project decisions indexes
      'idx_project_decisions_key',
      'idx_project_decisions_made',
      // Repository pattern table indexes
      'idx_intelligence_project',
      'idx_intelligence_status',
      'idx_patterns_project',
      'idx_patterns_type',
      'idx_patterns_project_type',
      'idx_patterns_project_confidence',
      'idx_concepts_project',
      'idx_concepts_file',
      'idx_concepts_type',
      'idx_concepts_project_type',
      'idx_concepts_project_name',
    ];

    it.each(requiredIndexes)('should have index: %s', (indexName) => {
      const result = db
        .prepare(
          `SELECT name FROM sqlite_master WHERE type='index' AND name=?`
        )
        .get(indexName);
      expect(result).toBeDefined();
    });
  });

  describe('TypeScript Type Alignment', () => {
    it('semantic_concepts columns should match SemanticConcept interface', () => {
      // Verify the table structure matches the expected TypeScript interface
      const columns = db.prepare(`PRAGMA table_info(semantic_concepts)`).all() as {
        name: string;
        type: string;
      }[];

      const columnMap = new Map(columns.map((c) => [c.name, c.type]));

      // SemanticConcept interface expects these fields
      expect(columnMap.get('id')).toBe('TEXT');
      expect(columnMap.get('concept_name')).toBe('TEXT');
      expect(columnMap.get('concept_type')).toBe('TEXT');
      expect(columnMap.get('confidence_score')).toBe('REAL');
      expect(columnMap.get('file_path')).toBe('TEXT');
    });

    it('developer_patterns columns should match DeveloperPattern interface', () => {
      const columns = db.prepare(`PRAGMA table_info(developer_patterns)`).all() as {
        name: string;
        type: string;
      }[];

      const columnMap = new Map(columns.map((c) => [c.name, c.type]));

      expect(columnMap.get('pattern_id')).toBe('TEXT');
      expect(columnMap.get('pattern_type')).toBe('TEXT');
      expect(columnMap.get('pattern_content')).toBe('TEXT');
      expect(columnMap.get('frequency')).toBe('INTEGER');
      expect(columnMap.get('confidence')).toBe('REAL');
    });

    it('intelligence columns should match IntelligenceRecord interface', () => {
      const columns = db.prepare(`PRAGMA table_info(intelligence)`).all() as {
        name: string;
        type: string;
      }[];

      const columnMap = new Map(columns.map((c) => [c.name, c.type]));

      expect(columnMap.get('id')).toBe('TEXT');
      expect(columnMap.get('project_path')).toBe('TEXT');
      expect(columnMap.get('status')).toBe('TEXT');
      expect(columnMap.get('file_count')).toBe('INTEGER');
      expect(columnMap.get('concept_count')).toBe('INTEGER');
      expect(columnMap.get('pattern_count')).toBe('INTEGER');
      expect(columnMap.get('created_at')).toBe('INTEGER');
      expect(columnMap.get('updated_at')).toBe('INTEGER');
    });
  });

  describe('Foreign Key Relationships', () => {
    it('feature_map should reference project_metadata', () => {
      const foreignKeys = db.prepare(`PRAGMA foreign_key_list(feature_map)`).all() as {
        table: string;
        from: string;
        to: string;
      }[];

      const projectPathFK = foreignKeys.find((fk) => fk.from === 'project_path');
      expect(projectPathFK).toBeDefined();
      expect(projectPathFK?.table).toBe('project_metadata');
      expect(projectPathFK?.to).toBe('project_path');
    });

    it('entry_points should reference project_metadata', () => {
      const foreignKeys = db.prepare(`PRAGMA foreign_key_list(entry_points)`).all() as {
        table: string;
        from: string;
      }[];

      const projectPathFK = foreignKeys.find((fk) => fk.from === 'project_path');
      expect(projectPathFK).toBeDefined();
      expect(projectPathFK?.table).toBe('project_metadata');
    });

    it('key_directories should reference project_metadata', () => {
      const foreignKeys = db.prepare(`PRAGMA foreign_key_list(key_directories)`).all() as {
        table: string;
        from: string;
      }[];

      const projectPathFK = foreignKeys.find((fk) => fk.from === 'project_path');
      expect(projectPathFK).toBeDefined();
      expect(projectPathFK?.table).toBe('project_metadata');
    });

    it('work_sessions should reference project_metadata', () => {
      const foreignKeys = db.prepare(`PRAGMA foreign_key_list(work_sessions)`).all() as {
        table: string;
        from: string;
      }[];

      const projectPathFK = foreignKeys.find((fk) => fk.from === 'project_path');
      expect(projectPathFK).toBeDefined();
      expect(projectPathFK?.table).toBe('project_metadata');
    });

    it('project_decisions should reference project_metadata', () => {
      const foreignKeys = db.prepare(`PRAGMA foreign_key_list(project_decisions)`).all() as {
        table: string;
        from: string;
      }[];

      const projectPathFK = foreignKeys.find((fk) => fk.from === 'project_path');
      expect(projectPathFK).toBeDefined();
      expect(projectPathFK?.table).toBe('project_metadata');
    });
  });

  describe('Schema Integrity', () => {
    it('should be valid SQL (no syntax errors)', () => {
      // If we got here, schema loaded successfully
      expect(true).toBe(true);
    });

    it('should support basic CRUD operations on all tables', () => {
      // Test that tables accept inserts without errors
      const tables = [
        { name: 'semantic_concepts', insert: `INSERT INTO semantic_concepts (id, concept_name, concept_type) VALUES ('test1', 'TestConcept', 'class')` },
        { name: 'developer_patterns', insert: `INSERT INTO developer_patterns (pattern_id, pattern_type, pattern_content) VALUES ('pat1', 'naming', '{}')` },
        { name: 'file_intelligence', insert: `INSERT INTO file_intelligence (file_path, file_hash) VALUES ('/test/file.ts', 'abc123')` },
        { name: 'intelligence', insert: `INSERT INTO intelligence (id, project_path, status, created_at, updated_at) VALUES ('int1', '/project', 'pending', 12345, 12345)` },
        { name: 'patterns', insert: `INSERT INTO patterns (id, name, type, project_path, metadata, created_at) VALUES ('p1', 'TestPattern', 'design', '/project', '{}', 12345)` },
        { name: 'concepts', insert: `INSERT INTO concepts (id, name, type, file_path, line_number, project_path, metadata, created_at) VALUES ('c1', 'TestClass', 'class', '/test.ts', 1, '/project', '{}', 12345)` },
      ];

      for (const { name, insert } of tables) {
        expect(() => db.exec(insert)).not.toThrow();

        // Verify insert worked
        const count = db.prepare(`SELECT COUNT(*) as count FROM ${name}`).get() as { count: number };
        expect(count.count).toBeGreaterThan(0);
      }
    });
  });

  describe('Index Optimization', () => {
    it('should use index for developer_patterns type lookup', () => {
      // Insert test data
      db.exec(`
        INSERT INTO developer_patterns (pattern_id, pattern_type, pattern_content, frequency, confidence)
        VALUES ('dp1', 'naming', '{}', 10, 0.9)
      `);

      // Query explain should show index usage
      const plan = db.prepare(`
        EXPLAIN QUERY PLAN
        SELECT * FROM developer_patterns WHERE pattern_type = 'naming'
      `).all() as { detail: string }[];

      // Should use an index (not full table scan)
      const usesIndex = plan.some((p) =>
        p.detail.includes('USING INDEX') || p.detail.includes('idx_developer_patterns')
      );
      expect(usesIndex).toBe(true);
    });

    it('should use index for feature_map active lookup', () => {
      // Insert project_metadata first (for FK)
      db.exec(`
        INSERT INTO project_metadata (project_id, project_path)
        VALUES ('proj1', '/test/project')
      `);

      // Insert test data
      db.exec(`
        INSERT INTO feature_map (id, project_path, feature_name, primary_files, status)
        VALUES ('fm1', '/test/project', 'auth', '[]', 'active')
      `);

      // Query explain should show index usage
      const plan = db.prepare(`
        EXPLAIN QUERY PLAN
        SELECT * FROM feature_map WHERE project_path = '/test/project' AND status = 'active'
      `).all() as { detail: string }[];

      // Should use an index
      const usesIndex = plan.some((p) =>
        p.detail.includes('USING INDEX') || p.detail.includes('idx_feature_map')
      );
      expect(usesIndex).toBe(true);
    });

    it('should use index for patterns project+type lookup', () => {
      const plan = db.prepare(`
        EXPLAIN QUERY PLAN
        SELECT * FROM patterns WHERE project_path = '/project' AND type = 'design'
      `).all() as { detail: string }[];

      // Should use idx_patterns_project_type
      const usesIndex = plan.some((p) =>
        p.detail.includes('USING INDEX') || p.detail.includes('idx_patterns')
      );
      expect(usesIndex).toBe(true);
    });
  });
});
