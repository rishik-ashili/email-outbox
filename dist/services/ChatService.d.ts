import { ChatSession, ChatRequest, ChatResponse, GeminiConfig } from '../types';
import { ElasticsearchService } from './ElasticsearchService';
export declare class ChatService {
    private gemini;
    private config;
    private elasticsearchService;
    private sessions;
    private rateLimiter;
    private readonly RATE_LIMIT_PER_MINUTE;
    private readonly RATE_LIMIT_WINDOW;
    constructor(config: GeminiConfig, elasticsearchService: ElasticsearchService);
    /**
     * Start or continue a chat session
     */
    chat(request: ChatRequest): Promise<ChatResponse>;
    /**
     * Create a new chat session
     */
    private createSession;
    /**
     * Get email context for the chat
     */
    private getEmailContext;
    /**
     * Build system instruction for the chat
     */
    private buildSystemInstruction;
    /**
     * Generate suggested actions based on conversation context
     */
    private generateSuggestedActions;
    /**
     * Get chat session by ID
     */
    getSession(sessionId: string): Promise<ChatSession | null>;
    /**
     * Delete chat session
     */
    deleteSession(sessionId: string): Promise<boolean>;
    /**
     * Get all sessions for a user (simplified - no user management in this implementation)
     */
    getSessions(limit?: number): Promise<ChatSession[]>;
    /**
     * Clear old sessions (cleanup)
     */
    cleanupOldSessions(maxAgeHours?: number): Promise<number>;
    /**
     * Get chat statistics
     */
    getStats(): {
        totalSessions: number;
        totalMessages: number;
        averageMessagesPerSession: number;
    };
    /**
     * Health check for chat service
     */
    healthCheck(): Promise<boolean>;
    /**
     * Rate limiting to prevent API quota exhaustion
     */
    private enforceRateLimit;
    /**
     * Start automatic cleanup of old sessions
     */
    startCleanupSchedule(intervalHours?: number, maxAgeHours?: number): void;
}
//# sourceMappingURL=ChatService.d.ts.map