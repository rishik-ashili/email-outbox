# Email Onebox System 📧

A feature-rich email aggregation system that synchronizes multiple IMAP accounts in real-time, provides AI-powered email categorization, and includes advanced features like suggested replies using RAG (Retrieval-Augmented Generation).

![Email Onebox System](https://img.shields.io/badge/Status-Production%20Ready-green.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.2.2-blue.svg)
![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)
![Docker](https://img.shields.io/badge/Docker-Required-blue.svg)

## 🎯 Features

- **Real-time Email Sync**: Persistent IMAP connections with IDLE mode (NO polling!)
- **AI-Powered Categorization**: Automatic email classification using Google Gemini AI
- **Smart Search**: Elasticsearch-powered full-text search with advanced filters
- **RAG-based Replies**: Context-aware reply suggestions using Pinecone vector database
- **Multi-Platform Notifications**: Slack integration and webhook triggers
- **Intelligent Email Chat**: Multi-turn conversations about your emails using Gemini AI
- **Secure & Scalable**: Production-ready with comprehensive error handling
- **Circuit Breaker Pattern**: Resilient external API calls
- **Real-time Updates**: WebSocket support for live email updates
- **AI Quota Management**: Intelligent caching and rate limiting for Gemini API

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   IMAP Services │    │   AI Services   │    │  Notifications  │
│   (Real-time)   │───▶│  (Categorize)   │───▶│  (Slack/Webhook)│
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│ Elasticsearch  │    │ Vector Database │    │   Express API   │
│  (Storage)      │    │   (RAG/Pinecone)│    │   (Frontend)    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18+ and npm
- **Docker** and Docker Compose
- **Email accounts** with app passwords (Gmail, Outlook, Yahoo)
- **Google Gemini API key** (from Google AI Studio)
- **Pinecone account** (free tier available)
- **Slack workspace** (optional, for notifications)

### 1. Clone and Install

```bash
git clone <repository-url>
cd email-onebox
npm install
```

### 2. Start Elasticsearch

```bash
# Start Elasticsearch container
docker-compose up -d elasticsearch

# Verify it's running
curl http://localhost:9200/_health
```

### 3. Configure Environment

```bash
# Copy environment template
cp env.example .env

# Edit .env with your credentials
nano .env
```

### 4. Configure Email Accounts

**For Gmail:**
1. Enable 2-factor authentication
2. Generate an [App Password](https://support.google.com/accounts/answer/185833)
3. Use the app password, NOT your regular password

```env
EMAIL1_USER=your-email@gmail.com
EMAIL1_PASS=your-app-password
EMAIL1_HOST=imap.gmail.com
EMAIL1_PORT=993
EMAIL1_LABEL=Gmail
```

**For Outlook/Office365:**
```env
EMAIL2_USER=your-email@outlook.com
EMAIL2_PASS=your-password
EMAIL2_HOST=outlook.office365.com
EMAIL2_PORT=993
EMAIL2_LABEL=Outlook
```

### 5. Start the Application

```bash
# Development mode with auto-reload
npm install
npm run dev

# Production mode
npm run build
npm start
```

## 📊 System Status

Check if all services are running:

```bash
curl http://localhost:3000/health
```

Expected response:
```json
{
  "status": "ok",
  "services": {
    "elasticsearch": true,
    "gemini": true,
    "notifications": true,
    "vector": true,
    "imap": true,
    "chat": true
  }
}
```

## 🔧 Configuration

### Core Environment Variables

#### Email Accounts (Required)
```env
# Gmail Account (use App Password!)
EMAIL1_USER=your-gmail@gmail.com
EMAIL1_PASS=your-app-password
EMAIL1_HOST=imap.gmail.com
EMAIL1_PORT=993

# Outlook Account
EMAIL2_USER=your-email@outlook.com
EMAIL2_PASS=your-password
EMAIL2_HOST=outlook.office365.com
EMAIL2_PORT=993
```

#### AI Services (Required)
```env
# Google Gemini AI
GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL=gemini-2.5-pro
GEMINI_TEMPERATURE=0

# Pinecone (for RAG)
PINECONE_API_KEY=your-pinecone-api-key
PINECONE_INDEX=email
PINECONE_ENVIRONMENT=us-east-1
```

#### Notifications (Optional)
```env
# Slack Integration
SLACK_BOT_TOKEN=xoxb-your-slack-bot-token
SLACK_CHANNEL=#general
SLACK_ENABLED=true

# Webhook Integration  
WEBHOOK_URL=https://webhook.site/your-unique-url
WEBHOOK_ENABLED=true
```

#### System Configuration
```env
PORT=3000
NODE_ENV=development
ELASTICSEARCH_URL=http://localhost:9200
LOG_LEVEL=info
```

### Email Categories

The system automatically categorizes emails into these **exact** categories:

- **`Interested`** - Shows genuine interest in product/service/opportunity
- **`Meeting Booked`** - About scheduling/confirming meetings or calls  
- **`Not Interested`** - Explicit decline or disinterest
- **`Spam`** - Promotional, suspicious, or irrelevant content
- **`Out of Office`** - Auto-reply indicating unavailability

## 🤖 AI Quota Management

### Problem Solved
- **Issue**: Gemini API daily quota exceeded (100 requests/day free tier)
- **Result**: All emails categorized as "Spam" due to API failures
- **Solution**: Comprehensive quota management with intelligent caching

### Features Implemented

#### 1. Daily Quota Tracking
- ✅ **Conservative Limit**: 80 calls/day (100 - 20 buffer)
- ✅ **Automatic Reset**: Daily quota resets at midnight
- ✅ **Real-time Monitoring**: Track calls made vs. limit

#### 2. Intelligent Caching
- ✅ **Email Categorization Cache**: Avoid duplicate API calls
- ✅ **Health Check Cache**: 5-minute cache for service status
- ✅ **Cache Size Management**: 500 entries max to prevent memory issues

#### 3. Rate Limiting Optimization
- ✅ **Reduced Rate**: 1 request/minute (was 3)
- ✅ **Exponential Backoff**: Smart retry logic
- ✅ **Reduced Attempts**: 2 max attempts (was 3)

#### 4. Content Optimization
- ✅ **Truncated Content**: 1000 chars max (was 2000)
- ✅ **Efficient Prompts**: Streamlined categorization prompts
- ✅ **Batch Processing**: Reduced batch size to 5 emails

### AI Control Endpoints

```bash
# Monitor quota usage
GET /api/ai/rate-limit-status

# Disable AI categorization when quota is low
POST /api/ai/disable-categorization

# Re-enable AI categorization
POST /api/ai/enable-categorization

# Clear AI cache to free memory
POST /api/ai/clear-cache
```

### Current Status Check
```bash
curl http://localhost:3000/api/ai/rate-limit-status
```

Expected response:
```json
{
  "success": true,
  "data": {
    "quota": {
      "calls": 0,
      "limit": 80,
      "date": "Wed Jul 30 2025"
    },
    "rateLimit": {
      "callCount": 0,
      "lastCall": 0,
      "limit": 1
    },
    "categorizationEnabled": true,
    "model": "gemini-2.5-pro"
  }
}
```

## 📡 API Endpoints

### Core Endpoints

#### Health Check
```http
GET /health
```

#### Email Search
```http
GET /api/emails/search?q=meeting&category=Interested&page=1&limit=20
```

**Query Parameters:**
- `q` - Search query (searches subject, body, from, to)
- `account` - Filter by email account
- `category` - Filter by AI category
- `from` - Filter by sender
- `to` - Filter by recipient  
- `dateFrom` - Start date (ISO string)
- `dateTo` - End date (ISO string)
- `hasAttachments` - Filter emails with attachments (true/false)
- `page` - Page number (default: 1)
- `limit` - Results per page (default: 20)
- `sortBy` - Sort field: `date`, `subject`, `from`
- `sortOrder` - Sort order: `asc`, `desc`

#### Get Specific Email
```http
GET /api/emails/:id
```

#### Generate Reply Suggestion
```http
POST /api/emails/:id/reply
```

Returns AI-generated reply with confidence score and context used.

#### Email Statistics
```http
GET /api/stats
```

Returns dashboard statistics including category counts, account status, AI quota status, etc.

#### Account Management
```http
GET /api/accounts
```

Returns list of connected email accounts with connection status.

#### Test Notifications
```http
POST /api/notifications/test
```

Sends test notifications to verify Slack/webhook configuration.

### RAG Context Management

#### Add Context
```http
POST /api/contexts
Content-Type: application/json

{
  "content": "For job applications, share meeting link: https://cal.com/interview",
  "type": "job_search",
  "priority": "high",
  "tags": ["job", "interview", "meeting"]
}
```

### Chat with AI About Your Emails

#### Start/Continue Chat
```http
POST /api/chat
Content-Type: application/json

{
  "sessionId": "optional-existing-session-id",
  "message": "Summarize my emails from John Smith",
  "emailIds": ["email-id-1", "email-id-2"]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "sessionId": "chat-session-uuid",
    "message": {
      "id": "message-id",
      "role": "model",
      "content": "Based on your emails from John Smith...",
      "timestamp": "2024-01-29T10:30:00Z"
    },
    "suggestedActions": ["Generate reply", "Schedule meeting"]
  }
}
```

#### Get Chat Session
```http
GET /api/chat/:sessionId
```

#### Get All Chat Sessions
```http
GET /api/chat?limit=10
```

#### Delete Chat Session
```http
DELETE /api/chat/:sessionId
```

#### Chat Statistics
```http
GET /api/chat/stats
```

**Example Chat Conversations:**
- "What are my most important emails today?"
- "Summarize my conversation with Sarah from last week"
- "Help me draft a reply to the meeting request"
- "Which emails need urgent attention?"
- "Find all emails about the project proposal"

## 🧪 Testing & Verification

### Phase 1: Setup Verification

1. **System Health Check**
```bash
curl http://localhost:3000/health
```
Expected: All services show `true`

2. **Baseline Stats**
```bash
curl http://localhost:3000/api/stats
```
Expected: Shows current email counts and AI quota status

3. **Chat Test**
```bash
curl -X POST "http://localhost:3000/api/chat" \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello, what can you help me with?"}'
```

### Phase 2: Email Account Setup

1. **Add Your Real Email Account**
```bash
# Create account.json with your credentials
{
  "label": "My Gmail",
  "user": "your-email@gmail.com",
  "password": "your-app-password",
  "host": "imap.gmail.com",
  "port": 993
}

# Add the account
curl -X POST "http://localhost:3000/api/accounts" \
  -H "Content-Type: application/json" \
  -d @account.json
```

2. **Verify Account Connection**
```bash
curl http://localhost:3000/api/accounts
```

### Phase 3: Test Email Processing

Send these test emails from **another email account** to your configured Gmail:

#### 📧 Test Email 1: Interested Lead
```
To: your-configured-gmail@gmail.com
Subject: Re: Software Development Partnership Opportunity

Hi,

I'm very interested in discussing a potential software development partnership. 
Our company is looking to build a new mobile application and would like to 
explore working with your team.

Could we schedule a call this week to discuss the project requirements?

Best regards,
John Smith
TechCorp Industries
```

#### 📧 Test Email 2: Meeting Booking  
```
To: your-configured-gmail@gmail.com
Subject: Confirmed: Strategy Meeting Tomorrow at 2 PM

Hi,

This is to confirm our strategy meeting scheduled for tomorrow at 2 PM.
The meeting will be held via Zoom. Please find the meeting details below:

Meeting Link: https://zoom.us/j/123456789
Time: Tomorrow, 2:00 PM - 3:00 PM EST

See you there!

Best,
Sarah Johnson
```

#### 📧 Test Email 3: Not Interested
```
To: your-configured-gmail@gmail.com
Subject: Re: Business Proposal

Thank you for your proposal, but we are not interested at this time.
We have already partnered with another vendor for this project.

Best regards,
Mike Wilson
```

### Phase 4: Verification Commands

**Wait 2-3 minutes** after sending emails, then run:

1. **Check Updated Statistics**
```bash
curl http://localhost:3000/api/stats
```
Expected: `totalEmails` should increase, category counts should show distribution

2. **View Processed Emails**
```bash
curl http://localhost:3000/api/emails?limit=10
```
Expected: JSON array with emails, each having a `category` field

3. **Test Category Filtering**
```bash
# Check interested leads
curl "http://localhost:3000/api/emails?category=Interested"

# Check meeting bookings  
curl "http://localhost:3000/api/emails?category=Meeting%20Booked"

# Check not interested
curl "http://localhost:3000/api/emails?category=Not%20Interested"
```

4. **Test Vector Database (RAG)**
```bash
# Test if AI can find emails about specific topics
curl -X POST "http://localhost:3000/api/chat" \
  -H "Content-Type: application/json" \
  -d '{"message": "What emails did I receive about software development?"}'

# Test contextual responses
curl -X POST "http://localhost:3000/api/chat" \
  -H "Content-Type: application/json" \
  -d '{"message": "How should I respond to partnership emails?"}'
```

5. **Test Email Search**
```bash
# Search by keyword
curl "http://localhost:3000/api/emails/search?q=meeting"

# Search by sender
curl "http://localhost:3000/api/emails/search?from=john@example.com"
```

### Expected Results ✅

#### Terminal Logs Should Show:
```
info: 📧 Processing new email: Re: Software Development Partnership from john@example.com
info: 🤖 AI categorizing email with Gemini
info: 📊 Email categorized as: Interested  
info: 🧠 Stored email context in vector database: email-123
info: ✅ Email processed successfully
```

#### API Stats Should Show:
```json
{
  "totalEmails": 685,  // Increased count
  "categoryCounts": {
    "Interested": 1,     // ← New properly categorized emails
    "Meeting Booked": 1, // ← New properly categorized emails  
    "Not Interested": 1, // ← New properly categorized emails
    "Spam": 682,         // ← Previous emails remain as spam
    "Out of Office": 0
  },
  "ai": {
    "quota": {
      "calls": 3,
      "limit": 80,
      "date": "Wed Jul 30 2025"
    }
  }
}
```

## 🔍 Advanced Usage

### Real-time Email Processing Pipeline

```
New Email Received (IMAP IDLE)
         ↓
AI Categorization (Gemini)
         ↓
Elasticsearch Indexing
         ↓
Vector Database Storage (Pinecone)
         ↓
Notification Logic (if "Interested")
         ↓
Slack/Webhook Notifications
```

### Search Examples

**Find all interested emails from last week:**
```http
GET /api/emails/search?category=Interested&dateFrom=2024-01-15&dateTo=2024-01-22
```

**Search for job-related emails:**
```http
GET /api/emails/search?q=job position career employment
```

**Find emails with attachments from specific sender:**
```http
GET /api/emails/search?from=recruiter@company.com&hasAttachments=true
```

### RAG Reply Generation

The system uses Pinecone vector database to store context information that helps generate better replies:

1. **Extract keywords** from incoming email
2. **Search vector database** for relevant context
3. **Generate reply** using Gemini with retrieved context
4. **Return suggestion** with confidence score

## 🔧 Development

### Running Tests

```bash
# Unit tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

### Development Scripts

```bash
# Start with auto-reload
npm run dev

# Build TypeScript
npm run build

# Start Elasticsearch only
npm run setup:elasticsearch

# View Elasticsearch logs
npm run logs:elasticsearch

# Full development setup (backend + frontend)
npm run dev:full
```

### Project Structure

```
email-onebox/
├── src/
│   ├── controllers/     # API request handlers
│   ├── services/        # Core business logic
│   │   ├── ImapService.ts          # 🚨 CRITICAL: Real-time email sync
│   │   ├── ElasticsearchService.ts # Email storage & search
│   │   ├── AIService.ts            # Gemini AI categorization
│   │   ├── ChatService.ts          # AI chat about emails
│   │   ├── NotificationService.ts  # Slack/webhook notifications
│   │   └── VectorService.ts        # RAG implementation
│   ├── models/          # Data models
│   ├── routes/          # API routes
│   ├── utils/           # Utilities (logger, validators)
│   ├── types/           # TypeScript definitions
│   └── app.ts           # Main Express application
├── frontend/            # React frontend (optional)
├── docker-compose.yml   # Elasticsearch container
├── package.json
├── tsconfig.json
└── env.example
```

### Logging

Logs are written to:
- `logs/email-onebox.log` - All application logs
- `logs/error.log` - Error logs only
- `logs/email-processing.log` - Detailed email processing (JSON format)

View live logs:
```bash
tail -f logs/email-onebox.log
```

## 🛡️ Security

### Best Practices Implemented

- **App Passwords**: Use app-specific passwords, never regular passwords
- **Environment Variables**: All sensitive data in environment variables
- **Rate Limiting**: API rate limiting to prevent abuse
- **Input Validation**: All email content sanitized before AI processing
- **CORS Configuration**: Proper CORS setup for frontend integration
- **Helmet.js**: Security headers for Express
- **Connection Security**: TLS-encrypted IMAP connections

### Security Checklist

- [ ] Use app passwords for Gmail accounts
- [ ] Keep Gemini API keys secure
- [ ] Use HTTPS in production
- [ ] Configure firewall rules
- [ ] Monitor logs for suspicious activity
- [ ] Regular dependency updates

## 🚀 Deployment

### Production Deployment

1. **Environment Setup**
```bash
# Set production environment
export NODE_ENV=production

# Use PM2 for process management
npm install -g pm2
pm2 start dist/app.js --name email-onebox
```

2. **Elasticsearch Configuration**
```bash
# Increase heap size for production
docker-compose up -d
# Edit docker-compose.yml: ES_JAVA_OPTS=-Xms1g -Xmx1g
```

3. **Monitoring Setup**
```bash
# PM2 monitoring
pm2 monitor

# Log rotation
pm2 install pm2-logrotate
```

### Docker Deployment

```dockerfile
# Dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
EXPOSE 3000
CMD ["node", "dist/app.js"]
```

### Performance Optimizations

- **Connection Pooling**: Reuse IMAP connections efficiently
- **Batch Processing**: Process multiple emails in batches
- **Caching**: Cache AI categorization results
- **Email Deduplication**: Check messageId before indexing
- **Circuit Breakers**: Prevent cascade failures

## 📊 Monitoring

### Key Metrics to Monitor

- **Email Processing Rate**: Emails processed per minute
- **IMAP Connection Health**: Connection status for all accounts
- **AI Categorization Accuracy**: Category distribution over time  
- **Elasticsearch Performance**: Search response times
- **Notification Delivery**: Success rates for Slack/webhooks
- **System Resources**: Memory usage, CPU usage
- **AI Quota Usage**: Daily API call consumption

### Health Check Endpoints

```bash
# Overall system health
curl http://localhost:3000/health

# Email statistics
curl http://localhost:3000/api/stats

# Account connection status
curl http://localhost:3000/api/accounts

# AI quota status
curl http://localhost:3000/api/ai/rate-limit-status
```

## 🐛 Troubleshooting

### Common Issues

#### IMAP Connection Fails
```bash
# Check credentials and app passwords
# Gmail: Use app password, not regular password
# Outlook: Check if 2FA is enabled

# Test IMAP connection manually
telnet imap.gmail.com 993
```

#### Elasticsearch Connection Error
```bash
# Check if container is running
docker ps | grep elasticsearch

# Check logs
docker logs elasticsearch

# Restart container
docker-compose restart elasticsearch
```

#### Gemini API Errors
```bash
# Check Gemini API key validity in logs
grep "Gemini.*failed" logs/email-onebox.log

# Monitor rate limits in logs
grep "rate limit" logs/email-onebox.log

# Check quota status
curl http://localhost:3000/api/ai/rate-limit-status
```

#### High Memory Usage
```bash
# Monitor memory usage
npm run logs:memory

# Restart application
pm2 restart email-onebox

# Clear AI cache
curl -X POST http://localhost:3000/api/ai/clear-cache
```

#### All Emails Categorized as "Spam"
```bash
# Check AI quota status
curl http://localhost:3000/api/ai/rate-limit-status

# If quota exceeded, wait for reset or upgrade API plan
# If service unavailable, check Gemini API key

# Test AI health
curl http://localhost:3000/health
```

### Debug Mode

```bash
# Enable debug logging
export DEBUG=email-onebox:*
export LOG_LEVEL=debug

# Start with detailed logging
npm run dev
```

## 📈 Performance Benchmarks

**Typical Performance (on modest hardware):**

- **Email Sync**: 50-100 emails/minute
- **AI Categorization**: 10-20 emails/minute  
- **Search Response**: <200ms for typical queries
- **Reply Generation**: 2-5 seconds per email
- **Memory Usage**: 200-500MB (depending on email volume)
- **AI Quota**: 80 calls/day (conservative limit)

## 🤝 Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open Pull Request

### Development Guidelines

- Follow TypeScript strict mode
- Add comprehensive error handling
- Include unit tests for new features
- Update documentation
- Follow existing code style

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Google** for powerful Gemini AI capabilities
- **Elastic** for excellent search functionality  
- **Pinecone** for vector database services
- **Slack** for notification integration
- **Node.js Community** for excellent libraries

## 📞 Support

- **Documentation**: See this README and inline code comments
- **Issues**: Create an issue on GitHub
- **Logs**: Check `logs/` directory for detailed information
- **Health**: Use `/health` endpoint for system status
- **AI Quota**: Monitor at `/api/ai/rate-limit-status`

---

**🎉 Ready to revolutionize your email management!**

Start by running `npm run dev` and watch your emails get intelligently categorized in real-time! 