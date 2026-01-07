import { SemanticEngine } from '../engines/semantic-engine.js';
import { PatternEngine } from '../engines/pattern-engine.js';
import { SQLiteDatabase } from '../storage/sqlite-db.js';
import { SemanticVectorDB } from '../storage/vector-db.js';
import { config } from '../config/config.js';
import { nanoid } from 'nanoid';
import { Logger } from '../utils/logger.js';
import {
  LearningPipeline,
  createLearningPipeline,
  LearningStage,
  type PipelineContext,
  type ProgressUpdate,
} from './learning-pipeline.js';
import type {
  ISemanticEngine,
  IPatternEngine,
  IStorageProvider,
  IVectorDatabase,
} from '../interfaces/engines.js';

// Local types for learning operations
interface LearnedConcept {
  id: string;
  name: string;
  type: string;
  confidence: number;
  filePath?: string;
  file_path?: string;
  lineRange: { start: number; end: number };
  relationships: Record<string, unknown>;
}

interface LearnedPattern {
  id: string;
  type: string;
  content: Record<string, unknown>;
  frequency: number;
  confidence: number;
  contexts: string[];
  examples: Array<{ code: string }>;
}

// ============================================================================
// Dependency Injection Types
// ============================================================================

/**
 * Dependencies required by LearningService.
 * This interface enables dependency injection for testing and loose coupling.
 */
export interface LearningDependencies {
  /** Storage provider for persisting learned data */
  database: IStorageProvider;
  /** Vector database for semantic embeddings */
  vectorDB: IVectorDatabase;
  /** Semantic analysis engine */
  semanticEngine: ISemanticEngine;
  /** Pattern detection engine */
  patternEngine: IPatternEngine;
}

/**
 * Extended database interface that includes additional methods
 * used by LearningService but not part of IStorageProvider
 */
export interface ExtendedDatabase extends IStorageProvider {
  getProjectMetadata(projectPath: string): unknown | null;
  insertProjectMetadata(metadata: {
    projectId: string;
    projectPath: string;
    projectName: string;
    languagePrimary?: string;
    languagesDetected: string[];
    frameworkDetected: string[];
    intelligenceVersion: string;
    lastFullScan: Date;
  }): void;
  insertEntryPoint(entryPoint: {
    id: string;
    projectPath: string;
    entryType: string;
    filePath: string;
    description?: string;
    framework?: string;
  }): void;
  insertKeyDirectory(directory: {
    id: string;
    projectPath: string;
    directoryPath: string;
    directoryType: string;
    fileCount: number;
    description?: string;
  }): void;
  close(): void;
}

/**
 * Factory interface for creating LearningService dependencies.
 * Implementations can provide different dependency creation strategies.
 */
export interface LearningServiceFactory {
  createForProject(projectPath: string): LearningDependencies;
}

/**
 * Default factory that creates real dependencies for production use.
 */
export class DefaultLearningServiceFactory implements LearningServiceFactory {
  constructor(private apiKey?: string) {}

  createForProject(projectPath: string): LearningDependencies {
    const dbPath = config.getDatabasePath(projectPath);
    const database = new SQLiteDatabase(dbPath);
    const vectorDB = new SemanticVectorDB(this.apiKey);
    const semanticEngine = new SemanticEngine(database, vectorDB);
    const patternEngine = new PatternEngine(database);

    return { database, vectorDB, semanticEngine, patternEngine };
  }
}

// Singleton default factory
let defaultFactory: LearningServiceFactory | null = null;

/**
 * Get the default factory for creating dependencies.
 * Uses lazy initialization with the OPENAI_API_KEY from environment.
 */
export function getDefaultFactory(): LearningServiceFactory {
  if (!defaultFactory) {
    defaultFactory = new DefaultLearningServiceFactory(process.env.OPENAI_API_KEY);
  }
  return defaultFactory;
}

/**
 * Set a custom factory for creating dependencies.
 * Useful for testing or custom configurations.
 */
export function setDefaultFactory(factory: LearningServiceFactory): void {
  defaultFactory = factory;
}

/**
 * Reset the default factory to null.
 * Useful for testing to ensure fresh factory on each test.
 */
export function resetDefaultFactory(): void {
  defaultFactory = null;
}

interface CodebaseAnalysisResult {
  languages: string[];
  frameworks: string[];
  complexity?: {
    cyclomatic: number;
    cognitive: number;
    lines?: number;
  };
  entryPoints?: Array<{
    type: string;
    filePath: string;
    description?: string;
    framework?: string;
  }>;
  keyDirectories?: KeyDirectoryInfo[];
}

