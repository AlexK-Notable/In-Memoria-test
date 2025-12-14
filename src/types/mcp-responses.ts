/**
 * MCP tool response types - contracts for what AI agents receive.
 * These ensure consistent API responses across all tools.
 */

import type { ComplexityMetrics, DirectoryStructure } from './analysis.js';
import type { ConceptSummary } from './semantic.js';
import type { PatternSummary } from './patterns.js';

/**
 * Learning status for a project
 */
export interface LearningStatus {
  hasIntelligence: boolean;
  isStale: boolean;
  conceptsStored: number;
  patternsStored: number;
  recommendation: 'ready' | 'learning_recommended' | 'learning_required';
  message: string;
}

/**
 * Response from analyze_codebase tool
 */
export interface AnalyzeCodebaseResponse {
  path: string;
  isDirectory: boolean;
  summary: {
    language?: string;
    languages?: string[];
    lineCount?: number;
    fileCount?: number;
    concepts: ConceptSummary[];
    patterns: PatternSummary[];
    complexity?: ComplexityMetrics;
  };
  structure?: DirectoryStructure;
  message: string;
}

/**
 * Search result item
 */
export interface SearchResult {
  filePath: string;
  relevance: number;
  matchType: string;
  context: string;
  lineNumber?: number;
}

/**
 * Response from search_codebase tool
 */
export interface SearchCodebaseResponse {
  query: string;
  searchType: 'semantic' | 'text' | 'pattern';
  results: SearchResult[];
  totalResults: number;
  message: string;
}

/**
 * Response from get_project_blueprint tool
 */
export interface ProjectBlueprintResponse {
  projectPath: string;
  techStack: string[];
  entryPoints: Record<string, string>;
  keyDirectories: Record<string, string>;
  architecture: string;
  featureMap?: Record<string, string[]>;
  learningStatus: LearningStatus;
  message: string;
}

/**
 * Response from learn_codebase_intelligence tool
 */
export interface LearnCodebaseResponse {
  success: boolean;
  projectPath: string;
  conceptsLearned: number;
  patternsLearned: number;
  featuresLearned: number;
  insights: string[];
  message: string;
}

/**
 * Response from get_semantic_insights tool
 */
export interface SemanticInsightsResponse {
  query: string;
  insights: Array<{
    concept: string;
    type: string;
    confidence: number;
    relationships: string[];
    context?: string;
  }>;
  totalConcepts: number;
  message: string;
}

/**
 * Response from get_pattern_recommendations tool
 */
export interface PatternRecommendationsResponse {
  context: string;
  recommendations: Array<{
    pattern: string;
    description: string;
    confidence: number;
    examples: string[];
    reasoning: string;
  }>;
  message: string;
}

/**
 * Response from predict_coding_approach tool
 */
export interface CodingApproachResponse {
  problemDescription: string;
  approach: {
    strategy: string;
    confidence: number;
    reasoning: string;
    suggestedPatterns: string[];
    estimatedComplexity: 'low' | 'medium' | 'high';
  };
  message: string;
}

/**
 * Response from get_developer_profile tool
 */
export interface DeveloperProfileResponse {
  projectPath: string;
  profile: {
    preferredPatterns: Array<{
      pattern: string;
      frequency: number;
    }>;
    codingStyle: {
      namingConventions: Record<string, string>;
      structuralPreferences: string[];
    };
    expertiseAreas: string[];
    recentFocus: string[];
    currentWork?: {
      lastFeature?: string;
      currentFiles: string[];
      pendingTasks: string[];
    };
  };
  message: string;
}

/**
 * Response from contribute_insights tool
 */
export interface ContributeInsightsResponse {
  success: boolean;
  insightId: string;
  validationStatus: 'pending' | 'validated' | 'rejected';
  message: string;
}

/**
 * Response from auto_learn_if_needed tool
 */
export interface AutoLearnResponse {
  action: 'learned' | 'skipped' | 'failed';
  reason: string;
  conceptsLearned?: number;
  patternsLearned?: number;
  message: string;
}

/**
 * Response from get_system_status tool
 */
export interface SystemStatusResponse {
  status: 'healthy' | 'degraded' | 'error';
  components: Record<string, {
    status: 'ok' | 'warning' | 'error';
    message?: string;
  }>;
  uptime: number;
  message: string;
}

/**
 * Response from get_intelligence_metrics tool
 */
export interface IntelligenceMetricsResponse {
  projectPath: string;
  metrics: {
    totalConcepts: number;
    totalPatterns: number;
    totalFeatures: number;
    coveragePercentage: number;
    lastLearned?: Date;
    isStale: boolean;
  };
  message: string;
}

/**
 * Response from get_performance_status tool
 */
export interface PerformanceStatusResponse {
  metrics: {
    averageQueryTime: number;
    cacheHitRate: number;
    memoryUsage: number;
    databaseSize: number;
  };
  recommendations: string[];
  message: string;
}

/**
 * Response from health_check tool
 */
export interface HealthCheckResponse {
  healthy: boolean;
  checks: Record<string, {
    passed: boolean;
    message: string;
    duration?: number;
  }>;
  message: string;
}
