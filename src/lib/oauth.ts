/**
 * Google Gemini OAuth 实现 (OpenClaw风格)
 * 端口: 3456 (避免与8085冲突)
 * 
 * 功能：
 * 1. PKCE参数生成
 * 2. 本地OAuth回调服务器
 * 3. Token获取和刷新
 * 4. 凭证存储管理
 */

import http from 'http';
import https from 'https';
import { URL, URLSearchParams } from 'url';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

// ============================================
// 配置
// ============================================
const OAUTH_CONFIG = {
  // 使用端口3088 (避免与8085冲突)
  PORT: 3088,
  HOST: '127.0.0.1',
  REDIRECT_URI: 'http://127.0.0.1:3456/oauth2callback',
  
  // Google OAuth端点
  AUTH_URL: 'https://accounts.google.com/o/oauth2/v2/auth',
  TOKEN_URL: 'https://oauth2.googleapis.com/token',
  
  // 授权范围 - 使用 cloud-platform 访问 Gemini API
  // generative-language scope 需要特殊权限，使用 cloud-platform 即可
  SCOPES: [
    'https://www.googleapis.com/auth/cloud-platform'
  ],
  
  // 凭证存储路径
  getCredentialsPath(): string {
    return path.join(os.homedir(), '.opensynapse', 'credentials.json');
  }
};

// ============================================
// 类型定义
// ============================================
export interface OAuthCredentials {
  access_token: string;
  refresh_token: string;
  expires_at: number;  // 过期时间戳(毫秒)
  token_type: string;
  scope: string;
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

// ============================================
// PKCE工具
// ============================================

/**
 * 生成PKCE参数
 * PKCE (Proof Key for Code Exchange) 防止授权码被截获
 */
export function generatePKCE(): PKCEChallenge {
  // 生成随机verifier (128字节 = 256字符的base64)
  const verifier = crypto.randomBytes(128).toString('base64url');
  
  // 计算challenge (verifier的SHA256哈希)
  const challenge = crypto
    .createHash('sha256')
    .update(verifier)
    .digest('base64url');
  
  return {
    verifier,
    challenge,
    method: 'S256'
  };
}

// ============================================
// 本地OAuth服务器
// ============================================

/**
 * 启动本地OAuth回调服务器
 * 监听 http://127.0.0.1:3456/oauth2callback
 */
export function startOAuthServer(): Promise<AuthServer> {
  return new Promise((resolve, reject) => {
    let codeResolver: ((value: { code: string; state: string } | null) => void) | null = null;
    let codeRejecter: ((reason: Error) => void) | null = null;
    
    // 等待code的Promise
    const waitForCodePromise = new Promise<{ code: string; state: string } | null>((resolve, reject) => {
      codeResolver = resolve;
      codeRejecter = reject;
    });
    
    const server = http.createServer((req, res) => {
      try {
        const url = new URL(req.url || '/', `http://${OAUTH_CONFIG.HOST}:${OAUTH_CONFIG.PORT}`);
        
        if (url.pathname === '/oauth2callback') {
          const code = url.searchParams.get('code');
          const state = url.searchParams.get('state');
          const error = url.searchParams.get('error');
          
          if (error) {
            // 返回错误页面
            res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(getErrorHtml(`OAuth错误: ${error}`));
            codeRejecter?.(new Error(`OAuth error: ${error}`));
            return;
          }
          
          if (code && state) {
            // 返回成功页面
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(getSuccessHtml());
            codeResolver?.({ code, state });
          } else {
            // 缺少参数
            res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(getErrorHtml('缺少code或state参数'));
            codeRejecter?.(new Error('Missing code or state parameter'));
          }
        } else {
          // 404
          res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(getErrorHtml('未找到页面'));
        }
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(getErrorHtml('服务器内部错误'));
        codeRejecter?.(err instanceof Error ? err : new Error(String(err)));
      }
    });
    
    server.on('error', (err) => {
      reject(err);
    });
    
    server.listen(OAUTH_CONFIG.PORT, OAUTH_CONFIG.HOST, () => {
      console.log(`[OAuth] 回调服务器已启动: http://${OAUTH_CONFIG.HOST}:${OAUTH_CONFIG.PORT}`);
      resolve({
        server,
        waitForCode: () => waitForCodePromise,
        close: () => {
          server.close();
          console.log('[OAuth] 回调服务器已关闭');
        }
      });
    });
  });
}

// ============================================
// HTML页面模板
// ============================================

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

// ============================================
// Token管理
// ============================================

/**
 * 构建授权URL
 */
export function buildAuthUrl(clientId: string, pkce: PKCEChallenge, state: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: OAUTH_CONFIG.REDIRECT_URI,
    scope: OAUTH_CONFIG.SCOPES.join(' '),
    code_challenge: pkce.challenge,
    code_challenge_method: pkce.method,
    state: state,
    access_type: 'offline',  // 获取refresh_token
    prompt: 'consent'        // 强制显示授权页面
  });
  
  return `${OAUTH_CONFIG.AUTH_URL}?${params.toString()}`;
}

