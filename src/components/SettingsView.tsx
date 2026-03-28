import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  KeyRound,
  Save,
  RefreshCw,
  ShieldCheck,
  ExternalLink,
  CheckCircle2,
  CircleOff,
  LogIn,
  LogOut,
  BrainCircuit,
  Sigma,
  Gavel,
  TrendingUp,
  Sparkles,
  ShieldAlert,
  MessageSquare,
  Plus,
  Trash2,
  Edit3,
  X,
  User as UserIcon,
  Globe
} from 'lucide-react';
import {
  AI_MODEL_OPTIONS,
  AI_PROVIDERS,
  EMBEDDING_MODEL_OPTIONS,
  getPreferredEmbeddingModel,
  getPreferredStructuredModel,
  setPreferredEmbeddingModel as persistPreferredEmbeddingModel,
  setPreferredStructuredModel as persistPreferredStructuredModel,
} from '../lib/aiModels';
import { Note, Flashcard, ChatSession, Persona } from '../types';
import { DEFAULT_PERSONA_ID } from '../lib/personas';
import { cn } from '../lib/utils';
import { User } from 'firebase/auth';
import {
  getUserApiKeys,
  saveUserApiKey,
  deleteUserApiKey,
  UserApiKeys,
} from '../services/userApiKeyService';

type ProviderStatus = {
  key: string;
  configured: boolean;
  valuePreview: string;
};

type OpenAIOAuthStatus = {
  configured: boolean;
  source: 'opensynapse' | 'codex' | null;
  email: string | null;
  accountId: string | null;
  expiresAt: number | null;
  planType: string | null;
  loginStatus: 'idle' | 'pending' | 'success' | 'error';
  authUrl: string | null;
  error: string | null;
  completedAt: number | null;
};

const PROVIDER_SETTINGS = [
  {
    providerId: 'gemini' as const,
    title: 'Google Gemini',
    envVar: 'GEMINI_API_KEY',
    baseUrlEnvVar: null,
    placeholder: 'AIza...',
    description: '仅在你不想使用 Gemini CLI / Code Assist OAuth 时需要。',
  },
  {
    providerId: 'openai' as const,
    title: 'OpenAI',
    envVar: 'OPENAI_API_KEY',
    baseUrlEnvVar: 'OPENAI_BASE_URL',
    placeholder: 'sk-...',
    description: '支持 Codex OAuth 或 API key。Codex OAuth 更适合个人开发，API key 更适合稳定生产调用。',
  },
  {
    providerId: 'minimax' as const,
    title: 'MiniMax',
    envVar: 'MINIMAX_API_KEY',
    baseUrlEnvVar: 'MINIMAX_BASE_URL',
    placeholder: 'your-minimax-key',
    description: '用于 MiniMax M2.5 系列模型。',
  },
  {
    providerId: 'zhipu' as const,
    title: 'Zhipu GLM',
    envVar: 'ZHIPU_API_KEY',
    baseUrlEnvVar: 'ZHIPU_BASE_URL',
    placeholder: 'your-zhipu-key',
    description: '用于 GLM 系列模型。当前默认上游使用你指定的智谱 Anthropic 兼容地址。',
  },
  {
    providerId: 'moonshot' as const,
    title: 'Moonshot Kimi',
    envVar: 'MOONSHOT_API_KEY',
    baseUrlEnvVar: 'MOONSHOT_BASE_URL',
    placeholder: 'sk-...',
    description: '用于 Kimi K2 系列模型。当前默认上游按你的要求使用 Kimi Coding 网关。',
  },
];

interface SettingsViewProps {
  onBackToChat?: () => void;
  customPersonas?: Persona[];
  onSavePersona?: (persona: Persona) => Promise<void>;
  onDeletePersona?: (id: string) => Promise<void>;
  user?: User | null;
}

