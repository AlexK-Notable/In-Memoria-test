# FFI Thread Safety Guide

This document describes the thread safety guarantees and constraints for all Rust-TypeScript FFI operations in In-Memoria.

## Overview

In-Memoria uses Rust native modules (via NAPI-RS) for performance-critical operations:
- **SemanticAnalyzer**: AST parsing and semantic concept extraction
- **PatternLearningEngine**: Pattern discovery and learning

Both components are exposed to TypeScript through NAPI bindings. Understanding their thread safety characteristics is essential for correct usage.

## Thread Safety Model

### NAPI Serialization

The Rust FFI classes use standard `#[napi]` bindings (not `#[napi(thread_safe)]`), which means:

1. **JavaScript event loop serialization**: All calls from JavaScript are serialized through Node.js's event loop
2. **No concurrent Rust execution**: Two JavaScript async operations on the same instance will NOT execute concurrently in Rust
3. **Instance isolation**: Different instances are completely independent

This design choice prioritizes simplicity and correctness over maximum concurrency.

### Rust Internal State

Both `SemanticAnalyzer` and `PatternLearningEngine`:
- Use `&mut self` (exclusive mutable access) for state-modifying methods
- Maintain internal `HashMap` collections for accumulated state
- Do NOT use explicit synchronization primitives (Mutex/RwLock)

This means the types are NOT `Send + Sync` in the Rust sense, but this is acceptable because NAPI handles thread safety at the JavaScript boundary.

## Safe Operations

### Concurrent Read-Only Analysis (Different Instances)

```typescript
// SAFE: Different analyzer instances operate independently
const analyzer1 = new SemanticAnalyzer();
const analyzer2 = new SemanticAnalyzer();

// These can run concurrently without issues
await Promise.all([
  analyzer1.analyzeFileContent('file1.ts', content1),
  analyzer2.analyzeFileContent('file2.ts', content2),
]);
```

### Sequential Operations (Same Instance)

```typescript
// SAFE: Operations on same instance are serialized by Node.js event loop
const analyzer = new SemanticAnalyzer();

// These execute sequentially (NAPI serialization)
await analyzer.analyzeCodebase('/path/to/project');
await analyzer.analyzeFileContent('file.ts', content);
```

### Independent Engine Usage

```typescript
// SAFE: SemanticEngine and PatternEngine maintain separate Rust instances
const semanticEngine = new SemanticEngine(db, vectorDb);
const patternEngine = new PatternEngine(db);

// These operate on independent Rust instances
await Promise.all([
  semanticEngine.learnFromCodebase(path),
  patternEngine.learnFromCodebase(path),
]);
```

## Unsafe Operations

### reset() During Active Analysis

```typescript
// UNSAFE: reset() should not be called while analysis is in progress
const analyzer = new SemanticAnalyzer();

// Anti-pattern - DO NOT DO THIS
const analysisPromise = analyzer.learnFromCodebase(path);
analyzer.reset(); // May cause undefined behavior!
await analysisPromise;
```

**Why it's unsafe**: While NAPI serializes JavaScript calls, calling `reset()` while an async operation is pending creates a race condition. The pending operation may complete after reset, leading to inconsistent state.

**Correct pattern**:
```typescript
// SAFE: Wait for analysis to complete before reset
const analyzer = new SemanticAnalyzer();
await analyzer.learnFromCodebase(path);
analyzer.reset(); // Safe: no pending operations
```

### Sharing Rust Instances Across Worker Threads

```typescript
// UNSAFE: Do not share Rust instances across Worker threads
// Worker threads bypass NAPI serialization guarantees
```

**Why it's unsafe**: NAPI's thread safety model assumes all access comes from the main JavaScript thread. Worker threads can bypass this, leading to data races.

**Correct pattern**:
```typescript
// SAFE: Create new instances in each Worker
// main.ts
const worker = new Worker('./worker.js');

// worker.js
const analyzer = new SemanticAnalyzer(); // New instance per worker
```

### Concurrent State Modification

```typescript
// UNSAFE: Rapid fire mutations without awaiting
const learner = new PatternLearner();

// Anti-pattern - DO NOT DO THIS
learner.updateFromChange(change1); // Not awaited!
learner.updateFromChange(change2); // Race condition!
```

