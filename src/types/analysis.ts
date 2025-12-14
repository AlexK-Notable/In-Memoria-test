/**
 * Code analysis types for codebase understanding.
 * These represent the results of static analysis operations.
 */

import type { AnalyzedConcept } from './semantic.js';
import type { AnalyzedPattern } from './patterns.js';

export type TechnicalDebtLevel = 'low' | 'moderate' | 'high' | 'critical';

export interface ComplexityMetrics {
  cyclomatic: number;
  cognitive: number;
  lines?: number;
  halsteadDifficulty?: number;
  maintainabilityIndex?: number;
  technicalDebt?: TechnicalDebtLevel;
}

export interface FileMetadata {
  language?: string;
  lineCount?: number;
  complexity?: number;
  lastModified?: Date;
}

export interface DirectoryStructure {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: DirectoryStructure[];
  metadata?: FileMetadata;
}

/**
 * Complete codebase analysis result
 */
export interface CodebaseAnalysis {
  path: string;
  languages: string[];
  frameworks: string[];
  concepts: AnalyzedConcept[];
  patterns?: AnalyzedPattern[];
  structure?: DirectoryStructure;
  complexity?: ComplexityMetrics;
  analyzedAt?: Date;
}

/**
 * File-level intelligence tracking
 */
export interface FileIntelligence {
  filePath: string;
  fileHash: string;
  semanticConcepts: string[];
  patternsUsed: string[];
  complexityMetrics: Record<string, number>;
  dependencies: string[];
  lastAnalyzed: Date;
  createdAt: Date;
}

/**
 * AI-contributed insight
 */
export interface AIInsight {
  insightId: string;
  insightType: string;
  insightContent: Record<string, unknown>;
  confidenceScore: number;
  sourceAgent: string;
  validationStatus: 'pending' | 'validated' | 'rejected';
  impactPrediction: Record<string, unknown>;
  createdAt: Date;
}

/**
 * Feature mapping for project understanding
 */
export interface FeatureMap {
  id: string;
  projectPath: string;
  featureName: string;
  primaryFiles: string[];
  relatedFiles: string[];
  dependencies: string[];
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Project entry point detection
 */
export interface EntryPoint {
  id: string;
  projectPath: string;
  entryType: string;
  filePath: string;
  description?: string;
  framework?: string;
  createdAt: Date;
}

/**
 * Key directory classification
 */
export interface KeyDirectory {
  id: string;
  projectPath: string;
  directoryPath: string;
  directoryType: string;
  fileCount: number;
  description?: string;
  createdAt: Date;
}

/**
 * Developer work session tracking
 */
export interface WorkSession {
  id: string;
  projectPath: string;
  sessionStart: Date;
  sessionEnd?: Date;
  lastFeature?: string;
  currentFiles: string[];
  completedTasks: string[];
  pendingTasks: string[];
  blockers: string[];
  sessionNotes?: string;
  lastUpdated: Date;
}

/**
 * Project architectural decision
 */
export interface ProjectDecision {
  id: string;
  projectPath: string;
  decisionKey: string;
  decisionValue: string;
  reasoning?: string;
  madeAt: Date;
}
