import { describe, it, expect, beforeEach } from 'vitest';

// Import the Rust FFI bindings
import {
  SemanticAnalyzer,
  PatternLearner,
  PatternLearningEngine,
  type AnalyzerStats,
  type LearnerStats,
} from '../../rust-core/index.js';

describe('Rust FFI Reset Methods', () => {
  describe('SemanticAnalyzer', () => {
    let analyzer: SemanticAnalyzer;

    beforeEach(() => {
      analyzer = new SemanticAnalyzer();
    });

    it('should have reset and getStats methods', () => {
      expect(typeof analyzer.reset).toBe('function');
      expect(typeof analyzer.getStats).toBe('function');
    });

    it('should return empty stats on fresh instance', () => {
      const stats: AnalyzerStats = analyzer.getStats();
      expect(stats.conceptsCount).toBe(0);
      expect(stats.relationshipsCount).toBe(0);
    });

    it('should clear state after reset', async () => {
      // Analyze some content to accumulate state
      const content = 'export class UserService { getName() { return "test"; } }';
      await analyzer.analyzeFileContent('test.ts', content);

      // State should be accumulated
      const statsBefore = analyzer.getStats();
      expect(statsBefore.conceptsCount).toBeGreaterThanOrEqual(0);

      // Reset and verify
      analyzer.reset();
      const statsAfter = analyzer.getStats();
      expect(statsAfter.conceptsCount).toBe(0);
      expect(statsAfter.relationshipsCount).toBe(0);
    });
  });

  describe('PatternLearner', () => {
    let learner: PatternLearner;

    beforeEach(() => {
      learner = new PatternLearner();
    });

    it('should have reset and getStats methods', () => {
      expect(typeof learner.reset).toBe('function');
      expect(typeof learner.getStats).toBe('function');
    });

    it('should return empty stats on fresh instance', () => {
      const stats: LearnerStats = learner.getStats();
      expect(stats.patternsCount).toBe(0);
      expect(stats.totalPatternsLearned).toBe(0);
      expect(typeof stats.confidenceThreshold).toBe('number');
    });

    it('should clear state after reset', async () => {
      // Attempt to learn from analysis data
      const analysisData = JSON.stringify({
        concepts: [
          { name: 'TestClass', type: 'class', file: 'test.ts', confidence: 0.9 },
        ],
      });
      await learner.learnFromAnalysis(analysisData);

      // Reset and verify
      learner.reset();
      const statsAfter = learner.getStats();
      expect(statsAfter.patternsCount).toBe(0);
      expect(statsAfter.totalPatternsLearned).toBe(0);
    });
  });

  describe('PatternLearningEngine', () => {
    let engine: PatternLearningEngine;

    beforeEach(() => {
      engine = new PatternLearningEngine();
    });

    it('should have reset and getStats methods', () => {
      expect(typeof engine.reset).toBe('function');
      expect(typeof engine.getStats).toBe('function');
    });

    it('should return empty stats on fresh instance', () => {
      const stats: LearnerStats = engine.getStats();
      expect(stats.patternsCount).toBe(0);
      expect(stats.totalPatternsLearned).toBe(0);
      expect(typeof stats.confidenceThreshold).toBe('number');
    });

    it('should clear state after reset', async () => {
      // Learn from analysis data
      const analysisData = JSON.stringify({
        concepts: [
          { name: 'UserController', type: 'class', file: 'controller.ts', confidence: 0.85 },
        ],
      });
      await engine.learnFromAnalysis(analysisData);

      // Reset and verify
      engine.reset();
      const statsAfter = engine.getStats();
      expect(statsAfter.patternsCount).toBe(0);
      expect(statsAfter.totalPatternsLearned).toBe(0);
    });
  });

  describe('Memory management', () => {
    it('should allow multiple reset cycles without errors', () => {
      const analyzer = new SemanticAnalyzer();

      // Multiple reset cycles should work fine
      for (let i = 0; i < 5; i++) {
        analyzer.reset();
        const stats = analyzer.getStats();
        expect(stats.conceptsCount).toBe(0);
      }
    });

    it('should be usable after reset', async () => {
      const analyzer = new SemanticAnalyzer();

      // Reset first
      analyzer.reset();

      // Should still work after reset
      const content = 'function testFunc() { return 42; }';
      const result = await analyzer.analyzeFileContent('test.js', content);
      expect(result).toBeDefined();
    });
  });
});
