import { Email, EmailCategory, GeminiConfig, ReplyGeneration, RAGContext, AIProcessingConfig } from '../types';
export declare class AIService {
    private gemini;
    private config;
    private processingConfig;
    private rateLimiter;
    private categoryCache;
    private dailyQuotaTracker;
    private readonly RATE_LIMIT_PER_MINUTE;
    private readonly RATE_LIMIT_WINDOW;
    private readonly DAILY_QUOTA_LIMIT;
    private readonly HEALTH_CHECK_INTERVAL;
    private lastHealthCheck;
    private healthCheckCache;
    private readonly CATEGORIZATION_PROMPT;
    private readonly REPLY_PROMPT;
    constructor(config: GeminiConfig, processingConfig: AIProcessingConfig);
    /**
     * Categorize email using AI with intelligent caching and quota management
     */
    categorizeEmail(email: Email): Promise<EmailCategory>;
    /**
     * Batch categorize multiple emails for better performance
     */
    categorizeEmailsBatch(emails: Email[]): Promise<Map<string, EmailCategory>>;
    /**
     * Generate reply suggestion using RAG context
     */
    generateReplySuggestion(email: Email, relevantContexts: RAGContext[]): Promise<ReplyGeneration>;
    /**
     * Extract key information from email for RAG context retrieval
     */
    extractEmailKeywords(email: Email): string[];
    /**
     * Analyze email sentiment (positive, negative, neutral)
     */
    analyzeEmailSentiment(email: Email): Promise<'positive' | 'negative' | 'neutral'>;
    /**
     * Check if email requires urgent response
     */
    checkUrgency(email: Email): Promise<boolean>;
    /**
     * Private helper methods
     */
    private sanitizeEmailBody;
    private calculateReplyConfidence;
    private delay;
    /**
     * Rate limiting to prevent API quota exhaustion
     */
    private enforceRateLimit;
    /**
     * Daily quota management
     */
    private resetDailyQuotaIfNeeded;
    private incrementDailyQuota;
    private isDailyQuotaExceeded;
    /**
     * Simple keyword-based categorization to reduce API calls
     */
    private simpleKeywordCategorization;
    /**
     * Generate cache key for email categorization
     */
    private generateCacheKey;
    /**
     * Health check for Gemini API with caching
     */
    healthCheck(): Promise<boolean>;
    /**
     * Get current configuration
     */
    getConfig(): {
        gemini: GeminiConfig;
        processing: AIProcessingConfig;
    };
    /**
     * Update processing configuration
     */
    updateProcessingConfig(config: Partial<AIProcessingConfig>): void;
    /**
     * Temporarily disable AI categorization due to rate limits
     */
    disableCategorization(): void;
    /**
     * Re-enable AI categorization
     */
    enableCategorization(): void;
    /**
     * Get current rate limit status
     */
    getRateLimitStatus(): {
        callCount: number;
        lastCall: number;
        limit: number;
    };
    /**
     * Get daily quota status
     */
    getDailyQuotaStatus(): {
        calls: number;
        limit: number;
        date: string;
    };
    /**
     * Clear cache to free memory
     */
    clearCache(): void;
}
//# sourceMappingURL=AIService.d.ts.map