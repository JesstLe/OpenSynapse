import express from 'express';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import { generateContentWithCodeAssist, generateContentStreamWithCodeAssist } from '../lib/codeAssist.js';
import {
  generateContentStreamWithApiKeyProvider,
  generateContentWithApiKeyProvider,
  embedContentWithApiKeyProvider,
} from '../lib/providerGateway.js';
import {
  DEFAULT_EMBEDDING_MODEL,
  getApiModelId,
  parseModelSelection,
} from '../lib/aiModels.js';
import {
  isCredentialsCompatible,
  loadCredentials,
  resolveOAuthClientConfig,
} from '../lib/oauth.js';
import { getApiKeyConfigForServer, getApiKeyForServer } from '../services/userApiKeyService.server.js';
import { auth } from '../auth/server.js';
import { requireAuth } from './auth-middleware.js';

dotenv.config({ path: '.env.local' });

const router = express.Router();

type SupportedProvider = 'gemini' | 'openai' | 'minimax' | 'zhipu' | 'moonshot';

const PROVIDER_ENV_KEY: Record<SupportedProvider, string> = {
  gemini: 'GEMINI_API_KEY',
  openai: 'OPENAI_API_KEY',
  minimax: 'MINIMAX_API_KEY',
  zhipu: 'ZHIPU_API_KEY',
  moonshot: 'MOONSHOT_API_KEY',
};

const PROVIDER_BASE_URL_ENV_KEY: Partial<Record<SupportedProvider, string>> = {
  openai: 'OPENAI_BASE_URL',
  minimax: 'MINIMAX_BASE_URL',
  zhipu: 'ZHIPU_BASE_URL',
  moonshot: 'MOONSHOT_BASE_URL',
};

const providerOperationLocks = new Map<SupportedProvider, Promise<void>>();
const bootGeminiApiKey = normalizeApiKey(process.env.GEMINI_API_KEY);

let apiKeyClient: GoogleGenAI | null = null;
if (bootGeminiApiKey) {
  console.log('[Server] Initializing Gemini AI with API Key.');
  apiKeyClient = new GoogleGenAI({ apiKey: bootGeminiApiKey });
} else {
  console.log('[Server] No valid GEMINI_API_KEY found. AI routes will prefer Code Assist OAuth.');
}

function normalizeApiKey(value?: string | null): string | null {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === 'AIzaSy...') {
    return null;
  }
  return trimmed;
}

function isSupportedProvider(provider: string): provider is SupportedProvider {
  return provider === 'gemini'
    || provider === 'openai'
    || provider === 'minimax'
    || provider === 'zhipu'
    || provider === 'moonshot';
}

function withApiModelId(params: any) {
  return {
    ...params,
    model: getApiModelId(params?.model),
  };
}

async function getUidFromToken(req: express.Request): Promise<string | null> {
  try {
    const headers = new Headers(Object.entries(req.headers).map(([k, v]) => [k, String(v)]));
    const session = await auth.api.getSession({ headers });
    return session?.user?.id || null;
  } catch {
    return null;
  }
}

type ResolvedProviderCredentials = {
  apiKey: string | null;
  baseUrl: string | null;
};

function getRequestSuppliedCredentials(
  req: express.Request,
  provider: SupportedProvider
): ResolvedProviderCredentials | null {
  const requestProvider = typeof req.headers['x-opensynapse-provider'] === 'string'
    ? req.headers['x-opensynapse-provider']
    : null;
  if (requestProvider !== provider) {
    return null;
  }

  const apiKeyHeader = req.headers['x-opensynapse-provider-api-key'];
  const baseUrlHeader = req.headers['x-opensynapse-provider-base-url'];
  const apiKey = typeof apiKeyHeader === 'string' ? normalizeApiKey(apiKeyHeader) : null;
  const baseUrl = typeof baseUrlHeader === 'string' ? normalizeBaseUrl(baseUrlHeader) : null;

  if (!apiKey) {
    return null;
  }

  return { apiKey, baseUrl };
}

function normalizeBaseUrl(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed || null;
}

