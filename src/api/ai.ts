import express from 'express';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import { generateContentWithCodeAssist } from '../lib/codeAssist.js';
import {
  isCredentialsCompatible,
  loadCredentials,
  resolveOAuthClientConfig,
} from '../lib/oauth.js';

dotenv.config({ path: '.env.local' });

const router = express.Router();
const apiKey = process.env.GEMINI_API_KEY?.trim();

let apiKeyClient: GoogleGenAI | null = null;
if (apiKey && apiKey !== 'AIzaSy...') {
  console.log('[Server] Initializing Gemini AI with API Key.');
  apiKeyClient = new GoogleGenAI({ apiKey });
} else {
  console.log('[Server] No valid GEMINI_API_KEY found. AI routes will prefer Code Assist OAuth.');
}

async function generateContent(params: any): Promise<{ text: string }> {
  if (apiKeyClient) {
    const response = await apiKeyClient.models.generateContent(params);
    return { text: response.text };
  }

  const credentials = await loadCredentials();
  if (!credentials) {
    throw new Error('未找到可用的 AI 凭证。请先运行 `npx tsx cli.ts auth login` 或配置 GEMINI_API_KEY。');
  }

  const clientConfig = resolveOAuthClientConfig();
  if (!isCredentialsCompatible(credentials, clientConfig.clientId)) {
    throw new Error('已保存的 OAuth 凭证与当前 Gemini CLI client 不兼容，请重新运行 `npx tsx cli.ts auth login`。');
  }

  const response = await generateContentWithCodeAssist(params, clientConfig);
  return { text: response.text };
}

router.post('/generateContent', async (req, res) => {
  try {
    const response = await generateContent(req.body);
    res.json(response);
  } catch (error: any) {
    console.error('[AI] Generate Content Error:', error);
    const message = error.message || 'Error generating content';
    const status =
      message.includes('429 ') || message.includes('RATE_LIMIT_EXCEEDED') || message.includes('MODEL_CAPACITY_EXHAUSTED')
        ? 429
        : 500;
    res.status(status).json({ error: message });
  }
});

router.post('/embedContent', async (req, res) => {
  if (!apiKeyClient) {
    res.status(501).json({
      error: '当前服务端未配置 GEMINI_API_KEY，embedding 仅支持 API Key 路径。',
    });
    return;
  }

  try {
    const response = await apiKeyClient.models.embedContent(req.body);
    res.json(response);
  } catch (error: any) {
    console.error('[AI] Embed Content Error:', error);
    res.status(500).json({ error: error.message || 'Error generating embedding' });
  }
});

export default router;
