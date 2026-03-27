import express from 'express';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import { generateContentWithCodeAssist, generateContentStreamWithCodeAssist } from '../lib/codeAssist.js';
import {
  generateContentStreamWithApiKeyProvider,
  generateContentWithApiKeyProvider,
} from '../lib/providerGateway.js';
import {
  getApiModelId,
  getProviderForModel,
  parseModelSelection,
} from '../lib/aiModels.js';
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

function withApiModelId(params: any) {
  return {
    ...params,
    model: getApiModelId(params?.model),
  };
}

// ─── 非流式路由（用于 JSON 结构化输出等场景） ───

async function generateContent(params: any): Promise<{ text: string }> {
  const parsed = parseModelSelection(params?.model);
  if (parsed.provider !== 'gemini') {
    const response = await generateContentWithApiKeyProvider({
      ...params,
      model: parsed.canonicalId,
    });
    return { text: response.text };
  }

  const geminiParams = withApiModelId(params);

  if (apiKeyClient) {
    const response = await apiKeyClient.models.generateContent(geminiParams);
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

  const response = await generateContentWithCodeAssist(geminiParams, clientConfig);
  return { text: response.text };
}

router.post('/generateContent', async (req, res) => {
  try {
    const response = await generateContent(req.body);
    res.json(response);
  } catch (error: any) {
    console.error('[AI] Generate Content Error:', error);
    const message = error.message || 'Error generating content';

    let status = 500;
    if (message.includes('429') || message.includes('RESOURCE_EXHAUSTED') || message.includes('MODEL_CAPACITY_EXHAUSTED')) {
      status = 429;
    } else if (message.includes('401') || message.includes('403') || message.includes('auth')) {
      status = 401;
    }

    res.status(status).json({ error: message, isCapacityError: status === 429 });
  }
});

// ─── 流式路由（SSE 格式，传递 text/thought/error 结构化 chunk） ───

router.post('/generateContentStream', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // 防止反向代理缓冲 SSE

  try {
    const parsed = parseModelSelection(req.body?.model);
    if (parsed.provider !== 'gemini') {
      const stream = generateContentStreamWithApiKeyProvider({
        ...req.body,
        model: parsed.canonicalId,
      });
      for await (const chunk of stream) {
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }
    } else if (apiKeyClient) {
      // API Key 路径：使用官方 SDK 的流式接口
      const result = await apiKeyClient.models.generateContentStream(withApiModelId(req.body));
      for await (const chunk of result) {
        const parts = chunk.candidates?.[0]?.content?.parts ?? [];
        for (const part of parts) {
          if ((part as any).thought && part.text) {
            res.write(`data: ${JSON.stringify({ thought: part.text })}\n\n`);
          } else if (part.text) {
            res.write(`data: ${JSON.stringify({ text: part.text })}\n\n`);
          }
        }
      }
    } else {
      // Code Assist OAuth 路径：使用自研流式接口
      const credentials = await loadCredentials();
      const clientConfig = resolveOAuthClientConfig();
      if (!credentials || !isCredentialsCompatible(credentials, clientConfig.clientId)) {
        throw new Error('凭证无效');
      }

      const stream = generateContentStreamWithCodeAssist(withApiModelId(req.body), clientConfig);
      for await (const chunk of stream) {
        // chunk 已经是 { text?, thought? } 结构
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }
    }
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error: any) {
    console.error('[AI] Stream Error:', error);
    // 在 SSE 流中传递错误事件
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    res.end();
  }
});

// ─── Embedding 路由 ───

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
