# Incremental Integration Design

## Overview

Integrate standalone modules into the main codebase in four phases, maintaining backwards compatibility and test coverage throughout.

## Phase A: Interface Implementation

**Goal:** Make engines implement their interfaces for dependency injection and testability.

### Changes

1. **SemanticEngine** (`src/engines/semantic-engine.ts`)
   - Import `ISemanticEngine` from `../interfaces/engines.js`
   - Add `implements ISemanticEngine` to class declaration
   - Ensure all interface methods are implemented with correct signatures
   - Export both the class and interface

2. **PatternEngine** (`src/engines/pattern-engine.ts`)
   - Import `IPatternEngine` from `../interfaces/engines.js`
   - Add `implements IPatternEngine` to class declaration
   - Ensure all interface methods are implemented with correct signatures

3. **SQLiteDatabase** (`src/storage/sqlite-db.ts`)
   - Import `IStorageProvider` from `../interfaces/engines.js`
   - Add `implements IStorageProvider` to class declaration
   - Verify existing methods match interface signatures

4. **Server/Tools** (`src/mcp-server/`)
   - Update type annotations to use interface types where applicable
   - This enables future mock injection for testing

### Verification
- All existing tests must pass
- No runtime behavior changes
- Type checking must pass

---

## Phase B: Tool Registry Integration

**Goal:** Migrate MCP server to use ToolRegistry for organized tool management.

### Changes

1. **Create tool registration module** (`src/mcp-server/tool-definitions.ts`)
   - Import ToolRegistry, ToolCategory from `./tool-registry.js`
   - Create `registerAllTools(registry, tools)` function
   - Categorize tools: Analysis, Search, Intelligence, Monitoring, Automation

2. **Update server.ts**
   - Import and instantiate ToolRegistry
   - Replace manual tool array with `registry.toMCPToolDefinitions()`
   - Replace switch/case tool handler with `registry.execute()`
   - Maintain error handling and validation

3. **Benefits**
   - Tool discovery by category
   - Centralized tool metadata
   - Easier to add/remove tools
   - Foundation for tool search/filtering

### Verification
- All MCP tool calls work identically
- Tool listing returns same tools
- Existing integration tests pass

---

## Phase C: Repository Integration

**Goal:** Replace direct SQL access with repository pattern for cleaner data access.

### Changes

1. **Create DatabaseAdapter wrapper** (`src/storage/database-adapter.ts`)
   - Wrap SQLiteDatabase to match `DatabaseAdapter` interface
   - Async wrapper methods for query, execute, get, all, run

2. **Wire repositories into SQLiteDatabase**
   - Instantiate IntelligenceRepository, PatternRepository, ConceptRepository
   - Expose via getter methods or direct properties
   - Repositories share the same database connection

3. **Update services to use repositories**
   - `learning-service.ts`: Use IntelligenceRepository for status tracking
   - `intelligence-tools.ts`: Use repositories for data queries
   - Gradually migrate direct SQL calls to repository methods

4. **Benefits**
   - Clean separation of data access logic
   - Easier to test with mock repositories
   - Centralized query logic

### Verification
- All data operations work correctly
- No data loss or corruption
- Performance remains acceptable

---

## Phase D: Learning Pipeline Integration

**Goal:** Integrate LearningPipeline into learning-service for better progress UX.

### Changes

1. **Update LearningService** (`src/services/learning-service.ts`)
   - Import LearningPipeline, createLearningPipeline
   - Create pipeline instance with stage handlers
   - Map existing learning logic to pipeline stages:
     - Initialization: Setup, validation
     - FileDiscovery: Find source files
     - Parsing: Parse files with Rust engine
     - ConceptExtraction: Extract semantic concepts
     - PatternDetection: Detect code patterns
     - Indexing: Index for search
     - Completion: Finalize, update status

2. **Wire progress callbacks**
   - Connect pipeline progress to existing progress tracking
   - Emit progress events for UI consumption

3. **Add cancellation support**
   - Expose cancel() method on learning service
   - Check cancellation between stages

4. **Benefits**
   - Clear stage-based progress reporting
   - Cancellable long-running operations
   - Better error handling with stage context

### Verification
- Learning completes successfully
- Progress is reported accurately
- Cancellation works mid-operation
- All learning tests pass

---

## Integration Order Rationale

1. **Interfaces first** - No runtime changes, just type annotations. Safe foundation.
2. **Tool Registry second** - Contained to MCP layer, doesn't affect core logic.
3. **Repositories third** - Data layer changes are isolated, easy to test.
4. **Learning Pipeline last** - Most complex, benefits from earlier integrations.

Each phase is independently committable and testable.
