"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.performanceLogger = exports.circuitBreakerLogger = exports.emailLogger = void 0;
const winston_1 = __importDefault(require("winston"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
// Ensure logs directory exists
const logsDir = path_1.default.join(process.cwd(), 'logs');
if (!fs_1.default.existsSync(logsDir)) {
    fs_1.default.mkdirSync(logsDir, { recursive: true });
}
// Custom log format
const logFormat = winston_1.default.format.combine(winston_1.default.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
}), winston_1.default.format.errors({ stack: true }), winston_1.default.format.printf(({ timestamp, level, message, stack, service, email, account }) => {
    let logMessage = `${timestamp} [${level.toUpperCase()}]`;
    if (service) {
        logMessage += ` [${service}]`;
    }
    if (account) {
        logMessage += ` [${account}]`;
    }
    if (email) {
        logMessage += ` [${email}]`;
    }
    logMessage += `: ${message}`;
    if (stack) {
        logMessage += `\n${stack}`;
    }
    return logMessage;
}));
// Create the logger
const logger = winston_1.default.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: logFormat,
    defaultMeta: { service: 'email-onebox' },
    transports: [
        // Console transport only (disable file logging to avoid permission issues)
        new winston_1.default.transports.Console({
            format: winston_1.default.format.combine(winston_1.default.format.colorize(), winston_1.default.format.simple(), winston_1.default.format.printf(({ level, message, service, account, email }) => {
                let logMessage = `${level}`;
                if (service && service !== 'email-onebox') {
                    logMessage += ` [${service}]`;
                }
                if (account) {
                    logMessage += ` [${account}]`;
                }
                if (email) {
                    logMessage += ` [${email}]`;
                }
                logMessage += `: ${message}`;
                return logMessage;
            }))
        })
    ]
});
// Email-specific logging methods
exports.emailLogger = {
    /**
     * Log new email received
     */
    emailReceived: (account, subject, messageId) => {
        logger.info('📧 New email received', {
            account,
            email: messageId,
            subject: subject.substring(0, 100)
        });
    },
    /**
     * Log email categorization
     */
    emailCategorized: (messageId, category, confidence) => {
        logger.info(`🏷️ Email categorized as: ${category}`, {
            email: messageId,
            category,
            confidence
        });
    },
    /**
     * Log email sync completion
     */
    syncComplete: (account, count, duration) => {
        logger.info(`✅ Email sync completed: ${count} emails in ${duration}ms`, {
            account,
            count,
            duration
        });
    },
    /**
     * Log IMAP connection events
     */
    imapConnected: (account) => {
        logger.info('🔗 IMAP connection established', { account });
    },
    imapDisconnected: (account, reason) => {
        logger.warn('🔌 IMAP connection lost', { account, reason });
    },
    imapError: (account, error) => {
        logger.error('❌ IMAP error', { account, error: error.message, stack: error.stack });
    },
    /**
     * Log AI processing
     */
    aiProcessing: (operation, emailId, duration) => {
        logger.debug(`🤖 AI ${operation} completed in ${duration}ms`, {
            service: 'ai',
            email: emailId,
            operation,
            duration
        });
    },
    /**
     * Log notification sending
     */
    notificationSent: (type, emailId, success) => {
        const emoji = success ? '✅' : '❌';
        const status = success ? 'sent' : 'failed';
        logger.info(`${emoji} ${type} notification ${status}`, {
            service: 'notification',
            email: emailId,
            type,
            success
        });
    },
    /**
     * Log search operations
     */
    searchPerformed: (query, results, duration) => {
        logger.debug(`🔍 Search completed: "${query}" - ${results} results in ${duration}ms`, {
            service: 'search',
            query: query.substring(0, 100),
            results,
            duration
        });
    },
    /**
     * Log RAG operations
     */
    ragQuery: (emailId, contextCount, duration) => {
        logger.debug(`🧠 RAG query completed: ${contextCount} contexts in ${duration}ms`, {
            service: 'rag',
            email: emailId,
            contextCount,
            duration
        });
    }
};
// Circuit breaker logging
exports.circuitBreakerLogger = {
    opened: (service, failureCount) => {
        logger.warn(`⚡ Circuit breaker OPENED for ${service} (failures: ${failureCount})`, {
            service: 'circuit-breaker',
            targetService: service,
            failureCount
        });
    },
    halfOpen: (service) => {
        logger.info(`⚡ Circuit breaker HALF-OPEN for ${service}`, {
            service: 'circuit-breaker',
            targetService: service
        });
    },
    closed: (service) => {
        logger.info(`⚡ Circuit breaker CLOSED for ${service}`, {
            service: 'circuit-breaker',
            targetService: service
        });
    }
};
// Performance monitoring
exports.performanceLogger = {
    /**
     * Log performance metrics
     */
    metric: (operation, duration, metadata) => {
        logger.debug(`⏱️ Performance: ${operation} took ${duration}ms`, {
            service: 'performance',
            operation,
            duration,
            ...metadata
        });
    },
    /**
     * Log memory usage
     */
    memory: () => {
        const usage = process.memoryUsage();
        logger.debug('💾 Memory usage', {
            service: 'system',
            rss: `${Math.round(usage.rss / 1024 / 1024)}MB`,
            heapTotal: `${Math.round(usage.heapTotal / 1024 / 1024)}MB`,
            heapUsed: `${Math.round(usage.heapUsed / 1024 / 1024)}MB`,
            external: `${Math.round(usage.external / 1024 / 1024)}MB`
        });
    }
};
exports.default = logger;
//# sourceMappingURL=logger.js.map