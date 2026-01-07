import { Surreal } from 'surrealdb';
import * as SurrealNodeModule from '@surrealdb/node';
import { pipeline } from '@xenova/transformers';
import { Logger } from '../utils/logger.js';
import { withRetry, RetryPresets } from '../utils/retry.js';

export interface CodeMetadata {
  id: string;
  filePath: string;
  functionName?: string;
  className?: string;
  language: string;
  complexity: number;
  lineCount: number;
  lastModified: Date;
}

export interface SemanticSearchResult {
  id: string;
  code: string;
  metadata: CodeMetadata;
  similarity: number;
}

interface CodeDocument {
  id?: string;
  code: string;
  embedding?: number[];
  metadata: CodeMetadata;
  created: Date;
  updated: Date;
  [key: string]: unknown;
}

/**
 * Type for embedding pipeline from @xenova/transformers.
 * Uses a callable interface since the pipeline returns a function-like object.
 */
interface EmbeddingPipeline {
  (text: string, options?: { pooling?: string; normalize?: boolean }): Promise<{ data: Float32Array | number[] }>;
  dispose?: () => Promise<void>;
}

export class SemanticVectorDB {
  private db: Surreal;
  private initialized: boolean = false;
  private localEmbeddingPipeline: EmbeddingPipeline | null = null;
  private embeddingInitPromise: Promise<void> | null = null;

  // Real vector operations with caching
  private embeddingCache = new Map<string, number[]>();
  private readonly EMBEDDING_CACHE_SIZE = 1000;
  private readonly LOCAL_EMBEDDING_DIMENSION = 384; // All-MiniLM-L6-v2 dimension

  // Embedding progress tracking
  private hasLoggedEmbeddingStart = false;

  // Security: Allowlist of valid filter keys to prevent injection attacks
  private static readonly ALLOWED_FILTER_KEYS = new Set([
    'filePath', 'language', 'conceptType', 'patternType',
    'framework', 'projectPath', 'fileHash', 'functionName',
    'className', 'complexity', 'lineCount'
  ]);

  constructor(apiKey?: string) {
    // SurrealDB module type assertion required due to dynamic engine loading
    // The @surrealdb/node module dynamically provides engines but lacks proper type exports
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.db = new Surreal({ engines: (SurrealNodeModule as any).surrealdbNodeEngines() });

    // Validate API key if provided
    const providedKey = apiKey || process.env.OPENAI_API_KEY;
    if (providedKey) {
      const validationResult = SemanticVectorDB.validateApiKey(providedKey);
      if (!validationResult.valid) {
        Logger.warn(`OpenAI API key validation warning: ${validationResult.message}`);
        Logger.info('Continuing with local embeddings (Xenova transformers)');
      } else {
        Logger.info('OpenAI API key format validated (local embeddings will still be used)');
      }
    }

    // Store promise so we can await initialization later if needed
    this.embeddingInitPromise = this.initializeLocalEmbeddings();
  }

  /**
   * Validate OpenAI API key format.
   * Returns validation result with message.
   */
  static validateApiKey(key: string | undefined): { valid: boolean; message: string } {
    if (!key) {
      return { valid: false, message: 'API key is undefined or empty' };
    }

    // OpenAI API key formats:
    // - Legacy: sk-[48 alphanumeric chars] (51 chars total)
    // - Project: sk-proj-[variable length alphanumeric and dashes]
    // - Service accounts: sk-svcacct-[variable length]
    const legacyPattern = /^sk-[a-zA-Z0-9]{32,}$/;
    const projectPattern = /^sk-proj-[a-zA-Z0-9_-]{32,}$/;
    const servicePattern = /^sk-svcacct-[a-zA-Z0-9_-]{32,}$/;

    if (legacyPattern.test(key) || projectPattern.test(key) || servicePattern.test(key)) {
      return { valid: true, message: 'API key format is valid' };
    }

    return {
      valid: false,
      message: 'API key format appears invalid. Expected sk-..., sk-proj-..., or sk-svcacct-... pattern'
    };
  }

  /**
   * Wait for embedding pipeline to be ready.
   * Call this before operations that require embeddings.
   */
  async waitForEmbeddingReady(): Promise<boolean> {
    if (this.embeddingInitPromise) {
      await this.embeddingInitPromise;
    }
    return this.localEmbeddingPipeline !== null;
  }

