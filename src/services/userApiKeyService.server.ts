import { apiKeyRepo } from '../repositories/apiKey.repo';

type ApiKeyProvider = 'gemini' | 'openai' | 'minimax' | 'zhipu' | 'moonshot';

export interface ProviderApiKeyConfig {
  apiKey: string;
  baseUrl?: string;
}

function parseProvider(provider: string): ApiKeyProvider {
  const providers: ApiKeyProvider[] = ['gemini', 'openai', 'minimax', 'zhipu', 'moonshot'];
  if (!providers.includes(provider as ApiKeyProvider)) {
    throw new Error(`不支持的 Provider：${provider}`);
  }
  return provider as ApiKeyProvider;
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
