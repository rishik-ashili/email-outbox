import { Email, EmailSearchQuery, ElasticsearchConfig, PaginatedResponse, EmailStats, EmailCategory } from '../types';
export declare class ElasticsearchService {
    private client;
    private indexName;
    constructor(config: ElasticsearchConfig);
    /**
     * Initialize Elasticsearch service and create email index with proper mapping
     */
    initialize(retries?: number, delay?: number): Promise<void>;
    /**
     * Create email index with proper mapping as specified in blueprint
     */
    private createEmailIndex;
    /**
     * Index a single email (with deduplication based on messageId)
     */
    indexEmail(email: Email): Promise<boolean>;
    /**
     * Bulk index multiple emails for better performance
     */
    bulkIndexEmails(emails: Email[]): Promise<{
        indexed: number;
        skipped: number;
    }>;
    /**
     * Search emails with advanced query capabilities
     */
    searchEmails(query: EmailSearchQuery): Promise<PaginatedResponse<Email>>;
    /**
     * Get email by ID
     */
    getEmailById(id: string): Promise<Email | null>;
    /**
     * Get email by messageId (for deduplication)
     */
    getEmailByMessageId(messageId: string): Promise<Email | null>;
    /**
     * Update email category (for AI categorization)
     */
    updateEmailCategory(id: string, category: EmailCategory): Promise<void>;
    /**
     * Get email statistics for dashboard
     */
    getEmailStats(account?: string): Promise<EmailStats>;
    /**
     * Delete email by ID
     */
    deleteEmail(id: string): Promise<void>;
    /**
     * Health check for Elasticsearch connection
     */
    healthCheck(): Promise<boolean>;
    /**
     * Refresh index to make documents available for search immediately
     */
    refreshIndex(): Promise<void>;
}
//# sourceMappingURL=ElasticsearchService.d.ts.map