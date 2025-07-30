"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatService = void 0;
const { GoogleGenerativeAI } = require('@google/generative-ai');
const logger_1 = __importDefault(require("../utils/logger"));
const uuid_1 = require("uuid");
class ChatService {
    constructor(config, elasticsearchService) {
        this.sessions = new Map();
        this.config = config;
        this.elasticsearchService = elasticsearchService;
        this.gemini = new GoogleGenerativeAI(config.apiKey);
        logger_1.default.info('💬 Chat service initialized with Gemini');
    }
    /**
     * Start or continue a chat session
     */
    async chat(request) {
        try {
            // Get or create session
            let session = request.sessionId ? this.sessions.get(request.sessionId) : null;
            if (!session) {
                session = await this.createSession(request.emailIds || []);
            }
            // Add user message to session
            const userMessage = {
                id: (0, uuid_1.v4)(),
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
            // Create chat with Gemini
            const systemInstruction = this.buildSystemInstruction(emailContext);
            const model = this.gemini.getGenerativeModel({
                model: this.config.model,
                systemInstruction: systemInstruction,
            });
            const chat = model.startChat({
                history: chatHistory
            });
            const result = await chat.sendMessage(request.message);
            const response = result.response;
            // Create assistant message
            const assistantMessage = {
                id: (0, uuid_1.v4)(),
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
        }
        catch (error) {
            logger_1.default.error('❌ Failed to process chat request:', error);
            throw error;
        }
    }
    /**
     * Create a new chat session
     */
    async createSession(emailIds = []) {
        const session = {
            id: (0, uuid_1.v4)(),
            messages: [],
            createdAt: new Date(),
            updatedAt: new Date(),
            emailContext: emailIds
        };
        this.sessions.set(session.id, session);
        logger_1.default.info(`💬 Created new chat session: ${session.id}`);
        return session;
    }
    /**
     * Get email context for the chat
     */
    async getEmailContext(emailIds) {
        try {
            const emails = [];
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
        }
        catch (error) {
            logger_1.default.error('❌ Failed to get email context:', error);
            return 'Unable to retrieve email context.';
        }
    }
    /**
     * Build system instruction for the chat
     */
    buildSystemInstruction(emailContext) {
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
    generateSuggestedActions(session, emailIds) {
        const actions = [];
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
    async getSession(sessionId) {
        return this.sessions.get(sessionId) || null;
    }
    /**
     * Delete chat session
     */
    async deleteSession(sessionId) {
        const deleted = this.sessions.delete(sessionId);
        if (deleted) {
            logger_1.default.info(`🗑️ Deleted chat session: ${sessionId}`);
        }
        return deleted;
    }
    /**
     * Get all sessions for a user (simplified - no user management in this implementation)
     */
    async getSessions(limit = 10) {
        const sessions = Array.from(this.sessions.values())
            .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
            .slice(0, limit);
        return sessions;
    }
    /**
     * Clear old sessions (cleanup)
     */
    async cleanupOldSessions(maxAgeHours = 24) {
        const cutoffTime = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);
        let deletedCount = 0;
        for (const [sessionId, session] of this.sessions.entries()) {
            if (session.updatedAt < cutoffTime) {
                this.sessions.delete(sessionId);
                deletedCount++;
            }
        }
        if (deletedCount > 0) {
            logger_1.default.info(`🧹 Cleaned up ${deletedCount} old chat sessions`);
        }
        return deletedCount;
    }
    /**
     * Get chat statistics
     */
    getStats() {
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
    async healthCheck() {
        try {
            // Simple test to verify Gemini API is working
            const model = this.gemini.getGenerativeModel({ model: this.config.model });
            const result = await model.generateContent('Hello');
            const response = await result.response;
            return !!response.text();
        }
        catch (error) {
            logger_1.default.error('❌ Chat service health check failed:', error);
            return false;
        }
    }
    /**
     * Start automatic cleanup of old sessions
     */
    startCleanupSchedule(intervalHours = 6, maxAgeHours = 24) {
        setInterval(async () => {
            try {
                await this.cleanupOldSessions(maxAgeHours);
            }
            catch (error) {
                logger_1.default.error('❌ Failed to cleanup old chat sessions:', error);
            }
        }, intervalHours * 60 * 60 * 1000);
        logger_1.default.info(`🧹 Started chat session cleanup schedule (every ${intervalHours}h, max age ${maxAgeHours}h)`);
    }
}
exports.ChatService = ChatService;
//# sourceMappingURL=ChatService.js.map