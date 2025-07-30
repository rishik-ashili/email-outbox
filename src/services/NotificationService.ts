import { WebClient } from '@slack/web-api';
import axios, { AxiosResponse } from 'axios';
import {
    Email,
    EmailCategory,
    SlackConfig,
    WebhookConfig,
    WebhookPayload
} from '../types';
import logger, { emailLogger, circuitBreakerLogger } from '../utils/logger';

// interface NotificationAttempt {
//   timestamp: Date;
//   success: boolean;
//   error?: string;
// }

interface CircuitBreakerState {
    isOpen: boolean;
    failureCount: number;
    lastFailureTime?: Date;
    nextAttemptTime?: Date;
}

export class NotificationService {
    private slackClient: WebClient | null = null;
    private slackConfig: SlackConfig;
    private webhookConfig: WebhookConfig;

    // Circuit breaker state for external services
    private slackCircuitBreaker: CircuitBreakerState = {
        isOpen: false,
        failureCount: 0
    };

    private webhookCircuitBreaker: CircuitBreakerState = {
        isOpen: false,
        failureCount: 0
    };

    // Configuration constants
    private readonly CIRCUIT_BREAKER_THRESHOLD = 5;
    private readonly CIRCUIT_BREAKER_TIMEOUT = 60000; // 1 minute
    // private readonly SLACK_RATE_LIMIT_DELAY = 1000; // 1 second between calls

    constructor(slackConfig: SlackConfig, webhookConfig: WebhookConfig) {
        this.slackConfig = slackConfig;
        this.webhookConfig = webhookConfig;

        if (this.slackConfig.enabled && this.slackConfig.botToken) {
            this.slackClient = new WebClient(this.slackConfig.botToken);
            logger.info('📨 Slack client initialized');
        }

        logger.info('📨 Notification service initialized');
    }