interface KeyDirectoryInfo {
  type: string;
  path?: string;
  fileCount?: number;
  description?: string;
}

export interface LearningResult {
  success: boolean;
  conceptsLearned: number;
  patternsLearned: number;
  featuresLearned: number;
  insights: string[];
  timeElapsed: number;
  blueprint?: {
    techStack: string[];
    entryPoints: Record<string, string>;
    keyDirectories: Record<string, string>;
    architecture: string;
  };
}

export interface LearningOptions {
  force?: boolean;
  progressCallback?: (current: number, total: number, message: string) => void;
}

/**
 * Shared learning service used by both CLI and MCP tools.
 * Ensures consistent behavior across all interfaces.
 *
 * Supports two usage patterns:
 * 1. Instance-based with DI: `new LearningService(deps).learn(path, options)`
 * 2. Static convenience method: `LearningService.learnFromCodebase(path, options)`
 */
export class LearningService {
  private deps: LearningDependencies;
  private projectPath: string;

  /**
   * Create a LearningService instance with injected dependencies.
   * This is the preferred pattern for testing and custom configurations.
   *
   * @param deps - The dependencies to use for learning operations
   * @param projectPath - The project path for this service instance
   */
  constructor(deps: LearningDependencies, projectPath: string) {
    this.deps = deps;
    this.projectPath = projectPath;
  }

  /**
   * Get the injected dependencies (useful for testing verification)
   */
  getDependencies(): LearningDependencies {
    return this.deps;
  }

