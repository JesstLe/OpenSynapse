/**
 * Google Gemini CLI / Code Assist 风格 OAuth 实现
 *
 * 这条链路参考 OpenClaw 与 Gemini CLI：
 * 1. 优先复用 Gemini CLI 内置的 OAuth client
 * 2. 使用 Cloud Code / Code Assist scopes
 * 3. 在登录完成后探测用户邮箱和可用 project
 */

import http from 'node:http';
import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path, { delimiter, dirname, join } from 'node:path';
import crypto from 'node:crypto';
import { URL, URLSearchParams } from 'node:url';
import { OAuth2Client } from 'google-auth-library';

const GEMINI_CLI_CLIENT_ID_KEYS = [
  'OPENSYNAPSE_GEMINI_OAUTH_CLIENT_ID',
  'GEMINI_CLI_OAUTH_CLIENT_ID',
  'OPENCLAW_GEMINI_OAUTH_CLIENT_ID',
];

const GEMINI_CLI_CLIENT_SECRET_KEYS = [
  'OPENSYNAPSE_GEMINI_OAUTH_CLIENT_SECRET',
  'GEMINI_CLI_OAUTH_CLIENT_SECRET',
  'OPENCLAW_GEMINI_OAUTH_CLIENT_SECRET',
];

const LEGACY_CLIENT_ID_KEYS = ['GOOGLE_CLIENT_ID'];
const LEGACY_CLIENT_SECRET_KEYS = ['GOOGLE_CLIENT_SECRET'];

const TIER_FREE = 'free-tier';
const TIER_LEGACY = 'legacy-tier';

export const OAUTH_CONFIG = {
  PORT: 3088,
  REDIRECT_URI: 'http://localhost:3088/oauth2callback',
  AUTH_URL: 'https://accounts.google.com/o/oauth2/v2/auth',
  TOKEN_URL: 'https://oauth2.googleapis.com/token',
  USERINFO_URL: 'https://www.googleapis.com/oauth2/v1/userinfo?alt=json',
  CODE_ASSIST_ENDPOINT: 'https://cloudcode-pa.googleapis.com',
  SCOPES: [
    'https://www.googleapis.com/auth/cloud-platform',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
  ],
  getCredentialsPath(): string {
    return path.join(os.homedir(), '.opensynapse', 'credentials.json');
  },
};

export interface OAuthCredentials {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  token_type: string;
  scope: string;
  client_id?: string;
  email?: string;
  project_id?: string;
}

export interface OAuthClientConfig {
  clientId: string;
  clientSecret?: string;
  source: 'env' | 'gemini-cli' | 'legacy-env';
}

interface PKCEChallenge {
  verifier: string;
  challenge: string;
  method: 'S256';
}

interface AuthServer {
  server: http.Server;
  waitForCode: () => Promise<{ code: string; state: string } | null>;
  close: () => void;
}

let cachedGeminiCliCredentials: { clientId: string; clientSecret: string } | null = null;

function resolveEnv(keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) {
      return value;
    }
  }
  return undefined;
}

function findInPath(name: string): string | null {
  const exts = process.platform === 'win32' ? ['.cmd', '.bat', '.exe', ''] : [''];
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    for (const ext of exts) {
      const candidate = join(dir, name + ext);
      if (existsSync(candidate)) {
        return candidate;
      }
    }
  }
  return null;
}

function findFile(dir: string, name: string, depth: number): string | null {
  if (depth <= 0) {
    return null;
  }

  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const candidate = join(dir, entry.name);
      if (entry.isFile() && entry.name === name) {
        return candidate;
      }
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        const found = findFile(candidate, name, depth - 1);
        if (found) {
          return found;
        }
      }
    }
  } catch {
    return null;
  }

  return null;
}

export function clearCredentialsCache(): void {
  cachedGeminiCliCredentials = null;
}

