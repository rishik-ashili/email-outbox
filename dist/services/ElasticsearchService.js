"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ElasticsearchService = void 0;
const elasticsearch_1 = require("@elastic/elasticsearch");
const logger_1 = __importDefault(require("../utils/logger"));
class ElasticsearchService {
    constructor(config) {
        this.client = new elasticsearch_1.Client({
            node: config.node,
            requestTimeout: 30000,
            pingTimeout: 3000,
            maxRetries: 3
        });
        this.indexName = config.index;
    }
    /**
     * Initialize Elasticsearch service and create email index with proper mapping
     */
    async initialize(retries = 5, delay = 2000) {
        for (let i = 0; i < retries; i++) {
            try {
                await this.client.ping();
                logger_1.default.info('✅ Connected to Elasticsearch');
                await this.createEmailIndex();
                logger_1.default.info('✅ Email index is ready');
                return;
            }
            catch (error) {
                if (i === retries - 1) {
                    logger_1.default.error('❌ Failed to initialize Elasticsearch after multiple retries:', error);
                    throw error;
                }
                logger_1.default.warn(`⚠️ Could not connect to Elasticsearch. Retrying in ${delay / 1000} seconds... (${i + 1}/${retries})`);
                await new Promise(res => setTimeout(res, delay));
                delay *= 2; // Exponential backoff
            }
        }
    }
    /**
     * Create email index with proper mapping as specified in blueprint
     */
    async createEmailIndex() {
        try {
            const indexExists = await this.client.indices.exists({
                index: this.indexName
            });
            if (!indexExists) {
                await this.client.indices.create({
                    index: this.indexName,
                    body: {
                        settings: {
                            number_of_shards: 1,
                            number_of_replicas: 0,
                            max_result_window: 50000,
                            analysis: {
                                analyzer: {
                                    email_analyzer: {
                                        type: 'custom',
                                        tokenizer: 'standard',
                                        filter: ['lowercase', 'asciifolding', 'stop']
                                    }
                                }
                            }
                        },
                        mappings: {
                            properties: {
                                id: { type: 'keyword' },
                                messageId: { type: 'keyword' },
                                from: {
                                    type: 'text',
                                    analyzer: 'email_analyzer',
                                    fields: {
                                        keyword: { type: 'keyword' }
                                    }
                                },
                                to: {
                                    type: 'text',
                                    analyzer: 'email_analyzer',
                                    fields: {
                                        keyword: { type: 'keyword' }
                                    }
                                },
                                cc: {
                                    type: 'text',
                                    analyzer: 'email_analyzer'
                                },
                                bcc: {
                                    type: 'text',
                                    analyzer: 'email_analyzer'
                                },
                                subject: {
                                    type: 'text',
                                    analyzer: 'email_analyzer',
                                    fields: {
                                        keyword: { type: 'keyword' }
                                    }
                                },
                                body: {
                                    type: 'text',
                                    analyzer: 'email_analyzer'
                                },
                                htmlBody: {
                                    type: 'text',
                                    index: false
                                },
                                date: { type: 'date' },
                                account: { type: 'keyword' },
                                folder: { type: 'keyword' },
                                category: { type: 'keyword' },
                                flags: { type: 'keyword' },
                                uid: { type: 'integer' },
                                attachments: {
                                    type: 'nested',
                                    properties: {
                                        id: { type: 'keyword' },
                                        filename: { type: 'text' },
                                        contentType: { type: 'keyword' },
                                        size: { type: 'integer' }
                                    }
                                },
                                headers: { type: 'object' },
                                createdAt: { type: 'date' },
                                updatedAt: { type: 'date' }
                            }
                        }
                    }
                });
                logger_1.default.info(`📄 Created email index: ${this.indexName}`);
            }
            else {
                logger_1.default.info(`📄 Email index already exists: ${this.indexName}`);
            }
        }
        catch (error) {
            logger_1.default.error('❌ Failed to create email index:', error);
            throw error;
        }
    }
    /**
     * Index a single email (with deduplication based on messageId)
     */
    async indexEmail(email) {
        try {
            // Check if email already exists (deduplication)
            const existingEmail = await this.getEmailByMessageId(email.messageId);
            if (existingEmail) {
                logger_1.default.debug(`📧 Email already indexed: ${email.messageId}`);
                return false;
            }
            await this.client.index({
                index: this.indexName,
                id: email.id,
                body: {
                    ...email,
                    // Flatten email addresses for better searching
                    from: email.from.map(addr => `${addr.name || ''} <${addr.address}>`).join(', '),
                    to: email.to.map(addr => `${addr.name || ''} <${addr.address}>`).join(', '),
                    cc: email.cc?.map(addr => `${addr.name || ''} <${addr.address}>`).join(', '),
                    bcc: email.bcc?.map(addr => `${addr.name || ''} <${addr.address}>`).join(', '),
                    createdAt: new Date(),
                    updatedAt: new Date()
                }
            });
            logger_1.default.debug(`📧 Indexed email: ${email.subject} [${email.messageId}]`);
            return true;
        }
        catch (error) {
            logger_1.default.error('❌ Failed to index email:', error);
            throw error;
        }
    }
    /**
     * Bulk index multiple emails for better performance
     */
    async bulkIndexEmails(emails) {
        if (emails.length === 0)
            return { indexed: 0, skipped: 0 };
        try {
            const body = [];
            let indexed = 0;
            let skipped = 0;
            for (const email of emails) {
                // Check for duplicates
                const exists = await this.getEmailByMessageId(email.messageId);
                if (exists) {
                    skipped++;
                    continue;
                }
                body.push({
                    index: {
                        _index: this.indexName,
                        _id: email.id
                    }
                });
                body.push({
                    ...email,
                    from: email.from.map(addr => `${addr.name || ''} <${addr.address}>`).join(', '),
                    to: email.to.map(addr => `${addr.name || ''} <${addr.address}>`).join(', '),
                    cc: email.cc?.map(addr => `${addr.name || ''} <${addr.address}>`).join(', '),
                    bcc: email.bcc?.map(addr => `${addr.name || ''} <${addr.address}>`).join(', '),
                    createdAt: new Date(),
                    updatedAt: new Date()
                });
                indexed++;
            }
            if (body.length > 0) {
                const result = await this.client.bulk({ body });
                if (result.errors) {
                    logger_1.default.error('❌ Bulk indexing had errors:', result.items);
                }
            }
            logger_1.default.info(`📧 Bulk indexed ${indexed} emails, skipped ${skipped} duplicates`);
            return { indexed, skipped };
        }
        catch (error) {
            logger_1.default.error('❌ Failed to bulk index emails:', error);
            throw error;
        }
    }
    /**
     * Search emails with advanced query capabilities
     */
    async searchEmails(query) {
        try {
            const { query: searchQuery, account, folder, category, from, to, dateFrom, dateTo, hasAttachments, page = 1, limit = 20, sortBy = 'date', sortOrder = 'desc' } = query;
            const must = [];
            const filter = [];
            // Text search across subject and body
            if (searchQuery) {
                must.push({
                    multi_match: {
                        query: searchQuery,
                        fields: ['subject^2', 'body', 'from', 'to'],
                        fuzziness: 'AUTO'
                    }
                });
            }
            // Filter by account
            if (account) {
                filter.push({ term: { account } });
            }
            // Filter by folder
            if (folder) {
                filter.push({ term: { folder } });
            }
            // Filter by category
            if (category) {
                filter.push({ term: { category } });
            }
            // Filter by sender
            if (from) {
                must.push({
                    match: {
                        from: from
                    }
                });
            }
            // Filter by recipient
            if (to) {
                must.push({
                    match: {
                        to: to
                    }
                });
            }
            // Date range filter
            if (dateFrom || dateTo) {
                const dateRange = {};
                if (dateFrom)
                    dateRange.gte = dateFrom;
                if (dateTo)
                    dateRange.lte = dateTo;
                filter.push({
                    range: {
                        date: dateRange
                    }
                });
            }
            // Has attachments filter
            if (hasAttachments !== undefined) {
                if (hasAttachments) {
                    filter.push({
                        exists: { field: 'attachments' }
                    });
                }
                else {
                    must.push({
                        bool: {
                            must_not: {
                                exists: { field: 'attachments' }
                            }
                        }
                    });
                }
            }
            const searchBody = {
                query: {
                    bool: {
                        must: must.length > 0 ? must : [{ match_all: {} }],
                        filter
                    }
                },
                sort: [
                    {
                        [sortBy]: {
                            order: sortOrder
                        }
                    }
                ],
                from: (page - 1) * limit,
                size: limit
            };
            const result = await this.client.search({
                index: this.indexName,
                body: searchBody
            });
            const emails = result.hits.hits.map((hit) => ({
                ...hit._source,
                id: hit._id
            }));
            const total = typeof result.hits.total === 'number'
                ? result.hits.total
                : result.hits.total?.value || 0;
            return {
                success: true,
                data: emails,
                timestamp: new Date().toISOString(),
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages: Math.ceil(total / limit)
                }
            };
        }
        catch (error) {
            logger_1.default.error('❌ Failed to search emails:', error);
            throw error;
        }
    }
    /**
     * Get email by ID
     */
    async getEmailById(id) {
        try {
            const result = await this.client.get({
                index: this.indexName,
                id
            });
            return result._source;
        }
        catch (error) {
            if (error.statusCode === 404) {
                return null;
            }
            logger_1.default.error('❌ Failed to get email by ID:', error);
            throw error;
        }
    }
    /**
     * Get email by messageId (for deduplication)
     */
    async getEmailByMessageId(messageId) {
        try {
            const result = await this.client.search({
                index: this.indexName,
                body: {
                    query: {
                        term: {
                            messageId
                        }
                    }
                }
            });
            if (result.hits.hits.length > 0) {
                return result.hits.hits[0]._source;
            }
            return null;
        }
        catch (error) {
            logger_1.default.error('❌ Failed to get email by messageId:', error);
            throw error;
        }
    }
    /**
     * Update email category (for AI categorization)
     */
    async updateEmailCategory(id, category) {
        try {
            // First check if the document exists
            const exists = await this.client.exists({
                index: this.indexName,
                id
            });
            if (!exists) {
                logger_1.default.warn(`⚠️ Email document not found for category update: ${id}`);
                return;
            }
            await this.client.update({
                index: this.indexName,
                id,
                body: {
                    doc: {
                        category,
                        updatedAt: new Date()
                    }
                }
            });
            logger_1.default.debug(`📧 Updated email category: ${id} -> ${category}`);
        }
        catch (error) {
            logger_1.default.error('❌ Failed to update email category:', error);
            // Don't throw error, just log it to prevent pipeline failure
        }
    }
    /**
     * Get email statistics for dashboard
     */
    async getEmailStats(account) {
        try {
            const filters = account ? [{ term: { account } }] : [];
            // Get total count
            const totalResult = await this.client.count({
                index: this.indexName,
                body: {
                    query: {
                        bool: { filter: filters }
                    }
                }
            });
            // Get category aggregations
            const categoryResult = await this.client.search({
                index: this.indexName,
                body: {
                    query: {
                        bool: { filter: filters }
                    },
                    aggs: {
                        categories: {
                            terms: {
                                field: 'category',
                                size: 10
                            }
                        },
                        accounts: {
                            terms: {
                                field: 'account',
                                size: 20
                            }
                        },
                        recent: {
                            date_range: {
                                field: 'date',
                                ranges: [
                                    {
                                        from: 'now-7d',
                                        to: 'now'
                                    }
                                ]
                            }
                        }
                    },
                    size: 0
                }
            });
            const categoryCounts = {
                'Interested': 0,
                'Meeting Booked': 0,
                'Not Interested': 0,
                'Spam': 0,
                'Out of Office': 0
            };
            // Process category aggregations
            if (categoryResult.aggregations?.categories) {
                categoryResult.aggregations.categories.buckets.forEach((bucket) => {
                    if (bucket.key in categoryCounts) {
                        categoryCounts[bucket.key] = bucket.doc_count;
                    }
                });
            }
            // Process account aggregations
            const accountCounts = {};
            if (categoryResult.aggregations?.accounts) {
                categoryResult.aggregations.accounts.buckets.forEach((bucket) => {
                    accountCounts[bucket.key] = bucket.doc_count;
                });
            }
            // Get recent emails count
            const recentEmails = categoryResult.aggregations?.recent
                ? categoryResult.aggregations.recent.buckets[0]?.doc_count || 0
                : 0;
            return {
                totalEmails: totalResult.count,
                categoryCounts,
                accountCounts,
                recentEmails,
                unreadEmails: 0 // TODO: Implement unread logic based on flags
            };
        }
        catch (error) {
            logger_1.default.error('❌ Failed to get email stats:', error);
            throw error;
        }
    }
    /**
     * Delete email by ID
     */
    async deleteEmail(id) {
        try {
            await this.client.delete({
                index: this.indexName,
                id
            });
            logger_1.default.debug(`🗑️ Deleted email: ${id}`);
        }
        catch (error) {
            logger_1.default.error('❌ Failed to delete email:', error);
            throw error;
        }
    }
    /**
     * Health check for Elasticsearch connection
     */
    async healthCheck() {
        try {
            await this.client.ping();
            return true;
        }
        catch (error) {
            logger_1.default.error('❌ Elasticsearch health check failed:', error);
            return false;
        }
    }
    /**
     * Refresh index to make documents available for search immediately
     */
    async refreshIndex() {
        try {
            await this.client.indices.refresh({ index: this.indexName });
        }
        catch (error) {
            logger_1.default.error('❌ Failed to refresh index:', error);
            throw error;
        }
    }
}
exports.ElasticsearchService = ElasticsearchService;
//# sourceMappingURL=ElasticsearchService.js.map