/**
 * Repository Pattern Implementation
 *
 * Provides clean separation of data access logic from business logic.
 * Each repository encapsulates database operations for a specific entity type.
 *
 * @example
 * ```typescript
 * import { IntelligenceRepository, PatternRepository } from './repositories.js';
 *
 * const intelligenceRepo = new IntelligenceRepository(dbAdapter);
 * const patterns = await patternRepo.findByProject('/my/project');
 * ```
 */

import { escapeLikePattern } from '../utils/security.js';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Safely parse JSON string, returning empty object on failure.
 * Prevents crashes from malformed JSON in database.
 */
function safeParseJSON(jsonString: string | null | undefined): Record<string, unknown> {
  if (!jsonString) {
    return {};
  }
  try {
    return JSON.parse(jsonString);
  } catch {
    console.error('Failed to parse JSON metadata:', jsonString.substring(0, 100));
    return {};
  }
}

// ============================================================================
// Database Adapter Interface
// ============================================================================

/**
 * Database adapter interface for repository operations.
 * Abstracts the underlying database implementation.
 */
export interface DatabaseAdapter {
  /** Execute a query and return results */
  query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;

  /** Execute a statement without returning results */
  execute(sql: string, params?: unknown[]): Promise<void>;

  /** Get a single row */
  get<T = unknown>(sql: string, params?: unknown[]): Promise<T | undefined>;

  /** Get all rows */
  all<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;

  /** Run a statement and return changes count */
  run(sql: string, params?: unknown[]): Promise<{ changes: number }>;
}

// ============================================================================
// Record Types
// ============================================================================

/**
 * Intelligence record representing learned project intelligence
 */
export interface IntelligenceRecord {
  id: string;
  projectPath: string;
  status: 'pending' | 'learning' | 'complete' | 'error';
  fileCount: number;
  conceptCount: number;
  patternCount: number;
  createdAt: number;
  updatedAt: number;
  metadata?: Record<string, unknown>;
}

/**
 * Pattern record representing a detected code pattern
 */
export interface PatternRecord {
  id: string;
  name: string;
  type: string;
  confidence: number;
  occurrences: number;
  projectPath: string;
  metadata: Record<string, unknown>;
  createdAt: number;
}

/**
 * Concept record representing a code concept (class, function, etc.)
 */
export interface ConceptRecord {
  id: string;
  name: string;
  type: string;
  filePath: string;
  lineNumber: number;
  projectPath: string;
  metadata: Record<string, unknown>;
  createdAt: number;
}

/**
 * Intelligence status summary
 */
export interface IntelligenceStatus {
  status: string;
  fileCount: number;
  conceptCount: number;
}

/**
 * Pattern statistics
 */
export interface PatternStatistics {
  total: number;
  avgConfidence: number;
  avgOccurrences: number;
}

// ============================================================================
// Database Row Types (snake_case for SQL)
// ============================================================================

interface IntelligenceRow {
  id: string;
  project_path: string;
  status: string;
  file_count: number;
  concept_count: number;
  pattern_count: number;
  created_at: number;
  updated_at: number;
  metadata?: string;
}

interface PatternRow {
  id: string;
  name: string;
  type: string;
  confidence: number;
  occurrences: number;
  project_path: string;
  metadata: string;
  created_at: number;
}

interface ConceptRow {
  id: string;
  name: string;
  type: string;
  file_path: string;
  line_number: number;
  project_path: string;
  metadata: string;
  created_at: number;
}

// ============================================================================
// IntelligenceRepository
// ============================================================================

/**
 * Repository for managing intelligence records
 */
export class IntelligenceRepository {
  constructor(private db: DatabaseAdapter) {}

