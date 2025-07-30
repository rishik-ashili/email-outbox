# Email Processing Monitoring Guide

## Real-Time Monitoring Commands

### 1. Watch Terminal Logs
Look for these log messages in your `npm run dev` terminal:

```
info: 📧 New email received from: sender@email.com
info: 🤖 Processing email: "Subject Line"
info: 📊 Email categorized as: Interested
info: 🧠 Storing email context in vector database
info: ✅ Email processed and indexed successfully
```

### 2. Check Email Count
```powershell
curl http://localhost:3000/api/stats
```
Look for: `"totalEmails": X` (should increase)

### 3. View All Processed Emails
```powershell
curl http://localhost:3000/api/emails
```

### 4. Search by Category
```powershell
curl "http://localhost:3000/api/emails?category=Interested"
curl "http://localhost:3000/api/emails?category=Meeting%20Booked"
curl "http://localhost:3000/api/emails?category=Not%20Interested"
curl "http://localhost:3000/api/emails?category=Spam"
curl "http://localhost:3000/api/emails?category=Out%20of%20Office"
```

### 5. Test Vector Database Integration
```powershell
curl -X POST "http://localhost:3000/api/chat" -H "Content-Type: application/json" -d "{\"message\":\"What emails did I receive about software development?\"}"
``` 