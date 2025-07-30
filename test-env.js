require('dotenv').config();

console.log('🔍 Environment Variables Test');
console.log('============================');

console.log('\n📋 Key Environment Variables:');
console.log('   GEMINI_API_KEY:', process.env.GEMINI_API_KEY ? `${process.env.GEMINI_API_KEY.substring(0, 10)}...` : 'NOT FOUND');
console.log('   GEMINI_MODEL:', process.env.GEMINI_MODEL || 'NOT SET');
console.log('   AI_CATEGORIZATION_ENABLED:', process.env.AI_CATEGORIZATION_ENABLED || 'NOT SET');
console.log('   ELASTICSEARCH_URL:', process.env.ELASTICSEARCH_URL || 'NOT SET');
console.log('   PINECONE_API_KEY:', process.env.PINECONE_API_KEY ? `${process.env.PINECONE_API_KEY.substring(0, 10)}...` : 'NOT FOUND');

console.log('\n🎯 Analysis:');
if (!process.env.GEMINI_API_KEY) {
    console.log('   ❌ GEMINI_API_KEY is missing - this will cause AI service to fail');
} else {
    console.log('   ✅ GEMINI_API_KEY is present');
}

if (!process.env.PINECONE_API_KEY) {
    console.log('   ❌ PINECONE_API_KEY is missing - this will cause vector service to fail');
} else {
    console.log('   ✅ PINECONE_API_KEY is present');
}

console.log('\n💡 If any keys are missing, check your .env file'); 