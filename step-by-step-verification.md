# Complete Email Onebox Verification Guide

## Phase 1: Setup (Do this first)

### Step 1: Add Your Real Email Account
1. Update `real-gmail-account.json` with:
   - Your real Gmail address
   - Your Gmail App Password (16 characters)

2. Add the account:
```powershell
curl -X POST "http://localhost:3000/api/accounts" -H "Content-Type: application/json" -d "@real-gmail-account.json"
```

3. Verify account was added:
```powershell
curl http://localhost:3000/api/accounts
```

## Phase 2: Send Test Emails (From another email)

Send the test emails from `test-emails-to-send.md` to your configured Gmail account.

**Wait 2-3 minutes** for the IMAP sync to process them.

## Phase 3: Verification Commands

### 1. Check Updated Statistics
```powershell
curl http://localhost:3000/api/stats
```
**Expected:** `totalEmails` should increase, category counts should show numbers

### 2. View All Processed Emails
```powershell
curl http://localhost:3000/api/emails
```
**Expected:** JSON array with your emails, each having a `category` field

### 3. Test Category-Specific Filtering
```powershell
# Check interested leads
curl "http://localhost:3000/api/emails?category=Interested"

# Check meeting bookings  
curl "http://localhost:3000/api/emails?category=Meeting%20Booked"

# Check not interested
curl "http://localhost:3000/api/emails?category=Not%20Interested"

# Check spam
curl "http://localhost:3000/api/emails?category=Spam"

# Check out of office
curl "http://localhost:3000/api/emails?category=Out%20of%20Office"
```

### 4. Test Vector Database (RAG) Integration
```powershell
# Test if AI can find emails about specific topics
curl -X POST "http://localhost:3000/api/chat" -H "Content-Type: application/json" -d "{\"message\":\"What emails did I receive about software development?\"}"

# Test if AI can provide contextual responses
curl -X POST "http://localhost:3000/api/chat" -H "Content-Type: application/json" -d "{\"message\":\"How should I respond to partnership emails?\"}"

# Test categorization understanding
curl -X POST "http://localhost:3000/api/chat" -H "Content-Type: application/json" -d "{\"message\":\"How many interested leads do I have?\"}"
```

### 5. Test Email Search
```powershell
# Search by keyword
curl "http://localhost:3000/api/emails/search?q=meeting"

# Search by sender
curl "http://localhost:3000/api/emails/search?from=john@example.com"

# Search with pagination
curl "http://localhost:3000/api/emails?page=1&limit=5"
```

## Phase 4: What to Look For

### Terminal Logs (Real-time monitoring)
Watch your `npm run dev` terminal for:
```
info: 📧 New email received from: sender@email.com
info: 🤖 Processing email with Gemini AI
info: 📊 Email categorized as: [Category]
info: 🧠 Storing email context in Pinecone
info: ✅ Email processed successfully
```

### Expected Results
1. **Statistics should update:** Email counts increase
2. **Categories should populate:** Emails distributed across 5 categories
3. **Vector search should work:** AI can find emails by content
4. **Chat should be contextual:** AI references your actual emails
5. **Search should return results:** Elasticsearch finds emails by keywords

## Phase 5: Troubleshooting

### If No Emails Appear:
1. Check account connection: `curl http://localhost:3000/api/accounts`
2. Check terminal for IMAP errors
3. Verify Gmail App Password is correct
4. Wait longer (IMAP sync can take 5+ minutes)

### If Categorization Seems Wrong:
1. Check terminal logs for AI processing messages
2. View specific email: `curl http://localhost:3000/api/emails/[email-id]`
3. Test AI chat: Ask about the email content

### If Vector Search Doesn't Work:
1. Check Pinecone connection: `curl http://localhost:3000/health`
2. Verify vector count in stats
3. Test with simpler queries first 