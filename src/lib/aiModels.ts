export type AIProviderId = 'gemini' | 'openai' | 'minimax' | 'zhipu' | 'moonshot';
export type AIProviderAuthMode = 'gemini_cli_oauth_or_api_key' | 'api_key';
export type AIModelLifecycle = 'stable' | 'preview';

export interface AIProviderDefinition {
  id: AIProviderId;
  label: string;
  authMode: AIProviderAuthMode;
  apiKeyEnvVar?: string;
  baseUrl?: string;
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
}

export const AI_PROVIDERS: Record<AIProviderId, AIProviderDefinition> = {
  gemini: {
    id: 'gemini',
    label: 'Google Gemini',
    authMode: 'gemini_cli_oauth_or_api_key',
    apiKeyEnvVar: 'GEMINI_API_KEY',
    docsUrl: 'https://ai.google.dev/gemini-api/docs/models/gemini',
  },
  openai: {
    id: 'openai',
    label: 'OpenAI',
    authMode: 'api_key',
    apiKeyEnvVar: 'OPENAI_API_KEY',
    baseUrl: 'https://api.openai.com/v1',
    docsUrl: 'https://platform.openai.com/docs/models',
  },
  minimax: {
    id: 'minimax',
    label: 'MiniMax',
    authMode: 'api_key',
    apiKeyEnvVar: 'MINIMAX_API_KEY',
    baseUrl: 'https://api.minimax.io/v1',
    docsUrl: 'https://platform.minimax.io/docs/guide/Models/Text%20Models',
  },
  zhipu: {
    id: 'zhipu',
    label: 'Zhipu GLM',
    authMode: 'api_key',
    apiKeyEnvVar: 'ZHIPU_API_KEY',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    docsUrl: 'https://open.bigmodel.cn/dev/api',
  },
  moonshot: {
    id: 'moonshot',
    label: 'Moonshot Kimi',
    authMode: 'api_key',
    apiKeyEnvVar: 'MOONSHOT_API_KEY',
    baseUrl: 'https://api.moonshot.cn/v1',
    docsUrl: 'https://platform.moonshot.ai/docs',
  },
};

export const DEFAULT_TEXT_MODEL = 'gemini/gemini-2.5-flash';
export const DEFAULT_STRUCTURED_MODEL = 'gemini/gemini-2.5-flash';
export const EMBEDDING_MODEL = 'gemini-embedding-2-preview';
export const TEXT_MODEL_STORAGE_KEY = 'opensynapse.preferred-text-model';

