import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs/promises";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./src/auth/server";
import aiRouter from './src/api/ai';
import dataRouter from './src/api/data';
import cliRouter from './src/api/cli';
import paymentRouter from './src/api/payment';
import { setupMCPServer } from './src/mcp/server';
import {
  clearOpenAICodexCredentials,
  createOpenAICodexAuthorizationFlow,
  exchangeOpenAICodexAuthorizationCode,
  loadOpenAICodexSession,
  startOpenAICodexCallbackServer,
} from './src/lib/openaiCodexOAuth';
import {
  loadCredentials as loadGeminiCredentials,
  generatePKCE,
  buildAuthUrl,
  startOAuthServer,
  exchangeCode,
  saveCredentials,
  deleteCredentials,
  resolveOAuthClientConfig,
} from './src/lib/oauth';

function validateEnv() {
  const required = ['DATABASE_URL', 'BETTER_AUTH_SECRET'];
  const missing = required.filter(key => !process.env[key]);
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:');
    missing.forEach(key => console.error(`   - ${key}`));
    console.error('\nPlease set these in your .env.local file');
    console.error('Note: BETTER_AUTH_SECRET is used by better-auth for session signing');
    process.exit(1);
  }

  const socialProviders = [
    { name: 'Google', id: 'GOOGLE_CLIENT_ID', secret: 'GOOGLE_CLIENT_SECRET' },
    { name: 'GitHub', id: 'GITHUB_CLIENT_ID', secret: 'GITHUB_CLIENT_SECRET' },
    { name: 'Discord', id: 'DISCORD_CLIENT_ID', secret: 'DISCORD_CLIENT_SECRET' },
  ];

  const configured = socialProviders.filter(p => process.env[p.id] && process.env[p.secret]);
  const missingId = socialProviders.filter(p => !process.env[p.id] && process.env[p.secret]);
  const missingSecret = socialProviders.filter(p => process.env[p.id] && !process.env[p.secret]);

  if (missingId.length > 0) {
    console.warn('⚠️  Social providers with SECRET but no CLIENT_ID:');
    missingId.forEach(p => console.warn(`   - ${p.name}: missing ${p.id}`));
  }

  if (missingSecret.length > 0) {
    console.warn('⚠️  Social providers with CLIENT_ID but no SECRET:');
    missingSecret.forEach(p => console.warn(`   - ${p.name}: missing ${p.secret}`));
  }

  if (configured.length === 0) {
    console.warn('⚠️  No social login providers configured.');
    console.warn('   Set both CLIENT_ID and CLIENT_SECRET for at least one provider:');
    console.warn('   - GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET');
    console.warn('   - GITHUB_CLIENT_ID + GITHUB_CLIENT_SECRET');
    console.warn('   - DISCORD_CLIENT_ID + DISCORD_CLIENT_SECRET');
  } else {
    console.log('✅ Configured login providers:', configured.map(p => p.name).join(', '));
  }
}

function getBaseUrl() {
  const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
  const host = process.env.VERCEL_URL || `localhost:${process.env.PORT || 3000}`;
  return `${protocol}://${host}`;
}