  /**
   * Initialize local embedding pipeline using transformers.js
   */
  private async initializeLocalEmbeddings(): Promise<void> {
    try {
      Logger.info('🔧 Initializing local embedding pipeline...');
      // Use all-MiniLM-L6-v2 for quality local embeddings
      const embeddingPipeline = await pipeline(
        'feature-extraction',
        'Xenova/all-MiniLM-L6-v2'
      );
      // Cast to our interface type
      this.localEmbeddingPipeline = embeddingPipeline as unknown as EmbeddingPipeline;
      Logger.info('✅ Local embedding pipeline ready');
    } catch (error: unknown) {
      Logger.warn('⚠️  Failed to initialize local embeddings:', error instanceof Error ? error.message : String(error));
      Logger.info('📝 Will use fallback local embedding method');
      this.localEmbeddingPipeline = null;
    }
  }

  async initialize(collectionName: string = 'in-memoria'): Promise<void> {
    try {
      // Use SurrealKV for persistent storage of vector embeddings
      // IMPORTANT: Requires SURREAL_SYNC_DATA=true for crash safety
      const dbPath = process.env.IN_MEMORIA_VECTOR_DB_PATH || 'in-memoria-vectors.db';

      // Wrap database connection with retry logic for transient connection issues
      await withRetry(
        async () => {
          await this.db.connect(`surrealkv://${dbPath}`);
        },
        RetryPresets.database,
        'VectorDB.connect'
      );

      // Use database and namespace with retry
      await withRetry(
        async () => {
          await this.db.use({
            namespace: 'in_memoria',
            database: collectionName
          });
        },
        RetryPresets.database,
        'VectorDB.use'
      );

      // Define the code documents table with full-text search capabilities
      // Schema definition is idempotent, so retry is safe
      await withRetry(
        async () => {
          await this.db.query(`
            DEFINE ANALYZER code_analyzer TOKENIZERS blank FILTERS lowercase,ascii;
            DEFINE TABLE code_documents SCHEMAFULL;
            DEFINE FIELD code ON code_documents TYPE string;
            DEFINE FIELD embedding ON code_documents TYPE array;
            DEFINE FIELD metadata ON code_documents TYPE object;
            DEFINE FIELD created ON code_documents TYPE datetime DEFAULT time::now();
            DEFINE FIELD updated ON code_documents TYPE datetime DEFAULT time::now();
            DEFINE INDEX code_content ON code_documents COLUMNS code SEARCH ANALYZER code_analyzer BM25(1.2,0.75) HIGHLIGHTS;
          `);
        },
        RetryPresets.database,
        'VectorDB.defineSchema'
      );

      this.initialized = true;
    } catch (error) {
      Logger.error('Failed to initialize SurrealDB:', error);
      throw error;
    }
  }

  async storeCodeEmbedding(code: string, metadata: CodeMetadata): Promise<void> {
    if (!this.initialized) {
      throw new Error('Vector database not initialized. Call initialize() first.');
    }

    const embedding = await this.generateEmbedding(code);
    const document: CodeDocument = {
      code,
      embedding,
      metadata,
      created: new Date(),
      updated: new Date()
    };

    // Wrap database write with retry for transient failures
    await withRetry(
      async () => {
        await this.db.create('code_documents', document);
      },
      RetryPresets.database,
      'VectorDB.storeCodeEmbedding'
    );
  }

  async storeMultipleEmbeddings(
    codeChunks: string[],
    metadataList: CodeMetadata[]
  ): Promise<void> {
    if (!this.initialized) {
      throw new Error('Vector database not initialized. Call initialize() first.');
    }

    if (codeChunks.length !== metadataList.length) {
      throw new Error('Code chunks and metadata arrays must have the same length');
    }

    const documents: CodeDocument[] = await Promise.all(
      codeChunks.map(async (code, index) => ({
        code,
        embedding: await this.generateEmbedding(code),
        metadata: metadataList[index],
        created: new Date(),
        updated: new Date()
      }))
    );

    // Insert multiple documents with retry for each document
    for (const doc of documents) {
      await withRetry(
        async () => {
          await this.db.create('code_documents', doc);
        },
        RetryPresets.database,
        'VectorDB.storeMultipleEmbeddings'
      );
    }
  }

