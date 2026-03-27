# Google Gemini CLI 登录认证实现分析

**来源**: OpenClaw 项目 (`@mariozechner/pi-ai` 库)  
**分析日期**: 2025年3月27日  
**目标**: 借鉴 OpenClaw 的实现方式，为 OpenSynapse 项目提供本地开发认证解决方案

---

## 1. 实现概述

OpenClaw 使用 **Google Cloud Code Assist OAuth 流程** 来实现 Gemini CLI 的登录认证。这不是传统的 API Key 方式，而是完整的 OAuth 2.0 授权流程。

### 核心特点

- ✅ **无需手动管理 API Key** - 通过 Google 账号授权自动获取访问令牌
- ✅ **长期有效** - 使用 Refresh Token 自动续期，无需重复登录
- ✅ **支持免费层级** - 自动发现和配置 Google Cloud 项目
- ✅ **双模式回调** - 支持浏览器自动回调和手动粘贴重定向 URL

---

## 2. 技术实现细节

### 2.1 OAuth 配置参数

```javascript
// 客户端配置（硬编码在源码中）
const CLIENT_ID = "681255809395-oo8ft2oprd...apps.googleusercontent.com"
const CLIENT_SECRET = "GOCSPX-4uHgMPm-1o7Sk-geV6Cu5clXF..."
const REDIRECT_URI = "http://localhost:8085/oauth2callback"

// 授权范围
const SCOPES = [
    "https://www.googleapis.com/auth/cloud-platform",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile"
]

// 服务端点
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
const TOKEN_URL = "https://oauth2.googleapis.com/token"
const CODE_ASSIST_ENDPOINT = "https://cloudcode-pa.googleapis.com"
```

### 2.2 认证流程

```
┌─────────────┐     1. 启动本地服务器      ┌─────────────┐
│   用户      │ ─────────────────────────→ │  localhost  │
│             │                            │   :8085     │
└─────────────┘                            └─────────────┘
       │                                          │
       │ 2. 打开浏览器访问 Google 授权页           │
       │                                          │
       ▼                                          ▼
┌─────────────┐     3. 用户登录并授权      ┌─────────────┐
│  Google     │ ←───────────────────────── │  OAuth      │
│  账号       │                            │  服务器     │
└─────────────┘                            └─────────────┘
       │                                          │
       │ 4. 重定向到 localhost:8085/oauth2callback │
       │    携带 authorization code              │
       │                                          │
       └────────────────────────────────────────→ │
                                                  │
       5. 交换 code 获取 access_token             │
       6. 调用 Cloud Code Assist API             │
       7. 发现/配置 Google Cloud 项目            │
       8. 返回 credentials（含 refresh_token）   │
                                                  ▼
                                          ┌─────────────┐
                                          │  本地应用   │
                                          │  保存凭证   │
                                          └─────────────┘
```

### 2.3 核心代码结构

#### 步骤 1: 生成 PKCE 参数

```javascript
import { generatePKCE } from "./pkce.js"

const { verifier, challenge } = await generatePKCE()
// verifier: 随机字符串，用于后续验证
// challenge: verifier 的 SHA256 哈希，发送给 Google
```

#### 步骤 2: 启动本地回调服务器

```javascript
import { createServer } from "node:http"

async function startCallbackServer() {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url || "", `http://localhost:8085`)
      
      if (url.pathname === "/oauth2callback") {
        const code = url.searchParams.get("code")
        const state = url.searchParams.get("state")
        const error = url.searchParams.get("error")
        
        if (code && state) {
          // 返回成功页面给用户
          res.writeHead(200, { "Content-Type": "text/html" })
          res.end(oauthSuccessHtml("认证成功，可以关闭此窗口"))
          
          // 返回 code 和 state
          settleWait({ code, state })
        }
      }
    })
    
    server.listen(8085, "127.0.0.1", () => {
      resolve({ server, waitForCode: () => waitForCodePromise })
    })
  })
}
```

#### 步骤 3: 构建授权 URL

```javascript
const authParams = new URLSearchParams({
  client_id: CLIENT_ID,
  response_type: "code",
  redirect_uri: REDIRECT_URI,
  scope: SCOPES.join(" "),
  code_challenge: challenge,        // PKCE 参数
  code_challenge_method: "S256",    // PKCE 方法
  state: verifier,                  // 防 CSRF
  access_type: "offline",           // 请求 refresh_token
  prompt: "consent"                 // 强制显示授权页面
})

const authUrl = `${AUTH_URL}?${authParams.toString()}`
// 在浏览器中打开此 URL
```

#### 步骤 4: 交换 Token

```javascript
const tokenResponse = await fetch(TOKEN_URL, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    code: authorizationCode,
    grant_type: "authorization_code",
    redirect_uri: REDIRECT_URI,
    code_verifier: verifier  // PKCE 验证
  })
})

const { access_token, refresh_token, expires_in } = await tokenResponse.json()
```

#### 步骤 5: 发现和配置 Cloud 项目

```javascript
// 调用 Cloud Code Assist API 加载/创建项目
const loadResponse = await fetch(`${CODE_ASSIST_ENDPOINT}/v1internal:loadCodeAssist`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${access_token}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    cloudaicompanionProject: envProjectId,  // 可选环境变量
    metadata: {
      ideType: "IDE_UNSPECIFIED",
      platform: "PLATFORM_UNSPECIFIED",
      pluginType: "GEMINI"
    }
  })
})

