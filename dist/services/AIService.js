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
exports.AIService = void 0;
const { GoogleGenerativeAI } = require('@google/generative-ai');
const logger_1 = __importStar(require("../utils/logger"));
class AIService {
    constructor(config, processingConfig) {
        // Exact categorization prompt as specified in blueprint
        this.CATEGORIZATION_PROMPT = `
Analyze this email and categorize it into EXACTLY one of these categories:
- Interested: Shows genuine interest in product/service/opportunity
- Meeting Booked: About scheduling/confirming meetings or calls
- Not Interested: Explicit decline or disinterest
- Spam: Promotional, suspicious, or irrelevant content
- Out of Office: Auto-reply indicating unavailability

Email Subject: {subject}
Email Body: {body}

Respond with ONLY the category name, nothing else.
  `.trim();
        // Reply generation prompt template
        this.REPLY_PROMPT = `
Based on the following email and relevant context, generate a professional, personalized reply:

ORIGINAL EMAIL:
Subject: {subject}
From: {from}
Body: {body}

RELEVANT CONTEXT:
{context}

Generate a professional, concise reply that:
1. Acknowledges their email appropriately
2. Uses the provided context when relevant
3. Maintains a professional tone
4. Is personalized to their specific inquiry
5. Includes appropriate next steps when applicable

Reply:
  `.trim();
        this.config = config;
        this.processingConfig = processingConfig;
        this.gemini = new GoogleGenerativeAI(config.apiKey);
        logger_1.default.info('🤖 AI Service initialized with Gemini');
    }
    /**
     * Categorize email using OpenAI
     */
    async categorizeEmail(email) {
        if (!this.processingConfig.categorizationEnabled) {
            logger_1.default.debug('AI categorization is disabled, returning default category');
            return 'Spam';
        }
        const startTime = Date.now();
        try {
            // Prepare prompt with email content
            const prompt = this.CATEGORIZATION_PROMPT
                .replace('{subject}', email.subject || '(no subject)')
                .replace('{body}', this.sanitizeEmailBody(email.body));
            // Call Gemini API with retry logic for rate limits
            let attempts = 0;
            const maxAttempts = 3;
            while (attempts < maxAttempts) {
                try {
                    const model = this.gemini.getGenerativeModel({ model: this.config.model });
                    const response = await model.generateContent(prompt);
                    const category = response.response?.text?.trim();
                    // Validate category
                    const validCategories = [
                        'Interested',
                        'Meeting Booked',
                        'Not Interested',
                        'Spam',
                        'Out of Office'
                    ];
                    const finalCategory = validCategories.includes(category) ? category : 'Spam';
                    const duration = Date.now() - startTime;
                    logger_1.emailLogger.aiProcessing('categorization', email.id, duration);
                    logger_1.emailLogger.emailCategorized(email.messageId, finalCategory);
                    logger_1.default.debug(`🏷️ Email categorized: ${email.subject} -> ${finalCategory}`);
                    return finalCategory;
                }
                catch (error) {
                    attempts++;
                    // Check if it's a rate limit error
                    if (error.message?.includes('429') || error.message?.includes('quota')) {
                        if (attempts < maxAttempts) {
                            const delay = Math.pow(2, attempts) * 2000; // Exponential backoff
                            logger_1.default.warn(`⚠️ Gemini rate limit hit, retrying in ${delay}ms (attempt ${attempts}/${maxAttempts})`);
                            await this.delay(delay);
                            continue;
                        }
                    }
                    // For other errors or max attempts reached, throw
                    throw error;
                }
            }
            // If we get here, all attempts failed
            logger_1.default.error('❌ Failed to categorize email after all retries');
            return 'Spam';
        }
        catch (error) {
            logger_1.default.error('❌ Failed to categorize email:', error);
            return 'Spam';
        }
    }
    /**
     * Batch categorize multiple emails for better performance
     */
    async categorizeEmailsBatch(emails) {
        if (!this.processingConfig.categorizationEnabled) {
            const results = new Map();
            emails.forEach(email => results.set(email.id, 'Spam'));
            return results;
        }
        const results = new Map();
        const batchSize = this.processingConfig.batchSize;
        logger_1.default.info(`🤖 Starting batch categorization of ${emails.length} emails`);
        // Process in batches to avoid API rate limits
        for (let i = 0; i < emails.length; i += batchSize) {
            const batch = emails.slice(i, i + batchSize);
            const batchPromises = batch.map(async (email) => {
                let attempts = 0;
                const maxAttempts = this.processingConfig.retryAttempts;
                while (attempts < maxAttempts) {
                    try {
                        const category = await this.categorizeEmail(email);
                        results.set(email.id, category);
                        return;
                    }
                    catch (error) {
                        attempts++;
                        if (attempts === maxAttempts) {
                            logger_1.default.error(`❌ Failed to categorize email after ${maxAttempts} attempts:`, error);
                            results.set(email.id, 'Spam'); // Default fallback
                        }
                        else {
                            // Wait before retry with exponential backoff
                            await this.delay(Math.pow(2, attempts) * 1000);
                        }
                    }
                }
            });
            await Promise.all(batchPromises);
            // Small delay between batches to respect rate limits
            if (i + batchSize < emails.length) {
                await this.delay(1000);
            }
        }
        logger_1.default.info(`✅ Batch categorization completed: ${results.size}/${emails.length} emails`);
        return results;
    }
    /**
     * Generate reply suggestion using RAG context
     */
    async generateReplySuggestion(email, relevantContexts) {
        if (!this.processingConfig.replySuggestionsEnabled) {
            throw new Error('Reply suggestions are disabled');
        }
        const startTime = Date.now();
        try {
            // Prepare context string from relevant contexts
            const contextString = relevantContexts
                .map(ctx => `- ${ctx.content}`)
                .join('\n');
            // Prepare prompt with email and context
            const prompt = this.REPLY_PROMPT
                .replace('{subject}', email.subject || '(no subject)')
                .replace('{from}', email.from.map(f => f.address).join(', '))
                .replace('{body}', this.sanitizeEmailBody(email.body))
                .replace('{context}', contextString || 'No specific context available');
            // Call Gemini API for reply generation
            const response = await this.gemini.getGenerativeModel({ model: this.config.model }).generateContent({
                contents: prompt,
                config: {
                    systemInstruction: 'You are a professional email assistant. Generate helpful, concise, and personalized email replies.',
                    temperature: 0.7, // Slightly higher temperature for more natural replies
                    maxOutputTokens: this.config.maxTokens,
                }
            });
            const suggestedReply = response.response?.text?.trim() || '';
            // Calculate confidence based on context availability and response quality
            const confidence = this.calculateReplyConfidence(suggestedReply, relevantContexts);
            const duration = Date.now() - startTime;
            logger_1.emailLogger.aiProcessing('reply-generation', email.id, duration);
            const replyGeneration = {
                originalEmail: email,
                suggestedReply,
                confidence,
                contextUsed: relevantContexts,
                generatedAt: new Date()
            };
            logger_1.default.debug(`💬 Reply generated for: ${email.subject} (confidence: ${confidence}%)`);
            return replyGeneration;
        }
        catch (error) {
            logger_1.default.error('❌ Failed to generate reply suggestion:', error);
            throw error;
        }
    }
    /**
     * Extract key information from email for RAG context retrieval
     */
    extractEmailKeywords(email) {
        const text = `${email.subject} ${email.body}`.toLowerCase();
        // Common business/professional keywords that might indicate intent
        const businessKeywords = [
            'job', 'position', 'role', 'career', 'employment', 'work',
            'meeting', 'call', 'schedule', 'appointment', 'available',
            'product', 'service', 'demo', 'pricing', 'quote', 'proposal',
            'interested', 'opportunity', 'partnership', 'collaboration',
            'interview', 'discussion', 'consultation', 'follow-up'
        ];
        const foundKeywords = businessKeywords.filter(keyword => text.includes(keyword));
        // Also extract potential company names, emails domains, etc.
        const emailDomains = email.from
            .map(f => f.address.split('@')[1])
            .filter(domain => domain && !['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com'].includes(domain));
        return [...foundKeywords, ...emailDomains];
    }
    /**
     * Analyze email sentiment (positive, negative, neutral)
     */
    async analyzeEmailSentiment(email) {
        try {
            const prompt = `
Analyze the sentiment of this email and respond with ONLY one word: positive, negative, or neutral.

Subject: ${email.subject}
Body: ${this.sanitizeEmailBody(email.body)}

Sentiment:
      `.trim();
            const response = await this.gemini.getGenerativeModel({ model: this.config.model }).generateContent({
                contents: prompt,
                config: {
                    systemInstruction: 'You are a sentiment analysis expert. Respond only with: positive, negative, or neutral.',
                    temperature: 0,
                    maxOutputTokens: 10
                }
            });
            const sentiment = response.response?.text?.trim().toLowerCase();
            if (['positive', 'negative', 'neutral'].includes(sentiment)) {
                return sentiment;
            }
            return 'neutral';
        }
        catch (error) {
            logger_1.default.error('❌ Failed to analyze email sentiment:', error);
            return 'neutral';
        }
    }
    /**
     * Check if email requires urgent response
     */
    async checkUrgency(email) {
        const urgentKeywords = [
            'urgent', 'asap', 'immediately', 'emergency', 'critical',
            'deadline', 'time-sensitive', 'priority', 'rush'
        ];
        const emailText = `${email.subject} ${email.body}`.toLowerCase();
        return urgentKeywords.some(keyword => emailText.includes(keyword));
    }
    /**
     * Private helper methods
     */
    sanitizeEmailBody(body) {
        // Remove excessive whitespace and limit length for API efficiency
        return body
            .replace(/\s+/g, ' ')
            .trim()
            .substring(0, 2000); // Limit to 2000 characters to stay within token limits
    }
    calculateReplyConfidence(reply, contexts) {
        let confidence = 50; // Base confidence
        // Boost confidence if we have relevant context
        if (contexts.length > 0) {
            confidence += contexts.length * 10;
        }
        // Boost confidence for longer, more detailed replies
        if (reply.length > 100) {
            confidence += 10;
        }
        // Boost confidence if reply contains specific information
        const specificIndicators = ['meeting', 'link', 'schedule', 'calendar', 'call'];
        const hasSpecificInfo = specificIndicators.some(indicator => reply.toLowerCase().includes(indicator));
        if (hasSpecificInfo) {
            confidence += 15;
        }
        // Cap confidence at 95%
        return Math.min(confidence, 95);
    }
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    /**
     * Health check for OpenAI API
     */
    async healthCheck() {
        try {
            const model = this.gemini.getGenerativeModel({ model: this.config.model });
            const result = await model.generateContent("hello");
            return result.response.text().length > 0;
        }
        catch (error) {
            logger_1.default.error('❌ Gemini health check failed:', error);
            return false;
        }
    }
    /**
     * Get current configuration
     */
    getConfig() {
        return {
            gemini: this.config,
            processing: this.processingConfig
        };
    }
    /**
     * Update processing configuration
     */
    updateProcessingConfig(config) {
        this.processingConfig = { ...this.processingConfig, ...config };
        logger_1.default.info('🤖 AI processing configuration updated');
    }
}
exports.AIService = AIService;
//# sourceMappingURL=AIService.js.map