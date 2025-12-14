/**
 * Tests for Learning Pipeline
 * TDD: Write tests FIRST, then implementation
 *
 * Provides a clean pipeline for the codebase learning process
 * with proper stage management and progress tracking.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Runtime import to verify the file exists and exports correctly
import * as LearningPipelineModule from '../services/learning-pipeline.js';

describe('Learning Pipeline', () => {
  describe('Module exports', () => {
    it('should export the LearningPipelineModule', () => {
      expect(LearningPipelineModule).toBeDefined();
    });

    it('should export LearningPipeline class', () => {
      expect(LearningPipelineModule.LearningPipeline).toBeDefined();
      expect(typeof LearningPipelineModule.LearningPipeline).toBe('function');
    });

    it('should export LearningStage enum', () => {
      expect(LearningPipelineModule.LearningStage).toBeDefined();
    });

    it('should export createLearningPipeline function', () => {
      expect(LearningPipelineModule.createLearningPipeline).toBeDefined();
      expect(typeof LearningPipelineModule.createLearningPipeline).toBe('function');
    });
  });

  describe('LearningStage enum', () => {
    it('should have Initialization stage', () => {
      expect(LearningPipelineModule.LearningStage.Initialization).toBeDefined();
    });

    it('should have FileDiscovery stage', () => {
      expect(LearningPipelineModule.LearningStage.FileDiscovery).toBeDefined();
    });

    it('should have Parsing stage', () => {
      expect(LearningPipelineModule.LearningStage.Parsing).toBeDefined();
    });

    it('should have ConceptExtraction stage', () => {
      expect(LearningPipelineModule.LearningStage.ConceptExtraction).toBeDefined();
    });

    it('should have PatternDetection stage', () => {
      expect(LearningPipelineModule.LearningStage.PatternDetection).toBeDefined();
    });

    it('should have Indexing stage', () => {
      expect(LearningPipelineModule.LearningStage.Indexing).toBeDefined();
    });

    it('should have Completion stage', () => {
      expect(LearningPipelineModule.LearningStage.Completion).toBeDefined();
    });
  });

  describe('LearningPipeline', () => {
    let pipeline: LearningPipelineModule.LearningPipeline;
    let mockHandlers: LearningPipelineModule.StageHandlers;

    beforeEach(() => {
      mockHandlers = {
        onInitialization: vi.fn().mockResolvedValue({ projectPath: '/test' }),
        onFileDiscovery: vi.fn().mockResolvedValue({ files: ['a.ts', 'b.ts'] }),
        onParsing: vi.fn().mockResolvedValue({ parsed: 2 }),
        onConceptExtraction: vi.fn().mockResolvedValue({ concepts: 10 }),
        onPatternDetection: vi.fn().mockResolvedValue({ patterns: 5 }),
        onIndexing: vi.fn().mockResolvedValue({ indexed: true }),
        onCompletion: vi.fn().mockResolvedValue({ success: true }),
      };

      pipeline = new LearningPipelineModule.LearningPipeline(mockHandlers);
    });

    it('should create pipeline with handlers', () => {
      expect(pipeline).toBeDefined();
    });

    it('should start in idle state', () => {
      expect(pipeline.getState()).toBe('idle');
    });

    it('should execute all stages in order', async () => {
      await pipeline.execute({ projectPath: '/test' });

      expect(mockHandlers.onInitialization).toHaveBeenCalled();
      expect(mockHandlers.onFileDiscovery).toHaveBeenCalled();
      expect(mockHandlers.onParsing).toHaveBeenCalled();
      expect(mockHandlers.onConceptExtraction).toHaveBeenCalled();
      expect(mockHandlers.onPatternDetection).toHaveBeenCalled();
      expect(mockHandlers.onIndexing).toHaveBeenCalled();
      expect(mockHandlers.onCompletion).toHaveBeenCalled();
    });

    it('should pass context between stages', async () => {
      await pipeline.execute({ projectPath: '/test' });

      // Each subsequent handler should receive output from previous stages
      expect(mockHandlers.onFileDiscovery).toHaveBeenCalledWith(
        expect.objectContaining({ projectPath: '/test' })
      );
    });

    it('should track current stage during execution', async () => {
      let capturedStages: LearningPipelineModule.LearningStage[] = [];

      mockHandlers.onParsing = vi.fn().mockImplementation(async () => {
        capturedStages.push(pipeline.getCurrentStage()!);
        return { parsed: 2 };
      });

      pipeline = new LearningPipelineModule.LearningPipeline(mockHandlers);
      await pipeline.execute({ projectPath: '/test' });

      expect(capturedStages).toContain(LearningPipelineModule.LearningStage.Parsing);
    });

    it('should be in running state during execution', async () => {
      let capturedState: string | undefined;

      mockHandlers.onParsing = vi.fn().mockImplementation(async () => {
        capturedState = pipeline.getState();
        return { parsed: 2 };
      });

      pipeline = new LearningPipelineModule.LearningPipeline(mockHandlers);
      await pipeline.execute({ projectPath: '/test' });

      expect(capturedState).toBe('running');
    });

    it('should be in completed state after successful execution', async () => {
      await pipeline.execute({ projectPath: '/test' });

      expect(pipeline.getState()).toBe('completed');
    });

    it('should be in error state after failed execution', async () => {
      mockHandlers.onParsing = vi.fn().mockRejectedValue(new Error('Parse failed'));
      pipeline = new LearningPipelineModule.LearningPipeline(mockHandlers);

      await expect(pipeline.execute({ projectPath: '/test' })).rejects.toThrow(
        'Parse failed'
      );

      expect(pipeline.getState()).toBe('error');
    });

    it('should report progress during execution', async () => {
      const progressCallback = vi.fn();

      await pipeline.execute({ projectPath: '/test' }, { onProgress: progressCallback });

      // Should be called for each stage
      expect(progressCallback).toHaveBeenCalledTimes(7);
      expect(progressCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          stage: expect.any(String),
          progress: expect.any(Number),
        })
      );
    });

    it('should return final result', async () => {
      const result = await pipeline.execute({ projectPath: '/test' });

      expect(result).toEqual(
        expect.objectContaining({
          success: true,
          projectPath: '/test',
        })
      );
    });

    it('should support cancellation', async () => {
      let resolveParsing: () => void;
      const parsingPromise = new Promise<{ parsed: number }>((resolve) => {
        resolveParsing = () => resolve({ parsed: 2 });
      });

      mockHandlers.onParsing = vi.fn().mockReturnValue(parsingPromise);
      pipeline = new LearningPipelineModule.LearningPipeline(mockHandlers);

      // Start execution but don't await
      const executePromise = pipeline.execute({ projectPath: '/test' });

      // Cancel while parsing
      pipeline.cancel();

      // Resolve the parsing to let it proceed
      resolveParsing!();

      await expect(executePromise).rejects.toThrow('cancelled');
      expect(pipeline.getState()).toBe('cancelled');
    });

    it('should reset to idle state', async () => {
      await pipeline.execute({ projectPath: '/test' });
      expect(pipeline.getState()).toBe('completed');

      pipeline.reset();
      expect(pipeline.getState()).toBe('idle');
    });
  });

  describe('Stage execution', () => {
    let mockHandlers: LearningPipelineModule.StageHandlers;

    beforeEach(() => {
      mockHandlers = {
        onInitialization: vi.fn().mockResolvedValue({ projectPath: '/test' }),
        onFileDiscovery: vi.fn().mockResolvedValue({ files: [] }),
        onParsing: vi.fn().mockResolvedValue({ parsed: 0 }),
        onConceptExtraction: vi.fn().mockResolvedValue({ concepts: 0 }),
        onPatternDetection: vi.fn().mockResolvedValue({ patterns: 0 }),
        onIndexing: vi.fn().mockResolvedValue({ indexed: true }),
        onCompletion: vi.fn().mockResolvedValue({ success: true }),
      };
    });

    it('should handle empty file discovery gracefully', async () => {
      const pipeline = new LearningPipelineModule.LearningPipeline(mockHandlers);

      const result = await pipeline.execute({ projectPath: '/test' });

      expect(result.success).toBe(true);
    });

    it('should accumulate results from all stages', async () => {
      mockHandlers.onFileDiscovery = vi.fn().mockResolvedValue({
        files: ['a.ts', 'b.ts', 'c.ts'],
        fileCount: 3,
      });

      mockHandlers.onConceptExtraction = vi.fn().mockResolvedValue({
        concepts: 25,
        conceptTypes: ['class', 'function'],
      });

      const pipeline = new LearningPipelineModule.LearningPipeline(mockHandlers);
      const result = await pipeline.execute({ projectPath: '/test' });

      expect(result.fileCount).toBe(3);
      expect(result.concepts).toBe(25);
    });

    it('should skip remaining stages on error', async () => {
      mockHandlers.onParsing = vi.fn().mockRejectedValue(new Error('Parse error'));

      const pipeline = new LearningPipelineModule.LearningPipeline(mockHandlers);

      try {
        await pipeline.execute({ projectPath: '/test' });
      } catch {
        // Expected error
      }

      expect(mockHandlers.onConceptExtraction).not.toHaveBeenCalled();
      expect(mockHandlers.onPatternDetection).not.toHaveBeenCalled();
    });
  });

  describe('Progress tracking', () => {
    it('should calculate progress percentage', async () => {
      const progressUpdates: number[] = [];

      const mockHandlers: LearningPipelineModule.StageHandlers = {
        onInitialization: vi.fn().mockResolvedValue({}),
        onFileDiscovery: vi.fn().mockResolvedValue({}),
        onParsing: vi.fn().mockResolvedValue({}),
        onConceptExtraction: vi.fn().mockResolvedValue({}),
        onPatternDetection: vi.fn().mockResolvedValue({}),
        onIndexing: vi.fn().mockResolvedValue({}),
        onCompletion: vi.fn().mockResolvedValue({ success: true }),
      };

      const pipeline = new LearningPipelineModule.LearningPipeline(mockHandlers);

      await pipeline.execute(
        { projectPath: '/test' },
        {
          onProgress: (update) => {
            progressUpdates.push(update.progress);
          },
        }
      );

      // Progress should increase monotonically
      for (let i = 1; i < progressUpdates.length; i++) {
        expect(progressUpdates[i]).toBeGreaterThanOrEqual(progressUpdates[i - 1]);
      }

      // Final progress should be 100%
      expect(progressUpdates[progressUpdates.length - 1]).toBe(100);
    });

    it('should include stage name in progress updates', async () => {
      const stageNames: string[] = [];

      const mockHandlers: LearningPipelineModule.StageHandlers = {
        onInitialization: vi.fn().mockResolvedValue({}),
        onFileDiscovery: vi.fn().mockResolvedValue({}),
        onParsing: vi.fn().mockResolvedValue({}),
        onConceptExtraction: vi.fn().mockResolvedValue({}),
        onPatternDetection: vi.fn().mockResolvedValue({}),
        onIndexing: vi.fn().mockResolvedValue({}),
        onCompletion: vi.fn().mockResolvedValue({ success: true }),
      };

      const pipeline = new LearningPipelineModule.LearningPipeline(mockHandlers);

      await pipeline.execute(
        { projectPath: '/test' },
        {
          onProgress: (update) => {
            stageNames.push(update.stage);
          },
        }
      );

      expect(stageNames).toContain('initialization');
      expect(stageNames).toContain('file_discovery');
      expect(stageNames).toContain('parsing');
      expect(stageNames).toContain('concept_extraction');
      expect(stageNames).toContain('pattern_detection');
      expect(stageNames).toContain('indexing');
      expect(stageNames).toContain('completion');
    });
  });

  describe('createLearningPipeline factory', () => {
    it('should create pipeline with default handlers', () => {
      const pipeline = LearningPipelineModule.createLearningPipeline();

      expect(pipeline).toBeInstanceOf(LearningPipelineModule.LearningPipeline);
    });

    it('should create pipeline with custom handlers', () => {
      const customHandler = vi.fn().mockResolvedValue({ custom: true });

      const pipeline = LearningPipelineModule.createLearningPipeline({
        onParsing: customHandler,
      });

      expect(pipeline).toBeInstanceOf(LearningPipelineModule.LearningPipeline);
    });
  });

  describe('Error handling', () => {
    it('should wrap errors with stage information', async () => {
      const mockHandlers: LearningPipelineModule.StageHandlers = {
        onInitialization: vi.fn().mockResolvedValue({}),
        onFileDiscovery: vi.fn().mockResolvedValue({}),
        onParsing: vi.fn().mockRejectedValue(new Error('Syntax error')),
        onConceptExtraction: vi.fn().mockResolvedValue({}),
        onPatternDetection: vi.fn().mockResolvedValue({}),
        onIndexing: vi.fn().mockResolvedValue({}),
        onCompletion: vi.fn().mockResolvedValue({ success: true }),
      };

      const pipeline = new LearningPipelineModule.LearningPipeline(mockHandlers);

      try {
        await pipeline.execute({ projectPath: '/test' });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('Syntax error');
      }
    });

    it('should record failed stage', async () => {
      const mockHandlers: LearningPipelineModule.StageHandlers = {
        onInitialization: vi.fn().mockResolvedValue({}),
        onFileDiscovery: vi.fn().mockResolvedValue({}),
        onParsing: vi.fn().mockRejectedValue(new Error('Parse error')),
        onConceptExtraction: vi.fn().mockResolvedValue({}),
        onPatternDetection: vi.fn().mockResolvedValue({}),
        onIndexing: vi.fn().mockResolvedValue({}),
        onCompletion: vi.fn().mockResolvedValue({ success: true }),
      };

      const pipeline = new LearningPipelineModule.LearningPipeline(mockHandlers);

      try {
        await pipeline.execute({ projectPath: '/test' });
      } catch {
        // Expected
      }

      expect(pipeline.getFailedStage()).toBe(
        LearningPipelineModule.LearningStage.Parsing
      );
    });
  });
});
