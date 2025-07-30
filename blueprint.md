# Email Onebox System - Development Blueprint

## 📋 Project Overview
Build a complete email aggregation system similar to Reachinbox that synchronizes multiple IMAP accounts in real-time, provides AI-powered email categorization, and includes advanced features like suggested replies using RAG.

## 🎯 Success Metrics
- [ ] Sync emails from 2+ accounts in real-time
- [ ] Categorize emails with >85% accuracy  
- [ ] Search emails in <200ms
- [ ] Process new emails in <5 seconds
- [ ] Generate contextual replies using RAG
- [ ] Zero data loss during connection drops

## 🏗️ Tech Stack

### Backend
- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js
- **Email Processing**: `imap` library with `mailparser`
- **Database**: Elasticsearch (Docker) for email storage and search
- **AI/ML**: Google Gemini API for categorization and reply generation
- **Vector Database**: Pinecone for RAG implementation
- **Notifications**: Slack Web API (`@slack/web-api`)
- **HTTP Client**: Axios for webhook triggers
- **Environment**: dotenv for configuration

### Frontend
- **Framework**: React with TypeScript
- **Styling**: Tailwind CSS
- **HTTP Client**: Axios
- **State Management**: React Context API or Zustand

### Infrastructure
- **Containerization**: Docker for Elasticsearch
- **Development**: Nodemon, Concurrently for dev workflow

## 📁 Project Structure
```
email-onebox/
├── src/
│   ├── controllers/
│   │   ├── EmailController.ts
│   │   └── SearchController.ts
│   ├── services/
│   │   ├── ImapService.ts           # 🚨 CRITICAL: Persistent IMAP with IDLE
│   │   ├── ElasticsearchService.ts
│   │   ├── AIService.ts
│   │   ├── NotificationService.ts
│   │   └── VectorService.ts
│   ├── models/
│   │   ├── Email.ts
│   │   └── Account.ts
│   ├── routes/
│   │   ├── emails.ts
│   │   └── ai.ts
│   ├── utils/
│   │   ├── logger.ts
│   │   └── validators.ts
│   ├── types/
│   │   └── index.ts
│   └── app.ts
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── services/
│   │   ├── types/
│   │   └── utils/
├── docker-compose.yml
├── package.json
├── tsconfig.json
└── .env.example
```

## 🔧 Critical Implementation Requirements

### 1. IMAP Service - MOST CRITICAL COMPONENT ⚠️

**MANDATORY**: NO CRON JOBS OR POLLING - Use persistent IMAP connections with IDLE mode!

```typescript
class ImapService extends EventEmitter {
  // ✅ Must maintain persistent connection with keepalive
  // ✅ Must use IMAP IDLE for real-time email detection
  // ✅ Must fetch last 30 days of emails on initial connection
  // ✅ Must handle connection drops and auto-reconnect
  // ✅ Must emit 'newEmail' events for real-time processing
  // ✅ Must support multiple folders (INBOX, Sent, etc.)
}
```

**IMAP Server Configurations**:
- Gmail: `imap.gmail.com:993` with TLS (use app passwords!)
- Outlook: `outlook.office365.com:993` with TLS
- Yahoo: `imap.mail.yahoo.com:993` with TLS

### 2. Elasticsearch Setup

**Docker Configuration** (docker-compose.yml):
```yaml
version: '3.8'
services:
  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.11.0
    container_name: elasticsearch
    environment:
      - discovery.type=single-node
      - xpack.security.enabled=false
      - "ES_JAVA_OPTS=-Xms512m -Xmx512m"
    ports:
      - "9200:9200"
    volumes:
      - es_data:/usr/share/elasticsearch/data
    networks:
      - elastic

networks:
  elastic:

volumes:
  es_data:
```

