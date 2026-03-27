import { GoogleGenAI } from '@google/genai';
import { GoogleAuth } from 'google-auth-library';

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
    // Attempt a simple call. It might throw AuthError if not logged in.
    await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: 'Hi',
    });
    console.log("generateContent call succeeded.");
  } catch (e) {
    console.error("Caught error:", e.message);
  }
}
test();
