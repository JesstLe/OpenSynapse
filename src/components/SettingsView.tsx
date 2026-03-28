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
  X
} from 'lucide-react';
import { AI_PROVIDERS, } from '../lib/aiModels';
import { Note, Flashcard, ChatSession, Persona } from '../types';
import { DEFAULT_PERSONA_ID } from '../lib/personas';
import { cn } from '../lib/utils';

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
}

export default function SettingsView({ 
  onBackToChat,
  customPersonas = [],
  onSavePersona,
  onDeletePersona
}: SettingsViewProps) {
  const [providerStatus, setProviderStatus] = useState<Record<string, ProviderStatus>>({});
  const [openAIOAuthStatus, setOpenAIOAuthStatus] = useState<OpenAIOAuthStatus | null>(null);
  const [draftValues, setDraftValues] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
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

  const hasUnsavedChanges = useMemo(
    () => Object.values(draftValues).some((value) => value.trim().length > 0),
    [draftValues]
  );

  const loadStatus = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [providerResponse, openAIOAuthResponse] = await Promise.all([
        fetch('/api/local-config/providers'),
        fetch('/api/local-config/openai-oauth/status'),
      ]);

      if (!providerResponse.ok) {
        throw new Error(await providerResponse.text());
      }
      if (!openAIOAuthResponse.ok) {
        throw new Error(await openAIOAuthResponse.text());
      }

      const providerPayload = await providerResponse.json();
      const nextStatus = Object.fromEntries(
        (providerPayload.providers as ProviderStatus[]).map((item) => [item.key, item])
      );
      setProviderStatus(nextStatus);
      setOpenAIOAuthStatus(await openAIOAuthResponse.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

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

        <div className="grid gap-4">
          {PROVIDER_SETTINGS.map((item) => {
            const provider = AI_PROVIDERS[item.providerId];
            const status = providerStatus[item.envVar];
            return (
              <div key={item.envVar} className="rounded-3xl border border-border-main bg-card p-6 shadow-sm">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <h3 className="text-xl font-bold">{item.title}</h3>
                      {status?.configured ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 px-3 py-1 text-xs font-bold text-green-400">
                          <CheckCircle2 size={12} />
                          已配置
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-3 py-1 text-xs font-bold text-text-muted">
                          <CircleOff size={12} />
                          未配置
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-text-sub leading-relaxed">{item.description}</p>
                    <div className="text-xs text-text-muted">
                      环境变量：<code>{item.envVar}</code>
                      {status?.valuePreview ? ` · 当前预览：${status.valuePreview}` : ''}
                    </div>
                    {item.baseUrlEnvVar && (
                      <div className="text-xs text-text-muted">
                        上游覆盖变量：<code>{item.baseUrlEnvVar}</code>
                        {provider.baseUrl ? ` · 默认：${provider.baseUrl}` : ''}
                      </div>
                    )}
                    <a
                      href={provider.docsUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-bold text-accent hover:text-accent-hover transition-colors"
                    >
                      查看官方文档
                      <ExternalLink size={12} />
                    </a>
                  </div>
                  <div className="w-full md:w-[28rem] space-y-3">
                    <input
                      type="password"
                      value={draftValues[item.envVar] || ''}
                      onChange={(event) =>
                        setDraftValues((prev) => ({ ...prev, [item.envVar]: event.target.value }))
                      }
                      placeholder={item.placeholder}
                      className="w-full rounded-2xl border border-border-main bg-secondary px-4 py-3 text-sm text-text-main placeholder:text-text-muted/40 outline-none focus:border-accent/40"
                    />
                    {item.baseUrlEnvVar && (
                      <input
                        type="text"
                        value={draftValues[item.baseUrlEnvVar] || ''}
                        onChange={(event) =>
                          setDraftValues((prev) => ({ ...prev, [item.baseUrlEnvVar as string]: event.target.value }))
                        }
                        placeholder={provider.baseUrl}
                        className="w-full rounded-2xl border border-border-main bg-secondary px-4 py-3 text-sm text-text-main placeholder:text-text-muted/40 outline-none focus:border-accent/40"
                      />
                    )}
                    <div className="flex items-center justify-end gap-2">
                      {item.baseUrlEnvVar && (
                        <button
                          onClick={() => void handleClear(item.baseUrlEnvVar as string)}
                          disabled={isSaving}
                          className="px-4 py-2 rounded-full bg-tertiary text-text-main text-sm font-bold hover:bg-secondary transition-colors disabled:opacity-50"
                        >
                          清空上游
                        </button>
                      )}
                      <button
                        onClick={() => void handleClear(item.envVar)}
                        disabled={isSaving}
                        className="px-4 py-2 rounded-full bg-tertiary text-text-main text-sm font-bold hover:bg-secondary transition-colors disabled:opacity-50"
                      >
                        清空
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

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