  /**
   * Instance method: Learn from the codebase using injected dependencies.
   * This method uses the dependencies provided in the constructor.
   */
  async learn(options: LearningOptions = {}): Promise<LearningResult> {
    const startTime = Date.now();
    const insights: string[] = [];
    const { database, vectorDB, semanticEngine, patternEngine } = this.deps;

    // Cast to ExtendedDatabase for additional methods
    const extendedDatabase = database as ExtendedDatabase;

    try {
      const projectDbPath = config.getDatabasePath(this.projectPath);
      Logger.info('Using project database', { projectDbPath });

      // Check if already learned and not forcing re-learn
      if (!options.force) {
        const existingIntelligence = await LearningService.checkExistingIntelligenceFromProvider(
          database,
          this.projectPath
        );
        if (existingIntelligence && existingIntelligence.concepts > 0) {
          return {
            success: true,
            conceptsLearned: existingIntelligence.concepts,
            patternsLearned: existingIntelligence.patterns,
            featuresLearned: existingIntelligence.features,
            insights: ['Using existing intelligence (use force: true to re-learn)'],
            timeElapsed: Date.now() - startTime
          };
        }
      }

      // Phase 1: Comprehensive codebase analysis
      insights.push('Phase 1: Analyzing codebase structure...');
      const codebaseAnalysis = await semanticEngine.analyzeCodebase(this.projectPath);
      insights.push(`   Detected languages: ${codebaseAnalysis.languages?.join(', ') || 'unknown'}`);
      insights.push(`   Found frameworks: ${codebaseAnalysis.frameworks?.join(', ') || 'none detected'}`);
      if (codebaseAnalysis.complexity) {
        insights.push(`   Complexity: ${codebaseAnalysis.complexity.cyclomatic?.toFixed(1) || 'N/A'} cyclomatic, ${codebaseAnalysis.complexity.cognitive?.toFixed(1) || 'N/A'} cognitive`);
      }

      // Phase 2: Deep semantic learning
      insights.push('Phase 2: Learning semantic concepts...');
      const concepts = await semanticEngine.learnFromCodebase(this.projectPath, options.progressCallback);

      // Analyze concept distribution
      const conceptTypes = concepts.reduce((acc, concept) => {
        const type = concept.type || 'unknown';
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      insights.push(`   Extracted ${concepts.length} semantic concepts:`);
      Object.entries(conceptTypes).forEach(([type, count]) => {
        insights.push(`     - ${count} ${type}${count > 1 ? 's' : ''}`);
      });

      // Phase 3: Pattern discovery and learning
      insights.push('Phase 3: Discovering coding patterns...');
      const patterns = await patternEngine.learnFromCodebase(this.projectPath, options.progressCallback);

      // Analyze pattern distribution
      const patternTypes = patterns.reduce((acc, pattern) => {
        const patternType = pattern.type || 'unknown';
        const category = patternType.split('_')[0];
        acc[category] = (acc[category] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      insights.push(`   Identified ${patterns.length} coding patterns:`);
      Object.entries(patternTypes).forEach(([category, count]) => {
        insights.push(`     - ${count} ${category} pattern${count > 1 ? 's' : ''}`);
      });

      // Phase 4: Relationship and dependency analysis
      insights.push('Phase 4: Analyzing relationships and dependencies...');
      const relationships = await LearningService.analyzeCodebaseRelationships(
        concepts as LearnedConcept[],
        patterns as LearnedPattern[]
      );
      insights.push(`   Built ${relationships.conceptRelationships} concept relationships`);
      insights.push(`   Identified ${relationships.dependencyPatterns} dependency patterns`);

      // Phase 5: Intelligence synthesis and storage
      insights.push('Phase 5: Synthesizing and storing intelligence...');
      await LearningService.storeIntelligenceFromProvider(
        database,
        this.projectPath,
        concepts as LearnedConcept[],
        patterns as LearnedPattern[]
      );

      // Generate learning insights
      const learningInsights = await LearningService.generateLearningInsights(
        concepts as LearnedConcept[],
        patterns as LearnedPattern[],
        codebaseAnalysis as CodebaseAnalysisResult
      );
      insights.push('Learning Summary:');
      learningInsights.forEach(insight => insights.push(`   ${insight}`));

      // Phase 6: Vector embeddings for semantic search
      insights.push('Phase 6: Building semantic search index...');
      insights.push(`   Using free local embeddings (transformers.js)`);

      const vectorCount = await LearningService.buildSemanticIndexFromProvider(
        vectorDB,
        concepts as LearnedConcept[],
        patterns as LearnedPattern[]
      );
      insights.push(`   Created ${vectorCount} vector embeddings for semantic search`);

      // Phase 6.5: Ensure project metadata exists (required for foreign keys)
      insights.push('Phase 6.5: Ensuring project metadata...');
      const existingMetadata = extendedDatabase.getProjectMetadata(this.projectPath);
      if (!existingMetadata) {
        extendedDatabase.insertProjectMetadata({
          projectId: nanoid(),
          projectPath: this.projectPath,
          projectName: this.projectPath.split('/').pop() || 'unknown',
          languagePrimary: codebaseAnalysis.languages?.[0],
          languagesDetected: codebaseAnalysis.languages || [],
          frameworkDetected: codebaseAnalysis.frameworks || [],
          intelligenceVersion: '0.6.0',
          lastFullScan: new Date()
        });
        insights.push(`   Created project metadata for ${this.projectPath}`);
      } else {
        insights.push(`   Project metadata already exists`);
      }

      // Phase 7: Feature mapping for intelligent file routing
      insights.push('Phase 7: Building feature map for file routing...');
      const featureMaps = await patternEngine.buildFeatureMap(this.projectPath);

      // Debug: Log what we got from buildFeatureMap
      if (featureMaps.length > 0) {
        insights.push(`   Debug: Received ${featureMaps.length} feature maps from buildFeatureMap`);
        const sample = featureMaps[0];
        insights.push(`   Debug: Sample feature map: id=${sample?.id}, featureName=${sample?.featureName}, primaryFiles=${sample?.primaryFiles?.length || 0}`);
      }

      // Store feature maps in database (filter out invalid ones)
      let validFeatureMaps = 0;
      let skippedDueToMissingId = 0;
      let skippedDueToMissingName = 0;
      for (const featureMap of featureMaps) {
        // Skip feature maps with missing required fields
        if (!featureMap.id) {
          skippedDueToMissingId++;
          continue;
        }
        if (!featureMap.featureName) {
          skippedDueToMissingName++;
          continue;
        }

        database.insertFeatureMap({
          id: featureMap.id,
          projectPath: this.projectPath,
          featureName: featureMap.featureName,
          primaryFiles: featureMap.primaryFiles || [],
          relatedFiles: featureMap.relatedFiles || [],
          dependencies: featureMap.dependencies || [],
          status: 'active'
        });
        validFeatureMaps++;
      }
      const totalFiles = featureMaps.reduce((sum, fm) => sum + (fm.primaryFiles?.length || 0) + (fm.relatedFiles?.length || 0), 0);
      const totalSkipped = skippedDueToMissingId + skippedDueToMissingName;
      if (totalSkipped > 0) {
        insights.push(`   Skipped ${totalSkipped} invalid feature maps (${skippedDueToMissingId} missing ID, ${skippedDueToMissingName} missing name)`);
      }
      insights.push(`   Mapped ${validFeatureMaps} features to ${totalFiles} files`);

      // Phase 8: Store blueprint data
      insights.push('Phase 8: Storing project blueprint...');
      await LearningService.storeProjectBlueprintFromProvider(
        this.projectPath,
        codebaseAnalysis as CodebaseAnalysisResult,
        extendedDatabase
      );

      const timeElapsed = Date.now() - startTime;
      insights.push(`Learning completed in ${timeElapsed}ms`);

      // Build blueprint summary
      const blueprint = {
        techStack: codebaseAnalysis.frameworks || [],
        entryPoints: (codebaseAnalysis.entryPoints || []).reduce((acc, ep) => {
          acc[ep.type] = ep.filePath;
          return acc;
        }, {} as Record<string, string>),
        keyDirectories: (codebaseAnalysis.keyDirectories || []).reduce((acc, dir) => {
          acc[dir.type] = dir.path;
          return acc;
        }, {} as Record<string, string>),
        architecture: LearningService.inferArchitecturePattern(codebaseAnalysis as CodebaseAnalysisResult)
      };

      return {
        success: true,
        conceptsLearned: concepts.length,
        patternsLearned: patterns.length,
        featuresLearned: validFeatureMaps,
        insights,
        timeElapsed,
        blueprint
      };
    } catch (error) {
      return {
        success: false,
        conceptsLearned: 0,
        patternsLearned: 0,
        featuresLearned: 0,
        insights: [`Learning failed: ${error instanceof Error ? error.message : error}`],
        timeElapsed: Date.now() - startTime
      };
    } finally {
      // Clean up project-specific resources
      if (semanticEngine && 'cleanup' in semanticEngine) {
        (semanticEngine as { cleanup: () => void }).cleanup();
      }
      if (vectorDB) {
        try {
          await vectorDB.close();
        } catch (error) {
          Logger.warn('Failed to close project vector database', { error: error instanceof Error ? error.message : String(error) });
        }
      }
      if (extendedDatabase && 'close' in extendedDatabase) {
        extendedDatabase.close();
      }
    }
  }

  // ============================================================================
  // Static Convenience Methods (Backward Compatibility)
  // ============================================================================

  /**
   * Static convenience method: Learn from a codebase.
   * This method creates dependencies internally using the default factory.
   * Maintained for backward compatibility with existing callers.
   *
   * For testing or custom configurations, use the instance-based approach:
   * `new LearningService(deps, path).learn(options)`
   *
   * @param path - Path to the codebase
   * @param options - Learning options
   * @param factory - Optional custom factory for creating dependencies
   */
  static async learnFromCodebase(
    path: string,
    options: LearningOptions = {},
    factory?: LearningServiceFactory
  ): Promise<LearningResult> {
    const effectiveFactory = factory ?? getDefaultFactory();
    const deps = effectiveFactory.createForProject(path);
    const service = new LearningService(deps, path);
    return service.learn(options);
  }

  // ============================================================================
  // Static Helper Methods (Shared Logic)
  // ============================================================================

  /**
   * Check existing intelligence using IStorageProvider interface
   */
  private static async checkExistingIntelligenceFromProvider(
    database: IStorageProvider,
    path: string
  ): Promise<{ concepts: number; patterns: number; features: number } | null> {
    const concepts = database.getSemanticConcepts().length;
    const patterns = database.getDeveloperPatterns().length;
    const features = database.getFeatureMaps(path).length;

    if (concepts > 0 || patterns > 0) {
      return { concepts, patterns, features };
    }

    Logger.warn('No existing intelligence found in project database - starting fresh analysis', { path });
    return null;
  }

  /**
   * Store intelligence using IStorageProvider interface
   */
  private static async storeIntelligenceFromProvider(
    database: IStorageProvider,
    _path: string,
    concepts: LearnedConcept[],
    patterns: LearnedPattern[]
  ): Promise<void> {
    // Store concepts
    for (const concept of concepts) {
      database.insertSemanticConcept({
        id: concept.id,
        conceptName: concept.name,
        conceptType: concept.type,
        confidenceScore: concept.confidence,
        relationships: concept.relationships,
        evolutionHistory: {},
        filePath: concept.filePath || concept.file_path || 'unknown',
        lineRange: concept.lineRange
      });
    }

    // Store patterns
    for (const pattern of patterns) {
      database.insertDeveloperPattern({
        patternId: pattern.id,
        patternType: pattern.type,
        patternContent: pattern.content,
        frequency: pattern.frequency,
        contexts: pattern.contexts,
        examples: pattern.examples,
        confidence: pattern.confidence
      });
    }
  }

  /**
   * Build semantic index using IVectorDatabase interface
   */
  private static async buildSemanticIndexFromProvider(
    vectorDB: IVectorDatabase,
    concepts: LearnedConcept[],
    patterns: LearnedPattern[]
  ): Promise<number> {
    try {
      await vectorDB.initialize('in-memoria-intelligence');

      let vectorCount = 0;

      // Create embeddings for semantic concepts
      for (const concept of concepts) {
        const conceptType = concept.type || 'unknown';
        const text = `${concept.name} ${conceptType}`;
        await vectorDB.storeCodeEmbedding(text, {
          id: concept.id,
          filePath: concept.filePath || concept.file_path || 'unknown',
          functionName: conceptType === 'function' ? concept.name : undefined,
          className: conceptType === 'class' ? concept.name : undefined,
          language: 'unknown',
          complexity: 1,
          lineCount: 1,
          lastModified: new Date()
        });
        vectorCount++;
      }

      // Create embeddings for patterns
      for (const pattern of patterns) {
        const patternType = pattern.type || 'unknown';
        const text = `${patternType} ${pattern.content?.description || ''}`;
        await vectorDB.storeCodeEmbedding(text, {
          id: pattern.id,
          filePath: `pattern-${patternType}`,
          language: 'pattern',
          complexity: pattern.frequency || 1,
          lineCount: 1,
          lastModified: new Date()
        });
        vectorCount++;
      }

      return vectorCount;
    } catch (error) {
      Logger.warn('Failed to build semantic index', { error: error instanceof Error ? error.message : String(error) });
      return 0;
    }
  }

  /**
   * Store project blueprint using ExtendedDatabase interface
   */
  private static async storeProjectBlueprintFromProvider(
    projectPath: string,
    codebaseAnalysis: CodebaseAnalysisResult,
    database: ExtendedDatabase
  ): Promise<void> {
    // Store entry points (filter out invalid ones)
    if (codebaseAnalysis.entryPoints && Array.isArray(codebaseAnalysis.entryPoints)) {
      for (const entryPoint of codebaseAnalysis.entryPoints) {
        // Skip entry points with missing required fields
        if (!entryPoint.type || !entryPoint.filePath) {
          continue;
        }

        database.insertEntryPoint({
          id: nanoid(),
          projectPath,
          entryType: entryPoint.type,
          filePath: entryPoint.filePath,
          description: entryPoint.description,
          framework: entryPoint.framework
        });
      }
    }

    // Store key directories (filter out invalid ones)
    if (codebaseAnalysis.keyDirectories && Array.isArray(codebaseAnalysis.keyDirectories)) {
      for (const directory of codebaseAnalysis.keyDirectories) {
        // Skip directories with missing required fields
        if (!directory.path || !directory.type) {
          continue;
        }

        database.insertKeyDirectory({
          id: nanoid(),
          projectPath,
          directoryPath: directory.path,
          directoryType: directory.type,
          fileCount: directory.fileCount || 0,
          description: directory.description
        });
      }
    }
  }

  // ============================================================================
  // Legacy Static Methods (For backward compatibility with checkExistingIntelligence)
  // ============================================================================

  private static async checkExistingIntelligence(
    database: SQLiteDatabase,
    path: string
  ): Promise<{ concepts: number; patterns: number; features: number } | null> {
    const concepts = database.getSemanticConcepts().length;
    const patterns = database.getDeveloperPatterns().length;
    const features = database.getFeatureMaps(path).length;

    if (concepts > 0 || patterns > 0) {
      return { concepts, patterns, features };
    }

    Logger.warn('No existing intelligence found in project database - starting fresh analysis', { path });
    return null;
  }

  private static async storeIntelligence(
    database: SQLiteDatabase,
    _path: string,
    concepts: LearnedConcept[],
    patterns: LearnedPattern[]
  ): Promise<void> {
    // Store concepts
    for (const concept of concepts) {
      database.insertSemanticConcept({
        id: concept.id,
        conceptName: concept.name,
        conceptType: concept.type,
        confidenceScore: concept.confidence,
        relationships: concept.relationships,
        evolutionHistory: {},
        filePath: concept.filePath || concept.file_path || 'unknown',
        lineRange: concept.lineRange
      });
    }

    // Store patterns
    for (const pattern of patterns) {
      database.insertDeveloperPattern({
        patternId: pattern.id,
        patternType: pattern.type,
        patternContent: pattern.content,
        frequency: pattern.frequency,
        contexts: pattern.contexts,
        examples: pattern.examples,
        confidence: pattern.confidence
      });
    }
  }

  private static async analyzeCodebaseRelationships(
    concepts: LearnedConcept[],
    patterns: LearnedPattern[]
  ): Promise<{ conceptRelationships: number; dependencyPatterns: number }> {
    const conceptRelationships = new Set<string>();

    // Group concepts by file
    const conceptsByFile = concepts.reduce((acc, concept) => {
      const filePath = concept.filePath || concept.file_path || 'unknown';
      if (!acc[filePath]) acc[filePath] = [];
      acc[filePath].push(concept);
      return acc;
    }, {} as Record<string, LearnedConcept[]>);

    // Find relationships within files
    Object.values(conceptsByFile).forEach(fileConcepts => {
      if (Array.isArray(fileConcepts)) {
        for (let i = 0; i < fileConcepts.length; i++) {
          for (let j = i + 1; j < fileConcepts.length; j++) {
            const relationshipKey = `${fileConcepts[i].id}-${fileConcepts[j].id}`;
            conceptRelationships.add(relationshipKey);
          }
        }
      }
    });

    // Analyze dependency patterns
    const dependencyPatterns = new Set<string>();
    patterns.forEach(pattern => {
      const patternType = pattern.type || '';
      if (patternType.includes('dependency') ||
        patternType.includes('import') ||
        patternType.includes('organization')) {
        dependencyPatterns.add(pattern.id);
      }
    });

    return {
      conceptRelationships: conceptRelationships.size,
      dependencyPatterns: dependencyPatterns.size
    };
  }

  private static async generateLearningInsights(
    concepts: LearnedConcept[],
    patterns: LearnedPattern[],
    codebaseAnalysis: CodebaseAnalysisResult
  ): Promise<string[]> {
    const insights: string[] = [];

    // Analyze codebase characteristics
    const totalLines = codebaseAnalysis?.complexity?.lines || 0;
    const conceptDensity = totalLines > 0 ? (concepts.length / totalLines * 1000).toFixed(2) : '0';
    if (totalLines > 0) {
      insights.push(`📊 Concept density: ${conceptDensity} concepts per 1000 lines`);
    }

    // Analyze pattern distribution
    const namingPatterns = patterns.filter(p => p.type?.includes('naming'));
    const structuralPatterns = patterns.filter(p => p.type?.includes('organization') || p.type?.includes('structure'));
    const implementationPatterns = patterns.filter(p => p.type?.includes('implementation'));

    if (namingPatterns.length > 0) {
      insights.push(`✨ Strong naming conventions detected (${namingPatterns.length} patterns)`);
    }
    if (structuralPatterns.length > 0) {
      insights.push(`🏗️ Organized code structure found (${structuralPatterns.length} patterns)`);
    }
    if (implementationPatterns.length > 0) {
      insights.push(`⚙️ Design patterns in use (${implementationPatterns.length} patterns)`);
    }

    // Analyze complexity
    const complexity = codebaseAnalysis?.complexity;
    if (complexity && typeof complexity.cyclomatic === 'number') {
      if (complexity.cyclomatic < 10) {
        insights.push('🟢 Low complexity codebase - easy to maintain');
      } else if (complexity.cyclomatic < 30) {
        insights.push('🟡 Moderate complexity - consider refactoring high-complexity areas');
      } else {
        insights.push('🔴 High complexity detected - refactoring recommended');
      }
    }

    // Analyze language and framework usage
    const languages = codebaseAnalysis?.languages || [];
    const frameworks = codebaseAnalysis?.frameworks || [];

    if (languages.length === 1) {
      insights.push(`🎯 Single-language codebase (${languages[0]}) - consistent technology stack`);
    } else if (languages.length > 1) {
      insights.push(`🌐 Multi-language codebase (${languages.join(', ')}) - consider integration patterns`);
    }

    if (frameworks.length > 0) {
      insights.push(`🔧 Framework usage: ${frameworks.join(', ')}`);
    }

    return insights;
  }

  private static async buildSemanticIndex(
    vectorDB: SemanticVectorDB,
    concepts: LearnedConcept[],
    patterns: LearnedPattern[]
  ): Promise<number> {
    try {
      await vectorDB.initialize('in-memoria-intelligence');

      let vectorCount = 0;

      // Create embeddings for semantic concepts
      for (const concept of concepts) {
        const conceptType = concept.type || 'unknown';
        const text = `${concept.name} ${conceptType}`;
        await vectorDB.storeCodeEmbedding(text, {
          id: concept.id,
          filePath: concept.filePath || concept.file_path || 'unknown',
          functionName: conceptType === 'function' ? concept.name : undefined,
          className: conceptType === 'class' ? concept.name : undefined,
          language: 'unknown',
          complexity: 1,
          lineCount: 1,
          lastModified: new Date()
        });
        vectorCount++;
      }

      // Create embeddings for patterns
      for (const pattern of patterns) {
        const patternType = pattern.type || 'unknown';
        const text = `${patternType} ${pattern.content?.description || ''}`;
        await vectorDB.storeCodeEmbedding(text, {
          id: pattern.id,
          filePath: `pattern-${patternType}`,
          language: 'pattern',
          complexity: pattern.frequency || 1,
          lineCount: 1,
          lastModified: new Date()
        });
        vectorCount++;
      }

      return vectorCount;
    } catch (error) {
      Logger.warn('Failed to build semantic index', { error: error instanceof Error ? error.message : String(error) });
      return 0;
    }
  }

  private static inferArchitecturePattern(codebaseAnalysis: CodebaseAnalysisResult): string {
    const frameworks = codebaseAnalysis?.frameworks || [];
    const directories = codebaseAnalysis?.keyDirectories || [];

    if (frameworks.some((f: string) => f.toLowerCase().includes('react'))) {
      return 'Component-Based (React)';
    } else if (frameworks.some((f: string) => f.toLowerCase().includes('express'))) {
      return 'REST API (Express)';
    } else if (frameworks.some((f: string) => f.toLowerCase().includes('fastapi'))) {
      return 'REST API (FastAPI)';
    } else if (directories.some((d: KeyDirectoryInfo) => d.type === 'services')) {
      return 'Service-Oriented';
    } else if (directories.some((d: KeyDirectoryInfo) => d.type === 'components')) {
      return 'Component-Based';
    } else if (directories.some((d: KeyDirectoryInfo) => d.type === 'models') && directories.some((d: KeyDirectoryInfo) => d.type === 'views')) {
      return 'MVC Pattern';
    } else {
      return 'Modular';
    }
  }

  // ============================================================================
  // Pipeline-Based Learning (Alternative API with cancellation support)
  // ============================================================================

  /**
   * Active learning pipeline (for cancellation support)
   */
  private static activePipeline: LearningPipeline | null = null;

  /**
   * Create a configured learning pipeline for a project.
   * This provides a structured approach to learning with stage-based
   * progress tracking and cancellation support.
   *
   * @param path - Project path to learn from
   * @param options - Learning options
   * @returns Configured LearningPipeline instance
   */
  static createPipeline(
    path: string,
    options: LearningOptions = {}
  ): LearningPipeline {
    // Create project-specific components (will be initialized in pipeline)
    const projectDbPath = config.getDatabasePath(path);
    let projectDatabase: SQLiteDatabase | null = null;
    let projectVectorDB: SemanticVectorDB | null = null;
    let projectSemanticEngine: SemanticEngine | null = null;
    let projectPatternEngine: PatternEngine | null = null;
    let concepts: LearnedConcept[] = [];
    let patterns: LearnedPattern[] = [];
    let codebaseAnalysis: CodebaseAnalysisResult | null = null;

    const pipeline = createLearningPipeline({
      onInitialization: async (ctx: PipelineContext) => {
        // Initialize components
        projectDatabase = new SQLiteDatabase(projectDbPath);
        projectVectorDB = new SemanticVectorDB(process.env.OPENAI_API_KEY);
        projectSemanticEngine = new SemanticEngine(projectDatabase, projectVectorDB);
        projectPatternEngine = new PatternEngine(projectDatabase);

        // Check existing intelligence
        if (!options.force && projectDatabase) {
          const existing = await LearningService.checkExistingIntelligence(projectDatabase, path);
          if (existing && existing.concepts > 0) {
            return { ...ctx, skipRemaining: true, existingIntelligence: existing };
          }
        }

        return { ...ctx, initialized: true };
      },

      onFileDiscovery: async (ctx: PipelineContext) => {
        if (ctx.skipRemaining) return ctx;

        // File discovery happens as part of codebase analysis
        codebaseAnalysis = projectSemanticEngine
          ? await projectSemanticEngine.analyzeCodebase(path)
          : { languages: [], frameworks: [] };

        return {
          ...ctx,
          languages: codebaseAnalysis?.languages || [],
          frameworks: codebaseAnalysis?.frameworks || [],
        };
      },

      onParsing: async (ctx: PipelineContext) => {
        if (ctx.skipRemaining) return ctx;
        // Parsing is implicit in concept extraction
        return ctx;
      },

      onConceptExtraction: async (ctx: PipelineContext) => {
        if (ctx.skipRemaining) return ctx;

        concepts = projectSemanticEngine
          ? await projectSemanticEngine.learnFromCodebase(path, options.progressCallback)
          : [];

        return { ...ctx, conceptCount: concepts.length };
      },

      onPatternDetection: async (ctx: PipelineContext) => {
        if (ctx.skipRemaining) return ctx;

        patterns = projectPatternEngine
          ? await projectPatternEngine.learnFromCodebase(path, options.progressCallback)
          : [];

        return { ...ctx, patternCount: patterns.length };
      },

      onIndexing: async (ctx: PipelineContext) => {
        if (ctx.skipRemaining) return ctx;

        // Store intelligence and build indices
        if (projectDatabase) {
          await LearningService.storeIntelligence(projectDatabase, path, concepts, patterns);
        }

        // Build vector index
        let vectorCount = 0;
        if (projectVectorDB) {
          vectorCount = await LearningService.buildSemanticIndex(
            projectVectorDB,
            concepts,
            patterns
          );
        }

        return { ...ctx, vectorCount };
      },

      onCompletion: async (ctx: PipelineContext) => {
        // Clean up resources
        if (projectSemanticEngine) {
          projectSemanticEngine.cleanup();
        }
        if (projectVectorDB) {
          try {
            await projectVectorDB.close();
          } catch {
            // Ignore close errors
          }
        }
        if (projectDatabase) {
          projectDatabase.close();
        }

        return {
          ...ctx,
          success: true,
          conceptsLearned: concepts.length,
          patternsLearned: patterns.length,
        };
      },
    });

    return pipeline;
  }

  /**
   * Learn from codebase using the pipeline API with cancellation support.
   *
   * @param path - Project path
   * @param options - Learning options including progress callback
   * @returns Promise resolving to LearningResult
   */
  static async learnWithPipeline(
    path: string,
    options: LearningOptions = {}
  ): Promise<LearningResult> {
    const startTime = Date.now();

    // Create and store pipeline for cancellation
    const pipeline = this.createPipeline(path, options);
    this.activePipeline = pipeline;

    try {
      // Map pipeline progress to legacy callback format
      const onProgress = options.progressCallback
        ? (update: ProgressUpdate) => {
            // Convert stage progress (0-100) to item progress
            const stageToItemMap: Record<string, { current: number; total: number }> = {
              [LearningStage.Initialization]: { current: 1, total: 7 },
              [LearningStage.FileDiscovery]: { current: 2, total: 7 },
              [LearningStage.Parsing]: { current: 3, total: 7 },
              [LearningStage.ConceptExtraction]: { current: 4, total: 7 },
              [LearningStage.PatternDetection]: { current: 5, total: 7 },
              [LearningStage.Indexing]: { current: 6, total: 7 },
              [LearningStage.Completion]: { current: 7, total: 7 },
            };

            const itemProgress = stageToItemMap[update.stage] || { current: 0, total: 7 };
            options.progressCallback!(
              itemProgress.current,
              itemProgress.total,
              update.message || `Stage: ${update.stage}`
            );
          }
        : undefined;

      const result = await pipeline.execute({ projectPath: path }, { onProgress });

      const timeElapsed = Date.now() - startTime;

      return {
        success: result.success as boolean,
        conceptsLearned: (result.conceptsLearned as number) || 0,
        patternsLearned: (result.patternsLearned as number) || 0,
        featuresLearned: 0, // Not tracked in pipeline yet
        insights: [`Pipeline completed in ${timeElapsed}ms`],
        timeElapsed,
      };
    } catch (error) {
      const timeElapsed = Date.now() - startTime;
      const isCancelled = pipeline.getState() === 'cancelled';

      return {
        success: false,
        conceptsLearned: 0,
        patternsLearned: 0,
        featuresLearned: 0,
        insights: [
          isCancelled
            ? 'Learning cancelled by user'
            : `Pipeline failed: ${error instanceof Error ? error.message : error}`,
        ],
        timeElapsed,
      };
    } finally {
      this.activePipeline = null;
    }
  }

  /**
   * Cancel the active learning pipeline.
   *
   * @returns true if a pipeline was cancelled, false if no active pipeline
   */
  static cancelLearning(): boolean {
    if (this.activePipeline) {
      this.activePipeline.cancel();
      return true;
    }
    return false;
  }

  /**
   * Check if learning is currently in progress.
   */
  static isLearning(): boolean {
    return this.activePipeline !== null && this.activePipeline.getState() === 'running';
  }

  /**
   * Get current learning stage (if learning is in progress).
   */
  static getCurrentStage(): LearningStage | null {
    return this.activePipeline?.getCurrentStage() ?? null;
  }
}
