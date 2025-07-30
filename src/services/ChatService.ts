const { GoogleGenerativeAI } = require('@google/generative-ai');
import {
    ChatSession,
    ChatMessage,
    ChatRequest,
    ChatResponse,
    Email,
    GeminiConfig
} from '../types';
import { ElasticsearchService } from './ElasticsearchService';
import logger from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

export class ChatService {
    private gemini: any;
    private config: GeminiConfig;
    private elasticsearchService: ElasticsearchService;
    private sessions: Map<string, ChatSession> = new Map();
    private rateLimiter: { lastCall: number; callCount: number } = { lastCall: 0, callCount: 0 };
    private readonly RATE_LIMIT_PER_MINUTE = 20; // Lower limit for chat
    private readonly RATE_LIMIT_WINDOW = 60000; // 1 minute in ms

    constructor(config: GeminiConfig, elasticsearchService: ElasticsearchService) {
        this.config = config;
        this.elasticsearchService = elasticsearchService;

        this.gemini = new GoogleGenerativeAI(config.apiKey);

        logger.info('💬 Chat service initialized with Gemini');
    }

    /**
     * Start or continue a chat session
     */
    async chat(request: ChatRequest): Promise<ChatResponse> {
        try {
            // Get or create session
            let session = request.sessionId ? this.sessions.get(request.sessionId) : null;

            if (!session) {
                session = await this.createSession(request.emailIds || []);
            }

            // Add user message to session
            const userMessage: ChatMessage = {
                id: uuidv4(),
                role: 'user',
                content: request.message,
                timestamp: new Date(),
                ...(request.emailIds && { emailContext: request.emailIds })
            };

            session.messages.push(userMessage);

            // Get email context if provided
            let emailContext = '';
            if (request.emailIds && request.emailIds.length > 0) {
                emailContext = await this.getEmailContext(request.emailIds);
            }

            // Prepare chat history for Gemini
            const chatHistory = session.messages.map(msg => ({
                role: msg.role,
                parts: [{ text: msg.content }]
            }));

            // Enforce rate limiting before API call
            await this.enforceRateLimit();

            // Create chat with Gemini
            const systemInstruction = this.buildSystemInstruction(emailContext);

            // Use the configured model (gemini-2.5-pro)
            let modelName = this.config.model;

            const model = this.gemini.getGenerativeModel({
                model: modelName,
                systemInstruction: systemInstruction,
            });

            const chat = model.startChat({
                history: chatHistory
            });

            // Add timeout to prevent hanging
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Chat request timeout')), 15000); // 15 second timeout
            });

            const result = await Promise.race([
                chat.sendMessage(request.message),
                timeoutPromise
            ]);
            const response = result.response;

            // Create assistant message
            const assistantMessage: ChatMessage = {
                id: uuidv4(),
                role: 'model',
                content: response.text() || 'I apologize, but I couldn\'t generate a response.',
                timestamp: new Date(),
                ...(request.emailIds && { emailContext: request.emailIds })
            };

            session.messages.push(assistantMessage);
            session.updatedAt = new Date();

            // Update session in memory
            this.sessions.set(session.id, session);

            // Generate suggested actions based on the conversation
            const suggestedActions = this.generateSuggestedActions(session, request.emailIds);