export function extractGeminiCliCredentials(): { clientId: string; clientSecret: string } | null {
  if (cachedGeminiCliCredentials) {
    return cachedGeminiCliCredentials;
  }

  try {
    const geminiPath = findInPath('gemini');
    if (!geminiPath) {
      return null;
    }

    const resolvedPath = realpathSync(geminiPath);
    const geminiCliDir = dirname(dirname(resolvedPath));
    const searchPaths = [
      join(
        geminiCliDir,
        'node_modules',
        '@google',
        'gemini-cli-core',
        'dist',
        'src',
        'code_assist',
        'oauth2.js'
      ),
      join(
        geminiCliDir,
        'node_modules',
        '@google',
        'gemini-cli-core',
        'dist',
        'code_assist',
        'oauth2.js'
      ),
    ];

    let content: string | null = null;
    for (const filePath of searchPaths) {
      if (existsSync(filePath)) {
        content = readFileSync(filePath, 'utf8');
        break;
      }
    }

    if (!content) {
      const fallbackPath = findFile(geminiCliDir, 'oauth2.js', 10);
      if (fallbackPath) {
        content = readFileSync(fallbackPath, 'utf8');
      }
    }

    if (!content) {
      return null;
    }

    const clientIdMatch = content.match(/(\d+-[a-z0-9]+\.apps\.googleusercontent\.com)/);
    const clientSecretMatch = content.match(/(GOCSPX-[A-Za-z0-9_-]+)/);
    if (!clientIdMatch || !clientSecretMatch) {
      return null;
    }

    cachedGeminiCliCredentials = {
      clientId: clientIdMatch[1],
      clientSecret: clientSecretMatch[1],
    };

    return cachedGeminiCliCredentials;
  } catch {
    return null;
  }
}

export function resolveOAuthClientConfig(): OAuthClientConfig {
  const envClientId = resolveEnv(GEMINI_CLI_CLIENT_ID_KEYS);
  const envClientSecret = resolveEnv(GEMINI_CLI_CLIENT_SECRET_KEYS);
  if (envClientId) {
    return {
      clientId: envClientId,
      clientSecret: envClientSecret,
      source: 'env',
    };
  }

  const extracted = extractGeminiCliCredentials();
  if (extracted) {
    return {
      clientId: extracted.clientId,
      clientSecret: extracted.clientSecret,
      source: 'gemini-cli',
    };
  }

  const legacyClientId = resolveEnv(LEGACY_CLIENT_ID_KEYS);
  const legacyClientSecret = resolveEnv(LEGACY_CLIENT_SECRET_KEYS);
  if (legacyClientId) {
    return {
      clientId: legacyClientId,
      clientSecret: legacyClientSecret,
      source: 'legacy-env',
    };
  }

  throw new Error(
    '未找到 Gemini CLI OAuth client。请安装 gemini CLI，或配置 OPENSYNAPSE_GEMINI_OAUTH_CLIENT_ID。'
  );
}

export function generatePKCE(): PKCEChallenge {
  const verifier = crypto.randomBytes(32).toString('hex');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');

  return {
    verifier,
    challenge,
    method: 'S256',
  };
}

