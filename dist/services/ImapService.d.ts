import { EventEmitter } from 'events';
import { EmailAccount } from '../types';
export declare class ImapService extends EventEmitter {
    private connections;
    private configs;
    private accounts;
    private reconnectTimeouts;
    private isShuttingDown;
    private readonly HISTORY_DAYS;
    private readonly RECONNECT_DELAY;
    constructor();
    /**
     * Add email account and establish connection
     */
    addAccount(account: EmailAccount, password: string): Promise<void>;
    /**
     * Connect to a specific email account with IMAP IDLE
     */
    private connectAccount;
    /**
     * Perform initial email sync for last 30 days
     */
    private performInitialSync;
    /**
     * Process a batch of emails
     */
    private processBatchEmails;
    /**
     * Start IDLE monitoring for real-time email detection
     */
    private startIdleMonitoring;
    /**
     * Parse email message from IMAP buffer
     */
    private parseEmailMessage;
    /**
     * Extract email addresses from parsed email
     */
    private extractEmailAddresses;
    /**
     * Extract attachments from parsed email
     */
    private extractAttachments;
    /**
 * Convert parsed headers to EmailHeaders format
 */
    private convertHeaders;
    /**
     * Extract email flags from IMAP attributes
     */
    private extractFlags;
    /**
     * Handle connection loss and implement auto-reconnect
     */
    private handleConnectionLoss;
    /**
     * Get connection status for all accounts
     */
    getConnectionStatus(): Map<string, boolean>;
    /**
     * Get account information
     */
    getAccounts(): EmailAccount[];
    /**
     * Remove account and close connection
     */
    removeAccount(accountId: string): Promise<void>;
    /**
     * Manually trigger sync for an account
     */
    syncAccount(accountId: string): Promise<void>;
    /**
     * Graceful shutdown - close all connections
     */
    shutdown(): Promise<void>;
    /**
     * Health check for all connections
     */
    healthCheck(): Promise<Map<string, boolean>>;
}
//# sourceMappingURL=ImapService.d.ts.map