import { auth, db } from '../firebase';
import {
  Timestamp,
  deleteField,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

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
  updatedAt: Timestamp;
}

interface AccountSecretsDoc {
  apiKeys?: Partial<Record<ApiKeyProvider, ProviderApiKeyConfig>>;
  updatedAt?: Timestamp;
  geminiApiKey?: string;
  openaiApiKey?: string;
  openaiBaseUrl?: string;
  minimaxApiKey?: string;
  minimaxBaseUrl?: string;
  zhipuApiKey?: string;
  zhipuBaseUrl?: string;
  moonshotApiKey?: string;
  moonshotBaseUrl?: string;
}

function ensureAuthenticatedUid(): string {
  const uid = auth.currentUser?.uid;
  if (!uid) {
    throw new Error('请先登录后再管理 API Key。');
  }
  return uid;
}

function mapFirestoreError(error: unknown, fallbackMessage: string): Error {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = String((error as { code?: string }).code);
    if (code === 'permission-denied') {
      return new Error('没有权限访问 API Key，请确认登录状态或安全规则配置。');
    }
    if (code === 'unauthenticated') {
      return new Error('当前登录状态已失效，请重新登录后重试。');
    }
  }

  if (error instanceof Error && error.message) {
    return new Error(`${fallbackMessage}：${error.message}`);
  }
  return new Error(fallbackMessage);
}

function parseProvider(provider: string): ApiKeyProvider {
  if (!API_KEY_PROVIDERS.includes(provider as ApiKeyProvider)) {
    throw new Error(`不支持的 Provider：${provider}`);
  }
  return provider as ApiKeyProvider;
}

function normalizeApiKeys(data: AccountSecretsDoc): UserApiKeys | null {
  const nested = data.apiKeys;
  const normalized: Partial<UserApiKeys> = nested
    ? {
        gemini: nested.gemini,
        openai: nested.openai,
        minimax: nested.minimax,
        zhipu: nested.zhipu,
        moonshot: nested.moonshot,
      }
    : {
        gemini: data.geminiApiKey ? { apiKey: data.geminiApiKey } : undefined,
        openai: data.openaiApiKey
          ? { apiKey: data.openaiApiKey, baseUrl: data.openaiBaseUrl }
          : undefined,
        minimax: data.minimaxApiKey
          ? { apiKey: data.minimaxApiKey, baseUrl: data.minimaxBaseUrl }
          : undefined,
        zhipu: data.zhipuApiKey
          ? { apiKey: data.zhipuApiKey, baseUrl: data.zhipuBaseUrl }
          : undefined,
        moonshot: data.moonshotApiKey
          ? { apiKey: data.moonshotApiKey, baseUrl: data.moonshotBaseUrl }
          : undefined,
      };

  const hasAnyKey =
    Boolean(normalized.gemini?.apiKey) ||
    Boolean(normalized.openai?.apiKey) ||
    Boolean(normalized.minimax?.apiKey) ||
    Boolean(normalized.zhipu?.apiKey) ||
    Boolean(normalized.moonshot?.apiKey);

  if (!hasAnyKey) return null;

  return {
    ...normalized,
    updatedAt: data.updatedAt ?? Timestamp.now(),
  } as UserApiKeys;
}

export async function getUserApiKeys(): Promise<UserApiKeys | null> {
  const uid = ensureAuthenticatedUid();

  try {
    const ref = doc(db, 'account_secrets', uid);
    const snapshot = await getDoc(ref);
    if (!snapshot.exists()) {
      return null;
    }

    const data = snapshot.data() as AccountSecretsDoc;
    return normalizeApiKeys(data);
  } catch (error) {
    throw mapFirestoreError(error, '读取 API Key 失败');
  }
}

