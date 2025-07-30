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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationService = void 0;
const web_api_1 = require("@slack/web-api");
const axios_1 = __importDefault(require("axios"));
const logger_1 = __importStar(require("../utils/logger"));
class NotificationService {
    // private readonly SLACK_RATE_LIMIT_DELAY = 1000; // 1 second between calls
    constructor(slackConfig, webhookConfig) {
        this.slackClient = null;
        // Circuit breaker state for external services
        this.slackCircuitBreaker = {
            isOpen: false,
            failureCount: 0
        };
        this.webhookCircuitBreaker = {
            isOpen: false,
            failureCount: 0
        };
        // Configuration constants
        this.CIRCUIT_BREAKER_THRESHOLD = 5;
        this.CIRCUIT_BREAKER_TIMEOUT = 60000; // 1 minute
        this.slackConfig = slackConfig;
        this.webhookConfig = webhookConfig;
        if (this.slackConfig.enabled && this.slackConfig.botToken) {
            this.slackClient = new web_api_1.WebClient(this.slackConfig.botToken);
            logger_1.default.info('📨 Slack client initialized');
        }
        logger_1.default.info('📨 Notification service initialized');
    }
    /**
     * Process email notification based on category
     */
    async processEmailNotification(email, category) {
        // Only send notifications for "Interested" emails as per blueprint
        if (category !== 'Interested') {
            logger_1.default.debug(`📧 Skipping notification for category: ${category}`);
            return;
        }
        logger_1.default.info(`📧 Processing notification for interested email: ${email.subject}`);
        // Send notifications in parallel
        const notifications = [];
        if (this.slackConfig.enabled) {
            notifications.push(this.sendSlackNotification(email, category));
        }
        if (this.webhookConfig.enabled) {
            notifications.push(this.sendWebhookNotification(email, category));
        }
        try {
            await Promise.allSettled(notifications);
        }
        catch (error) {
            logger_1.default.error('❌ Error processing email notifications:', error);
        }
    }
    /**
     * Send Slack notification with structured blocks
     */
    async sendSlackNotification(email, category) {
        if (!this.slackClient || !this.slackConfig.enabled) {
            logger_1.default.debug('📨 Slack notifications disabled');
            return false;
        }
        // Check circuit breaker
        if (this.isCircuitBreakerOpen('slack')) {
            logger_1.default.warn('⚡ Slack circuit breaker is open, skipping notification');
            return false;
        }
        try {
            const blocks = this.createSlackMessageBlocks(email, category);
            const result = await this.slackClient.chat.postMessage({
                channel: this.slackConfig.channel,
                blocks,
                text: `New ${category} email from ${email.from[0]?.address}`,
                unfurl_links: false,
                unfurl_media: false
            });
            if (result.ok) {
                logger_1.emailLogger.notificationSent('slack', email.id, true);
                this.resetCircuitBreaker('slack');
                return true;
            }
            else {
                throw new Error(`Slack API error: ${result.error}`);
            }
        }
        catch (error) {
            logger_1.emailLogger.notificationSent('slack', email.id, false);
            this.handleCircuitBreakerFailure('slack', error);
            logger_1.default.error('❌ Failed to send Slack notification:', error);
            return false;
        }
    }
    /**
     * Create structured Slack message blocks
     */
    createSlackMessageBlocks(email, category) {
        const fromAddress = email.from[0]?.address || 'Unknown';
        const fromName = email.from[0]?.name || fromAddress;
        const truncatedBody = email.body.substring(0, 500);
        const hasAttachments = email.attachments.length > 0;
        return [
            {
                type: 'header',
                text: {
                    type: 'plain_text',
                    text: `🎯 ${category} Email Received`,
                    emoji: true
                }
            },
            {
                type: 'section',
                fields: [
                    {
                        type: 'mrkdwn',
                        text: `*From:* ${fromName} <${fromAddress}>`
                    },
                    {
                        type: 'mrkdwn',
                        text: `*Account:* ${email.account}`
                    },
                    {
                        type: 'mrkdwn',
                        text: `*Subject:* ${email.subject}`
                    },
                    {
                        type: 'mrkdwn',
                        text: `*Date:* ${email.date.toLocaleString()}`
                    }
                ]
            },
            {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `*Email Preview:*\n${truncatedBody}${email.body.length > 500 ? '...' : ''}`
                }
            },
            ...(hasAttachments ? [{
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: `📎 *Attachments:* ${email.attachments.length} file(s)`
                    }
                }] : []),
            {
                type: 'context',
                elements: [
                    {
                        type: 'mrkdwn',
                        text: `Email ID: ${email.id} | Message ID: ${email.messageId}`
                    }
                ]
            },
            {
                type: 'actions',
                elements: [
                    {
                        type: 'button',
                        text: {
                            type: 'plain_text',
                            text: 'View Email',
                            emoji: true
                        },
                        style: 'primary',
                        value: email.id,
                        action_id: 'view_email'
                    },
                    {
                        type: 'button',
                        text: {
                            type: 'plain_text',
                            text: 'Generate Reply',
                            emoji: true
                        },
                        value: email.id,
                        action_id: 'generate_reply'
                    }
                ]
            }
        ];
    }
    /**
     * Send webhook notification
     */
    async sendWebhookNotification(email, category) {
        if (!this.webhookConfig.enabled || !this.webhookConfig.url) {
            logger_1.default.debug('📨 Webhook notifications disabled');
            return false;
        }
        // Check circuit breaker
        if (this.isCircuitBreakerOpen('webhook')) {
            logger_1.default.warn('⚡ Webhook circuit breaker is open, skipping notification');
            return false;
        }
        const payload = {
            email: {
                ...email,
                // Remove large content to keep payload manageable
                body: email.body.substring(0, 1000),
                htmlBody: undefined,
                attachments: email.attachments.map(att => ({
                    id: att.id,
                    filename: att.filename,
                    contentType: att.contentType,
                    size: att.size,
                    checksum: att.checksum
                    // Don't send file content in webhook
                }))
            },
            category,
            account: email.account,
            timestamp: new Date().toISOString(),
            eventType: 'new_interested_email'
        };
        let attempts = 0;
        const maxAttempts = this.webhookConfig.retryAttempts;
        while (attempts < maxAttempts) {
            try {
                const response = await axios_1.default.post(this.webhookConfig.url, payload, {
                    timeout: this.webhookConfig.timeout,
                    headers: {
                        'Content-Type': 'application/json',
                        'User-Agent': 'EmailOnebox-NotificationService/1.0'
                    }
                });
                if (response.status >= 200 && response.status < 300) {
                    logger_1.emailLogger.notificationSent('webhook', email.id, true);
                    this.resetCircuitBreaker('webhook');
                    return true;
                }
                else {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
            }
            catch (error) {
                attempts++;
                logger_1.default.error(`❌ Webhook attempt ${attempts}/${maxAttempts} failed:`, error);
                if (attempts === maxAttempts) {
                    logger_1.emailLogger.notificationSent('webhook', email.id, false);
                    this.handleCircuitBreakerFailure('webhook', error);
                    return false;
                }
                // Exponential backoff for retries
                const delay = Math.pow(2, attempts) * 1000;
                await this.delay(delay);
            }
        }
        return false;
    }
    /**
     * Send test notifications to verify configuration
     */
    async sendTestNotifications() {
        logger_1.default.info('🧪 Sending test notifications...');
        const testEmail = {
            id: 'test-email-id',
            messageId: 'test-message-id',
            from: [{ address: 'test@example.com', name: 'Test Sender' }],
            to: [{ address: 'recipient@example.com', name: 'Test Recipient' }],
            subject: 'Test Notification - Email Onebox System',
            body: 'This is a test notification to verify the email onebox notification system is working correctly.',
            date: new Date(),
            account: 'Test Account',
            folder: 'INBOX',
            category: 'Interested',
            flags: [],
            attachments: [],
            uid: 12345,
            headers: {},
            createdAt: new Date(),
            updatedAt: new Date()
        };
        const results = {
            slack: false,
            webhook: false
        };
        // Test Slack notification
        if (this.slackConfig.enabled) {
            results.slack = await this.sendSlackNotification(testEmail, 'Interested');
        }
        // Test webhook notification
        if (this.webhookConfig.enabled) {
            results.webhook = await this.sendWebhookNotification(testEmail, 'Interested');
        }
        logger_1.default.info(`🧪 Test notifications completed: Slack=${results.slack}, Webhook=${results.webhook}`);
        return results;
    }
    /**
     * Circuit breaker implementation
     */
    isCircuitBreakerOpen(service) {
        const breaker = service === 'slack' ? this.slackCircuitBreaker : this.webhookCircuitBreaker;
        if (!breaker.isOpen)
            return false;
        // Check if timeout period has passed
        if (breaker.nextAttemptTime && Date.now() > breaker.nextAttemptTime.getTime()) {
            breaker.isOpen = false;
            breaker.failureCount = 0;
            logger_1.circuitBreakerLogger.halfOpen(service);
            return false;
        }
        return true;
    }
    handleCircuitBreakerFailure(service, _error) {
        const breaker = service === 'slack' ? this.slackCircuitBreaker : this.webhookCircuitBreaker;
        breaker.failureCount++;
        breaker.lastFailureTime = new Date();
        if (breaker.failureCount >= this.CIRCUIT_BREAKER_THRESHOLD) {
            breaker.isOpen = true;
            breaker.nextAttemptTime = new Date(Date.now() + this.CIRCUIT_BREAKER_TIMEOUT);
            logger_1.circuitBreakerLogger.opened(service, breaker.failureCount);
        }
    }
    resetCircuitBreaker(service) {
        const breaker = service === 'slack' ? this.slackCircuitBreaker : this.webhookCircuitBreaker;
        if (breaker.failureCount > 0 || breaker.isOpen) {
            breaker.failureCount = 0;
            breaker.isOpen = false;
            breaker.lastFailureTime = undefined;
            breaker.nextAttemptTime = undefined;
            logger_1.circuitBreakerLogger.closed(service);
        }
    }
    /**
     * Get notification statistics
     */
    getNotificationStats() {
        return {
            slack: {
                enabled: this.slackConfig.enabled,
                circuitBreaker: { ...this.slackCircuitBreaker }
            },
            webhook: {
                enabled: this.webhookConfig.enabled,
                circuitBreaker: { ...this.webhookCircuitBreaker }
            }
        };
    }
    /**
     * Update Slack configuration
     */
    updateSlackConfig(config) {
        this.slackConfig = { ...this.slackConfig, ...config };
        if (config.botToken) {
            this.slackClient = new web_api_1.WebClient(config.botToken);
            logger_1.default.info('📨 Slack client updated');
        }
    }
    /**
     * Update webhook configuration
     */
    updateWebhookConfig(config) {
        this.webhookConfig = { ...this.webhookConfig, ...config };
        logger_1.default.info('📨 Webhook configuration updated');
    }
    /**
     * Health check for external services
     */
    async healthCheck() {
        const results = {
            slack: false,
            webhook: false
        };
        // Test Slack connection
        if (this.slackClient && this.slackConfig.enabled) {
            try {
                const auth = await this.slackClient.auth.test();
                results.slack = !!auth.ok;
            }
            catch (error) {
                logger_1.default.debug('Slack health check failed:', error);
                results.slack = false;
            }
        }
        // Test webhook endpoint
        if (this.webhookConfig.enabled && this.webhookConfig.url) {
            try {
                // Send a minimal HEAD request to check if endpoint is reachable
                const response = await axios_1.default.head(this.webhookConfig.url, {
                    timeout: 5000
                });
                results.webhook = response.status < 400;
            }
            catch (error) {
                logger_1.default.debug('Webhook health check failed:', error);
                results.webhook = false;
            }
        }
        return results;
    }
    /**
     * Reset circuit breakers manually
     */
    resetCircuitBreakers() {
        this.resetCircuitBreaker('slack');
        this.resetCircuitBreaker('webhook');
        logger_1.default.info('⚡ All circuit breakers reset');
    }
    /**
     * Utility method for delays
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    /**
     * Get current configuration
     */
    getConfig() {
        return {
            slack: { ...this.slackConfig },
            webhook: { ...this.webhookConfig }
        };
    }
}
exports.NotificationService = NotificationService;
//# sourceMappingURL=NotificationService.js.map