# Email Onebox Verification Checklist ✅

## Pre-Setup Verification
- [ ] System health check: `curl http://localhost:3000/health` shows all services `true`
- [ ] Baseline stats: `curl http://localhost:3000/api/stats` shows 0 emails
- [ ] Chat working: `curl -X POST "http://localhost:3000/api/chat" -H "Content-Type: application/json" -d "@quick-test.json"`

## Setup Phase
- [ ] Gmail App Password obtained (16 characters)
- [ ] Updated `real-gmail-account.json` with real credentials
- [ ] Added account: `curl -X POST "http://localhost:3000/api/accounts" -H "Content-Type: application/json" -d "@real-gmail-account.json"`
- [ ] Account verified: `curl http://localhost:3000/api/accounts` shows your account

## Email Testing Phase
- [ ] Sent 6 different test emails (from `test-emails-to-send.md`)
- [ ] Waited 3-5 minutes for IMAP processing
- [ ] Watched terminal logs for processing messages

## Verification Commands & Expected Results

### 1. Statistics Check ✅
```powershell
curl http://localhost:3000/api/stats
```
**Expected Results:**
- `"totalEmails": 6` (or number of emails sent)
- `"categoryCounts"` showing distribution like:
  - `"Interested": 1`
  - `"Meeting Booked": 1` 
  - `"Not Interested": 1`
  - `"Spam": 1`
  - `"Out of Office": 1`

### 2. Email List Check ✅
```powershell
curl http://localhost:3000/api/emails
```
**Expected Results:**
- JSON array with 6 email objects
- Each email has `"category"` field set
- Each email has `"subject"`, `"from"`, `"body"` fields

### 3. Category Filtering ✅
```powershell
curl "http://localhost:3000/api/emails?category=Interested"
```
**Expected Results:**
- Should return only emails categorized as "Interested"
- Likely the "Software Development Services" email

### 4. Vector Database (RAG) Test ✅
```powershell
curl -X POST "http://localhost:3000/api/chat" -H "Content-Type: application/json" -d "{\"message\":\"What emails did I receive about software development?\"}"
```
**Expected Results:**
- AI should mention the specific email about software development
- Should reference actual email content from your inbox

### 5. Contextual AI Test ✅
```powershell
curl -X POST "http://localhost:3000/api/chat" -H "Content-Type: application/json" -d "{\"message\":\"How many interested leads do I have?\"}"
```
**Expected Results:**
- AI should count and report the number of "Interested" category emails
- Should provide specific numbers based on your actual data

### 6. Search Functionality ✅
```powershell
curl "http://localhost:3000/api/emails/search?q=meeting"
```
**Expected Results:**
- Should return emails containing the word "meeting"
- Elasticsearch should find relevant emails

## Success Indicators 🎯

### Terminal Logs Should Show:
```
info: 📧 New email received from: john@example.com
info: 🤖 Processing email: "Re: Software Development Services Inquiry"
info: 📊 Email categorized as: Interested
info: 🧠 Storing email context in Pinecone  
info: ✅ Email processed and indexed successfully
```

### API Responses Should Show:
- ✅ Non-zero email counts
- ✅ Proper category distribution  
- ✅ AI can find emails by content
- ✅ AI provides contextual responses
- ✅ Search returns relevant results

## Troubleshooting Checklist 🔧

### If No Emails Appear:
- [ ] Check terminal for IMAP connection errors
- [ ] Verify Gmail App Password is correct (16 characters, no spaces)
- [ ] Check account status: `curl http://localhost:3000/api/accounts`
- [ ] Wait longer (initial sync can take 5+ minutes)
- [ ] Check email account has emails in INBOX folder

### If Categorization Fails:
- [ ] Check terminal for AI processing errors
- [ ] Verify Gemini API key is working: `curl http://localhost:3000/health`
- [ ] Check individual email: `curl http://localhost:3000/api/emails/[id]`

### If Vector Search Fails:
- [ ] Check Pinecone connection: `curl http://localhost:3000/health` 
- [ ] Verify vector count in stats > 0
- [ ] Test with simpler chat questions first

## Complete Success = All Green ✅
When all above checks pass, your Email Onebox is:
- ✅ Receiving emails via IMAP
- ✅ Processing with Gemini AI  
- ✅ Categorizing correctly
- ✅ Storing in Elasticsearch
- ✅ Creating vector embeddings in Pinecone
- ✅ Providing intelligent chat responses
- ✅ Enabling semantic search 