/**
 * 交换Authorization Code获取Token
 */
export async function exchangeCode(
  code: string, 
  verifier: string,
  clientId: string,
  clientSecret?: string
): Promise<OAuthCredentials> {
  const params = new URLSearchParams({
    client_id: clientId,
    code: code,
    code_verifier: verifier,
    grant_type: 'authorization_code',
    redirect_uri: OAUTH_CONFIG.REDIRECT_URI
  });
  
  if (clientSecret) {
    params.set('client_secret', clientSecret);
  }
  
  return new Promise((resolve, reject) => {
    const req = https.request(
      OAUTH_CONFIG.TOKEN_URL,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        }
      },
      (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            if (response.error) {
              reject(new Error(`Token exchange failed: ${response.error} - ${response.error_description}`));
              return;
            }
            
            resolve({
              access_token: response.access_token,
              refresh_token: response.refresh_token,
              expires_at: Date.now() + response.expires_in * 1000,
              token_type: response.token_type,
              scope: response.scope
            });
          } catch (err) {
            reject(new Error(`Failed to parse token response: ${data}`));
          }
        });
      }
    );
    
    req.on('error', reject);
    req.write(params.toString());
    req.end();
  });
}

/**
 * 刷新Access Token
 */
export async function refreshToken(
  refreshToken: string,
  clientId: string,
  clientSecret?: string
): Promise<OAuthCredentials> {
  const params = new URLSearchParams({
    client_id: clientId,
    refresh_token: refreshToken,
    grant_type: 'refresh_token'
  });
  
  if (clientSecret) {
    params.set('client_secret', clientSecret);
  }
  
  return new Promise((resolve, reject) => {
    const req = https.request(
      OAUTH_CONFIG.TOKEN_URL,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        }
      },
      (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            if (response.error) {
              reject(new Error(`Token refresh failed: ${response.error}`));
              return;
            }
            
            resolve({
              access_token: response.access_token,
              refresh_token: response.refresh_token || refreshToken,  // 可能没有新的refresh_token
              expires_at: Date.now() + response.expires_in * 1000,
              token_type: response.token_type,
              scope: response.scope
            });
          } catch (err) {
            reject(new Error(`Failed to parse refresh response: ${data}`));
          }
        });
      }
    );
    
    req.on('error', reject);
    req.write(params.toString());
    req.end();
  });
}

// ============================================
// 凭证存储
// ============================================

/**
 * 保存凭证到本地文件
 */
export async function saveCredentials(credentials: OAuthCredentials): Promise<void> {
  const credPath = OAUTH_CONFIG.getCredentialsPath();
  const dir = path.dirname(credPath);
  
  try {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(credPath, JSON.stringify(credentials, null, 2), { mode: 0o600 });
    console.log(`[OAuth] 凭证已保存到: ${credPath}`);
  } catch (err) {
    throw new Error(`Failed to save credentials: ${err}`);
  }
}

