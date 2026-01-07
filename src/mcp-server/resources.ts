/**
 * MCP Resources Implementation for In-Memoria
 *
 * Exposes project metadata and intelligence data as MCP resources.
 * Resources are read-only and provide access to:
 * - Project blueprint (structure, tech stack, entry points)
 * - Learned semantic concepts
 * - Learned developer patterns
 * - Intelligence status
 */

import type { Resource, ResourceTemplate } from '@modelcontextprotocol/sdk/types.js';
import type { SQLiteDatabase, SemanticConcept, DeveloperPattern } from '../storage/sqlite-db.js';
import { Logger } from '../utils/logger.js';

/**
 * Resource URIs supported by In-Memoria
 */
export const RESOURCE_URIS = {
  PROJECT_BLUEPRINT: 'in-memoria://project/blueprint',
  INTELLIGENCE_STATUS: 'in-memoria://intelligence/status',
  INTELLIGENCE_CONCEPTS: 'in-memoria://intelligence/concepts',
  INTELLIGENCE_PATTERNS: 'in-memoria://intelligence/patterns',
} as const;

/**
 * Resource templates for dynamic resource discovery
 */
export const RESOURCE_TEMPLATES: ResourceTemplate[] = [
  {
    uriTemplate: 'in-memoria://intelligence/concepts/{type}',
    name: 'Concepts by Type',
    description: 'Semantic concepts filtered by type (function, class, interface, etc.)',
    mimeType: 'application/json',
  },
  {
    uriTemplate: 'in-memoria://intelligence/patterns/{type}',
    name: 'Patterns by Type',
    description: 'Developer patterns filtered by type (naming, structural, implementation)',
    mimeType: 'application/json',
  },
];

/**
 * Result type for resource read operations
 */
export interface ResourceContent {
  uri: string;
  mimeType: string;
  text: string;
}

/**
 * Project blueprint resource data
 */
export interface ProjectBlueprintResource {
  projectPath: string;
  techStack: string[];
  entryPoints: Array<{
    type: string;
    filePath: string;
    framework?: string;
  }>;
  keyDirectories: Array<{
    type: string;
    path: string;
    fileCount: number;
  }>;
  lastUpdated: string;
}

/**
 * Intelligence status resource data
 */
export interface IntelligenceStatusResource {
  hasIntelligence: boolean;
  conceptsCount: number;
  patternsCount: number;
  conceptTypes: string[];
  patternTypes: string[];
  lastUpdated: string;
}

/**
 * Handler for In-Memoria MCP resources
 */
export class InMemoriaResourceHandler {
  private projectPath: string;

  constructor(
    private database: SQLiteDatabase,
    projectPath?: string
  ) {
    this.projectPath = projectPath ?? process.cwd();
  }

  /**
   * List all available resources
   */
  async listResources(): Promise<Resource[]> {
    const resources: Resource[] = [
      {
        uri: RESOURCE_URIS.PROJECT_BLUEPRINT,
        name: 'Project Blueprint',
        description: 'Overview of project structure, tech stack, and entry points',
        mimeType: 'application/json',
      },
      {
        uri: RESOURCE_URIS.INTELLIGENCE_STATUS,
        name: 'Intelligence Status',
        description: 'Current state of learned intelligence data',
        mimeType: 'application/json',
      },
      {
        uri: RESOURCE_URIS.INTELLIGENCE_CONCEPTS,
        name: 'Semantic Concepts',
        description: 'All semantic concepts extracted from the codebase',
        mimeType: 'application/json',
      },
      {
        uri: RESOURCE_URIS.INTELLIGENCE_PATTERNS,
        name: 'Developer Patterns',
        description: 'All developer patterns learned from the codebase',
        mimeType: 'application/json',
      },
    ];

    // Add dynamic resources for each concept type
    const conceptTypes = this.getConceptTypes();
    for (const type of conceptTypes) {
      resources.push({
        uri: `in-memoria://intelligence/concepts/${type}`,
        name: `${this.capitalizeFirst(type)} Concepts`,
        description: `Semantic concepts of type: ${type}`,
        mimeType: 'application/json',
      });
    }

    // Add dynamic resources for each pattern type
    const patternTypes = this.getPatternTypes();
    for (const type of patternTypes) {
      resources.push({
        uri: `in-memoria://intelligence/patterns/${type}`,
        name: `${this.capitalizeFirst(type)} Patterns`,
        description: `Developer patterns of type: ${type}`,
        mimeType: 'application/json',
      });
    }

    return resources;
  }