            return {
                sessionId: session.id,
                message: assistantMessage,
                suggestedActions
            };
        } catch (error) {
            logger.error('❌ Failed to process chat request:', error);
            throw error;
        }
    }

    /**
     * Create a new chat session
     */
    private async createSession(emailIds: string[] = []): Promise<ChatSession> {
        const session: ChatSession = {
            id: uuidv4(),
            messages: [],
            createdAt: new Date(),
            updatedAt: new Date(),
            emailContext: emailIds
        };

        this.sessions.set(session.id, session);
        logger.info(`💬 Created new chat session: ${session.id}`);

        return session;
    }

    /**
     * Get email context for the chat
     */
    private async getEmailContext(emailIds: string[]): Promise<string> {
        try {
            const emails: Email[] = [];

            for (const emailId of emailIds) {
                const email = await this.elasticsearchService.getEmailById(emailId);
                if (email) {
                    emails.push(email);
                }
            }

            if (emails.length === 0) {
                return 'No email context provided.';
            }

            // Format emails for context
            return emails.map(email => {
                return `
Email ID: ${email.id}
From: ${email.from.map(f => `${f.name} <${f.address}>`).join(', ')}
To: ${email.to.map(t => `${t.name} <${t.address}>`).join(', ')}
Subject: ${email.subject}
Date: ${email.date.toLocaleString()}
Category: ${email.category}
Body: ${email.body.substring(0, 500)}${email.body.length > 500 ? '...' : ''}
${email.attachments.length > 0 ? `Attachments: ${email.attachments.length} file(s)` : ''}
        `.trim();
            }).join('\n\n---\n\n');
        } catch (error) {
            logger.error('❌ Failed to get email context:', error);
            return 'Unable to retrieve email context.';
        }
    }

    /**
     * Build system instruction for the chat
     */
    private buildSystemInstruction(emailContext: string): string {
        const baseInstruction = `
You are an intelligent email assistant helping users understand and manage their emails. You have access to the user's email data and can help them:

1. Analyze email content and sentiment
2. Summarize email conversations 
3. Suggest appropriate responses
4. Categorize and organize emails
5. Extract important information from emails
6. Answer questions about email content
7. Provide insights about email patterns and trends

Be helpful, concise, and professional. If you're unsure about something, say so rather than guessing.
    `.trim();

        if (emailContext) {
            return `${baseInstruction}\n\nEmail Context:\n${emailContext}`;
        }

        return baseInstruction;
    }

    /**
     * Generate suggested actions based on conversation context
     */
    private generateSuggestedActions(session: ChatSession, emailIds?: string[]): string[] {
        const actions: string[] = [];
        const lastMessage = session.messages[session.messages.length - 1];

        if (!lastMessage || lastMessage.role === 'user' || !lastMessage.content) {
            return actions;
        }

        const messageContent = lastMessage.content.toLowerCase();

        // Suggest actions based on response content
        if (messageContent.includes('reply') || messageContent.includes('respond')) {
            actions.push('Generate reply');
        }

        if (messageContent.includes('meeting') || messageContent.includes('schedule')) {
            actions.push('Schedule meeting');
        }

        if (messageContent.includes('important') || messageContent.includes('urgent')) {
            actions.push('Mark as important');
        }

        if (messageContent.includes('spam') || messageContent.includes('delete')) {
            actions.push('Move to spam');
        }

        if (emailIds && emailIds.length > 0) {
            actions.push('View email details');
            actions.push('Search similar emails');
        }

        // Default actions
        if (actions.length === 0) {
            actions.push('Ask another question', 'View email list');
        }

        return actions.slice(0, 4); // Limit to 4 suggestions
    }

    /**
     * Get chat session by ID
     */
    async getSession(sessionId: string): Promise<ChatSession | null> {
        return this.sessions.get(sessionId) || null;
    }

    /**
     * Delete chat session
     */
    async deleteSession(sessionId: string): Promise<boolean> {
        const deleted = this.sessions.delete(sessionId);
        if (deleted) {
            logger.info(`🗑️ Deleted chat session: ${sessionId}`);
        }
        return deleted;
    }

    /**
     * Get all sessions for a user (simplified - no user management in this implementation)
     */
    async getSessions(limit: number = 10): Promise<ChatSession[]> {
        const sessions = Array.from(this.sessions.values())
            .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
            .slice(0, limit);

        return sessions;
    }

    /**
     * Clear old sessions (cleanup)
     */
    async cleanupOldSessions(maxAgeHours: number = 24): Promise<number> {
        const cutoffTime = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);
        let deletedCount = 0;

        for (const [sessionId, session] of this.sessions.entries()) {
            if (session.updatedAt < cutoffTime) {
                this.sessions.delete(sessionId);
                deletedCount++;
            }
        }

        if (deletedCount > 0) {
            logger.info(`🧹 Cleaned up ${deletedCount} old chat sessions`);
        }

        return deletedCount;
    }

    /**
     * Get chat statistics
     */
    getStats(): {
        totalSessions: number;
        totalMessages: number;
        averageMessagesPerSession: number;
    } {
        const totalSessions = this.sessions.size;
        const totalMessages = Array.from(this.sessions.values())
            .reduce((sum, session) => sum + session.messages.length, 0);

        return {
            totalSessions,
            totalMessages,
            averageMessagesPerSession: totalSessions > 0 ? Math.round(totalMessages / totalSessions * 100) / 100 : 0
        };
    }

    /**
     * Health check for chat service
     */
    async healthCheck(): Promise<boolean> {
        try {
            // Simple test to verify Gemini API is working
            let modelName = this.config.model;

            const model = this.gemini.getGenerativeModel({ model: modelName });

            // Add timeout to prevent hanging
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Chat health check timeout')), 5000); // 5 second timeout
            });

            const result = await Promise.race([
                model.generateContent('Hello'),
                timeoutPromise
            ]);
            const response = await result.response;

            return !!response.text();
        } catch (error) {
            logger.error('❌ Chat service health check failed:', error);
            return false;
        }
    }

    /**
     * Rate limiting to prevent API quota exhaustion
     */
    private async enforceRateLimit(): Promise<void> {
        const now = Date.now();

        // Reset counter if window has passed
        if (now - this.rateLimiter.lastCall > this.RATE_LIMIT_WINDOW) {
            this.rateLimiter.callCount = 0;
            this.rateLimiter.lastCall = now;
        }

        // Check if we're at the limit
        if (this.rateLimiter.callCount >= this.RATE_LIMIT_PER_MINUTE) {
            const waitTime = this.RATE_LIMIT_WINDOW - (now - this.rateLimiter.lastCall);
            logger.warn(`⚠️ Chat rate limit reached, waiting ${waitTime}ms before next API call`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            this.rateLimiter.callCount = 0;
            this.rateLimiter.lastCall = Date.now();
        }

        this.rateLimiter.callCount++;
    }

    /**
     * Start automatic cleanup of old sessions
     */
    startCleanupSchedule(intervalHours: number = 6, maxAgeHours: number = 24): void {
        setInterval(async () => {
            try {
                await this.cleanupOldSessions(maxAgeHours);
            } catch (error) {
                logger.error('❌ Failed to cleanup old chat sessions:', error);
            }
        }, intervalHours * 60 * 60 * 1000);

        logger.info(`🧹 Started chat session cleanup schedule (every ${intervalHours}h, max age ${maxAgeHours}h)`);
    }
} 