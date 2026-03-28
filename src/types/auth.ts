// Legacy auth types - kept for reference
// These types were used with the old Firebase auth system
// The application now uses better-auth (see src/auth/)

export interface UserProfile {
  uid: string;
  displayName: string;
  avatarUrl?: string;
  primaryLoginProvider: 'google' | 'wechat' | 'qq';
  email?: string;
  phone?: string;
  createdAt: number;
  updatedAt: number;
  lastLoginAt: number;
  loginProviders: ('google' | 'wechat' | 'qq')[];
  isActive: boolean;
}

export interface ConnectedAccount {
  id: string;
  provider: 'google' | 'wechat' | 'qq';
  providerUserId: string;
  unionId?: string;
  userId: string;
  displayName?: string;
  avatarUrl?: string;
  linkedAt: number;
  lastLoginAt: number;
  status: 'active' | 'revoked';
}

export interface AccountSecret {
  id: string;
  geminiApiKey?: string;
  openaiApiKey?: string;
  openaiBaseUrl?: string;
  minimaxApiKey?: string;
  minimaxBaseUrl?: string;
  zhipuApiKey?: string;
  zhipuBaseUrl?: string;
  moonshotApiKey?: string;
  moonshotBaseUrl?: string;
  providerTokens?: {
    wechat?: {
      accessToken?: string;
      refreshToken?: string;
      expiresAt?: number;
    };
    qq?: {
      accessToken?: string;
      refreshToken?: string;
      expiresAt?: number;
    };
  };
  updatedAt: number;
}

export interface AuthSession {
  id: string;
  provider: 'wechat' | 'qq';
  state: string;
  nonce?: string;
  redirectTo?: string;
  action: 'login' | 'link';
  currentUserId?: string;
  createdAt: number;
  expiresAt: number;
  consumedAt?: number;
}

export interface LoginResult {
  success: boolean;
  token?: string;
  userId?: string;
  user?: UserProfile;
  isNewUser?: boolean;
  error?: string;
}

export interface LinkAccountResult {
  success: boolean;
  provider: 'wechat' | 'qq' | 'google';
  linked: boolean;
  error?: string;
}
