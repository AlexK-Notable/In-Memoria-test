/**
 * Semantic concept types for code understanding and analysis.
 * These represent the core domain model for semantic code intelligence.
 */

export interface LineRange {
  start: number;
  end: number;
}

export type SemanticConceptType =
  | 'function'
  | 'class'
  | 'interface'
  | 'type'
  | 'constant'
  | 'variable'
  | 'module'
  | 'pattern'
  | 'architectural_concept'
  | 'domain_concept';

export type RelationshipType =
  | 'uses'
  | 'implements'
  | 'extends'
  | 'contains'
  | 'depends_on'
  | 'similar_to'
  | 'related_to';

export interface ConceptRelationship {
  targetConceptId: string;
  relationshipType: RelationshipType;
  strength: number; // 0-1
}

export interface ConceptEvolution {
  timestamp: Date;
  changeType: 'created' | 'modified' | 'renamed' | 'moved';
  previousValue?: string;
  newValue?: string;
}

/**
 * A semantic concept extracted from code analysis.
 * Represents a meaningful unit of code understanding (function, class, pattern, etc.)
 */
export interface SemanticConcept {
  id: string;
  conceptName: string;
  conceptType: string; // Using string for flexibility with existing data
  confidenceScore: number;
  relationships: Record<string, unknown>;
  evolutionHistory: Record<string, unknown>;
  filePath: string;
  lineRange: LineRange;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Summary version of a concept for API responses
 */
export interface ConceptSummary {
  name: string;
  type: string;
  confidence: number;
}

/**
 * Analyzed concept from fresh code analysis
 */
export interface AnalyzedConcept {
  name: string;
  type: string;
  confidence: number;
  filePath: string;
  lineRange: LineRange;
  relationships?: string[];
}
