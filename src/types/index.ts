// Email Onebox System - Core Type Definitions

export interface EmailAccount {
    id: string;
    label: string;
    user: string;
    host: string;
    port: number;
    tls: boolean;
    isActive: boolean;
    lastSyncAt?: Date;
    totalEmails?: number;
}

export interface Email {
    id: string;
    messageId: string;
    from: EmailAddress[];
    to: EmailAddress[];
    cc?: EmailAddress[];
    bcc?: EmailAddress[];
    subject: string;
    body: string;
    htmlBody?: string;
    date: Date;
    account: string;
    folder: string;
    category: EmailCategory;
    flags: EmailFlag[];
    attachments: EmailAttachment[];
    uid: number;
    headers: EmailHeaders;
    createdAt: Date;
    updatedAt: Date;
}

export interface EmailAddress {
    name?: string;
    address: string;
}

export interface EmailAttachment {
    id: string;
    filename: string;
    contentType: string;
    size: number;
    checksum: string;
    content?: Buffer;
}

export interface EmailHeaders {
    [key: string]: string | string[];
}

export type EmailCategory =
    | 'Interested'
    | 'Meeting Booked'
    | 'Not Interested'
    | 'Spam'
    | 'Out of Office';

export type EmailFlag =
    | 'Seen'
    | 'Answered'
    | 'Flagged'
    | 'Deleted'
    | 'Draft'
    | 'Recent';

export interface ImapConfig {
    user: string;
    password: string;
    host: string;
    port: number;
    tls: boolean;
    tlsOptions?: {
        rejectUnauthorized: boolean;
        servername?: string;
    };
    connTimeout: number;
    authTimeout: number;
    keepalive: boolean;
}

export interface ElasticsearchConfig {
    node: string;
    index: string;
    logLevel: string;
}

export interface GeminiConfig {
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
}

export interface SlackConfig {
    botToken: string;
    channel: string;
    enabled: boolean;
}

export interface WebhookConfig {
    url: string;
    enabled: boolean;
    retryAttempts: number;
    timeout: number;
}

export interface PineconeConfig {
    apiKey: string;
    index: string;
    environment: string;
}

export interface AppConfig {
    port: number;
    nodeEnv: string;
    host: string;
    logLevel: string;
    corsOrigin: string;
    jwtSecret: string;
    apiRateLimit: number;
    apiRateWindow: number;
}

export interface EmailProcessingConfig {
    syncInterval: number;
    batchSize: number;
    historyDays: number;
    maxAttachmentSize: number;
}

export interface AIProcessingConfig {
    categorizationEnabled: boolean;
    replySuggestionsEnabled: boolean;
    batchSize: number;
    retryAttempts: number;
}

// API Response Types
export interface ApiResponse<T = any> {
    success: boolean;
    data?: T;
    error?: string;
    message?: string;
    timestamp: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
}

export interface EmailSearchQuery {
    query?: string;
    account?: string;
    folder?: string;
    category?: EmailCategory;
    from?: string;
    to?: string;
    dateFrom?: Date;
    dateTo?: Date;
    hasAttachments?: boolean;
    page?: number;
    limit?: number;
    sortBy?: 'date' | 'subject' | 'from';
    sortOrder?: 'asc' | 'desc';
}

export interface EmailStats {
    totalEmails: number;
    categoryCounts: Record<EmailCategory, number>;
    accountCounts: Record<string, number>;
    recentEmails: number;
    unreadEmails: number;
}

// RAG Context Types
export interface RAGContext {
    id: string;
    content: string;
    metadata: {
        type: string;
        priority: 'high' | 'medium' | 'low';
        tags?: string[];
        createdAt: Date;
        updatedAt: Date;
    };
    embedding?: number[];
}

export interface ReplyGeneration {
  originalEmail: Email;
  suggestedReply: string;
  confidence: number;
  contextUsed: RAGContext[];
  generatedAt: Date;
}

// Chat-related types
export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: Date;
  emailContext?: string[]; // Email IDs for context
}

export interface ChatSession {
  id: string;
  userId?: string;
  messages: ChatMessage[];
  createdAt: Date;
  updatedAt: Date;
  emailContext: string[]; // Email IDs that are part of this chat context
}

export interface ChatRequest {
  sessionId?: string;
  message: string;
  emailIds?: string[]; // Optional email IDs to include in context
}

export interface ChatResponse {
  sessionId: string;
  message: ChatMessage;
  suggestedActions?: string[];
}

// Service Event Types
export interface EmailServiceEvents {
    'newEmail': (email: Email) => void;
    'emailCategorized': (email: Email, category: EmailCategory) => void;
    'emailSyncComplete': (account: string, count: number) => void;
    'emailSyncError': (account: string, error: Error) => void;
    'connectionLost': (account: string) => void;
    'connectionRestored': (account: string) => void;
}

// Notification Types
export interface SlackNotification {
    channel: string;
    blocks: any[];
    text: string;
}

export interface WebhookPayload {
    email: Email;
    category: EmailCategory;
    account: string;
    timestamp: string;
    eventType: 'email_categorized' | 'new_interested_email';
}

// Error Types
export interface AppError {
    name: string;
    message: string;
    code: string;
    statusCode: number;
    isOperational: boolean;
    stack?: string;
}

// IMAP Connection Status
export interface ImapConnection {
    account: string;
    status: 'connected' | 'connecting' | 'disconnected' | 'error';
    lastActivity: Date;
    totalEmails: number;
    folders: string[];
    error?: string;
}

// Circuit Breaker Status
export interface CircuitBreakerStatus {
    service: string;
    state: 'closed' | 'open' | 'half-open';
    failureCount: number;
    nextAttempt?: Date;
    lastFailure?: string;
} 