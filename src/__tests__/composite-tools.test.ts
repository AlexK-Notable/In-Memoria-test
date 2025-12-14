/**
 * Tests for Composite Tools
 * TDD: Write tests FIRST, then implementation
 *
 * Composite tools combine multiple operations into single convenient operations.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Runtime import to verify the file exists and exports correctly
import * as CompositeToolsModule from '../mcp-server/composite-tools.js';

describe('Composite Tools', () => {
  describe('Module exports', () => {
    it('should export the CompositeToolsModule', () => {
      expect(CompositeToolsModule).toBeDefined();
    });

    it('should export CompositeToolBuilder class', () => {
      expect(CompositeToolsModule.CompositeToolBuilder).toBeDefined();
      expect(typeof CompositeToolsModule.CompositeToolBuilder).toBe('function');
    });

    it('should export createCompositeTool function', () => {
      expect(CompositeToolsModule.createCompositeTool).toBeDefined();
      expect(typeof CompositeToolsModule.createCompositeTool).toBe('function');
    });

    it('should export CompositeToolError class', () => {
      expect(CompositeToolsModule.CompositeToolError).toBeDefined();
      expect(typeof CompositeToolsModule.CompositeToolError).toBe('function');
    });
  });

  describe('CompositeToolBuilder', () => {
    let builder: CompositeToolsModule.CompositeToolBuilder;

    beforeEach(() => {
      builder = new CompositeToolsModule.CompositeToolBuilder('test_composite');
    });

    it('should create builder with name', () => {
      expect(builder).toBeDefined();
    });

    it('should add steps to the composite tool', () => {
      const step1 = vi.fn().mockResolvedValue({ data: 'step1' });
      const step2 = vi.fn().mockResolvedValue({ data: 'step2' });

      builder.addStep('step1', step1).addStep('step2', step2);

      const tool = builder.build();
      expect(tool.steps).toHaveLength(2);
    });

    it('should support chained step additions', () => {
      const step = vi.fn().mockResolvedValue({});

      const result = builder.addStep('s1', step).addStep('s2', step).addStep('s3', step);

      expect(result).toBe(builder);
    });

    it('should set description', () => {
      builder.setDescription('A composite tool for testing');

      const tool = builder.build();
      expect(tool.description).toBe('A composite tool for testing');
    });

    it('should set input schema', () => {
      const schema = {
        type: 'object' as const,
        properties: {
          path: { type: 'string' },
        },
        required: ['path'],
      };

      builder.setInputSchema(schema);

      const tool = builder.build();
      expect(tool.inputSchema).toEqual(schema);
    });

    it('should build executable composite tool', () => {
      const step = vi.fn().mockResolvedValue({ result: 'ok' });

      builder.addStep('only_step', step);

      const tool = builder.build();

      expect(tool.name).toBe('test_composite');
      expect(typeof tool.execute).toBe('function');
    });
  });

  describe('Composite Tool Execution', () => {
    it('should execute steps in order', async () => {
      const executionOrder: string[] = [];

      const step1 = vi.fn().mockImplementation(async () => {
        executionOrder.push('step1');
        return { fromStep1: true };
      });

      const step2 = vi.fn().mockImplementation(async () => {
        executionOrder.push('step2');
        return { fromStep2: true };
      });

      const step3 = vi.fn().mockImplementation(async () => {
        executionOrder.push('step3');
        return { fromStep3: true };
      });

      const builder = new CompositeToolsModule.CompositeToolBuilder('ordered_tool');
      builder.addStep('step1', step1).addStep('step2', step2).addStep('step3', step3);

      const tool = builder.build();
      await tool.execute({ input: 'test' });

      expect(executionOrder).toEqual(['step1', 'step2', 'step3']);
    });

    it('should pass context between steps', async () => {
      const step1 = vi.fn().mockResolvedValue({ value: 10 });
      const step2 = vi.fn().mockImplementation(async (ctx) => {
        return { doubled: ctx.value * 2 };
      });

      const builder = new CompositeToolsModule.CompositeToolBuilder('context_tool');
      builder.addStep('step1', step1).addStep('step2', step2);

      const tool = builder.build();
      const result = await tool.execute({});

      expect(result.doubled).toBe(20);
    });

    it('should include initial input in context', async () => {
      const step = vi.fn().mockImplementation(async (ctx) => {
        return { receivedPath: ctx.path };
      });

      const builder = new CompositeToolsModule.CompositeToolBuilder('input_tool');
      builder.addStep('step', step);

      const tool = builder.build();
      const result = await tool.execute({ path: '/test/path' });

      expect(result.receivedPath).toBe('/test/path');
    });

    it('should stop execution on step failure', async () => {
      const step1 = vi.fn().mockResolvedValue({ ok: true });
      const step2 = vi.fn().mockRejectedValue(new Error('Step 2 failed'));
      const step3 = vi.fn().mockResolvedValue({ ok: true });

      const builder = new CompositeToolsModule.CompositeToolBuilder('failing_tool');
      builder.addStep('step1', step1).addStep('step2', step2).addStep('step3', step3);

      const tool = builder.build();

      await expect(tool.execute({})).rejects.toThrow('Step 2 failed');
      expect(step3).not.toHaveBeenCalled();
    });

    it('should wrap errors with step information', async () => {
      const step1 = vi.fn().mockResolvedValue({});
      const step2 = vi.fn().mockRejectedValue(new Error('Original error'));

      const builder = new CompositeToolsModule.CompositeToolBuilder('error_tool');
      builder.addStep('first', step1).addStep('failing_step', step2);

      const tool = builder.build();

      try {
        await tool.execute({});
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(CompositeToolsModule.CompositeToolError);
        expect((error as CompositeToolsModule.CompositeToolError).stepName).toBe(
          'failing_step'
        );
      }
    });

    it('should accumulate results from all steps', async () => {
      const step1 = vi.fn().mockResolvedValue({ a: 1 });
      const step2 = vi.fn().mockResolvedValue({ b: 2 });
      const step3 = vi.fn().mockResolvedValue({ c: 3 });

      const builder = new CompositeToolsModule.CompositeToolBuilder('accumulate_tool');
      builder.addStep('s1', step1).addStep('s2', step2).addStep('s3', step3);

      const tool = builder.build();
      const result = await tool.execute({});

      expect(result.a).toBe(1);
      expect(result.b).toBe(2);
      expect(result.c).toBe(3);
    });
  });

  describe('Step options', () => {
    it('should support optional steps', async () => {
      const step1 = vi.fn().mockResolvedValue({ ok: true });
      const step2 = vi.fn().mockRejectedValue(new Error('Optional failure'));
      const step3 = vi.fn().mockResolvedValue({ completed: true });

      const builder = new CompositeToolsModule.CompositeToolBuilder('optional_tool');
      builder
        .addStep('step1', step1)
        .addStep('step2', step2, { optional: true })
        .addStep('step3', step3);

      const tool = builder.build();
      const result = await tool.execute({});

      expect(step3).toHaveBeenCalled();
      expect(result.completed).toBe(true);
    });

    it('should support conditional steps', async () => {
      const step1 = vi.fn().mockResolvedValue({ shouldSkip: true });
      const step2 = vi.fn().mockResolvedValue({ skipped: false });

      const builder = new CompositeToolsModule.CompositeToolBuilder('conditional_tool');
      builder
        .addStep('step1', step1)
        .addStep('step2', step2, {
          condition: (ctx) => !ctx.shouldSkip,
        });

      const tool = builder.build();
      const result = await tool.execute({});

      expect(step2).not.toHaveBeenCalled();
      expect(result.skipped).toBeUndefined();
    });

    it('should execute step when condition is met', async () => {
      const step1 = vi.fn().mockResolvedValue({ shouldRun: true });
      const step2 = vi.fn().mockResolvedValue({ ran: true });

      const builder = new CompositeToolsModule.CompositeToolBuilder('condition_met_tool');
      builder.addStep('step1', step1).addStep('step2', step2, {
        condition: (ctx) => ctx.shouldRun === true,
      });

      const tool = builder.build();
      const result = await tool.execute({});

      expect(step2).toHaveBeenCalled();
      expect(result.ran).toBe(true);
    });

    it('should support timeout for steps', async () => {
      const slowStep = vi.fn().mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 1000))
      );

      const builder = new CompositeToolsModule.CompositeToolBuilder('timeout_tool');
      builder.addStep('slow', slowStep, { timeoutMs: 50 });

      const tool = builder.build();

      await expect(tool.execute({})).rejects.toThrow('timeout');
    });
  });

  describe('createCompositeTool factory', () => {
    it('should create tool from step definitions', async () => {
      const tool = CompositeToolsModule.createCompositeTool({
        name: 'factory_tool',
        description: 'A tool created by factory',
        steps: [
          { name: 'step1', handler: async () => ({ a: 1 }) },
          { name: 'step2', handler: async () => ({ b: 2 }) },
        ],
      });

      const result = await tool.execute({});

      expect(result.a).toBe(1);
      expect(result.b).toBe(2);
    });

    it('should support input schema in factory', () => {
      const tool = CompositeToolsModule.createCompositeTool({
        name: 'schema_tool',
        description: 'Tool with schema',
        inputSchema: {
          type: 'object',
          properties: {
            required: { type: 'string' },
          },
          required: ['required'],
        },
        steps: [{ name: 'step', handler: async () => ({}) }],
      });

      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.required).toContain('required');
    });
  });

  describe('CompositeToolError', () => {
    it('should be an Error', () => {
      const error = new CompositeToolsModule.CompositeToolError(
        'Test error',
        'test_step',
        new Error('Original')
      );

      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('CompositeToolError');
    });

    it('should include step name', () => {
      const error = new CompositeToolsModule.CompositeToolError(
        'Failed',
        'failing_step',
        new Error('Original')
      );

      expect(error.stepName).toBe('failing_step');
    });

    it('should include original error', () => {
      const original = new Error('Original error');
      const error = new CompositeToolsModule.CompositeToolError(
        'Wrapped',
        'step',
        original
      );

      expect(error.cause).toBe(original);
    });

    it('should include message with step info', () => {
      const error = new CompositeToolsModule.CompositeToolError(
        'Something failed',
        'important_step',
        new Error('Original')
      );

      expect(error.message).toContain('Something failed');
    });
  });

  describe('Progress reporting', () => {
    it('should report progress for each step', async () => {
      const progressUpdates: { step: string; progress: number }[] = [];

      const step1 = vi.fn().mockResolvedValue({});
      const step2 = vi.fn().mockResolvedValue({});
      const step3 = vi.fn().mockResolvedValue({});

      const builder = new CompositeToolsModule.CompositeToolBuilder('progress_tool');
      builder.addStep('s1', step1).addStep('s2', step2).addStep('s3', step3);

      const tool = builder.build();
      await tool.execute(
        {},
        {
          onProgress: (update) => {
            progressUpdates.push(update);
          },
        }
      );

      expect(progressUpdates).toHaveLength(3);
      expect(progressUpdates[2].progress).toBe(100);
    });
  });
});