  /**
   * Validate and sanitize filter keys against allowlist.
   * Returns only valid filters, logging warnings for invalid keys.
   */
  private validateFilters(filters: Record<string, any>): Record<string, any> {
    const validFilters: Record<string, any> = {};
    for (const [key, value] of Object.entries(filters)) {
      if (SemanticVectorDB.ALLOWED_FILTER_KEYS.has(key)) {
        validFilters[key] = value;
      } else {
        Logger.warn(`VectorDB: Ignoring invalid filter key "${key}" - not in allowlist`);
      }
    }
    return validFilters;
  }

  async findSimilarCode(
    query: string,
    limit: number = 5,
    filters?: Record<string, any>,
    options?: { threshold?: number }
  ): Promise<SemanticSearchResult[]> {
    if (!this.initialized) {
      throw new Error('Vector database not initialized. Call initialize() first.');
    }

    // Validate filters against allowlist to prevent injection
    const validFilters = filters ? this.validateFilters(filters) : undefined;
    const threshold = options?.threshold ?? 0.0; // Default: return all results

    if (!query || query.trim() === '') {
      // If no query, just return all documents matching filters
      let searchQuery = 'SELECT * FROM code_documents';
      const params: Record<string, any> = { limit };

      if (validFilters && Object.keys(validFilters).length > 0) {
        const filterConditions = Object.entries(validFilters)
          .map(([key, _]) => `metadata.${key} = $${key}`)
          .join(' AND ');
        searchQuery += ` WHERE ${filterConditions}`;
        Object.assign(params, validFilters);
      }

      searchQuery += ` LIMIT $limit`;

      // Wrap database query with retry for transient failures
      const results = await withRetry(
        async () => this.db.query(searchQuery, params),
        RetryPresets.embedding,
        'VectorDB.findSimilarCode.queryAll'
      );
      const documents = results[0] as any[] || [];

      return documents.map(doc => ({
        id: doc.id,
        code: doc.code,
        metadata: doc.metadata,
        similarity: 0.5 // Default similarity for non-search results
      }));
    }

    // Generate embedding for the query using the same method as stored documents
    const queryEmbedding = await this.generateEmbedding(query);

    // Retrieve all documents (with optional filters) and compute similarity in-memory
    // This is more reliable than depending on SurrealDB's vector functions
    let searchQuery = 'SELECT * FROM code_documents';
    const params: Record<string, any> = {};

    if (validFilters && Object.keys(validFilters).length > 0) {
      const filterConditions = Object.entries(validFilters)
        .map(([key, _]) => `metadata.${key} = $${key}`)
        .join(' AND ');
      searchQuery += ` WHERE ${filterConditions}`;
      Object.assign(params, validFilters);
    }

    // Wrap database query with retry for transient failures
    const results = await withRetry(
      async () => this.db.query(searchQuery, params),
      RetryPresets.embedding,
      'VectorDB.findSimilarCode.searchQuery'
    );
    const documents = results[0] as any[] || [];

    // Calculate cosine similarity for each document
    const scoredDocuments = documents
      .map(doc => {
        const docEmbedding = doc.embedding as number[] | undefined;
        let similarity = 0;

        if (docEmbedding && Array.isArray(docEmbedding) && docEmbedding.length > 0) {
          similarity = this.calculateCosineSimilarity(queryEmbedding, docEmbedding);
        }

        return {
          id: doc.id,
          code: doc.code,
          metadata: doc.metadata,
          similarity
        };
      })
      // Filter by threshold
      .filter(doc => doc.similarity >= threshold)
      // Sort by similarity descending (highest first)
      .sort((a, b) => b.similarity - a.similarity)
      // Limit results
      .slice(0, limit);

    return scoredDocuments;
  }

  async findSimilarCodeByFile(
    filePath: string,
    limit: number = 5
  ): Promise<SemanticSearchResult[]> {
    return this.findSimilarCode('', limit, { filePath });
  }

  async findSimilarCodeByLanguage(
    query: string,
    language: string,
    limit: number = 5
  ): Promise<SemanticSearchResult[]> {
    return this.findSimilarCode(query, limit, { language });
  }