async function getUserProviderCredentials(
  uid: string,
  provider: SupportedProvider
): Promise<ResolvedProviderCredentials | null> {
  if (!uid || !isSupportedProvider(provider)) {
    return null;
  }

  try {
    const config = await getApiKeyConfigForServer(uid, provider);
    if (!config?.apiKey) {
      return null;
    }
    return {
      apiKey: normalizeApiKey(config.apiKey),
      baseUrl: normalizeBaseUrl(config.baseUrl),
    };
  } catch (error) {
    console.error('[AI] Failed to load user provider credentials:', error);
    return null;
  }
}

async function resolveProviderCredentialsFromRequest(
  req: express.Request,
  authHeader: string | undefined,
  provider: SupportedProvider
): Promise<ResolvedProviderCredentials> {
  const uid = await getUidFromToken(req);
  const userCredentials = uid ? await getUserProviderCredentials(uid, provider) : null;
  const requestCredentials = getRequestSuppliedCredentials(req, provider);

  return {
    apiKey: userCredentials?.apiKey
      ?? requestCredentials?.apiKey
      ?? normalizeApiKey(process.env[PROVIDER_ENV_KEY[provider]]),
    baseUrl: userCredentials?.baseUrl
      ?? requestCredentials?.baseUrl
      ?? normalizeBaseUrl(
        PROVIDER_BASE_URL_ENV_KEY[provider]
          ? process.env[PROVIDER_BASE_URL_ENV_KEY[provider]]
          : null
      ),
  };
}

async function withProviderCredentials<T>(
  provider: SupportedProvider,
  resolvedCredentials: ResolvedProviderCredentials,
  operation: () => Promise<T>
): Promise<T> {
  if (provider === 'gemini') {
    return operation();
  }

  const previousLock = providerOperationLocks.get(provider) ?? Promise.resolve();

  let releaseLock = () => {};
  const currentLock = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });
  providerOperationLocks.set(provider, previousLock.then(() => currentLock));

  await previousLock;

  const envVar = PROVIDER_ENV_KEY[provider];
  const baseUrlEnvVar = PROVIDER_BASE_URL_ENV_KEY[provider];
  const original = process.env[envVar];
  const originalBaseUrl = baseUrlEnvVar ? process.env[baseUrlEnvVar] : undefined;
  try {
    if (resolvedCredentials.apiKey) {
      process.env[envVar] = resolvedCredentials.apiKey;
    } else if (typeof original === 'undefined') {
      delete process.env[envVar];
    }

    if (baseUrlEnvVar) {
      if (resolvedCredentials.baseUrl) {
        process.env[baseUrlEnvVar] = resolvedCredentials.baseUrl;
      } else if (typeof originalBaseUrl === 'undefined') {
        delete process.env[baseUrlEnvVar];
      }
    }

    return await operation();
  } finally {
    if (typeof original === 'undefined') {
      delete process.env[envVar];
    } else {
      process.env[envVar] = original;
    }

    if (baseUrlEnvVar) {
      if (typeof originalBaseUrl === 'undefined') {
        delete process.env[baseUrlEnvVar];
      } else {
        process.env[baseUrlEnvVar] = originalBaseUrl;
      }
    }

    releaseLock();
    if (providerOperationLocks.get(provider) === currentLock) {
      providerOperationLocks.delete(provider);
    }
  }
}

function getAuthorizationHeader(req: express.Request): string | undefined {
  return typeof req.headers.authorization === 'string'
    ? req.headers.authorization
    : undefined;
}

function getGeminiClient(resolvedGeminiApiKey: string): GoogleGenAI {
  if (apiKeyClient && bootGeminiApiKey === resolvedGeminiApiKey) {
    return apiKeyClient;
  }
  return new GoogleGenAI({ apiKey: resolvedGeminiApiKey });
}