  /**
   * Save an intelligence record
   */
  async save(record: IntelligenceRecord): Promise<void> {
    const sql = `
      INSERT OR REPLACE INTO intelligence (
        id, project_path, status, file_count, concept_count,
        pattern_count, created_at, updated_at, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await this.db.run(sql, [
      record.id,
      record.projectPath,
      record.status,
      record.fileCount,
      record.conceptCount,
      record.patternCount,
      record.createdAt,
      record.updatedAt,
      record.metadata ? JSON.stringify(record.metadata) : null,
    ]);
  }

  /**
   * Find intelligence record by project path
   */
  async findByProjectPath(projectPath: string): Promise<IntelligenceRecord | null> {
    const sql = 'SELECT * FROM intelligence WHERE project_path = ?';
    const row = await this.db.get<IntelligenceRow>(sql, [projectPath]);

    if (!row) {
      return null;
    }

    return this.mapRowToRecord(row);
  }

  /**
   * Update an intelligence record
   */
  async update(
    id: string,
    updates: Partial<Omit<IntelligenceRecord, 'id' | 'createdAt'>>
  ): Promise<void> {
    const fields: string[] = [];
    const values: unknown[] = [];

    if (updates.projectPath !== undefined) {
      fields.push('project_path = ?');
      values.push(updates.projectPath);
    }
    if (updates.status !== undefined) {
      fields.push('status = ?');
      values.push(updates.status);
    }
    if (updates.fileCount !== undefined) {
      fields.push('file_count = ?');
      values.push(updates.fileCount);
    }
    if (updates.conceptCount !== undefined) {
      fields.push('concept_count = ?');
      values.push(updates.conceptCount);
    }
    if (updates.patternCount !== undefined) {
      fields.push('pattern_count = ?');
      values.push(updates.patternCount);
    }
    if (updates.updatedAt !== undefined) {
      fields.push('updated_at = ?');
      values.push(updates.updatedAt);
    }

    if (fields.length === 0) {
      return;
    }

    values.push(id);
    const sql = `UPDATE intelligence SET ${fields.join(', ')} WHERE id = ?`;
    await this.db.run(sql, values);
  }

  /**
   * Delete an intelligence record
   */
  async delete(id: string): Promise<boolean> {
    const sql = 'DELETE FROM intelligence WHERE id = ?';
    const result = await this.db.run(sql, [id]);
    return result.changes > 0;
  }

  /**
   * Check if project has intelligence data
   */
  async hasIntelligence(projectPath: string): Promise<boolean> {
    const sql = 'SELECT COUNT(*) as count FROM intelligence WHERE project_path = ?';
    const result = await this.db.get<{ count: number }>(sql, [projectPath]);
    return (result?.count ?? 0) > 0;
  }

  /**
   * Get intelligence status for a project
   */
  async getStatus(projectPath: string): Promise<IntelligenceStatus | null> {
    const sql = `
      SELECT status, file_count, concept_count
      FROM intelligence
      WHERE project_path = ?
    `;
    const row = await this.db.get<{
      status: string;
      file_count: number;
      concept_count: number;
    }>(sql, [projectPath]);

    if (!row) {
      return null;
    }

    return {
      status: row.status,
      fileCount: row.file_count,
      conceptCount: row.concept_count,
    };
  }

  /**
   * Map database row to record
   */
  private mapRowToRecord(row: IntelligenceRow): IntelligenceRecord {
    return {
      id: row.id,
      projectPath: row.project_path,
      status: row.status as IntelligenceRecord['status'],
      fileCount: row.file_count,
      conceptCount: row.concept_count,
      patternCount: row.pattern_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      metadata: row.metadata ? safeParseJSON(row.metadata) : undefined,
    };
  }
}

// ============================================================================
// PatternRepository
// ============================================================================

/**
 * Repository for managing pattern records
 */
export class PatternRepository {
  constructor(private db: DatabaseAdapter) {}

  /**
   * Save a pattern record
   */
  async save(record: PatternRecord): Promise<void> {
    const sql = `
      INSERT OR REPLACE INTO patterns (
        id, name, type, confidence, occurrences,
        project_path, metadata, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await this.db.run(sql, [
      record.id,
      record.name,
      record.type,
      record.confidence,
      record.occurrences,
      record.projectPath,
      JSON.stringify(record.metadata),
      record.createdAt,
    ]);
  }

  /**
   * Find patterns by project
   */
  async findByProject(projectPath: string): Promise<PatternRecord[]> {
    const sql = 'SELECT * FROM patterns WHERE project_path = ?';
    const rows = await this.db.all<PatternRow>(sql, [projectPath]);
    return rows.map((row) => this.mapRowToRecord(row));
  }

  /**
   * Find patterns by type
   */
  async findByType(projectPath: string, type: string): Promise<PatternRecord[]> {
    const sql = 'SELECT * FROM patterns WHERE project_path = ? AND type = ?';
    const rows = await this.db.all<PatternRow>(sql, [projectPath, type]);
    return rows.map((row) => this.mapRowToRecord(row));
  }

  /**
   * Find high confidence patterns
   */
  async findHighConfidence(
    projectPath: string,
    minConfidence: number
  ): Promise<PatternRecord[]> {
    const sql = `
      SELECT * FROM patterns
      WHERE project_path = ? AND confidence >= ?
      ORDER BY confidence DESC
    `;
    const rows = await this.db.all<PatternRow>(sql, [projectPath, minConfidence]);
    return rows.map((row) => this.mapRowToRecord(row));
  }

  /**
   * Delete patterns by project
   */
  async deleteByProject(projectPath: string): Promise<number> {
    const sql = 'DELETE FROM patterns WHERE project_path = ?';
    const result = await this.db.run(sql, [projectPath]);
    return result.changes;
  }

  /**
   * Get pattern statistics for a project
   */
  async getStatistics(projectPath: string): Promise<PatternStatistics> {
    const sql = `
      SELECT
        COUNT(*) as total,
        AVG(confidence) as avgConfidence,
        AVG(occurrences) as avgOccurrences
      FROM patterns
      WHERE project_path = ?
    `;
    const result = await this.db.get<{
      total: number;
      avgConfidence: number;
      avgOccurrences: number;
    }>(sql, [projectPath]);

    return {
      total: result?.total ?? 0,
      avgConfidence: result?.avgConfidence ?? 0,
      avgOccurrences: result?.avgOccurrences ?? 0,
    };
  }

  /**
   * Map database row to record
   */
  private mapRowToRecord(row: PatternRow): PatternRecord {
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      confidence: row.confidence,
      occurrences: row.occurrences,
      projectPath: row.project_path,
      metadata: safeParseJSON(row.metadata),
      createdAt: row.created_at,
    };
  }
}

