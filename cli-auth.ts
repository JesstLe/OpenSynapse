import {
  login,
  loadCredentials,
  deleteCredentials,
  getValidAccessToken,
  isTokenExpired,
  OAUTH_CONFIG
} from './src/lib/oauth';
import { exec } from 'child_process';
import { promisify } from 'util';
import { readFile } from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);

// Google Cloud Console 的 OAuth 2.0 客户端 ID
// 注意：这是公开信息，实际使用时应该让用户自己配置
const DEFAULT_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '417482558963-oqm13ue1p47qg49ma2mjemku8mrlv85m.apps.googleusercontent.com';
const DEFAULT_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || undefined;

const CREDENTIALS_PATH = OAUTH_CONFIG.getCredentialsPath();

/**
 * 处理 auth login 命令
 */
export async function handleLogin() {
  try {
    console.log('🔐 OpenSynapse Google 认证\n');
    
    // 检查是否已有凭证
    const existing = await loadCredentials();
    if (existing) {
      console.log('⚠️  已有保存的凭证。继续将覆盖现有凭证。\n');
    }
    
    // 执行OAuth登录流程
    const credentials = await login({
      clientId: DEFAULT_CLIENT_ID,
      clientSecret: DEFAULT_CLIENT_SECRET,
      openBrowser: (url) => {
        // 自动打开浏览器
        const platform = process.platform;
        const cmd = platform === 'darwin' ? 'open' : platform === 'win32' ? 'start' : 'xdg-open';
        exec(`${cmd} "${url}"`, (err) => {
          if (err) {
            console.log('⚠️  自动打开浏览器失败，请手动打开上面的URL');
          }
        });
      }
    });
    
    console.log('\n✅ 认证成功！');
    console.log(`📁 凭证已保存到: ${CREDENTIALS_PATH}`);
    console.log(`⏰ Access Token 过期时间: ${new Date(credentials.expires_at).toLocaleString()}`);
    console.log('\n现在可以运行: npx tsx cli.ts <file.txt>');
    
  } catch (error) {
    console.error('\n❌ 认证失败:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

/**
 * 处理 auth logout 命令
 */
export async function handleLogout() {
  try {
    await deleteCredentials();
    console.log('✅ 已登出，凭证已删除');
  } catch (error) {
    console.error('❌ 登出失败:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

/**
 * 处理 auth status 命令
 */
export async function handleStatus() {
  try {
    const credentials = await loadCredentials();
    
    if (!credentials) {
      console.log('❌ 未登录');
      console.log('\n运行以下命令登录:');
      console.log('  npx tsx cli.ts auth login');
      return;
    }
    
    console.log('✅ 已登录');
    console.log(`📁 凭证路径: ${CREDENTIALS_PATH}`);
    console.log(`⏰ Token 类型: ${credentials.token_type}`);
    console.log(`📋 授权范围: ${credentials.scope}`);
    
    if (isTokenExpired(credentials)) {
      console.log('\n⚠️  Access Token 已过期，将在下次使用时自动刷新');
    } else {
      const remaining = Math.floor((credentials.expires_at - Date.now()) / 1000 / 60);
      console.log(`\n✅ Access Token 有效，还剩 ${remaining} 分钟`);
    }
    
  } catch (error) {
    console.error('❌ 获取状态失败:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

/**
 * 获取有效的 access token（供 cli.ts 使用）
 */
export async function getAccessToken(): Promise<string | null> {
  try {
    // 优先尝试获取OAuth token
    return await getValidAccessToken(DEFAULT_CLIENT_ID, DEFAULT_CLIENT_SECRET);
  } catch {
    // OAuth 失败，返回 null，让调用者使用其他方式
    return null;
  }
}

/**
 * 显示帮助信息
 */
export function showAuthHelp() {
  console.log('OpenSynapse 认证管理\n');
  console.log('用法:');
  console.log('  npx tsx cli.ts auth <command>\n');
  console.log('命令:');
  console.log('  login   使用 Google 账号登录');
  console.log('  logout  退出登录并删除凭证');
  console.log('  status  查看登录状态');
  console.log('  help    显示此帮助信息\n');
  console.log('示例:');
  console.log('  npx tsx cli.ts auth login');
  console.log('  npx tsx cli.ts auth status');
}

/**
 * 主入口：路由到对应的处理函数
 */
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