  async updateCodeEmbedding(id: string, code: string, metadata: CodeMetadata): Promise<void> {
    if (!this.initialized) {
      throw new Error('Vector database not initialized. Call initialize() first.');
    }

    const embedding = await this.generateEmbedding(code);

    // Wrap database update with retry for transient failures
    await withRetry(
      async () => {
        await this.db.merge(id, {
          code,
          embedding,
          metadata,
          updated: new Date()
        });
      },
      RetryPresets.database,
      'VectorDB.updateCodeEmbedding'
    );
  }

  async deleteCodeEmbedding(id: string): Promise<void> {
    if (!this.initialized) {
      throw new Error('Vector database not initialized. Call initialize() first.');
    }

    // Wrap database delete with retry for transient failures
    await withRetry(
      async () => {
        await this.db.delete(id);
      },
      RetryPresets.database,
      'VectorDB.deleteCodeEmbedding'
    );
  }

  async deleteCodeEmbeddingsByFile(filePath: string): Promise<void> {
    if (!this.initialized) {
      throw new Error('Vector database not initialized. Call initialize() first.');
    }

    // Wrap database delete query with retry for transient failures
    await withRetry(
      async () => {
        await this.db.query('DELETE code_documents WHERE metadata.filePath = $filePath', {
          filePath
        });
      },
      RetryPresets.database,
      'VectorDB.deleteCodeEmbeddingsByFile'
    );
  }

  async getCollectionStats(): Promise<{ count: number; metadata: any }> {
    if (!this.initialized) {
      throw new Error('Vector database not initialized. Call initialize() first.');
    }

    // Wrap database query with retry for transient failures
    const result = await withRetry(
      async () => this.db.query('SELECT count() AS total FROM code_documents GROUP ALL'),
      RetryPresets.database,
      'VectorDB.getCollectionStats'
    );
    const count = Array.isArray(result) && Array.isArray(result[0]) && result[0][0] ? (result[0][0] as any).total || 0 : 0;

    return {
      count,
      metadata: {
        description: 'In Memoria semantic code embeddings',
        engine: 'SurrealDB'
      }
    };
  }

  // Generate semantic embeddings using the best available method
  private async generateEmbedding(text: string): Promise<number[]> {
    return this.generateRealSemanticEmbedding(text);
  }

  /**
   * Generate real semantic embeddings using local method
   */
  private async generateRealSemanticEmbedding(code: string): Promise<number[]> {
    // Check cache first
    const cacheKey = this.createCacheKey(code);
    if (this.embeddingCache.has(cacheKey)) {
      return this.embeddingCache.get(cacheKey)!;
    }

    // Log once at start of embedding process
    if (!this.hasLoggedEmbeddingStart) {
      Logger.info('🔧 Initializing local embedding pipeline...');
      this.hasLoggedEmbeddingStart = true;
    }

    // Use local embedding
    const embedding = await this.getLocalEmbedding(code);

    // Cache the result
    this.cacheEmbedding(cacheKey, embedding);
    return embedding;
  }

  /**
   * Get local embeddings using transformers.js or fallback method
   */
  private async getLocalEmbedding(code: string): Promise<number[]> {
    if (this.localEmbeddingPipeline) {
      try {
        const cleanCode = this.preprocessCodeForEmbedding(code);

        // Wrap embedding pipeline call with retry for transient failures
        // (model loading issues, memory pressure, etc.)
        const result = await withRetry(
          async () => this.localEmbeddingPipeline!(cleanCode, {
            pooling: 'mean',
            normalize: true
          }),
          RetryPresets.embedding,
          'VectorDB.getLocalEmbedding'
        );

        // Convert tensor to array
        const embedding = Array.from(result.data) as number[];
        return embedding;
      } catch (error: unknown) {
        Logger.warn('⚠️  Local embedding pipeline failed:', error instanceof Error ? error.message : String(error));
      }
    }

    // Fallback to advanced local method
    return this.generateAdvancedLocalEmbedding(code);
  }

