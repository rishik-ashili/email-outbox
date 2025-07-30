# Chat Examples for Email Onebox

## Test these chat messages:

### 1. General Help
```json
{"message": "What can you help me with?"}
```

### 2. Email Management
```json
{"message": "How do I organize my emails better?"}
```

### 3. Writing Help
```json
{"message": "Help me write a professional follow-up email"}
```

### 4. Email Analysis
```json
{"message": "Can you analyze email sentiment?"}
```

### 5. Productivity Tips
```json
{"message": "Give me tips for managing email efficiently"}
```

## How to test:
1. Copy any JSON above
2. Save to a file like test-message.json
3. Run: curl -X POST "http://localhost:3000/api/chat" -H "Content-Type: application/json" -d "@test-message.json" 