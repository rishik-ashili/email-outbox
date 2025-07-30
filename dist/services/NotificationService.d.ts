import { Email, EmailCategory, SlackConfig, WebhookConfig } from '../types';
interface CircuitBreakerState {
    isOpen: boolean;
    failureCount: number;
    lastFailureTime?: Date;
    nextAttemptTime?: Date;
}
export declare class NotificationService {
    private slackClient;
    private slackConfig;
    private webhookConfig;
    private slackCircuitBreaker;
    private webhookCircuitBreaker;
    private readonly CIRCUIT_BREAKER_THRESHOLD;
    private readonly CIRCUIT_BREAKER_TIMEOUT;
    constructor(slackConfig: SlackConfig, webhookConfig: WebhookConfig);
    /**
     * Process email notification based on category
     */
    processEmailNotification(email: Email, category: EmailCategory): Promise<void>;
    /**
     * Send Slack notification with structured blocks
     */
    sendSlackNotification(email: Email, category: EmailCategory): Promise<boolean>;
    /**
     * Create structured Slack message blocks
     */
    private createSlackMessageBlocks;
    /**
     * Send webhook notification
     */
    sendWebhookNotification(email: Email, category: EmailCategory): Promise<boolean>;
    /**
     * Send test notifications to verify configuration
     */
    sendTestNotifications(): Promise<{
        slack: boolean;
        webhook: boolean;
    }>;
    /**
     * Circuit breaker implementation
     */
    private isCircuitBreakerOpen;
    private handleCircuitBreakerFailure;
    private resetCircuitBreaker;
    /**
     * Get notification statistics
     */
    getNotificationStats(): {
        slack: {
            enabled: boolean;
            circuitBreaker: CircuitBreakerState;
        };
        webhook: {
            enabled: boolean;
            circuitBreaker: CircuitBreakerState;
        };
    };
    /**
     * Update Slack configuration
     */
    updateSlackConfig(config: Partial<SlackConfig>): void;
    /**
     * Update webhook configuration
     */
    updateWebhookConfig(config: Partial<WebhookConfig>): void;
    /**
     * Health check for external services
     */
    healthCheck(): Promise<{
        slack: boolean;
        webhook: boolean;
    }>;
    /**
     * Reset circuit breakers manually
     */
    resetCircuitBreakers(): void;
    /**
     * Utility method for delays
     */
    private delay;
    /**
     * Get current configuration
     */
    getConfig(): {
        slack: SlackConfig;
        webhook: WebhookConfig;
    };
}
export {};
//# sourceMappingURL=NotificationService.d.ts.map