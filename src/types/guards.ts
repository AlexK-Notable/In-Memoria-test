/**
 * Runtime type guards for safe type narrowing.
 * Use these at system boundaries (JSON parsing, API inputs) to ensure type safety.
 */

import type { LineRange, SemanticConcept } from './semantic.js';
import type { DeveloperPattern, PatternContent } from './patterns.js';
import type {
  ComplexityMetrics,
  FileMetadata,
  EntryPoint,
  KeyDirectory,
  FeatureMap,
  WorkSession
} from './analysis.js';

/**
 * Check if a value is a valid LineRange
 */
export function isLineRange(value: unknown): value is LineRange {
  return (
    typeof value === 'object' &&
    value !== null &&
    'start' in value &&
    'end' in value &&
    typeof (value as LineRange).start === 'number' &&
    typeof (value as LineRange).end === 'number'
  );
}

/**
 * Check if a value is a valid SemanticConcept
 */
export function isSemanticConcept(value: unknown): value is SemanticConcept {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.conceptName === 'string' &&
    typeof v.conceptType === 'string' &&
    typeof v.confidenceScore === 'number' &&
    typeof v.filePath === 'string' &&
    isLineRange(v.lineRange)
  );
}

/**
 * Check if a value is a valid DeveloperPattern
 */
export function isDeveloperPattern(value: unknown): value is DeveloperPattern {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.patternId === 'string' &&
    typeof v.patternType === 'string' &&
    typeof v.frequency === 'number' &&
    typeof v.confidence === 'number' &&
    Array.isArray(v.contexts)
  );
}

/**
 * Check if a value is a valid ComplexityMetrics
 */
export function isComplexityMetrics(value: unknown): value is ComplexityMetrics {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.cyclomatic === 'number' &&
    typeof v.cognitive === 'number'
  );
}

/**
 * Assert that a value is a SemanticConcept, throwing if not
 */
export function assertSemanticConcept(value: unknown): asserts value is SemanticConcept {
  if (!isSemanticConcept(value)) {
    throw new Error('Invalid SemanticConcept structure');
  }
}

/**
 * Assert that a value is a DeveloperPattern, throwing if not
 */
export function assertDeveloperPattern(value: unknown): asserts value is DeveloperPattern {
  if (!isDeveloperPattern(value)) {
    throw new Error('Invalid DeveloperPattern structure');
  }
}

/**
 * Safely parse JSON with type validation
 */
export function safeParseJSON<T>(
  json: string,
  validator: (value: unknown) => value is T,
  defaultValue: T
): T {
  try {
    const parsed = JSON.parse(json);
    if (validator(parsed)) {
      return parsed;
    }
    return defaultValue;
  } catch {
    return defaultValue;
  }
}

/**
 * Check if a value is a non-null object
 */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Check if a value is a string array
 */
export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

/**
 * Check if a value is a number within a range
 */
export function isNumberInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && value >= min && value <= max;
}

/**
 * Check if a value is a valid FileMetadata
 */
export function isFileMetadata(value: unknown): value is FileMetadata {
  if (!isObject(value)) return false;
  // All fields are optional, but if present must be correct type
  if ('language' in value && typeof value.language !== 'string') return false;
  if ('lineCount' in value && typeof value.lineCount !== 'number') return false;
  if ('complexity' in value && typeof value.complexity !== 'number') return false;
  if ('lastModified' in value && !(value.lastModified instanceof Date)) return false;
  return true;
}

/**
 * Check if a value is a valid PatternContent structure
 */
export function isPatternContent(value: unknown): value is PatternContent {
  if (!isObject(value)) return false;
  return typeof value.description === 'string';
}

/**
 * Check if a value is a valid EntryPoint
 */
export function isEntryPoint(value: unknown): value is EntryPoint {
  if (!isObject(value)) return false;
  return (
    typeof value.id === 'string' &&
    typeof value.projectPath === 'string' &&
    typeof value.entryType === 'string' &&
    typeof value.filePath === 'string' &&
    value.createdAt instanceof Date
  );
}

/**
 * Check if a value is a valid KeyDirectory
 */
export function isKeyDirectory(value: unknown): value is KeyDirectory {
  if (!isObject(value)) return false;
  return (
    typeof value.id === 'string' &&
    typeof value.projectPath === 'string' &&
    typeof value.directoryPath === 'string' &&
    typeof value.directoryType === 'string' &&
    typeof value.fileCount === 'number' &&
    value.createdAt instanceof Date
  );
}

/**
 * Check if a value is a valid FeatureMap
 */
export function isFeatureMap(value: unknown): value is FeatureMap {
  if (!isObject(value)) return false;
  return (
    typeof value.id === 'string' &&
    typeof value.projectPath === 'string' &&
    typeof value.featureName === 'string' &&
    isStringArray(value.primaryFiles) &&
    isStringArray(value.relatedFiles) &&
    isStringArray(value.dependencies) &&
    typeof value.status === 'string' &&
    value.createdAt instanceof Date &&
    value.updatedAt instanceof Date
  );
}

/**
 * Check if a value is a valid WorkSession
 */
export function isWorkSession(value: unknown): value is WorkSession {
  if (!isObject(value)) return false;
  return (
    typeof value.id === 'string' &&
    typeof value.projectPath === 'string' &&
    value.sessionStart instanceof Date &&
    isStringArray(value.currentFiles) &&
    isStringArray(value.completedTasks) &&
    isStringArray(value.pendingTasks) &&
    isStringArray(value.blockers) &&
    value.lastUpdated instanceof Date
  );
}

/**
 * Check if a value is a valid Date or can be converted to one
 */
export function isValidDate(value: unknown): value is Date {
  if (value instanceof Date) return !isNaN(value.getTime());
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    return !isNaN(date.getTime());
  }
  return false;
}

/**
 * Safely convert a value to a Date, returning undefined if invalid
 */
export function toDate(value: unknown): Date | undefined {
  if (value instanceof Date && !isNaN(value.getTime())) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    if (!isNaN(date.getTime())) return date;
  }
  return undefined;
}

/**
 * Check if value has required string property
 */
export function hasStringProp(obj: unknown, key: string): obj is Record<string, unknown> & { [K in typeof key]: string } {
  return isObject(obj) && typeof obj[key] === 'string';
}

/**
 * Check if value has required number property
 */
export function hasNumberProp(obj: unknown, key: string): obj is Record<string, unknown> & { [K in typeof key]: number } {
  return isObject(obj) && typeof obj[key] === 'number';
}
