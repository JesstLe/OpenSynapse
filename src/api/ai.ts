import express from 'express';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import { generateContentWithCodeAssist, generateContentStreamWithCodeAssist } from '../lib/codeAssist.js';
import {
  generateContentStreamWithApiKeyProvider,
  generateContentWithApiKeyProvider,
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

const PROVIDER_SECRET_FIELD: Record<SupportedProvider, string> = {
  gemini: 'geminiApiKey',
  openai: 'openaiApiKey',
  minimax: 'minimaxApiKey',
  zhipu: 'zhipuApiKey',
  moonshot: 'moonshotApiKey',
};

const providerEnvLocks = new Map<string, Promise<void>>();
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

async function getUidFromToken(authHeader: string): Promise<string | null> {
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const idToken = authHeader.slice(7).trim();
  if (!idToken) {
    return null;
  }

  try {
    const { verifyIdToken } = await import('../lib/firebaseAdmin');
    const decoded = await verifyIdToken(idToken);
    return decoded?.uid || null;
  } catch (error) {
    console.warn('[AI] Invalid Firebase ID token:', error);
    return null;
  }
}

async function getUserApiKey(uid: string, provider: string): Promise<string | null> {
  if (!uid || !isSupportedProvider(provider)) {
    return null;
  }

  try {
    const { getFirestore } = await import('../lib/firebaseAdmin');
    const doc = await getFirestore().collection('account_secrets').doc(uid).get();
    if (!doc.exists) {
      return null;
    }

    const data = doc.data() as Record<string, unknown> | undefined;
    const field = PROVIDER_SECRET_FIELD[provider];
    const value = data?.[field];
    return typeof value === 'string' ? normalizeApiKey(value) : null;
  } catch (error) {
    console.error('[AI] Failed to load user API key:', error);
    return null;
  }
}

async function resolveApiKeyFromRequest(authHeader: string | undefined, provider: SupportedProvider): Promise<string | null> {
  const uid = authHeader ? await getUidFromToken(authHeader) : null;
  const userApiKey = uid ? await getUserApiKey(uid, provider) : null;
  if (userApiKey) {
    return userApiKey;
  }
  return normalizeApiKey(process.env[PROVIDER_ENV_KEY[provider]]);
}

async function withProviderApiKey<T>(
  provider: SupportedProvider,
  resolvedApiKey: string | null,
  operation: () => Promise<T>
): Promise<T> {
  if (provider === 'gemini') {
    return operation();
  }

  const envVar = PROVIDER_ENV_KEY[provider];
  const previousLock = providerEnvLocks.get(envVar) ?? Promise.resolve();

  let releaseLock = () => {};
  const currentLock = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });
  providerEnvLocks.set(envVar, previousLock.then(() => currentLock));

  await previousLock;

  const original = process.env[envVar];
  try {
    if (resolvedApiKey) {
      process.env[envVar] = resolvedApiKey;
    } else if (typeof original === 'undefined') {
      delete process.env[envVar];
    }
    return await operation();
  } finally {
    if (typeof original === 'undefined') {
      delete process.env[envVar];
    } else {
      process.env[envVar] = original;
    }
    releaseLock();
    if (providerEnvLocks.get(envVar) === currentLock) {
      providerEnvLocks.delete(envVar);
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

async function generateContent(params: any, authHeader?: string): Promise<{ text: string }> {
  const parsed = parseModelSelection(params?.model);

  if (parsed.provider !== 'gemini') {
    if (!isSupportedProvider(parsed.provider)) {
      throw new Error(`不支持的 provider: ${parsed.provider}`);
    }

    const resolvedApiKey = await resolveApiKeyFromRequest(authHeader, parsed.provider);
    const response = await withProviderApiKey(parsed.provider, resolvedApiKey, async () => {
      return generateContentWithApiKeyProvider({
        ...params,
        model: parsed.canonicalId,
      });
    });
    return { text: response.text };
  }

  const geminiParams = withApiModelId(params);
  const resolvedGeminiApiKey = await resolveApiKeyFromRequest(authHeader, 'gemini');

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

router.post('/generateContent', async (req, res) => {
  try {
    const response = await generateContent(req.body, getAuthorizationHeader(req));
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

router.post('/generateContentStream', async (req, res) => {
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

      const resolvedApiKey = await resolveApiKeyFromRequest(authHeader, parsed.provider);
      await withProviderApiKey(parsed.provider, resolvedApiKey, async () => {
        const stream = generateContentStreamWithApiKeyProvider({
          ...req.body,
          model: parsed.canonicalId,
        });
        for await (const chunk of stream) {
          res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        }
      });
    } else {
      const resolvedGeminiApiKey = await resolveApiKeyFromRequest(authHeader, 'gemini');

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
});

router.post('/embedContent', async (req, res) => {
  const parsed = parseModelSelection(
    typeof req.body?.model === 'string' && req.body.model.trim()
      ? req.body.model
      : DEFAULT_EMBEDDING_MODEL
  );

  if (parsed.provider !== 'gemini') {
    res.json({
      embeddings: [{ values: [] }],
      degraded: true,
      reason: `当前仅支持 Gemini embedding，已跳过 ${parsed.canonicalId}。`,
    });
    return;
  }

  const resolvedGeminiApiKey = await resolveApiKeyFromRequest(getAuthorizationHeader(req), 'gemini');

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
});

export default router;
