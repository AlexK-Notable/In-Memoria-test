/**
 * Engine Interfaces
 *
 * Defines core interfaces for engines, storage, and Rust bridge services.
 * These interfaces enable dependency injection, testing with mocks,
 * and loose coupling between components.
 */

import type { SemanticConcept, DeveloperPattern, FeatureMap } from '../types/index.js';

// ============================================================================
// Progress Callback
// ============================================================================

/**
 * Callback for reporting progress during long-running operations.
 * Used by engines during learning and analysis phases.
 *
 * @param current - Current item number (1-indexed)
 * @param total - Total number of items
 * @param message - Human-readable progress message
 */
export type ProgressCallback = (current: number, total: number, message: string) => void;

// ============================================================================
// Supporting Types
// ============================================================================

/**
 * Result from semantic similarity search
 */
export interface SemanticSearchResult {
  concept: string;
  similarity: number;
  filePath: string;
}

/**
 * Entry point in a codebase
 */
export interface EntryPoint {
  type: string;
  filePath: string;
  framework?: string;
}

/**
 * Key directory in a project structure
 */
export interface KeyDirectory {
  path: string;
  type: string;
  fileCount: number;
}

/**
 * Prediction for how to approach a coding task
 */
export interface ApproachPrediction {
  approach: string;
  confidence: number;
  reasoning: string;
  patterns: string[];
  complexity: 'low' | 'medium' | 'high';
}

/**
 * File routing suggestion for implementing a feature
 */
export interface FileRouting {
  intendedFeature: string;
  targetFiles: string[];
  workType: 'feature' | 'bugfix' | 'refactor' | 'test';
  suggestedStartPoint: string;
  confidence: number;
  reasoning: string;
}

/**
 * Health status of the Rust bridge service
 */
export interface RustBridgeHealth {
  isHealthy: boolean;
  circuitState: string;
  degradationMode: boolean;
  failureCount: number;
  lastSuccessTime?: Date;
  lastFailureTime?: Date;
}

/**
 * Result from codebase analysis
 */
export interface CodebaseAnalysisResult {
  languages: string[];
  frameworks: string[];
  concepts: Array<{
    name: string;
    type: string;
    confidence: number;
  }>;
  complexity: {
    cyclomatic: number;
    cognitive: number;
    lines: number;
  };
  analysisStatus?: 'normal' | 'degraded';
  errors?: string[];
  entryPoints?: Array<{
    type: string;
    filePath: string;
    framework?: string;
  }>;
  keyDirectories?: Array<{
    path: string;
    type: string;
    fileCount: number;
  }>;
}

/**
 * Concept extracted from file analysis
 */
export interface AnalyzedConcept {
  name: string;
  type: string;
  confidence: number;
  filePath: string;
  lineRange: { start: number; end: number };
}

/**
 * Concept learned from codebase (includes id and relationships)
 */
export interface LearnedConcept {
  id: string;
  name: string;
  type: string;
  confidence: number;
  filePath: string;
  lineRange: { start: number; end: number };
  relationships: Record<string, unknown>;
}

/**
 * Pattern extracted from analysis
 * Note: frequency, contexts, examples are optional as file-level analysis
 * may not include these (they are populated at codebase level)
 */
export interface AnalyzedPattern {
  type: string;
  description: string;
  confidence: number;
  frequency?: number;
  contexts?: string[];
  examples?: string[];
}

/**
 * Result from pattern extraction
 */
export interface PatternExtractionResult {
  type: string;
  description: string;
  frequency: number;
}

/**
 * Relevant pattern for a given problem
 */
export interface RelevantPattern {
  patternId: string;
  patternType: string;
  patternContent: Record<string, unknown>;
  frequency: number;
  contexts: string[];
  examples: Array<{ code: string }>;
  confidence: number;
}

/**
 * Feature map result
 */
export interface FeatureMapResult {
  id: string;
  featureName: string;
  primaryFiles: string[];
  relatedFiles: string[];
  dependencies: string[];
}

/**
 * Pattern learned from codebase analysis
 */
export interface LearnedPattern {
  id: string;
  type: string;
  content: Record<string, unknown>;
  frequency: number;
  confidence: number;
  contexts: string[];
  examples: Array<{ code: string }>;
}

// ============================================================================
// Storage Provider Interface
// ============================================================================

/**
 * Interface for storage operations.
 * Enables dependency injection and testing with mock storage.
 * Coordinates with Performance agent's batch operation requirements.
 */
