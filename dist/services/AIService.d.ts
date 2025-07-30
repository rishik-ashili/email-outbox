import { Email, EmailCategory, GeminiConfig, ReplyGeneration, RAGContext, AIProcessingConfig } from '../types';
export declare class AIService {
    private gemini;
    private config;
    private processingConfig;
    private readonly CATEGORIZATION_PROMPT;
    private readonly REPLY_PROMPT;
    constructor(config: GeminiConfig, processingConfig: AIProcessingConfig);
    /**
     * Categorize email using OpenAI
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
     * Health check for OpenAI API
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
}
//# sourceMappingURL=AIService.d.ts.map