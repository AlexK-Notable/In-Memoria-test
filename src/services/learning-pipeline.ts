/**
 * Learning Pipeline
 *
 * Provides a clean pipeline for the codebase learning process
 * with proper stage management, progress tracking, and error handling.
 *
 * @example
 * ```typescript
 * import { LearningPipeline, createLearningPipeline } from './learning-pipeline.js';
 *
 * const pipeline = createLearningPipeline({
 *   onParsing: async (context) => {
 *     // Custom parsing logic
 *     return { parsed: 100 };
 *   },
 * });
 *
 * const result = await pipeline.execute(
 *   { projectPath: '/my/project' },
 *   { onProgress: (update) => console.log(update) }
 * );
 * ```
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Learning stages in order of execution
 */
export enum LearningStage {
  Initialization = 'initialization',
  FileDiscovery = 'file_discovery',
  Parsing = 'parsing',
  ConceptExtraction = 'concept_extraction',
  PatternDetection = 'pattern_detection',
  Indexing = 'indexing',
  Completion = 'completion',
}

/**
 * Pipeline execution state
 */
export type PipelineState = 'idle' | 'running' | 'completed' | 'error' | 'cancelled';

/**
 * Stage handler function type
 */
export type StageHandler<T = unknown> = (context: PipelineContext) => Promise<T>;

/**
 * Stage handlers configuration
 */
export interface StageHandlers {
  onInitialization: StageHandler;
  onFileDiscovery: StageHandler;
  onParsing: StageHandler;
  onConceptExtraction: StageHandler;
  onPatternDetection: StageHandler;
  onIndexing: StageHandler;
  onCompletion: StageHandler;
}

/**
 * Pipeline context passed between stages
 */
export interface PipelineContext {
  projectPath: string;
  [key: string]: unknown;
}

/**
 * Progress update information
 */
export interface ProgressUpdate {
  stage: string;
  progress: number;
  message?: string;
}

/**
 * Execution options
 */
export interface ExecuteOptions {
  onProgress?: (update: ProgressUpdate) => void;
}

/**
 * Pipeline execution result
 */
export interface PipelineResult {
  success: boolean;
  projectPath: string;
  [key: string]: unknown;
}

// ============================================================================
// LearningPipeline Class
// ============================================================================

/**
 * Manages the learning pipeline execution
 */
export class LearningPipeline {
  private state: PipelineState = 'idle';
  private currentStage: LearningStage | null = null;
  private failedStage: LearningStage | null = null;
  private cancelled = false;
  private handlers: StageHandlers;

  /**
   * Stage order and progress weights
   */
  private static readonly STAGES: Array<{
    stage: LearningStage;
    handler: keyof StageHandlers;
    weight: number;
  }> = [
    { stage: LearningStage.Initialization, handler: 'onInitialization', weight: 5 },
    { stage: LearningStage.FileDiscovery, handler: 'onFileDiscovery', weight: 10 },
    { stage: LearningStage.Parsing, handler: 'onParsing', weight: 25 },
    { stage: LearningStage.ConceptExtraction, handler: 'onConceptExtraction', weight: 25 },
    { stage: LearningStage.PatternDetection, handler: 'onPatternDetection', weight: 20 },
    { stage: LearningStage.Indexing, handler: 'onIndexing', weight: 10 },
    { stage: LearningStage.Completion, handler: 'onCompletion', weight: 5 },
  ];

  constructor(handlers: StageHandlers) {
    this.handlers = handlers;
  }

  /**
   * Get current pipeline state
   */
  getState(): PipelineState {
    return this.state;
  }

  /**
   * Get current stage during execution
   */
  getCurrentStage(): LearningStage | null {
    return this.currentStage;
  }

  /**
   * Get the stage that failed (if any)
   */
  getFailedStage(): LearningStage | null {
    return this.failedStage;
  }

  /**
   * Execute the learning pipeline
   */
  async execute(
    input: { projectPath: string },
    options: ExecuteOptions = {}
  ): Promise<PipelineResult> {
    const { onProgress } = options;

    // Reset state
    this.state = 'running';
    this.currentStage = null;
    this.failedStage = null;
    this.cancelled = false;

    // Initialize context with input
    let context: PipelineContext = { ...input };
    let cumulativeProgress = 0;

    try {
      for (const stageConfig of LearningPipeline.STAGES) {
        // Check for cancellation
        if (this.cancelled) {
          this.state = 'cancelled';
          throw new Error('Pipeline execution cancelled');
        }

        // Set current stage
        this.currentStage = stageConfig.stage;

        // Execute stage handler
        const handler = this.handlers[stageConfig.handler];
        const result = await handler(context);

        // Merge result into context
        if (result && typeof result === 'object') {
          context = { ...context, ...(result as Record<string, unknown>) };
        }

        // Calculate and report progress
        cumulativeProgress += stageConfig.weight;
        const progressPercent = Math.round(
          (cumulativeProgress / 100) * 100
        );

        if (onProgress) {
          onProgress({
            stage: stageConfig.stage,
            progress: progressPercent,
          });
        }
      }

      // Mark as completed
      this.state = 'completed';
      this.currentStage = null;

      return {
        ...context,
        success: true,
        projectPath: input.projectPath,
      };
    } catch (error) {
      // Record failure state
      if (!this.cancelled) {
        this.state = 'error';
        this.failedStage = this.currentStage;
      }

      // Wrap error with stage context for better debugging
      const originalMessage = error instanceof Error ? error.message : String(error);
      const enhancedError = new Error(
        `Pipeline failed at stage '${this.currentStage}': ${originalMessage}`
      );
      enhancedError.cause = error;
      throw enhancedError;
    }
  }

  /**
   * Cancel pipeline execution
   */
  cancel(): void {
    this.cancelled = true;
  }

  /**
   * Reset pipeline to idle state
   */
  reset(): void {
    this.state = 'idle';
    this.currentStage = null;
    this.failedStage = null;
    this.cancelled = false;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Default no-op handlers
 */
const defaultHandlers: StageHandlers = {
  onInitialization: async (ctx) => ctx,
  onFileDiscovery: async (ctx) => ctx,
  onParsing: async (ctx) => ctx,
  onConceptExtraction: async (ctx) => ctx,
  onPatternDetection: async (ctx) => ctx,
  onIndexing: async (ctx) => ctx,
  onCompletion: async () => ({ success: true }),
};

/**
 * Create a learning pipeline with optional custom handlers
 */
export function createLearningPipeline(
  customHandlers: Partial<StageHandlers> = {}
): LearningPipeline {
  const handlers: StageHandlers = {
    ...defaultHandlers,
    ...customHandlers,
  };

  return new LearningPipeline(handlers);
}
