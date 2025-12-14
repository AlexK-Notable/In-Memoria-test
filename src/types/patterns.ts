/**
 * Developer pattern types for learning and prediction.
 * These represent coding patterns learned from codebase analysis.
 */

export type PatternType =
  | 'naming_convention'
  | 'structural_pattern'
  | 'error_handling'
  | 'import_organization'
  | 'function_signature'
  | 'class_structure'
  | 'file_organization'
  | 'comment_style'
  | 'testing_pattern';

export interface PatternVariable {
  name: string;
  type: string;
  description: string;
  examples: string[];
}

export interface PatternConstraint {
  type: 'required' | 'optional' | 'forbidden';
  condition: string;
  message: string;
}

export interface PatternContent {
  template?: string;
  description?: string;
  variables?: PatternVariable[];
  constraints?: PatternConstraint[];
}

export interface PatternExample {
  code: string;
  filePath: string;
  lineNumber: number;
  explanation?: string;
}

/**
 * A developer pattern learned from code analysis.
 * Represents recurring coding practices and conventions.
 */
export interface DeveloperPattern {
  patternId: string;
  patternType: string; // Using string for flexibility with existing data
  patternContent: Record<string, unknown>;
  frequency: number;
  contexts: string[];
  examples: Record<string, unknown>[];
  confidence: number;
  createdAt: Date;
  lastSeen: Date;
}

/**
 * Summary version of a pattern for API responses
 */
export interface PatternSummary {
  type: string;
  description: string;
  frequency: number;
}

/**
 * Analyzed pattern from fresh code analysis
 */
export interface AnalyzedPattern {
  type: string;
  description: string;
  frequency: number;
  confidence: number;
  examples: string[];
}
