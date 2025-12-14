/**
 * Core type definitions for In-Memoria.
 * Re-exports all domain types for convenient importing.
 */

// Semantic concepts
export type {
  LineRange,
  SemanticConceptType,
  RelationshipType,
  ConceptRelationship,
  ConceptEvolution,
  SemanticConcept,
  ConceptSummary,
  AnalyzedConcept,
} from './semantic.js';

// Developer patterns
export type {
  PatternType,
  PatternVariable,
  PatternConstraint,
  PatternContent,
  PatternExample,
  DeveloperPattern,
  PatternSummary,
  AnalyzedPattern,
} from './patterns.js';

// Code analysis
export type {
  TechnicalDebtLevel,
  ComplexityMetrics,
  FileMetadata,
  DirectoryStructure,
  CodebaseAnalysis,
  FileIntelligence,
  AIInsight,
  FeatureMap,
  EntryPoint,
  KeyDirectory,
  WorkSession,
  ProjectDecision,
} from './analysis.js';

// MCP tool responses
export type {
  LearningStatus,
  AnalyzeCodebaseResponse,
  SearchResult,
  SearchCodebaseResponse,
  ProjectBlueprintResponse,
  LearnCodebaseResponse,
  SemanticInsightsResponse,
  PatternRecommendationsResponse,
  CodingApproachResponse,
  DeveloperProfileResponse,
  ContributeInsightsResponse,
  AutoLearnResponse,
  SystemStatusResponse,
  IntelligenceMetricsResponse,
  PerformanceStatusResponse,
  HealthCheckResponse,
} from './mcp-responses.js';

// Type guards
export {
  isLineRange,
  isSemanticConcept,
  isDeveloperPattern,
  isComplexityMetrics,
  isFileMetadata,
  isPatternContent,
  isEntryPoint,
  isKeyDirectory,
  isFeatureMap,
  isWorkSession,
  isValidDate,
  toDate,
  hasStringProp,
  hasNumberProp,
  assertSemanticConcept,
  assertDeveloperPattern,
  safeParseJSON,
  isObject,
  isStringArray,
  isNumberInRange,
} from './guards.js';
