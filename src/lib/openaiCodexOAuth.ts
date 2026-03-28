import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

export type OpenAICodexAuthSource = 'opensynapse' | 'codex';

export type OpenAICodexStoredCredentials = {
  auth_mode: 'oauth';
  last_refresh: string;
  tokens: {
    access_token: string;
    refresh_token: string;
    id_token?: string;
    account_id: string;
  };
};

export type OpenAICodexSession = {
  source: OpenAICodexAuthSource;
  accessToken: string;
  refreshToken: string;
  idToken?: string;
  accountId: string;
  email?: string;
  expiresAt: number;
  planType?: string;
};

type OpenAICodexTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  id_token?: string;
  expires_in?: number;
};

type OpenAICodexCallbackServer = {
  ready: boolean;
  close: () => void;
  waitForCode: (timeoutMs?: number) => Promise<{ code: string } | null>;
};

export const OPENAI_CODEX_OAUTH = {
  CLIENT_ID: 'app_EMoamEEZ73f0CkXaXp7hrann',
  AUTHORIZE_URL: 'https://auth.openai.com/oauth/authorize',
  TOKEN_URL: 'https://auth.openai.com/oauth/token',
  REDIRECT_URI: 'http://localhost:1455/auth/callback',
  SCOPE: 'openid profile email offline_access',
  PRIMARY_DIR: path.join(os.homedir(), '.opensynapse'),
  PRIMARY_FILE: path.join(os.homedir(), '.opensynapse', 'openai-auth.json'),
  SHARED_CODEX_FILE: path.join(os.homedir(), '.codex', 'auth.json'),
} as const;