async function generateContent(
  params: any,
  authHeader?: string,
  req?: express.Request
): Promise<{ text: string }> {
  if (!req) {
    throw new Error('缺少请求上下文，无法解析供应商凭证。');
  }

  const parsed = parseModelSelection(params?.model);

  if (parsed.provider !== 'gemini') {
    if (!isSupportedProvider(parsed.provider)) {
      throw new Error(`不支持的 provider: ${parsed.provider}`);
    }

    const resolvedCredentials = await resolveProviderCredentialsFromRequest(req, authHeader, parsed.provider);
    const response = await withProviderCredentials(parsed.provider, resolvedCredentials, async () => {
      return generateContentWithApiKeyProvider({
        ...params,
        model: parsed.canonicalId,
      });
    });
    return { text: response.text };
  }

  const geminiParams = withApiModelId(params);
  const resolvedGeminiApiKey = (await resolveProviderCredentialsFromRequest(req, authHeader, 'gemini')).apiKey;

  if (resolvedGeminiApiKey) {
    const response = await getGeminiClient(resolvedGeminiApiKey).models.generateContent(geminiParams);
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

router.post('/generateContent', requireAuth(async (req, res, userId) => {
  try {
    const response = await generateContent(req.body, getAuthorizationHeader(req), req);
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
}));

router.post('/generateContentStream', requireAuth(async (req, res, userId) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  try {
    const authHeader = getAuthorizationHeader(req);
    const parsed = parseModelSelection(req.body?.model);

    if (parsed.provider !== 'gemini') {
      if (!isSupportedProvider(parsed.provider)) {
        throw new Error(`不支持的 provider: ${parsed.provider}`);
      }

      const resolvedCredentials = await resolveProviderCredentialsFromRequest(req, authHeader, parsed.provider);
      await withProviderCredentials(parsed.provider, resolvedCredentials, async () => {
        const stream = generateContentStreamWithApiKeyProvider({
          ...req.body,
          model: parsed.canonicalId,
        });
        for await (const chunk of stream) {
          res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        }
      });
    } else {
      const resolvedGeminiApiKey = (await resolveProviderCredentialsFromRequest(req, authHeader, 'gemini')).apiKey;

      if (resolvedGeminiApiKey) {
        const result = await getGeminiClient(resolvedGeminiApiKey).models.generateContentStream(withApiModelId(req.body));
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
        const credentials = await loadCredentials();
        const clientConfig = resolveOAuthClientConfig();
        if (!credentials || !isCredentialsCompatible(credentials, clientConfig.clientId)) {
          throw new Error('凭证无效');
        }

        const stream = generateContentStreamWithCodeAssist(withApiModelId(req.body), clientConfig);
        for await (const chunk of stream) {
          res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        }
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error: any) {
    console.error('[AI] Stream Error:', error);
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    res.end();
  }
}));

router.post('/embedContent', requireAuth(async (req, res, userId) => {
  const parsed = parseModelSelection(
    typeof req.body?.model === 'string' && req.body.model.trim()
      ? req.body.model
      : DEFAULT_EMBEDDING_MODEL
  );

  if (parsed.provider !== 'gemini') {
    try {
      const resolvedCredentials = await resolveProviderCredentialsFromRequest(
        req, getAuthorizationHeader(req), parsed.provider
      );

      if (!resolvedCredentials.apiKey) {
        res.json({
          embeddings: [{ values: [] }],
          degraded: true,
          reason: `当前未配置 ${parsed.provider} 的 API Key，embedding 已优雅降级。`,
        });
        return;
      }

      const contents: string[] = Array.isArray(req.body?.contents)
        ? req.body.contents.map((c: any) => typeof c === 'string' ? c : String(c?.text ?? c ?? ''))
        : [String(req.body?.contents ?? '')];

      const result = await withProviderCredentials(parsed.provider, resolvedCredentials, () =>
        embedContentWithApiKeyProvider({
          model: parsed.canonicalId,
          contents,
        })
      );

      res.json(result);
    } catch (error: any) {
      console.error('[AI] Embed Content Error (non-Gemini):', error);
      res.json({
        embeddings: [{ values: [] }],
        degraded: true,
        reason: `Embedding 失败 (${parsed.provider}): ${error.message}`,
      });
    }
    return;
  }

  // Gemini embedding path
  const resolvedGeminiApiKey = (await resolveProviderCredentialsFromRequest(req, getAuthorizationHeader(req), 'gemini')).apiKey;

  if (!resolvedGeminiApiKey) {
    res.json({
      embeddings: [{ values: [] }],
      degraded: true,
      reason: '当前服务端未配置可用的 Gemini API Key，embedding 已优雅降级。',
    });
    return;
  }

  try {
    const response = await getGeminiClient(resolvedGeminiApiKey).models.embedContent({
      ...req.body,
      model: parsed.model,
    });
    res.json(response);
  } catch (error: any) {
    console.error('[AI] Embed Content Error:', error);
    res.status(500).json({ error: error.message || 'Error generating embedding' });
  }
}));

// ─── 智谱 OCR 服务代理 ───
router.post('/ocr/zhipu', requireAuth(async (req, res, userId) => {
  try {
    const { imageBase64, tool_type = 'hand_write', language_type = 'CHN_ENG' } = req.body;
    
    if (!imageBase64) {
      return res.status(400).json({ error: 'Missing imageBase64' });
    }

    const apiKey = await getApiKeyForServer(userId, 'zhipu') || process.env.ZHIPU_API_KEY;
    
    if (!apiKey) {
      return res.status(400).json({ error: 'ZHIPU_API_KEY not configured' });
    }

    // 将 base64 转换为 buffer
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    const imageBuffer = Buffer.from(base64Data, 'base64');
    
    // 创建 FormData
    const FormData = require('form-data');
    const formData = new FormData();
    formData.append('file', imageBuffer, { filename: 'image.png', contentType: 'image/png' });
    formData.append('tool_type', tool_type);
    formData.append('language_type', language_type);
    formData.append('probability', 'false');

    // 调用智谱 OCR API
    const response = await fetch('https://open.bigmodel.cn/api/paas/v4/files/ocr', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        ...formData.getHeaders(),
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OCR API error: ${response.status} ${errorText}`);
    }

    const result = await response.json();
    res.json(result);
  } catch (error: any) {
    console.error('[AI] Zhipu OCR Error:', error);
    res.status(500).json({ error: error.message || 'OCR processing failed' });
  }
}));

// ─── MiniMax 图片理解服务代理 ───
router.post('/vision/minimax', requireAuth(async (req, res, userId) => {
  try {
    const { imageBase64, prompt = '请详细描述这张图片的内容' } = req.body;
    
    if (!imageBase64) {
      return res.status(400).json({ error: 'Missing imageBase64' });
    }

    const apiKey = await getApiKeyForServer(userId, 'minimax') || process.env.MINIMAX_API_KEY;
    
    if (!apiKey) {
      return res.status(400).json({ error: 'MINIMAX_API_KEY not configured' });
    }

    // MiniMax Token Plan 的 understand_image 工具调用
    // 参考 MCP 工具格式: https://platform.minimaxi.com/docs/guides/token-plan-mcp-guide
    const response = await fetch('https://api.minimaxi.com/v1/vision/understand', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt,
        image_url: imageBase64, // 支持 base64 data URL
        model: 'MiniMax-M2.7',
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      // 如果 API 不存在或返回错误，提供友好提示
      if (response.status === 404) {
        return res.status(400).json({ 
          error: 'MiniMax Token Plan required',
          message: '图片理解功能需要 MiniMax Token Plan 订阅。请访问 https://platform.minimaxi.com/subscribe/token-plan 订阅',
          fallback: 'ocr' // 建议回退到 OCR
        });
      }
      throw new Error(`Vision API error: ${response.status} ${JSON.stringify(errorData)}`);
    }

    const result = await response.json();
    res.json({
      description: result.text || result.description || result.content,
      raw: result,
    });
  } catch (error: any) {
    console.error('[AI] MiniMax Vision Error:', error);
    res.status(500).json({ 
      error: error.message || 'Vision processing failed',
      fallback: 'ocr'
    });
  }
}));

export default router;
