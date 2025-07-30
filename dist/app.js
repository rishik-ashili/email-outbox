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
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const dotenv_1 = __importDefault(require("dotenv"));
const ElasticsearchService_1 = require("./services/ElasticsearchService");
const ImapService_1 = require("./services/ImapService");
const AIService_1 = require("./services/AIService");
const NotificationService_1 = require("./services/NotificationService");
const VectorService_1 = require("./services/VectorService");
const ChatService_1 = require("./services/ChatService");
const logger_1 = __importStar(require("./utils/logger"));
const uuid_1 = require("uuid");
// Load environment variables
dotenv_1.default.config();
class EmailOneboxApp {
    constructor() {
        this.isInitialized = false;
        this.app = (0, express_1.default)();
        this.initializeMiddleware();
        this.initializeServices();
        this.setupEmailProcessingPipeline();
        this.setupRoutes();
        this.setupErrorHandling();
    }
    /**
     * Initialize Express middleware
     */
    initializeMiddleware() {
        // Security middleware
        this.app.use((0, helmet_1.default)({
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    styleSrc: ["'self'", "'unsafe-inline'"],
                    scriptSrc: ["'self'"],
                    imgSrc: ["'self'", "data:", "https:"],
                },
            },
        }));
        // CORS configuration
        this.app.use((0, cors_1.default)({
            origin: process.env.CORS_ORIGIN || 'http://localhost:3001',
            credentials: true,
            optionsSuccessStatus: 200
        }));
        // Rate limiting
        const rateLimiter = (0, express_rate_limit_1.default)({
            windowMs: parseInt(process.env.API_RATE_WINDOW || '900000'), // 15 minutes
            max: parseInt(process.env.API_RATE_LIMIT || '100'), // Limit each IP to 100 requests per windowMs
            message: {
                error: 'Too many requests from this IP, please try again later.',
                retryAfter: '15 minutes'
            },
            standardHeaders: true,
            legacyHeaders: false,
        });
        this.app.use('/api/', rateLimiter);
        // Body parsing middleware
        this.app.use(express_1.default.json({ limit: '10mb' }));
        this.app.use(express_1.default.urlencoded({ extended: true, limit: '10mb' }));
        // Request logging
        this.app.use((req, res, next) => {
            const startTime = Date.now();
            res.on('finish', () => {
                const duration = Date.now() - startTime;
                logger_1.default.info(`${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
            });
            next();
        });
        logger_1.default.info('✅ Express middleware initialized');
    }
    /**
     * Initialize all services
     */
    initializeServices() {
        try {
            // Elasticsearch configuration
            const elasticsearchConfig = {
                node: process.env.ELASTICSEARCH_URL || 'http://localhost:9200',
                index: process.env.ELASTICSEARCH_INDEX || 'emails',
                logLevel: process.env.ELASTICSEARCH_LOG_LEVEL || 'info'
            };
            // Gemini AI configuration
            const geminiConfig = {
                apiKey: process.env.GEMINI_API_KEY,
                model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
                temperature: parseFloat(process.env.GEMINI_TEMPERATURE || '0'),
                maxTokens: parseInt(process.env.GEMINI_MAX_TOKENS || '1000')
            };
            // OpenAI configuration (for embeddings only)
            const embeddingConfig = {
                apiKey: process.env.OPENAI_API_KEY
            };
            // AI processing configuration
            const aiProcessingConfig = {
                categorizationEnabled: process.env.AI_CATEGORIZATION_ENABLED !== 'false',
                replySuggestionsEnabled: process.env.AI_REPLY_SUGGESTIONS_ENABLED !== 'false',
                batchSize: parseInt(process.env.AI_BATCH_SIZE || '10'),
                retryAttempts: parseInt(process.env.AI_RETRY_ATTEMPTS || '3')
            };
            // Slack configuration
            const slackConfig = {
                botToken: process.env.SLACK_BOT_TOKEN || '',
                channel: process.env.SLACK_CHANNEL || '#general',
                enabled: process.env.SLACK_ENABLED !== 'false'
            };
            // Webhook configuration
            const webhookConfig = {
                url: process.env.WEBHOOK_URL || '',
                enabled: process.env.WEBHOOK_ENABLED !== 'false',
                retryAttempts: parseInt(process.env.WEBHOOK_RETRY_ATTEMPTS || '3'),
                timeout: parseInt(process.env.WEBHOOK_TIMEOUT || '5000')
            };
            // Pinecone configuration
            const pineconeConfig = {
                apiKey: process.env.PINECONE_API_KEY,
                index: process.env.PINECONE_INDEX,
                environment: process.env.PINECONE_ENVIRONMENT
            };
            // Initialize services
            this.elasticsearchService = new ElasticsearchService_1.ElasticsearchService(elasticsearchConfig);
            this.imapService = new ImapService_1.ImapService();
            this.aiService = new AIService_1.AIService(geminiConfig, aiProcessingConfig);
            this.notificationService = new NotificationService_1.NotificationService(slackConfig, webhookConfig);
            this.vectorService = new VectorService_1.VectorService(pineconeConfig, embeddingConfig);
            this.chatService = new ChatService_1.ChatService(geminiConfig, this.elasticsearchService);
            logger_1.default.info('✅ All services initialized');
        }
        catch (error) {
            logger_1.default.error('❌ Failed to initialize services:', error);
            throw error;
        }
    }
    /**
     * Setup the email processing pipeline
     */
    setupEmailProcessingPipeline() {
        // Listen for new emails from IMAP service
        this.imapService.on('newEmail', async (email) => {
            await this.processNewEmail(email);
        });
        // Listen for email categorization events
        this.imapService.on('emailCategorized', async (email, category) => {
            await this.notificationService.processEmailNotification(email, category);
        });
        // Listen for connection events
        this.imapService.on('connectionLost', (accountId) => {
            logger_1.default.warn(`🔌 Connection lost for account: ${accountId}`);
        });
        this.imapService.on('connectionRestored', (accountId) => {
            logger_1.default.info(`🔗 Connection restored for account: ${accountId}`);
        });
        logger_1.default.info('✅ Email processing pipeline configured');
    }
    /**
     * Process new email through the complete pipeline
     */
    async processNewEmail(email) {
        const startTime = Date.now();
        try {
            logger_1.default.info(`📧 Processing new email: ${email.subject} from ${email.from[0]?.address}`);
            // Step 1: Categorize email using AI (with fallback)
            let category = 'Spam';
            try {
                category = await this.aiService.categorizeEmail(email);
                email.category = category;
            }
            catch (aiError) {
                logger_1.default.warn(`⚠️ AI categorization failed, using default category:`, aiError);
                email.category = category;
            }
            // Step 2: Index email in Elasticsearch
            let indexed = false;
            try {
                indexed = await this.elasticsearchService.indexEmail(email);
                if (indexed) {
                    logger_1.default.info(`📊 Email indexed in Elasticsearch: ${email.id}`);
                }
                else {
                    logger_1.default.debug(`📊 Email already exists in Elasticsearch: ${email.id}`);
                }
            }
            catch (indexError) {
                logger_1.default.error('❌ Failed to index email in Elasticsearch:', indexError);
                // Continue processing even if indexing fails
            }
            // Step 3: Update email category in Elasticsearch (only if indexed)
            if (indexed) {
                try {
                    await this.elasticsearchService.updateEmailCategory(email.id, category);
                    logger_1.default.debug(`📊 Updated email category: ${email.id} -> ${category}`);
                }
                catch (updateError) {
                    logger_1.default.warn(`⚠️ Failed to update email category:`, updateError);
                    // Don't fail the pipeline for category update errors
                }
            }
            // Step 4: Store email context in vector database for RAG
            if (this.vectorService) {
                try {
                    const context = {
                        id: `email-${email.id}`,
                        content: `Subject: ${email.subject}\nFrom: ${email.from[0]?.address}\nBody: ${email.body}`,
                        metadata: {
                            type: 'email',
                            priority: (category === 'Interested' ? 'high' : 'medium'),
                            tags: [category, email.account, 'processed'],
                            createdAt: new Date(),
                            updatedAt: new Date()
                        }
                    };
                    await this.vectorService.storeContext(context);
                    logger_1.default.info(`🧠 Stored email context in vector database: ${email.id}`);
                }
                catch (vectorError) {
                    logger_1.default.warn(`⚠️ Failed to store email context in vector database:`, vectorError);
                    // Don't fail the entire email processing if vector storage fails
                }
            }
            // Step 5: Send notifications if email is "Interested"
            if (category === 'Interested') {
                try {
                    await this.notificationService.processEmailNotification(email, category);
                    logger_1.default.info(`🔔 Notification sent for interested email: ${email.subject}`);
                }
                catch (notificationError) {
                    logger_1.default.warn(`⚠️ Failed to send notification:`, notificationError);
                }
            }
            // Emit categorization event
            this.imapService.emit('emailCategorized', email, category);
            const duration = Date.now() - startTime;
            logger_1.performanceLogger.metric('email-processing', duration, {
                emailId: email.id,
                category,
                account: email.account
            });
            logger_1.default.info(`✅ Email processed successfully: ${email.subject} -> ${category} (${duration}ms)`);
        }
        catch (error) {
            logger_1.default.error('❌ Failed to process email:', error);
            // Try to index email with default category on error
            try {
                email.category = 'Spam';
                await this.elasticsearchService.indexEmail(email);
            }
            catch (indexError) {
                logger_1.default.error('❌ Failed to index email with fallback category:', indexError);
            }
        }
    }
    /**
     * Setup API routes
     */
    setupRoutes() {
        // Root endpoint - Welcome message
        this.app.get('/', (_req, res) => {
            res.json({
                success: true,
                message: 'Welcome to Email Onebox - AI-Powered Email Management System',
                version: '1.0.0',
                endpoints: {
                    health: '/health',
                    stats: '/api/stats',
                    chat: '/api/chat',
                    emails: '/api/emails',
                    accounts: '/api/accounts'
                },
                docs: 'Visit /health for system status or /api/stats for detailed statistics'
            });
        });
        // Health check endpoint
        this.app.get('/health', async (_req, res) => {
            try {
                const health = {
                    status: 'ok',
                    timestamp: new Date().toISOString(),
                    services: {
                        elasticsearch: await this.elasticsearchService.healthCheck(),
                        gemini: await this.aiService.healthCheck(),
                        notifications: await this.notificationService.healthCheck(),
                        vector: await this.vectorService.healthCheck(),
                        imap: await this.imapService.healthCheck(),
                        chat: await this.chatService.healthCheck()
                    }
                };
                const allHealthy = Object.values(health.services).every(Boolean);
                res.status(allHealthy ? 200 : 503).json(health);
            }
            catch (error) {
                res.status(503).json({
                    status: 'error',
                    message: 'Health check failed',
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        });
        // Get email statistics
        this.app.get('/api/stats', async (_req, res) => {
            try {
                const stats = await this.elasticsearchService.getEmailStats();
                const vectorStats = await this.vectorService.getStats();
                const notificationStats = this.notificationService.getNotificationStats();
                const imapStatus = this.imapService.getConnectionStatus();
                const chatStats = this.chatService.getStats();
                res.json({
                    success: true,
                    data: {
                        emails: stats,
                        vector: vectorStats,
                        notifications: notificationStats,
                        connections: Object.fromEntries(imapStatus),
                        chat: chatStats
                    },
                    timestamp: new Date().toISOString()
                });
            }
            catch (error) {
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error',
                    timestamp: new Date().toISOString()
                });
            }
        });
        // Get all emails (with pagination)
        this.app.get('/api/emails', async (req, res) => {
            try {
                const page = parseInt(req.query.page) || 1;
                const limit = parseInt(req.query.limit) || 20;
                const sortBy = req.query.sortBy || 'date';
                const sortOrder = req.query.sortOrder || 'desc';
                const category = req.query.category;
                const searchQuery = {
                    page,
                    limit,
                    sortBy,
                    sortOrder
                };
                if (category) {
                    searchQuery.category = category;
                }
                const emails = await this.elasticsearchService.searchEmails(searchQuery);
                return res.json({
                    success: true,
                    data: emails.data || [],
                    pagination: emails.pagination,
                    timestamp: new Date().toISOString()
                });
            }
            catch (error) {
                logger_1.default.error('❌ Failed to get emails:', error);
                return res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error',
                    timestamp: new Date().toISOString()
                });
            }
        });
        // Search emails
        this.app.get('/api/emails/search', async (req, res) => {
            try {
                const searchQuery = {
                    query: req.query.q,
                    account: req.query.account,
                    folder: req.query.folder,
                    category: req.query.category,
                    from: req.query.from,
                    to: req.query.to,
                    hasAttachments: req.query.hasAttachments === 'true',
                    page: parseInt(req.query.page) || 1,
                    limit: parseInt(req.query.limit) || 20,
                    sortBy: req.query.sortBy || 'date',
                    sortOrder: req.query.sortOrder || 'desc'
                };
                // Only add date fields if they're provided
                if (req.query.dateFrom) {
                    searchQuery.dateFrom = new Date(req.query.dateFrom);
                }
                if (req.query.dateTo) {
                    searchQuery.dateTo = new Date(req.query.dateTo);
                }
                const result = await this.elasticsearchService.searchEmails(searchQuery);
                res.json(result);
            }
            catch (error) {
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error',
                    timestamp: new Date().toISOString()
                });
            }
        });
        // Get specific email
        this.app.get('/api/emails/:id', async (req, res) => {
            try {
                const email = await this.elasticsearchService.getEmailById(req.params.id);
                if (!email) {
                    return res.status(404).json({
                        success: false,
                        error: 'Email not found',
                        timestamp: new Date().toISOString()
                    });
                }
                return res.json({
                    success: true,
                    data: email,
                    timestamp: new Date().toISOString()
                });
            }
            catch (error) {
                return res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error',
                    timestamp: new Date().toISOString()
                });
            }
        });
        // Generate reply suggestion
        this.app.post('/api/emails/:id/reply', async (req, res) => {
            try {
                const email = await this.elasticsearchService.getEmailById(req.params.id);
                if (!email) {
                    return res.status(404).json({
                        success: false,
                        error: 'Email not found',
                        timestamp: new Date().toISOString()
                    });
                }
                // Get relevant contexts from vector service
                const contexts = await this.vectorService.getRelevantContextsForEmail(email);
                // Generate reply using AI service
                const replyGeneration = await this.aiService.generateReplySuggestion(email, contexts);
                return res.json({
                    success: true,
                    data: replyGeneration,
                    timestamp: new Date().toISOString()
                });
            }
            catch (error) {
                return res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error',
                    timestamp: new Date().toISOString()
                });
            }
        });
        // Get connected accounts
        this.app.get('/api/accounts', (_req, res) => {
            try {
                const accounts = this.imapService.getAccounts();
                const connectionStatus = this.imapService.getConnectionStatus();
                const accountsWithStatus = accounts.map((account) => ({
                    ...account,
                    isConnected: connectionStatus.get(account.id) || false
                }));
                res.json({
                    success: true,
                    data: accountsWithStatus,
                    timestamp: new Date().toISOString()
                });
            }
            catch (error) {
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error',
                    timestamp: new Date().toISOString()
                });
            }
        });
        // Add email account
        this.app.post('/api/accounts', async (req, res) => {
            try {
                const { label, user, password, host, port } = req.body;
                // Validate required fields
                if (!label || !user || !password || !host || !port) {
                    return res.status(400).json({
                        success: false,
                        error: 'Missing required fields: label, user, password, host, port',
                        timestamp: new Date().toISOString()
                    });
                }
                // Create email account object
                const account = {
                    id: `${user}-${Date.now()}`,
                    label,
                    user,
                    host,
                    port: parseInt(port.toString()),
                    tls: true,
                    isActive: true
                };
                // Add account to IMAP service
                await this.imapService.addAccount(account, password);
                logger_1.default.info(`✅ Email account added successfully: ${label} (${user})`);
                return res.json({
                    success: true,
                    message: 'Email account added successfully',
                    data: {
                        id: account.id,
                        label: account.label,
                        user: account.user,
                        host: account.host,
                        port: account.port,
                        isConnected: false // Will be true once connection is established
                    },
                    timestamp: new Date().toISOString()
                });
            }
            catch (error) {
                logger_1.default.error('❌ Failed to add email account:', error);
                return res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error',
                    timestamp: new Date().toISOString()
                });
            }
        });
        // Test notifications
        this.app.post('/api/notifications/test', async (_req, res) => {
            try {
                const results = await this.notificationService.sendTestNotifications();
                res.json({
                    success: true,
                    data: results,
                    timestamp: new Date().toISOString()
                });
            }
            catch (error) {
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error',
                    timestamp: new Date().toISOString()
                });
            }
        });
        // Add RAG context
        this.app.post('/api/contexts', async (req, res) => {
            try {
                const { content, type, priority, tags } = req.body;
                if (!content || !type) {
                    return res.status(400).json({
                        success: false,
                        error: 'Content and type are required',
                        timestamp: new Date().toISOString()
                    });
                }
                const contextId = await this.vectorService.addContext(content, type, priority, tags);
                return res.json({
                    success: true,
                    data: { id: contextId },
                    timestamp: new Date().toISOString()
                });
            }
            catch (error) {
                return res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error',
                    timestamp: new Date().toISOString()
                });
            }
        });
        // Chat endpoints
        this.app.post('/api/chat', async (req, res) => {
            try {
                const { sessionId, message, emailIds } = req.body;
                if (!message) {
                    return res.status(400).json({
                        success: false,
                        error: 'Message is required',
                        timestamp: new Date().toISOString()
                    });
                }
                const chatResponse = await this.chatService.chat({
                    sessionId,
                    message,
                    emailIds
                });
                return res.json({
                    success: true,
                    data: chatResponse,
                    timestamp: new Date().toISOString()
                });
            }
            catch (error) {
                return res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error',
                    timestamp: new Date().toISOString()
                });
            }
        });
        // Get chat session
        this.app.get('/api/chat/:sessionId', async (req, res) => {
            try {
                const session = await this.chatService.getSession(req.params.sessionId);
                if (!session) {
                    return res.status(404).json({
                        success: false,
                        error: 'Chat session not found',
                        timestamp: new Date().toISOString()
                    });
                }
                return res.json({
                    success: true,
                    data: session,
                    timestamp: new Date().toISOString()
                });
            }
            catch (error) {
                return res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error',
                    timestamp: new Date().toISOString()
                });
            }
        });
        // Get all chat sessions
        this.app.get('/api/chat', async (req, res) => {
            try {
                const limit = parseInt(req.query.limit) || 10;
                const sessions = await this.chatService.getSessions(limit);
                return res.json({
                    success: true,
                    data: sessions,
                    timestamp: new Date().toISOString()
                });
            }
            catch (error) {
                return res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error',
                    timestamp: new Date().toISOString()
                });
            }
        });
        // Delete chat session
        this.app.delete('/api/chat/:sessionId', async (req, res) => {
            try {
                const deleted = await this.chatService.deleteSession(req.params.sessionId);
                if (!deleted) {
                    return res.status(404).json({
                        success: false,
                        error: 'Chat session not found',
                        timestamp: new Date().toISOString()
                    });
                }
                return res.json({
                    success: true,
                    message: 'Chat session deleted',
                    timestamp: new Date().toISOString()
                });
            }
            catch (error) {
                return res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error',
                    timestamp: new Date().toISOString()
                });
            }
        });
        // Get chat statistics
        this.app.get('/api/chat/stats', async (_req, res) => {
            try {
                const stats = this.chatService.getStats();
                return res.json({
                    success: true,
                    data: stats,
                    timestamp: new Date().toISOString()
                });
            }
            catch (error) {
                return res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error',
                    timestamp: new Date().toISOString()
                });
            }
        });
        // 404 handler
        this.app.use('*', (_req, res) => {
            res.status(404).json({
                success: false,
                error: 'Endpoint not found',
                timestamp: new Date().toISOString()
            });
        });
        logger_1.default.info('✅ API routes configured');
    }
    /**
     * Setup error handling
     */
    setupErrorHandling() {
        // Global error handler
        this.app.use((error, _req, res, _next) => {
            logger_1.default.error('💥 Unhandled error:', error);
            res.status(error.statusCode || 500).json({
                success: false,
                error: process.env.NODE_ENV === 'production'
                    ? 'Internal server error'
                    : error.message,
                timestamp: new Date().toISOString()
            });
        });
        // Handle unhandled promise rejections
        process.on('unhandledRejection', (reason, _promise) => {
            logger_1.default.error('💥 Unhandled Promise Rejection:', reason);
        });
        // Handle uncaught exceptions
        process.on('uncaughtException', (error) => {
            logger_1.default.error('💥 Uncaught Exception:', error);
            process.exit(1);
        });
        logger_1.default.info('✅ Error handling configured');
    }
    /**
     * Initialize all services and start email processing
     */
    async initialize() {
        if (this.isInitialized) {
            logger_1.default.warn('⚠️ App already initialized');
            return;
        }
        try {
            logger_1.default.info('🚀 Initializing Email Onebox application...');
            // Initialize services in order
            await this.elasticsearchService.initialize(5, 2000);
            await this.vectorService.initialize();
            // Start chat service cleanup schedule
            this.chatService.startCleanupSchedule();
            // Add email accounts from environment variables
            await this.addEmailAccountsFromEnv();
            this.isInitialized = true;
            logger_1.default.info('✅ Email Onebox application initialized successfully with Gemini AI and Chat functionality');
        }
        catch (error) {
            logger_1.default.error('❌ Failed to initialize application:', error);
            throw error;
        }
    }
    /**
     * Add email accounts from environment variables
     */
    async addEmailAccountsFromEnv() {
        const accounts = [];
        let accountIndex = 1;
        // Look for EMAIL1_USER, EMAIL2_USER, etc.
        while (true) {
            const userKey = `EMAIL${accountIndex}_USER`;
            const passKey = `EMAIL${accountIndex}_PASS`;
            const hostKey = `EMAIL${accountIndex}_HOST`;
            const portKey = `EMAIL${accountIndex}_PORT`;
            const labelKey = `EMAIL${accountIndex}_LABEL`;
            const user = process.env[userKey];
            const pass = process.env[passKey];
            const host = process.env[hostKey];
            const port = process.env[portKey];
            const label = process.env[labelKey];
            if (!user || !pass || !host) {
                break; // No more accounts
            }
            // Skip Yahoo accounts to avoid connection issues
            if (host.includes('yahoo.com') || host.includes('yahoo')) {
                logger_1.default.info(`⏭️ Skipping Yahoo account: ${user} (to avoid connection issues)`);
                accountIndex++;
                continue;
            }
            const account = {
                id: (0, uuid_1.v4)(),
                label: label || `Account ${accountIndex}`,
                user,
                host,
                port: parseInt(port || '993'),
                tls: true,
                isActive: true
            };
            accounts.push({ account, password: pass });
            accountIndex++;
        }
        if (accounts.length === 0) {
            logger_1.default.warn('⚠️ No email accounts configured in environment variables');
            return;
        }
        logger_1.default.info(`📧 Adding ${accounts.length} email accounts...`);
        for (const { account, password } of accounts) {
            try {
                await this.imapService.addAccount(account, password);
            }
            catch (error) {
                logger_1.default.error(`❌ Failed to add account ${account.label}:`, error);
            }
        }
    }
    /**
     * Start the Express server
     */
    start(port = 3000) {
        this.app.listen(port, () => {
            logger_1.default.info(`🚀 Email Onebox server running on port ${port}`);
            // Log memory usage periodically
            setInterval(() => {
                logger_1.performanceLogger.memory();
            }, 60000); // Every minute
        });
    }
    /**
     * Get Express app instance
     */
    getApp() {
        return this.app;
    }
    /**
     * Graceful shutdown
     */
    async shutdown() {
        logger_1.default.info('🛑 Shutting down Email Onebox application...');
        try {
            await this.imapService.shutdown();
            this.vectorService.clearCache();
            logger_1.default.info('✅ Email Onebox application shutdown complete');
        }
        catch (error) {
            logger_1.default.error('❌ Error during shutdown:', error);
        }
    }
}
// Initialize and start the application
const main = async () => {
    try {
        const app = new EmailOneboxApp();
        await app.initialize();
        const port = parseInt(process.env.PORT || '3000');
        app.start(port);
    }
    catch (error) {
        logger_1.default.error('💥 Failed to start application:', error);
        process.exit(1);
    }
};
// Start the application
if (require.main === module) {
    main();
}
exports.default = EmailOneboxApp;
//# sourceMappingURL=app.js.map