export function startOAuthServer(): Promise<AuthServer> {
  return new Promise((resolve, reject) => {
    let codeResolver: ((value: { code: string; state: string } | null) => void) | null = null;
    let codeRejecter: ((reason: Error) => void) | null = null;

    const waitForCodePromise = new Promise<{ code: string; state: string } | null>((resolveCode, rejectCode) => {
      codeResolver = resolveCode;
      codeRejecter = rejectCode;
    });

    const server = http.createServer((req, res) => {
      try {
        const requestUrl = new URL(req.url || '/', OAUTH_CONFIG.REDIRECT_URI);

        if (requestUrl.pathname !== '/oauth2callback') {
          res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(getErrorHtml('未找到页面'));
          return;
        }

        const code = requestUrl.searchParams.get('code');
        const state = requestUrl.searchParams.get('state');
        const error = requestUrl.searchParams.get('error');

        if (error) {
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(getErrorHtml(`OAuth错误: ${error}`));
          codeRejecter?.(new Error(`OAuth error: ${error}`));
          return;
        }

        if (!code || !state) {
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(getErrorHtml('缺少code或state参数'));
          codeRejecter?.(new Error('Missing code or state parameter'));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(getSuccessHtml());
        codeResolver?.({ code, state });
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(getErrorHtml('服务器内部错误'));
        codeRejecter?.(error instanceof Error ? error : new Error(String(error)));
      }
    });

    server.on('error', (error) => reject(error));
    server.listen(OAUTH_CONFIG.PORT, () => {
      console.log(`[OAuth] 回调服务器已启动: ${OAUTH_CONFIG.REDIRECT_URI}`);
      resolve({
        server,
        waitForCode: () => waitForCodePromise,
        close: () => {
          server.close();
          console.log('[OAuth] 回调服务器已关闭');
        },
      });
    });
  });
}

function getSuccessHtml(): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>认证成功 - OpenSynapse</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #0A0A0A 0%, #1A1A1A 100%);
            color: #fff;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
        }
        .container {
            text-align: center;
            padding: 40px;
        }
        .icon {
            width: 80px;
            height: 80px;
            background: linear-gradient(135deg, #FF6B35 0%, #FF8C42 100%);
            border-radius: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 24px;
            font-size: 40px;
        }
        h1 {
            font-size: 28px;
            font-weight: 700;
            margin-bottom: 12px;
        }
        p {
            color: rgba(255,255,255,0.6);
            font-size: 16px;
            margin-bottom: 32px;
        }
        .btn {
            background: rgba(255,255,255,0.1);
            border: 1px solid rgba(255,255,255,0.2);
            color: #fff;
            padding: 12px 24px;
            border-radius: 8px;
            font-size: 14px;
            cursor: pointer;
            transition: all 0.2s;
        }
        .btn:hover {
            background: rgba(255,255,255,0.2);
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="icon">✓</div>
        <h1>认证成功</h1>
        <p>Google 账号已连接，可以关闭此窗口并返回终端。</p>
        <button class="btn" onclick="window.close()">关闭窗口</button>
    </div>
</body>
</html>`;
}

function getErrorHtml(message: string): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>认证失败 - OpenSynapse</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #0A0A0A 0%, #1A1A1A 100%);
            color: #fff;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
        }
        .container {
            text-align: center;
            padding: 40px;
        }
        .icon {
            width: 80px;
            height: 80px;
            background: #ef4444;
            border-radius: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 24px;
            font-size: 40px;
        }
        h1 {
            font-size: 28px;
            font-weight: 700;
            margin-bottom: 12px;
        }
        p {
            color: rgba(255,255,255,0.6);
            font-size: 16px;
            margin-bottom: 32px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="icon">✕</div>
        <h1>认证失败</h1>
        <p>${message}</p>
    </div>
</body>
</html>`;
}

export function buildAuthUrl(clientId: string, pkce: PKCEChallenge, state: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: OAUTH_CONFIG.REDIRECT_URI,
    scope: OAUTH_CONFIG.SCOPES.join(' '),
    code_challenge: pkce.challenge,
    code_challenge_method: pkce.method,
    state,
    access_type: 'offline',
    prompt: 'consent',
  });

  return `${OAUTH_CONFIG.AUTH_URL}?${params.toString()}`;
}

function getCodeAssistHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'User-Agent': 'google-api-nodejs-client/9.15.1',
    'X-Goog-Api-Client': 'gl-node/opensynapse',
  };
}

async function getUserEmail(accessToken: string): Promise<string | undefined> {
  try {
    const response = await fetch(OAUTH_CONFIG.USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      return undefined;
    }

    const data = (await response.json()) as { email?: string };
    return data.email;
  } catch {
    return undefined;
  }
}

function isVpcScAffected(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  const error = (payload as { error?: unknown }).error;
  if (!error || typeof error !== 'object') {
    return false;
  }

  const details = (error as { details?: unknown[] }).details;
  if (!Array.isArray(details)) {
    return false;
  }

  return details.some(
    (item) =>
      typeof item === 'object' &&
      item !== null &&
      (item as { reason?: string }).reason === 'SECURITY_POLICY_VIOLATED'
  );
}

function getDefaultTier(
  allowedTiers?: Array<{ id?: string; isDefault?: boolean }>
): { id?: string } | undefined {
  if (!allowedTiers?.length) {
    return { id: TIER_LEGACY };
  }

  return allowedTiers.find((tier) => tier.isDefault) ?? { id: TIER_LEGACY };
}