const DEFAULT_SUCCESS_HTML = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>OpenAI 认证成功</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #0d0d0d;
        color: #f5f5f5;
      }
      .card {
        width: min(28rem, calc(100vw - 2rem));
        padding: 2rem;
        border-radius: 1.5rem;
        background: #171717;
        border: 1px solid rgba(255,255,255,0.08);
        text-align: center;
        box-shadow: 0 24px 48px rgba(0,0,0,0.35);
      }
      .badge {
        width: 4rem;
        height: 4rem;
        margin: 0 auto 1rem;
        border-radius: 1.25rem;
        display: grid;
        place-items: center;
        background: linear-gradient(135deg, #10a37f, #1c7f6a);
        font-size: 2rem;
      }
      h1 {
        margin: 0 0 0.75rem;
        font-size: 2rem;
        font-weight: 800;
      }
      p {
        margin: 0;
        line-height: 1.6;
        color: rgba(255,255,255,0.72);
      }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="badge">✓</div>
      <h1>认证成功</h1>
      <p>OpenAI 账号已连接。你可以关闭此窗口并回到 OpenSynapse。</p>
    </div>
  </body>
</html>`;

function base64UrlEncode(value: Buffer | string): string {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value);
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function createCodeVerifier(): string {
  return base64UrlEncode(randomBytes(32));
}

function createCodeChallenge(verifier: string): string {
  return base64UrlEncode(createHash('sha256').update(verifier).digest());
}

function decodeJwtPayload(token?: string): Record<string, any> | null {
  if (!token) return null;

  try {
    const [, payload] = token.split('.');
    if (!payload) return null;
    return JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

function getOpenAIAuthClaims(token?: string): Record<string, any> | null {
  const payload = decodeJwtPayload(token);
  if (!payload) return null;
  return payload['https://api.openai.com/auth'] ?? null;
}

function getOpenAIProfileClaims(token?: string): Record<string, any> | null {
  const payload = decodeJwtPayload(token);
  if (!payload) return null;
  return payload['https://api.openai.com/profile'] ?? payload;
}

function getTokenExpiry(token?: string): number {
  const payload = decodeJwtPayload(token);
  const exp = payload?.exp;
  return typeof exp === 'number' ? exp * 1000 : 0;
}

function isTokenFresh(expiresAt: number): boolean {
  return expiresAt > Date.now() + 60_000;
}

function extractAccountId(raw: any): string | null {
  const tokens = raw?.tokens;
  const explicit = tokens?.account_id;
  if (typeof explicit === 'string' && explicit.trim()) {
    return explicit.trim();
  }

  const accessClaims = getOpenAIAuthClaims(tokens?.access_token);
  const idClaims = getOpenAIAuthClaims(tokens?.id_token);
  const claimValue = accessClaims?.chatgpt_account_id ?? idClaims?.chatgpt_account_id;
  return typeof claimValue === 'string' && claimValue.trim() ? claimValue.trim() : null;
}

function normalizeStoredCredentials(raw: any): OpenAICodexStoredCredentials | null {
  const accessToken = raw?.tokens?.access_token;
  const refreshToken = raw?.tokens?.refresh_token;
  const accountId = extractAccountId(raw);

  if (
    typeof accessToken !== 'string' ||
    !accessToken.trim() ||
    typeof refreshToken !== 'string' ||
    !refreshToken.trim() ||
    !accountId
  ) {
    return null;
  }

  return {
    auth_mode: 'oauth',
    last_refresh: typeof raw?.last_refresh === 'string' ? raw.last_refresh : new Date().toISOString(),
    tokens: {
      access_token: accessToken.trim(),
      refresh_token: refreshToken.trim(),
      id_token: typeof raw?.tokens?.id_token === 'string' ? raw.tokens.id_token.trim() : undefined,
      account_id: accountId,
    },
  };
}

async function readStoredCredentials(filePath: string): Promise<OpenAICodexStoredCredentials | null> {
  try {
    const raw = JSON.parse(await fs.readFile(filePath, 'utf8'));
    return normalizeStoredCredentials(raw);
  } catch {
    return null;
  }
}

function toSession(
  credentials: OpenAICodexStoredCredentials,
  source: OpenAICodexAuthSource
): OpenAICodexSession {
  const accessClaims = getOpenAIAuthClaims(credentials.tokens.access_token);
  const profileClaims = getOpenAIProfileClaims(credentials.tokens.access_token)
    ?? getOpenAIProfileClaims(credentials.tokens.id_token);

  return {
    source,
    accessToken: credentials.tokens.access_token,
    refreshToken: credentials.tokens.refresh_token,
    idToken: credentials.tokens.id_token,
    accountId: credentials.tokens.account_id,
    email: typeof profileClaims?.email === 'string' ? profileClaims.email : undefined,
    expiresAt: getTokenExpiry(credentials.tokens.access_token),
    planType: typeof accessClaims?.chatgpt_plan_type === 'string' ? accessClaims.chatgpt_plan_type : undefined,
  };
}

async function exchangeToken(body: URLSearchParams): Promise<OpenAICodexTokenResponse> {
  const response = await fetch(OPENAI_CODEX_OAUTH.TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`OpenAI OAuth token exchange failed: ${response.status} ${response.statusText} - ${errorText}`);
  }

  return await response.json();
}

function toStoredCredentialsFromTokenResponse(
  tokenResponse: OpenAICodexTokenResponse,
  fallbackRefreshToken?: string
): OpenAICodexStoredCredentials {
  const accessToken = tokenResponse.access_token?.trim();
  const refreshToken = tokenResponse.refresh_token?.trim() || fallbackRefreshToken?.trim();
  const idToken = tokenResponse.id_token?.trim();

  if (!accessToken || !refreshToken) {
    throw new Error('OpenAI OAuth token response missing access_token or refresh_token.');
  }

  const accountId = extractAccountId({
    tokens: {
      access_token: accessToken,
      refresh_token: refreshToken,
      id_token: idToken,
    },
  });

  if (!accountId) {
    throw new Error('OpenAI OAuth token response missing chatgpt account id.');
  }

  return {
    auth_mode: 'oauth',
    last_refresh: new Date().toISOString(),
    tokens: {
      access_token: accessToken,
      refresh_token: refreshToken,
      id_token: idToken,
      account_id: accountId,
    },
  };
}

export async function loadOpenAICodexSession(): Promise<OpenAICodexSession | null> {
  const primary = await readStoredCredentials(OPENAI_CODEX_OAUTH.PRIMARY_FILE);
  if (primary) {
    return toSession(primary, 'opensynapse');
  }

  const shared = await readStoredCredentials(OPENAI_CODEX_OAUTH.SHARED_CODEX_FILE);
  if (shared) {
    return toSession(shared, 'codex');
  }

  return null;
}

export async function saveOpenAICodexCredentials(credentials: OpenAICodexStoredCredentials): Promise<void> {
  await fs.mkdir(OPENAI_CODEX_OAUTH.PRIMARY_DIR, { recursive: true });
  await fs.writeFile(OPENAI_CODEX_OAUTH.PRIMARY_FILE, JSON.stringify(credentials, null, 2));
}

export async function clearOpenAICodexCredentials(): Promise<boolean> {
  try {
    await fs.unlink(OPENAI_CODEX_OAUTH.PRIMARY_FILE);
    return true;
  } catch {
    return false;
  }
}

export async function refreshOpenAICodexSession(
  session: Pick<OpenAICodexSession, 'refreshToken'>
): Promise<OpenAICodexSession> {
  const tokenResponse = await exchangeToken(new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: session.refreshToken,
    client_id: OPENAI_CODEX_OAUTH.CLIENT_ID,
  }));

  const refreshed = toStoredCredentialsFromTokenResponse(tokenResponse, session.refreshToken);
  await saveOpenAICodexCredentials(refreshed);
  return toSession(refreshed, 'opensynapse');
}

export async function getValidOpenAICodexSession(): Promise<OpenAICodexSession | null> {
  const session = await loadOpenAICodexSession();
  if (!session) {
    return null;
  }

  if (isTokenFresh(session.expiresAt)) {
    return session;
  }

  return refreshOpenAICodexSession(session);
}

export function isOpenAICodexOAuthModel(modelId: string): boolean {
  const bareModel = modelId.includes('/') ? modelId.split('/').pop() || modelId : modelId;
  return new Set([
    'gpt-5.2',
    'gpt-5.2-codex',
    'gpt-5.1',
    'gpt-5.1-codex-max',
    'gpt-5.1-codex',
    'gpt-5.1-codex-mini',
  ]).has(bareModel);
}

export async function createOpenAICodexAuthorizationFlow(): Promise<{
  url: string;
  state: string;
  verifier: string;
}> {
  const verifier = createCodeVerifier();
  const challenge = createCodeChallenge(verifier);
  const state = randomBytes(16).toString('hex');
  const url = new URL(OPENAI_CODEX_OAUTH.AUTHORIZE_URL);

  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', OPENAI_CODEX_OAUTH.CLIENT_ID);
  url.searchParams.set('redirect_uri', OPENAI_CODEX_OAUTH.REDIRECT_URI);
  url.searchParams.set('scope', OPENAI_CODEX_OAUTH.SCOPE);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('state', state);
  url.searchParams.set('id_token_add_organizations', 'true');
  url.searchParams.set('codex_cli_simplified_flow', 'true');
  url.searchParams.set('originator', 'codex_cli_rs');

  return { url: url.toString(), state, verifier };
}

export async function exchangeOpenAICodexAuthorizationCode(
  code: string,
  verifier: string
): Promise<OpenAICodexStoredCredentials> {
  const tokenResponse = await exchangeToken(new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: OPENAI_CODEX_OAUTH.CLIENT_ID,
    code,
    code_verifier: verifier,
    redirect_uri: OPENAI_CODEX_OAUTH.REDIRECT_URI,
  }));

  const credentials = toStoredCredentialsFromTokenResponse(tokenResponse);
  await saveOpenAICodexCredentials(credentials);
  return credentials;
}

export async function startOpenAICodexCallbackServer(state: string): Promise<OpenAICodexCallbackServer> {
  const successHtml = DEFAULT_SUCCESS_HTML;
  let lastCode: string | null = null;

  const server = http.createServer((req, res) => {
    try {
      const url = new URL(req.url || '', 'http://localhost');
      if (url.pathname !== '/auth/callback') {
        res.statusCode = 404;
        res.end('Not found');
        return;
      }

      if (url.searchParams.get('state') !== state) {
        res.statusCode = 400;
        res.end('State mismatch');
        return;
      }

      const code = url.searchParams.get('code');
      if (!code) {
        res.statusCode = 400;
        res.end('Missing authorization code');
        return;
      }

      lastCode = code;
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(successHtml);
    } catch {
      res.statusCode = 500;
      res.end('Internal error');
    }
  });

  return await new Promise((resolve) => {
    server.listen(1455, '127.0.0.1', () => {
      resolve({
        ready: true,
        close: () => {
          server.close();
        },
        waitForCode: async (timeoutMs = 300_000) => {
          const deadline = Date.now() + timeoutMs;
          while (Date.now() < deadline) {
            if (lastCode) {
              return { code: lastCode };
            }
            await new Promise((done) => setTimeout(done, 100));
          }
          return null;
        },
      });
    }).on('error', () => {
      resolve({
        ready: false,
        close: () => {
          try {
            server.close();
          } catch {
            // Ignore close failures for unbound server instances.
          }
        },
        waitForCode: async () => null,
      });
    });
  });
}
