import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

import { CoreAnalysisTools } from './tools/core-analysis.js';
import { IntelligenceTools } from './tools/intelligence-tools.js';
import { AutomationTools } from './tools/automation-tools.js';
import { MonitoringTools } from './tools/monitoring-tools.js';
import { SemanticEngine } from '../engines/semantic-engine.js';
import { PatternEngine } from '../engines/pattern-engine.js';
import { SQLiteDatabase } from '../storage/sqlite-db.js';
import { SemanticVectorDB } from '../storage/vector-db.js';
import { validateInput, VALIDATION_SCHEMAS } from './validation.js';
import { config } from '../config/config.js';
import { Logger } from '../utils/logger.js';
import { shutdownManager } from '../utils/shutdown-manager.js';
import { ToolRegistry } from './tool-registry.js';
import { createConfiguredRegistry } from './tool-definitions.js';

export class CodeCartographerMCP {
  private server: Server;
  private database!: SQLiteDatabase;
  private vectorDB!: SemanticVectorDB;
  private semanticEngine!: SemanticEngine;
  private patternEngine!: PatternEngine;
  private coreTools!: CoreAnalysisTools;
  private intelligenceTools!: IntelligenceTools;
  private automationTools!: AutomationTools;
  private monitoringTools!: MonitoringTools;
  private toolRegistry!: ToolRegistry;

  constructor() {
    this.server = new Server(
      {
        name: 'in-memoria',
        version: '0.6.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  private async initializeComponents(): Promise<void> {
    try {
      Logger.info('Initializing In Memoria components...');

      // Initialize storage using configuration management
      // Database path is determined by config based on the analyzed project
      const dbPath = config.getDatabasePath(); // Will use current directory as project path
      Logger.info(`Attempting to initialize database at: ${dbPath}`);

      try {
        this.database = new SQLiteDatabase(dbPath);
        Logger.info('SQLite database initialized successfully');
      } catch (dbError: unknown) {
        Logger.error('Failed to initialize SQLite database:', dbError);
        Logger.error('The MCP server will continue with limited functionality');
        throw new Error(`Database initialization failed: ${dbError instanceof Error ? dbError.message : String(dbError)}`);
      }

      this.vectorDB = new SemanticVectorDB(); // Uses local embeddings only
      Logger.info('Vector database initialized');

      // Initialize engines
      this.semanticEngine = new SemanticEngine(this.database, this.vectorDB);
      this.patternEngine = new PatternEngine(this.database);
      Logger.info('Analysis engines initialized');

      // Initialize tool collections
      this.coreTools = new CoreAnalysisTools(this.semanticEngine, this.patternEngine, this.database);
      this.intelligenceTools = new IntelligenceTools(
        this.semanticEngine,
        this.patternEngine,
        this.database,
        this.vectorDB // Pass shared vectorDB instance
      );
      this.automationTools = new AutomationTools(
        this.semanticEngine,
        this.patternEngine,
        this.database
      );
      this.monitoringTools = new MonitoringTools(
        this.semanticEngine,
        this.patternEngine,
        this.database,
        dbPath
      );
      Logger.info('Tool collections initialized');

      // Initialize tool registry with all tool collections
      this.toolRegistry = createConfiguredRegistry({
        coreTools: this.coreTools,
        intelligenceTools: this.intelligenceTools,
        automationTools: this.automationTools,
        monitoringTools: this.monitoringTools,
      });
      const stats = this.toolRegistry.getStats();
      Logger.info(`Tool registry initialized: ${stats.totalTools} tools in ${stats.categories.length} categories`);

      Logger.info('In Memoria components initialized successfully');
    } catch (error: unknown) {
      Logger.error('Failed to initialize In Memoria components:', error);
      Logger.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace available');
      throw error;
    }
  }

  private setupHandlers(): void {
    // List available tools (using registry for organized tool management)
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: this.toolRegistry.toMCPToolDefinitions()
      };
    });

    // Handle tool calls (using registry for centralized execution)
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        // Validate input using Zod schemas (if available)
        let validatedArgs = args ?? {};
        const schema = VALIDATION_SCHEMAS[name as keyof typeof VALIDATION_SCHEMAS];
        if (schema) {
          validatedArgs = validateInput(schema, validatedArgs, name);
        }

        // Check if tool exists
        if (!this.toolRegistry.has(name)) {
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Unknown tool: ${name}`
          );
        }

        // Execute via registry
        const result = await this.toolRegistry.execute(name, validatedArgs as Record<string, unknown>);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      } catch (error) {
        if (error instanceof McpError) {
          throw error;
        }

        throw new McpError(
          ErrorCode.InternalError,
          `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    });
  }

  public async routeToolCall(name: string, args: any): Promise<any> {
    // Validate input using Zod schemas
    const schema = VALIDATION_SCHEMAS[name as keyof typeof VALIDATION_SCHEMAS];
    if (schema) {
      args = validateInput(schema, args, name);
    }

    // Use registry for centralized tool execution
    if (!this.toolRegistry.has(name)) {
      throw new McpError(
        ErrorCode.MethodNotFound,
        `Unknown tool: ${name}`
      );
    }

    return await this.toolRegistry.execute(name, args);
  }

  async start(): Promise<void> {
    // Set environment variable to indicate MCP server mode
    process.env.MCP_SERVER = 'true';

    await this.initializeComponents();

    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    Logger.info('In Memoria MCP Server started');
  }

  /**
   * Get all registered tools (for testing and introspection)
   */
  getAllTools(): any[] {
    return this.toolRegistry.toMCPToolDefinitions();
  }

  /**
   * Get the tool registry (for advanced introspection)
   */
  getToolRegistry(): ToolRegistry {
    return this.toolRegistry;
  }

  /**
   * Initialize components for testing without starting transport
   */
  async initializeForTesting(): Promise<void> {
    await this.initializeComponents();
  }

  async stop(): Promise<void> {
    // Clean up semantic engine resources
    if (this.semanticEngine) {
      this.semanticEngine.cleanup();
    }

    // Close vector database
    if (this.vectorDB) {
      try {
        await this.vectorDB.close();
      } catch (error) {
        console.warn('Warning: Failed to close vector database:', error);
      }
    }

    // Close SQLite database
    if (this.database) {
      this.database.close();
    }

    // Close MCP server
    await this.server.close();
  }
}

// Export for CLI usage
export async function runServer(): Promise<void> {
  const server = new CodeCartographerMCP();

  // Register cleanup handlers with ShutdownManager
  shutdownManager.register('MCP Server', async () => {
    await server.stop();
  }, 10); // High priority - stop server first

  // Install signal handlers via ShutdownManager
  shutdownManager.installSignalHandlers();

  await server.start();
}