export interface IStorageProvider {
  // Semantic concepts
  insertSemanticConcept(concept: Omit<SemanticConcept, 'createdAt' | 'updatedAt'>): void;
  insertSemanticConceptsBatch(concepts: Array<Omit<SemanticConcept, 'createdAt' | 'updatedAt'>>): void;
  getSemanticConcepts(filePath?: string): SemanticConcept[];

  // Developer patterns
  insertDeveloperPattern(pattern: Omit<DeveloperPattern, 'createdAt' | 'lastSeen'>): void;
  insertDeveloperPatternsBatch(patterns: Array<Omit<DeveloperPattern, 'createdAt' | 'lastSeen'>>): void;
  getDeveloperPatterns(patternType?: string, limit?: number): DeveloperPattern[];

  // Feature maps
  getFeatureMaps(projectPath: string): FeatureMap[];
  insertFeatureMap(feature: Omit<FeatureMap, 'createdAt' | 'updatedAt'>): void;

  // Transaction support (Performance agent coordination)
  transaction<T>(fn: () => T): T;
}

// ============================================================================
// Semantic Engine Interface
// ============================================================================

/**
 * Interface for semantic analysis engine.
 * Enables testing and loose coupling.
 */
export interface ISemanticEngine {
  /**
   * Analyze a codebase for languages, frameworks, and concepts
   */
  analyzeCodebase(path: string): Promise<CodebaseAnalysisResult>;

  /**
   * Analyze content of a single file
   */
  analyzeFileContent(filePath: string, content: string): Promise<AnalyzedConcept[]>;

  /**
   * Learn semantic concepts from entire codebase
   */
  learnFromCodebase(path: string, progressCallback?: ProgressCallback): Promise<LearnedConcept[]>;

  /**
   * Search for semantically similar concepts
   */
  searchSemanticallySimilar(query: string, limit?: number): Promise<SemanticSearchResult[]>;

  /**
   * Detect entry points in the project
   */
  detectEntryPoints(projectPath: string, frameworks: string[]): Promise<EntryPoint[]>;

  /**
   * Map key directories in the project
   */
  mapKeyDirectories(projectPath: string): Promise<KeyDirectory[]>;

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    fileCache: { size: number; hitRate?: number };
    codebaseCache: { size: number; hitRate?: number };
  };

  /**
   * Clean up resources
   */
  cleanup(): void;
}

// ============================================================================
// Pattern Engine Interface
// ============================================================================

/**
 * Interface for pattern analysis engine.
 * Enables testing and loose coupling.
 */
export interface IPatternEngine {
  /**
   * Extract patterns from a path
   */
  extractPatterns(path: string): Promise<PatternExtractionResult[]>;

  /**
   * Analyze patterns in a single file
   */
  analyzeFilePatterns(filePath: string, content: string): Promise<AnalyzedPattern[]>;

  /**
   * Learn patterns from entire codebase
   */
  learnFromCodebase(path: string, progressCallback?: ProgressCallback): Promise<LearnedPattern[]>;

  /**
   * Find patterns relevant to a problem
   */
  findRelevantPatterns(
    problemDescription: string,
    currentFile?: string,
    selectedCode?: string
  ): Promise<RelevantPattern[]>;

  /**
   * Predict approach for solving a problem
   */
  predictApproach(
    problemDescription: string,
    context: Record<string, unknown>
  ): Promise<ApproachPrediction>;

  /**
   * Build feature map for a project
   */
  buildFeatureMap(projectPath: string): Promise<FeatureMapResult[]>;

  /**
   * Route a request to relevant files
   */
  routeRequestToFiles(
    problemDescription: string,
    projectPath: string
  ): Promise<FileRouting | null>;
}

// ============================================================================
// Rust Bridge Service Interface
// ============================================================================

/**
 * Interface for centralized Rust bridge service.
 * Provides unified circuit breaker and health monitoring.
 */
export interface IRustBridgeService {
  /**
   * Execute an operation with circuit breaker protection
   */
  execute<T>(operation: () => Promise<T>, fallback?: () => Promise<T>): Promise<T>;

  /**
   * Get health status of the Rust bridge
   */
  getHealth(): RustBridgeHealth;

  /**
   * Check if service is in degraded mode
   */
  isInDegradedMode(): boolean;

  /**
   * Force reset the circuit breaker
   */
  forceReset(): void;
}
