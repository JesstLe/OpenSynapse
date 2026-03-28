// 用户档案类型定义
// 对应 Firestore: users/{firebaseUid}

export interface UserProfile {
  uid: string;                          // Firebase UID
  displayName: string;                  // 显示名称
  avatarUrl?: string;                   // 头像 URL
  primaryLoginProvider: 'google' | 'wechat' | 'qq';  // 主要登录方式
  email?: string;                       // 邮箱（可选）
  phone?: string;                       // 手机号（可选，微信/QQ可能有）
  createdAt: number;                    // 创建时间
  updatedAt: number;                    // 更新时间
  lastLoginAt: number;                  // 最后登录时间
  loginProviders: ('google' | 'wechat' | 'qq')[];  // 已绑定的登录方式列表
  isActive: boolean;                    // 账号是否激活
}

// 第三方账号连接映射
// 对应 Firestore: connected_accounts/{provider}_{providerUserId}
export interface ConnectedAccount {
  id: string;                           // 复合ID: {provider}_{providerUserId}
  provider: 'google' | 'wechat' | 'qq'; // 提供商
  providerUserId: string;               // 第三方平台的用户ID (openid/sub)
  unionId?: string;                     // 微信 unionid（如果有）
  firebaseUid: string;                  // 关联的 Firebase UID
  displayName?: string;                 // 第三方平台昵称
  avatarUrl?: string;                   // 第三方平台头像
  linkedAt: number;                     // 绑定时间
  lastLoginAt: number;                  // 最后登录时间
  status: 'active' | 'revoked';         // 状态
}

// 用户级 API Key 和 Provider 凭证
// 对应 Firestore: account_secrets/{firebaseUid}
// ⚠️ 此集合需要严格的安全规则，仅允许用户自己访问
export interface AccountSecret {
  id: string;                           // firebaseUid
  // Gemini
  geminiApiKey?: string;                // 用户自己的 Gemini API Key
  // OpenAI
  openaiApiKey?: string;                // 用户自己的 OpenAI API Key
  openaiBaseUrl?: string;               // 自定义 OpenAI Base URL
  // MiniMax
  minimaxApiKey?: string;               // 用户自己的 MiniMax API Key
  minimaxBaseUrl?: string;
  // 智谱
  zhipuApiKey?: string;
  zhipuBaseUrl?: string;
  // Moonshot
  moonshotApiKey?: string;
  moonshotBaseUrl?: string;
  // OAuth 凭证（如果需要长期保存）
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

// 认证会话（短期）
// 用于 OAuth 流程中的状态管理
export interface AuthSession {
  id: string;
  provider: 'wechat' | 'qq';
  state: string;                        // CSRF 防护状态码
  nonce?: string;                       // 可选的 nonce
  redirectTo?: string;                  // 登录后重定向地址
  action: 'login' | 'link';             // 登录或绑定
  currentFirebaseUid?: string;          // 当前用户 UID（绑定操作时）
  createdAt: number;
  expiresAt: number;
  consumedAt?: number;                  // 消费时间
}

// 登录结果
export interface LoginResult {
  success: boolean;
  firebaseToken?: string;               // Firebase Custom Token
  firebaseUid?: string;
  user?: UserProfile;
  isNewUser?: boolean;                  // 是否新用户
  error?: string;
}

// 账号绑定结果
export interface LinkAccountResult {
  success: boolean;
  provider: 'wechat' | 'qq' | 'google';
  linked: boolean;
  error?: string;
}
