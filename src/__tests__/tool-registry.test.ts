/**
 * Tests for Tool Registry
 * TDD: Write tests FIRST, then implementation
 *
 * Provides organized management and discovery of MCP tools.
 */

import { describe, it, expect, beforeEach } from 'vitest';

// Runtime import to verify the file exists and exports correctly
import * as ToolRegistryModule from '../mcp-server/tool-registry.js';

describe('Tool Registry', () => {
  describe('Module exports', () => {
    it('should export the ToolRegistryModule', () => {
      expect(ToolRegistryModule).toBeDefined();
    });

    it('should export ToolRegistry class', () => {
      expect(ToolRegistryModule.ToolRegistry).toBeDefined();
      expect(typeof ToolRegistryModule.ToolRegistry).toBe('function');
    });

    it('should export createToolRegistry function', () => {
      expect(ToolRegistryModule.createToolRegistry).toBeDefined();
      expect(typeof ToolRegistryModule.createToolRegistry).toBe('function');
    });

    it('should export ToolCategory enum', () => {
      expect(ToolRegistryModule.ToolCategory).toBeDefined();
    });
  });

  describe('Tool Registration', () => {
    let registry: ToolRegistryModule.ToolRegistry;

    beforeEach(() => {
      registry = new ToolRegistryModule.ToolRegistry();
    });

    it('should register a tool with metadata', () => {
      registry.register({
        name: 'analyze_codebase',
        description: 'Analyze code structure',
        category: ToolRegistryModule.ToolCategory.Analysis,
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string' },
          },
          required: ['path'],
        },
        handler: async () => ({ success: true }),
      });

      expect(registry.has('analyze_codebase')).toBe(true);
    });

    it('should reject duplicate tool registration', () => {
      const toolDef = {
        name: 'test_tool',
        description: 'A test tool',
        category: ToolRegistryModule.ToolCategory.Analysis,
        inputSchema: { type: 'object' as const, properties: {} },
        handler: async () => ({}),
      };

      registry.register(toolDef);

      expect(() => registry.register(toolDef)).toThrow('already registered');
    });

    it('should allow overwriting with force option', () => {
      const toolDef = {
        name: 'test_tool',
        description: 'A test tool',
        category: ToolRegistryModule.ToolCategory.Analysis,
        inputSchema: { type: 'object' as const, properties: {} },
        handler: async () => ({}),
      };

      registry.register(toolDef);

      const updatedDef = {
        ...toolDef,
        description: 'Updated description',
      };

      registry.register(updatedDef, { force: true });

      const tool = registry.get('test_tool');
      expect(tool?.description).toBe('Updated description');
    });

    it('should unregister a tool', () => {
      registry.register({
        name: 'temp_tool',
        description: 'Temporary',
        category: ToolRegistryModule.ToolCategory.Utility,
        inputSchema: { type: 'object', properties: {} },
        handler: async () => ({}),
      });

      expect(registry.has('temp_tool')).toBe(true);

      const result = registry.unregister('temp_tool');

      expect(result).toBe(true);
      expect(registry.has('temp_tool')).toBe(false);
    });

    it('should return false when unregistering nonexistent tool', () => {
      const result = registry.unregister('nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('Tool Discovery', () => {
    let registry: ToolRegistryModule.ToolRegistry;

    beforeEach(() => {
      registry = new ToolRegistryModule.ToolRegistry();

      // Register multiple tools
      registry.register({
        name: 'analyze_codebase',
        description: 'Analyze code structure',
        category: ToolRegistryModule.ToolCategory.Analysis,
        tags: ['code', 'analysis'],
        inputSchema: { type: 'object', properties: {} },
        handler: async () => ({}),
      });

      registry.register({
        name: 'search_codebase',
        description: 'Search for code patterns',
        category: ToolRegistryModule.ToolCategory.Search,
        tags: ['code', 'search'],
        inputSchema: { type: 'object', properties: {} },
        handler: async () => ({}),
      });

      registry.register({
        name: 'get_project_blueprint',
        description: 'Get project structure',
        category: ToolRegistryModule.ToolCategory.Intelligence,
        tags: ['project', 'structure'],
        inputSchema: { type: 'object', properties: {} },
        handler: async () => ({}),
      });
    });

    it('should get tool by name', () => {
      const tool = registry.get('analyze_codebase');

      expect(tool).toBeDefined();
      expect(tool?.name).toBe('analyze_codebase');
      expect(tool?.description).toBe('Analyze code structure');
    });

    it('should return undefined for unknown tool', () => {
      const tool = registry.get('nonexistent');
      expect(tool).toBeUndefined();
    });

    it('should list all tools', () => {
      const tools = registry.listAll();

      expect(tools).toHaveLength(3);
      expect(tools.map((t) => t.name)).toContain('analyze_codebase');
      expect(tools.map((t) => t.name)).toContain('search_codebase');
      expect(tools.map((t) => t.name)).toContain('get_project_blueprint');
    });

    it('should filter tools by category', () => {
      const analysisTools = registry.listByCategory(
        ToolRegistryModule.ToolCategory.Analysis
      );

      expect(analysisTools).toHaveLength(1);
      expect(analysisTools[0].name).toBe('analyze_codebase');
    });

    it('should filter tools by tag', () => {
      const codeTools = registry.listByTag('code');

      expect(codeTools).toHaveLength(2);
      expect(codeTools.map((t) => t.name)).toContain('analyze_codebase');
      expect(codeTools.map((t) => t.name)).toContain('search_codebase');
    });

    it('should search tools by name pattern', () => {
      const results = registry.search('codebase');

      expect(results).toHaveLength(2);
      expect(results.map((t) => t.name)).toContain('analyze_codebase');
      expect(results.map((t) => t.name)).toContain('search_codebase');
    });

    it('should search tools by description', () => {
      const results = registry.search('structure');

      expect(results).toHaveLength(2);
      expect(results.map((t) => t.name)).toContain('analyze_codebase');
      expect(results.map((t) => t.name)).toContain('get_project_blueprint');
    });
  });

  describe('Tool Execution', () => {
    let registry: ToolRegistryModule.ToolRegistry;

    beforeEach(() => {
      registry = new ToolRegistryModule.ToolRegistry();
    });

    it('should execute tool handler', async () => {
      registry.register({
        name: 'test_tool',
        description: 'Test tool',
        category: ToolRegistryModule.ToolCategory.Utility,
        inputSchema: {
          type: 'object',
          properties: {
            value: { type: 'number' },
          },
          required: ['value'],
        },
        handler: async (args) => ({
          doubled: (args as { value: number }).value * 2,
        }),
      });

      const result = await registry.execute('test_tool', { value: 21 });

      expect(result).toEqual({ doubled: 42 });
    });

    it('should throw error for unknown tool execution', async () => {
      await expect(
        registry.execute('nonexistent', {})
      ).rejects.toThrow('Tool not found');
    });

    it('should validate inputs before execution', async () => {
      registry.register({
        name: 'validated_tool',
        description: 'Tool with validation',
        category: ToolRegistryModule.ToolCategory.Utility,
        inputSchema: {
          type: 'object',
          properties: {
            required_field: { type: 'string' },
          },
          required: ['required_field'],
        },
        handler: async () => ({ ok: true }),
      });

      await expect(
        registry.execute('validated_tool', {})
      ).rejects.toThrow('required_field');
    });
  });

  describe('MCP Integration', () => {
    let registry: ToolRegistryModule.ToolRegistry;

    beforeEach(() => {
      registry = new ToolRegistryModule.ToolRegistry();

      registry.register({
        name: 'analyze_codebase',
        description: 'Analyze code structure and patterns',
        category: ToolRegistryModule.ToolCategory.Analysis,
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Path to analyze' },
            includeFileContent: { type: 'boolean' },
          },
          required: ['path'],
        },
        handler: async () => ({}),
      });
    });

    it('should export tool definitions for MCP', () => {
      const mcpTools = registry.toMCPToolDefinitions();

      expect(mcpTools).toHaveLength(1);
      expect(mcpTools[0]).toMatchObject({
        name: 'analyze_codebase',
        description: 'Analyze code structure and patterns',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Path to analyze' },
            includeFileContent: { type: 'boolean' },
          },
          required: ['path'],
        },
      });
    });

    it('should create handler map for MCP server', () => {
      const handlers = registry.getHandlerMap();

      expect(handlers.get('analyze_codebase')).toBeDefined();
      expect(typeof handlers.get('analyze_codebase')).toBe('function');
    });
  });

  describe('Tool Metadata', () => {
    let registry: ToolRegistryModule.ToolRegistry;

    beforeEach(() => {
      registry = new ToolRegistryModule.ToolRegistry();
    });

    it('should store and retrieve tool version', () => {
      registry.register({
        name: 'versioned_tool',
        description: 'Tool with version',
        category: ToolRegistryModule.ToolCategory.Utility,
        version: '1.2.3',
        inputSchema: { type: 'object', properties: {} },
        handler: async () => ({}),
      });

      const tool = registry.get('versioned_tool');
      expect(tool?.version).toBe('1.2.3');
    });

    it('should mark tools as deprecated', () => {
      registry.register({
        name: 'old_tool',
        description: 'Old tool',
        category: ToolRegistryModule.ToolCategory.Utility,
        deprecated: true,
        deprecationMessage: 'Use new_tool instead',
        inputSchema: { type: 'object', properties: {} },
        handler: async () => ({}),
      });

      const tool = registry.get('old_tool');
      expect(tool?.deprecated).toBe(true);
      expect(tool?.deprecationMessage).toBe('Use new_tool instead');
    });

    it('should track tool dependencies', () => {
      registry.register({
        name: 'dependent_tool',
        description: 'Tool with dependencies',
        category: ToolRegistryModule.ToolCategory.Analysis,
        dependencies: ['base_tool', 'helper_tool'],
        inputSchema: { type: 'object', properties: {} },
        handler: async () => ({}),
      });

      const tool = registry.get('dependent_tool');
      expect(tool?.dependencies).toContain('base_tool');
      expect(tool?.dependencies).toContain('helper_tool');
    });
  });

  describe('Statistics', () => {
    let registry: ToolRegistryModule.ToolRegistry;

    beforeEach(() => {
      registry = new ToolRegistryModule.ToolRegistry();

      // Register tools in different categories
      registry.register({
        name: 'tool1',
        description: 'Tool 1',
        category: ToolRegistryModule.ToolCategory.Analysis,
        inputSchema: { type: 'object', properties: {} },
        handler: async () => ({}),
      });

      registry.register({
        name: 'tool2',
        description: 'Tool 2',
        category: ToolRegistryModule.ToolCategory.Analysis,
        inputSchema: { type: 'object', properties: {} },
        handler: async () => ({}),
      });

      registry.register({
        name: 'tool3',
        description: 'Tool 3',
        category: ToolRegistryModule.ToolCategory.Search,
        inputSchema: { type: 'object', properties: {} },
        handler: async () => ({}),
      });
    });

    it('should return total tool count', () => {
      const stats = registry.getStats();
      expect(stats.totalTools).toBe(3);
    });

    it('should count tools by category', () => {
      const stats = registry.getStats();
      expect(stats.byCategory[ToolRegistryModule.ToolCategory.Analysis]).toBe(2);
      expect(stats.byCategory[ToolRegistryModule.ToolCategory.Search]).toBe(1);
    });

    it('should list all categories', () => {
      const stats = registry.getStats();
      expect(stats.categories).toContain(ToolRegistryModule.ToolCategory.Analysis);
      expect(stats.categories).toContain(ToolRegistryModule.ToolCategory.Search);
    });
  });

  describe('createToolRegistry factory', () => {
    it('should create a registry with pre-registered tools', () => {
      const registry = ToolRegistryModule.createToolRegistry([
        {
          name: 'tool1',
          description: 'Tool 1',
          category: ToolRegistryModule.ToolCategory.Utility,
          inputSchema: { type: 'object', properties: {} },
          handler: async () => ({}),
        },
        {
          name: 'tool2',
          description: 'Tool 2',
          category: ToolRegistryModule.ToolCategory.Utility,
          inputSchema: { type: 'object', properties: {} },
          handler: async () => ({}),
        },
      ]);

      expect(registry.has('tool1')).toBe(true);
      expect(registry.has('tool2')).toBe(true);
    });

    it('should create empty registry when no tools provided', () => {
      const registry = ToolRegistryModule.createToolRegistry();

      expect(registry.listAll()).toHaveLength(0);
    });
  });

  describe('ToolCategory enum', () => {
    it('should have Analysis category', () => {
      expect(ToolRegistryModule.ToolCategory.Analysis).toBeDefined();
    });

    it('should have Search category', () => {
      expect(ToolRegistryModule.ToolCategory.Search).toBeDefined();
    });

    it('should have Intelligence category', () => {
      expect(ToolRegistryModule.ToolCategory.Intelligence).toBeDefined();
    });

    it('should have Utility category', () => {
      expect(ToolRegistryModule.ToolCategory.Utility).toBeDefined();
    });

    it('should have Monitoring category', () => {
      expect(ToolRegistryModule.ToolCategory.Monitoring).toBeDefined();
    });
  });
});
