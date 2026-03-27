const { GoogleGenAI } = require('@google/genai');
const { GoogleAuth } = require('google-auth-library');

async function test() {
  try {
    const auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/generative-language']
    });
    
    // Check if we can init GoogleGenAI with auth
    const ai = new GoogleGenAI({
      auth: auth
    });
    
    console.log("Initialized AI with auth config.");
    // Attempt a simple call, this will probably fail without credentials, but we can see if it throws an initialization error.
    await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: 'Hi',
    });
  } catch (e) {
    console.error(e.message);
  }
}
test();
