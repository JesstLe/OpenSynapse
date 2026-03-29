export type AIProviderId = 'gemini' | 'openai' | 'minimax' | 'zhipu' | 'moonshot';
export type AIProviderAuthMode = 'gemini_cli_oauth_or_api_key' | 'openai_codex_oauth_or_api_key' | 'api_key';
export type AIModelLifecycle = 'stable' | 'preview';
export type AIProviderProtocol = 'gemini_native' | 'openai_compat' | 'anthropic_compat';

export interface AIProviderDefinition {
  id: AIProviderId;
  label: string;
  authMode: AIProviderAuthMode;
  protocol: AIProviderProtocol;
  apiKeyEnvVar?: string;
  baseUrl?: string;
  baseUrlEnvVar?: string;
  docsUrl: string;
}

export interface AIModelOption {
  id: string;
  provider: AIProviderId;
  model: string;
  label: string;
  description: string;
  lifecycle: AIModelLifecycle;
  docsUrl: string;
  supportsVision?: boolean;
}

export const AI_PROVIDERS: Record<AIProviderId, AIProviderDefinition> = {
  gemini: {
    id: 'gemini',
    label: 'Google Gemini',
    authMode: 'gemini_cli_oauth_or_api_key',
    protocol: 'gemini_native',
    apiKeyEnvVar: 'GEMINI_API_KEY',
    docsUrl: 'https://ai.google.dev/gemini-api/docs/models/gemini',
  },
  openai: {
    id: 'openai',
    label: 'OpenAI',
    authMode: 'openai_codex_oauth_or_api_key',
    protocol: 'openai_compat',
    apiKeyEnvVar: 'OPENAI_API_KEY',
    baseUrl: 'https://api.openai.com/v1',
    baseUrlEnvVar: 'OPENAI_BASE_URL',
    docsUrl: 'https://platform.openai.com/docs/models',
  },
  minimax: {
    id: 'minimax',
    label: 'MiniMax',
    authMode: 'api_key',
    protocol: 'anthropic_compat',
    apiKeyEnvVar: 'MINIMAX_API_KEY',
    baseUrl: 'https://api.minimaxi.com/anthropic',
    baseUrlEnvVar: 'MINIMAX_BASE_URL',
    docsUrl: 'https://platform.minimax.io/docs/guide/Models/Text%20Models',
  },
  zhipu: {
    id: 'zhipu',
    label: 'Zhipu GLM',
    authMode: 'api_key',
    protocol: 'openai_compat',
    apiKeyEnvVar: 'ZHIPU_API_KEY',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    baseUrlEnvVar: 'ZHIPU_BASE_URL',
    docsUrl: 'https://open.bigmodel.cn/dev/api',
  },
  moonshot: {
    id: 'moonshot',
    label: 'Kimi Code',
    authMode: 'api_key',
    protocol: 'openai_compat',
    apiKeyEnvVar: 'MOONSHOT_API_KEY',
    baseUrl: 'https://api.kimi.com/coding/v1',
    baseUrlEnvVar: 'MOONSHOT_BASE_URL',
    docsUrl: 'https://www.kimi.com/code/docs/',
  },
};

export const DEFAULT_TEXT_MODEL = 'minimax/MiniMax-M2.7';
export const DEFAULT_STRUCTURED_MODEL = 'minimax/MiniMax-M2.7';
export const DEFAULT_EMBEDDING_MODEL = 'zhipu/embedding-3';
export const TEXT_MODEL_STORAGE_KEY = 'opensynapse.preferred-text-model';
export const STRUCTURED_MODEL_STORAGE_KEY = 'opensynapse.preferred-structured-model';
export const EMBEDDING_MODEL_STORAGE_KEY = 'opensynapse.preferred-embedding-model';

