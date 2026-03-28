/**
 * 用户服务
 * 管理用户档案、第三方账号绑定和 API Key
 */

import { getFirestore } from './firebaseAdmin';
import type { UserProfile, ConnectedAccount, AccountSecret } from '../types/auth';

function getDb() {
  return getFirestore();
}

/**
 * 创建或更新用户档案
 */
export async function createOrUpdateUserProfile(
  uid: string,
  data: Partial<UserProfile>
): Promise<UserProfile> {
  const userRef = getDb().collection('users').doc(uid);
  const now = Date.now();
  
  const existing = await userRef.get();
  const userData: UserProfile = existing.exists 
    ? { ...existing.data() as UserProfile, ...data, updatedAt: now }
    : {
        uid,
        displayName: data.displayName || '用户',
        avatarUrl: data.avatarUrl,
        primaryLoginProvider: data.primaryLoginProvider || 'google',
        email: data.email,
        phone: data.phone,
        createdAt: now,
        updatedAt: now,
        lastLoginAt: now,
        loginProviders: data.loginProviders || [data.primaryLoginProvider || 'google'],
        isActive: true,
        ...data
      };
  
  await userRef.set(userData, { merge: true });
  return userData;
}

/**
 * 获取用户档案
 */
export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const userDoc = await getDb().collection('users').doc(uid).get();
  return userDoc.exists ? (userDoc.data() as UserProfile) : null;
}

/**
 * 更新最后登录时间
 */
export async function updateLastLogin(uid: string): Promise<void> {
  await getDb().collection('users').doc(uid).update({
    lastLoginAt: Date.now()
  });
}

/**
 * 创建或更新第三方账号连接
 */
export async function createOrUpdateConnectedAccount(
  data: Omit<ConnectedAccount, 'linkedAt' | 'lastLoginAt'>
): Promise<ConnectedAccount> {
  const accountRef = getDb().collection('connected_accounts').doc(data.id);
  const now = Date.now();
  
  const accountData: ConnectedAccount = {
    ...data,
    linkedAt: (await accountRef.get()).exists 
      ? (await accountRef.get()).data()?.linkedAt || now 
      : now,
    lastLoginAt: now
  };
  
  await accountRef.set(accountData, { merge: true });
  return accountData;
}

/**
 * 根据第三方 provider ID 查找连接账号
 */
export async function findConnectedAccount(
  provider: string,
  providerUserId: string
): Promise<ConnectedAccount | null> {
  const accountId = `${provider}_${providerUserId}`;
  const accountDoc = await getDb().collection('connected_accounts').doc(accountId).get();
  return accountDoc.exists ? (accountDoc.data() as ConnectedAccount) : null;
}

/**
 * 获取用户的所有连接账号
 */
export async function getUserConnectedAccounts(
  firebaseUid: string
): Promise<ConnectedAccount[]> {
  const snapshot = await getDb()
    .collection('connected_accounts')
    .where('firebaseUid', '==', firebaseUid)
    .where('status', '==', 'active')
    .get();
  
  return snapshot.docs.map(doc => doc.data() as ConnectedAccount);
}

/**
 * 解绑第三方账号
 */
export async function unlinkConnectedAccount(
  firebaseUid: string,
  provider: string,
  providerUserId: string
): Promise<void> {
  const accountId = `${provider}_${providerUserId}`;
  const accountRef = getDb().collection('connected_accounts').doc(accountId);
  
  const account = await accountRef.get();
  if (!account.exists || account.data()?.firebaseUid !== firebaseUid) {
    throw new Error('Account not found or not owned by user');
  }
  
  // 检查是否是最后一个登录方式
  const userAccounts = await getUserConnectedAccounts(firebaseUid);
  if (userAccounts.length <= 1) {
    throw new Error('Cannot unlink the last login method');
  }
  
  await accountRef.update({ status: 'revoked' });
  
  // 更新用户档案中的登录方式列表
  const userRef = getDb().collection('users').doc(firebaseUid);
  const userData = await userRef.get();
  if (userData.exists) {
    const providers = userData.data()?.loginProviders || [];
    await userRef.update({
      loginProviders: providers.filter((p: string) => p !== provider)
    });
  }
}

/**
 * 获取用户的 API Key 配置
 */
export async function getAccountSecrets(uid: string): Promise<Partial<AccountSecret> | null> {
  const secretDoc = await getDb().collection('account_secrets').doc(uid).get();
  return secretDoc.exists ? (secretDoc.data() as AccountSecret) : null;
}

/**
 * 更新用户的 API Key 配置
 */
export async function updateAccountSecrets(
  uid: string,
  secrets: Partial<AccountSecret>
): Promise<void> {
  const secretRef = getDb().collection('account_secrets').doc(uid);
  await secretRef.set({
    ...secrets,
    updatedAt: Date.now()
  }, { merge: true });
}

/**
 * 根据第三方账号查找或创建用户
 * 这是第三方登录的核心逻辑
 */
export async function findOrCreateUserByProvider(
  provider: 'wechat' | 'qq' | 'google',
  providerUserId: string,
  userInfo: {
    displayName: string;
    avatarUrl?: string;
    email?: string;
    phone?: string;
  }
): Promise<{ user: UserProfile; isNewUser: boolean }> {
  // 1. 查找是否已有连接的账号
  const existingAccount = await findConnectedAccount(provider, providerUserId);
  
  if (existingAccount && existingAccount.status === 'active') {
    // 已有账号，更新登录时间并返回
    await updateLastLogin(existingAccount.firebaseUid);
    await createOrUpdateConnectedAccount({
      ...existingAccount,
      displayName: userInfo.displayName,
      avatarUrl: userInfo.avatarUrl
    });
    
    const userProfile = await getUserProfile(existingAccount.firebaseUid);
    if (userProfile) {
      return { user: userProfile, isNewUser: false };
    }
  }
  
  // 2. 创建新用户
  // 生成一个稳定的 uid（基于 provider 和 providerUserId 的 hash）
  const crypto = await import('crypto');
  const uid = crypto.createHash('sha256')
    .update(`${provider}:${providerUserId}`)
    .digest('hex')
    .substring(0, 28); // Firebase UID 最大 128 字节，我们取前 28 个字符
  
  // 创建用户档案
  const userProfile = await createOrUpdateUserProfile(uid, {
    displayName: userInfo.displayName,
    avatarUrl: userInfo.avatarUrl,
    email: userInfo.email,
    phone: userInfo.phone,
    primaryLoginProvider: provider,
    loginProviders: [provider]
  });
  
  // 创建连接账号记录
  await createOrUpdateConnectedAccount({
    id: `${provider}_${providerUserId}`,
    provider,
    providerUserId,
    firebaseUid: uid,
    displayName: userInfo.displayName,
    avatarUrl: userInfo.avatarUrl,
    status: 'active'
  });
  
  return { user: userProfile, isNewUser: true };
}