**Email Index Mapping** (EXACT fields required):
```json
{
  "mappings": {
    "properties": {
      "id": { "type": "keyword" },
      "messageId": { "type": "keyword" },
      "from": { "type": "text", "analyzer": "standard" },
      "to": { "type": "text", "analyzer": "standard" },
      "subject": { "type": "text", "analyzer": "standard" },
      "body": { "type": "text", "analyzer": "standard" },
      "htmlBody": { "type": "text", "index": false },
      "date": { "type": "date" },
      "account": { "type": "keyword" },
      "folder": { "type": "keyword" },
      "category": { "type": "keyword" },
      "flags": { "type": "keyword" },
      "attachments": { "type": "nested" }
    }
  }
}
```

### 3. AI Categorization System

**EXACT Categories** (case-sensitive, must use these):
- `Interested`
- `Meeting Booked` 
- `Not Interested`
- `Spam`
- `Out of Office`

**Gemini AI Configuration**:
- Model: `gemini-2.5-flash`
- Temperature: `0` (for consistency)
- Prompt template stored in config
- Multi-turn chat support for email conversations

### 4. Real-time Processing Pipeline

```
IMAP Service (IDLE) → New Email Event → AI Categorization → 
Elasticsearch Indexing → Notification Logic → Frontend Update
```

**Event Flow**:
```typescript
ImapService.on('newEmail') -> 
AIService.categorizeEmail() -> 
ElasticsearchService.indexEmail() -> 
if (category === 'Interested') {
  NotificationService.sendSlackNotification()
  NotificationService.triggerWebhook()
}
```

## 🌐 API Endpoints (Required)

```typescript
GET /api/emails              // Fetch all emails with pagination
GET /api/emails/search       // Search with query, account, folder filters  
GET /api/emails/:id          // Get specific email
POST /api/emails/reply       // Generate AI suggested reply
GET /api/accounts            // List connected accounts
POST /api/accounts           // Add new email account
GET /api/stats               // Dashboard statistics

// Chat endpoints for AI conversations about emails
POST /api/chat               // Start/continue chat session
GET /api/chat/:sessionId     // Get specific chat session
GET /api/chat                // Get all chat sessions
DELETE /api/chat/:sessionId  // Delete chat session
GET /api/chat/stats          // Chat statistics
```

## 🎨 Frontend Requirements

**Core Components**:
- `EmailList`: Display emails with categorization badges
- `SearchBar`: Real-time search with filters
- `EmailView`: Display email content with reply suggestions
- `AccountManager`: Add/remove email accounts
- `Dashboard`: Show statistics and categories

**Must Include**:
- Real-time updates using WebSocket or Server-Sent Events
- Infinite scroll for email list
- Filter by account, folder, category
- Search highlighting
- Responsive design for mobile

## 🤖 RAG Implementation

**Vector Database**: Pinecone for context storage
**Context Examples**:
```typescript
const contexts = [
  {
    id: "job_application",
    content: "I am applying for a job position. If the lead is interested, share the meeting booking link: https://cal.com/example",
    metadata: { type: "job_search", priority: "high" }
  },
  {
    id: "product_demo", 
    content: "We offer software solutions. For interested leads, schedule a demo at https://calendly.com/demo",
    metadata: { type: "sales", priority: "medium" }
  }
];
```

**Reply Generation Process**:
1. Extract key information from incoming email
2. Query vector database for relevant context
3. Use retrieved context + email content for OpenAI completion
4. Return formatted, professional reply

## 🔔 Notification System

**Slack Integration**:
- Post to specified channel when email category is "Interested"
- Use structured blocks format
- Handle rate limits and errors

**Webhook Integration**: 
- Trigger webhook.site URL for "Interested" emails
- Send structured JSON payload
- Implement retry logic

## ⚙️ Environment Variables (.env)

