import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs/promises";
import dotenv from "dotenv";
import { Note, Flashcard } from "./src/types";
import aiRouter from './src/api/ai';
import {
  clearOpenAICodexCredentials,
  createOpenAICodexAuthorizationFlow,
  exchangeOpenAICodexAuthorizationCode,
  loadOpenAICodexSession,
  startOpenAICodexCallbackServer,
} from './src/lib/openaiCodexOAuth';

async function startServer() {
  const app = express();
  const PORT = 3000;
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

  app.use(express.json({ limit: '50mb' }));

  // Helper to read/write data
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

  app.post('/api/local-config/openai-oauth/login', async (_req, res) => {
    if (process.env.NODE_ENV === 'production') {
      return res.status(404).json({ error: 'Settings API unavailable in production.' });
    }

    if (openAIOAuthFlow.status === 'pending' && openAIOAuthFlow.authUrl) {
      return res.json(openAIOAuthFlow);
    }

    const flow = await createOpenAICodexAuthorizationFlow();
    const callbackServer = await startOpenAICodexCallbackServer(flow.state);
    if (!callbackServer.ready) {
      return res.status(500).json({
        error: '无法监听 http://localhost:1455/auth/callback，请确认该端口未被占用后重试。',
      });
    }

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
        callbackServer.close();
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

  // API Routes
  app.use('/api/ai', aiRouter);

  app.get("/api/data", async (req, res) => {
    const data = await getData();
    res.json(data);
  });

  app.post("/api/notes", async (req, res) => {
    const { note, flashcards } = req.body;
    const data = await getData();
    
    data.notes.unshift(note);
    data.flashcards.push(...flashcards);
    
    await saveData(data);
    res.json({ success: true });
  });

  app.delete("/api/notes/:id", async (req, res) => {
    const { id } = req.params;
    const data = await getData();
    
    data.notes = data.notes.filter((n: Note) => n.id !== id);
    data.flashcards = data.flashcards.filter((f: Flashcard) => f.noteId !== id);
    
    await saveData(data);
    res.json({ success: true });
  });

  // CLI Sync Endpoint
  app.post("/api/sync", async (req, res) => {
    const { note, flashcards } = req.body;
    if (!note || !flashcards) return res.status(400).json({ error: "Invalid data" });
    
    const data = await getData();
    data.notes.unshift(note);
    data.flashcards.push(...flashcards);
    
    await saveData(data);
    console.log(`[CLI] Synced new note: ${note.title}`);
    res.json({ success: true });
  });

  // Vite middleware for development
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
