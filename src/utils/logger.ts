import winston from 'winston';
import path from 'path';
import fs from 'fs';

// Ensure logs directory exists
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

// Custom log format
const logFormat = winston.format.combine(
    winston.format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ timestamp, level, message, stack, service, email, account }) => {
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
    })
);

// Create the logger
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: logFormat,
    defaultMeta: { service: 'email-onebox' },
    transports: [
        // Console transport only (disable file logging to avoid permission issues)
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple(),
                winston.format.printf(({ level, message, service, account, email }) => {
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
                })
            )
        })
    ]
});

// Email-specific logging methods
export const emailLogger = {
    /**
     * Log new email received
     */
    emailReceived: (account: string, subject: string, messageId: string) => {
        logger.info('📧 New email received', {
            account,
            email: messageId,
            subject: subject.substring(0, 100)
        });
    },

    /**
     * Log email categorization
     */
    emailCategorized: (messageId: string, category: string, confidence?: number) => {
        logger.info(`🏷️ Email categorized as: ${category}`, {
            email: messageId,
            category,
            confidence
        });
    },

    /**
     * Log email sync completion
     */
    syncComplete: (account: string, count: number, duration: number) => {
        logger.info(`✅ Email sync completed: ${count} emails in ${duration}ms`, {
            account,
            count,
            duration
        });
    },

    /**
     * Log IMAP connection events
     */
    imapConnected: (account: string) => {
        logger.info('🔗 IMAP connection established', { account });
    },

    imapDisconnected: (account: string, reason?: string) => {
        logger.warn('🔌 IMAP connection lost', { account, reason });
    },

    imapError: (account: string, error: Error) => {
        logger.error('❌ IMAP error', { account, error: error.message, stack: error.stack });
    },

    /**
     * Log AI processing
     */
    aiProcessing: (operation: string, emailId: string, duration: number) => {
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
    notificationSent: (type: 'slack' | 'webhook', emailId: string, success: boolean) => {
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
    searchPerformed: (query: string, results: number, duration: number) => {
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
    ragQuery: (emailId: string, contextCount: number, duration: number) => {
        logger.debug(`🧠 RAG query completed: ${contextCount} contexts in ${duration}ms`, {
            service: 'rag',
            email: emailId,
            contextCount,
            duration
        });
    }
};

// Circuit breaker logging
export const circuitBreakerLogger = {
    opened: (service: string, failureCount: number) => {
        logger.warn(`⚡ Circuit breaker OPENED for ${service} (failures: ${failureCount})`, {
            service: 'circuit-breaker',
            targetService: service,
            failureCount
        });
    },

    halfOpen: (service: string) => {
        logger.info(`⚡ Circuit breaker HALF-OPEN for ${service}`, {
            service: 'circuit-breaker',
            targetService: service
        });
    },

    closed: (service: string) => {
        logger.info(`⚡ Circuit breaker CLOSED for ${service}`, {
            service: 'circuit-breaker',
            targetService: service
        });
    }
};

// Performance monitoring
export const performanceLogger = {
    /**
     * Log performance metrics
     */
    metric: (operation: string, duration: number, metadata?: any) => {
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

export default logger; 