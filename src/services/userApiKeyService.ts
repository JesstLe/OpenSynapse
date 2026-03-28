import { apiKeyRepo } from '../repositories/apiKey.repo';
import { authClient } from '../auth/client';

type ApiKeyProvider = 'gemini' | 'openai' | 'minimax' | 'zhipu' | 'moonshot';
const API_KEY_PROVIDERS: ApiKeyProvider[] = ['gemini', 'openai', 'minimax', 'zhipu', 'moonshot'];

export interface ProviderApiKeyConfig {
  apiKey: string;
  baseUrl?: string;
}

export interface UserApiKeys {
  gemini?: ProviderApiKeyConfig;
  openai?: ProviderApiKeyConfig;
  minimax?: ProviderApiKeyConfig;
  zhipu?: ProviderApiKeyConfig;
  moonshot?: ProviderApiKeyConfig;
}

async function getCurrentUserId(): Promise<string | null> {
  const { data } = await authClient.getSession();
  return data?.user?.id || null;
}

function parseProvider(provider: string): ApiKeyProvider {
  if (!API_KEY_PROVIDERS.includes(provider as ApiKeyProvider)) {
    throw new Error(`不支持的 Provider：${provider}`);
  }
  return provider as ApiKeyProvider;
}

export async function getUserApiKeys(): Promise<UserApiKeys | null> {
  const uid = await getCurrentUserId();
  if (!uid) {
    return null;
  }

  try {
    const keys = await apiKeyRepo.findByUser(uid);
    if (!keys || keys.length === 0) {
      return null;
    }

    const result: UserApiKeys = {};
    for (const key of keys) {
      const provider = key.provider as ApiKeyProvider;
      if (API_KEY_PROVIDERS.includes(provider)) {
        result[provider] = {
          apiKey: key.key,
        };
      }
    }

    return Object.keys(result).length > 0 ? result : null;
  } catch (error) {
    console.error('读取 API Key 失败:', error);
    return null;
  }
}

export async function saveUserApiKey(
  provider: string,
  apiKey: string,
  baseUrl?: string
): Promise<void> {
  const uid = await getCurrentUserId();
  if (!uid) {
    throw new Error('请先登录后再管理 API Key。');
  }

  const normalizedProvider = parseProvider(provider);
  const trimmedApiKey = apiKey.trim();

  if (!trimmedApiKey) {
    throw new Error('API Key 不能为空。');
  }

  try {
    const existing = await apiKeyRepo.findByUserAndProvider(uid, normalizedProvider);
    if (existing) {
      await apiKeyRepo.update(uid, normalizedProvider, trimmedApiKey);
    } else {
      await apiKeyRepo.create({
        id: crypto.randomUUID(),
        userId: uid,
        provider: normalizedProvider,
        key: trimmedApiKey,
      });
    }
  } catch (error) {
    throw new Error(`保存 API Key 失败：${error instanceof Error ? error.message : '未知错误'}`);
  }
}

export async function deleteUserApiKey(provider: string): Promise<void> {
  const uid = await getCurrentUserId();
  if (!uid) {
    throw new Error('请先登录后再管理 API Key。');
  }

  const normalizedProvider = parseProvider(provider);

  try {
    const existing = await apiKeyRepo.findByUserAndProvider(uid, normalizedProvider);
    if (existing) {
      await apiKeyRepo.delete(existing.id);
    }
  } catch (error) {
    throw new Error(`删除 API Key 失败：${error instanceof Error ? error.message : '未知错误'}`);
  }
}

export async function getApiKeyForServer(
  uid: string,
  provider: string
): Promise<string | null> {
  if (!uid) {
    throw new Error('缺少用户身份信息，无法读取 API Key。');
  }

  const normalizedProvider = parseProvider(provider);

  try {
    const key = await apiKeyRepo.findByUserAndProvider(uid, normalizedProvider);
    return key?.key || null;
  } catch (error) {
    console.error('服务端读取 API Key 失败:', error);
    return null;
  }
}

export async function getApiKeyConfigForServer(
  uid: string,
  provider: string
): Promise<ProviderApiKeyConfig | null> {
  if (!uid) {
    throw new Error('缺少用户身份信息，无法读取 API Key。');
  }

  const normalizedProvider = parseProvider(provider);

  try {
    const key = await apiKeyRepo.findByUserAndProvider(uid, normalizedProvider);
    if (!key) {
      return null;
    }

    return {
      apiKey: key.key,
    };
  } catch (error) {
    console.error('服务端读取 API Key 配置失败:', error);
    return null;
  }
}