// ============================================================================
// ConceptRepository
// ============================================================================

/**
 * Repository for managing concept records
 */
export class ConceptRepository {
  constructor(private db: DatabaseAdapter) {}

  /**
   * Save a concept record
   */
  async save(record: ConceptRecord): Promise<void> {
    const sql = `
      INSERT OR REPLACE INTO concepts (
        id, name, type, file_path, line_number,
        project_path, metadata, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await this.db.run(sql, [
      record.id,
      record.name,
      record.type,
      record.filePath,
      record.lineNumber,
      record.projectPath,
      JSON.stringify(record.metadata),
      record.createdAt,
    ]);
  }

  /**
   * Find concepts by file path
   */
  async findByFile(filePath: string): Promise<ConceptRecord[]> {
    const sql = 'SELECT * FROM concepts WHERE file_path = ?';
    const rows = await this.db.all<ConceptRow>(sql, [filePath]);
    return rows.map((row) => this.mapRowToRecord(row));
  }

  /**
   * Find concepts by type
   */
  async findByType(projectPath: string, type: string): Promise<ConceptRecord[]> {
    const sql = 'SELECT * FROM concepts WHERE project_path = ? AND type = ?';
    const rows = await this.db.all<ConceptRow>(sql, [projectPath, type]);
    return rows.map((row) => this.mapRowToRecord(row));
  }

  /**
   * Search concepts by name
   */
  async searchByName(projectPath: string, query: string): Promise<ConceptRecord[]> {
    const sql = `
      SELECT * FROM concepts
      WHERE project_path = ? AND name LIKE ? ESCAPE '\\'
      ORDER BY name
    `;
    // Escape special LIKE characters to prevent injection, then add wildcards
    const escapedQuery = escapeLikePattern(query);
    const rows = await this.db.all<ConceptRow>(sql, [projectPath, `%${escapedQuery}%`]);
    return rows.map((row) => this.mapRowToRecord(row));
  }

  /**
   * Delete concepts by project
   */
  async deleteByProject(projectPath: string): Promise<number> {
    const sql = 'DELETE FROM concepts WHERE project_path = ?';
    const result = await this.db.run(sql, [projectPath]);
    return result.changes;
  }

  /**
   * Get concept count for a project
   */
  async getCount(projectPath: string): Promise<number> {
    const sql = 'SELECT COUNT(*) as count FROM concepts WHERE project_path = ?';
    const result = await this.db.get<{ count: number }>(sql, [projectPath]);
    return result?.count ?? 0;
  }

  /**
   * Map database row to record
   */
  private mapRowToRecord(row: ConceptRow): ConceptRecord {
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      filePath: row.file_path,
      lineNumber: row.line_number,
      projectPath: row.project_path,
      metadata: safeParseJSON(row.metadata),
      createdAt: row.created_at,
    };
  }
}