export async function saveUserApiKey(
  provider: string,
  apiKey: string,
  baseUrl?: string
): Promise<void> {
  const uid = ensureAuthenticatedUid();
  const normalizedProvider = parseProvider(provider);
  const trimmedApiKey = apiKey.trim();

  if (!trimmedApiKey) {
    throw new Error('API Key 不能为空。');
  }

  const payload: ProviderApiKeyConfig = {
    apiKey: trimmedApiKey,
    ...(baseUrl?.trim() ? { baseUrl: baseUrl.trim() } : {}),
  };

  try {
    const ref = doc(db, 'account_secrets', uid);
    try {
      await updateDoc(ref, {
        [`apiKeys.${normalizedProvider}`]: payload,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      const code = typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code?: string }).code)
        : '';
      if (code !== 'not-found') {
        throw error;
      }

      await setDoc(
        ref,
        {
          apiKeys: {
            [normalizedProvider]: payload,
          },
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    }
  } catch (error) {
    throw mapFirestoreError(error, '保存 API Key 失败');
  }
}

export async function deleteUserApiKey(provider: string): Promise<void> {
  const uid = ensureAuthenticatedUid();
  const normalizedProvider = parseProvider(provider);

  try {
    const ref = doc(db, 'account_secrets', uid);
    const snapshot = await getDoc(ref);
    if (!snapshot.exists()) {
      return;
    }

    await updateDoc(ref, {
      [`apiKeys.${normalizedProvider}`]: deleteField(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    throw mapFirestoreError(error, '删除 API Key 失败');
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
    const { getFirestore, getAuth } = await import('../lib/firebaseAdmin');

    await getAuth().getUser(uid);

    const serverDb = getFirestore();
    const snapshot = await serverDb.collection('account_secrets').doc(uid).get();
    if (!snapshot.exists) {
      return null;
    }

    const data = snapshot.data() as AccountSecretsDoc;
    if (data.apiKeys?.[normalizedProvider]?.apiKey) {
      return data.apiKeys[normalizedProvider]?.apiKey ?? null;
    }

    if (normalizedProvider === 'gemini') return data.geminiApiKey ?? null;
    if (normalizedProvider === 'openai') return data.openaiApiKey ?? null;
    if (normalizedProvider === 'minimax') return data.minimaxApiKey ?? null;
    if (normalizedProvider === 'zhipu') return data.zhipuApiKey ?? null;
    if (normalizedProvider === 'moonshot') return data.moonshotApiKey ?? null;

    return null;
  } catch (error) {
    if (error instanceof Error && error.message.includes('There is no user record')) {
      return null;
    }
    throw mapFirestoreError(error, '服务端读取 API Key 失败');
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
    const { getFirestore, getAuth } = await import('../lib/firebaseAdmin');

    await getAuth().getUser(uid);

    const serverDb = getFirestore();
    const snapshot = await serverDb.collection('account_secrets').doc(uid).get();
    if (!snapshot.exists) {
      return null;
    }

    const data = snapshot.data() as AccountSecretsDoc;
    const nestedConfig = data.apiKeys?.[normalizedProvider];
    if (nestedConfig?.apiKey) {
      return {
        apiKey: nestedConfig.apiKey,
        ...(nestedConfig.baseUrl ? { baseUrl: nestedConfig.baseUrl } : {}),
      };
    }

    if (normalizedProvider === 'gemini' && data.geminiApiKey) {
      return { apiKey: data.geminiApiKey };
    }
    if (normalizedProvider === 'openai' && data.openaiApiKey) {
      return {
        apiKey: data.openaiApiKey,
        ...(data.openaiBaseUrl ? { baseUrl: data.openaiBaseUrl } : {}),
      };
    }
    if (normalizedProvider === 'minimax' && data.minimaxApiKey) {
      return {
        apiKey: data.minimaxApiKey,
        ...(data.minimaxBaseUrl ? { baseUrl: data.minimaxBaseUrl } : {}),
      };
    }
    if (normalizedProvider === 'zhipu' && data.zhipuApiKey) {
      return {
        apiKey: data.zhipuApiKey,
        ...(data.zhipuBaseUrl ? { baseUrl: data.zhipuBaseUrl } : {}),
      };
    }
    if (normalizedProvider === 'moonshot' && data.moonshotApiKey) {
      return {
        apiKey: data.moonshotApiKey,
        ...(data.moonshotBaseUrl ? { baseUrl: data.moonshotBaseUrl } : {}),
      };
    }

    return null;
  } catch (error) {
    if (error instanceof Error && error.message.includes('There is no user record')) {
      return null;
    }
    throw mapFirestoreError(error, '服务端读取 API Key 配置失败');
  }
}