async function pollOperation(
  operationName: string,
  headers: Record<string, string>
): Promise<{ done?: boolean; response?: { cloudaicompanionProject?: { id?: string } } }> {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    const response = await fetch(`${OAUTH_CONFIG.CODE_ASSIST_ENDPOINT}/v1internal/${operationName}`, {
      headers,
    });

    if (!response.ok) {
      continue;
    }

    const data = (await response.json()) as {
      done?: boolean;
      response?: { cloudaicompanionProject?: { id?: string } };
    };

    if (data.done) {
      return data;
    }
  }

  throw new Error('Operation polling timeout');
}

async function discoverProject(accessToken: string): Promise<string> {
  const envProject = process.env.GOOGLE_CLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT_ID;
  const headers = getCodeAssistHeaders(accessToken);

  const loadBody = {
    cloudaicompanionProject: envProject,
    metadata: {
      ideType: 'IDE_UNSPECIFIED',
      platform: 'PLATFORM_UNSPECIFIED',
      pluginType: 'GEMINI',
      duetProject: envProject,
    },
  };

  let data: {
    currentTier?: { id?: string };
    cloudaicompanionProject?: string | { id?: string };
    allowedTiers?: Array<{ id?: string; isDefault?: boolean }>;
  } = {};

  const loadResponse = await fetch(`${OAUTH_CONFIG.CODE_ASSIST_ENDPOINT}/v1internal:loadCodeAssist`, {
    method: 'POST',
    headers,
    body: JSON.stringify(loadBody),
  });

  if (!loadResponse.ok) {
    const errorPayload = await loadResponse.json().catch(() => null);
    if (isVpcScAffected(errorPayload)) {
      data = { currentTier: { id: 'standard-tier' } };
    } else {
      throw new Error(`loadCodeAssist failed: ${loadResponse.status} ${loadResponse.statusText}`);
    }
  } else {
    data = (await loadResponse.json()) as typeof data;
  }

  if (data.currentTier) {
    const project = data.cloudaicompanionProject;
    if (typeof project === 'string' && project) {
      return project;
    }
    if (typeof project === 'object' && project?.id) {
      return project.id;
    }
    if (envProject) {
      return envProject;
    }
    throw new Error(
      '当前账号需要设置 GOOGLE_CLOUD_PROJECT 或 GOOGLE_CLOUD_PROJECT_ID 才能使用 Gemini Code Assist。'
    );
  }

  const tier = getDefaultTier(data.allowedTiers);
  const tierId = tier?.id || TIER_FREE;
  if (tierId !== TIER_FREE && !envProject) {
    throw new Error(
      '当前账号需要设置 GOOGLE_CLOUD_PROJECT 或 GOOGLE_CLOUD_PROJECT_ID 才能使用 Gemini Code Assist。'
    );
  }

  const onboardBody: Record<string, unknown> = {
    tierId,
    metadata: {
      ideType: 'IDE_UNSPECIFIED',
      platform: 'PLATFORM_UNSPECIFIED',
      pluginType: 'GEMINI',
    },
  };

  if (tierId !== TIER_FREE && envProject) {
    onboardBody.cloudaicompanionProject = envProject;
    (onboardBody.metadata as Record<string, unknown>).duetProject = envProject;
  }

  const onboardResponse = await fetch(`${OAUTH_CONFIG.CODE_ASSIST_ENDPOINT}/v1internal:onboardUser`, {
    method: 'POST',
    headers,
    body: JSON.stringify(onboardBody),
  });

  if (!onboardResponse.ok) {
    throw new Error(`onboardUser failed: ${onboardResponse.status} ${onboardResponse.statusText}`);
  }

  let operation = (await onboardResponse.json()) as {
    done?: boolean;
    name?: string;
    response?: { cloudaicompanionProject?: { id?: string } };
  };

  if (!operation.done && operation.name) {
    operation = await pollOperation(operation.name, headers);
  }

  const projectId = operation.response?.cloudaicompanionProject?.id;
  if (projectId) {
    return projectId;
  }
  if (envProject) {
    return envProject;
  }

  throw new Error(
    '无法从 Code Assist 发现或创建可用 project，请设置 GOOGLE_CLOUD_PROJECT 或 GOOGLE_CLOUD_PROJECT_ID。'
  );
}

