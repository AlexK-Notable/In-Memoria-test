/**
 * Tool Definitions
 *
 * Registers all MCP tools with the ToolRegistry.
 * Bridges existing tool collections with the centralized registry.
 */

import { ToolRegistry, ToolCategory, ToolDefinition } from './tool-registry.js';
import type { CoreAnalysisTools } from './tools/core-analysis.js';
import type { IntelligenceTools } from './tools/intelligence-tools.js';
import type { AutomationTools } from './tools/automation-tools.js';
import type { MonitoringTools } from './tools/monitoring-tools.js';

/**
 * Tool collection interfaces for registration
 */
export interface ToolCollections {
  coreTools: CoreAnalysisTools;
  intelligenceTools: IntelligenceTools;
  automationTools: AutomationTools;
  monitoringTools: MonitoringTools;
}

/**
 * Tool name to category mapping
 */
const TOOL_CATEGORIES: Record<string, ToolCategory> = {
  // Core Analysis
  'analyze_codebase': ToolCategory.Analysis,
  'search_codebase': ToolCategory.Search,

  // Intelligence
  'learn_codebase_intelligence': ToolCategory.Intelligence,
  'get_semantic_insights': ToolCategory.Intelligence,
  'get_pattern_recommendations': ToolCategory.Intelligence,
  'predict_coding_approach': ToolCategory.Intelligence,
  'get_developer_profile': ToolCategory.Intelligence,
  'contribute_insights': ToolCategory.Intelligence,
  'get_project_blueprint': ToolCategory.Intelligence,

  // Automation
  'auto_learn_if_needed': ToolCategory.Automation,

  // Monitoring
  'get_system_status': ToolCategory.Monitoring,
  'get_intelligence_metrics': ToolCategory.Monitoring,
  'get_performance_status': ToolCategory.Monitoring,
  'health_check': ToolCategory.Monitoring,
};

/**
 * Maps tool names to their handler methods
 */
function createToolHandler(
  toolName: string,
  collections: ToolCollections
): (args: Record<string, unknown>) => Promise<unknown> {
  const { coreTools, intelligenceTools, automationTools, monitoringTools } = collections;

  switch (toolName) {
    // Core Analysis Tools
    case 'analyze_codebase':
      return (args) => coreTools.analyzeCodebase(args as Parameters<typeof coreTools.analyzeCodebase>[0]);
    case 'search_codebase':
      return (args) => coreTools.searchCodebase(args as Parameters<typeof coreTools.searchCodebase>[0]);

    // Intelligence Tools
    case 'learn_codebase_intelligence':
      return (args) => intelligenceTools.learnCodebaseIntelligence(args as Parameters<typeof intelligenceTools.learnCodebaseIntelligence>[0]);
    case 'get_semantic_insights':
      return (args) => intelligenceTools.getSemanticInsights(args as Parameters<typeof intelligenceTools.getSemanticInsights>[0]);
    case 'get_pattern_recommendations':
      return (args) => intelligenceTools.getPatternRecommendations(args as Parameters<typeof intelligenceTools.getPatternRecommendations>[0]);
    case 'predict_coding_approach':
      return (args) => intelligenceTools.predictCodingApproach(args as Parameters<typeof intelligenceTools.predictCodingApproach>[0]);
    case 'get_developer_profile':
      return (args) => intelligenceTools.getDeveloperProfile(args as Parameters<typeof intelligenceTools.getDeveloperProfile>[0]);
    case 'contribute_insights':
      return (args) => intelligenceTools.contributeInsights(args as Parameters<typeof intelligenceTools.contributeInsights>[0]);
    case 'get_project_blueprint':
      return (args) => intelligenceTools.getProjectBlueprint(args as Parameters<typeof intelligenceTools.getProjectBlueprint>[0]);

    // Automation Tools
    case 'auto_learn_if_needed':
      return (args) => automationTools.autoLearnIfNeeded(args as Parameters<typeof automationTools.autoLearnIfNeeded>[0]);

    // Monitoring Tools
    case 'get_system_status':
      return (args) => monitoringTools.getSystemStatus(args as Parameters<typeof monitoringTools.getSystemStatus>[0]);
    case 'get_intelligence_metrics':
      return (args) => monitoringTools.getIntelligenceMetrics(args as Parameters<typeof monitoringTools.getIntelligenceMetrics>[0]);
    case 'get_performance_status':
      return (args) => monitoringTools.getPerformanceStatus(args as Parameters<typeof monitoringTools.getPerformanceStatus>[0]);
    case 'health_check':
      return (args) => monitoringTools.healthCheck(args as Parameters<typeof monitoringTools.healthCheck>[0]);

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

/**
 * Register all tools from the collections into the registry
 *
 * @param registry - The tool registry to populate
 * @param collections - The tool collections containing handlers
 */
export function registerAllTools(
  registry: ToolRegistry,
  collections: ToolCollections
): void {
  const { coreTools, intelligenceTools, automationTools, monitoringTools } = collections;

  // Collect all tool definitions from collections
  const allToolDefs = [
    ...coreTools.tools,
    ...intelligenceTools.tools,
    ...automationTools.tools,
    ...monitoringTools.tools,
  ];

  // Register each tool with its handler
  for (const toolDef of allToolDefs) {
    const category = TOOL_CATEGORIES[toolDef.name] || ToolCategory.Utility;
    const handler = createToolHandler(toolDef.name, collections);

    const definition: ToolDefinition = {
      name: toolDef.name,
      description: toolDef.description || `Tool: ${toolDef.name}`,
      category,
      inputSchema: toolDef.inputSchema as ToolDefinition['inputSchema'],
      handler,
    };

    registry.register(definition);
  }
}

/**
 * Create a fully configured tool registry with all tools
 *
 * @param collections - The tool collections
 * @returns Configured ToolRegistry instance
 */
export function createConfiguredRegistry(collections: ToolCollections): ToolRegistry {
  const registry = new ToolRegistry();
  registerAllTools(registry, collections);
  return registry;
}