export const AI_MODEL_OPTIONS: AIModelOption[] = [
  {
    id: 'gemini/gemini-3-flash-preview',
    provider: 'gemini',
    model: 'gemini-3-flash-preview',
    label: 'Gemini 3 Flash',
    description: 'Google Preview 模型，适合多模态与 agentic 场景。',
    lifecycle: 'preview',
    docsUrl: 'https://ai.google.dev/gemini-api/docs/models/gemini-3-flash-preview',
    supportsVision: true,
  },
  {
    id: 'gemini/gemini-3.1-pro-preview',
    provider: 'gemini',
    model: 'gemini-3.1-pro-preview',
    label: 'Gemini 3.1 Pro',
    description: 'Google Preview 推理模型，适合复杂代码与长上下文任务。',
    lifecycle: 'preview',
    docsUrl: 'https://ai.google.dev/gemini-api/docs/models/gemini-3.1-pro-preview',
    supportsVision: true,
  },
  {
    id: 'gemini/gemini-2.5-pro',
    provider: 'gemini',
    model: 'gemini-2.5-pro',
    label: 'Gemini 2.5 Pro',
    description: 'Google 稳定版高阶推理模型。',
    lifecycle: 'stable',
    docsUrl: 'https://ai.google.dev/gemini-api/docs/models/gemini-2.5-pro',
    supportsVision: true,
  },
  {
    id: 'gemini/gemini-2.5-flash',
    provider: 'gemini',
    model: 'gemini-2.5-flash',
    label: 'Gemini 2.5 Flash',
    description: 'Google 稳定版高性价比模型，适合作为默认聊天模型。',
    lifecycle: 'stable',
    docsUrl: 'https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash',
    supportsVision: true,
  },
  {
    id: 'gemini/gemini-2.5-flash-lite',
    provider: 'gemini',
    model: 'gemini-2.5-flash-lite',
    label: 'Gemini 2.5 Flash-Lite',
    description: 'Google 稳定版低成本模型，适合轻量任务。',
    lifecycle: 'stable',
    docsUrl: 'https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash-lite',
    supportsVision: true,
  },
  {
    id: 'openai/gpt-5.2',
    provider: 'openai',
    model: 'gpt-5.2',
    label: 'GPT-5.2',
    description: 'OpenAI GPT-5 通用模型，支持 Codex OAuth 或 API key。',
    lifecycle: 'stable',
    docsUrl: 'https://platform.openai.com/docs/models',
    supportsVision: true,
  },
  {
    id: 'openai/gpt-5.2-codex',
    provider: 'openai',
    model: 'gpt-5.2-codex',
    label: 'GPT-5.2 Codex',
    description: 'Codex 优化模型，适合代码与 agent 场景，支持 OpenAI Codex OAuth。',
    lifecycle: 'stable',
    docsUrl: 'https://github.com/openai/codex',
    supportsVision: true,
  },
  {
    id: 'openai/gpt-5.1',
    provider: 'openai',
    model: 'gpt-5.1',
    label: 'GPT-5.1',
    description: 'OpenAI GPT-5.1 通用模型，支持 Codex OAuth 或 API key。',
    lifecycle: 'stable',
    docsUrl: 'https://github.com/openai/codex',
    supportsVision: true,
  },
  {
    id: 'openai/gpt-5.1-codex-max',
    provider: 'openai',
    model: 'gpt-5.1-codex-max',
    label: 'GPT-5.1 Codex Max',
    description: 'Codex Max 档位，适合复杂代码任务，支持 OpenAI Codex OAuth。',
    lifecycle: 'stable',
    docsUrl: 'https://github.com/openai/codex',
    supportsVision: true,
  },
  {
    id: 'openai/gpt-5.1-codex',
    provider: 'openai',
    model: 'gpt-5.1-codex',
    label: 'GPT-5.1 Codex',
    description: 'Codex 模型，适合代码审查与多步操作，支持 OpenAI Codex OAuth。',
    lifecycle: 'stable',
    docsUrl: 'https://github.com/openai/codex',
    supportsVision: true,
  },
  {
    id: 'openai/gpt-5.1-codex-mini',
    provider: 'openai',
    model: 'gpt-5.1-codex-mini',
    label: 'GPT-5.1 Codex Mini',
    description: 'Codex 轻量版本，支持 OpenAI Codex OAuth。',
    lifecycle: 'stable',
    docsUrl: 'https://github.com/openai/codex',
    supportsVision: true,
  },
  {
    id: 'openai/gpt-5.4',
    provider: 'openai',
    model: 'gpt-5.4',
    label: 'GPT-5.4',
    description: 'OpenAI 最新 GPT-5.4 通用模型，更强的推理与代码能力。',
    lifecycle: 'stable',
    docsUrl: 'https://platform.openai.com/docs/models',
    supportsVision: true,
  },
  {
    id: 'openai/gpt-5.3',
    provider: 'openai',
    model: 'gpt-5.3',
    label: 'GPT-5.3',
    description: 'OpenAI GPT-5.3 通用模型，平衡性能与成本。',
    lifecycle: 'stable',
    docsUrl: 'https://platform.openai.com/docs/models',
    supportsVision: true,
  },
  {
    id: 'openai/gpt-5.3-codex',
    provider: 'openai',
    model: 'gpt-5.3-codex',
    label: 'GPT-5.3 Codex',
    description: 'GPT-5.3 Codex 代码优化版，适合中等复杂度代码任务。',
    lifecycle: 'stable',
    docsUrl: 'https://github.com/openai/codex',
    supportsVision: true,
  },
  {
    id: 'openai/gpt-5.2-pro',
    provider: 'openai',
    model: 'gpt-5.2-pro',
    label: 'GPT-5.2 Pro',
    description: 'OpenAI 平台 API 档位，当前建议走 API key。',
    lifecycle: 'stable',
    docsUrl: 'https://platform.openai.com/docs/models',
    supportsVision: true,
  },
  {
    id: 'openai/gpt-5-mini',
    provider: 'openai',
    model: 'gpt-5-mini',
    label: 'GPT-5 Mini',
    description: 'OpenAI 轻量 GPT-5 模型，当前建议走 API key。',
    lifecycle: 'stable',
    docsUrl: 'https://platform.openai.com/docs/models',
    supportsVision: true,
  },
  {
    id: 'minimax/MiniMax-M2.7',
    provider: 'minimax',
    model: 'MiniMax-M2.7',
    label: 'MiniMax M2.7',
    description: 'MiniMax 最新主力文本模型，更强的推理与多语言能力。',
    lifecycle: 'stable',
    docsUrl: 'https://platform.minimax.io/docs/guide/Models/Text%20Models',
  },
  {
    id: 'zhipu/glm-5',
    provider: 'zhipu',
    model: 'glm-5',
    label: 'GLM-5',
    description: '智谱当前官方主力通用模型。',
    lifecycle: 'stable',
    docsUrl: 'https://open.bigmodel.cn/dev/api',
  },
  {
    id: 'zhipu/glm-4.7',
    provider: 'zhipu',
    model: 'glm-4.7',
    label: 'GLM-4.7',
    description: '智谱稳定可用的次级 fallback。',
    lifecycle: 'stable',
    docsUrl: 'https://open.bigmodel.cn/dev/api',
  },
  {
    id: 'zhipu/glm-4.6v',
    provider: 'zhipu',
    model: 'glm-4.6v',
    label: 'GLM-4.6V',
    description: '智谱视觉推理模型，支持图片理解。',
    lifecycle: 'stable',
    docsUrl: 'https://open.bigmodel.cn/dev/api',
    supportsVision: true,
  },
  {
    id: 'moonshot/kimi-for-coding',
    provider: 'moonshot',
    model: 'kimi-for-coding',
    label: 'Kimi for Coding',
    description: 'Kimi Code 编程专用模型，最高 100 Tokens/s，支持推理。',
    lifecycle: 'stable',
    docsUrl: 'https://www.kimi.com/code/docs/',
  },
];