    /**
     * Process email notification based on category
     */
    async processEmailNotification(email: Email, category: EmailCategory): Promise<void> {
        // Only send notifications for "Interested" emails as per blueprint
        if (category !== 'Interested') {
            logger.debug(`📧 Skipping notification for category: ${category}`);
            return;
        }

        logger.info(`📧 Processing notification for interested email: ${email.subject}`);

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
        } catch (error) {
            logger.error('❌ Error processing email notifications:', error);
        }
    }

    /**
     * Send Slack notification with structured blocks
     */
    async sendSlackNotification(email: Email, category: EmailCategory): Promise<boolean> {
        if (!this.slackClient || !this.slackConfig.enabled) {
            logger.debug('📨 Slack notifications disabled');
            return false;
        }

        // Check circuit breaker
        if (this.isCircuitBreakerOpen('slack')) {
            logger.warn('⚡ Slack circuit breaker is open, skipping notification');
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
                emailLogger.notificationSent('slack', email.id, true);
                this.resetCircuitBreaker('slack');
                return true;
            } else {
                throw new Error(`Slack API error: ${result.error}`);
            }
        } catch (error) {
            emailLogger.notificationSent('slack', email.id, false);
            this.handleCircuitBreakerFailure('slack', error as Error);
            logger.error('❌ Failed to send Slack notification:', error);
            return false;
        }
    }

    /**
     * Create structured Slack message blocks
     */
    private createSlackMessageBlocks(email: Email, category: EmailCategory): any[] {
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
    async sendWebhookNotification(email: Email, category: EmailCategory): Promise<boolean> {
        if (!this.webhookConfig.enabled || !this.webhookConfig.url) {
            logger.debug('📨 Webhook notifications disabled');
            return false;
        }

        // Check circuit breaker
        if (this.isCircuitBreakerOpen('webhook')) {
            logger.warn('⚡ Webhook circuit breaker is open, skipping notification');
            return false;
        }

        const payload: WebhookPayload = {
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
                const response: AxiosResponse = await axios.post(
                    this.webhookConfig.url,
                    payload,
                    {
                        timeout: this.webhookConfig.timeout,
                        headers: {
                            'Content-Type': 'application/json',
                            'User-Agent': 'EmailOnebox-NotificationService/1.0'
                        }
                    }
                );

                if (response.status >= 200 && response.status < 300) {
                    emailLogger.notificationSent('webhook', email.id, true);
                    this.resetCircuitBreaker('webhook');
                    return true;
                } else {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
            } catch (error) {
                attempts++;
                logger.error(`❌ Webhook attempt ${attempts}/${maxAttempts} failed:`, error);

                if (attempts === maxAttempts) {
                    emailLogger.notificationSent('webhook', email.id, false);
                    this.handleCircuitBreakerFailure('webhook', error as Error);
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
    async sendTestNotifications(): Promise<{ slack: boolean; webhook: boolean }> {
        logger.info('🧪 Sending test notifications...');

        const testEmail: Email = {
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

        logger.info(`🧪 Test notifications completed: Slack=${results.slack}, Webhook=${results.webhook}`);
        return results;
    }

    /**
     * Circuit breaker implementation
     */
    private isCircuitBreakerOpen(service: 'slack' | 'webhook'): boolean {
        const breaker = service === 'slack' ? this.slackCircuitBreaker : this.webhookCircuitBreaker;

        if (!breaker.isOpen) return false;

        // Check if timeout period has passed
        if (breaker.nextAttemptTime && Date.now() > breaker.nextAttemptTime.getTime()) {
            breaker.isOpen = false;
            breaker.failureCount = 0;
            circuitBreakerLogger.halfOpen(service);
            return false;
        }

        return true;
    }

    private handleCircuitBreakerFailure(service: 'slack' | 'webhook', _error: Error): void {
        const breaker = service === 'slack' ? this.slackCircuitBreaker : this.webhookCircuitBreaker;

        breaker.failureCount++;
        breaker.lastFailureTime = new Date();

        if (breaker.failureCount >= this.CIRCUIT_BREAKER_THRESHOLD) {
            breaker.isOpen = true;
            breaker.nextAttemptTime = new Date(Date.now() + this.CIRCUIT_BREAKER_TIMEOUT);
            circuitBreakerLogger.opened(service, breaker.failureCount);
        }
    }

    private resetCircuitBreaker(service: 'slack' | 'webhook'): void {
        const breaker = service === 'slack' ? this.slackCircuitBreaker : this.webhookCircuitBreaker;

        if (breaker.failureCount > 0 || breaker.isOpen) {
            breaker.failureCount = 0;
            breaker.isOpen = false;
            breaker.lastFailureTime = undefined;
            breaker.nextAttemptTime = undefined;
            circuitBreakerLogger.closed(service);
        }
    }

    /**
     * Get notification statistics
     */
    getNotificationStats(): {
        slack: { enabled: boolean; circuitBreaker: CircuitBreakerState };
        webhook: { enabled: boolean; circuitBreaker: CircuitBreakerState };
    } {
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
    updateSlackConfig(config: Partial<SlackConfig>): void {
        this.slackConfig = { ...this.slackConfig, ...config };

        if (config.botToken) {
            this.slackClient = new WebClient(config.botToken);
            logger.info('📨 Slack client updated');
        }
    }

    /**
     * Update webhook configuration
     */
    updateWebhookConfig(config: Partial<WebhookConfig>): void {
        this.webhookConfig = { ...this.webhookConfig, ...config };
        logger.info('📨 Webhook configuration updated');
    }

    /**
     * Health check for external services
     */
    async healthCheck(): Promise<{ slack: boolean; webhook: boolean }> {
        const results = {
            slack: false,
            webhook: false
        };

        // Test Slack connection
        if (this.slackClient && this.slackConfig.enabled) {
            try {
                const auth = await this.slackClient.auth.test();
                results.slack = !!auth.ok;
            } catch (error) {
                logger.debug('Slack health check failed:', error);
                results.slack = false;
            }
        }

        // Test webhook endpoint
        if (this.webhookConfig.enabled && this.webhookConfig.url) {
            try {
                // Send a minimal HEAD request to check if endpoint is reachable
                const response = await axios.head(this.webhookConfig.url, {
                    timeout: 5000
                });
                results.webhook = response.status < 400;
            } catch (error) {
                logger.debug('Webhook health check failed:', error);
                results.webhook = false;
            }
        }

        return results;
    }

    /**
     * Reset circuit breakers manually
     */
    resetCircuitBreakers(): void {
        this.resetCircuitBreaker('slack');
        this.resetCircuitBreaker('webhook');
        logger.info('⚡ All circuit breakers reset');
    }

    /**
     * Utility method for delays
     */
    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Get current configuration
     */
    getConfig(): { slack: SlackConfig; webhook: WebhookConfig } {
        return {
            slack: { ...this.slackConfig },
            webhook: { ...this.webhookConfig }
        };
    }
} 