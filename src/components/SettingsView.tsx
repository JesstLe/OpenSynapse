import React, { useEffect, useMemo, useState } from 'react';
import { KeyRound, Save, RefreshCw, ShieldCheck, ExternalLink, CheckCircle2, CircleOff } from 'lucide-react';
import { AI_PROVIDERS } from '../lib/aiModels';

type ProviderStatus = {
  key: string;
  configured: boolean;
  valuePreview: string;
};

const PROVIDER_SETTINGS = [
  {
    providerId: 'gemini' as const,
    title: 'Google Gemini',
    envVar: 'GEMINI_API_KEY',
    placeholder: 'AIza...',
    description: '仅在你不想使用 Gemini CLI / Code Assist OAuth 时需要。',
  },
  {
    providerId: 'openai' as const,
    title: 'OpenAI',
    envVar: 'OPENAI_API_KEY',
    placeholder: 'sk-...',
    description: '用于 GPT 系列模型。',
  },
  {
    providerId: 'minimax' as const,
    title: 'MiniMax',
    envVar: 'MINIMAX_API_KEY',
    placeholder: 'your-minimax-key',
    description: '用于 MiniMax M2.5 系列模型。',
  },
  {
    providerId: 'zhipu' as const,
    title: 'Zhipu GLM',
    envVar: 'ZHIPU_API_KEY',
    placeholder: 'your-zhipu-key',
    description: '用于 GLM 系列模型。',
  },
  {
    providerId: 'moonshot' as const,
    title: 'Moonshot Kimi',
    envVar: 'MOONSHOT_API_KEY',
    placeholder: 'sk-...',
    description: '用于 Kimi K2 系列模型。',
  },
];

interface SettingsViewProps {
  onBackToChat?: () => void;
}

export default function SettingsView({ onBackToChat }: SettingsViewProps) {
  const [providerStatus, setProviderStatus] = useState<Record<string, ProviderStatus>>({});
  const [draftValues, setDraftValues] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hasUnsavedChanges = useMemo(
    () => Object.values(draftValues).some((value) => value.trim().length > 0),
    [draftValues]
  );

  const loadStatus = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/local-config/providers');
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const payload = await response.json();
      const nextStatus = Object.fromEntries(
        (payload.providers as ProviderStatus[]).map((item) => [item.key, item])
      );
      setProviderStatus(nextStatus);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

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

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-10 bg-primary text-text-main">
      <div className="max-w-5xl mx-auto space-y-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.28em] text-text-muted font-bold mb-2">Settings</p>
            <h2 className="text-3xl font-black tracking-tight">模型与密钥设置</h2>
            <p className="text-text-sub mt-2 max-w-2xl leading-relaxed">
              这里管理本地开发环境的 provider API key。Gemini 仍然优先支持 Gemini CLI / Code Assist OAuth；
              其他 provider 当前统一走 API key。
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
              onClick={loadStatus}
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
              这些密钥会保存到项目根目录的 `.env.local`。当前设置页仅在本地开发可用，生产环境不会暴露这个接口。
            </p>
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
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleClear(item.envVar)}
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
            onClick={handleSave}
            disabled={isSaving || isLoading || !hasUnsavedChanges}
            className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-3 font-bold text-white shadow-lg shadow-accent/20 transition-all hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {isSaving ? '保存中...' : '保存设置'}
          </button>
        </div>
      </div>
    </div>
  );
}
