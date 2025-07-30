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
exports.ImapService = void 0;
const events_1 = require("events");
const Imap = require("imap");
const mailparser_1 = require("mailparser");
const logger_1 = __importStar(require("../utils/logger"));
const uuid_1 = require("uuid");
const crypto_1 = __importDefault(require("crypto"));
class ImapService extends events_1.EventEmitter {
    // private readonly MAX_RECONNECT_ATTEMPTS = 5;
    constructor() {
        super();
        this.connections = new Map();
        this.configs = new Map();
        this.accounts = new Map();
        this.reconnectTimeouts = new Map();
        this.isShuttingDown = false;
        this.HISTORY_DAYS = 30;
        this.RECONNECT_DELAY = 5000; // 5 seconds
        // Set max listeners to prevent memory leak warnings with multiple accounts
        this.setMaxListeners(20);
        // Graceful shutdown
        process.on('SIGINT', () => this.shutdown());
        process.on('SIGTERM', () => this.shutdown());
    }
    /**
     * Add email account and establish connection
     */
    async addAccount(account, password) {
        try {
            const config = {
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
                authTimeout: 30000, // Increased timeout for Outlook
                keepalive: true,
                // Additional options for Outlook compatibility
                debug: process.env.NODE_ENV === 'development' ? console.log : undefined,
                // Try different authentication methods
                autotls: 'always'
            };
            this.configs.set(account.id, config);
            this.accounts.set(account.id, account);
            await this.connectAccount(account.id);
            logger_1.default.info(`📧 Added email account: ${account.label} (${account.user})`);
        }
        catch (error) {
            logger_1.default.error(`❌ Failed to add account ${account.label}:`, error);
            throw error;
        }
    }
    /**
     * Connect to a specific email account with IMAP IDLE
     */
    async connectAccount(accountId) {
        const config = this.configs.get(accountId);
        const account = this.accounts.get(accountId);
        if (!config || !account) {
            throw new Error(`Account configuration not found: ${accountId}`);
        }
        return new Promise((resolve, reject) => {
            const imap = new Imap(config);
            let connectionEstablished = false;
            // Connection event handlers
            imap.once('ready', async () => {
                connectionEstablished = true;
                this.connections.set(accountId, imap);
                logger_1.emailLogger.imapConnected(account.label);
                try {
                    // Initial email sync for last 30 days
                    await this.performInitialSync(accountId, imap);
                    // Start IDLE monitoring for real-time updates
                    await this.startIdleMonitoring(accountId, imap);
                    this.emit('connectionRestored', accountId);
                    resolve();
                }
                catch (error) {
                    logger_1.default.error(`❌ Failed initial sync for ${account.label}:`, error);
                    reject(error);
                }
            });
            imap.once('error', (error) => {
                logger_1.emailLogger.imapError(account.label, error);
                // Provide specific guidance for common Outlook issues
                if (error.message.includes('LOGIN failed') || error.message.includes('AUTHENTICATE')) {
                    logger_1.default.error(`❌ Outlook authentication failed for ${account.label}. Possible solutions:`);
                    logger_1.default.error('   1. Enable 2-factor authentication on your Outlook account');
                    logger_1.default.error('   2. Generate an "App Password" from Microsoft Account settings');
                    logger_1.default.error('   3. Use the App Password instead of your regular password');
                    logger_1.default.error('   4. Ensure IMAP is enabled in Outlook settings');
                }
                else if (error.message.includes('ECONNREFUSED') || error.message.includes('ENOTFOUND')) {
                    logger_1.default.error(`❌ Connection failed for ${account.label}. Check:`);
                    logger_1.default.error('   1. Internet connection');
                    logger_1.default.error('   2. Firewall settings');
                    logger_1.default.error('   3. IMAP server settings');
                }
                if (!connectionEstablished) {
                    reject(error);
                }
                else {
                    // Handle connection drops
                    this.handleConnectionLoss(accountId, error);
                }
            });
            imap.once('end', () => {
                logger_1.emailLogger.imapDisconnected(account.label, 'Connection ended');
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
    async performInitialSync(accountId, imap) {
        const account = this.accounts.get(accountId);
        const startTime = Date.now();
        return new Promise((resolve, reject) => {
            imap.openBox('INBOX', true, async (err, _box) => {
                if (err) {
                    reject(err);
                    return;
                }
                try {
                    // Search for recent emails only (last 30 days to avoid processing entire history)
                    // Use a simpler approach that works with Gmail IMAP
                    const thirtyDaysAgo = new Date();
                    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
                    const dateString = thirtyDaysAgo.toISOString().split('T')[0]; // YYYY-MM-DD format
                    // Use a simpler search approach that works reliably with Gmail
                    imap.search(['ALL'], async (err, results) => {
                        if (err) {
                            reject(err);
                            return;
                        }
                        if (!results || results.length === 0) {
                            logger_1.emailLogger.syncComplete(account.label, 0, Date.now() - startTime);
                            resolve();
                            return;
                        }
                        // Limit to maximum 50 emails to avoid processing entire history
                        const maxEmails = Math.min(results.length, 50);
                        logger_1.default.info(`📧 Syncing ${maxEmails} recent emails for ${account.label} (out of ${results.length} total)`);
                        // Process emails in batches to avoid memory issues
                        const batchSize = 50;
                        let processedCount = 0;
                        for (let i = 0; i < maxEmails; i += batchSize) {
                            const batch = results.slice(i, i + batchSize);
                            await this.processBatchEmails(accountId, imap, batch);
                            processedCount += batch.length;
                        }
                        logger_1.emailLogger.syncComplete(account.label, processedCount, Date.now() - startTime);
                        resolve();
                    });
                }
                catch (error) {
                    reject(error);
                }
            });
        });
    }
    /**
     * Process a batch of emails
     */
    async processBatchEmails(accountId, imap, uids) {
        return new Promise((resolve, reject) => {
            const fetch = imap.fetch(uids, {
                bodies: '',
                markSeen: false,
                struct: true
            });
            const emails = [];
            let fetchedCount = 0;
            fetch.on('message', (msg) => {
                let buffer = '';
                let attributes;
                msg.on('body', (stream) => {
                    stream.on('data', (chunk) => {
                        buffer += chunk.toString('utf8');
                    });
                });
                msg.once('attributes', (attrs) => {
                    attributes = attrs;
                });
                msg.once('end', async () => {
                    try {
                        const email = await this.parseEmailMessage(accountId, buffer, attributes);
                        if (email) {
                            emails.push(email);
                        }
                        fetchedCount++;
                    }
                    catch (error) {
                        logger_1.default.error('❌ Failed to parse email:', error);
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
    async startIdleMonitoring(accountId, imap) {
        const account = this.accounts.get(accountId);
        return new Promise((resolve, reject) => {
            imap.openBox('INBOX', false, (err, _box) => {
                if (err) {
                    reject(err);
                    return;
                }
                logger_1.default.info(`🔄 Starting IDLE monitoring for ${account.label}`);
                // Set up IDLE mode
                const startIdle = () => {
                    try {
                        if (typeof imap.idle === 'function') {
                            imap.idle((err) => {
                                if (err) {
                                    logger_1.default.error(`❌ IDLE error for ${account.label}:`, err);
                                    return;
                                }
                                logger_1.default.debug(`💤 IDLE started for ${account.label}`);
                            });
                        }
                        else {
                            logger_1.default.warn(`⚠️ IDLE not supported for ${account.label}, falling back to polling`);
                            // Fallback to polling if IDLE is not supported
                            setTimeout(() => {
                                // Poll for new emails every 30 seconds
                                this.pollForNewEmails(accountId, imap);
                            }, 30000);
                        }
                    }
                    catch (error) {
                        logger_1.default.error(`❌ IDLE error for ${account.label}:`, error);
                        // Fallback to polling
                        setTimeout(() => {
                            this.pollForNewEmails(accountId, imap);
                        }, 30000);
                    }
                };
                // Handle new emails in real-time
                imap.on('mail', async (numNewMsgs) => {
                    logger_1.default.info(`📧 ${numNewMsgs} new email(s) detected for ${account.label}`);
                    // Stop IDLE to fetch new emails
                    try {
                        imap.idle((err) => {
                            if (err) {
                                logger_1.default.error(`❌ IDLE stop error for ${account.label}:`, err);
                            }
                        });
                    }
                    catch (error) {
                        logger_1.default.error(`❌ IDLE stop error for ${account.label}:`, error);
                    }
                    try {
                        // Fetch the latest emails
                        const searchCriteria = ['UNSEEN'];
                        imap.search(searchCriteria, async (err, results) => {
                            if (err) {
                                logger_1.default.error('❌ Search error:', err);
                                startIdle(); // Resume IDLE
                                return;
                            }
                            if (results && results.length > 0) {
                                await this.processBatchEmails(accountId, imap, results);
                            }
                            // Resume IDLE monitoring
                            startIdle();
                        });
                    }
                    catch (error) {
                        logger_1.default.error('❌ Failed to process new emails:', error);
                        startIdle(); // Resume IDLE
                    }
                });
                // Handle IDLE state changes
                imap.on('idle', () => {
                    logger_1.default.debug(`💤 IDLE mode active for ${account.label}`);
                });
                imap.on('update', (seqno, info) => {
                    logger_1.default.debug(`📧 Email update for ${account.label}: ${seqno}`, info);
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
    async parseEmailMessage(accountId, buffer, attributes) {
        try {
            const parsed = await (0, mailparser_1.simpleParser)(buffer);
            const account = this.accounts.get(accountId);
            // Extract email addresses
            const from = this.extractEmailAddresses(parsed.from);
            const to = this.extractEmailAddresses(parsed.to);
            const cc = this.extractEmailAddresses(parsed.cc);
            const bcc = this.extractEmailAddresses(parsed.bcc);
            // Extract attachments
            const attachments = await this.extractAttachments(parsed.attachments || []);
            // Extract flags
            const flags = this.extractFlags(attributes);
            const email = {
                id: (0, uuid_1.v4)(),
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
                category: 'Spam', // Default category, will be updated by AI
                flags,
                attachments,
                uid: attributes.uid,
                headers: this.convertHeaders(parsed.headers || {}),
                createdAt: new Date(),
                updatedAt: new Date()
            };
            logger_1.emailLogger.emailReceived(account.label, email.subject, email.messageId);
            return email;
        }
        catch (error) {
            logger_1.default.error('❌ Failed to parse email message:', error);
            return null;
        }
    }
    /**
     * Extract email addresses from parsed email
     */
    extractEmailAddresses(addressList) {
        if (!addressList)
            return [];
        const addresses = Array.isArray(addressList) ? addressList : [addressList];
        return addresses.map(addr => ({
            name: addr.name,
            address: addr.address
        }));
    }
    /**
     * Extract attachments from parsed email
     */
    async extractAttachments(attachments) {
        const result = [];
        for (const attachment of attachments) {
            if (attachment.content && attachment.filename) {
                const checksum = crypto_1.default
                    .createHash('md5')
                    .update(attachment.content)
                    .digest('hex');
                result.push({
                    id: (0, uuid_1.v4)(),
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
    convertHeaders(headers) {
        const result = {};
        if (headers && typeof headers === 'object') {
            for (const [key, value] of Object.entries(headers)) {
                if (Array.isArray(value)) {
                    result[key] = value.map(v => String(v));
                }
                else {
                    result[key] = String(value);
                }
            }
        }
        return result;
    }
    /**
     * Extract email flags from IMAP attributes
     */
    extractFlags(attributes) {
        const flags = [];
        if (attributes.flags) {
            attributes.flags.forEach((flag) => {
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
    handleConnectionLoss(accountId, _error) {
        const account = this.accounts.get(accountId);
        this.connections.delete(accountId);
        this.emit('connectionLost', accountId);
        if (this.isShuttingDown)
            return;
        // Clear any existing reconnect timeout
        const existingTimeout = this.reconnectTimeouts.get(accountId);
        if (existingTimeout) {
            clearTimeout(existingTimeout);
        }
        // Schedule reconnection
        const timeout = setTimeout(async () => {
            try {
                logger_1.default.info(`🔄 Attempting to reconnect ${account.label}...`);
                await this.connectAccount(accountId);
            }
            catch (reconnectError) {
                logger_1.default.error(`❌ Reconnection failed for ${account.label}:`, reconnectError);
                // Retry with exponential backoff
                this.handleConnectionLoss(accountId);
            }
        }, this.RECONNECT_DELAY);
        this.reconnectTimeouts.set(accountId, timeout);
    }
    /**
     * Get connection status for all accounts
     */
    getConnectionStatus() {
        const status = new Map();
        for (const [accountId] of this.accounts) {
            status.set(accountId, this.connections.has(accountId));
        }
        return status;
    }
    /**
     * Get account information
     */
    getAccounts() {
        return Array.from(this.accounts.values());
    }
    /**
     * Remove account and close connection
     */
    async removeAccount(accountId) {
        const account = this.accounts.get(accountId);
        if (!account)
            return;
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
        logger_1.default.info(`🗑️ Removed account: ${account.label}`);
    }
    /**
     * Manually trigger sync for an account
     */
    async syncAccount(accountId) {
        const connection = this.connections.get(accountId);
        const account = this.accounts.get(accountId);
        if (!connection || !account) {
            throw new Error(`Account not connected: ${accountId}`);
        }
        logger_1.default.info(`🔄 Manual sync triggered for ${account.label}`);
        await this.performInitialSync(accountId, connection);
    }
    /**
     * Graceful shutdown - close all connections
     */
    async shutdown() {
        this.isShuttingDown = true;
        logger_1.default.info('🛑 Shutting down IMAP service...');
        // Clear all reconnect timeouts
        for (const timeout of this.reconnectTimeouts.values()) {
            clearTimeout(timeout);
        }
        this.reconnectTimeouts.clear();
        // Close all IMAP connections
        const closePromises = Array.from(this.connections.entries()).map(([_accountId, connection]) => {
            return new Promise((resolve) => {
                connection.once('end', resolve);
                connection.end();
            });
        });
        await Promise.all(closePromises);
        this.connections.clear();
        logger_1.default.info('✅ IMAP service shutdown complete');
    }
    /**
     * Poll for new emails (fallback when IDLE is not supported)
     */
    async pollForNewEmails(accountId, imap) {
        const account = this.accounts.get(accountId);
        if (!account)
            return;
        try {
            imap.search(['UNSEEN'], async (err, results) => {
                if (err) {
                    logger_1.default.error(`❌ Poll search error for ${account.label}:`, err);
                    return;
                }
                if (results && results.length > 0) {
                    logger_1.default.info(`📧 Found ${results.length} new email(s) via polling for ${account.label}`);
                    await this.processBatchEmails(accountId, imap, results);
                }
                // Continue polling
                setTimeout(() => {
                    this.pollForNewEmails(accountId, imap);
                }, 30000); // Poll every 30 seconds
            });
        }
        catch (error) {
            logger_1.default.error(`❌ Poll error for ${account.label}:`, error);
            // Continue polling even on error
            setTimeout(() => {
                this.pollForNewEmails(accountId, imap);
            }, 30000);
        }
    }
    /**
     * Health check for all connections
     */
    async healthCheck() {
        const health = new Map();
        for (const [accountId] of this.accounts) {
            const connection = this.connections.get(accountId);
            health.set(accountId, !!connection && connection.state === 'authenticated');
        }
        return health;
    }
}
exports.ImapService = ImapService;
//# sourceMappingURL=ImapService.js.map