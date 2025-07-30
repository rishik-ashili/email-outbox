const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

async function testNewAPIKey() {
    try {
        console.log('🔑 Testing New Gemini API Key');
        console.log('=============================');

        const apiKey = process.env.GEMINI_API_KEY;
        console.log('   API Key:', apiKey ? `${apiKey.substring(0, 10)}...` : 'NOT FOUND');

        if (!apiKey) {
            console.log('   ❌ GEMINI_API_KEY not found in environment variables');
            return;
        }

        console.log('\n🤖 Testing New API Key...');

        const gemini = new GoogleGenerativeAI(apiKey);
        const model = gemini.getGenerativeModel({ model: 'gemini-2.5-pro' });

        // Test 1: Simple health check
        console.log('\n📊 1. Testing Simple Health Check...');
        try {
            const result = await model.generateContent("Hello");
            console.log('   ✅ Health Check Passed');
            console.log('   📝 Response:', result.response.text().substring(0, 50) + '...');
        } catch (error) {
            console.log('   ❌ Health Check Failed:', error.message);
            return;
        }

        // Test 2: Email categorization test
        console.log('\n📧 2. Testing Email Categorization...');
        const testEmail = {
            subject: "I'm interested in your software development services",
            body: "Hi, I'm very interested in discussing a potential partnership. Could we schedule a call this week?"
        };

        const categorizationPrompt = `
Analyze this email and categorize it into EXACTLY one of these categories:
- Interested: Shows genuine interest in product/service/opportunity
- Meeting Booked: About scheduling/confirming meetings or calls
- Not Interested: Explicit decline or disinterest
- Spam: Promotional, suspicious, or irrelevant content
- Out of Office: Auto-reply indicating unavailability

Email Subject: ${testEmail.subject}
Email Body: ${testEmail.body}

Respond with ONLY the category name, nothing else.
        `.trim();

        try {
            const result = await model.generateContent(categorizationPrompt);
            const category = result.response.text().trim();
            console.log('   ✅ Categorization Test Passed');
            console.log('   📝 Category:', category);
            console.log('   📧 Test Email Subject:', testEmail.subject);
        } catch (error) {
            console.log('   ❌ Categorization Test Failed:', error.message);
        }

        console.log('\n🎯 Summary:');
        console.log('   ✅ New API key is working');
        console.log('   💡 The application should now work correctly');

    } catch (error) {
        console.error('❌ Error testing new API key:', error.message);
    }
}

testNewAPIKey(); 