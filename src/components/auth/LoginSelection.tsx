import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Chrome, Loader2, Sparkles, Lock, ArrowRight, Mail, Eye, EyeOff, UserPlus, LogIn } from 'lucide-react';
import { cn } from '../../lib/utils';
import { authClient } from '../../auth/client';

interface LoginSelectionProps {
  onSocialLogin?: (provider: LoginProvider) => Promise<void>;
  onAuthError?: (error: string) => void;
}

type LoginProvider = 'google' | 'github' | 'discord';

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

export default function LoginSelection({ onSocialLogin, onAuthError }: LoginSelectionProps) {
  const [loadingProvider, setLoadingProvider] = useState<LoginProvider | null>(null);

  const [isRegistering, setIsRegistering] = useState(false);
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [registerConfirmPassword, setRegisterConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAutoLoggingIn, setIsAutoLoggingIn] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [showEmailLogin, setShowEmailLogin] = useState(true);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [showLoginPassword, setShowLoginPassword] = useState(false);

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
    {
      id: 'github',
      name: 'GitHub',
      icon: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>,
      brandIcon: <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>,
      color: '#333',
      bgColor: 'bg-[#333]',
      hoverColor: 'hover:bg-[#222]',
      shadowColor: 'shadow-gray-500/30',
      description: '使用 GitHub 账号登录',
    },
    {
      id: 'discord',
      name: 'Discord',
      icon: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>,
      brandIcon: <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>,
      color: '#5865F2',
      bgColor: 'bg-[#5865F2]',
      hoverColor: 'hover:bg-[#4752C4]',
      shadowColor: 'shadow-indigo-500/30',
      description: '使用 Discord 账号登录',
    },
  ];

  const handleProviderClick = async (provider: ProviderConfig) => {
    if (loadingProvider || !onSocialLogin) return;
    setLoadingProvider(provider.id);
    try {
      await onSocialLogin(provider.id);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : `${provider.name} 登录失败`;
      onAuthError?.(errorMessage);
    } finally {
      setLoadingProvider(null);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegisterError(null);

    if (!registerEmail || !registerPassword || !registerConfirmPassword) {
      setRegisterError('请填写所有字段');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(registerEmail)) {
      setRegisterError('请输入有效的邮箱地址');
      return;
    }

    if (registerPassword.length < 8) {
      setRegisterError('密码至少需要 8 个字符');
      return;
    }

    if (registerPassword !== registerConfirmPassword) {
      setRegisterError('两次输入的密码不一致');
      return;
    }

    setIsSubmitting(true);
    setIsAutoLoggingIn(true);
    try {
      const signUpResult = await authClient.signUp.email({
        email: registerEmail,
        password: registerPassword,
        name: registerEmail.split('@')[0],
      });

      if (signUpResult.error) {
        throw signUpResult.error;
      }

      const signInResult = await authClient.signIn.email({
        email: registerEmail,
        password: registerPassword,
      });

      if (signInResult.error) {
        throw signInResult.error;
      }

      window.location.href = window.location.origin;
    } catch (error) {
      const err = error as { message?: string; code?: string };
      if (err.code === 'EMAIL_ALREADY_IN_USE' || err.message?.includes('already')) {
        setRegisterError('该邮箱已被注册，请直接登录或使用其他邮箱');
      } else {
        setRegisterError(err.message || '注册失败，请稍后重试');
      }
      setIsAutoLoggingIn(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);

    if (!loginEmail || !loginPassword) {
      setLoginError('请输入邮箱和密码');
      return;
    }

    setIsSubmitting(true);
    try {
      await authClient.signIn.email({
        email: loginEmail,
        password: loginPassword,
      });
    } catch (error) {
      const err = error as { message?: string };
      setLoginError(err.message || '登录失败，请检查邮箱和密码');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isFormMode = isRegistering || showEmailLogin;

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

              <AnimatePresence mode="wait">
                <motion.h1
                  key={isRegistering ? 'register' : showEmailLogin ? 'email-login' : 'welcome'}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  className="text-3xl font-black tracking-tight text-text-main mb-2"
                >
                  {isRegistering ? '创建账号' : '欢迎回来'}
                </motion.h1>
              </AnimatePresence>
              <p className="text-text-sub text-sm leading-relaxed">
                {isRegistering ? '填写以下信息注册新账号' : showEmailLogin ? '使用邮箱和密码登录' : '选择一种方式登录 OpenSynapse'}
              </p>
            </motion.div>

            <div className="space-y-3">
              <AnimatePresence mode="wait">
                {!isFormMode && providers.map((provider, index) => (
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

            {!isFormMode && (
              <div className="relative flex items-center my-4">
                <div className="flex-1 h-px bg-border-main" />
                <span className="px-3 text-xs text-text-muted">或</span>
                <div className="flex-1 h-px bg-border-main" />
              </div>
            )}

            <AnimatePresence mode="wait">
              {!isFormMode && (
                <motion.div
                  key="login-options"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-2"
                >
                  <button
                    onClick={() => {
                      setShowEmailLogin(true);
                      setLoginError(null);
                    }}
                    className="w-full py-3 text-sm text-text-muted hover:text-accent transition-colors flex items-center justify-center gap-2 border border-border-main rounded-xl hover:border-accent/30"
                  >
                    <Mail className="w-4 h-4" />
                    <span>使用邮箱密码登录</span>
                  </button>
                  <button
                    onClick={() => {
                      setIsRegistering(true);
                      setRegisterError(null);
                    }}
                    className="w-full py-3 text-sm text-text-muted hover:text-accent transition-colors flex items-center justify-center gap-2"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>没有账号？注册一个</span>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {showEmailLogin && !isRegistering && (
                <motion.div
                  key="email-login-form"
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-4"
                >
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
                    <input
                      type="email"
                      placeholder="邮箱地址"
                      value={loginEmail}
                      onChange={(e) => {
                        setLoginEmail(e.target.value);
                        setLoginError(null);
                      }}
                      className="w-full pl-12 pr-4 py-3 bg-background border border-border-main rounded-lg text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-accent"
                    />
                  </div>

                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
                    <input
                      type={showLoginPassword ? "text" : "password"}
                      placeholder="密码"
                      value={loginPassword}
                      onChange={(e) => {
                        setLoginPassword(e.target.value);
                        setLoginError(null);
                      }}
                      className="w-full pl-12 pr-12 py-3 bg-background border border-border-main rounded-lg text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-accent"
                    />
                    <button
                      type="button"
                      onClick={() => setShowLoginPassword(!showLoginPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted"
                    >
                      {showLoginPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>

                  {loginError && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="p-3 bg-error/10 border border-error/30 rounded-lg text-error text-sm"
                    >
                      {loginError}
                    </motion.div>
                  )}

                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setShowEmailLogin(false);
                        setLoginError(null);
                        setLoginEmail('');
                        setLoginPassword('');
                      }}
                      className="flex-1 py-3 px-4 border border-border-main rounded-lg text-text-primary hover:bg-background"
                    >
                      返回
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleEmailLogin(e as any)}
                      disabled={isSubmitting || isAutoLoggingIn}
                      className="flex-1 py-3 px-4 bg-accent text-white rounded-lg hover:bg-accent/90 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
                      {isSubmitting ? "登录中..." : "登录"}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {isRegistering && (
                <motion.div
                  key="register-form"
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-4"
                >
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
                    <input
                      type="email"
                      placeholder="邮箱地址"
                      value={registerEmail}
                      onChange={(e) => {
                        setRegisterEmail(e.target.value);
                        setRegisterError(null);
                      }}
                      className="w-full pl-12 pr-4 py-3 bg-background border border-border-main rounded-lg text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-accent"
                    />
                  </div>

                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
                    <input
                      type={showPassword ? "text" : "password"}
                      placeholder="密码（至少 8 个字符）"
                      value={registerPassword}
                      onChange={(e) => {
                        setRegisterPassword(e.target.value);
                        setRegisterError(null);
                      }}
                      className="w-full pl-12 pr-12 py-3 bg-background border border-border-main rounded-lg text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-accent"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted"
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>

                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
                    <input
                      type={showConfirmPassword ? "text" : "password"}
                      placeholder="确认密码（确保两次输入一致）"
                      value={registerConfirmPassword}
                      onChange={(e) => {
                        setRegisterConfirmPassword(e.target.value);
                        setRegisterError(null);
                      }}
                      className="w-full pl-12 pr-12 py-3 bg-background border border-border-main rounded-lg text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-accent"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted"
                    >
                      {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>

                  {registerError && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="p-3 bg-error/10 border border-error/30 rounded-lg text-error text-sm"
                    >
                      {registerError}
                    </motion.div>
                  )}

                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setIsRegistering(false);
                        setRegisterError(null);
                        setRegisterEmail("");
                        setRegisterPassword("");
                        setRegisterConfirmPassword("");
                      }}
                      className="flex-1 py-3 px-4 border border-border-main rounded-lg text-text-primary hover:bg-background"
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleRegister(e as any)}
                      disabled={isSubmitting || isAutoLoggingIn}
                      className="flex-1 py-3 px-4 bg-accent text-white rounded-lg hover:bg-accent/90 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {(isSubmitting || isAutoLoggingIn) ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                      {isAutoLoggingIn ? "正在登录..." : isSubmitting ? "注册中..." : "创建账号并登录"}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="relative flex justify-center">
              <span className="bg-card px-4 text-xs text-text-muted uppercase tracking-widest font-bold">
                安全登录
              </span>
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
