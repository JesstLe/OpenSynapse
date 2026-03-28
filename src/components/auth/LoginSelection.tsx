import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Chrome, MessageCircle, MessageSquare, Loader2, Sparkles, Lock, ArrowRight } from 'lucide-react';
import { cn } from '../../lib/utils';

interface LoginSelectionProps {
  onGoogleLogin: () => Promise<void>;
  onAuthError?: (error: string) => void;
}

type LoginProvider = 'google' | 'wechat' | 'qq';

interface ProviderConfig {
  id: LoginProvider;
  name: string;
  icon: React.ReactNode;
  brandIcon: React.ReactNode;
  color: string;
  bgColor: string;
  hoverColor: string;
  shadowColor: string;
  description: string;
}

export default function LoginSelection({ onGoogleLogin, onAuthError }: LoginSelectionProps) {
  const [loadingProvider, setLoadingProvider] = useState<LoginProvider | null>(null);

  const providers: ProviderConfig[] = [
    {
      id: 'google',
      name: 'Google',
      icon: <Chrome className="w-5 h-5" />,
      brandIcon: (
        <svg viewBox="0 0 24 24" className="w-6 h-6">
          <path
            fill="currentColor"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="currentColor"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="currentColor"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
          />
          <path
            fill="currentColor"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
          />
        </svg>
      ),
      color: '#EA4335',
      bgColor: 'bg-white',
      hoverColor: 'hover:bg-gray-50',
      shadowColor: 'shadow-gray-500/20',
      description: '使用 Google 账号登录',
    },
  ];

  const handleGoogleLogin = async () => {
    setLoadingProvider('google');
    try {
      await onGoogleLogin();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Google 登录失败';
      onAuthError?.(errorMessage);
    } finally {
      setLoadingProvider(null);
    }
  };

  const handleOAuthLogin = async (provider: LoginProvider, endpoint: string) => {
    setLoadingProvider(provider);
    try {
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`服务器返回错误: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.authUrl) {
        window.location.href = data.authUrl;
      } else {
        throw new Error('未收到授权地址');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : `${provider} 登录失败`;
      onAuthError?.(errorMessage);
      setLoadingProvider(null);
    }
  };

  const handleProviderClick = (provider: ProviderConfig) => {
    if (loadingProvider) return;

    switch (provider.id) {
      case 'google':
        void handleGoogleLogin();
        break;
      case 'wechat':
        void handleOAuthLogin('wechat', '/auth/wechat/start');
        break;
      case 'qq':
        void handleOAuthLogin('qq', '/auth/qq/start');
        break;
    }
  };

  return (
    <div className="min-h-screen bg-primary flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-accent/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-purple-500/5 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-radial from-accent/3 to-transparent rounded-full" />
      </div>

      <div 
        className="absolute inset-0 opacity-[0.02] pointer-events-none"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
          backgroundSize: '50px 50px',
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full max-w-md"
      >
        <div className="relative bg-card/80 backdrop-blur-xl rounded-[2rem] border border-border-main shadow-2xl overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-accent via-purple-500 to-accent opacity-50" />
          
          <div className="p-8 md:p-10">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.4 }}
              className="text-center mb-10"
            >
              <div className="relative inline-flex items-center justify-center mb-6">
                <div className="absolute inset-0 bg-accent/20 rounded-3xl blur-xl" />
                <div className="relative w-20 h-20 rounded-2xl bg-secondary border border-border-main flex items-center justify-center shadow-lg">
                  <img 
                    src="/logo.png" 
                    alt="OpenSynapse" 
                    className="w-14 h-14 object-contain"
                  />
                </div>
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                  className="absolute -top-1 -right-1"
                >
                  <Sparkles className="w-4 h-4 text-accent/60" />
                </motion.div>
              </div>

              <h1 className="text-3xl font-black tracking-tight text-text-main mb-2">
                欢迎回来
              </h1>
              <p className="text-text-sub text-sm leading-relaxed">
                选择一种方式登录 OpenSynapse
              </p>
            </motion.div>

            <div className="space-y-3">
              <AnimatePresence mode="wait">
                {providers.map((provider, index) => (
                  <motion.button
                    key={provider.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2 + index * 0.1, duration: 0.4 }}
                    onClick={() => handleProviderClick(provider)}
                    disabled={loadingProvider !== null}
                    className={cn(
                      "group relative w-full flex items-center gap-4 p-4 rounded-2xl",
                      "border border-border-main transition-all duration-300",
                      "hover:border-accent/30 hover:shadow-lg",
                      loadingProvider === provider.id
                        ? "bg-secondary cursor-wait"
                        : "bg-tertiary/50 hover:bg-secondary cursor-pointer",
                      loadingProvider && loadingProvider !== provider.id && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    <div
                      className={cn(
                        "relative flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center",
                        "transition-transform duration-300 group-hover:scale-110",
                        provider.id === 'google'
                          ? "bg-white text-gray-700 shadow-md"
                          : cn(provider.bgColor, "text-white shadow-lg", provider.shadowColor)
                      )}
                    >
                      {loadingProvider === provider.id ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        provider.brandIcon
                      )}
                    </div>

                    <div className="flex-1 text-left">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-text-main">
                          {loadingProvider === provider.id ? '登录中...' : provider.name}
                        </span>
                        {provider.id === 'google' && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent/10 text-accent font-bold">
                            推荐
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-text-muted mt-0.5">
                        {provider.description}
                      </p>
                    </div>

                    <motion.div
                      initial={{ opacity: 0, x: -10 }}
                      whileHover={{ opacity: 1, x: 0 }}
                      className="text-text-muted group-hover:text-accent transition-colors"
                    >
                      <ArrowRight className="w-5 h-5" />
                    </motion.div>

                    <div
                      className={cn(
                        "absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none",
                        "bg-gradient-to-r from-transparent via-accent/5 to-transparent"
                      )}
                    />
                  </motion.button>
                ))}
              </AnimatePresence>
            </div>

            <div className="relative my-8">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border-main" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-card px-4 text-xs text-text-muted uppercase tracking-widest font-bold">
                  安全登录
                </span>
              </div>
            </div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6, duration: 0.4 }}
              className="flex items-center justify-center gap-2 text-xs text-text-muted"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>您的登录信息将被加密保护</span>
            </motion.div>
          </div>

          <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-accent/5 to-transparent pointer-events-none" />
        </div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7, duration: 0.4 }}
          className="text-center mt-6 text-xs text-text-muted"
        >
          登录即表示您同意我们的服务条款和隐私政策
        </motion.p>
      </motion.div>
    </div>
  );
}
