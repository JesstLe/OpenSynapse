export interface AIModelOption {
  id: string;
  label: string;
  description: string;
}

export const DEFAULT_TEXT_MODEL = 'gemini-3-flash-preview';
export const EMBEDDING_MODEL = 'gemini-embedding-2-preview';
export const TEXT_MODEL_STORAGE_KEY = 'opensynapse.preferred-text-model';

export const AI_MODEL_OPTIONS: AIModelOption[] = [
  {
    id: 'gemini-3-flash-preview',
    label: 'Gemini 3 Flash',
    description: '默认模型。更强的多模态与 agentic 能力，官方模型页标记为 Preview。',
  },
  {
    id: 'gemini-3.1-pro-preview',
    label: 'Gemini 3.1 Pro',
    description: '更强推理与编码能力，适合复杂任务，官方模型页标记为 Preview。',
  },
  {
    id: 'gemini-2.5-pro',
    label: 'Gemini 2.5 Pro',
    description: '稳定版高阶推理模型，适合复杂长文与代码任务。',
  },
  {
    id: 'gemini-2.5-flash',
    label: 'Gemini 2.5 Flash',
    description: '稳定版高性价比模型，适合通用聊天和大规模处理。',
  },
  {
    id: 'gemini-2.5-flash-lite',
    label: 'Gemini 2.5 Flash-Lite',
    description: '稳定版低成本模型，适合轻量任务。',
  },
];

export const MODEL_FALLBACKS: Record<string, string[]> = {
  'gemini-3-flash-preview': ['gemini-2.5-flash', 'gemini-2.5-flash-lite'],
  'gemini-3.1-pro-preview': ['gemini-2.5-pro', 'gemini-2.5-flash-lite'],
  'gemini-2.5-pro': ['gemini-2.5-flash-lite'],
  'gemini-2.5-flash': ['gemini-2.5-flash-lite'],
};

function canUseLocalStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function normalizeModelId(value: string | null | undefined): string {
  const normalized = value?.trim();
  return normalized || DEFAULT_TEXT_MODEL;
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
  return AI_MODEL_OPTIONS.some((option) => option.id === modelId);
}

export function getModelOption(modelId: string): AIModelOption | undefined {
  return AI_MODEL_OPTIONS.find((option) => option.id === modelId);
}

export function getFallbackModels(modelId: string): string[] {
  return MODEL_FALLBACKS[modelId] || [];
}
