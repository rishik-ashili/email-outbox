"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.VectorService = void 0;
const pinecone_1 = require("@pinecone-database/pinecone");
const generative_ai_1 = require("@google/generative-ai");
const logger_1 = __importStar(require("../utils/logger"));
const uuid_1 = require("uuid");
class VectorService {
    constructor(pineconeConfig, embeddingConfig) {
        this.embeddingCache = {};
        this.isInitialized = false;
        this.EMBEDDING_MODEL = 'gemini-embedding-001'; // Correct Gemini embedding model
        this.VECTOR_DIMENSION = 1024; // Match your existing Pinecone index dimension
        this.TOP_K_RESULTS = 5; // Number of similar contexts to retrieve
        this.pinecone = new pinecone_1.Pinecone({
            apiKey: pineconeConfig.apiKey
        });
        this.gemini = new generative_ai_1.GoogleGenerativeAI(embeddingConfig.apiKey);
        this.indexName = pineconeConfig.index;
        logger_1.default.info('🧠 Vector service initialized (using separate embedding API key)');
    }
    /**
     * Initialize Pinecone index and seed with default contexts
     */
    async initialize() {
        try {
            // Check if index exists
            logger_1.default.info(`🔍 Checking for existing Pinecone index: ${this.indexName}`);
            const indexList = await this.pinecone.listIndexes();
            const indexExists = indexList.indexes?.some((index) => index.name === this.indexName);
            if (!indexExists) {
                logger_1.default.error(`❌ Pinecone index '${this.indexName}' not found. Please create it manually in the Pinecone console.`);
                logger_1.default.error('   1. Visit https://app.pinecone.io/');
                logger_1.default.error('   2. Create a serverless index with these settings:');
                logger_1.default.error(`      - Name: ${this.indexName}`);
                logger_1.default.error(`      - Dimensions: ${this.VECTOR_DIMENSION}`);
                logger_1.default.error('      - Metric: cosine');
                logger_1.default.error('      - Cloud: AWS, Region: us-east-1');
                // Don't throw error - let app continue without vector functionality
                logger_1.default.warn('⚠️ Continuing without vector search capabilities. RAG features will be disabled.');
                return;
            }
            // Verify the index is ready
            const indexDescription = await this.pinecone.describeIndex(this.indexName);
            if (indexDescription.status?.ready) {
                logger_1.default.info(`✅ Connected to existing Pinecone index: ${this.indexName}`);
                // Seed with default contexts if needed
                await this.seedDefaultContexts();
                this.isInitialized = true;
                logger_1.default.info('✅ Vector service initialized and ready');
            }
            else {
                logger_1.default.warn(`⚠️ Pinecone index '${this.indexName}' exists but is not ready yet`);
                logger_1.default.warn('⚠️ Continuing without vector search capabilities. Please wait for index to be ready.');
                return;
            }
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (errorMessage.includes('Cannot create index') && errorMessage.includes('Serverless')) {
                logger_1.default.error('❌ Pinecone Error: Free tier requires serverless indexes. Please check your Pinecone setup:');
                logger_1.default.error('   1. Visit https://app.pinecone.io/ and verify your project');
                logger_1.default.error('   2. Ensure you have a valid API key');
                logger_1.default.error('   3. Check that your environment is set to "us-west1-gcp-free"');
                logger_1.default.error('   4. Consider creating the index manually in the Pinecone console');
            }
            else if (errorMessage.includes('403')) {
                logger_1.default.error('❌ Pinecone Authentication Error: Please check your API key and permissions');
            }
            else {
                logger_1.default.error('❌ Failed to initialize vector service:', error);
            }
            // Don't throw error - let app continue without RAG functionality
            logger_1.default.warn('⚠️ Continuing without vector search capabilities. RAG features will be disabled.');
            return;
        }
    }
    /**
     * Check if vector service is properly initialized and available
     */
    isAvailable() {
        return this.isInitialized;
    }
    /**
     * Wait for Pinecone index to be ready
     */
    async waitForIndexReady() {
        const maxAttempts = 30;
        let attempts = 0;
        while (attempts < maxAttempts) {
            try {
                const indexStats = await this.pinecone.index(this.indexName).describeIndexStats();
                if (indexStats) {
                    logger_1.default.info('✅ Pinecone index is ready');
                    return;
                }
            }
            catch (error) {
                // Index might not be ready yet
            }
            attempts++;
            await this.delay(2000); // Wait 2 seconds
        }
        throw new Error('Pinecone index did not become ready in time');
    }
    /**
     * Seed the vector database with default contexts as specified in blueprint
     */
    async seedDefaultContexts() {
        const defaultContexts = [
            {
                content: "I am applying for a job position. If the lead is interested, share the meeting booking link: https://cal.com/example",
                metadata: {
                    type: "job_search",
                    priority: "high",
                    tags: ["job", "application", "meeting", "interview"],
                    createdAt: new Date(),
                    updatedAt: new Date()
                }
            },
            {
                content: "We offer software solutions. For interested leads, schedule a demo at https://calendly.com/demo",
                metadata: {
                    type: "sales",
                    priority: "medium",
                    tags: ["software", "demo", "product", "sales"],
                    createdAt: new Date(),
                    updatedAt: new Date()
                }
            },
            {
                content: "For project collaborations and partnerships, please use our project inquiry form at https://forms.company.com/partnership",
                metadata: {
                    type: "partnership",
                    priority: "medium",
                    tags: ["partnership", "collaboration", "project"],
                    createdAt: new Date(),
                    updatedAt: new Date()
                }
            },
            {
                content: "Our consulting services include strategy, implementation, and training. Book a consultation at https://calendly.com/consulting",
                metadata: {
                    type: "consulting",
                    priority: "high",
                    tags: ["consulting", "services", "strategy", "training"],
                    createdAt: new Date(),
                    updatedAt: new Date()
                }
            },
            {
                content: "For technical support and troubleshooting, please visit our support portal at https://support.company.com or create a ticket",
                metadata: {
                    type: "support",
                    priority: "low",
                    tags: ["support", "technical", "troubleshooting", "ticket"],
                    createdAt: new Date(),
                    updatedAt: new Date()
                }
            },
            {
                content: "We provide training workshops and educational sessions. Available slots can be viewed at https://training.company.com",
                metadata: {
                    type: "training",
                    priority: "medium",
                    tags: ["training", "education", "workshop", "learning"],
                    createdAt: new Date(),
                    updatedAt: new Date()
                }
            }
        ];
        // Skip checking for existing contexts during initialization to avoid circular dependency
        logger_1.default.info('🌱 Seeding default contexts...');
        for (const contextData of defaultContexts) {
            const context = {
                id: (0, uuid_1.v4)(),
                ...contextData
            };
            await this.storeContext(context);
        }
        logger_1.default.info(`✅ Seeded ${defaultContexts.length} default contexts`);
    }
    /**
     * Generate embedding for text using OpenAI
     */
    async generateEmbedding(text) {
        // Check cache first
        const cacheKey = this.hashText(text);
        if (this.embeddingCache[cacheKey]) {
            return this.embeddingCache[cacheKey];
        }
        try {
            // Use the correct Gemini embedding API with specific dimension
            const model = this.gemini.getGenerativeModel({ model: this.EMBEDDING_MODEL });
            const result = await model.embedContent(text.replace(/\n/g, ' ').trim());
            const embedding = result.embedding.values;
            // Cache the embedding
            this.embeddingCache[cacheKey] = embedding;
            return embedding;
        }
        catch (error) {
            logger_1.default.error('❌ Failed to generate embedding:', error);
            throw error;
        }
    }
    /**
     * Store context in vector database
     */
    async storeContext(context) {
        if (!this.isAvailable()) {
            logger_1.default.warn('⚠️ Vector service not available, skipping context storage');
            return;
        }
        try {
            // Generate embedding if not provided
            if (!context.embedding) {
                context.embedding = await this.generateEmbedding(context.content);
            }
            const index = this.pinecone.index(this.indexName);
            await index.upsert([{
                    id: context.id,
                    values: context.embedding,
                    metadata: {
                        content: context.content,
                        type: context.metadata.type,
                        priority: context.metadata.priority,
                        tags: context.metadata.tags || [],
                        createdAt: context.metadata.createdAt.toISOString(),
                        updatedAt: context.metadata.updatedAt.toISOString()
                    }
                }]);
            logger_1.default.debug(`🧠 Stored context: ${context.id} (${context.metadata.type})`);
        }
        catch (error) {
            logger_1.default.error('❌ Failed to store context:', error);
            throw error;
        }
    }
    /**
     * Search for relevant contexts based on email content
     */
    async searchContexts(query, topK = this.TOP_K_RESULTS) {
        if (!this.isAvailable()) {
            logger_1.default.warn('⚠️ Vector service not available, returning empty search results');
            return [];
        }
        try {
            const queryEmbedding = await this.generateEmbedding(query);
            const index = this.pinecone.index(this.indexName);
            const searchResponse = await index.query({
                vector: queryEmbedding,
                topK,
                includeMetadata: true
            });
            const results = searchResponse.matches?.map(match => ({
                id: match.id,
                score: match.score || 0,
                context: {
                    id: match.id,
                    content: match.metadata?.content || '',
                    metadata: {
                        type: match.metadata?.type || '',
                        priority: match.metadata?.priority || 'medium',
                        tags: match.metadata?.tags || [],
                        createdAt: new Date(match.metadata?.createdAt || Date.now()),
                        updatedAt: new Date(match.metadata?.updatedAt || Date.now())
                    },
                    embedding: undefined // Don't include embedding in results
                }
            })) || [];
            logger_1.default.debug(`🔍 Found ${results.length} relevant contexts for query: "${query.substring(0, 50)}..."`);
            return results;
        }
        catch (error) {
            logger_1.default.error('❌ Failed to search contexts:', error);
            throw error;
        }
    }
    /**
     * Get relevant contexts for email reply generation
     */
    async getRelevantContextsForEmail(email) {
        if (!this.isAvailable()) {
            logger_1.default.warn('⚠️ Vector service not available, returning empty contexts for email');
            return [];
        }
        const startTime = Date.now();
        try {
            // Combine subject and body for better context matching
            const emailContent = `${email.subject} ${email.body}`.trim();
            // Search for relevant contexts
            const searchResults = await this.searchContexts(emailContent);
            // Filter results by relevance score (threshold: 0.7)
            const relevantResults = searchResults.filter(result => result.score > 0.7);
            // Sort by priority and score
            relevantResults.sort((a, b) => {
                const priorityOrder = { high: 3, medium: 2, low: 1 };
                const priorityDiff = priorityOrder[b.context.metadata.priority] - priorityOrder[a.context.metadata.priority];
                if (priorityDiff !== 0)
                    return priorityDiff;
                return b.score - a.score; // Higher score first
            });
            const contexts = relevantResults.map(result => result.context);
            const duration = Date.now() - startTime;
            logger_1.emailLogger.ragQuery(email.id, contexts.length, duration);
            logger_1.default.debug(`🧠 Retrieved ${contexts.length} relevant contexts for email: ${email.subject}`);
            return contexts;
        }
        catch (error) {
            logger_1.default.error('❌ Failed to get relevant contexts for email:', error);
            return []; // Return empty array on error
        }
    }
    /**
     * Add new context from user input
     */
    async addContext(content, type, priority = 'medium', tags) {
        const context = {
            id: (0, uuid_1.v4)(),
            content,
            metadata: {
                type,
                priority,
                tags: tags || [],
                createdAt: new Date(),
                updatedAt: new Date()
            }
        };
        await this.storeContext(context);
        logger_1.default.info(`✅ Added new context: ${context.id} (${type})`);
        return context.id;
    }
    /**
     * Update existing context
     */
    async updateContext(id, updates) {
        try {
            // First, get the existing context
            const existing = await this.getContextById(id);
            if (!existing) {
                throw new Error(`Context not found: ${id}`);
            }
            // Merge updates
            const updatedContext = {
                ...existing,
                ...updates,
                id,
                metadata: {
                    ...existing.metadata,
                    ...updates.metadata,
                    updatedAt: new Date()
                }
            };
            // Re-generate embedding if content changed
            if (updates.content && updates.content !== existing.content) {
                updatedContext.embedding = await this.generateEmbedding(updates.content);
            }
            await this.storeContext(updatedContext);
            logger_1.default.info(`✅ Updated context: ${id}`);
        }
        catch (error) {
            logger_1.default.error('❌ Failed to update context:', error);
            throw error;
        }
    }
    /**
     * Delete context
     */
    async deleteContext(id) {
        try {
            const index = this.pinecone.index(this.indexName);
            await index.deleteOne(id);
            logger_1.default.info(`🗑️ Deleted context: ${id}`);
        }
        catch (error) {
            logger_1.default.error('❌ Failed to delete context:', error);
            throw error;
        }
    }
    /**
     * Get context by ID
     */
    async getContextById(id) {
        try {
            const index = this.pinecone.index(this.indexName);
            const response = await index.fetch([id]);
            const record = response.records?.[id];
            if (!record)
                return null;
            return {
                id: record.id,
                content: record.metadata?.content || '',
                metadata: {
                    type: record.metadata?.type || '',
                    priority: record.metadata?.priority || 'medium',
                    tags: record.metadata?.tags || [],
                    createdAt: new Date(record.metadata?.createdAt || Date.now()),
                    updatedAt: new Date(record.metadata?.updatedAt || Date.now())
                },
                embedding: record.values
            };
        }
        catch (error) {
            logger_1.default.error('❌ Failed to get context by ID:', error);
            return null;
        }
    }
    /**
     * List all contexts with pagination
     */
    async listContexts(limit = 50) {
        try {
            const index = this.pinecone.index(this.indexName);
            const stats = await index.describeIndexStats();
            if (!stats.totalRecordCount || stats.totalRecordCount === 0) {
                return [];
            }
            // Use a dummy query to get all contexts (not ideal for large datasets)
            const dummyEmbedding = new Array(this.VECTOR_DIMENSION).fill(0);
            const response = await index.query({
                vector: dummyEmbedding,
                topK: Math.min(limit, 100),
                includeMetadata: true
            });
            return response.matches?.map(match => ({
                id: match.id,
                content: match.metadata?.content || '',
                metadata: {
                    type: match.metadata?.type || '',
                    priority: match.metadata?.priority || 'medium',
                    tags: match.metadata?.tags || [],
                    createdAt: new Date(match.metadata?.createdAt || Date.now()),
                    updatedAt: new Date(match.metadata?.updatedAt || Date.now())
                }
            })) || [];
        }
        catch (error) {
            logger_1.default.error('❌ Failed to list contexts:', error);
            return [];
        }
    }
    /**
     * Get vector database statistics
     */
    async getStats() {
        try {
            const index = this.pinecone.index(this.indexName);
            const stats = await index.describeIndexStats();
            return {
                totalVectors: stats.totalRecordCount || 0,
                indexName: this.indexName,
                dimension: this.VECTOR_DIMENSION
            };
        }
        catch (error) {
            logger_1.default.error('❌ Failed to get vector stats:', error);
            return {
                totalVectors: 0,
                indexName: this.indexName,
                dimension: this.VECTOR_DIMENSION
            };
        }
    }
    /**
     * Health check for vector service
     */
    async healthCheck() {
        if (!this.isAvailable()) {
            logger_1.default.warn('⚠️ Vector service not properly initialized');
            return false;
        }
        try {
            const stats = await this.getStats();
            return stats.totalVectors >= 0; // Even 0 vectors is a valid state
        }
        catch (error) {
            logger_1.default.error('❌ Vector service health check failed:', error);
            return false;
        }
    }
    /**
     * Clear embedding cache
     */
    clearCache() {
        this.embeddingCache = {};
        logger_1.default.info('🧹 Embedding cache cleared');
    }
    /**
     * Private utility methods
     */
    hashText(text) {
        // Simple hash function for caching
        let hash = 0;
        for (let i = 0; i < text.length; i++) {
            const char = text.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return hash.toString();
    }
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    /**
     * Pad or truncate embedding to match the required dimension
     */
    padEmbeddingToDimension(embedding, targetDimension) {
        if (embedding.length === targetDimension) {
            return embedding;
        }
        if (embedding.length > targetDimension) {
            // Truncate if embedding is larger than target
            return embedding.slice(0, targetDimension);
        }
        // Pad with zeros if embedding is smaller than target
        const padded = [...embedding];
        while (padded.length < targetDimension) {
            padded.push(0);
        }
        return padded;
    }
}
exports.VectorService = VectorService;
//# sourceMappingURL=VectorService.js.map