**Why it's unsafe**: Without awaiting, you lose ordering guarantees.

**Correct pattern**:
```typescript
// SAFE: Always await state-modifying operations
const learner = new PatternLearner();
await learner.updateFromChange(change1);
await learner.updateFromChange(change2);
```

## Operation Categories

### Thread-Safe Operations

| Operation | Class | Notes |
|-----------|-------|-------|
| `analyzeCodebase()` | SemanticAnalyzer | Read-heavy, safe for concurrent instances |
| `analyzeFileContent()` | SemanticAnalyzer | Accumulates state internally |
| `learnFromCodebase()` | Both | Long-running, creates significant state |
| `getConceptRelationships()` | SemanticAnalyzer | Read-only query |
| `getStats()` | Both | Read-only, returns current state |
| `analyzePatterns()` | PatternLearningEngine | Read-only analysis |
| `predictApproach()` | PatternLearningEngine | Read-only prediction |

### State-Modifying Operations (Require Sequential Access)

| Operation | Class | Notes |
|-----------|-------|-------|
| `reset()` | Both | Clears all accumulated state |
| `updateFromAnalysis()` | SemanticAnalyzer | Updates internal knowledge |
| `learnFromChanges()` | PatternLearningEngine | Incremental learning |
| `updateFromChange()` | PatternLearningEngine | Pattern updates |

## Best Practices

### 1. Use the Engine Wrappers

The TypeScript engine classes (`SemanticEngine`, `PatternEngine`) provide additional safety:

- Circuit breaker pattern for failure handling
- Lazy initialization
- Automatic fallback to TypeScript implementations
- Progress callbacks with cleanup

```typescript
// Recommended: Use engine wrappers instead of raw Rust bindings
import { SemanticEngine } from './engines/semantic-engine.js';

const engine = new SemanticEngine(database, vectorDB);
await engine.learnFromCodebase(path);
```

### 2. Lifecycle Management

```typescript
// Create instance at start
const engine = new SemanticEngine(db, vectorDb);

// Use throughout session
await engine.learnFromCodebase(path);
const concepts = await engine.analyzeFileContent(file, content);

// Clean up at end
engine.cleanup();
```

### 3. Memory Management with reset()

Call `reset()` between analysis sessions to prevent unbounded memory growth:

```typescript
// After completing a learning session
await engine.learnFromCodebase(projectA);
// ... use results ...

// Before starting new session, reset to free memory
rustAnalyzer.reset();

// Start fresh session
await engine.learnFromCodebase(projectB);
```

### 4. Error Handling

```typescript
try {
  await engine.learnFromCodebase(path);
} catch (error) {
  // Engine handles fallback automatically
  // Check for degraded mode if needed
  const stats = engine.getCacheStats();
}
```

## Runtime Assertions

The engine wrappers include runtime protections:

1. **Timeout protection**: Long-running operations have 5-minute timeouts
2. **Circuit breaker**: Fails fast after repeated Rust failures
3. **Cache invalidation**: Caches are cleared appropriately
4. **Progress cleanup**: Intervals are always cleared to prevent hangs

## Technical Details

### Why Not Use Mutex/RwLock in Rust?

1. **NAPI already serializes**: Adding Rust-level locks would be redundant overhead
2. **Async complexity**: Rust async + Mutex can cause deadlocks
3. **Simplicity**: The current model is easier to reason about

### Why Not Use thread_safe Attribute?

The `#[napi(thread_safe)]` attribute would allow true concurrent Rust execution, but:

1. Would require wrapping all state in `Arc<Mutex<T>>`
2. Higher complexity and overhead
3. Current usage patterns don't require it

### Memory Model

```
JavaScript Thread          NAPI Layer              Rust
     |                        |                     |
   call() -----------------> serialize ----------> &mut self
     |                        |                     |
   await <------------------ future <------------ async result
     |                        |                     |
   call() -----------------> serialize ----------> &mut self
```

## Version History

| Version | Changes |
|---------|---------|
| 1.0.0   | Initial thread safety documentation |
| 1.1.0   | Added reset() and getStats() methods (Task 2D) |
