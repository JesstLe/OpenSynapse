import { GoogleGenAI } from '@google/genai';
import { DEFAULT_EMBEDDING_MODEL, getPreferredEmbeddingModel, parseModelSelection } from '../lib/aiModels.js';
import { embedContentWithApiKeyProvider } from '../lib/providerGateway.js';

type SupportedProvider = 'gemini' | 'openai' | 'minimax' | 'zhipu' | 'moonshot';

const PROVIDER_ENV_KEY: Record<SupportedProvider, string> = {
  gemini: 'GEMINI_API_KEY',
  openai: 'OPENAI_API_KEY',
  minimax: 'MINIMAX_API_KEY',
  zhipu: 'ZHIPU_API_KEY',
  moonshot: 'MOONSHOT_API_KEY',
};

const PROVIDER_BASE_URL_ENV_KEY: Partial<Record<SupportedProvider, string>> = {
  openai: 'OPENAI_BASE_URL',
  minimax: 'MINIMAX_BASE_URL',
  zhipu: 'ZHIPU_BASE_URL',
  moonshot: 'MOONSHOT_BASE_URL',
};

export type EmbeddingCredentials = {
  apiKey?: string | null;
  baseUrl?: string | null;
};

export type EmbeddingResult = {
  values: number[];
  degraded?: boolean;
  reason?: string;
};

function normalizeContents(contents: string[]): string[] {
  const normalized = Array.isArray(contents)
    ? contents.map((item) => (typeof item === 'string' ? item : String(item ?? '')))
    : [];
  return normalized.length > 0 ? normalized : [''];
}

function normalizeApiKey(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed || null;
}

function normalizeBaseUrl(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed || null;
}

async function withProviderCredentials<T>(
  provider: SupportedProvider,
  credentials: EmbeddingCredentials | undefined,
  operation: () => Promise<T>
): Promise<T> {
  const envVar = PROVIDER_ENV_KEY[provider];
  const baseUrlEnvVar = PROVIDER_BASE_URL_ENV_KEY[provider];
  const originalApiKey = process.env[envVar];
  const originalBaseUrl = baseUrlEnvVar ? process.env[baseUrlEnvVar] : undefined;

  const scopedApiKey = normalizeApiKey(credentials?.apiKey);
  const scopedBaseUrl = normalizeBaseUrl(credentials?.baseUrl);

  try {
    if (scopedApiKey) {
      process.env[envVar] = scopedApiKey;
    }

    if (baseUrlEnvVar && scopedBaseUrl) {
      process.env[baseUrlEnvVar] = scopedBaseUrl;
    }

    return await operation();
  } finally {
    if (typeof originalApiKey === 'undefined') {
      delete process.env[envVar];
    } else {
      process.env[envVar] = originalApiKey;
    }

    if (baseUrlEnvVar) {
      if (typeof originalBaseUrl === 'undefined') {
        delete process.env[baseUrlEnvVar];
      } else {
        process.env[baseUrlEnvVar] = originalBaseUrl;
      }
    }
  }
}

export async function generateEmbeddingsServer(
  contents: string[],
  modelId?: string,
  credentials?: EmbeddingCredentials
): Promise<EmbeddingResult> {
  const normalizedContents = normalizeContents(contents);
  const resolvedModel = modelId?.trim() || getPreferredEmbeddingModel() || DEFAULT_EMBEDDING_MODEL;
  const parsed = parseModelSelection(resolvedModel);

  if (parsed.provider === 'gemini') {
    const apiKey = normalizeApiKey(credentials?.apiKey) || normalizeApiKey(process.env.GEMINI_API_KEY);
    if (!apiKey) {
      return {
        values: [],
        degraded: true,
        reason: '当前服务端未配置可用的 Gemini API Key，embedding 已优雅降级。',
      };
    }

    try {
      const client = new GoogleGenAI({ apiKey });
      const response = await client.models.embedContent({
        model: parsed.model,
        contents: normalizedContents,
      });

      const values = response?.embeddings?.[0]?.values;
      if (!Array.isArray(values)) {
        return {
          values: [],
          degraded: true,
          reason: 'Gemini embedding 响应格式异常，未返回有效向量。',
        };
      }

      return { values };
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Gemini embedding 调用失败';
      console.warn('[Embedding] Gemini embedding failed:', error);
      return {
        values: [],
        degraded: true,
        reason,
      };
    }
  }

  try {
    const result = await withProviderCredentials(parsed.provider, credentials, async () => {
      return embedContentWithApiKeyProvider({
        model: parsed.canonicalId,
        contents: normalizedContents,
      });
    });

    const values = result?.embeddings?.[0]?.values;
    if (!Array.isArray(values)) {
      return {
        values: [],
        degraded: true,
        reason: `${parsed.provider} embedding 响应格式异常，未返回有效向量。`,
      };
    }

    return { values };
  } catch (error) {
    const reason = error instanceof Error ? error.message : `${parsed.provider} embedding 调用失败`;
    console.warn(`[Embedding] ${parsed.provider} embedding failed:`, error);
    return {
      values: [],
      degraded: true,
      reason,
    };
  }
}