```bash
# Email Accounts (minimum 2 required)
EMAIL1_USER=
EMAIL1_PASS=
EMAIL1_HOST=imap.gmail.com
EMAIL1_PORT=993

EMAIL2_USER=
EMAIL2_PASS=
EMAIL2_HOST=outlook.office365.com
EMAIL2_PORT=993

# Elasticsearch
ELASTICSEARCH_URL=http://localhost:9200

# Gemini AI
GEMINI_API_KEY=AIzaSyBddv1B8jw9nGD4m6UhYuaSlT-rdsSV2_4

# OpenAI (for embeddings only)
OPENAI_API_KEY=

# Slack
SLACK_BOT_TOKEN=
SLACK_CHANNEL=#general

# Webhooks
WEBHOOK_URL=https://webhook.site/your-unique-url

# Pinecone (for RAG)
PINECONE_API_KEY=
PINECONE_INDEX=email-context

# Server
PORT=3000
NODE_ENV=development
```

## 🛡️ Critical Error Handling

**Must Handle**:
- IMAP connection drops and reconnections
- Elasticsearch connection failures  
- OpenAI API rate limits and errors
- Slack API failures
- Email parsing errors (malformed emails)
- Authentication failures for email accounts

**Implement Circuit Breaker Pattern** for external API calls.

## ⚡ Performance Optimizations

- **Email Deduplication**: Check messageId before indexing
- **Batch Processing**: Process multiple emails in batches
- **Connection Pooling**: Reuse IMAP connections efficiently
- **Caching**: Cache AI categorization results
- **Rate Limiting**: Implement API rate limiting

## 🔒 Security Considerations

- **Credentials**: Never log email passwords
- **API Keys**: Use environment variables only
- **Input Validation**: Sanitize all email content before AI processing
- **CORS**: Configure proper CORS for frontend
- **Authentication**: Implement basic auth for API endpoints

## 🚫 Common Pitfalls to Avoid

1. **Don't use polling for email sync** - Must use IMAP IDLE
2. **Don't store passwords in plain text** - Use app passwords for Gmail
3. **Don't ignore email parsing errors** - Some emails have malformed headers
4. **Don't forget to handle large attachments** - Implement size limits
5. **Don't skip connection error handling** - IMAP connections drop frequently
6. **Don't use synchronous operations** - All email processing must be async
7. **Don't ignore Elasticsearch mapping** - Proper field types are crucial
8. **Don't hardcode AI prompts** - Make them configurable
9. **Don't skip pagination** - Email lists can be very large
10. **Don't forget to clean up connections** - Properly close IMAP connections

## 🧪 Testing Strategy

1. **Unit Tests**: Each service class
2. **Integration Tests**: Email sync, AI categorization, search
3. **E2E Tests**: Complete email processing pipeline
4. **Load Tests**: Multiple simultaneous IMAP connections
5. **Manual Tests**: Real email accounts with actual emails

## 📦 Package.json Scripts

```json
{
  "scripts": {
    "dev": "nodemon src/app.ts",
    "build": "tsc", 
    "start": "node dist/app.js",
    "test": "jest",
    "dev:full": "concurrently \"npm run dev\" \"cd frontend && npm start\""
  }
}
```

## 🚀 Development Workflow

```bash
# Start Elasticsearch
docker-compose up -d

# Install dependencies  
npm install

# Start development server
npm run dev

# Start frontend
cd frontend && npm start
```

## 📊 Testing & Validation

**Create Postman Collection** with tests for:
- Email sync from multiple accounts
- Search functionality with various filters
- AI categorization accuracy
- Slack notification delivery  
- Webhook trigger verification
- Reply suggestion generation

## 🚀 Deployment Considerations

- Use PM2 for production process management
- Configure Elasticsearch heap size based on email volume
- Implement log rotation for email processing logs
- Monitor IMAP connection health
- Set up alerts for failed categorizations

---

## 📝 Development Notes

**Phase 1**: Core Infrastructure
- Project setup and structure
- Elasticsearch Docker setup
- Basic IMAP service with IDLE

**Phase 2**: Email Processing
- Email parsing and indexing
- AI categorization system
- Search functionality

**Phase 3**: Notifications & RAG
- Slack/webhook notifications
- Pinecone integration
- Reply suggestions

**Phase 4**: Frontend & Polish
- React frontend development
- Real-time updates
- Testing and optimization

---

*This blueprint serves as the single source of truth for the entire project development. All implementation decisions should reference this document.* 