export const EMBEDDING_MODEL_OPTIONS: AIModelOption[] = [
  {
    id: 'gemini/gemini-embedding-2-preview',
    provider: 'gemini',
    model: 'gemini-embedding-2-preview',
    label: 'Gemini Embedding 2',
    description: '用于语义搜索、知识链接与 RAG 的向量模型。',
    lifecycle: 'preview',
    docsUrl: 'https://ai.google.dev/gemini-api/docs/embeddings',
  },
  {
    id: 'openai/text-embedding-3-small',
    provider: 'openai',
    model: 'text-embedding-3-small',
    label: 'OpenAI Text Embedding 3 Small',
    description: 'OpenAI 高性价比 embedding 模型，1536 维，适合大规模语义搜索。',
    lifecycle: 'stable',
    docsUrl: 'https://platform.openai.com/docs/guides/embeddings',
  },
  {
    id: 'openai/text-embedding-3-large',
    provider: 'openai',
    model: 'text-embedding-3-large',
    label: 'OpenAI Text Embedding 3 Large',
    description: 'OpenAI 高精度 embedding 模型，3072 维，适合精度优先场景。',
    lifecycle: 'stable',
    docsUrl: 'https://platform.openai.com/docs/guides/embeddings',
  },
  {
    id: 'zhipu/embedding-3',
    provider: 'zhipu',
    model: 'embedding-3',
    label: '智谱 Embedding 3',
    description: '智谱 GLM embedding 模型，2048 维，中文语义表现优秀。',
    lifecycle: 'stable',
    docsUrl: 'https://open.bigmodel.cn/dev/api/vector/embedding-3',
  },
];