async function enrichCredentials(
  credentials: OAuthCredentials,
  clientId: string
): Promise<OAuthCredentials> {
  const [email, projectId] = await Promise.all([
    credentials.email ? Promise.resolve(credentials.email) : getUserEmail(credentials.access_token),
    credentials.project_id ? Promise.resolve(credentials.project_id) : discoverProject(credentials.access_token),
  ]);

  return {
    ...credentials,
    client_id: clientId,
    email,
    project_id: projectId,
  };
}

async function exchangeTokenRequest(body: URLSearchParams): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}> {
  const response = await fetch(OAUTH_CONFIG.TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body,
  });

  const payload = (await response.json().catch(() => null)) as
    | {
        access_token: string;
        refresh_token?: string;
        expires_in: number;
        token_type?: string;
        scope?: string;
        error?: string;
        error_description?: string;
      }
    | null;

  if (!response.ok || payload?.error || !payload?.access_token || !payload.expires_in) {
    const errorCode = payload?.error || response.statusText;
    const errorDescription = payload?.error_description || 'token request failed';
    throw new Error(`Token request failed: ${errorCode} - ${errorDescription}`);
  }

  return payload;
}

export async function exchangeCode(
  code: string,
  verifier: string,
  clientId: string,
  clientSecret?: string
): Promise<OAuthCredentials> {
  const body = new URLSearchParams({
    client_id: clientId,
    code,
    code_verifier: verifier,
    grant_type: 'authorization_code',
    redirect_uri: OAUTH_CONFIG.REDIRECT_URI,
  });

  if (clientSecret) {
    body.set('client_secret', clientSecret);
  }

  const response = await exchangeTokenRequest(body);
  if (!response.refresh_token) {
    throw new Error('No refresh token received. Please try again.');
  }

  return enrichCredentials(
    {
      access_token: response.access_token,
      refresh_token: response.refresh_token,
      expires_at: Date.now() + response.expires_in * 1000,
      token_type: response.token_type || 'Bearer',
      scope: response.scope || OAUTH_CONFIG.SCOPES.join(' '),
    },
    clientId
  );
}

export async function refreshToken(
  credentials: OAuthCredentials,
  clientId: string,
  clientSecret?: string
): Promise<OAuthCredentials> {
  const body = new URLSearchParams({
    client_id: clientId,
    refresh_token: credentials.refresh_token,
    grant_type: 'refresh_token',
  });

  if (clientSecret) {
    body.set('client_secret', clientSecret);
  }

  const response = await exchangeTokenRequest(body);
  const refreshed: OAuthCredentials = {
    access_token: response.access_token,
    refresh_token: response.refresh_token || credentials.refresh_token,
    expires_at: Date.now() + response.expires_in * 1000,
    token_type: response.token_type || credentials.token_type || 'Bearer',
    scope: response.scope || credentials.scope,
    client_id: credentials.client_id || clientId,
    email: credentials.email,
    project_id: credentials.project_id,
  };

  if (refreshed.email && refreshed.project_id) {
    return refreshed;
  }

  return enrichCredentials(refreshed, clientId);
}

export async function saveCredentials(credentials: OAuthCredentials): Promise<void> {
  const credPath = OAUTH_CONFIG.getCredentialsPath();
  const dir = path.dirname(credPath);

  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(credPath, JSON.stringify(credentials, null, 2), { mode: 0o600 });
  console.log(`[OAuth] 凭证已保存到: ${credPath}`);
}

export async function loadCredentials(): Promise<OAuthCredentials | null> {
  const credPath = OAUTH_CONFIG.getCredentialsPath();

  try {
    const data = await fs.readFile(credPath, 'utf-8');
    return JSON.parse(data) as OAuthCredentials;
  } catch {
    return null;
  }
}

