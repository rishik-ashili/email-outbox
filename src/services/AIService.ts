const { GoogleGenerativeAI } = require('@google/generative-ai');
import crypto from 'crypto';
import {
    Email,
    EmailCategory,
    GeminiConfig,
    ReplyGeneration,
    RAGContext,
    AIProcessingConfig
} from '../types';
import logger, { emailLogger } from '../utils/logger';

export class AIService {
    private gemini: any;
    private config: GeminiConfig;
    private processingConfig: AIProcessingConfig;
    private rateLimiter: { lastCall: number; callCount: number } = { lastCall: 0, callCount: 0 };
    private categoryCache: Map<string, EmailCategory> = new Map();
    private dailyQuotaTracker: { date: string; calls: number } = { date: '', calls: 0 };
    private readonly RATE_LIMIT_PER_MINUTE = 0.5;
    private readonly RATE_LIMIT_WINDOW = 60000;
    private readonly DAILY_QUOTA_LIMIT = 40;
    private readonly HEALTH_CHECK_INTERVAL = 600000;
    private lastHealthCheck = 0;
    private healthCheckCache = false;

    // This prompt tells the AI how to categorize emails into specific categories
    private readonly CATEGORIZATION_PROMPT = `
You are a highly accurate email classification expert. Analyze the following email and categorize it into EXACTLY one of the following categories based on the user's primary intent. Your response must be ONLY the category name.

Categories and their strict definitions:
- Interested: The sender expresses a clear and positive interest in a product, service, or partnership. They are asking for more information, a demo, or next steps. This is for initial expressions of interest.
- Meeting Booked: The primary purpose of the email is to schedule, confirm, reschedule, or cancel a specific meeting, call, or appointment. Look for dates, times, calendar links, or confirmation language.
- Not Interested: The sender explicitly states they are not interested, are declining an offer, or that it's not a good time.
- Spam: The email is unsolicited marketing, a newsletter, a promotional offer, a suspicious link, or clearly irrelevant to business operations.
- Out of Office: This is an automated reply indicating the person is unavailable, on vacation, or out of the office.

---
Email Subject: {subject}
Email Body: {body}
---

Category:
  `.trim();