export default function SettingsView({
  onBackToChat,
  customPersonas = [],
  onSavePersona,
  onDeletePersona,
  user
}: SettingsViewProps) {
  const [providerStatus, setProviderStatus] = useState<Record<string, ProviderStatus>>({});
  const [openAIOAuthStatus, setOpenAIOAuthStatus] = useState<OpenAIOAuthStatus | null>(null);
  const [geminiOAuthStatus, setGeminiOAuthStatus] = useState<{ configured: boolean; email: string | null } | null>(null);
  const [draftValues, setDraftValues] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [structuredModel, setStructuredModel] = useState(() => getPreferredStructuredModel());
  const [embeddingModel, setEmbeddingModel] = useState(() => getPreferredEmbeddingModel());

  const [userApiKeys, setUserApiKeys] = useState<UserApiKeys | null>(null);
  const [isLoadingUserKeys, setIsLoadingUserKeys] = useState(false);
  const [isSavingUserKey, setIsSavingUserKey] = useState<string | null>(null);

  // Persona Lab State
  const [isPersonaModalOpen, setIsPersonaModalOpen] = useState(false);
  const [editingPersona, setEditingPersona] = useState<Partial<Persona> | null>(null);
  const [personaForm, setPersonaForm] = useState<Partial<Persona>>({
    name: '',
    icon: 'BrainCircuit',
    description: '',
    systemPrompt: '',
    category: 'custom'
  });

  const [connectedProviders, setConnectedProviders] = useState<string[]>([]);
  const [isLoadingProviders, setIsLoadingProviders] = useState(false);
  const [isUnlinking, setIsUnlinking] = useState<string | null>(null);

  const isProviderAuthenticated = useCallback((providerId: string): boolean => {
    const userKey = userApiKeys?.[providerId]?.apiKey;
    if (userKey) return true;

    if (providerId === 'gemini') {
      const geminiKeyConfigured = providerStatus['GEMINI_API_KEY']?.configured;
      const geminiOAuthConfigured = geminiOAuthStatus?.configured;
      return geminiKeyConfigured || geminiOAuthConfigured || false;
    }

    if (providerId === 'openai') {
      const openaiKeyConfigured = providerStatus['OPENAI_API_KEY']?.configured;
      const openaiOAuthConfigured = openAIOAuthStatus?.configured;
      return openaiKeyConfigured || openaiOAuthConfigured || false;
    }

    const envVarMap: Record<string, string> = {
      'minimax': 'MINIMAX_API_KEY',
      'zhipu': 'ZHIPU_API_KEY',
      'moonshot': 'MOONSHOT_API_KEY',
    };

    const envVar = envVarMap[providerId];
    if (!envVar) return false;

    return providerStatus[envVar]?.configured || false;
  }, [providerStatus, openAIOAuthStatus, geminiOAuthStatus, userApiKeys]);

  const structuredModelOptions = useMemo(
    () => AI_MODEL_OPTIONS.filter((option) => {
      if (option.model.toLowerCase().includes('embedding')) return false;
      return isProviderAuthenticated(option.provider);
    }),
    [isProviderAuthenticated]
  );

  const structuredModelLabel = useMemo(
    () => structuredModelOptions.find((option) => option.id === structuredModel)?.label ?? structuredModel,
    [structuredModel, structuredModelOptions]
  );

  const embeddingModelLabel = useMemo(
    () => EMBEDDING_MODEL_OPTIONS.find((option) => option.id === embeddingModel)?.label ?? embeddingModel,
    [embeddingModel]
  );

  const embeddingReady = useMemo(
    () => Boolean(providerStatus['GEMINI_API_KEY']?.configured || userApiKeys?.gemini?.apiKey),
    [providerStatus, userApiKeys]
  );

  const hasUnsavedChanges = useMemo(
    () => Object.values(draftValues).some((value) => value.trim().length > 0),
    [draftValues]
  );

  const loadStatus = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [providerResponse, openAIOAuthResponse, geminiOAuthResponse] = await Promise.all([
        fetch('/api/local-config/providers'),
        fetch('/api/local-config/openai-oauth/status'),
        fetch('/api/local-config/gemini-oauth/status'),
      ]);

      if (!providerResponse.ok) {
        throw new Error(await providerResponse.text());
      }
      if (!openAIOAuthResponse.ok) {
        throw new Error(await openAIOAuthResponse.text());
      }
      if (!geminiOAuthResponse.ok) {
        throw new Error(await geminiOAuthResponse.text());
      }

      const providerPayload = await providerResponse.json();
      const nextStatus = Object.fromEntries(
        (providerPayload.providers as ProviderStatus[]).map((item) => [item.key, item])
      );
      setProviderStatus(nextStatus);
      setOpenAIOAuthStatus(await openAIOAuthResponse.json());
      setGeminiOAuthStatus(await geminiOAuthResponse.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadUserApiKeys = useCallback(async () => {
    if (!user) return;
    setIsLoadingUserKeys(true);
    try {
      const keys = await getUserApiKeys();
      setUserApiKeys(keys);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoadingUserKeys(false);
    }
  }, [user]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    if (user) {
      void loadUserApiKeys();
    }
  }, [user, loadUserApiKeys]);

  useEffect(() => {
    if (openAIOAuthStatus?.loginStatus !== 'pending') {
      return;
    }

    const timer = window.setInterval(() => {
      void loadStatus();
    }, 1500);

    return () => {
      window.clearInterval(timer);
    };
  }, [loadStatus, openAIOAuthStatus?.loginStatus]);

  const handleSave = async () => {
    const updates = Object.fromEntries(
      Object.entries(draftValues).map(([key, value]) => [key, value.trim()])
    );

    setIsSaving(true);
    setFeedback(null);
    setError(null);
    try {
      const response = await fetch('/api/local-config/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      setFeedback('保存成功。新密钥已写入 .env.local，并会立刻用于后续请求。');
      setDraftValues({});
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSaving(false);
    }
  };

  const handleClear = async (envVar: string) => {
    setIsSaving(true);
    setFeedback(null);
    setError(null);
    try {
      const response = await fetch('/api/local-config/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates: { [envVar]: '' } }),
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      setDraftValues((prev) => {
        const next = { ...prev };
        delete next[envVar];
        return next;
      });
      setFeedback(`${envVar} 已清空。`);
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveUserApiKey = async (provider: string, apiKey: string, baseUrl?: string) => {
    if (!user) {
      setError('请先登录后再保存个人 API Key');
      return;
    }
    setIsSavingUserKey(provider);
    setFeedback(null);
    setError(null);
    try {
      await saveUserApiKey(provider, apiKey, baseUrl);
      setFeedback(`${provider} 个人 API Key 已保存`);
      setDraftValues((prev) => {
        const next = { ...prev };
        delete next[`${provider}_key`];
        delete next[`${provider}_baseUrl`];
        return next;
      });
      await loadUserApiKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSavingUserKey(null);
    }
  };

  const handleDeleteUserApiKey = async (provider: string) => {
    if (!user) {
      setError('请先登录后再删除个人 API Key');
      return;
    }
    setIsSavingUserKey(provider);
    setFeedback(null);
    setError(null);
    try {
      await deleteUserApiKey(provider);
      setFeedback(`${provider} 个人 API Key 已删除，将使用全局配置`);
      await loadUserApiKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSavingUserKey(null);
    }
  };

  const handleOpenAIOAuthLogin = async () => {
    const popup = window.open('about:blank', '_blank', 'popup=yes,width=520,height=720');
    if (popup) {
      popup.document.title = 'OpenAI OAuth';
      popup.document.body.innerHTML = `
        <div style="min-height:100vh;display:grid;place-items:center;background:#0d0d0d;color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
          <div style="width:min(24rem,calc(100vw - 2rem));padding:2rem;border-radius:1.5rem;background:#171717;border:1px solid rgba(255,255,255,0.08);text-align:center;box-shadow:0 24px 48px rgba(0,0,0,0.35);">
            <div style="width:3.5rem;height:3.5rem;margin:0 auto 1rem;border-radius:1rem;display:grid;place-items:center;background:linear-gradient(135deg,#10a37f,#1c7f6a);font-size:1.5rem;font-weight:800;">O</div>
            <h1 style="margin:0 0 0.75rem;font-size:1.5rem;font-weight:800;">正在打开 OpenAI 授权页</h1>
            <p style="margin:0;line-height:1.6;color:rgba(255,255,255,0.72);">如果几秒后仍未跳转，请关闭此窗口后重试，或使用设置页里的备用授权链接。</p>
          </div>
        </div>
      `;
    }
    setIsSaving(true);
    setFeedback(null);
    setError(null);
    try {
      const response = await fetch('/api/local-config/openai-oauth/login', {
        method: 'POST',
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || 'OpenAI OAuth login failed.');
      }

      if (payload?.authUrl) {
        if (popup) {
          popup.location.replace(payload.authUrl);
        } else {
          window.open(payload.authUrl, '_blank', 'noopener,noreferrer');
        }
        setFeedback('OpenAI 授权页已打开。完成浏览器登录后，设置页会自动刷新状态。');
      } else {
        popup?.close();
        throw new Error('未收到 OpenAI 授权地址，请重试。');
      }

      await loadStatus();
    } catch (err) {
      const nextError = err instanceof Error ? err.message : String(err);
      if (popup && !popup.closed) {
        popup.document.title = 'OpenAI OAuth 打开失败';
        popup.document.body.innerHTML = `
          <div style="min-height:100vh;display:grid;place-items:center;background:#0d0d0d;color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
            <div style="width:min(24rem,calc(100vw - 2rem));padding:2rem;border-radius:1.5rem;background:#171717;border:1px solid rgba(255,255,255,0.08);text-align:center;box-shadow:0 24px 48px rgba(0,0,0,0.35);">
              <div style="width:3.5rem;height:3.5rem;margin:0 auto 1rem;border-radius:1rem;display:grid;place-items:center;background:linear-gradient(135deg,#ef4444,#b91c1c);font-size:1.5rem;font-weight:800;">!</div>
              <h1 style="margin:0 0 0.75rem;font-size:1.5rem;font-weight:800;">无法打开 OpenAI 授权页</h1>
              <p style="margin:0;line-height:1.6;color:rgba(255,255,255,0.72);">${nextError}</p>
            </div>
          </div>
        `;
      }
      setError(nextError);
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenAIOAuthLogout = async () => {
    setIsSaving(true);
    setFeedback(null);
    setError(null);
    try {
      const response = await fetch('/api/local-config/openai-oauth/logout', {
        method: 'POST',
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || 'OpenAI OAuth logout failed.');
      }

      setFeedback(payload?.message || 'OpenAI OAuth 已退出。');
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenPersonaModal = (persona?: Persona) => {
    if (persona) {
      setEditingPersona(persona);
      setPersonaForm(persona);
    } else {
      setEditingPersona(null);
      setPersonaForm({
        name: '',
        icon: 'Sparkles',
        description: '',
        systemPrompt: '',
        category: 'custom'
      });
    }
    setIsPersonaModalOpen(true);
  };

  const handleSavePersonaForm = async () => {
    if (!personaForm.name || !personaForm.systemPrompt || !onSavePersona) return;
    
    setIsSaving(true);
    try {
      const personaToSave: Persona = {
        id: editingPersona?.id || `custom-${crypto.randomUUID()}`,
        name: personaForm.name || '新导师',
        icon: personaForm.icon || 'Sparkles',
        description: personaForm.description || '',
        systemPrompt: personaForm.systemPrompt || '',
        category: 'custom',
        isLocked: false
      };
      
      await onSavePersona(personaToSave);
      setIsPersonaModalOpen(false);
      setFeedback(editingPersona ? '导师人格已更新。' : '新导师人格已创建。');
    } catch (err) {
      setError('保存人格失败。');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeletePersonaClick = async (id: string) => {
    if (!onDeletePersona || !window.confirm('确定要删除这个导师人格吗？该人格下的已有对话仍可查看，但无法再以该身份开启新对话。')) return;

    setIsSaving(true);
    try {
      await onDeletePersona(id);
      setFeedback('导师人格已删除。');
    } catch (err) {
      setError('删除人格失败。');
    } finally {
      setIsSaving(false);
    }
  };

  const fetchConnectedProviders = useCallback(async () => {
    if (!user) return;
    setIsLoadingProviders(true);
    try {
      const response = await fetch('/api/account/connected-providers');
      if (!response.ok) throw new Error(await response.text());
      const data = await response.json();
      setConnectedProviders(data.providers || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取账号绑定状态失败');
    } finally {
      setIsLoadingProviders(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      void fetchConnectedProviders();
    }
  }, [user, fetchConnectedProviders]);

  const handleUnlinkProvider = async (provider: string) => {
    if (connectedProviders.length <= 1) {
      setError('至少需要保留一个登录方式，无法解绑最后一个账号');
      return;
    }
    if (!window.confirm(`确定要解绑${provider === 'wechat' ? '微信' : provider === 'qq' ? 'QQ' : provider}账号吗？`)) return;

    setIsUnlinking(provider);
    setFeedback(null);
    setError(null);
    try {
      const response = await fetch('/api/account/unlink-provider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      });
      if (!response.ok) throw new Error(await response.text());
      setFeedback(`${provider === 'wechat' ? '微信' : provider === 'qq' ? 'QQ' : provider}账号已解绑`);
      await fetchConnectedProviders();
    } catch (err) {
      setError(err instanceof Error ? err.message : '解绑失败');
    } finally {
      setIsUnlinking(null);
    }
  };

  const handleBindProvider = (provider: string) => {
    if (!user) {
      setError('请先登录');
      return;
    }
    const uid = user.uid;
    const url = provider === 'wechat'
      ? `/auth/wechat/start?action=link&currentUid=${uid}`
      : provider === 'qq'
      ? `/auth/qq/start?action=link&currentUid=${uid}`
      : null;
    if (url) {
      window.location.href = url;
    }
  };

  const isProviderConnected = (provider: string) => {
    if (provider === 'google') return !!user;
    return connectedProviders.includes(provider);
  };

  const handleSaveStructuredModel = () => {
    setError(null);
    const savedModel = persistPreferredStructuredModel(structuredModel);
    setStructuredModel(savedModel);
    setFeedback(`知识提炼模型已保存为：${savedModel}`);
  };

  const handleSaveEmbeddingModel = () => {
    setError(null);
    const savedModel = persistPreferredEmbeddingModel(embeddingModel);
    setEmbeddingModel(savedModel);
    setFeedback(`Embedding 模型已保存为：${savedModel}`);
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-10 bg-primary text-text-main">
      <div className="max-w-5xl mx-auto space-y-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.28em] text-text-muted font-bold mb-2">Settings</p>
            <h2 className="text-3xl font-black tracking-tight">模型与密钥设置</h2>
            <p className="text-text-sub mt-2 max-w-2xl leading-relaxed">
              这里管理本地开发环境的 provider 凭证。Gemini 优先支持 Gemini CLI / Code Assist OAuth；
              OpenAI 支持 Codex OAuth 或 API key；其他 provider 继续走 API key。
            </p>
          </div>
          <div className="flex items-center gap-3">
            {onBackToChat && (
              <button
                onClick={onBackToChat}
                className="px-4 py-2 rounded-full bg-tertiary text-text-main font-bold hover:bg-secondary transition-colors"
              >
                返回聊天
              </button>
            )}
            <button
              onClick={() => void loadStatus()}
              className="px-4 py-2 rounded-full bg-tertiary text-text-main font-bold hover:bg-secondary transition-colors flex items-center gap-2"
            >
              <RefreshCw size={14} />
              刷新状态
            </button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-3xl border border-border-main bg-card p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <ShieldCheck className="w-5 h-5 text-accent" />
              <h3 className="font-bold text-lg">Gemini 登录方式</h3>
            </div>
            <p className="text-sm text-text-sub leading-relaxed">
              Gemini 可以直接复用你已经登录的 Gemini CLI / Code Assist OAuth。只有你想改走官方 API key 时，
              才需要填写 `GEMINI_API_KEY`。
            </p>
          </div>

          <div className="rounded-3xl border border-border-main bg-card p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <KeyRound className="w-5 h-5 text-accent" />
              <h3 className="font-bold text-lg">保存位置</h3>
            </div>
            <p className="text-sm text-text-sub leading-relaxed">
              API key 会保存到项目根目录的 `.env.local`。OpenAI OAuth 凭证会保存在 `~/.opensynapse/openai-auth.json`，
              同时也能复用已有的 `~/.codex/auth.json`。
            </p>
          </div>
        </div>

        <div className="rounded-3xl border border-border-main bg-card p-6 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-3">
                <ShieldCheck className="w-5 h-5 text-accent" />
                <h3 className="font-bold text-lg">OpenAI Codex OAuth</h3>
                {openAIOAuthStatus?.configured ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 px-3 py-1 text-xs font-bold text-green-400">
                    <CheckCircle2 size={12} />
                    已登录
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-3 py-1 text-xs font-bold text-text-muted">
                    <CircleOff size={12} />
                    未登录
                  </span>
                )}
                {openAIOAuthStatus?.source === 'codex' && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-3 py-1 text-xs font-bold text-text-muted">
                    复用 ~/.codex/auth.json
                  </span>
                )}
              </div>
              <p className="text-sm text-text-sub leading-relaxed">
                参考 opencode / OpenAI Codex CLI 的认证方式，使用 ChatGPT / Codex 订阅登录后，
                通过 `chatgpt.com/backend-api/codex/responses` 访问支持的 GPT / Codex 模型。
              </p>
              <div className="text-xs text-text-muted">
                适合 OAuth 的典型模型：<code>openai/gpt-5.2</code>、<code>openai/gpt-5.2-codex</code>、
                <code>openai/gpt-5.1</code>、<code>openai/gpt-5.1-codex</code>。
              </div>
              {openAIOAuthStatus?.email && (
                <div className="text-xs text-text-muted">
                  当前账号：<code>{openAIOAuthStatus.email}</code>
                  {openAIOAuthStatus.planType ? ` · 计划：${openAIOAuthStatus.planType}` : ''}
                </div>
              )}
              {openAIOAuthStatus?.expiresAt && (
                <div className="text-xs text-text-muted">
                  Access Token 有效至：{new Date(openAIOAuthStatus.expiresAt).toLocaleString()}
                </div>
              )}
              {openAIOAuthStatus?.loginStatus === 'pending' && openAIOAuthStatus.authUrl && (
                <a
                  href={openAIOAuthStatus.authUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-bold text-accent hover:text-accent-hover transition-colors"
                >
                  如果浏览器没有自动打开，点这里继续授权
                  <ExternalLink size={12} />
                </a>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleOpenAIOAuthLogin}
                disabled={isSaving || openAIOAuthStatus?.loginStatus === 'pending'}
                className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-bold text-white shadow-lg shadow-accent/20 transition-all hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                <LogIn className="w-4 h-4" />
                {openAIOAuthStatus?.configured ? '重新登录' : '登录 OpenAI'}
              </button>
              <button
                onClick={handleOpenAIOAuthLogout}
                disabled={isSaving}
                className="inline-flex items-center gap-2 rounded-full bg-tertiary px-4 py-2 text-sm font-bold text-text-main hover:bg-secondary transition-colors disabled:opacity-50"
              >
                <LogOut className="w-4 h-4" />
                退出
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-border-main bg-card p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <BrainCircuit className="w-5 h-5 text-accent" />
            <h3 className="font-bold text-lg">知识提炼模型</h3>
          </div>
          <p className="text-sm text-text-sub leading-relaxed mb-4">
            选择用于知识提炼、文档解构等结构化输出的模型。
          </p>

          <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-text-muted">模型选择</label>
              <select
                value={structuredModel}
                onChange={(e) => setStructuredModel(e.target.value)}
                className="w-full rounded-2xl border border-border-main bg-secondary px-4 py-3 text-sm text-text-main outline-none focus:border-accent/40"
              >
                {structuredModelOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label} ({option.id})
                  </option>
                ))}
              </select>
              <div className="text-xs text-text-muted">
                当前选择：<code>{structuredModelLabel}</code> · <code>{structuredModel}</code>
              </div>
            </div>

            <button
              onClick={handleSaveStructuredModel}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-bold text-white shadow-lg shadow-accent/20 transition-all hover:bg-accent-hover"
            >
              <Save className="w-4 h-4" />
              保存
            </button>
          </div>
        </div>

        <div className="rounded-3xl border border-border-main bg-card p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <Sigma className="w-5 h-5 text-accent" />
            <h3 className="font-bold text-lg">Embedding 通道</h3>
          </div>
          <p className="text-sm text-text-sub leading-relaxed mb-4">
            语义搜索、知识链接和 RAG 的向量生成与聊天模型解耦。当前 embedding 仅支持 Gemini API Key 路径，
            所以你可以继续使用 GLM / Kimi / GPT 聊天，同时单独保留 Gemini 作为 embedding 提供商。
          </p>

          <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-text-muted">Embedding 模型</label>
              <select
                value={embeddingModel}
                onChange={(e) => setEmbeddingModel(e.target.value)}
                className="w-full rounded-2xl border border-border-main bg-secondary px-4 py-3 text-sm text-text-main outline-none focus:border-accent/40"
              >
                {EMBEDDING_MODEL_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label} ({option.id})
                  </option>
                ))}
              </select>
              <div className="text-xs text-text-muted">
                当前选择：<code>{embeddingModelLabel}</code> · <code>{embeddingModel}</code>
              </div>
              <div className={cn(
                "text-xs",
                embeddingReady ? "text-green-400" : "text-amber-400"
              )}>
                {embeddingReady
                  ? '已检测到 Gemini API Key，语义功能将保持开启。'
                  : '当前未检测到 Gemini API Key。聊天仍可继续，但语义搜索、知识链接与 RAG 会优雅降级。'}
              </div>
            </div>

            <button
              onClick={handleSaveEmbeddingModel}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-bold text-white shadow-lg shadow-accent/20 transition-all hover:bg-accent-hover"
            >
              <Save className="w-4 h-4" />
              保存
            </button>
          </div>
        </div>

        {/* Persona Laboratory */}
        <div className="rounded-3xl border border-border-main bg-card overflow-hidden shadow-sm">
          <div className="p-6 border-b border-border-main bg-secondary/30 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Sparkles className="w-5 h-5 text-accent" />
              <div>
                <h3 className="font-bold text-lg">Persona Laboratory 人格实验室</h3>
                <p className="text-xs text-text-sub">定义你自己的 AI 导师角色，为特定学科定制系统提示词。</p>
              </div>
            </div>
            <button
              onClick={() => handleOpenPersonaModal()}
              className="px-4 py-2 rounded-xl bg-accent text-white text-sm font-bold hover:bg-accent-hover transition-all flex items-center gap-2 shadow-lg shadow-accent/20"
            >
              <Plus size={16} />
              创建新导师
            </button>
          </div>
          
          <div className="p-6">
            {customPersonas.length === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center text-center space-y-4 opacity-40">
                <BrainCircuit size={48} />
                <div className="space-y-1">
                  <p className="font-bold uppercase tracking-widest text-[10px]">没有自定义人格</p>
                  <p className="text-sm">点击右上角“创建新导师”开始你的第一个 Agent。</p>
                </div>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {customPersonas.map((p) => {
                   const Icon = ({
                    BrainCircuit, Sigma, Gavel, TrendingUp, Sparkles, ShieldAlert
                  } as any)[p.icon || 'Sparkles'] || MessageSquare;

                  return (
                    <div key={p.id} className="p-4 rounded-2xl bg-secondary/50 border border-border-main hover:border-accent/30 transition-all group">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center text-accent">
                            <Icon size={20} />
                          </div>
                          <div>
                            <h4 className="font-bold text-text-main">{p.name}</h4>
                            <p className="text-xs text-text-sub line-clamp-1">{p.description || '无描述'}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 opacity-20 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={() => handleOpenPersonaModal(p)}
                            className="p-1.5 hover:bg-tertiary rounded-lg text-text-sub hover:text-text-main transition-all"
                            title="编辑"
                          >
                            <Edit3 size={14} />
                          </button>
                          <button 
                            onClick={() => handleDeletePersonaClick(p.id)}
                            className="p-1.5 hover:bg-red-500/10 rounded-lg text-text-sub hover:text-red-500 transition-all"
                            title="删除"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {feedback && (
          <div className="rounded-2xl border border-green-500/20 bg-green-500/10 px-4 py-3 text-sm text-green-300">
            {feedback}
          </div>
        )}
        {error && (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {user && (
          <div className="rounded-3xl border border-border-main bg-card p-6 shadow-sm">
            <div className="flex items-start gap-4 mb-4">
              <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center text-accent flex-shrink-0">
                <UserIcon size={20} />
              </div>
              <div>
                <h3 className="font-bold text-lg">个人 API Key 配置</h3>
                <p className="text-sm text-text-sub leading-relaxed">
                  为每个 AI 提供商配置个人 API Key。个人配置将优先于全局环境变量配置。
                  删除个人配置后将自动回退到全局配置。
                </p>
              </div>
            </div>

            {isLoadingUserKeys && (
              <div className="py-8 flex items-center justify-center">
                <RefreshCw className="w-6 h-6 animate-spin text-text-muted" />
              </div>
            )}

            <div className="grid gap-4">
              {PROVIDER_SETTINGS.map((item) => {
                const provider = AI_PROVIDERS[item.providerId];
                const userKey = userApiKeys?.[item.providerId];
                const hasUserKey = Boolean(userKey?.apiKey);
                const envStatus = providerStatus[item.envVar];
                const hasEnvKey = envStatus?.configured ?? false;
                const isActiveKey = hasUserKey ? 'personal' : hasEnvKey ? 'global' : 'none';
                const draftKey = draftValues[`${item.providerId}_key`] || '';
                const draftBaseUrl = draftValues[`${item.providerId}_baseUrl`] || '';

                return (
                  <div key={item.providerId} className="rounded-2xl border border-border-main bg-secondary/30 p-5">
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div className="space-y-2">
                        <div className="flex items-center gap-3 flex-wrap">
                          <h4 className="text-lg font-bold">{item.title}</h4>
                          {isActiveKey === 'personal' ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-3 py-1 text-xs font-bold text-accent">
                              <UserIcon size={12} />
                              使用个人配置
                            </span>
                          ) : isActiveKey === 'global' ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-3 py-1 text-xs font-bold text-blue-400">
                              <Globe size={12} />
                              使用全局配置
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-3 py-1 text-xs font-bold text-text-muted">
                              <CircleOff size={12} />
                              未配置
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-text-sub">{item.description}</p>
                        {hasUserKey && (
                          <div className="text-xs text-text-muted">
                            个人 Key: <code className="bg-secondary px-1 py-0.5 rounded">{userKey!.apiKey.slice(0, 4)}****{userKey!.apiKey.slice(-4)}</code>
                            {userKey!.baseUrl && (
                              <span> · 上游: <code className="bg-secondary px-1 py-0.5 rounded">{userKey!.baseUrl}</code></span>
                            )}
                          </div>
                        )}
                        {!hasUserKey && hasEnvKey && envStatus?.valuePreview && (
                          <div className="text-xs text-text-muted">
                            全局 Key: <code className="bg-secondary px-1 py-0.5 rounded">{envStatus.valuePreview}</code>
                          </div>
                        )}
                      </div>

                      <div className="w-full md:w-[28rem] space-y-3">
                        <input
                          type="password"
                          value={draftKey}
                          onChange={(e) =>
                            setDraftValues((prev) => ({ ...prev, [`${item.providerId}_key`]: e.target.value }))
                          }
                          placeholder={hasUserKey ? '输入新 Key 替换当前配置' : item.placeholder}
                          disabled={isSavingUserKey === item.providerId}
                          className="w-full rounded-2xl border border-border-main bg-secondary px-4 py-3 text-sm text-text-main placeholder:text-text-muted/40 outline-none focus:border-accent/40 disabled:opacity-50"
                        />
                        {item.baseUrlEnvVar && (
                          <input
                            type="text"
                            value={draftBaseUrl}
                            onChange={(e) =>
                              setDraftValues((prev) => ({ ...prev, [`${item.providerId}_baseUrl`]: e.target.value }))
                            }
                            placeholder={`自定义上游地址 (默认: ${provider.baseUrl || '官方'})`}
                            disabled={isSavingUserKey === item.providerId}
                            className="w-full rounded-2xl border border-border-main bg-secondary px-4 py-3 text-sm text-text-main placeholder:text-text-muted/40 outline-none focus:border-accent/40 disabled:opacity-50"
                          />
                        )}
                        <div className="flex items-center justify-end gap-2">
                          {hasUserKey && (
                            <button
                              onClick={() => void handleDeleteUserApiKey(item.providerId)}
                              disabled={isSavingUserKey === item.providerId}
                              className="px-4 py-2 rounded-full bg-tertiary text-text-main text-sm font-bold hover:bg-secondary transition-colors disabled:opacity-50"
                            >
                              {isSavingUserKey === item.providerId ? (
                                <RefreshCw className="w-4 h-4 animate-spin inline" />
                              ) : (
                                '删除个人配置'
                              )}
                            </button>
                          )}
                          <button
                            onClick={() => void handleSaveUserApiKey(item.providerId, draftKey, draftBaseUrl || undefined)}
                            disabled={isSavingUserKey === item.providerId || !draftKey.trim()}
                            className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-bold text-white shadow-lg shadow-accent/20 transition-all hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {isSavingUserKey === item.providerId ? (
                              <RefreshCw className="w-4 h-4 animate-spin" />
                            ) : (
                              <Save className="w-4 h-4" />
                            )}
                            {hasUserKey ? '更新' : '保存'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {!user && (
          <div className="rounded-3xl border border-border-main bg-card p-6 shadow-sm">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-tertiary flex items-center justify-center text-text-muted flex-shrink-0">
                <KeyRound size={20} />
              </div>
              <div>
                <h3 className="font-bold text-lg mb-1">个人 API Key 配置</h3>
                <p className="text-sm text-text-sub">
                  登录后可配置个人 API Key。个人配置将覆盖全局环境变量，实现多用户隔离。
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="rounded-3xl border border-border-main bg-card p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <Globe className="w-5 h-5 text-text-muted" />
            <h3 className="font-bold text-lg">全局 API Key 配置</h3>
          </div>
          <p className="text-sm text-text-sub mb-4">
            以下配置来自服务器环境变量 (.env.local)，作为所有用户的默认配置。个人配置将覆盖这些全局设置。
          </p>

          <div className="grid gap-4">
            {PROVIDER_SETTINGS.map((item) => {
              const envStatus = providerStatus[item.envVar];
              const userKey = userApiKeys?.[item.providerId];
              const isOverridden = Boolean(userKey?.apiKey);

              return (
                <div key={item.envVar} className={`rounded-2xl border border-border-main bg-secondary/30 p-4 ${isOverridden ? 'opacity-60' : ''}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <h4 className="font-bold">{item.title}</h4>
                      {envStatus?.configured ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-bold text-green-400">
                          <CheckCircle2 size={10} />
                          已配置
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-xs font-bold text-text-muted">
                          <CircleOff size={10} />
                          未配置
                        </span>
                      )}
                      {isOverridden && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-xs font-bold text-accent">
                          <UserIcon size={10} />
                          已被个人配置覆盖
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-text-muted">
                      <code>{item.envVar}</code>
                      {envStatus?.valuePreview && (
                        <span className="ml-2">{envStatus.valuePreview}</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {user && (
          <div className="rounded-3xl border border-border-main bg-card overflow-hidden shadow-sm">
            <div className="p-6 border-b border-border-main bg-secondary/30">
              <div className="flex items-center gap-3">
                <ShieldCheck className="w-5 h-5 text-accent" />
                <div>
                  <h3 className="font-bold text-lg">账号绑定</h3>
                  <p className="text-xs text-text-sub">管理您的第三方登录方式</p>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-4">
              {isLoadingProviders ? (
                <div className="py-8 flex items-center justify-center">
                  <RefreshCw className="w-6 h-6 animate-spin text-text-muted" />
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between p-4 rounded-2xl bg-secondary/50 border border-border-main">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M23.766 12.2764c0-.8514-.0764-1.7088-.2223-2.5507H12.24v4.8277h6.4586c-.2764 1.4588-1.1172 2.6916-2.3766 3.5136l3.845 2.979c2.2414-2.0656 3.5388-5.1094 3.5388-8.7696z" fill="#4285F4"/>
                          <path d="M12.2401 24c3.2146 0 5.9115-1.0652 7.8829-2.8825l-3.845-2.979c-1.0635.711-2.4248 1.1316-4.0379 1.1316-3.1066 0-5.7358-2.0944-6.6728-4.9109l-3.9778 3.0786C3.8523 21.2052 7.7798 24 12.2401 24z" fill="#34A853"/>
                          <path d="M5.5673 14.3591c-.4716-1.3935-.4716-2.9004 0-4.2939L1.5895 6.9866C-.1969 10.3017-.1969 14.6984 1.5895 18.0135l3.9778-3.0786-.0001-.5758z" fill="#FBBC05"/>
                          <path d="M12.2401 4.7493c1.7506 0 3.3229.6016 4.5563 1.7819l3.4206-3.4206C17.7453 1.1695 15.0484 0 12.2401 0 7.7798 0 3.8523 2.7948 1.5895 6.9866l3.9778 3.0786c.937-2.8165 3.5662-4.9109 6.6728-4.9109z" fill="#EA4335"/>
                        </svg>
                      </div>
                      <div>
                        <h4 className="font-bold text-text-main">Google 账号</h4>
                        <p className="text-xs text-text-sub">{user.email || user.displayName || '已登录'}</p>
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 px-3 py-1 text-xs font-bold text-green-400">
                      <CheckCircle2 size={12} />
                      已绑定
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-4 rounded-2xl bg-secondary/50 border border-border-main">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center">
                        <svg className="w-5 h-5 text-green-500" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178 1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336a.722.722 0 0 1 .598.082l1.584.926a.272.272 0 0 0 .14.045c.134 0 .24-.111.24-.247 0-.06-.023-.12-.038-.177l-.327-1.233a.582.582 0 0 1-.023-.156.49.49 0 0 1 .201-.398C23.024 18.48 24 16.82 24 14.98c0-3.21-2.931-5.837-6.656-6.088V8.89c-.135-.01-.27-.027-.407-.032zm-2.53 3.274c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.97-.982zm4.844 0c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.969-.982z"/>
                        </svg>
                      </div>
                      <div>
                        <h4 className="font-bold text-text-main">微信</h4>
                        <p className="text-xs text-text-sub">
                          {isProviderConnected('wechat') ? '已绑定微信账号' : '未绑定'}
                        </p>
                      </div>
                    </div>
                    {isProviderConnected('wechat') ? (
                      <button
                        onClick={() => void handleUnlinkProvider('wechat')}
                        disabled={isUnlinking === 'wechat'}
                        className="px-4 py-2 rounded-full bg-tertiary text-text-main text-sm font-bold hover:bg-secondary transition-colors disabled:opacity-50 flex items-center gap-2"
                      >
                        {isUnlinking === 'wechat' ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                          <CircleOff className="w-4 h-4" />
                        )}
                        解绑
                      </button>
                    ) : (
                      <button
                        onClick={() => handleBindProvider('wechat')}
                        className="px-4 py-2 rounded-full bg-accent text-white text-sm font-bold hover:bg-accent-hover transition-all flex items-center gap-2 shadow-lg shadow-accent/20"
                      >
                        <LogIn className="w-4 h-4" />
                        去绑定
                      </button>
                    )}
                  </div>

                  <div className="flex items-center justify-between p-4 rounded-2xl bg-secondary/50 border border-border-main">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
                        <svg className="w-5 h-5 text-blue-500" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12.003 2c-2.265 0-6.29 1.364-6.29 7.325v1.195S3.55 14.96 3.55 17.474c0 .665.17 1.025.281 1.025.114 0 .902-.484 1.748-2.072 0 0-.18 2.197 1.904 3.967 0 0-1.77.495-1.77 1.182 0 .686 4.078.43 6.29.43 2.21 0 6.287.257 6.287-.43 0-.687-1.768-1.182-1.768-1.182 2.085-1.77 1.905-3.967 1.905-3.967.845 1.588 1.634 2.072 1.746 2.072.111 0 .283-.36.283-1.025 0-2.514-2.164-6.954-2.164-6.954V9.325C18.29 3.364 14.268 2 12.003 2z"/>
                        </svg>
                      </div>
                      <div>
                        <h4 className="font-bold text-text-main">QQ</h4>
                        <p className="text-xs text-text-sub">
                          {isProviderConnected('qq') ? '已绑定QQ账号' : '未绑定'}
                        </p>
                      </div>
                    </div>
                    {isProviderConnected('qq') ? (
                      <button
                        onClick={() => void handleUnlinkProvider('qq')}
                        disabled={isUnlinking === 'qq'}
                        className="px-4 py-2 rounded-full bg-tertiary text-text-main text-sm font-bold hover:bg-secondary transition-colors disabled:opacity-50 flex items-center gap-2"
                      >
                        {isUnlinking === 'qq' ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                          <CircleOff className="w-4 h-4" />
                        )}
                        解绑
                      </button>
                    ) : (
                      <button
                        onClick={() => handleBindProvider('qq')}
                        className="px-4 py-2 rounded-full bg-accent text-white text-sm font-bold hover:bg-accent-hover transition-all flex items-center gap-2 shadow-lg shadow-accent/20"
                      >
                        <LogIn className="w-4 h-4" />
                        去绑定
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <button
            onClick={() => void handleSave()}
            disabled={isSaving || isLoading || !hasUnsavedChanges}
            className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-3 font-bold text-white shadow-lg shadow-accent/20 transition-all hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {isSaving ? '保存中...' : '保存设置'}
          </button>
        </div>

        {/* Persona Modal */}
        <AnimatePresence>
          {isPersonaModalOpen && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsPersonaModalOpen(false)}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              />
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="relative w-full max-w-2xl bg-primary border border-border-main rounded-[2rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
              >
                <div className="p-6 border-b border-border-main flex items-center justify-between bg-secondary/30">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center text-accent">
                      <Plus size={20} />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg">{editingPersona ? '编辑导师人格' : '创建新导师'}</h3>
                      <p className="text-xs text-text-sub">定义 AI 与你交流的语调、专业背景和边界。</p>
                    </div>
                  </div>
                  <button onClick={() => setIsPersonaModalOpen(false)} className="p-2 hover:bg-tertiary rounded-lg text-text-muted transition-colors">
                    <X size={20} />
                  </button>
                </div>

                <div className="p-6 overflow-y-auto space-y-6">
                  {/* Basic Info */}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-widest text-text-muted">导师名称 *</label>
                      <input 
                        type="text" 
                        value={personaForm.name}
                        onChange={(e) => setPersonaForm({ ...personaForm, name: e.target.value })}
                        placeholder="例如：数学建模辅助"
                        className="w-full bg-secondary border border-border-main rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-accent/40 transition-all"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-widest text-text-muted">简要描述</label>
                      <input 
                        type="text" 
                        value={personaForm.description}
                        onChange={(e) => setPersonaForm({ ...personaForm, description: e.target.value })}
                        placeholder="用途或风格描述"
                        className="w-full bg-secondary border border-border-main rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-accent/40 transition-all"
                      />
                    </div>
                  </div>

                  {/* Icon Selector */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-text-muted">图标选择</label>
                    <div className="flex flex-wrap gap-2">
                      {['BrainCircuit', 'Sigma', 'Gavel', 'TrendingUp', 'Sparkles', 'ShieldAlert', 'MessageSquare'].map((iconName) => {
                        const Icon = ({
                          BrainCircuit, Sigma, Gavel, TrendingUp, Sparkles, ShieldAlert, MessageSquare
                        } as any)[iconName];
                        const isSelected = personaForm.icon === iconName;
                        return (
                          <button
                            key={iconName}
                            onClick={() => setPersonaForm({ ...personaForm, icon: iconName as any })}
                            className={cn(
                              "w-12 h-12 rounded-xl flex items-center justify-center transition-all border",
                              isSelected 
                                ? "bg-accent text-white border-accent shadow-lg shadow-accent/20" 
                                : "bg-secondary text-text-sub border-border-main hover:border-accent/20"
                            )}
                          >
                            <Icon size={20} />
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* System Prompt */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold uppercase tracking-widest text-text-muted">系统指令 (System Prompt) *</label>
                      <span className="text-[10px] text-accent font-mono">CORE RULES</span>
                    </div>
                    <textarea 
                      value={personaForm.systemPrompt}
                      onChange={(e) => setPersonaForm({ ...personaForm, systemPrompt: e.target.value })}
                      placeholder="你是一个逻辑严密的数学专家，擅长用几何直观解释微积分概念..."
                      className="w-full bg-secondary border border-border-main rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent/40 transition-all h-64 font-mono leading-relaxed resize-none"
                    />
                    <p className="text-[10px] text-text-muted italic">提示：详细的背景设定能让 AI 表现更稳定。建议包含：身份职责、语气风格、领域约束。</p>
                  </div>
                </div>

                <div className="p-6 border-t border-border-main bg-secondary/20 flex items-center justify-end gap-3">
                  <button 
                    onClick={() => setIsPersonaModalOpen(false)}
                    className="px-6 py-2 rounded-full text-sm font-bold text-text-sub hover:text-text-main transition-colors"
                  >
                    取消
                  </button>
                  <button 
                    onClick={handleSavePersonaForm}
                    disabled={isSaving || !personaForm.name || !personaForm.systemPrompt}
                    className="px-8 py-2 rounded-full bg-accent text-white shadow-lg shadow-accent/20 font-bold hover:bg-accent-hover transition-all disabled:opacity-50 flex items-center gap-2"
                  >
                    {isSaving && <RefreshCw size={14} className="animate-spin" />}
                    {editingPersona ? '保存修改' : '创建人格'}
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
