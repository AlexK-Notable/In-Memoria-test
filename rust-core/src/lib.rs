#![deny(clippy::all)]

//! # In-Memoria Rust Core
//!
//! High-performance code analysis engine for semantic concept extraction and pattern learning.
//!
//! ## Thread Safety
//!
//! All NAPI-exported types use standard `#[napi]` bindings (not `#[napi(thread_safe)]`),
//! which means JavaScript calls are serialized through Node.js's event loop.
//!
//! **Key characteristics:**
//! - Different instances are completely independent and can be used concurrently from JavaScript
//! - All calls on a single instance are serialized by NAPI
//! - Types use `&mut self` and are NOT `Send + Sync`
//! - Do not share instances across Worker threads
//!
//! See `docs/FFI_THREAD_SAFETY.md` for detailed documentation.

// Note: napi-bindings are excluded during tests (not(test)) to avoid linker errors
// when running `cargo test`. NAPI bindings require Node.js runtime which isn't
// available in the test environment. Integration tests should use the built library.
#[cfg(all(feature = "napi-bindings", not(test)))]
use napi_derive::napi;
// Core modules  
pub mod types;
pub mod parsing;
pub mod extractors;
pub mod analysis;
pub mod patterns;

// Legacy modules (will be removed in future versions)
// pattern_learning has been fully ported to the patterns module

// Re-export core types and main structs for easy access
pub use types::*;
pub use analysis::{SemanticAnalyzer, ComplexityAnalyzer, RelationshipLearner, FrameworkDetector, BlueprintAnalyzer, AnalyzerStats};
pub use parsing::{ParserManager, TreeWalker, FallbackExtractor};
pub use patterns::{
    PatternLearningEngine, NamingPatternAnalyzer, StructuralPatternAnalyzer,
    ImplementationPatternAnalyzer, ApproachPredictor, LearnerStats
};

// Legacy re-exports (for backwards compatibility) 
pub use parsing::ParserManager as AstParser; // Backwards compatibility alias
pub use patterns::PatternLearner;
pub use patterns::PatternLearningEngine as LegacyPatternLearner;

#[cfg(all(feature = "napi-bindings", not(test)))]
#[napi]
pub fn init_core() -> String {
    "In Memoria Rust Core initialized".to_string()
}
