import React, { useEffect, useState } from 'react';
import { Loader2, AlertTriangle, CheckCircle } from 'lucide-react';
import { authClient } from '../../auth/client';

export interface AuthCallbackProps {
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}

export default function AuthCallback({ onSuccess, onError }: AuthCallbackProps) {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    const handleCallback = async () => {
      try {
        const { data, error } = await authClient.getSession();
        
        if (error) {
          throw new Error(error.message || '授权登录失败');
        }

        if (!data?.user) {
          throw new Error('无法获取用户信息');
        }

        setStatus('success');
        onSuccess?.();
        
        setTimeout(() => {
          window.location.href = '/';
        }, 1500);
      } catch (err) {
        const message = err instanceof Error ? err.message : '登录失败，请重试';
        setErrorMessage(message);
        setStatus('error');
        onError?.(err instanceof Error ? err : new Error(message));
      }
    };

    handleCallback();
  }, [onSuccess, onError]);

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

  if (status === 'success') {
    return (
      <div className="min-h-screen bg-primary text-text-main flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-secondary border border-border-main rounded-2xl p-6 shadow-xl">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/10 text-green-500">
              <CheckCircle className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold">登录成功</h1>
              <p className="text-sm text-text-sub mt-1">
                正在跳转到首页...
              </p>
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
              正在建立安全会话，请稍候...
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