    // This prompt helps generate reply suggestions based on email content and context
    private readonly REPLY_PROMPT = `
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

    constructor(config: GeminiConfig, processingConfig: AIProcessingConfig) {
        this.config = config;
        this.processingConfig = processingConfig;

        this.gemini = new GoogleGenerativeAI(config.apiKey);

        this.resetDailyQuotaIfNeeded();

        logger.info('🤖 AI Service initialized with Gemini');
    }

    /**
     * Categorizes an email using AI, with smart caching and quota management to avoid excessive API calls
     */
    async categorizeEmail(email: Email): Promise<EmailCategory> {
        // If AI categorization is turned off, return default category
        if (!this.processingConfig.categorizationEnabled) {
            logger.debug('AI categorization is disabled, returning default category');
            return 'Spam';
        }

        // Check if we already categorized this email before (saves API calls)
        const cacheKey = this.generateCacheKey(email);
        if (this.categoryCache.has(cacheKey)) {
            const cachedCategory = this.categoryCache.get(cacheKey)!;
            logger.debug(`🏷️ Using cached category for email: ${email.subject} -> ${cachedCategory}`);
            return cachedCategory;
        }

        // Try simple keyword matching first to avoid unnecessary AI calls
        const simpleCategory = this.simpleKeywordCategorization(email);
        if (simpleCategory) {
            logger.debug(`🏷️ Using keyword-based categorization for email: ${email.subject} -> ${simpleCategory}`);
            this.categoryCache.set(cacheKey, simpleCategory);
            return simpleCategory;
        }

        // Check if we've hit our daily API limit
        if (this.isDailyQuotaExceeded()) {
            logger.warn('⚠️ Daily quota exceeded, using default category');
            return 'Spam';
        }

        // Make sure the AI service is working before making calls
        const isHealthy = await this.healthCheck();
        if (!isHealthy) {
            logger.warn('⚠️ Gemini service unavailable, using default category');
            return 'Spam';
        }

        const startTime = Date.now();

        try {
            // Prepare the prompt with the email content (shortened to save tokens)
            const prompt = this.CATEGORIZATION_PROMPT
                .replace('{subject}', email.subject || '(no subject)')
                .replace('{body}', this.sanitizeEmailBody(email.body));

            // Try calling the AI with retry logic for rate limit errors
            let attempts = 0;
            const maxAttempts = 2; // Keep attempts low to save quota

            while (attempts < maxAttempts) {
                try {
                    // Make sure we're not calling too fast
                    await this.enforceRateLimit();

                    // Use the configured AI model
                    let modelName = this.config.model;

                    const model = this.gemini.getGenerativeModel({ model: modelName });

                    // Add timeout to prevent hanging requests
                    const timeoutPromise = new Promise((_, reject) => {
                        setTimeout(() => reject(new Error('Request timeout')), 10000); // 10 second timeout
                    });

                    const response = await Promise.race([
                        model.generateContent(prompt),
                        timeoutPromise
                    ]);
                    const category = response.response?.text()?.trim() as EmailCategory;

                    // Make sure the AI gave us a valid category
                    const validCategories: EmailCategory[] = [
                        'Interested',
                        'Meeting Booked',
                        'Not Interested',
                        'Spam',
                        'Out of Office'
                    ];

                    const finalCategory = validCategories.includes(category) ? category : 'Spam';

                    // Save the result for future use
                    if (cacheKey) {
                        this.categoryCache.set(cacheKey, finalCategory);
                    }

                    // Keep cache size manageable to prevent memory issues
                    if (this.categoryCache.size > 500) { // Reduced cache size
                        const firstKey = this.categoryCache.keys().next().value;
                        if (firstKey) {
                            this.categoryCache.delete(firstKey);
                        }
                    }

                    // Track this API call
                    this.incrementDailyQuota();

                    const duration = Date.now() - startTime;
                    emailLogger.aiProcessing('categorization', email.id, duration);
                    emailLogger.emailCategorized(email.messageId, finalCategory);

                    logger.debug(`🏷️ Email categorized: ${email.subject} -> ${finalCategory}`);
                    return finalCategory;
                } catch (error: any) {
                    attempts++;

                    // If it's a rate limit or service error, try again with delay
                    if (error.message?.includes('429') || error.message?.includes('quota') ||
                        error.message?.includes('503') || error.message?.includes('overloaded')) {
                        if (attempts < maxAttempts) {
                            const delay = Math.pow(2, attempts) * 2000; // Wait longer each time
                            logger.warn(`⚠️ Gemini service unavailable, retrying in ${delay}ms (attempt ${attempts}/${maxAttempts})`);
                            await this.delay(delay);
                            continue;
                        }
                    }

                    // For other errors or max attempts reached, throw
                    throw error;
                }
            }

            // If we get here, all attempts failed
            logger.error('❌ Failed to categorize email after all retries');
            return 'Spam';
        } catch (error) {
            logger.error('❌ Failed to categorize email:', error);
            return 'Spam';
        }
    }

    /**
     * Processes multiple emails in batches to be more efficient with API calls
     */
    async categorizeEmailsBatch(emails: Email[]): Promise<Map<string, EmailCategory>> {
        // If AI is disabled, return default categories for all emails
        if (!this.processingConfig.categorizationEnabled) {
            const results = new Map<string, EmailCategory>();
            emails.forEach(email => results.set(email.id, 'Spam'));
            return results;
        }

        const results = new Map<string, EmailCategory>();
        const batchSize = Math.min(this.processingConfig.batchSize, 2); // Keep batches small

        logger.info(`🤖 Starting batch categorization of ${emails.length} emails`);

        // Process emails in small groups to avoid overwhelming the API
        for (let i = 0; i < emails.length; i += batchSize) {
            const batch = emails.slice(i, i + batchSize);

            const batchPromises = batch.map(async (email) => {
                let attempts = 0;
                const maxAttempts = Math.min(this.processingConfig.retryAttempts, 2); // Keep attempts low

                while (attempts < maxAttempts) {
                    try {
                        const category = await this.categorizeEmail(email);
                        results.set(email.id, category);
                        return;
                    } catch (error) {
                        attempts++;
                        if (attempts === maxAttempts) {
                            logger.error(`❌ Failed to categorize email after ${maxAttempts} attempts:`, error);
                            results.set(email.id, 'Spam'); // Default fallback
                        } else {
                            // Wait before retry with exponential backoff
                            await this.delay(Math.pow(2, attempts) * 1000);
                        }
                    }
                }
            });

            await Promise.all(batchPromises);

            // Wait between batches to be nice to the API
            if (i + batchSize < emails.length) {
                await this.delay(5000); // 5 second delay (increased)
            }
        }

        logger.info(`✅ Batch categorization completed: ${results.size}/${emails.length} emails`);
        return results;
    }

    /**
     * Generates reply suggestions using relevant context from previous emails
     */
    async generateReplySuggestion(
        email: Email,
        relevantContexts: RAGContext[]
    ): Promise<ReplyGeneration> {
        if (!this.processingConfig.replySuggestionsEnabled) {
            throw new Error('Reply suggestions are disabled');
        }

        if (this.isDailyQuotaExceeded()) {
            throw new Error('Daily quota exceeded for reply generation');
        }

        const startTime = Date.now();

        try {
            // Combine all relevant context into one string
            const contextString = relevantContexts
                .map(ctx => `- ${ctx.content}`)
                .join('\n');


            // Handle different formats of the 'from' field safely
            let fromAddress: string;
            if (Array.isArray(email.from)) {
                // Handle the original array format
                fromAddress = email.from.map(f => f.address).join(', ');
            } else if (typeof email.from === 'string') {
                // Handle the flattened string format from Elasticsearch
                fromAddress = email.from;
            } else {
                // Fallback for unexpected formats
                fromAddress = 'Unknown Sender';
            }


            // Build the prompt with email details and context
            const prompt = this.REPLY_PROMPT
                .replace('{subject}', email.subject || '(no subject)')
                .replace('{from}', fromAddress) // Use the safely determined fromAddress
                .replace('{body}', this.sanitizeEmailBody(email.body))
                .replace('{context}', contextString || 'No specific context available');


            // Call the AI to generate the reply
            const response = await this.gemini.getGenerativeModel({ model: this.config.model }).generateContent({
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: this.config.maxTokens,
                },
                systemInstruction: {
                    parts: [{ text: 'You are a professional email assistant. Generate helpful, concise, and personalized email replies.' }]
                }
            });

            const suggestedReply = response.response?.text()?.trim() || '';
            const confidence = this.calculateReplyConfidence(suggestedReply, relevantContexts);
            this.incrementDailyQuota();
            const duration = Date.now() - startTime;
            emailLogger.aiProcessing('reply-generation', email.id, duration);

            const replyGeneration: ReplyGeneration = {
                originalEmail: email,
                suggestedReply,
                confidence,
                contextUsed: relevantContexts,
                generatedAt: new Date()
            };

            logger.debug(`💬 Reply generated for: ${email.subject} (confidence: ${confidence}%)`);

            return replyGeneration;
        } catch (error) {
            logger.error('❌ Failed to generate reply suggestion:', error);
            throw error;
        }
    }

    /**
     * Extracts keywords from email content to help find relevant context
     */
    extractEmailKeywords(email: Email): string[] {
        const text = `${email.subject} ${email.body}`.toLowerCase();

        // Common business/professional keywords that might indicate intent
        const businessKeywords = [
            'job', 'position', 'role', 'career', 'employment', 'work',
            'meeting', 'call', 'schedule', 'appointment', 'available',
            'product', 'service', 'demo', 'pricing', 'quote', 'proposal',
            'interested', 'opportunity', 'partnership', 'collaboration',
            'interview', 'discussion', 'consultation', 'follow-up'
        ];

        const foundKeywords = businessKeywords.filter(keyword =>
            text.includes(keyword)
        );

        // Also extract potential company names, emails domains, etc.
        const emailDomains = email.from
            .map(f => f.address.split('@')[1])
            .filter(domain => domain && !['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com'].includes(domain));

        return [...foundKeywords, ...emailDomains];
    }

    /**
     * Analyzes whether an email has positive, negative, or neutral sentiment
     */
    async analyzeEmailSentiment(email: Email): Promise<'positive' | 'negative' | 'neutral'> {
        // Check daily quota before making API call
        if (this.isDailyQuotaExceeded()) {
            logger.warn('⚠️ Daily quota exceeded, returning neutral sentiment');
            return 'neutral';
        }

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

            // Increment daily quota counter
            this.incrementDailyQuota();

            if (['positive', 'negative', 'neutral'].includes(sentiment)) {
                return sentiment as 'positive' | 'negative' | 'neutral';
            }

            return 'neutral';
        } catch (error) {
            logger.error('❌ Failed to analyze email sentiment:', error);
            return 'neutral';
        }
    }

    /**
     * Checks if an email contains urgent keywords that require immediate attention
     */
    async checkUrgency(email: Email): Promise<boolean> {
        const urgentKeywords = [
            'urgent', 'asap', 'immediately', 'emergency', 'critical',
            'deadline', 'time-sensitive', 'priority', 'rush'
        ];

        const emailText = `${email.subject} ${email.body}`.toLowerCase();

        return urgentKeywords.some(keyword => emailText.includes(keyword));
    }

    /**
     * Helper methods for internal use
     */

    // Cleans up email body text for AI processing
    private sanitizeEmailBody(body: string): string {
        // Remove excessive whitespace and limit length for API efficiency
        return body
            .replace(/\s+/g, ' ')
            .trim()
            .substring(0, 1000); // Reduced to 1000 characters to save tokens
    }

    // Calculates how confident we are in a generated reply
    private calculateReplyConfidence(reply: string, contexts: RAGContext[]): number {
        let confidence = 50; // Start with base confidence

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
        const hasSpecificInfo = specificIndicators.some(indicator =>
            reply.toLowerCase().includes(indicator)
        );

        if (hasSpecificInfo) {
            confidence += 15;
        }

        // Cap confidence at 95%
        return Math.min(confidence, 95);
    }

    // Simple delay function for rate limiting
    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
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
            logger.warn(`⚠️ Rate limit reached, waiting ${waitTime}ms before next API call`);
            await this.delay(waitTime);
            this.rateLimiter.callCount = 0;
            this.rateLimiter.lastCall = Date.now();
        }

        this.rateLimiter.callCount++;
    }

    /**
     * Daily quota management
     */
    // Resets daily quota counter if it's a new day
    private resetDailyQuotaIfNeeded(): void {
        const today = new Date().toDateString();
        if (this.dailyQuotaTracker.date !== today) {
            this.dailyQuotaTracker.date = today;
            this.dailyQuotaTracker.calls = 0;
            logger.info('🔄 Daily quota reset');
        }
    }

    // Increments the daily API call counter
    private incrementDailyQuota(): void {
        this.resetDailyQuotaIfNeeded();
        this.dailyQuotaTracker.calls++;
        logger.debug(`📊 Daily quota: ${this.dailyQuotaTracker.calls}/${this.DAILY_QUOTA_LIMIT}`);
    }

    // Checks if we've hit our daily API limit
    private isDailyQuotaExceeded(): boolean {
        this.resetDailyQuotaIfNeeded();
        return this.dailyQuotaTracker.calls >= this.DAILY_QUOTA_LIMIT;
    }

    /**
     * Simple keyword-based categorization to reduce API calls for obvious cases
     */
    private simpleKeywordCategorization(email: Email): EmailCategory | null {
        // Safely get subject and body, providing an empty string as a fallback.
        const subject = (email.subject || '').toLowerCase();
        const body = (email.body || '').toLowerCase();
        const fromAddress = (email.from[0]?.address || '').toLowerCase();

        // Out of Office indicators (High Confidence)
        const oooKeywords = ['out of office', 'auto-reply', 'autoreply', 'automatic reply', 'on vacation', 'i will be out of the office'];
        if (oooKeywords.some(keyword => subject.includes(keyword) || body.startsWith(keyword))) {
            return 'Out of Office';
        }

        // Meeting indicators (High Confidence)
        const meetingKeywords = ['meeting confirmed', 'meeting request', 'invitation:', 'zoom.us/j/', 'calendar invite', 'scheduled:', 'confirmed:'];
        if (meetingKeywords.some(keyword => subject.includes(keyword) || body.includes(keyword))) {
            return 'Meeting Booked';
        }

        // Not Interested indicators (High Confidence)
        const notInterestedKeywords = ['not interested', 'no longer interested', 'not a good fit', 'not looking for', 'decline your invitation'];
        if (notInterestedKeywords.some(keyword => subject.includes(keyword) || body.includes(keyword))) {
            return 'Not Interested';
        }

        // Spam indicators (More specific to promotional content)
        const spamKeywords = [
            'unsubscribe', 'view in browser', 'no-reply@', 'noreply@', 'marketing',
            'newsletter', 'promotion', 'special offer', 'limited time deal',
            'blackbox.ai', 'qwiklab', 'the arcade', 'google cloud skills boost', 'canva'
        ];
        if (spamKeywords.some(keyword => subject.includes(keyword) || body.includes(keyword) || fromAddress.includes(keyword))) {
            return 'Spam';
        }

        return null; // Let AI handle complex cases
    }

    /**
     * Creates a unique cache key for an email based on its content
     */
    private generateCacheKey(email: Email): string {
        const content = `${email.subject?.toLowerCase() || ''} ${email.body?.toLowerCase() || ''}`;
        return crypto.createHash('md5').update(content).digest('hex');
    }

    /**
     * Checks if the Gemini API is working properly
     */
    async healthCheck(): Promise<boolean> {
        const now = Date.now();

        // Use cached health check result if recent
        if (now - this.lastHealthCheck < this.HEALTH_CHECK_INTERVAL) {
            logger.debug(`🏥 Using cached health check result: ${this.healthCheckCache}`);
            return this.healthCheckCache;
        }

        // Check daily quota before making API call
        if (this.isDailyQuotaExceeded()) {
            logger.warn('⚠️ Daily quota exceeded, skipping health check');
            return false;
        }

        try {
            logger.debug('🏥 Starting Gemini health check...');

            // Use the configured model (gemini-2.5-pro)
            let modelName = this.config.model;
            logger.debug(`🏥 Using model: ${modelName}`);

            const model = this.gemini.getGenerativeModel({ model: modelName });

            // Add timeout to prevent hanging
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Health check timeout')), 5000); // 5 second timeout
            });

            logger.debug('🏥 Making API call to Gemini...');
            const result = await Promise.race([
                model.generateContent("hello"),
                timeoutPromise
            ]);

            const responseText = result.response.text();
            logger.debug(`🏥 Gemini response: ${responseText.substring(0, 50)}...`);

            // Update cache
            this.lastHealthCheck = now;
            this.healthCheckCache = responseText.length > 0;

            // Increment daily quota counter
            this.incrementDailyQuota();

            logger.info('✅ Gemini health check passed');
            return this.healthCheckCache;
        } catch (error) {
            logger.error('❌ Gemini health check failed:', error);

            // Update cache
            this.lastHealthCheck = now;
            this.healthCheckCache = false;

            return false;
        }
    }

    /**
     * Get current configuration
     */
    getConfig(): { gemini: GeminiConfig; processing: AIProcessingConfig } {
        return {
            gemini: this.config,
            processing: this.processingConfig
        };
    }

    /**
     * Update processing configuration
     */
    updateProcessingConfig(config: Partial<AIProcessingConfig>): void {
        this.processingConfig = { ...this.processingConfig, ...config };
        logger.info('🤖 AI processing configuration updated');
    }

    /**
     * Temporarily disable AI categorization due to rate limits
     */
    disableCategorization(): void {
        this.processingConfig.categorizationEnabled = false;
        logger.warn('⚠️ AI categorization disabled due to rate limits');
    }

    /**
     * Re-enable AI categorization
     */
    enableCategorization(): void {
        this.processingConfig.categorizationEnabled = true;
        logger.info('✅ AI categorization re-enabled');
    }

    /**
     * Get current rate limit status
     */
    getRateLimitStatus(): { callCount: number; lastCall: number; limit: number } {
        return {
            callCount: this.rateLimiter.callCount,
            lastCall: this.rateLimiter.lastCall,
            limit: this.RATE_LIMIT_PER_MINUTE
        };
    }

    /**
     * Get daily quota status
     */
    getDailyQuotaStatus(): { calls: number; limit: number; date: string } {
        this.resetDailyQuotaIfNeeded();
        return {
            calls: this.dailyQuotaTracker.calls,
            limit: this.DAILY_QUOTA_LIMIT,
            date: this.dailyQuotaTracker.date
        };
    }

    /**
     * Clear cache to free memory
     */
    clearCache(): void {
        this.categoryCache.clear();
        logger.info('🗑️ AI service cache cleared');
    }
} 