  /**
   * Generate advanced local semantic embeddings using multiple techniques
   */
  private generateAdvancedLocalEmbedding(code: string): number[] {
    const embedding = new Array(this.LOCAL_EMBEDDING_DIMENSION).fill(0);

    // 1. Structural features (25%)
    const structural = this.extractStructuralFeatures(code);
    const structuralSize = Math.floor(this.LOCAL_EMBEDDING_DIMENSION * 0.25);
    for (let i = 0; i < Math.min(structuralSize, structural.length); i++) {
      embedding[i] = structural[i];
    }

    // 2. Semantic token features (35%)
    const semantic = this.extractSemanticFeatures(code);
    const semanticSize = Math.floor(this.LOCAL_EMBEDDING_DIMENSION * 0.35);
    for (let i = 0; i < Math.min(semanticSize, semantic.length); i++) {
      embedding[structuralSize + i] = semantic[i];
    }

    // 3. AST-based features (25%)
    const ast = this.extractASTFeatures(code);
    const astSize = Math.floor(this.LOCAL_EMBEDDING_DIMENSION * 0.25);
    const astStart = structuralSize + semanticSize;
    for (let i = 0; i < Math.min(astSize, ast.length); i++) {
      embedding[astStart + i] = ast[i];
    }

    // 4. Context features (15%)
    const context = this.extractContextFeatures(code);
    const contextSize = this.LOCAL_EMBEDDING_DIMENSION - astStart - astSize;
    const contextStart = astStart + astSize;
    for (let i = 0; i < Math.min(contextSize, context.length); i++) {
      embedding[contextStart + i] = context[i];
    }

    return this.normalizeVector(embedding);
  }

