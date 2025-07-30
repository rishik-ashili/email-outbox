import winston from 'winston';
declare const logger: winston.Logger;
export declare const emailLogger: {
    /**
     * Log new email received
     */
    emailReceived: (account: string, subject: string, messageId: string) => void;
    /**
     * Log email categorization
     */
    emailCategorized: (messageId: string, category: string, confidence?: number) => void;
    /**
     * Log email sync completion
     */
    syncComplete: (account: string, count: number, duration: number) => void;
    /**
     * Log IMAP connection events
     */
    imapConnected: (account: string) => void;
    imapDisconnected: (account: string, reason?: string) => void;
    imapError: (account: string, error: Error) => void;
    /**
     * Log AI processing
     */
    aiProcessing: (operation: string, emailId: string, duration: number) => void;
    /**
     * Log notification sending
     */
    notificationSent: (type: "slack" | "webhook", emailId: string, success: boolean) => void;
    /**
     * Log search operations
     */
    searchPerformed: (query: string, results: number, duration: number) => void;
    /**
     * Log RAG operations
     */
    ragQuery: (emailId: string, contextCount: number, duration: number) => void;
};
export declare const circuitBreakerLogger: {
    opened: (service: string, failureCount: number) => void;
    halfOpen: (service: string) => void;
    closed: (service: string) => void;
};
export declare const performanceLogger: {
    /**
     * Log performance metrics
     */
    metric: (operation: string, duration: number, metadata?: any) => void;
    /**
     * Log memory usage
     */
    memory: () => void;
};
export default logger;
//# sourceMappingURL=logger.d.ts.map