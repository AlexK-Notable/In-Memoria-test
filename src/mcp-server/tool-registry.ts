/**
 * Tool Registry
 *
 * Provides organized management and discovery of MCP tools.
 * Supports tool registration, categorization, search, and execution.
 *
 * @example
 * ```typescript
 * import { ToolRegistry, ToolCategory, createToolRegistry } from './tool-registry.js';
 *
 * const registry = new ToolRegistry();
 *
 * registry.register({
 *   name: 'analyze_codebase',
 *   description: 'Analyze code structure',
 *   category: ToolCategory.Analysis,
 *   inputSchema: { type: 'object', properties: { path: { type: 'string' } } },
 *   handler: async (args) => analyzeCode(args.path),
 * });
 *
 * const result = await registry.execute('analyze_codebase', { path: '/src' });
 * ```
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Tool categories for organization
 */
export enum ToolCategory {
  /** Code analysis tools */
  Analysis = 'analysis',

  /** Search and discovery tools */
  Search = 'search',

  /** Intelligence and learning tools */
  Intelligence = 'intelligence',

  /** Utility tools */
  Utility = 'utility',

  /** Monitoring and status tools */
  Monitoring = 'monitoring',

  /** Automation tools */
  Automation = 'automation',
}

/**
 * JSON Schema for tool input
 */
export interface ToolInputSchema {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
}

/**
 * Tool handler function type
 */
export type ToolHandler<T = unknown> = (args: Record<string, unknown>) => Promise<T>;

/**
 * Tool definition for registration
 */
export interface ToolDefinition<T = unknown> {
  /** Unique tool name */
  name: string;

  /** Human-readable description */
  description: string;

  /** Tool category */
  category: ToolCategory;

  /** JSON Schema for input validation */
  inputSchema: ToolInputSchema;

  /** Tool handler function */
  handler: ToolHandler<T>;

  /** Optional tags for discovery */
  tags?: string[];

  /** Optional version string */
  version?: string;

  /** Whether the tool is deprecated */
  deprecated?: boolean;

  /** Deprecation message */
  deprecationMessage?: string;

  /** Tool dependencies (other tool names) */
  dependencies?: string[];
}

/**
 * Options for tool registration
 */
export interface RegisterOptions {
  /** Force overwrite if tool already exists */
  force?: boolean;
}

/**
 * MCP tool definition format
 */
export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: ToolInputSchema;
}

/**
 * Registry statistics
 */
export interface RegistryStats {
  /** Total number of registered tools */
  totalTools: number;

  /** Count by category */
  byCategory: Record<string, number>;

  /** List of categories with tools */
  categories: ToolCategory[];
}

// ============================================================================
// ToolRegistry Class
// ============================================================================

/**
 * Registry for managing MCP tools
 */
export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();

  /**
   * Register a new tool
   *
   * @param definition - Tool definition
   * @param options - Registration options
   * @throws Error if tool already registered (unless force is true)
   */
  register<T = unknown>(
    definition: ToolDefinition<T>,
    options: RegisterOptions = {}
  ): void {
    const { force = false } = options;

    if (this.tools.has(definition.name) && !force) {
      throw new Error(`Tool '${definition.name}' is already registered`);
    }

    this.tools.set(definition.name, definition as ToolDefinition);
  }

  /**
   * Unregister a tool
   *
   * @param name - Tool name
   * @returns True if tool was unregistered
   */
  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  /**
   * Check if a tool is registered
   *
   * @param name - Tool name
   * @returns True if tool exists
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Get a tool definition by name
   *
   * @param name - Tool name
   * @returns Tool definition or undefined
   */
  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  /**
   * List all registered tools
   *
   * @returns Array of tool definitions
   */
  listAll(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /**
   * List tools by category
   *
   * @param category - Tool category
   * @returns Array of tool definitions in the category
   */
  listByCategory(category: ToolCategory): ToolDefinition[] {
    return this.listAll().filter((tool) => tool.category === category);
  }

  /**
   * List tools by tag
   *
   * @param tag - Tag to filter by
   * @returns Array of tool definitions with the tag
   */
  listByTag(tag: string): ToolDefinition[] {
    return this.listAll().filter((tool) => tool.tags?.includes(tag));
  }

  /**
   * Search tools by name or description
   *
   * @param query - Search query
   * @returns Array of matching tool definitions
   */
  search(query: string): ToolDefinition[] {
    const lowerQuery = query.toLowerCase();

    return this.listAll().filter((tool) => {
      const nameMatch = tool.name.toLowerCase().includes(lowerQuery);
      const descMatch = tool.description.toLowerCase().includes(lowerQuery);
      return nameMatch || descMatch;
    });
  }

  /**
   * Execute a tool by name
   *
   * @param name - Tool name
   * @param args - Tool arguments
   * @returns Tool result
   * @throws Error if tool not found or validation fails
   */
  async execute<T = unknown>(
    name: string,
    args: Record<string, unknown>
  ): Promise<T> {
    const tool = this.tools.get(name);

    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }

    // Validate required fields
    this.validateInputs(tool, args);

    return tool.handler(args) as Promise<T>;
  }

  /**
   * Validate tool inputs against schema
   */
  private validateInputs(tool: ToolDefinition, args: Record<string, unknown>): void {
    const { inputSchema } = tool;

    if (inputSchema.required) {
      for (const field of inputSchema.required) {
        if (!(field in args)) {
          throw new Error(
            `Missing required field '${field}' for tool '${tool.name}'`
          );
        }
      }
    }
  }

  /**
   * Export tool definitions for MCP server
   *
   * @returns Array of MCP tool definitions
   */
  toMCPToolDefinitions(): MCPToolDefinition[] {
    return this.listAll().map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));
  }

  /**
   * Create a handler map for MCP server integration
   *
   * @returns Map of tool name to handler function
   */
  getHandlerMap(): Map<string, ToolHandler> {
    const handlers = new Map<string, ToolHandler>();

    for (const [name, tool] of this.tools) {
      handlers.set(name, tool.handler);
    }

    return handlers;
  }

  /**
   * Get registry statistics
   *
   * @returns Registry statistics
   */
  getStats(): RegistryStats {
    const byCategory: Record<string, number> = {};
    const categoriesSet = new Set<ToolCategory>();

    for (const tool of this.tools.values()) {
      byCategory[tool.category] = (byCategory[tool.category] || 0) + 1;
      categoriesSet.add(tool.category);
    }

    return {
      totalTools: this.tools.size,
      byCategory,
      categories: Array.from(categoriesSet),
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a tool registry with pre-registered tools
 *
 * @param tools - Initial tools to register
 * @returns Configured ToolRegistry instance
 */
export function createToolRegistry(
  tools: ToolDefinition[] = []
): ToolRegistry {
  const registry = new ToolRegistry();

  for (const tool of tools) {
    registry.register(tool);
  }

  return registry;
}
