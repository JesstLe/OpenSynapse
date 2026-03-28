type ApiKeyProvider = 'gemini' | 'openai' | 'minimax' | 'zhipu' | 'moonshot';

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

async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

export async function getUserApiKeys(): Promise<UserApiKeys | null> {
  try {
    const keys = await fetchWithAuth('/api/api-keys');
    const result: UserApiKeys = {};
    const providers: ApiKeyProvider[] = ['gemini', 'openai', 'minimax', 'zhipu', 'moonshot'];
    
    for (const provider of providers) {
      const key = keys[`${provider}ApiKey`];
      if (key) {
        result[provider] = { apiKey: key };
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
  const trimmedApiKey = apiKey.trim();
  if (!trimmedApiKey) {
    throw new Error('API Key 不能为空。');
  }

  await fetchWithAuth('/api/api-keys', {
    method: 'PUT',
    body: JSON.stringify({ [`${provider}ApiKey`]: trimmedApiKey }),
  });
}

export async function deleteUserApiKey(provider: string): Promise<void> {
  await fetchWithAuth('/api/api-keys', {
    method: 'PUT',
    body: JSON.stringify({ [`${provider}ApiKey`]: '' }),
  });
}