  /**
   * Read a specific resource by URI
   */
  async readResource(uri: string): Promise<ResourceContent> {
    Logger.debug(`Reading resource: ${uri}`);

    // Handle static resources
    if (uri === RESOURCE_URIS.PROJECT_BLUEPRINT) {
      return this.getProjectBlueprintResource();
    }

    if (uri === RESOURCE_URIS.INTELLIGENCE_STATUS) {
      return this.getIntelligenceStatusResource();
    }

    if (uri === RESOURCE_URIS.INTELLIGENCE_CONCEPTS) {
      return this.getAllConceptsResource();
    }

    if (uri === RESOURCE_URIS.INTELLIGENCE_PATTERNS) {
      return this.getAllPatternsResource();
    }

    // Handle dynamic resources with parameters
    const conceptTypeMatch = uri.match(/^in-memoria:\/\/intelligence\/concepts\/(.+)$/);
    if (conceptTypeMatch) {
      const type = decodeURIComponent(conceptTypeMatch[1]);
      return this.getConceptsByTypeResource(type);
    }

    const patternTypeMatch = uri.match(/^in-memoria:\/\/intelligence\/patterns\/(.+)$/);
    if (patternTypeMatch) {
      const type = decodeURIComponent(patternTypeMatch[1]);
      return this.getPatternsByTypeResource(type);
    }

    throw new Error(`Unknown resource URI: ${uri}`);
  }

  /**
   * Get project blueprint resource
   */
  private async getProjectBlueprintResource(): Promise<ResourceContent> {
    const entryPoints = this.database.getEntryPoints(this.projectPath);
    const keyDirectories = this.database.getKeyDirectories(this.projectPath);

    const techStack = Array.from(new Set(
      entryPoints
        .map(ep => ep.framework)
        .filter((f): f is string => f !== null && f !== undefined)
    ));

    const blueprint: ProjectBlueprintResource = {
      projectPath: this.projectPath,
      techStack,
      entryPoints: entryPoints.map(ep => ({
        type: ep.entryType,
        filePath: ep.filePath,
        framework: ep.framework ?? undefined,
      })),
      keyDirectories: keyDirectories.map(dir => ({
        type: dir.directoryType,
        path: dir.directoryPath,
        fileCount: dir.fileCount,
      })),
      lastUpdated: new Date().toISOString(),
    };

    return {
      uri: RESOURCE_URIS.PROJECT_BLUEPRINT,
      mimeType: 'application/json',
      text: JSON.stringify(blueprint, null, 2),
    };
  }

  /**
   * Get intelligence status resource
   */
  private async getIntelligenceStatusResource(): Promise<ResourceContent> {
    const concepts = this.database.getSemanticConcepts();
    const patterns = this.database.getDeveloperPatterns();

    const conceptTypes = Array.from(new Set(concepts.map(c => c.conceptType)));
    const patternTypes = Array.from(new Set(patterns.map(p => p.patternType)));

    const status: IntelligenceStatusResource = {
      hasIntelligence: concepts.length > 0 || patterns.length > 0,
      conceptsCount: concepts.length,
      patternsCount: patterns.length,
      conceptTypes,
      patternTypes,
      lastUpdated: new Date().toISOString(),
    };

    return {
      uri: RESOURCE_URIS.INTELLIGENCE_STATUS,
      mimeType: 'application/json',
      text: JSON.stringify(status, null, 2),
    };
  }

  /**
   * Get all concepts resource
   */
  private async getAllConceptsResource(): Promise<ResourceContent> {
    const concepts = this.database.getSemanticConcepts();

    const data = {
      count: concepts.length,
      concepts: concepts.map(c => this.formatConcept(c)),
      lastUpdated: new Date().toISOString(),
    };

    return {
      uri: RESOURCE_URIS.INTELLIGENCE_CONCEPTS,
      mimeType: 'application/json',
      text: JSON.stringify(data, null, 2),
    };
  }

