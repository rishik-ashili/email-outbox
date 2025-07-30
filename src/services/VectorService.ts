import { Pinecone } from '@pinecone-database/pinecone';
import { GoogleGenerativeAI } from '@google/generative-ai';
import {
    RAGContext,
    Email,
    PineconeConfig
} from '../types';
import logger, { emailLogger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

// Interface for Gemini embeddings configuration
interface EmbeddingConfig {
    apiKey: string;
    model?: string;
}

interface VectorSearchResult {
    id: string;
    score: number;
    context: RAGContext;
}

interface EmbeddingCache {
    [key: string]: number[];
}

export class VectorService {
    private pinecone: Pinecone;
    private gemini: GoogleGenerativeAI;
    private indexName: string;
    private embeddingCache: EmbeddingCache = {};
    private isInitialized: boolean = false;
    private readonly EMBEDDING_MODEL = 'gemini-embedding-001'; // Correct Gemini embedding model
    private readonly VECTOR_DIMENSION = 1024; // Match your existing Pinecone index dimension
    private readonly TOP_K_RESULTS = 5; // Number of similar contexts to retrieve

    constructor(pineconeConfig: PineconeConfig, embeddingConfig: EmbeddingConfig) {
        this.pinecone = new Pinecone({
            apiKey: pineconeConfig.apiKey
        });

        this.gemini = new GoogleGenerativeAI(embeddingConfig.apiKey);

        this.indexName = pineconeConfig.index;

        logger.info('🧠 Vector service initialized (using separate embedding API key)');
    }

    /**
     * Initialize Pinecone index and seed with default contexts
     */
    async initialize(): Promise<void> {
        try {
            // Check if index exists
            logger.info(`🔍 Checking for existing Pinecone index: ${this.indexName}`);
            const indexList = await this.pinecone.listIndexes();
            const indexExists = (indexList as any).indexes?.some((index: any) => index.name === this.indexName);

            if (!indexExists) {
                logger.error(`❌ Pinecone index '${this.indexName}' not found. Please create it manually in the Pinecone console.`);
                logger.error('   1. Visit https://app.pinecone.io/');
                logger.error('   2. Create a serverless index with these settings:');
                logger.error(`      - Name: ${this.indexName}`);
                logger.error(`      - Dimensions: ${this.VECTOR_DIMENSION}`);
                logger.error('      - Metric: cosine');
                logger.error('      - Cloud: AWS, Region: us-east-1');

                // Don't throw error - let app continue without vector functionality
                logger.warn('⚠️ Continuing without vector search capabilities. RAG features will be disabled.');
                return;
            }

            // Verify the index is ready
            const indexDescription = await this.pinecone.describeIndex(this.indexName);
            if (indexDescription.status?.ready) {
                logger.info(`✅ Connected to existing Pinecone index: ${this.indexName}`);

                // Seed with default contexts if needed
                this.isInitialized = true;
                await this.seedDefaultContexts();

                this.isInitialized = true;
                logger.info('✅ Vector service initialized and ready');
            } else {
                logger.warn(`⚠️ Pinecone index '${this.indexName}' exists but is not ready yet`);
                logger.warn('⚠️ Continuing without vector search capabilities. Please wait for index to be ready.');
                return;
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);

            if (errorMessage.includes('Cannot create index') && errorMessage.includes('Serverless')) {
                logger.error('❌ Pinecone Error: Free tier requires serverless indexes. Please check your Pinecone setup:');
                logger.error('   1. Visit https://app.pinecone.io/ and verify your project');
                logger.error('   2. Ensure you have a valid API key');
                logger.error('   3. Check that your environment is set to "us-west1-gcp-free"');
                logger.error('   4. Consider creating the index manually in the Pinecone console');
            } else if (errorMessage.includes('403')) {
                logger.error('❌ Pinecone Authentication Error: Please check your API key and permissions');
            } else {
                logger.error('❌ Failed to initialize vector service:', error);
            }

            // Don't throw error - let app continue without RAG functionality
            logger.warn('⚠️ Continuing without vector search capabilities. RAG features will be disabled.');
            return;
        }
    }

    /**
     * Check if vector service is properly initialized and available
     */
    public isAvailable(): boolean {
        return this.isInitialized;
    }

    /**
     * Wait for Pinecone index to be ready
     */
    private async waitForIndexReady(): Promise<void> {
        const maxAttempts = 30;
        let attempts = 0;

        while (attempts < maxAttempts) {
            try {
                const indexStats = await this.pinecone.index(this.indexName).describeIndexStats();
                if (indexStats) {
                    logger.info('✅ Pinecone index is ready');
                    return;
                }
            } catch (error) {
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
    private async seedDefaultContexts(): Promise<void> {
        const defaultContexts: Omit<RAGContext, 'id' | 'embedding'>[] = [
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
        logger.info('🌱 Seeding default contexts...');

        for (const contextData of defaultContexts) {
            const context: RAGContext = {
                id: uuidv4(),
                ...contextData
            };

            await this.storeContext(context);
        }

        logger.info(`✅ Seeded ${defaultContexts.length} default contexts`);
    }

    /**
     * Generate embedding for text using OpenAI
     */
    async generateEmbedding(text: string): Promise<number[]> {
        // Check cache first
        const cacheKey = this.hashText(text);
        if (this.embeddingCache[cacheKey]) {
            // Get the embedding from the cache
            const cachedEmbedding = this.embeddingCache[cacheKey];
            // Ensure it's padded/truncated and then return it
            return this.padEmbeddingToDimension(cachedEmbedding, this.VECTOR_DIMENSION);
        }

        try {
            // Use the correct Gemini embedding API with specific dimension
            const model = this.gemini.getGenerativeModel({ model: this.EMBEDDING_MODEL });

            const result = await model.embedContent(text.replace(/\n/g, ' ').trim());

            const embedding = result.embedding.values;

            // Pad or truncate the new embedding to the correct dimension
            const finalEmbedding = this.padEmbeddingToDimension(embedding, this.VECTOR_DIMENSION);

            // Cache the final, correctly-dimensioned embedding
            this.embeddingCache[cacheKey] = finalEmbedding;

            return finalEmbedding;
        } catch (error) {
            logger.error('❌ Failed to generate embedding:', error);
            throw error;
        }
    }

    /**
     * Store context in vector database
     */
    async storeContext(context: RAGContext): Promise<void> {
        if (!this.isAvailable()) {
            logger.warn('⚠️ Vector service not available, skipping context storage');
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

            logger.debug(`🧠 Stored context: ${context.id} (${context.metadata.type})`);
        } catch (error) {
            logger.error('❌ Failed to store context:', error);
            throw error;
        }
    }

    /**
     * Search for relevant contexts based on email content
     */
    async searchContexts(query: string, topK: number = this.TOP_K_RESULTS): Promise<VectorSearchResult[]> {
        if (!this.isAvailable()) {
            logger.warn('⚠️ Vector service not available, returning empty search results');
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

            const results: VectorSearchResult[] = searchResponse.matches?.map(match => ({
                id: match.id,
                score: match.score || 0,
                context: {
                    id: match.id,
                    content: match.metadata?.content as string || '',
                    metadata: {
                        type: match.metadata?.type as string || '',
                        priority: match.metadata?.priority as 'high' | 'medium' | 'low' || 'medium',
                        tags: match.metadata?.tags as string[] || [],
                        createdAt: new Date(match.metadata?.createdAt as string || Date.now()),
                        updatedAt: new Date(match.metadata?.updatedAt as string || Date.now())
                    },
                    embedding: undefined // Don't include embedding in results
                }
            })) || [];

            logger.debug(`🔍 Found ${results.length} relevant contexts for query: "${query.substring(0, 50)}..."`);

            return results;
        } catch (error) {
            logger.error('❌ Failed to search contexts:', error);
            throw error;
        }
    }

    /**
     * Get relevant contexts for email reply generation
     */
    async getRelevantContextsForEmail(email: Email): Promise<RAGContext[]> {
        if (!this.isAvailable()) {
            logger.warn('⚠️ Vector service not available, returning empty contexts for email');
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

                if (priorityDiff !== 0) return priorityDiff;
                return b.score - a.score; // Higher score first
            });

            const contexts = relevantResults.map(result => result.context);
            const duration = Date.now() - startTime;

            emailLogger.ragQuery(email.id, contexts.length, duration);

            logger.debug(`🧠 Retrieved ${contexts.length} relevant contexts for email: ${email.subject}`);

            return contexts;
        } catch (error) {
            logger.error('❌ Failed to get relevant contexts for email:', error);
            return []; // Return empty array on error
        }
    }

    /**
     * Add new context from user input
     */
    async addContext(content: string, type: string, priority: 'high' | 'medium' | 'low' = 'medium', tags?: string[]): Promise<string> {
        const context: RAGContext = {
            id: uuidv4(),
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

        logger.info(`✅ Added new context: ${context.id} (${type})`);
        return context.id;
    }

    /**
     * Update existing context
     */
    async updateContext(id: string, updates: Partial<Omit<RAGContext, 'id'>>): Promise<void> {
        try {
            // First, get the existing context
            const existing = await this.getContextById(id);
            if (!existing) {
                throw new Error(`Context not found: ${id}`);
            }

            // Merge updates
            const updatedContext: RAGContext = {
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

            logger.info(`✅ Updated context: ${id}`);
        } catch (error) {
            logger.error('❌ Failed to update context:', error);
            throw error;
        }
    }

    /**
     * Delete context
     */
    async deleteContext(id: string): Promise<void> {
        try {
            const index = this.pinecone.index(this.indexName);
            await index.deleteOne(id);

            logger.info(`🗑️ Deleted context: ${id}`);
        } catch (error) {
            logger.error('❌ Failed to delete context:', error);
            throw error;
        }
    }

    /**
     * Get context by ID
     */
    async getContextById(id: string): Promise<RAGContext | null> {
        try {
            const index = this.pinecone.index(this.indexName);
            const response = await index.fetch([id]);

            const record = response.records?.[id];
            if (!record) return null;

            return {
                id: record.id,
                content: record.metadata?.content as string || '',
                metadata: {
                    type: record.metadata?.type as string || '',
                    priority: record.metadata?.priority as 'high' | 'medium' | 'low' || 'medium',
                    tags: record.metadata?.tags as string[] || [],
                    createdAt: new Date(record.metadata?.createdAt as string || Date.now()),
                    updatedAt: new Date(record.metadata?.updatedAt as string || Date.now())
                },
                embedding: record.values
            };
        } catch (error) {
            logger.error('❌ Failed to get context by ID:', error);
            return null;
        }
    }

    /**
     * List all contexts with pagination
     */
    async listContexts(limit: number = 50): Promise<RAGContext[]> {
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
                content: match.metadata?.content as string || '',
                metadata: {
                    type: match.metadata?.type as string || '',
                    priority: match.metadata?.priority as 'high' | 'medium' | 'low' || 'medium',
                    tags: match.metadata?.tags as string[] || [],
                    createdAt: new Date(match.metadata?.createdAt as string || Date.now()),
                    updatedAt: new Date(match.metadata?.updatedAt as string || Date.now())
                }
            })) || [];
        } catch (error) {
            logger.error('❌ Failed to list contexts:', error);
            return [];
        }
    }

    /**
     * Get vector database statistics
     */
    async getStats(): Promise<{ totalVectors: number; indexName: string; dimension: number }> {
        try {
            const index = this.pinecone.index(this.indexName);
            const stats = await index.describeIndexStats();

            return {
                totalVectors: stats.totalRecordCount || 0,
                indexName: this.indexName,
                dimension: this.VECTOR_DIMENSION
            };
        } catch (error) {
            logger.error('❌ Failed to get vector stats:', error);
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
    async healthCheck(): Promise<boolean> {
        if (!this.isAvailable()) {
            logger.warn('⚠️ Vector service not properly initialized');
            return false;
        }

        try {
            const stats = await this.getStats();
            return stats.totalVectors >= 0; // Even 0 vectors is a valid state
        } catch (error) {
            logger.error('❌ Vector service health check failed:', error);
            return false;
        }
    }

    /**
     * Clear embedding cache
     */
    clearCache(): void {
        this.embeddingCache = {};
        logger.info('🧹 Embedding cache cleared');
    }

    /**
     * Private utility methods
     */
    private hashText(text: string): string {
        // Simple hash function for caching
        let hash = 0;
        for (let i = 0; i < text.length; i++) {
            const char = text.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return hash.toString();
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Pad or truncate embedding to match the required dimension
     */
    private padEmbeddingToDimension(embedding: number[], targetDimension: number): number[] {
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