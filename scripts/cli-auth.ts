import { exec } from 'node:child_process';
import dotenv from 'dotenv';
import {
  deleteCredentials,
  getValidAccessToken,
  isCredentialsCompatible,
  isTokenExpired,
  loadCredentials,
  login,
  OAUTH_CONFIG,
  resolveOAuthClientConfig,
} from '../src/lib/oauth.js';

dotenv.config({ path: '.env.local' });

const CREDENTIALS_PATH = OAUTH_CONFIG.getCredentialsPath();

export async function handleLogin() {
  try {
    console.log('OpenSynapse Gemini CLI 认证\n');

    const clientConfig = resolveOAuthClientConfig();
    console.log(`[Auth] OAuth client 来源: ${clientConfig.source}`);

    const existing = await loadCredentials();
    if (existing) {
      console.log('已检测到本地凭证，继续登录会覆盖旧凭证。\n');
    }

    const credentials = await login({
      clientId: clientConfig.clientId,
      clientSecret: clientConfig.clientSecret,
      openBrowser: (url) => {
        const platform = process.platform;
        const command = platform === 'darwin' ? 'open' : platform === 'win32' ? 'start' : 'xdg-open';
        exec(`${command} "${url}"`, (error) => {
          if (error) {
            console.log('自动打开浏览器失败，请手动打开上面的 URL。');
          }
        });
      },
    });

    console.log('\n认证成功');
    console.log(`凭证已保存到: ${CREDENTIALS_PATH}`);
    console.log(`Access Token 过期时间: ${new Date(credentials.expires_at).toLocaleString()}`);
    if (credentials.email) {
      console.log(`账号: ${credentials.email}`);
    }
    if (credentials.project_id) {
      console.log(`Code Assist Project: ${credentials.project_id}`);
    }
    console.log('\n现在可以运行: npx tsx cli.ts <file.txt>');
  } catch (error) {
    console.error('\n认证失败:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

export async function handleLogout() {
  try {
    await deleteCredentials();
    console.log('已登出，凭证已删除');
  } catch (error) {
    console.error('登出失败:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

export async function handleStatus() {
  try {
    const credentials = await loadCredentials();
    if (!credentials) {
      console.log('未登录');
      console.log('\n运行以下命令登录:');
      console.log('  npx tsx cli.ts auth login');
      return;
    }

    console.log('已登录');
    console.log(`凭证路径: ${CREDENTIALS_PATH}`);
    console.log(`Token 类型: ${credentials.token_type}`);
    console.log(`授权范围: ${credentials.scope}`);
    if (credentials.email) {
      console.log(`账号: ${credentials.email}`);
    }
    if (credentials.project_id) {
      console.log(`Code Assist Project: ${credentials.project_id}`);
    }
    if (credentials.client_id) {
      console.log(`OAuth Client: ${credentials.client_id}`);
    }

    try {
      const clientConfig = resolveOAuthClientConfig();
      if (!isCredentialsCompatible(credentials, clientConfig.clientId)) {
        console.log('\n需要重新登录：当前保存的凭证来自旧版或其他 OAuth client。');
      }
    } catch (error) {
      console.log(
        `\n无法验证当前 OAuth client 配置: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    if (isTokenExpired(credentials)) {
      console.log('\nAccess Token 已过期，将在下次使用时自动刷新');
    } else {
      const remaining = Math.floor((credentials.expires_at - Date.now()) / 1000 / 60);
      console.log(`\nAccess Token 有效，还剩 ${remaining} 分钟`);
    }
  } catch (error) {
    console.error('获取状态失败:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

export async function getAccessToken(): Promise<string | null> {
  try {
    const clientConfig = resolveOAuthClientConfig();
    return await getValidAccessToken(clientConfig.clientId, clientConfig.clientSecret);
  } catch {
    return null;
  }
}

export function showAuthHelp() {
  console.log('OpenSynapse 认证管理\n');
  console.log('用法:');
  console.log('  npx tsx cli.ts auth <command>\n');
  console.log('命令:');
  console.log('  login   使用 Gemini CLI 风格 Google 登录');
  console.log('  logout  退出登录并删除凭证');
  console.log('  status  查看登录状态');
  console.log('  help    显示此帮助信息\n');
  console.log('示例:');
  console.log('  npx tsx cli.ts auth login');
  console.log('  npx tsx cli.ts auth status');
}

export async function handleAuthCommand(args: string[]) {
  const command = args[0] || 'help';

  switch (command) {
    case 'login':
      await handleLogin();
      break;
    case 'logout':
      await handleLogout();
      break;
    case 'status':
      await handleStatus();
      break;
    case 'help':
    default:
      showAuthHelp();
      break;
  }
}