// 如果没有项目，需要调用 onboardUser 创建
const onboardResponse = await fetch(`${CODE_ASSIST_ENDPOINT}/v1internal:onboardUser`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    tierId: "free-tier",  // 或 "standard-tier"
    metadata: { ... }
  })
})
```

#### 步骤 6: 刷新 Token（长期保持登录）

```javascript
export async function refreshGoogleCloudToken(refreshToken, projectId) {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token"
    })
  })
  
  const data = await response.json()
  return {
    refresh: data.refresh_token || refreshToken,
    access: data.access_token,
    expires: Date.now() + data.expires_in * 1000 - 5 * 60 * 1000,  // 提前5分钟过期
    projectId
  }
}
```

---

## 3. 数据存储结构

### 凭证格式

```typescript
interface OAuthCredentials {
  access: string      // 访问令牌（短期有效，约1小时）
  refresh: string     // 刷新令牌（长期有效，除非用户撤销）
  expires: number     // 过期时间戳（毫秒）
  projectId: string   // Google Cloud 项目 ID
}
```

### 存储建议

```javascript
// 保存到本地配置文件（加密存储）
const credentialsPath = path.join(os.homedir(), '.opensynapse', 'credentials.json')

// 文件内容示例
{
  "gemini": {
    "access": "ya29.a0ARrdaM...",
    "refresh": "1//04dL...",
    "expires": 1711555200000,
    "projectId": "gen-lang-client-0883778016"
  }
}
```

---

## 4. 错误处理

### 常见错误类型

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| `invalid_client` | Client ID/Secret 错误 | 检查硬编码的凭证是否正确 |
| `invalid_grant` | Code 已过期或已使用 | 重新启动 OAuth 流程 |
| `redirect_uri_mismatch` | 回调地址不匹配 | 确保 `localhost:8085` 与注册的一致 |
| `access_denied` | 用户拒绝授权 | 提示用户点击"允许" |
| `SECURITY_POLICY_VIOLATED` | VPC-SC 限制 | 需要使用 standard-tier 并提供自己的项目 ID |

### 用户层级处理

```javascript
const TIER_FREE = "free-tier"      // 免费用户，Google 自动配置项目
const TIER_LEGACY = "legacy-tier" // 旧版用户
const TIER_STANDARD = "standard-tier" // 标准用户，需自行提供项目 ID

// 对于非免费层级，需要设置环境变量
if (tierId !== TIER_FREE && !envProjectId) {
  throw new Error("需要设置 GOOGLE_CLOUD_PROJECT 或 GOOGLE_CLOUD_PROJECT_ID")
}
```

---

## 5. 与 OpenSynapse 的集成建议

### 方案 A: CLI 工具集成（推荐）

为 OpenSynapse 创建一个 CLI 子命令：

```bash
# 登录命令
npx tsx cli.ts auth login

# 流程：
# 1. 启动 localhost:8085 服务器
# 2. 打开浏览器进行 Google 授权
# 3. 保存 credentials 到 ~/.opensynapse/credentials.json
# 4. 后续 API 调用自动使用 access_token

# 登出命令
npx tsx cli.ts auth logout

# 刷新命令（手动触发）
npx tsx cli.ts auth refresh
```

### 方案 B: 开发服务器集成

在 `server.ts` 中添加认证端点：

```javascript
// POST /api/auth/gemini/initiate
// 启动 OAuth 流程，返回授权 URL

// GET /api/auth/gemini/callback?code=xxx&state=xxx
// OAuth 回调处理，保存凭证

// POST /api/auth/gemini/refresh
// 刷新 access_token
```

### 方案 C: 前端集成

在 React 前端添加"连接 Google 账号"按钮：

```typescript
// 点击后调用后端 API 获取授权 URL
const { authUrl } = await fetch('/api/auth/gemini/url').then(r => r.json())

// 打开弹窗或新标签页进行授权
window.open(authUrl, 'google-auth', 'width=500,height=600')

// 监听回调（通过轮询或 WebSocket）
// 成功后更新 UI 状态
```

---

## 6. 关键安全注意事项

1. **Client Secret 硬编码**: OpenClaw 的 CLIENT_ID 和 CLIENT_SECRET 是硬编码在源码中的，这是 Google Cloud Code Assist 的特殊设计，普通应用不应这样做

2. **本地服务器**: 回调服务器只监听 `127.0.0.1:8085`，不对外暴露

3. **PKCE 验证**: 使用 PKCE 防止 authorization code 被截获后滥用

4. **State 参数**: 防止 CSRF 攻击

5. **Token 存储**: 建议加密存储 refresh_token，不要明文保存在代码仓库中

---

## 7. 参考资源

- **OpenClaw 源码**: `/Users/lv/.local/share/fnm/node-versions/v24.12.0/installation/lib/node_modules/openclaw/`
- **核心文件**: `node_modules/@mariozechner/pi-ai/dist/utils/oauth/google-gemini-cli.js`
- **Skill 定义**: `skills/gemini/SKILL.md`
- **Google OAuth 文档**: https://developers.google.com/identity/protocols/oauth2

---

## 8. 下一步行动建议

1. **评估需求**: OpenSynapse 是否真的需要 OAuth 流程？如果只是简单的 API 调用，直接使用 API Key 更简单

2. **选择集成方式**: 建议先实现 CLI 工具登录（方案 A），这是 OpenClaw 的推荐方式

3. **测试验证**: 实现后需要在本地测试完整的登录、Token 刷新、API 调用流程

4. **用户体验**: 考虑添加"演示模式"或"跳过认证"选项，方便用户快速体验界面

---

**文档生成时间**: 2025-03-27  
**作者**: AI Assistant (基于 OpenClaw 源码分析)