export const MODEL_FALLBACKS: Record<string, string[]> = {
  'gemini/gemini-3-flash-preview': ['gemini/gemini-2.5-flash', 'gemini/gemini-2.5-flash-lite'],
  'gemini/gemini-3.1-pro-preview': ['gemini/gemini-2.5-pro', 'gemini/gemini-2.5-flash-lite'],
  'gemini/gemini-2.5-pro': ['gemini/gemini-2.5-flash-lite'],
  'gemini/gemini-2.5-flash': ['gemini/gemini-2.5-flash-lite'],
  'openai/gpt-5.2': ['openai/gpt-5.1', 'openai/gpt-5-mini'],
  'openai/gpt-5.2-codex': ['openai/gpt-5.1-codex', 'openai/gpt-5-mini'],
  'openai/gpt-5.1': ['openai/gpt-5-mini'],
  'openai/gpt-5.1-codex-max': ['openai/gpt-5.1-codex', 'openai/gpt-5-mini'],
  'openai/gpt-5.1-codex': ['openai/gpt-5.1-codex-mini', 'openai/gpt-5-mini'],
  'openai/gpt-5.1-codex-mini': ['openai/gpt-5-mini'],
  'openai/gpt-5.4': ['openai/gpt-5.3', 'openai/gpt-5.2', 'openai/gpt-5.1', 'openai/gpt-5-mini'],
  'openai/gpt-5.3': ['openai/gpt-5.2', 'openai/gpt-5.1', 'openai/gpt-5-mini'],
  'openai/gpt-5.3-codex': ['openai/gpt-5.2-codex', 'openai/gpt-5.1-codex', 'openai/gpt-5-mini'],
  'openai/gpt-5.2-pro': ['openai/gpt-5.2', 'openai/gpt-5-mini'],
  'minimax/MiniMax-M2.7': [],
  'zhipu/glm-5': ['zhipu/glm-4.7', 'zhipu/glm-4.6v'],
};

const LEGACY_MODEL_ALIASES: Record<string, string> = Object.fromEntries(
  AI_MODEL_OPTIONS.map((option) => [option.model, option.id])
);

function canUseLocalStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function inferProviderFromModelName(modelName: string): AIProviderId {
  if (modelName.startsWith('gpt-')) return 'openai';
  if (modelName.startsWith('MiniMax-')) return 'minimax';
  if (modelName.startsWith('glm-') || modelName.startsWith('GLM-')) return 'zhipu';
  if (modelName.startsWith('kimi-')) return 'moonshot';
  return 'gemini';
}

export function parseModelSelection(value: string | null | undefined): {
  canonicalId: string;
  provider: AIProviderId;
  model: string;
} {
  const normalized = value?.trim();
  if (!normalized) {
    return { canonicalId: DEFAULT_TEXT_MODEL, provider: 'minimax', model: 'MiniMax-M2.7' };
  }

  if (normalized.includes('/')) {
    const [providerPart, ...modelParts] = normalized.split('/');
    const provider = providerPart as AIProviderId;
    const model = modelParts.join('/').trim();
    if (provider in AI_PROVIDERS && model) {
      return {
        canonicalId: `${provider}/${model}`,
        provider,
        model,
      };
    }
  }

  const aliased = LEGACY_MODEL_ALIASES[normalized];
  if (aliased) {
    return parseModelSelection(aliased);
  }

  const inferredProvider = inferProviderFromModelName(normalized);
  return {
    canonicalId: `${inferredProvider}/${normalized}`,
    provider: inferredProvider,
    model: normalized,
  };
}