export const AI_MODEL_OPTIONS: AIModelOption[] = [
  {
    id: 'gemini/gemini-3-flash-preview',
    provider: 'gemini',
    model: 'gemini-3-flash-preview',
    label: 'Gemini 3 Flash',
    description: 'Google Preview 模型，适合多模态与 agentic 场景。',
    lifecycle: 'preview',
    docsUrl: 'https://ai.google.dev/gemini-api/docs/models/gemini-3-flash-preview',
  },
  {
    id: 'gemini/gemini-3.1-pro-preview',
    provider: 'gemini',
    model: 'gemini-3.1-pro-preview',
    label: 'Gemini 3.1 Pro',
    description: 'Google Preview 推理模型，适合复杂代码与长上下文任务。',
    lifecycle: 'preview',
    docsUrl: 'https://ai.google.dev/gemini-api/docs/models/gemini-3.1-pro-preview',
  },
  {
    id: 'gemini/gemini-2.5-pro',
    provider: 'gemini',
    model: 'gemini-2.5-pro',
    label: 'Gemini 2.5 Pro',
    description: 'Google 稳定版高阶推理模型。',
    lifecycle: 'stable',
    docsUrl: 'https://ai.google.dev/gemini-api/docs/models/gemini-2.5-pro',
  },
  {
    id: 'gemini/gemini-2.5-flash',
    provider: 'gemini',
    model: 'gemini-2.5-flash',
    label: 'Gemini 2.5 Flash',
    description: 'Google 稳定版高性价比模型，适合作为默认聊天模型。',
    lifecycle: 'stable',
    docsUrl: 'https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash',
  },
  {
    id: 'gemini/gemini-2.5-flash-lite',
    provider: 'gemini',
    model: 'gemini-2.5-flash-lite',
    label: 'Gemini 2.5 Flash-Lite',
    description: 'Google 稳定版低成本模型，适合轻量任务。',
    lifecycle: 'stable',
    docsUrl: 'https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash-lite',
  },
  {
    id: 'openai/gpt-5.2',
    provider: 'openai',
    model: 'gpt-5.2',
    label: 'GPT-5.2',
    description: 'OpenAI 当前官方模型页列出的最新 GPT-5 主力模型。',
    lifecycle: 'stable',
    docsUrl: 'https://platform.openai.com/docs/models',
  },
  {
    id: 'openai/gpt-5.2-pro',
    provider: 'openai',
    model: 'gpt-5.2-pro',
    label: 'GPT-5.2 Pro',
    description: 'OpenAI 更强推理档位，适合高复杂度任务。',
    lifecycle: 'stable',
    docsUrl: 'https://platform.openai.com/docs/models',
  },
  {
    id: 'openai/gpt-5-mini',
    provider: 'openai',
    model: 'gpt-5-mini',
    label: 'GPT-5 Mini',
    description: 'OpenAI 轻量 GPT-5 模型，适合低延迟聊天。',
    lifecycle: 'stable',
    docsUrl: 'https://platform.openai.com/docs/models',
  },
  {
    id: 'minimax/MiniMax-M2.5',
    provider: 'minimax',
    model: 'MiniMax-M2.5',
    label: 'MiniMax M2.5',
    description: 'MiniMax 当前官方文档中的主力文本模型。',
    lifecycle: 'stable',
    docsUrl: 'https://platform.minimax.io/docs/guide/Models/Text%20Models',
  },
  {
    id: 'minimax/MiniMax-M2.5-highspeed',
    provider: 'minimax',
    model: 'MiniMax-M2.5-highspeed',
    label: 'MiniMax M2.5 Highspeed',
    description: 'MiniMax 低延迟版本，适合作为降级 fallback。',
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
    id: 'moonshot/kimi-k2-thinking',
    provider: 'moonshot',
    model: 'kimi-k2-thinking',
    label: 'Kimi K2 Thinking',
    description: 'Moonshot 当前官方推理模型。',
    lifecycle: 'stable',
    docsUrl: 'https://platform.moonshot.ai/docs',
  },
  {
    id: 'moonshot/kimi-k2-thinking-turbo',
    provider: 'moonshot',
    model: 'kimi-k2-thinking-turbo',
    label: 'Kimi K2 Thinking Turbo',
    description: 'Moonshot 低延迟推理模型。',
    lifecycle: 'stable',
    docsUrl: 'https://platform.moonshot.ai/docs',
  },
  {
    id: 'moonshot/kimi-k2-0905-preview',
    provider: 'moonshot',
    model: 'kimi-k2-0905-preview',
    label: 'Kimi K2 0905 Preview',
    description: 'Moonshot 官方 K2 预览版，适合尝鲜新能力。',
    lifecycle: 'preview',
    docsUrl: 'https://platform.moonshot.ai/docs',
  },
  {
    id: 'moonshot/kimi-k2-turbo-preview',
    provider: 'moonshot',
    model: 'kimi-k2-turbo-preview',
    label: 'Kimi K2 Turbo Preview',
    description: 'Moonshot 预览低延迟模型。',
    lifecycle: 'preview',
    docsUrl: 'https://platform.moonshot.ai/docs',
  },
];

export const MODEL_FALLBACKS: Record<string, string[]> = {
  'gemini/gemini-3-flash-preview': ['gemini/gemini-2.5-flash', 'gemini/gemini-2.5-flash-lite'],
  'gemini/gemini-3.1-pro-preview': ['gemini/gemini-2.5-pro', 'gemini/gemini-2.5-flash-lite'],
  'gemini/gemini-2.5-pro': ['gemini/gemini-2.5-flash-lite'],
  'gemini/gemini-2.5-flash': ['gemini/gemini-2.5-flash-lite'],
  'openai/gpt-5.2': ['openai/gpt-5-mini'],
  'openai/gpt-5.2-pro': ['openai/gpt-5.2', 'openai/gpt-5-mini'],
  'minimax/MiniMax-M2.5': ['minimax/MiniMax-M2.5-highspeed'],
  'zhipu/glm-5': ['zhipu/glm-4.7'],
  'moonshot/kimi-k2-thinking': ['moonshot/kimi-k2-thinking-turbo', 'moonshot/kimi-k2-0905-preview'],
  'moonshot/kimi-k2-0905-preview': ['moonshot/kimi-k2-turbo-preview'],
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
    return { canonicalId: DEFAULT_TEXT_MODEL, provider: 'gemini', model: 'gemini-2.5-flash' };
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

export function getPreferredTextModel(): string {
  if (!canUseLocalStorage()) {
    return DEFAULT_TEXT_MODEL;
  }

  return normalizeModelId(window.localStorage.getItem(TEXT_MODEL_STORAGE_KEY));
}

export function setPreferredTextModel(modelId: string): string {
  const normalized = normalizeModelId(modelId);
  if (canUseLocalStorage()) {
    window.localStorage.setItem(TEXT_MODEL_STORAGE_KEY, normalized);
  }
  return normalized;
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