/**
 * 加载凭证
 */
export async function loadCredentials(): Promise<OAuthCredentials | null> {
  const credPath = OAUTH_CONFIG.getCredentialsPath();
  
  try {
    const data = await fs.readFile(credPath, 'utf-8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

/**
 * 删除凭证
 */
export async function deleteCredentials(): Promise<void> {
  const credPath = OAUTH_CONFIG.getCredentialsPath();
  
  try {
    await fs.unlink(credPath);
    console.log('[OAuth] 凭证已删除');
  } catch {
    // 文件不存在，忽略错误
  }
}

/**
 * 检查凭证是否过期
 */
export function isTokenExpired(credentials: OAuthCredentials): boolean {
  // 提前5分钟认为过期
  return Date.now() >= credentials.expires_at - 5 * 60 * 1000;
}

/**
 * 获取有效的access_token（自动刷新）
 */
export async function getValidAccessToken(
  clientId: string,
  clientSecret?: string
): Promise<string> {
  const credentials = await loadCredentials();
  
  if (!credentials) {
    throw new Error('No credentials found. Run "npx tsx cli.ts auth login" first.');
  }
  
  if (isTokenExpired(credentials)) {
    console.log('[OAuth] Token已过期，正在刷新...');
    const newCredentials = await refreshToken(
      credentials.refresh_token,
      clientId,
      clientSecret
    );
    await saveCredentials(newCredentials);
    return newCredentials.access_token;
  }
  
  return credentials.access_token;
}

// ============================================
// 主流程：登录
// ============================================

interface LoginOptions {
  clientId: string;
  clientSecret?: string;
  openBrowser?: (url: string) => void;
}

/**
 * 执行OAuth登录流程
 */
export async function login(options: LoginOptions): Promise<OAuthCredentials> {
  const { clientId, clientSecret, openBrowser } = options;
  
  console.log('[OAuth] 启动登录流程...');
  
  // 1. 生成PKCE参数
  const pkce = generatePKCE();
  const state = crypto.randomBytes(32).toString('hex');
  
  // 2. 启动本地服务器
  const server = await startOAuthServer();
  
  try {
    // 3. 构建授权URL
    const authUrl = buildAuthUrl(clientId, pkce, state);
    
    console.log(`[OAuth] 请在浏览器中打开以下URL进行授权:`);
    console.log(authUrl);
    console.log('');
    
    // 4. 打开浏览器
    if (openBrowser) {
      openBrowser(authUrl);
    } else {
      // 尝试自动打开
      const { exec } = await import('child_process');
      const platform = process.platform;
      const cmd = platform === 'darwin' ? 'open' : platform === 'win32' ? 'start' : 'xdg-open';
      exec(`${cmd} "${authUrl}"`);
    }
    
    // 5. 等待回调
    console.log('[OAuth] 等待浏览器回调...');
    const result = await server.waitForCode();
    
    if (!result) {
      throw new Error('Authorization cancelled or timed out');
    }
    
    // 6. 验证state（防CSRF）
    if (result.state !== state) {
      throw new Error('State mismatch - possible CSRF attack');
    }
    
    // 7. 交换code获取token
    console.log('[OAuth] 正在获取访问令牌...');
    const credentials = await exchangeCode(result.code, pkce.verifier, clientId, clientSecret);
    
    // 8. 保存凭证
    await saveCredentials(credentials);
    
    console.log('[OAuth] 登录成功！');
    console.log(`[OAuth] Access Token有效期: ${new Date(credentials.expires_at).toLocaleString()}`);
    
    return credentials;
  } finally {
    server.close();
  }
}

// ============================================
// 导出配置
// ============================================
export { OAUTH_CONFIG };