export function normalizeModelId(value: string | null | undefined): string {
  return parseModelSelection(value).canonicalId;
}

export function getApiModelId(value: string | null | undefined): string {
  return parseModelSelection(value).model;
}

export function getProviderForModel(value: string | null | undefined): AIProviderDefinition {
  const parsed = parseModelSelection(value);
  return AI_PROVIDERS[parsed.provider];
}

export function getResolvedProviderConfig(value: string | null | undefined): AIProviderDefinition {
  const provider = getProviderForModel(value);
  const overrideBaseUrl = provider.baseUrlEnvVar ? process.env[provider.baseUrlEnvVar]?.trim() : '';
  return {
    ...provider,
    baseUrl: overrideBaseUrl || provider.baseUrl,
  };
}

export function getPreferredTextModel(): string {
  if (!canUseLocalStorage()) {
    return DEFAULT_TEXT_MODEL;
  }

  return normalizeModelId(window.localStorage.getItem(TEXT_MODEL_STORAGE_KEY));
}

export function getPreferredStructuredModel(): string {
  if (!canUseLocalStorage()) {
    return DEFAULT_STRUCTURED_MODEL;
  }

  return normalizeModelId(window.localStorage.getItem(STRUCTURED_MODEL_STORAGE_KEY));
}

export function getPreferredEmbeddingModel(): string {
  if (!canUseLocalStorage()) {
    return DEFAULT_EMBEDDING_MODEL;
  }

  const saved = window.localStorage.getItem(EMBEDDING_MODEL_STORAGE_KEY);
  if (!saved) {
    return DEFAULT_EMBEDDING_MODEL;
  }

  const normalized = normalizeModelId(saved);
  return EMBEDDING_MODEL_OPTIONS.some((option) => option.id === normalized)
    ? normalized
    : DEFAULT_EMBEDDING_MODEL;
}

export function setPreferredTextModel(modelId: string): string {
  const normalized = normalizeModelId(modelId);
  if (canUseLocalStorage()) {
    window.localStorage.setItem(TEXT_MODEL_STORAGE_KEY, normalized);
  }
  return normalized;
}

export function setPreferredStructuredModel(modelId: string): string {
  const normalized = normalizeModelId(modelId);
  if (canUseLocalStorage()) {
    window.localStorage.setItem(STRUCTURED_MODEL_STORAGE_KEY, normalized);
  }
  return normalized;
}

export function setPreferredEmbeddingModel(modelId: string): string {
  const normalized = normalizeModelId(modelId);
  const safeValue = EMBEDDING_MODEL_OPTIONS.some((option) => option.id === normalized)
    ? normalized
    : DEFAULT_EMBEDDING_MODEL;

  if (canUseLocalStorage()) {
    window.localStorage.setItem(EMBEDDING_MODEL_STORAGE_KEY, safeValue);
  }
  return safeValue;
}

export function isKnownTextModel(modelId: string): boolean {
  const normalized = normalizeModelId(modelId);
  return AI_MODEL_OPTIONS.some((option) => option.id === normalized);
}

export function getModelOption(modelId: string): AIModelOption | undefined {
  const normalized = normalizeModelId(modelId);
  return AI_MODEL_OPTIONS.find((option) => option.id === normalized);
}

export function getFallbackSelectionIds(modelId: string): string[] {
  const normalized = normalizeModelId(modelId);
  return MODEL_FALLBACKS[normalized] || [];
}

export function getFallbackModels(modelId: string): string[] {
  return getFallbackSelectionIds(modelId).map((selectionId) => getApiModelId(selectionId));
}

export function getProviderLabel(modelId: string): string {
  return getProviderForModel(modelId).label;
}
