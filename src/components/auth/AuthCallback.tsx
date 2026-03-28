import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import { signInWithCustomToken } from 'firebase/auth';
import { auth } from '../../firebase';

export interface AuthCallbackProps {
  onSuccess?: (provider: string, isNewUser: boolean) => void;
  onError?: (error: Error) => void;
  onComplete?: () => void;
}

function getFriendlyErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return '登录失败，请重试。';
  }

  const message = error.message.toLowerCase();

  if (message.includes('auth/invalid-custom-token')) {
    return '登录凭证无效，请重新发起授权登录。';
  }
  if (message.includes('auth/custom-token-mismatch')) {
    return '登录凭证与当前应用不匹配，请重新授权。';
  }
  if (message.includes('auth/user-disabled')) {
    return '该账号已被禁用，请联系管理员。';
  }
  if (message.includes('auth/network-request-failed')) {
    return '网络异常，请检查网络后重试。';
  }

  return '登录失败，请稍后重试。';
}

function providerName(provider: string | null): string {
  if (provider === 'wechat') return '微信';
  if (provider === 'qq') return 'QQ';
  return '第三方';
}

function parseIsNewUser(value: string | null): boolean {
  return value?.toLowerCase() === 'true';
}

export default function AuthCallback({ onSuccess, onError, onComplete }: AuthCallbackProps) {
  const [status, setStatus] = useState<'loading' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const hasStartedRef = useRef(false);

  const params = useMemo(() => {
    if (typeof window === 'undefined') {
      return {
        token: null,
        provider: null,
        isNewUser: false,
      };
    }

    const searchParams = new URLSearchParams(window.location.search);
    return {
      token: searchParams.get('token'),
      provider: searchParams.get('provider'),
      isNewUser: parseIsNewUser(searchParams.get('isNewUser')),
    };
  }, []);

  useEffect(() => {
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;

    let isMounted = true;

    const completeOAuth = async () => {
      try {
        if (!params.token) {
          throw new Error('missing_token');
        }

        await signInWithCustomToken(auth, params.token);

        if (!isMounted) return;

        const cleanPath = window.location.pathname;
        window.history.replaceState({}, document.title, cleanPath);

        if (onSuccess) {
          onSuccess(params.provider ?? 'unknown', params.isNewUser);
          onComplete?.();
          return;
        }

        onComplete?.();

        window.location.assign('/');
      } catch (err) {
        if (!isMounted) return;

        const normalizedError =
          err instanceof Error
            ? err
            : new Error(typeof err === 'string' ? err : 'OAuth callback failed');

        const friendly = normalizedError.message === 'missing_token'
          ? '缺少登录凭证，请从微信或 QQ 登录入口重新进入。'
          : getFriendlyErrorMessage(normalizedError);

        setErrorMessage(friendly);
        setStatus('error');
        onError?.(normalizedError);
      }
    };

    void completeOAuth();

    return () => {
      isMounted = false;
    };
  }, [onComplete, onError, onSuccess, params.isNewUser, params.provider, params.token]);

  if (status === 'error') {
    return (
      <div className="min-h-screen bg-primary text-text-main flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-secondary border border-border-main rounded-2xl p-6 shadow-xl">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 p-2 rounded-lg bg-red-500/10 text-red-500">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="space-y-2">
              <h1 className="text-lg font-bold">授权登录失败</h1>
              <p className="text-sm text-text-sub leading-relaxed">{errorMessage}</p>
              <button
                type="button"
                onClick={() => window.location.assign('/')}
                className="mt-2 px-4 py-2 rounded-xl bg-accent text-white text-sm font-semibold hover:bg-accent-hover transition-colors"
              >
                返回首页
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-primary text-text-main flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-secondary border border-border-main rounded-2xl p-6 shadow-xl">
        <div className="flex items-center gap-3">
          <Loader2 className="w-5 h-5 animate-spin text-accent" />
          <div>
            <h1 className="text-lg font-bold">正在完成授权登录</h1>
            <p className="text-sm text-text-sub mt-1">
              正在使用 {providerName(params.provider)} 账号建立安全会话，请稍候...
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
