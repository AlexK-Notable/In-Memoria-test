/**
 * Composite Tools
 *
 * Provides a way to combine multiple operations into single convenient operations.
 * Supports step chaining, conditional execution, progress reporting, and error handling.
 *
 * @example
 * ```typescript
 * import { CompositeToolBuilder, createCompositeTool } from './composite-tools.js';
 *
 * const tool = new CompositeToolBuilder('analyze_and_learn')
 *   .setDescription('Analyze codebase and learn patterns')
 *   .addStep('analyze', analyzeCodebase)
 *   .addStep('learn', learnPatterns)
 *   .addStep('index', indexResults)
 *   .build();
 *
 * const result = await tool.execute({ path: '/my/project' });
 * ```
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Context passed between steps
 */
export interface StepContext {
  [key: string]: unknown;
}

/**
 * Step handler function type
 */
export type StepHandler = (context: StepContext) => Promise<StepContext>;

/**
 * Options for a step
 */
export interface StepOptions {
  /** Whether the step is optional (won't stop execution on failure) */
  optional?: boolean;

  /** Condition function - step only runs if this returns true */
  condition?: (context: StepContext) => boolean;

  /** Timeout in milliseconds */
  timeoutMs?: number;
}

/**
 * Step definition
 */
export interface StepDefinition {
  name: string;
  handler: StepHandler;
  options?: StepOptions;
}

/**
 * Progress update
 */
export interface ProgressUpdate {
  step: string;
  progress: number;
}

/**
 * Execution options
 */
export interface ExecuteOptions {
  onProgress?: (update: ProgressUpdate) => void;
}

/**
 * Input schema definition
 */
export interface InputSchema {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
}

/**
 * Built composite tool
 */
export interface CompositeTool {
  name: string;
  description?: string;
  inputSchema: InputSchema;
  steps: StepDefinition[];
  execute: (input: StepContext, options?: ExecuteOptions) => Promise<StepContext>;
}

/**
 * Factory configuration
 */
export interface CompositeToolConfig {
  name: string;
  description?: string;
  inputSchema?: InputSchema;
  steps: Array<{
    name: string;
    handler: StepHandler;
    options?: StepOptions;
  }>;
}

// ============================================================================
// CompositeToolError
// ============================================================================

/**
 * Error thrown when a composite tool step fails
 */
export class CompositeToolError extends Error {
  name = 'CompositeToolError';

  /** The step that failed */
  stepName: string;

  /** The original error */
  cause: Error;

  constructor(message: string, stepName: string, cause: Error) {
    super(message);
    this.stepName = stepName;
    this.cause = cause;
  }
}

// ============================================================================
// CompositeToolBuilder
// ============================================================================

/**
 * Builder for creating composite tools
 */
export class CompositeToolBuilder {
  private toolName: string;
  private toolDescription?: string;
  private toolInputSchema: InputSchema = { type: 'object', properties: {} };
  private stepDefinitions: StepDefinition[] = [];

  constructor(name: string) {
    this.toolName = name;
  }

  /**
   * Set tool description
   */
  setDescription(description: string): this {
    this.toolDescription = description;
    return this;
  }

  /**
   * Set input schema
   */
  setInputSchema(schema: InputSchema): this {
    this.toolInputSchema = schema;
    return this;
  }

  /**
   * Add a step to the composite tool
   */
  addStep(name: string, handler: StepHandler, options?: StepOptions): this {
    this.stepDefinitions.push({ name, handler, options });
    return this;
  }

  /**
   * Build the composite tool
   */
  build(): CompositeTool {
    const steps = [...this.stepDefinitions];

    return {
      name: this.toolName,
      description: this.toolDescription,
      inputSchema: this.toolInputSchema,
      steps,
      execute: (input, options) => this.executeSteps(input, steps, options),
    };
  }

  /**
   * Execute all steps in order
   */
  private async executeSteps(
    input: StepContext,
    steps: StepDefinition[],
    options?: ExecuteOptions
  ): Promise<StepContext> {
    let context: StepContext = { ...input };
    const totalSteps = steps.length;

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];

      // Check condition
      if (step.options?.condition && !step.options.condition(context)) {
        continue;
      }

      try {
        // Execute with timeout if specified
        const result = step.options?.timeoutMs
          ? await this.executeWithTimeout(step.handler, context, step.options.timeoutMs)
          : await step.handler(context);

        // Merge result into context (only plain objects, not arrays or null)
        if (result && typeof result === 'object' && !Array.isArray(result)) {
          context = { ...context, ...result };
        }

        // Report progress
        if (options?.onProgress) {
          options.onProgress({
            step: step.name,
            progress: Math.round(((i + 1) / totalSteps) * 100),
          });
        }
      } catch (error) {
        // If optional, continue to next step
        if (step.options?.optional) {
          continue;
        }

        // Wrap and throw error
        throw new CompositeToolError(
          error instanceof Error ? error.message : String(error),
          step.name,
          error instanceof Error ? error : new Error(String(error))
        );
      }
    }

    return context;
  }

  /**
   * Execute handler with timeout
   */
  private async executeWithTimeout(
    handler: StepHandler,
    context: StepContext,
    timeoutMs: number
  ): Promise<StepContext> {
    return Promise.race([
      handler(context),
      new Promise<StepContext>((_, reject) =>
        setTimeout(() => reject(new Error('Step execution timeout')), timeoutMs)
      ),
    ]);
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a composite tool from configuration
 */
export function createCompositeTool(config: CompositeToolConfig): CompositeTool {
  const builder = new CompositeToolBuilder(config.name);

  if (config.description) {
    builder.setDescription(config.description);
  }

  if (config.inputSchema) {
    builder.setInputSchema(config.inputSchema);
  }

  for (const step of config.steps) {
    builder.addStep(step.name, step.handler, step.options);
  }

  return builder.build();
}
