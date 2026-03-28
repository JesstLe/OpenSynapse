/**
 * 认证路由
 * 处理微信、QQ OAuth 登录和账号绑定
 */

import { Router } from 'express';
import crypto from 'crypto';
import { createCustomToken, getOrCreateUser } from '../lib/firebaseAdmin';
import {
  findOrCreateUserByProvider,
  getUserConnectedAccounts,
  unlinkConnectedAccount
} from '../lib/userService';
import type { LoginResult, LinkAccountResult } from '../types/auth';

const router = Router();

// In-memory session store (生产环境应使用 Redis)
const authSessions = new Map<string, {
  provider: 'wechat' | 'qq';
  state: string;
  action: 'login' | 'link';
  currentFirebaseUid?: string;
  createdAt: number;
  expiresAt: number;
}>();

// 清理过期会话
setInterval(() => {
  const now = Date.now();
  for (const [key, session] of authSessions.entries()) {
    if (session.expiresAt < now) {
      authSessions.delete(key);
    }
  }
}, 5 * 60 * 1000); // 每5分钟清理一次

// ===============================================================
// 微信登录
// ===============================================================

/**
 * 启动微信登录
 * GET /auth/wechat/start
 */
router.get('/wechat/start', (req, res) => {
  const { action = 'login', currentUid } = req.query as { action?: 'login' | 'link'; currentUid?: string };
  
  // 生成 state 防止 CSRF
  const state = crypto.randomBytes(32).toString('hex');
  const sessionId = crypto.randomUUID();
  
  // 保存会话
  authSessions.set(sessionId, {
    provider: 'wechat',
    state,
    action,
    currentFirebaseUid: currentUid,
    createdAt: Date.now(),
    expiresAt: Date.now() + 10 * 60 * 1000 // 10分钟过期
  });
  
  // 构建微信授权 URL
  const appId = process.env.WECHAT_APP_ID;
  const redirectUri = encodeURIComponent(`${process.env.APP_URL}/auth/wechat/callback`);
  const scope = 'snsapi_login'; // 网页登录
  
  const authUrl = `https://open.weixin.qq.com/connect/qrconnect?appid=${appId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}&state=${state}#wechat_redirect`;
  
  res.json({
    success: true,
    authUrl,
    sessionId
  });
});

/**
 * 微信回调处理
 * GET /auth/wechat/callback
 */
router.get('/wechat/callback', async (req, res) => {
  const { code, state, error: wechatError } = req.query;
  
  if (wechatError) {
    return res.redirect(`/login?error=wechat_denied`);
  }
  
  if (!code || !state) {
    return res.redirect(`/login?error=invalid_callback`);
  }
  
  try {
    // 1. 用 code 换取 access_token 和 openid
    const tokenResponse = await fetch(
      `https://api.weixin.qq.com/sns/oauth2/access_token?appid=${process.env.WECHAT_APP_ID}&secret=${process.env.WECHAT_APP_SECRET}&code=${code}&grant_type=authorization_code`
    );
    const tokenData = await tokenResponse.json();
    
    if (tokenData.errcode) {
      throw new Error(`WeChat API error: ${tokenData.errmsg}`);
    }
    
    const { access_token, openid, unionid } = tokenData;
    
    // 2. 获取用户信息
    const userResponse = await fetch(
      `https://api.weixin.qq.com/sns/userinfo?access_token=${access_token}&openid=${openid}`
    );
    const userData = await userResponse.json();
    
    if (userData.errcode) {
      throw new Error(`WeChat API error: ${userData.errmsg}`);
    }
    
    // 3. 查找或创建用户
    const { user, isNewUser } = await findOrCreateUserByProvider(
      'wechat',
      unionid || openid,
      {
        displayName: userData.nickname || '微信用户',
        avatarUrl: userData.headimgurl,
        // 微信不直接提供邮箱
      }
    );
    
    // 4. 创建 Firebase Custom Token
    const firebaseToken = await createCustomToken(user.uid, {
      provider: 'wechat',
      displayName: user.displayName,
      avatarUrl: user.avatarUrl
    });
    
    // 5. 确保 Firebase Auth 中有该用户
    await getOrCreateUser(user.uid, {
      displayName: user.displayName,
      photoURL: user.avatarUrl
    });
    
    // 6. 重定向回前端，带上 token
    res.redirect(`/auth/complete?token=${encodeURIComponent(firebaseToken)}&provider=wechat&isNewUser=${isNewUser}`);
    
  } catch (error: any) {
    console.error('[WeChat Login Error]', error);
    res.redirect(`/login?error=wechat_auth_failed&message=${encodeURIComponent(error.message)}`);
  }
});

// ===============================================================
// QQ 登录
// ===============================================================

/**
 * 启动 QQ 登录
 * GET /auth/qq/start
 */