async function startServer() {
  validateEnv();
  
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  const DATA_FILE = path.join(process.cwd(), "data.json");
  const ENV_FILE = path.join(process.cwd(), ".env.local");
  const LOCAL_PROVIDER_ENV_VARS = [
    'GEMINI_API_KEY',
    'OPENAI_API_KEY',
    'OPENAI_BASE_URL',
    'MINIMAX_API_KEY',
    'MINIMAX_BASE_URL',
    'ZHIPU_API_KEY',
    'ZHIPU_BASE_URL',
    'MOONSHOT_API_KEY',
    'MOONSHOT_BASE_URL',
    'GOOGLE_CLOUD_PROJECT',
    'GOOGLE_CLOUD_PROJECT_ID',
  ] as const;
  let openAIOAuthFlow: {
    status: 'idle' | 'pending' | 'success' | 'error';
    authUrl?: string;
    error?: string;
    startedAt?: number;
    completedAt?: number;
  } = { status: 'idle' };
  let openAIOAuthCallbackServer: Awaited<ReturnType<typeof startOpenAICodexCallbackServer>> | null = null;

  const closeOpenAIOAuthCallbackServer = () => {
    if (!openAIOAuthCallbackServer) {
      return;
    }
    try {
      openAIOAuthCallbackServer.close();
    } catch {
    } finally {
      openAIOAuthCallbackServer = null;
    }
  };

  // Gemini OAuth flow management
  let geminiOAuthFlow: {
    status: 'idle' | 'pending' | 'success' | 'error';
    authUrl?: string;
    error?: string;
    startedAt?: number;
    completedAt?: number;
  } = { status: 'idle' };
  let geminiOAuthCallbackServer: Awaited<ReturnType<typeof startOAuthServer>> | null = null;

  const closeGeminiOAuthCallbackServer = () => {
    if (!geminiOAuthCallbackServer) {
      return;
    }
    try {
      geminiOAuthCallbackServer.close();
    } catch {
    } finally {
      geminiOAuthCallbackServer = null;
    }
  };

  app.use(express.json({ limit: '50mb' }));

  // Service discovery for OpenClaw
  app.get('/.well-known/openclaw', (req, res) => {
    res.json({
      mcp_endpoint: `${getBaseUrl()}/mcp`,
      name: 'opensynapse',
      version: '1.0.0',
      description: 'AI驱动的知识复利系统 - 智能笔记与闪卡复习',
      features: ['save', 'import', 'review', 'search'],
      auth_types: ['oauth', 'api_key'],
      website: getBaseUrl()
    });
  });

  const getData = async () => {
    try {
      const content = await fs.readFile(DATA_FILE, "utf-8");
      return JSON.parse(content);
    } catch {
      return { notes: [], flashcards: [] };
    }
  };

  const saveData = async (data: any) => {
    await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
  };

  const readEnvConfig = async () => {
    try {
      const raw = await fs.readFile(ENV_FILE, "utf-8");
      return dotenv.parse(raw);
    } catch {
      return {};
    }
  };

  const writeEnvConfig = async (nextConfig: Record<string, string>) => {
    const lines = Object.entries(nextConfig)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${JSON.stringify(value)}`);
    await fs.writeFile(ENV_FILE, `${lines.join("\n")}\n`);
  };

  app.get("/api/local-config/providers", async (_req, res) => {
    if (process.env.NODE_ENV === "production") {
      return res.status(404).json({ error: "Settings API unavailable in production." });
    }

    const config = await readEnvConfig();
    const providers = LOCAL_PROVIDER_ENV_VARS.map((key) => ({
      key,
      configured: Boolean((process.env[key] || config[key] || "").trim()),
      valuePreview: (process.env[key] || config[key] || "").trim()
        ? `${(process.env[key] || config[key]).trim().slice(0, 4)}***`
        : "",
    }));

    res.json({ providers });
  });

  app.post("/api/local-config/providers", async (req, res) => {
    if (process.env.NODE_ENV === "production") {
      return res.status(404).json({ error: "Settings API unavailable in production." });
    }

    const updates = req.body?.updates;
    if (!updates || typeof updates !== "object" || Array.isArray(updates)) {
      return res.status(400).json({ error: "Invalid updates payload." });
    }

    const current = await readEnvConfig();
    for (const [key, value] of Object.entries(updates)) {
      if (!LOCAL_PROVIDER_ENV_VARS.includes(key as (typeof LOCAL_PROVIDER_ENV_VARS)[number])) {
        return res.status(400).json({ error: `Unsupported config key: ${key}` });
      }

      if (typeof value === "string" && value.trim()) {
        current[key] = value.trim();
        process.env[key] = value.trim();
      } else {
        delete current[key];
        delete process.env[key];
      }
    }

    await writeEnvConfig(current);
    res.json({ success: true });
  });

  app.get('/api/local-config/openai-oauth/status', async (_req, res) => {
    if (process.env.NODE_ENV === 'production') {
      return res.status(404).json({ error: 'Settings API unavailable in production.' });
    }

    const session = await loadOpenAICodexSession();
    res.json({
      configured: Boolean(session),
      source: session?.source ?? null,
      email: session?.email ?? null,
      accountId: session?.accountId ?? null,
      expiresAt: session?.expiresAt ?? null,
      planType: session?.planType ?? null,
      loginStatus: openAIOAuthFlow.status,
      authUrl: openAIOAuthFlow.status === 'pending' ? openAIOAuthFlow.authUrl ?? null : null,
      error: openAIOAuthFlow.status === 'error' ? openAIOAuthFlow.error ?? null : null,
      completedAt: openAIOAuthFlow.completedAt ?? null,
    });
  });

  app.get('/api/local-config/gemini-oauth/status', async (_req, res) => {
    if (process.env.NODE_ENV === 'production') {
      return res.status(404).json({ error: 'Settings API unavailable in production.' });
    }

    const credentials = await loadGeminiCredentials();
    res.json({
      configured: Boolean(credentials),
      email: credentials?.email ?? null,
      expiresAt: credentials?.expires_at ?? null,
    });
  });

  app.post('/api/local-config/openai-oauth/login', async (_req, res) => {
    if (process.env.NODE_ENV === 'production') {
      return res.status(404).json({ error: 'Settings API unavailable in production.' });
    }

    if (openAIOAuthFlow.status === 'pending' && openAIOAuthFlow.authUrl && openAIOAuthCallbackServer) {
      return res.json(openAIOAuthFlow);
    }

    closeOpenAIOAuthCallbackServer();
    openAIOAuthFlow = { status: 'idle' };

    const flow = await createOpenAICodexAuthorizationFlow();
    const callbackServer = await startOpenAICodexCallbackServer(flow.state);
    if (!callbackServer.ready) {
      return res.status(500).json({
        error: '无法监听 http://localhost:1455/auth/callback，请确认该端口未被占用后重试。',
      });
    }
    openAIOAuthCallbackServer = callbackServer;

    openAIOAuthFlow = {
      status: 'pending',
      authUrl: flow.url,
      startedAt: Date.now(),
    };

    void (async () => {
      try {
        const result = await callbackServer.waitForCode();
        if (!result?.code) {
          throw new Error('OpenAI OAuth 登录超时，请重新点击登录。');
        }

        await exchangeOpenAICodexAuthorizationCode(result.code, flow.verifier);
        openAIOAuthFlow = {
          status: 'success',
          startedAt: openAIOAuthFlow.startedAt,
          completedAt: Date.now(),
        };
      } catch (error) {
        openAIOAuthFlow = {
          status: 'error',
          error: error instanceof Error ? error.message : String(error),
          startedAt: openAIOAuthFlow.startedAt,
          completedAt: Date.now(),
        };
      } finally {
        closeOpenAIOAuthCallbackServer();
      }
    })();

    res.json(openAIOAuthFlow);
  });

  app.post('/api/local-config/openai-oauth/logout', async (_req, res) => {
    if (process.env.NODE_ENV === 'production') {
      return res.status(404).json({ error: 'Settings API unavailable in production.' });
    }

    const hadOwnCredentials = await clearOpenAICodexCredentials();
    const fallbackSession = await loadOpenAICodexSession();
    closeOpenAIOAuthCallbackServer();
    openAIOAuthFlow = { status: 'idle' };

    if (!hadOwnCredentials && fallbackSession?.source === 'codex') {
      return res.json({
        success: true,
        message: '当前正在复用 ~/.codex/auth.json。若要彻底退出，请运行 codex logout。',
      });
    }

    res.json({
      success: true,
      message: hadOwnCredentials ? 'OpenSynapse 专属 OpenAI OAuth 凭证已清除。' : '当前没有 OpenSynapse 专属 OpenAI OAuth 凭证。',
    });
  });

  app.post('/api/local-config/gemini-oauth/login', async (_req, res) => {
    if (process.env.NODE_ENV === 'production') {
      return res.status(404).json({ error: 'Settings API unavailable in production.' });
    }

    if (geminiOAuthFlow.status === 'pending' && geminiOAuthFlow.authUrl && geminiOAuthCallbackServer) {
      return res.json(geminiOAuthFlow);
    }

    closeGeminiOAuthCallbackServer();
    geminiOAuthFlow = { status: 'idle' };

    try {
      const clientConfig = resolveOAuthClientConfig();
      const pkce = generatePKCE();
      const state = Math.random().toString(36).substring(2);
      const authUrl = buildAuthUrl(clientConfig.clientId, pkce, state);

      const callbackServer = await startOAuthServer();
      geminiOAuthCallbackServer = callbackServer;

      geminiOAuthFlow = {
        status: 'pending',
        authUrl,
        startedAt: Date.now(),
      };

      void (async () => {
        try {
          const result = await callbackServer.waitForCode();
          if (!result?.code) {
            throw new Error('Gemini OAuth 登录超时，请重新点击登录。');
          }
          if (result.state !== state) {
            throw new Error('State mismatch - possible CSRF attack');
          }

          const credentials = await exchangeCode(result.code, pkce.verifier, clientConfig.clientId, clientConfig.clientSecret);
          await saveCredentials(credentials);

          geminiOAuthFlow = {
            status: 'success',
            startedAt: geminiOAuthFlow.startedAt,
            completedAt: Date.now(),
          };
        } catch (error) {
          geminiOAuthFlow = {
            status: 'error',
            error: error instanceof Error ? error.message : String(error),
            startedAt: geminiOAuthFlow.startedAt,
            completedAt: Date.now(),
          };
        } finally {
          closeGeminiOAuthCallbackServer();
        }
      })();

      res.json(geminiOAuthFlow);
    } catch (error) {
      closeGeminiOAuthCallbackServer();
      geminiOAuthFlow = {
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
        startedAt: Date.now(),
        completedAt: Date.now(),
      };
      res.status(500).json(geminiOAuthFlow);
    }
  });

  app.post('/api/local-config/gemini-oauth/logout', async (_req, res) => {
    if (process.env.NODE_ENV === 'production') {
      return res.status(404).json({ error: 'Settings API unavailable in production.' });
    }

    closeGeminiOAuthCallbackServer();
    geminiOAuthFlow = { status: 'idle' };

    try {
      await deleteCredentials();
      res.json({ success: true, message: 'Gemini OAuth 凭证已清除。' });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  process.once('SIGINT', () => {
    closeOpenAIOAuthCallbackServer();
    closeGeminiOAuthCallbackServer();
  });
  process.once('SIGTERM', () => {
    closeOpenAIOAuthCallbackServer();
    closeGeminiOAuthCallbackServer();
  });

  app.all("/api/auth/*", toNodeHandler(auth));

  app.use('/api/ai', aiRouter);
  app.use('/api', dataRouter);
  app.use('/api/cli', cliRouter);
  // Payment routes - urlencoded needed for Alipay async notify callback
  app.use('/api/payment', express.urlencoded({ extended: false }), paymentRouter);
  setupMCPServer(app);

  app.get("/api/data", async (req, res) => {
    if (process.env.NODE_ENV === 'production') {
      return res.status(404).json({ error: "Not available in production" });
    }
    const data = await getData();
    res.json(data);
  });

  app.post("/api/sync", async (req, res) => {
    if (process.env.NODE_ENV === 'production') {
      return res.status(404).json({ error: "Not available in production" });
    }
    const { note, flashcards } = req.body;
    if (!note || !flashcards) return res.status(400).json({ error: "Invalid data" });

    const data = await getData();
    data.notes.unshift(note);
    data.flashcards.push(...flashcards);

    await saveData(data);
    console.log(`[CLI] Synced new note: ${note.title}`);
    res.json({ success: true });
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
