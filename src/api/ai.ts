import express from 'express';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const router = express.Router();

let ai: GoogleGenAI;
const apiKey = process.env.GEMINI_API_KEY;

if (apiKey && apiKey !== "AIzaSy..." && apiKey.trim() !== "") {
    console.log("[Server] Initializing Gemini AI with API Key.");
    ai = new GoogleGenAI({ apiKey });
} else {
    console.log("[Server] No valid GEMINI_API_KEY found. Initializing Gemini AI with GoogleAuth (ADC/OAuth).");
    ai = new GoogleGenAI({
        googleAuthOptions: {
            scopes: ['https://www.googleapis.com/auth/cloud-platform']
        }
    });
}

router.post('/generateContent', async (req, res) => {
    try {
        const response = await ai.models.generateContent(req.body);
        // We only send back what the frontend needs to save bandwidth
        res.json({ text: response.text });
    } catch (error: any) {
        console.error('[AI] Generate Content Error:', error);
        res.status(500).json({ error: error.message || 'Error generating content' });
    }
});

router.post('/embedContent', async (req, res) => {
    try {
        const response = await ai.models.embedContent(req.body);
        res.json(response);
    } catch (error: any) {
        console.error('[AI] Embed Content Error:', error);
        res.status(500).json({ error: error.message || 'Error generating embedding' });
    }
});

export default router;