  /**
   * Extract structural code features
   */
  private extractStructuralFeatures(code: string): number[] {
    const features: number[] = [];

    // Function density
    const functions = (code.match(/function\s+\w+|const\s+\w+\s*=\s*(?:\([^)]*\)\s*=>|async\s*\([^)]*\)\s*=>)/g) || []).length;
    features.push(Math.min(functions / 10, 1));

    // Class density
    const classes = (code.match(/class\s+\w+/g) || []).length;
    features.push(Math.min(classes / 5, 1));

    // Import/export density
    const imports = (code.match(/import\s+.*from|export\s+/g) || []).length;
    features.push(Math.min(imports / 10, 1));

    // Async patterns
    const async = (code.match(/async\s+|await\s+|Promise/g) || []).length;
    features.push(Math.min(async / 8, 1));

    // Control flow complexity
    const control = (code.match(/if\s*\(|for\s*\(|while\s*\(|switch\s*\(/g) || []).length;
    features.push(Math.min(control / 15, 1));

    // Add more structural features up to 96
    const patterns = [
      /try\s*{|catch\s*\(/g,  // Error handling
      /\.\w+\s*\(/g,          // Method calls
      /{\s*\w+:/g,            // Object literals
      /\[\w*\]/g,             // Array access
      /=>\s*{/g,              // Arrow functions
      /interface\s+\w+/g,     // TypeScript interfaces
      /type\s+\w+/g,          // Type definitions
      /enum\s+\w+/g           // Enums
    ];

    for (const pattern of patterns) {
      const count = (code.match(pattern) || []).length;
      features.push(Math.min(count / 5, 1));
    }

    // Pad to 96 features
    while (features.length < 96) {
      features.push(0);
    }

    return features.slice(0, 96);
  }

  /**
   * Extract semantic token features
   */
  private extractSemanticFeatures(code: string): number[] {
    const features: number[] = [];
    const tokens = this.extractMeaningfulTokens(code);

    // Semantic categories with weights
    const categories = [
      { keywords: ['service', 'controller', 'model', 'view', 'component'], weight: 1.0 },
      { keywords: ['create', 'read', 'update', 'delete', 'get', 'set'], weight: 0.9 },
      { keywords: ['user', 'auth', 'login', 'token', 'session'], weight: 0.8 },
      { keywords: ['api', 'http', 'request', 'response', 'endpoint'], weight: 0.8 },
      { keywords: ['database', 'query', 'table', 'schema', 'migration'], weight: 0.7 },
      { keywords: ['test', 'spec', 'mock', 'assert', 'expect'], weight: 0.7 },
      { keywords: ['config', 'env', 'settings', 'options'], weight: 0.6 },
      { keywords: ['util', 'helper', 'common', 'shared', 'lib'], weight: 0.5 }
    ];

    for (const category of categories) {
      let categoryScore = 0;
      for (const keyword of category.keywords) {
        const count = tokens.filter(token =>
          token.toLowerCase().includes(keyword.toLowerCase())
        ).length;
        categoryScore += count * category.weight;
      }
      features.push(Math.min(categoryScore / 10, 1));
    }

    // TF-IDF like scoring for important programming terms
    const vocab = this.getProgrammingVocabulary();
    const tokenFreq = this.calculateTokenFrequency(tokens);

    for (const term of vocab.slice(0, 120)) { // Use top 120 terms
      const freq = tokenFreq.get(term.toLowerCase()) || 0;
      const tf = freq / tokens.length;
      features.push(Math.min(tf * 10, 1)); // Normalized TF
    }

    // Pad to 134 features
    while (features.length < 134) {
      features.push(0);
    }

    return features.slice(0, 134);
  }

  /**
   * Extract AST-based features
   */
  private extractASTFeatures(code: string): number[] {
    const features: number[] = [];

    // Declaration patterns
    const declarations = {
      variables: /(?:let|const|var)\s+\w+/g,
      functions: /function\s+\w+/g,
      classes: /class\s+\w+/g,
      interfaces: /interface\s+\w+/g
    };

    for (const [_, pattern] of Object.entries(declarations)) {
      const count = (code.match(pattern) || []).length;
      features.push(Math.min(count / 8, 1));
    }

    // Expression complexity
    const expressions = {
      assignments: /=\s*[^=]/g,
      comparisons: /[!=]==?|[<>]=?/g,
      logical: /&&|\|\|/g,
      arithmetic: /[+\-*/%]/g
    };

    for (const [_, pattern] of Object.entries(expressions)) {
      const count = (code.match(pattern) || []).length;
      features.push(Math.min(count / 20, 1));
    }

    // Nesting depth estimation
    let maxDepth = 0;
    let currentDepth = 0;
    for (const char of code) {
      if (char === '{') currentDepth++;
      if (char === '}') currentDepth--;
      maxDepth = Math.max(maxDepth, currentDepth);
    }
    features.push(Math.min(maxDepth / 8, 1));

    // Pad to 96 features
    while (features.length < 96) {
      features.push(0);
    }

    return features.slice(0, 96);
  }

  /**
   * Extract contextual features
   */
  private extractContextFeatures(code: string): number[] {
    const features: number[] = [];

    // Code quality indicators
    const comments = (code.match(/\/\/.*|\/\*[\s\S]*?\*\//g) || []).join('').length;
    features.push(Math.min(comments / code.length, 1)); // Comment density

    const strings = (code.match(/"[^"]*"|'[^']*'|`[^`]*`/g) || []).join('').length;
    features.push(Math.min(strings / code.length, 0.5)); // String density

    // Line metrics
    const lines = code.split('\n').length;
    const avgLineLength = code.length / lines;
    features.push(Math.min(lines / 100, 1));
    features.push(Math.min(avgLineLength / 80, 1));

    // Domain-specific patterns
    const domains = {
      web: /http|url|fetch|ajax|xhr|dom|html|css/gi,
      database: /sql|query|select|insert|update|delete|join/gi,
      testing: /test|spec|describe|it|expect|assert|mock/gi,
      async: /async|await|promise|callback|then|catch/gi,
      security: /auth|encrypt|decrypt|hash|token|jwt|bcrypt/gi
    };

    for (const [_, pattern] of Object.entries(domains)) {
      const matches = (code.match(pattern) || []).length;
      features.push(Math.min(matches / 5, 1));
    }

    // Pad to 58 features
    while (features.length < 58) {
      features.push(0);
    }

    return features.slice(0, 58);
  }

  /**
   * Extract meaningful programming tokens
   */
  private extractMeaningfulTokens(code: string): string[] {
    // Remove comments and strings
    const cleanCode = code
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/["'`][^"'`]*["'`]/g, 'STRING');

    // Extract identifiers and keywords
    const tokens = cleanCode.match(/\b[a-zA-Z][a-zA-Z0-9_]*\b/g) || [];

    // Filter out very short tokens and common noise
    const noise = new Set(['a', 'an', 'the', 'is', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by']);
    return tokens
      .filter(token => token.length > 2)
      .filter(token => !noise.has(token.toLowerCase()));
  }

  /**
   * Get programming-specific vocabulary
   */
  private getProgrammingVocabulary(): string[] {
    return [
      'function', 'class', 'method', 'variable', 'constant', 'parameter', 'argument',
      'return', 'async', 'await', 'promise', 'callback', 'event', 'handler',
      'component', 'service', 'controller', 'model', 'view', 'router',
      'request', 'response', 'api', 'endpoint', 'middleware', 'auth',
      'database', 'query', 'select', 'insert', 'update', 'delete',
      'test', 'spec', 'mock', 'assert', 'expect', 'describe',
      'config', 'env', 'settings', 'options', 'params',
      'error', 'exception', 'try', 'catch', 'throw', 'finally',
      'loop', 'iteration', 'condition', 'branch', 'switch', 'case',
      'array', 'object', 'string', 'number', 'boolean', 'null',
      'import', 'export', 'module', 'require', 'include',
      'interface', 'type', 'generic', 'template', 'abstract',
      'static', 'private', 'public', 'protected', 'readonly',
      'constructor', 'destructor', 'extends', 'implements', 'super'
    ];
  }

  /**
   * Calculate token frequency
   */
  private calculateTokenFrequency(tokens: string[]): Map<string, number> {
    const freq = new Map<string, number>();
    for (const token of tokens) {
      const lower = token.toLowerCase();
      freq.set(lower, (freq.get(lower) || 0) + 1);
    }
    return freq;
  }

  /**
   * Preprocess code for embedding
   */
  private preprocessCodeForEmbedding(code: string): string {
    return code
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace(/\/\/.*$/gm, '') // Remove comments
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .trim()
      .substring(0, 8000); // Limit for API
  }

  /**
   * Create cache key from code
   */
  private createCacheKey(code: string): string {
    // Simple hash function
    let hash = 0;
    for (let i = 0; i < Math.min(code.length, 1000); i++) {
      const char = code.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString();
  }

  /**
   * Cache embedding with LRU eviction
   */
  private cacheEmbedding(key: string, embedding: number[]): void {
    if (this.embeddingCache.size >= this.EMBEDDING_CACHE_SIZE) {
      // Remove oldest entry
      const firstKey = this.embeddingCache.keys().next().value;
      if (firstKey !== undefined) {
        this.embeddingCache.delete(firstKey);
      }
    }
    this.embeddingCache.set(key, embedding);
  }

  /**
   * Calculate cosine similarity between two vectors.
   * Returns a value between -1 and 1, where 1 means identical direction.
   * For normalized vectors: cosine_similarity = dot(a, b)
   */
  private calculateCosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      Logger.warn(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
      return 0;
    }

    if (a.length === 0) {
      return 0;
    }

    // Calculate dot product and magnitudes
    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      magnitudeA += a[i] * a[i];
      magnitudeB += b[i] * b[i];
    }

    magnitudeA = Math.sqrt(magnitudeA);
    magnitudeB = Math.sqrt(magnitudeB);

    // Avoid division by zero
    if (magnitudeA === 0 || magnitudeB === 0) {
      return 0;
    }

    return dotProduct / (magnitudeA * magnitudeB);
  }

  /**
   * Normalize vector for cosine similarity
   */
  private normalizeVector(vector: number[]): number[] {
    const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    if (magnitude === 0) return vector;
    return vector.map(val => val / magnitude);
  }

  // Cleanup method
  async close(): Promise<void> {
    // Dispose of transformers.js pipeline to prevent hanging
    if (this.localEmbeddingPipeline) {
      try {
        // Check if the pipeline has a dispose method
        if (typeof this.localEmbeddingPipeline.dispose === 'function') {
          await this.localEmbeddingPipeline.dispose();
        }
        this.localEmbeddingPipeline = null;
      } catch (error) {
        Logger.warn('Warning: Failed to dispose local embedding pipeline:', error);
      }
    }

    // Close SurrealDB connection
    if (this.db) {
      await this.db.close();
    }
  }
}
