import express from 'express';
declare class EmailOneboxApp {
    private app;
    private elasticsearchService;
    private imapService;
    private aiService;
    private notificationService;
    private vectorService;
    private chatService;
    private isInitialized;
    constructor();
    /**
     * Initialize Express middleware
     */
    private initializeMiddleware;
    /**
     * Initialize all services
     */
    private initializeServices;
    /**
     * Setup the email processing pipeline
     */
    private setupEmailProcessingPipeline;
    /**
     * Process new email through the complete pipeline
     */
    private processNewEmail;
    /**
     * Setup API routes
     */
    private setupRoutes;
    /**
     * Setup error handling
     */
    private setupErrorHandling;
    /**
     * Initialize all services and start email processing
     */
    initialize(): Promise<void>;
    /**
     * Add email accounts from environment variables
     */
    private addEmailAccountsFromEnv;
    /**
     * Start the Express server
     */
    start(port?: number): void;
    /**
     * Get Express app instance
     */
    getApp(): express.Application;
    /**
     * Graceful shutdown
     */
    shutdown(): Promise<void>;
}
export default EmailOneboxApp;
//# sourceMappingURL=app.d.ts.map