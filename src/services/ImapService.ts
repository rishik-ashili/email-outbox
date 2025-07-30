import { EventEmitter } from 'events';
import Imap = require('imap');
import { simpleParser, ParsedMail } from 'mailparser';
import {
    Email,
    EmailAccount,
    ImapConfig,
    EmailAddress,
    EmailAttachment,
    EmailFlag,
    EmailCategory,
    EmailServiceEvents
} from '../types';
import logger, { emailLogger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

interface ImapServiceEvents extends EmailServiceEvents { }

export class ImapService extends EventEmitter {
    private connections: Map<string, any> = new Map();
    private configs: Map<string, ImapConfig> = new Map();
    private accounts: Map<string, EmailAccount> = new Map();
    private reconnectTimeouts: Map<string, NodeJS.Timeout> = new Map();
    private isShuttingDown = false;
    private readonly HISTORY_DAYS = 30;
    private readonly RECONNECT_DELAY = 5000; // 5 seconds
    // private readonly MAX_RECONNECT_ATTEMPTS = 5;

    constructor() {
        super();

        // Set max listeners to prevent memory leak warnings with multiple accounts
        this.setMaxListeners(20);

        // Graceful shutdown
        process.on('SIGINT', () => this.shutdown());
        process.on('SIGTERM', () => this.shutdown());
    }

    /**
     * Add email account and establish connection
     */
    async addAccount(account: EmailAccount, password: string): Promise<void> {
        try {
            const config: ImapConfig = {
                user: account.user,
                password,
                host: account.host,
                port: account.port,
                tls: account.tls,
                tlsOptions: {
                    rejectUnauthorized: false,
                    servername: account.host
                },
                connTimeout: 60000,
                authTimeout: 10000,
                keepalive: true
            };

            this.configs.set(account.id, config);
            this.accounts.set(account.id, account);

            await this.connectAccount(account.id);

            logger.info(`📧 Added email account: ${account.label} (${account.user})`);
        } catch (error) {
            logger.error(`❌ Failed to add account ${account.label}:`, error);
            throw error;
        }
    }

    /**
     * Connect to a specific email account with IMAP IDLE
     */
    private async connectAccount(accountId: string): Promise<void> {
        const config = this.configs.get(accountId);
        const account = this.accounts.get(accountId);

        if (!config || !account) {
            throw new Error(`Account configuration not found: ${accountId}`);
        }

        return new Promise((resolve, reject) => {
            const imap = new (Imap as any)(config);
            let connectionEstablished = false;

            // Connection event handlers
            imap.once('ready', async () => {
                connectionEstablished = true;
                this.connections.set(accountId, imap);
                emailLogger.imapConnected(account.label);

                try {
                    // Initial email sync for last 30 days
                    await this.performInitialSync(accountId, imap);

                    // Start IDLE monitoring for real-time updates
                    await this.startIdleMonitoring(accountId, imap);

                    this.emit('connectionRestored', accountId);
                    resolve();
                } catch (error) {
                    logger.error(`❌ Failed initial sync for ${account.label}:`, error);
                    reject(error);
                }
            });

            imap.once('error', (error: Error) => {
                emailLogger.imapError(account.label, error);

                if (!connectionEstablished) {
                    reject(error);
                } else {
                    // Handle connection drops
                    this.handleConnectionLoss(accountId, error);
                }
            });

            imap.once('end', () => {
                emailLogger.imapDisconnected(account.label, 'Connection ended');
                this.connections.delete(accountId);

                if (!this.isShuttingDown) {
                    this.handleConnectionLoss(accountId);
                }
            });

            // Establish connection
            imap.connect();
        });
    }

    /**
     * Perform initial email sync for last 30 days
     */
    private async performInitialSync(accountId: string, imap: any): Promise<void> {
        const account = this.accounts.get(accountId)!;
        const startTime = Date.now();

        return new Promise((resolve, reject) => {
            imap.openBox('INBOX', true, async (err: Error | null, _box: any) => {
                if (err) {
                    reject(err);
                    return;
                }

                try {
                    // Search for all emails (simplified to avoid IMAP date format issues)
                    // We'll limit processing to recent emails in the processing logic
                    imap.search(['ALL'], async (err: Error | null, results?: number[]) => {
                        if (err) {
                            reject(err);
                            return;
                        }

                        if (!results || results.length === 0) {
                            emailLogger.syncComplete(account.label, 0, Date.now() - startTime);
                            resolve();
                            return;
                        }

                        logger.info(`📧 Syncing ${results!.length} emails for ${account.label}`);

                        // Process emails in batches to avoid memory issues
                        const batchSize = 50;
                        let processedCount = 0;

                        for (let i = 0; i < results!.length; i += batchSize) {
                            const batch = results!.slice(i, i + batchSize);
                            await this.processBatchEmails(accountId, imap, batch);
                            processedCount += batch.length;
                        }

                        emailLogger.syncComplete(account.label, processedCount, Date.now() - startTime);
                        resolve();
                    });
                } catch (error) {
                    reject(error);
                }
            });
        });
    }

    /**
     * Process a batch of emails
     */
    private async processBatchEmails(accountId: string, imap: any, uids: number[]): Promise<void> {
        return new Promise((resolve, reject) => {
            const fetch = imap.fetch(uids, {
                bodies: '',
                markSeen: false,
                struct: true
            });

            const emails: Email[] = [];
            let fetchedCount = 0;

            fetch.on('message', (msg: any) => {
                let buffer = '';
                let attributes: any;

                msg.on('body', (stream: any) => {
                    stream.on('data', (chunk: any) => {
                        buffer += chunk.toString('utf8');
                    });
                });

                msg.once('attributes', (attrs: any) => {
                    attributes = attrs;
                });

                msg.once('end', async () => {
                    try {
                        const email = await this.parseEmailMessage(accountId, buffer, attributes);
                        if (email) {
                            emails.push(email);
                        }
                        fetchedCount++;
                    } catch (error) {
                        logger.error('❌ Failed to parse email:', error);
                        fetchedCount++;
                    }
                });
            });

            fetch.once('error', reject);

            fetch.once('end', () => {
                // Emit all emails from this batch
                emails.forEach(email => {
                    this.emit('newEmail', email);
                });
                resolve();
            });
        });
    }

    /**
     * Start IDLE monitoring for real-time email detection
     */
    private async startIdleMonitoring(accountId: string, imap: any): Promise<void> {
        const account = this.accounts.get(accountId)!;

        return new Promise((resolve, reject) => {
            imap.openBox('INBOX', false, (err: Error | null, _box: any) => {
                if (err) {
                    reject(err);
                    return;
                }

                logger.info(`🔄 Starting IDLE monitoring for ${account.label}`);

                // Set up IDLE mode
                const startIdle = () => {
                    try {
                        imap.idle((err: Error | null) => {
                            if (err) {
                                logger.error(`❌ IDLE error for ${account.label}:`, err);
                                return;
                            }
                            logger.debug(`💤 IDLE started for ${account.label}`);
                        });
                    } catch (error) {
                        logger.error(`❌ IDLE error for ${account.label}:`, error);
                    }
                };

                // Handle new emails in real-time
                imap.on('mail', async (numNewMsgs: number) => {
                    logger.info(`📧 ${numNewMsgs} new email(s) detected for ${account.label}`);

                    // Stop IDLE to fetch new emails
                    imap.idle((err: Error | null) => {
                        if (err) {
                            logger.error(`❌ IDLE stop error for ${account.label}:`, err);
                        }
                    });

                    try {
                        // Fetch the latest emails
                        const searchCriteria = ['UNSEEN'];
                        imap.search(searchCriteria, async (err: Error | null, results?: number[]) => {
                            if (err) {
                                logger.error('❌ Search error:', err);
                                startIdle(); // Resume IDLE
                                return;
                            }

                            if (results && results.length > 0) {
                                await this.processBatchEmails(accountId, imap, results);
                            }

                            // Resume IDLE monitoring
                            startIdle();
                        });
                    } catch (error) {
                        logger.error('❌ Failed to process new emails:', error);
                        startIdle(); // Resume IDLE
                    }
                });

                // Handle IDLE state changes
                imap.on('idle', () => {
                    logger.debug(`💤 IDLE mode active for ${account.label}`);
                });

                imap.on('update', (seqno: number, info: any) => {
                    logger.debug(`📧 Email update for ${account.label}: ${seqno}`, info);
                });

                // Start IDLE monitoring
                startIdle();
                resolve();
            });
        });
    }

    /**
     * Parse email message from IMAP buffer
     */
    private async parseEmailMessage(accountId: string, buffer: string, attributes: any): Promise<Email | null> {
        try {
            const parsed: ParsedMail = await simpleParser(buffer);
            const account = this.accounts.get(accountId)!;

            // Extract email addresses
            const from = this.extractEmailAddresses(parsed.from);
            const to = this.extractEmailAddresses(parsed.to);
            const cc = this.extractEmailAddresses(parsed.cc);
            const bcc = this.extractEmailAddresses(parsed.bcc);

            // Extract attachments
            const attachments = await this.extractAttachments(parsed.attachments || []);

            // Extract flags
            const flags = this.extractFlags(attributes);

            const email: Email = {
                id: uuidv4(),
                messageId: parsed.messageId || `${Date.now()}-${Math.random()}`,
                from,
                to,
                cc,
                bcc,
                subject: parsed.subject || '(no subject)',
                body: parsed.text || '',
                htmlBody: parsed.html || undefined,
                date: parsed.date || new Date(),
                account: account.label,
                folder: 'INBOX', // TODO: Handle multiple folders
                category: 'Spam' as EmailCategory, // Default category, will be updated by AI
                flags,
                attachments,
                uid: attributes.uid,
                headers: this.convertHeaders(parsed.headers || {}),
                createdAt: new Date(),
                updatedAt: new Date()
            };

            emailLogger.emailReceived(account.label, email.subject, email.messageId);
            return email;
        } catch (error) {
            logger.error('❌ Failed to parse email message:', error);
            return null;
        }
    }

    /**
     * Extract email addresses from parsed email
     */
    private extractEmailAddresses(addressList: any): EmailAddress[] {
        if (!addressList) return [];

        const addresses = Array.isArray(addressList) ? addressList : [addressList];
        return addresses.map(addr => ({
            name: addr.name,
            address: addr.address
        }));
    }

    /**
     * Extract attachments from parsed email
     */
    private async extractAttachments(attachments: any[]): Promise<EmailAttachment[]> {
        const result: EmailAttachment[] = [];

        for (const attachment of attachments) {
            if (attachment.content && attachment.filename) {
                const checksum = crypto
                    .createHash('md5')
                    .update(attachment.content)
                    .digest('hex');

                result.push({
                    id: uuidv4(),
                    filename: attachment.filename,
                    contentType: attachment.contentType || 'application/octet-stream',
                    size: attachment.size || attachment.content.length,
                    checksum,
                    content: attachment.content
                });
            }
        }

        return result;
    }

    /**
 * Convert parsed headers to EmailHeaders format
 */
    private convertHeaders(headers: any): { [key: string]: string | string[] } {
        const result: { [key: string]: string | string[] } = {};

        if (headers && typeof headers === 'object') {
            for (const [key, value] of Object.entries(headers)) {
                if (Array.isArray(value)) {
                    result[key] = value.map(v => String(v));
                } else {
                    result[key] = String(value);
                }
            }
        }

        return result;
    }

    /**
     * Extract email flags from IMAP attributes
     */
    private extractFlags(attributes: any): EmailFlag[] {
        const flags: EmailFlag[] = [];

        if (attributes.flags) {
            attributes.flags.forEach((flag: string) => {
                switch (flag.toLowerCase()) {
                    case '\\seen':
                        flags.push('Seen');
                        break;
                    case '\\answered':
                        flags.push('Answered');
                        break;
                    case '\\flagged':
                        flags.push('Flagged');
                        break;
                    case '\\deleted':
                        flags.push('Deleted');
                        break;
                    case '\\draft':
                        flags.push('Draft');
                        break;
                    case '\\recent':
                        flags.push('Recent');
                        break;
                }
            });
        }

        return flags;
    }

    /**
     * Handle connection loss and implement auto-reconnect
     */
    private handleConnectionLoss(accountId: string, _error?: Error): void {
        const account = this.accounts.get(accountId)!;

        this.connections.delete(accountId);
        this.emit('connectionLost', accountId);

        if (this.isShuttingDown) return;

        // Clear any existing reconnect timeout
        const existingTimeout = this.reconnectTimeouts.get(accountId);
        if (existingTimeout) {
            clearTimeout(existingTimeout);
        }

        // Schedule reconnection
        const timeout = setTimeout(async () => {
            try {
                logger.info(`🔄 Attempting to reconnect ${account.label}...`);
                await this.connectAccount(accountId);
            } catch (reconnectError) {
                logger.error(`❌ Reconnection failed for ${account.label}:`, reconnectError);
                // Retry with exponential backoff
                this.handleConnectionLoss(accountId);
            }
        }, this.RECONNECT_DELAY);

        this.reconnectTimeouts.set(accountId, timeout);
    }

    /**
     * Get connection status for all accounts
     */
    getConnectionStatus(): Map<string, boolean> {
        const status = new Map<string, boolean>();

        for (const [accountId] of this.accounts) {
            status.set(accountId, this.connections.has(accountId));
        }

        return status;
    }

    /**
     * Get account information
     */
    getAccounts(): EmailAccount[] {
        return Array.from(this.accounts.values());
    }

    /**
     * Remove account and close connection
     */
    async removeAccount(accountId: string): Promise<void> {
        const account = this.accounts.get(accountId);
        if (!account) return;

        // Clear reconnect timeout
        const timeout = this.reconnectTimeouts.get(accountId);
        if (timeout) {
            clearTimeout(timeout);
            this.reconnectTimeouts.delete(accountId);
        }

        // Close IMAP connection
        const connection = this.connections.get(accountId);
        if (connection) {
            connection.end();
            this.connections.delete(accountId);
        }

        // Remove from maps
        this.accounts.delete(accountId);
        this.configs.delete(accountId);

        logger.info(`🗑️ Removed account: ${account.label}`);
    }

    /**
     * Manually trigger sync for an account
     */
    async syncAccount(accountId: string): Promise<void> {
        const connection = this.connections.get(accountId);
        const account = this.accounts.get(accountId);

        if (!connection || !account) {
            throw new Error(`Account not connected: ${accountId}`);
        }

        logger.info(`🔄 Manual sync triggered for ${account.label}`);
        await this.performInitialSync(accountId, connection);
    }

    /**
     * Graceful shutdown - close all connections
     */
    async shutdown(): Promise<void> {
        this.isShuttingDown = true;

        logger.info('🛑 Shutting down IMAP service...');

        // Clear all reconnect timeouts
        for (const timeout of this.reconnectTimeouts.values()) {
            clearTimeout(timeout);
        }
        this.reconnectTimeouts.clear();

        // Close all IMAP connections
        const closePromises = Array.from(this.connections.entries()).map(([_accountId, connection]) => {
            return new Promise<void>((resolve) => {
                connection.once('end', resolve);
                connection.end();
            });
        });

        await Promise.all(closePromises);
        this.connections.clear();

        logger.info('✅ IMAP service shutdown complete');
    }

    /**
     * Health check for all connections
     */
    async healthCheck(): Promise<Map<string, boolean>> {
        const health = new Map<string, boolean>();

        for (const [accountId] of this.accounts) {
            const connection = this.connections.get(accountId);
            health.set(accountId, !!connection && connection.state === 'authenticated');
        }

        return health;
    }
}

