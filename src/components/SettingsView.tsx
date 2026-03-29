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
import { cn, generateUUID } from '../lib/utils';
interface User {
  id: string;
  email?: string;
  name?: string;
  image?: string;
}
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

const LOCAL_CONFIG_KEYS = new Set(
  PROVIDER_SETTINGS.flatMap((item) => [
    item.envVar,
    ...(item.baseUrlEnvVar ? [item.baseUrlEnvVar] : []),
  ])
);

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
    () => {
      const parsed = embeddingModel.split('/')[0];
      const providerEnvMap: Record<string, string> = {
        gemini: 'GEMINI_API_KEY',
        openai: 'OPENAI_API_KEY',
        zhipu: 'ZHIPU_API_KEY',
      };
      const envVar = providerEnvMap[parsed];
      if (!envVar) return false;
      const userKeyMap: Record<string, string> = { gemini: 'gemini', openai: 'openai', zhipu: 'zhipu' };
      return Boolean(providerStatus[envVar]?.configured || userApiKeys?.[userKeyMap[parsed] as keyof typeof userApiKeys]?.apiKey);
    },
    [embeddingModel, providerStatus, userApiKeys]
  );

  const hasUnsavedLocalConfigChanges = useMemo(
    () => Object.entries(draftValues).some(([key, value]) => LOCAL_CONFIG_KEYS.has(key) && value.trim().length > 0),
    [draftValues]
  );

  const getAuthorizedHeaders = useCallback(async (includeJsonContentType = false) => {
    const headers: Record<string, string> = {};
    if (includeJsonContentType) {
      headers['Content-Type'] = 'application/json';
    }
    // better-auth uses session cookies automatically
    return headers;
  }, [user]);

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
      Object.entries(draftValues)
        .filter(([key]) => LOCAL_CONFIG_KEYS.has(key))
        .map(([key, value]) => [key, value.trim()])
    );

    if (Object.keys(updates).length === 0) {
      setFeedback('当前没有需要保存的全局配置。');
      return;
    }

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

  const handleGeminiOAuthLogin = async () => {
    const popup = window.open('about:blank', '_blank', 'popup=yes,width=520,height=720');
    if (popup) {
      popup.document.title = 'Gemini OAuth';
      popup.document.body.innerHTML = `
        <div style="min-height:100vh;display:grid;place-items:center;background:#0d0d0d;color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
          <div style="width:min(24rem,calc(100vw - 2rem));padding:2rem;border-radius:1.5rem;background:#171717;border:1px solid rgba(255,255,255,0.08);text-align:center;box-shadow:0 24px 48px rgba(0,0,0,0.35);">
            <div style="width:3.5rem;height:3.5rem;margin:0 auto 1rem;border-radius:1rem;display:grid;place-items:center;background:linear-gradient(135deg,#4285f4,#34a853);font-size:1.5rem;font-weight:800;">G</div>
            <h1 style="margin:0 0 0.75rem;font-size:1.5rem;font-weight:800;">正在打开 Gemini 授权页</h1>
            <p style="margin:0;line-height:1.6;color:rgba(255,255,255,0.72);">如果几秒后仍未跳转，请关闭此窗口后重试。</p>
          </div>
        </div>
      `;
    }
    setIsSaving(true);
    setFeedback(null);
    setError(null);
    try {
      const response = await fetch('/api/local-config/gemini-oauth/login', {
        method: 'POST',
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || 'Gemini OAuth login failed.');
      }

      if (payload?.authUrl) {
        if (popup) {
          popup.location.replace(payload.authUrl);
        } else {
          window.open(payload.authUrl, '_blank', 'noopener,noreferrer');
        }
        setFeedback('Gemini 授权页已打开。完成浏览器登录后，设置页会自动刷新状态。');
      } else {
        popup?.close();
        throw new Error('未收到 Gemini 授权地址，请重试。');
      }

      await loadStatus();
    } catch (err) {
      const nextError = err instanceof Error ? err.message : String(err);
      if (popup && !popup.closed) {
        popup.document.title = 'Gemini OAuth 打开失败';
        popup.document.body.innerHTML = `
          <div style="min-height:100vh;display:grid;place-items:center;background:#0d0d0d;color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
            <div style="width:min(24rem,calc(100vw - 2rem));padding:2rem;border-radius:1.5rem;background:#171717;border:1px solid rgba(255,255,255,0.08);text-align:center;box-shadow:0 24px 48px rgba(0,0,0,0.35);">
              <div style="width:3.5rem;height:3.5rem;margin:0 auto 1rem;border-radius:1rem;display:grid;place-items:center;background:linear-gradient(135deg,#ef4444,#b91c1c);font-size:1.5rem;font-weight:800;">!</div>
              <h1 style="margin:0 0 0.75rem;font-size:1.5rem;font-weight:800;">无法打开 Gemini 授权页</h1>
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

  const handleGeminiOAuthLogout = async () => {
    setIsSaving(true);
    setFeedback(null);
    setError(null);
    try {
      const response = await fetch('/api/local-config/gemini-oauth/logout', {
        method: 'POST',
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.message || 'Gemini OAuth logout failed.');
      }

      setFeedback(payload?.message || 'Gemini OAuth 已退出。');
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
        id: editingPersona?.id || `custom-${generateUUID()}`,
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
      const response = await fetch('/api/account/connected-providers', {
        headers: await getAuthorizedHeaders(),
      });
      if (!response.ok) throw new Error(await response.text());
      const data = await response.json();
      setConnectedProviders(Array.isArray(data.accounts) ? data.accounts.map((item: { provider?: string }) => item.provider || '') : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取账号绑定状态失败');
    } finally {
      setIsLoadingProviders(false);
    }
  }, [getAuthorizedHeaders, user]);

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
    if (!window.confirm(`确定要解绑${provider === 'google' ? 'Google' : provider === 'github' ? 'GitHub' : provider === 'discord' ? 'Discord' : provider}账号吗？`)) return;

    setIsUnlinking(provider);
    setFeedback(null);
    setError(null);
    try {
      const response = await fetch('/api/account/unlink-provider', {
        method: 'POST',
        headers: await getAuthorizedHeaders(true),
        body: JSON.stringify({ provider, providerUserId: null }),
      });
      if (!response.ok) throw new Error(await response.text());
      setFeedback(`${provider === 'google' ? 'Google' : provider === 'github' ? 'GitHub' : provider === 'discord' ? 'Discord' : provider}账号已解绑`);
      await fetchConnectedProviders();
    } catch (err) {
      setError(err instanceof Error ? err.message : '解绑失败');
    } finally {
      setIsUnlinking(null);
    }
  };

  const handleBindProvider = async (provider: string) => {
    if (!user) {
      setError('请先登录');
      return;
    }

    const validProviders = ['google', 'github', 'discord'];
    if (!validProviders.includes(provider)) {
      setError(`暂不支持绑定 ${provider} 账号`);
      return;
    }

    try {
      const { signIn } = await import('../auth/client');
      await signIn.social({
        provider: provider as 'google' | 'github' | 'discord',
        callbackURL: window.location.origin + '/settings',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '绑定失败');
    }
  };

  const isProviderConnected = (provider: string) => {
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

        <div className="rounded-3xl border border-border-main bg-card p-6 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-3">
                <ShieldCheck className="w-5 h-5 text-accent" />
                <h3 className="font-bold text-lg">Gemini 登录方式</h3>
                {geminiOAuthStatus?.configured ? (
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
              </div>
              {geminiOAuthStatus?.email && (
                <div className="text-xs text-text-muted">
                  当前账号：<code>{geminiOAuthStatus.email}</code>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleGeminiOAuthLogin}
                disabled={isSaving}
                className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-bold text-white shadow-lg shadow-accent/20 transition-all hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                <LogIn className="w-4 h-4" />
                {geminiOAuthStatus?.configured ? '重新登录' : '登录 Gemini'}
              </button>
              <button
                onClick={handleGeminiOAuthLogout}
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
          语义搜索、知识链接和 RAG 的向量生成与聊天模型解耦。支持 Gemini、OpenAI、智谱等多个 embedding 提供商。
          你可以继续使用 GLM / Kimi / GPT 聊天，同时选择任意有 API Key 的提供商作为 embedding 后端。
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
                  ? `已检测到 ${embeddingModel.split('/')[0]} API Key，语义功能将保持开启。`
                  : `当前 Embedding 提供商 (${embeddingModel.split('/')[0]}) 未配置 API Key。聊天仍可继续，但语义搜索、知识链接与 RAG 会优雅降级。`}
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

              const draftEnvValue = draftValues[item.envVar] || '';
              const draftEnvBaseUrl = item.baseUrlEnvVar ? (draftValues[item.baseUrlEnvVar] || '') : '';

              return (
                <div key={item.envVar} className={`rounded-2xl border border-border-main bg-secondary/30 p-4 ${isOverridden ? 'opacity-60' : ''}`}>
                  <div className="flex items-center justify-between gap-4">
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
                  <div className="mt-4 space-y-3">
                    <input
                      type="password"
                      value={draftEnvValue}
                      onChange={(e) =>
                        setDraftValues((prev) => ({ ...prev, [item.envVar]: e.target.value }))
                      }
                      placeholder={envStatus?.configured ? '输入新全局 Key 以覆盖当前配置' : item.placeholder}
                      disabled={isSaving}
                      className="w-full rounded-2xl border border-border-main bg-secondary px-4 py-3 text-sm text-text-main placeholder:text-text-muted/40 outline-none focus:border-accent/40 disabled:opacity-50"
                    />
                    {item.baseUrlEnvVar && (
                      <input
                        type="text"
                        value={draftEnvBaseUrl}
                        onChange={(e) =>
                          setDraftValues((prev) => ({ ...prev, [item.baseUrlEnvVar!]: e.target.value }))
                        }
                        placeholder={`自定义全局上游地址 (默认: ${AI_PROVIDERS[item.providerId].baseUrl || '官方'})`}
                        disabled={isSaving}
                        className="w-full rounded-2xl border border-border-main bg-secondary px-4 py-3 text-sm text-text-main placeholder:text-text-muted/40 outline-none focus:border-accent/40 disabled:opacity-50"
                      />
                    )}
                    <div className="flex items-center justify-end gap-2">
                      {envStatus?.configured && (
                        <button
                          onClick={() => void handleClear(item.envVar)}
                          disabled={isSaving}
                          className="px-4 py-2 rounded-full bg-tertiary text-text-main text-sm font-bold hover:bg-secondary transition-colors disabled:opacity-50"
                        >
                          清空全局 Key
                        </button>
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
                        <p className="text-xs text-text-sub">
                          {isProviderConnected('google') ? '已绑定 Google 账号' : '未绑定'}
                        </p>
                      </div>
                    </div>
                    {isProviderConnected('google') ? (
                      <button
                        onClick={() => void handleUnlinkProvider('google')}
                        disabled={isUnlinking === 'google'}
                        className="px-4 py-2 rounded-full bg-tertiary text-text-main text-sm font-bold hover:bg-secondary transition-colors disabled:opacity-50 flex items-center gap-2"
                      >
                        {isUnlinking === 'google' ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                          <CircleOff className="w-4 h-4" />
                        )}
                        解绑
                      </button>
                    ) : (
                      <button
                        onClick={() => handleBindProvider('google')}
                        className="px-4 py-2 rounded-full bg-accent text-white text-sm font-bold hover:bg-accent-hover transition-all flex items-center gap-2 shadow-lg shadow-accent/20"
                      >
                        <LogIn className="w-4 h-4" />
                        去绑定
                      </button>
                    )}
                  </div>

                  <div className="flex items-center justify-between p-4 rounded-2xl bg-secondary/50 border border-border-main">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-gray-800 flex items-center justify-center">
                        <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                        </svg>
                      </div>
                      <div>
                        <h4 className="font-bold text-text-main">GitHub</h4>
                        <p className="text-xs text-text-sub">
                          {isProviderConnected('github') ? '已绑定 GitHub 账号' : '未绑定'}
                        </p>
                      </div>
                    </div>
                    {isProviderConnected('github') ? (
                      <button
                        onClick={() => void handleUnlinkProvider('github')}
                        disabled={isUnlinking === 'github'}
                        className="px-4 py-2 rounded-full bg-tertiary text-text-main text-sm font-bold hover:bg-secondary transition-colors disabled:opacity-50 flex items-center gap-2"
                      >
                        {isUnlinking === 'github' ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                          <CircleOff className="w-4 h-4" />
                        )}
                        解绑
                      </button>
                    ) : (
                      <button
                        onClick={() => handleBindProvider('github')}
                        className="px-4 py-2 rounded-full bg-accent text-white text-sm font-bold hover:bg-accent-hover transition-all flex items-center gap-2 shadow-lg shadow-accent/20"
                      >
                        <LogIn className="w-4 h-4" />
                        去绑定
                      </button>
                    )}
                  </div>

                  <div className="flex items-center justify-between p-4 rounded-2xl bg-secondary/50 border border-border-main">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-[#5865F2] flex items-center justify-center">
                        <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                        </svg>
                      </div>
                      <div>
                        <h4 className="font-bold text-text-main">Discord</h4>
                        <p className="text-xs text-text-sub">
                          {isProviderConnected('discord') ? '已绑定 Discord 账号' : '未绑定'}
                        </p>
                      </div>
                    </div>
                    {isProviderConnected('discord') ? (
                      <button
                        onClick={() => void handleUnlinkProvider('discord')}
                        disabled={isUnlinking === 'discord'}
                        className="px-4 py-2 rounded-full bg-tertiary text-text-main text-sm font-bold hover:bg-secondary transition-colors disabled:opacity-50 flex items-center gap-2"
                      >
                        {isUnlinking === 'discord' ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                          <CircleOff className="w-4 h-4" />
                        )}
                        解绑
                      </button>
                    ) : (
                      <button
                        onClick={() => handleBindProvider('discord')}
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
            disabled={isSaving || isLoading || !hasUnsavedLocalConfigChanges}
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
