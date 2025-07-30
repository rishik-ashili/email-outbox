import { RAGContext, Email, PineconeConfig } from '../types';
interface EmbeddingConfig {
    apiKey: string;
    model?: string;
}
interface VectorSearchResult {
    id: string;
    score: number;
    context: RAGContext;
}
export declare class VectorService {
    private pinecone;
    private gemini;
    private indexName;
    private embeddingCache;
    private isInitialized;
    private readonly EMBEDDING_MODEL;
    private readonly VECTOR_DIMENSION;
    private readonly TOP_K_RESULTS;
    constructor(pineconeConfig: PineconeConfig, embeddingConfig: EmbeddingConfig);
    /**
     * Initialize Pinecone index and seed with default contexts
     */
    initialize(): Promise<void>;
    /**
     * Check if vector service is properly initialized and available
     */
    isAvailable(): boolean;
    /**
     * Wait for Pinecone index to be ready
     */
    private waitForIndexReady;
    /**
     * Seed the vector database with default contexts as specified in blueprint
     */
    private seedDefaultContexts;
    /**
     * Generate embedding for text using OpenAI
     */
    generateEmbedding(text: string): Promise<number[]>;
    /**
     * Store context in vector database
     */
    storeContext(context: RAGContext): Promise<void>;
    /**
     * Search for relevant contexts based on email content
     */
    searchContexts(query: string, topK?: number): Promise<VectorSearchResult[]>;
    /**
     * Get relevant contexts for email reply generation
     */
    getRelevantContextsForEmail(email: Email): Promise<RAGContext[]>;
    /**
     * Add new context from user input
     */
    addContext(content: string, type: string, priority?: 'high' | 'medium' | 'low', tags?: string[]): Promise<string>;
    /**
     * Update existing context
     */
    updateContext(id: string, updates: Partial<Omit<RAGContext, 'id'>>): Promise<void>;
    /**
     * Delete context
     */
    deleteContext(id: string): Promise<void>;
    /**
     * Get context by ID
     */
    getContextById(id: string): Promise<RAGContext | null>;
    /**
     * List all contexts with pagination
     */
    listContexts(limit?: number): Promise<RAGContext[]>;
    /**
     * Get vector database statistics
     */
    getStats(): Promise<{
        totalVectors: number;
        indexName: string;
        dimension: number;
    }>;
    /**
     * Health check for vector service
     */
    healthCheck(): Promise<boolean>;
    /**
     * Clear embedding cache
     */
    clearCache(): void;
    /**
     * Private utility methods
     */
    private hashText;
    private delay;
    /**
     * Pad or truncate embedding to match the required dimension
     */
    private padEmbeddingToDimension;
}
export {};
//# sourceMappingURL=VectorService.d.ts.map