export async function deleteCredentials(): Promise<void> {
  const credPath = OAUTH_CONFIG.getCredentialsPath();

  try {
    await fs.unlink(credPath);
    console.log('[OAuth] 凭证已删除');
  } catch {
    // ignore
  }
}

export function isTokenExpired(credentials: OAuthCredentials): boolean {
  return Date.now() >= credentials.expires_at - 5 * 60 * 1000;
}

export function isCredentialsCompatible(credentials: OAuthCredentials, clientId: string): boolean {
  return credentials.client_id === clientId;
}

export function createOAuthAuthClient(
  credentials: OAuthCredentials,
  clientId: string,
  clientSecret?: string
): OAuth2Client {
  const client = new OAuth2Client({
    clientId,
    clientSecret,
    redirectUri: OAUTH_CONFIG.REDIRECT_URI,
  });

  client.setCredentials({
    access_token: credentials.access_token,
    refresh_token: credentials.refresh_token,
    expiry_date: credentials.expires_at,
    token_type: credentials.token_type,
    scope: credentials.scope,
  });

  return client;
}

export async function getValidCredentials(
  clientId: string,
  clientSecret?: string
): Promise<OAuthCredentials> {
  const credentials = await loadCredentials();
  if (!credentials) {
    throw new Error('No credentials found. Run "npx tsx cli.ts auth login" first.');
  }

  if (!isCredentialsCompatible(credentials, clientId)) {
    throw new Error('已保存的凭证来自旧版认证流程，请重新运行 "npx tsx cli.ts auth login"。');
  }

  if (!isTokenExpired(credentials)) {
    return credentials;
  }

  console.log('[OAuth] Token已过期，正在刷新...');
  const refreshed = await refreshToken(credentials, clientId, clientSecret);
  await saveCredentials(refreshed);
  return refreshed;
}

export async function getValidAccessToken(
  clientId: string,
  clientSecret?: string
): Promise<string> {
  const credentials = await getValidCredentials(clientId, clientSecret);
  return credentials.access_token;
}

interface LoginOptions {
  clientId: string;
  clientSecret?: string;
  openBrowser?: (url: string) => void;
}

export async function login(options: LoginOptions): Promise<OAuthCredentials> {
  const { clientId, clientSecret, openBrowser } = options;

  console.log('[OAuth] 启动登录流程...');
  const pkce = generatePKCE();
  const state = crypto.randomBytes(32).toString('hex');
  const server = await startOAuthServer();
  const cleanup = () => server.close();
  const handleSignal = () => {
    cleanup();
    process.exit(130);
  };

  process.once('SIGINT', handleSignal);
  process.once('SIGTERM', handleSignal);

  try {
    const authUrl = buildAuthUrl(clientId, pkce, state);
    console.log('[OAuth] 请在浏览器中打开以下URL进行授权:');
    console.log(authUrl);
    console.log('');

    if (openBrowser) {
      openBrowser(authUrl);
    } else {
      const { exec } = await import('node:child_process');
      const command =
        process.platform === 'darwin'
          ? 'open'
          : process.platform === 'win32'
            ? 'start'
            : 'xdg-open';
      exec(`${command} "${authUrl}"`);
    }

    console.log('[OAuth] 等待浏览器回调...');
    const result = await server.waitForCode();
    if (!result) {
      throw new Error('Authorization cancelled or timed out');
    }

    if (result.state !== state) {
      throw new Error('State mismatch - possible CSRF attack');
    }

    console.log('[OAuth] 正在获取访问令牌...');
    const credentials = await exchangeCode(result.code, pkce.verifier, clientId, clientSecret);
    await saveCredentials(credentials);

    console.log('[OAuth] 登录成功！');
    console.log(`[OAuth] Access Token有效期: ${new Date(credentials.expires_at).toLocaleString()}`);
    if (credentials.email) {
      console.log(`[OAuth] 已识别账号: ${credentials.email}`);
    }
    if (credentials.project_id) {
      console.log(`[OAuth] Code Assist Project: ${credentials.project_id}`);
    }

    return credentials;
  } finally {
    process.off('SIGINT', handleSignal);
    process.off('SIGTERM', handleSignal);
    cleanup();
  }
}