router.get('/qq/start', (req, res) => {
  const { action = 'login', currentUid } = req.query as { action?: 'login' | 'link'; currentUid?: string };
  
  const state = crypto.randomBytes(32).toString('hex');
  const sessionId = crypto.randomUUID();
  
  authSessions.set(sessionId, {
    provider: 'qq',
    state,
    action,
    currentFirebaseUid: currentUid,
    createdAt: Date.now(),
    expiresAt: Date.now() + 10 * 60 * 1000
  });
  
  const appId = process.env.QQ_APP_ID;
  const redirectUri = encodeURIComponent(`${process.env.APP_URL}/auth/qq/callback`);
  
  // QQ 互联授权 URL
  const authUrl = `https://graph.qq.com/oauth2.0/authorize?response_type=code&client_id=${appId}&redirect_uri=${redirectUri}&state=${state}&scope=get_user_info`;
  
  res.json({
    success: true,
    authUrl,
    sessionId
  });
});

/**
 * QQ 回调处理
 * GET /auth/qq/callback
 */
router.get('/qq/callback', async (req, res) => {
  const { code, state } = req.query;
  
  if (!code || !state) {
    return res.redirect(`/login?error=invalid_callback`);
  }
  
  try {
    // 1. 用 code 换取 access_token
    const tokenResponse = await fetch(
      `https://graph.qq.com/oauth2.0/token?grant_type=authorization_code&client_id=${process.env.QQ_APP_ID}&client_secret=${process.env.QQ_APP_SECRET}&code=${code}&redirect_uri=${encodeURIComponent(process.env.APP_URL + '/auth/qq/callback')}`
    );
    const tokenText = await tokenResponse.text();
    
    // QQ 返回格式：access_token=xxx&expires_in=xxx&refresh_token=xxx
    const tokenMatch = tokenText.match(/access_token=([^&]+)/);
    if (!tokenMatch) {
      throw new Error('Failed to get QQ access token');
    }
    const access_token = tokenMatch[1];
    
    // 2. 获取 OpenID
    const openidResponse = await fetch(
      `https://graph.qq.com/oauth2.0/me?access_token=${access_token}`
    );
    const openidText = await openidResponse.text();
    // 返回格式：callback({"client_id":"xxx","openid":"xxx"});
    const openidMatch = openidText.match(/"openid":"([^"]+)"/);
    if (!openidMatch) {
      throw new Error('Failed to get QQ openid');
    }
    const openid = openidMatch[1];
    
    // 3. 获取用户信息
    const userResponse = await fetch(
      `https://graph.qq.com/user/get_user_info?access_token=${access_token}&oauth_consumer_key=${process.env.QQ_APP_ID}&openid=${openid}`
    );
    const userData = await userResponse.json();
    
    if (userData.ret !== 0) {
      throw new Error(`QQ API error: ${userData.msg}`);
    }
    
    // 4. 查找或创建用户
    const { user, isNewUser } = await findOrCreateUserByProvider(
      'qq',
      openid,
      {
        displayName: userData.nickname || 'QQ用户',
        avatarUrl: userData.figureurl_qq_2 || userData.figureurl_qq_1
      }
    );
    
    // 5. 创建 Firebase Custom Token
    const firebaseToken = await createCustomToken(user.uid, {
      provider: 'qq',
      displayName: user.displayName,
      avatarUrl: user.avatarUrl
    });
    
    // 6. 确保 Firebase Auth 中有该用户
    await getOrCreateUser(user.uid, {
      displayName: user.displayName,
      photoURL: user.avatarUrl
    });
    
    // 7. 重定向回前端
    res.redirect(`/auth/complete?token=${encodeURIComponent(firebaseToken)}&provider=qq&isNewUser=${isNewUser}`);
    
  } catch (error: any) {
    console.error('[QQ Login Error]', error);
    res.redirect(`/login?error=qq_auth_failed&message=${encodeURIComponent(error.message)}`);
  }
});

// ===============================================================
// 账号管理 API
// ===============================================================

/**
 * 获取当前用户的连接账号列表
 * GET /api/account/connected-providers
 */
router.get('/api/account/connected-providers', async (req, res) => {
  // 这里需要从请求头中验证 Firebase ID Token
  // 简化示例，实际应使用 middleware 验证
  const authorization = req.headers.authorization;
  if (!authorization?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  try {
    const { verifyIdToken } = await import('../lib/firebaseAdmin');
    const decodedToken = await verifyIdToken(authorization.substring(7));
    const accounts = await getUserConnectedAccounts(decodedToken.uid);
    
    res.json({
      success: true,
      accounts: accounts.map(acc => ({
        provider: acc.provider,
        displayName: acc.displayName,
        avatarUrl: acc.avatarUrl,
        linkedAt: acc.linkedAt
      }))
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 解绑第三方账号
 * POST /api/account/unlink-provider
 */
router.post('/api/account/unlink-provider', async (req, res) => {
  const { provider, providerUserId } = req.body;
  const authorization = req.headers.authorization;
  
  if (!authorization?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  try {
    const { verifyIdToken } = await import('../lib/firebaseAdmin');
    const decodedToken = await verifyIdToken(authorization.substring(7));
    
    await unlinkConnectedAccount(decodedToken.uid, provider, providerUserId);
    
    const result: LinkAccountResult = {
      success: true,
      provider: provider as 'wechat' | 'qq' | 'google',
      linked: false
    };
    res.json(result);
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message
    } as LinkAccountResult);
  }
});

export default router;