  /**
   * Get all patterns resource
   */
  private async getAllPatternsResource(): Promise<ResourceContent> {
    const patterns = this.database.getDeveloperPatterns();

    const data = {
      count: patterns.length,
      patterns: patterns.map(p => this.formatPattern(p)),
      lastUpdated: new Date().toISOString(),
    };

    return {
      uri: RESOURCE_URIS.INTELLIGENCE_PATTERNS,
      mimeType: 'application/json',
      text: JSON.stringify(data, null, 2),
    };
  }

  /**
   * Get concepts filtered by type
   */
  private async getConceptsByTypeResource(type: string): Promise<ResourceContent> {
    const allConcepts = this.database.getSemanticConcepts();
    const filteredConcepts = allConcepts.filter(
      c => c.conceptType.toLowerCase() === type.toLowerCase()
    );

    if (filteredConcepts.length === 0) {
      // Check if type exists at all
      const types = this.getConceptTypes();
      if (!types.map(t => t.toLowerCase()).includes(type.toLowerCase())) {
        throw new Error(`Unknown concept type: ${type}. Available types: ${types.join(', ')}`);
      }
    }

    const data = {
      type,
      count: filteredConcepts.length,
      concepts: filteredConcepts.map(c => this.formatConcept(c)),
      lastUpdated: new Date().toISOString(),
    };

    return {
      uri: `in-memoria://intelligence/concepts/${encodeURIComponent(type)}`,
      mimeType: 'application/json',
      text: JSON.stringify(data, null, 2),
    };
  }

  /**
   * Get patterns filtered by type
   */
  private async getPatternsByTypeResource(type: string): Promise<ResourceContent> {
    const patterns = this.database.getDeveloperPatterns(type);

    if (patterns.length === 0) {
      // Check if type exists at all
      const types = this.getPatternTypes();
      if (!types.map(t => t.toLowerCase()).includes(type.toLowerCase())) {
        throw new Error(`Unknown pattern type: ${type}. Available types: ${types.join(', ')}`);
      }
    }

    const data = {
      type,
      count: patterns.length,
      patterns: patterns.map(p => this.formatPattern(p)),
      lastUpdated: new Date().toISOString(),
    };

    return {
      uri: `in-memoria://intelligence/patterns/${encodeURIComponent(type)}`,
      mimeType: 'application/json',
      text: JSON.stringify(data, null, 2),
    };
  }

  /**
   * Get unique concept types from stored concepts
   */
  private getConceptTypes(): string[] {
    const concepts = this.database.getSemanticConcepts();
    return Array.from(new Set(concepts.map(c => c.conceptType))).sort();
  }

  /**
   * Get unique pattern types from stored patterns
   */
  private getPatternTypes(): string[] {
    const patterns = this.database.getDeveloperPatterns();
    return Array.from(new Set(patterns.map(p => p.patternType))).sort();
  }

  /**
   * Format a semantic concept for resource output
   */
  private formatConcept(concept: SemanticConcept): Record<string, unknown> {
    return {
      id: concept.id,
      name: concept.conceptName,
      type: concept.conceptType,
      confidence: concept.confidenceScore,
      filePath: concept.filePath,
      lineRange: concept.lineRange,
      relationships: concept.relationships,
      createdAt: concept.createdAt,
      updatedAt: concept.updatedAt,
    };
  }

  /**
   * Format a developer pattern for resource output
   */
  private formatPattern(pattern: DeveloperPattern): Record<string, unknown> {
    return {
      id: pattern.patternId,
      type: pattern.patternType,
      content: pattern.patternContent,
      frequency: pattern.frequency,
      confidence: pattern.confidence,
      contexts: pattern.contexts,
      examples: pattern.examples,
      createdAt: pattern.createdAt,
      lastSeen: pattern.lastSeen,
    };
  }

  /**
   * Capitalize first letter of a string
   */
  private capitalizeFirst(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}
