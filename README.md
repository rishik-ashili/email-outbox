

# Email Onebox System 📧

A feature-rich email aggregation system that synchronizes multiple IMAP accounts in real-time, provides AI-powered email categorization, and includes advanced features like suggested replies using RAG (Retrieval-Augmented Generation).
📹 [Watch Demo Video](https://drive.google.com/file/d/1yGJiDNNIUDUyFUYUV-MDHX0-wK_YQSfy/view?usp=sharing)

![Status](https://img.shields.io/badge/Status-Production%20Ready-green.svg) ![TypeScript](https://img.shields.io/badge/TypeScript-5.2.2-blue.svg) ![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg) ![Docker](https://img.shields.io/badge/Docker-Required-blue.svg)

---
<img width="1919" height="925" alt="image" src="https://github.com/user-attachments/assets/f7ef47d2-7f0b-4068-b6d5-c63faea304a6" />
<img width="1919" height="905" alt="image" src="https://github.com/user-attachments/assets/5158e977-0018-407e-a1ff-b1e33384519f" />


## Table of Contents

- [Features](#-features)
- [Architecture](#️-architecture)
- [Quick Start](#-quick-start)
- [Frontend UI Setup](#-frontend-ui-setup)
- [Configuration](#-configuration)
- [API Endpoints Guide](#-api-endpoints-guide)
- [Task-Based Help (How to...)](#-task-based-help-how-to)
  - [How to Search for an Email](#how-to-search-for-an-email)
  - [How to See Emails of a Specific Category](#how-to-see-emails-of-a-specific-category)
  - [How to See System and Category Statistics](#how-to-see-system-and-category-statistics)
  - [How to Generate an AI Reply to an Email](#how-to-generate-an-ai-reply-to-an-email)
- [AI Quota Management](#-ai-quota-management)
- [Testing & Verification](#-testing--verification)
- [Troubleshooting](#-troubleshooting)
- [Development](#-development)
- [Deployment](#-deployment)

## 🎯 Features

- **Real-time Email Sync**: Persistent IMAP connections with a stable event-driven model (no inefficient polling).
- **AI-Powered Categorization**: Automatic email classification using Google Gemini AI.
- **Smart Search**: Elasticsearch-powered full-text search with advanced filters.
- **RAG-based Replies**: Context-aware reply suggestions using Pinecone vector database.
- **Multi-Platform Notifications**: Slack integration and webhook triggers for important emails.
- **Intelligent Email Chat**: Multi-turn conversations about your emails using Gemini AI.
- **Secure & Scalable**: Production-ready with comprehensive error handling and deduplication.
- **Circuit Breaker Pattern**: Resilient external API calls.
- **AI Quota Management**: Intelligent caching, rate limiting, and daily quota tracking for the Gemini API.

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
│  (Storage)      │    │   (RAG/Pinecone)│    │   (User Facing) │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 🚀 Quick Start

This guide is for setting up the **backend server**. For the UI, see the [Frontend UI Setup](#-frontend-ui-setup) section.

### Prerequisites

- **Node.js 20.19+ or 22.12+** (LTS Recommended). Use [nvm](https://github.com/coreybutler/nvm-windows) to manage versions.
- **Docker** and Docker Compose
- **Gmail accounts** with app passwords
- **Google Gemini API key**
- **Pinecone account**
- **Slack workspace** (optional)

### 1. Clone and Install Backend

```bash
git clone <repository-url>
cd email-onebox
npm install
```

### 2. Start Elasticsearch

```bash
# Start Elasticsearch container in the background
docker-compose up -d elasticsearch

# Verify it's running (wait a few seconds)
curl http://localhost:9200
```

### 3. Configure Backend Environment

```bash
# Copy the environment template
cp env.example .env

# Edit the .env file with your credentials
nano .env
```

### 4. Start the Backend Application

```bash
# Start in development mode with auto-reload
npm run dev
```
The backend server will be running on `http://localhost:3000`.

## 🖥️ Frontend UI Setup

This project includes a fully functional React UI. Run these commands in a **new, separate terminal**.

### 1. Create the Frontend Project with Vite

This command creates a `frontend` folder inside your `email-onebox` directory.

```bash
# From the root 'email-onebox' directory
npm create vite@latest
```
When prompted:
- **Project name:** `frontend`
- **Select a framework:** `React`
- **Select a variant:** `TypeScript + SWC`

### 2. Install Frontend Dependencies

```bash
cd frontend
npm install
npm install axios
npm install -D tailwindcss postcss autoprefixer
```

### 3. Initialize and Configure Tailwind CSS

```bash
# This creates tailwind.config.js and postcss.config.js
npx tailwindcss init -p

# Then, configure tailwind.config.js and src/index.css
# (Refer to the provided source code for the correct configuration)
```

### 4. Start the Frontend Application

```bash
# Make sure your backend is already running on port 3000
npm run dev
```
The frontend UI will be available at `http://localhost:5173`.

## 🔧 Configuration

### Core Environment Variables

Fill these in your `.env` file for the backend server.

#### Email Accounts (Gmail Recommended)

For each Gmail account:
1.  Enable 2-factor authentication.
2.  Generate a 16-character [App Password](https://support.google.com/accounts/answer/185833).
3.  Use the App Password, NOT your regular password.

```env
# Gmail Account #1 (use App Password!)
EMAIL1_USER=your-first-email@gmail.com
EMAIL1_PASS=your-16-char-app-password
EMAIL1_HOST=imap.gmail.com
EMAIL1_PORT=993
EMAIL1_LABEL=Gmail-1

# Gmail Account #2
EMAIL2_USER=your-second-email@gmail.com
EMAIL2_PASS=another-16-char-app-password
EMAIL2_HOST=imap.gmail.com
EMAIL2_PORT=993
EMAIL2_LABEL=Gmail-2
```

#### AI & Vector DB Services (Required)

```env
# Google Gemini AI (for classification and chat)
GEMINI_API_KEY=your-gemini-api-key
GEMINI_EMBEDDING_API_KEY=your-gemini-api-key-for-embeddings # Can be the same key

# Pinecone (for RAG)
PINECONE_API_KEY=your-pinecone-api-key
PINECONE_INDEX=email
PINECONE_ENVIRONMENT=us-east-1
```

#### Notifications (Optional)

```env
# Slack Integration
SLACK_BOT_TOKEN=xoxb-your-slack-bot-token
SLACK_CHANNEL=#your-channel-name
SLACK_ENABLED=true

# Webhook Integration
WEBHOOK_URL=https://webhook.site/your-unique-url
WEBHOOK_ENABLED=true
```

### Email Categories

The system automatically categorizes emails into: `Interested`, `Meeting Booked`, `Not Interested`, `Spam`, `Out of Office`.

## 📡 API Endpoints Guide

All `curl` commands are for PowerShell. For other shells (bash, zsh), you may need to adjust quoting.

### System & Health

#### Health Check
Check the status of all connected services.
```bash
curl http://localhost:3000/health
```

#### System Statistics
Get a dashboard overview of email counts, categories, connections, and AI quota.
```bash
curl http://localhost:3000/api/stats
```

### Email Management

#### Search Emails
A powerful endpoint to find emails with various filters.
```bash
# Basic keyword search
curl "http://localhost:3000/api/emails/search?q=partnership"

# Search by category
curl "http://localhost:3000/api/emails/search?category=Interested"

# Combined search (Note: %20 is a URL-encoded space)
curl "http://localhost:3000/api/emails/search?category=Meeting%20Booked&q=confirmed"
```

#### Get a Specific Email
Retrieve a single email by its unique ID.
```bash
# Replace :id with an actual email ID
curl http://localhost:3000/api/emails/:id
```

#### Generate AI Reply Suggestion
Generate a contextual reply for a specific email.
```bash
# Replace :id with an actual email ID
curl -X POST http://localhost:3000/api/emails/:id/reply
```

### Account Management

#### List Connected Accounts
See all configured email accounts and their connection status.
```bash
curl http://localhost:3000/api/accounts
```

#### Add a New Email Account
Add a new IMAP account to the system.
```bash
# 1. Create a file 'account.json' with your credentials
# {
#   "label": "My New Gmail",
#   "user": "new-email@gmail.com",
#   "password": "new-app-password",
#   "host": "imap.gmail.com",
#   "port": 993
# }
# 2. Run the command
curl -X POST http://localhost:3000/api/accounts -H "Content-Type: application/json" -d "@account.json"
```

### AI Chat

#### Start or Continue a Chat
The main endpoint for interacting with the email chat AI.
```powershell
# 1. Create a file 'chat-request.json'
# {
#   "message": "Summarize my emails about 'Project X'"
# }
# 2. Run the command
curl -X POST http://localhost:3000/api/chat -H "Content-Type: application/json" -d (Get-Content -Raw chat-request.json)
```

#### Get Chat Session History
Retrieve all messages for a specific chat session.
```bash
# Replace :sessionId with an actual session ID from a chat response
curl http://localhost:3000/api/chat/:sessionId
```

## 📖 Task-Based Help (How to...)

Here’s how to perform common tasks using the API.

### How to Search for an Email

Use the `/api/emails/search` endpoint with the `q` parameter.
**Goal:** Find all emails that mention "proposal".
```bash
curl "http://localhost:3000/api/emails/search?q=proposal"
```

### How to See Emails of a Specific Category

Use the `/api/emails/search` endpoint with the `category` parameter.
**Goal:** View all emails that the AI has marked as `Not Interested`.
```bash
curl "http://localhost:3000/api/emails/search?category=Not%20Interested"
```

### How to See System and Category Statistics

Use the `/api/stats` endpoint.
**Goal:** Check how many emails are in each category and the current AI quota usage.
```bash
curl http://localhost:3000/api/stats
```
Look for the `categoryCounts` and `ai.quota` objects in the JSON response.

### How to Generate an AI Reply to an Email

This is a two-step process.
**Goal:** Generate a reply for an "Interested" email.

**Step 1: Find the ID of an "Interested" email.**
```bash
curl "http://localhost:3000/api/emails/search?category=Interested&limit=1"
```
From the response, copy the `id` value (e.g., `5d12b1ac-e785-4c5e-ba1d-efb3bf4e54a2`).

**Step 2: Request the reply using that ID.**
```bash
# Replace the example ID with the one you copied
curl -X POST http://localhost:3000/api/emails/5d12b1ac-e785-4c5e-ba1d-efb3bf4e54a2/reply
```
The response will contain the `suggestedReply` from the AI.

## 🤖 AI Quota Management

This system is designed to be mindful of free-tier API limits.
- **Daily Quota Tracking:** A conservative limit on daily API calls with automatic reset.
- **Intelligent Caching:** Avoids re-categorizing the same email.
- **Rate Limiting:** Prevents sending too many requests per minute.
- **Content Optimization:** Truncates long emails to save tokens.

#### AI Control Endpoints
```bash
# Monitor current quota and rate limit status
curl http://localhost:3000/api/ai/rate-limit-status

# Manually disable AI categorization if quota is low
curl -X POST http://localhost:3000/api/ai/disable-categorization

# Re-enable it later
curl -X POST http://localhost:3000/api/ai/enable-categorization
```

## 🧪 Testing & Verification

Send test emails to your configured accounts and use the API endpoints above to verify:
1.  Emails appear via `/api/emails`.
2.  Statistics update via `/api/stats`.
3.  Emails are correctly categorized.
4.  Slack/webhook notifications are sent for "Interested" emails.
5.  AI replies can be generated.

## 🐛 Troubleshooting

#### IMAP Connection Fails
- Ensure you are using a **16-character App Password** for Gmail, not your regular password.
- Double-check the IMAP host, port, and user settings in your `.env` file.

#### Elasticsearch Connection Error
- Make sure the Docker container is running: `docker ps`.
- If not, start it: `docker-compose up -d elasticsearch`.

#### All Emails Categorized as "Spam"
- This is a symptom of AI categorization failing.
- Check your AI quota: `curl http://localhost:3000/api/ai/rate-limit-status`.
- Verify your `GEMINI_API_KEY` is correct.

#### Resetting the System
To start fresh, you need to clear your data.
```bash
# 1. Stop the application (Ctrl+C)
# 2. Delete the Elasticsearch index
curl -X DELETE "http://localhost:9200/emails"
# 3. Delete and recreate the index in the Pinecone console
# 4. Restart the application
```

## 🔧 Development

### Project Structure
```
email-onebox/
├── src/          # Backend source code
├── frontend/     # Frontend source code
└── ...
```

### Scripts
```bash
# Start backend dev server
npm run dev

# Start frontend dev server (in 'frontend' directory)
npm run dev
```

## 🚀 Deployment

Use a process manager like PM2 for production.
```bash
# Install PM2 globally
npm install -g pm2

# Build the backend app
npm run build

# Start with PM2
pm2 start dist/app.js --name email-onebox-backend
```
