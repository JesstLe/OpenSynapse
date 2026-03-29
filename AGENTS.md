# OpenSynapse (突触) - AGENTS.md

**Updated:** 2026-03-30 (Default model MiniMax M2.7, general-chat persona, UI compact)
**Branch:** main

## Overview

OpenSynapse 是一个 AI 驱动的知识复利系统，核心能力包括：

- **多导师人格系统** - 通用助手（默认）、计算机、数学、法学、金融等专业导师，每种人格有独特的教学风格
- **系统提示词安全边界** - 所有人格内置 prompt injection 防护、系统提示词保密、恶意内容拒绝
- **AI 学习会话** - 流式对话、思考过程展示、停止/重新生成功能
- **知识提炼** - 从对话或文档自动提取结构化笔记和闪卡
- **对话导入** - 支持 JSON、Markdown、纯文本格式导入历史对话，新增Gemini网页导出格式支持
- **多 AI 提供商** - 支持 Gemini、OpenAI、MiniMax、智谱 GLM、Moonshot Kimi
- **FSRS 复习** - 基于间隔重复算法的科学复习系统
- **知识图谱** - D3.js 可视化展示概念关联
- **明暗主题** - 支持亮色/暗色模式切换
- **自托管架构** - better-auth + PostgreSQL + Chroma，完全独立于 Firebase
- **CLI 工具** - 命令行导入、多提供商支持、批量处理

**[MIGRATION COMPLETE]** 项目已从 Firebase 完全迁移到自托管架构。所有数据存储在 PostgreSQL，认证使用 better-auth，向量数据库使用 Chroma。

---

## Current Architecture

### Frontend

- `src/App.tsx`
  - 应用主入口
  - 登录态管理（better-auth）
  - PostgreSQL 数据同步
  - 主视图切换
  - 主题状态管理（明暗切换）
- `src/components/ChatView.tsx`
  - 学习会话 UI
  - 流式对话与思考过程展示
  - 人格切换（多导师系统）
  - 模型切换（多提供商支持）
  - 图片 / PDF / URL 入口
  - 会话保存与历史
  - LaTeX数学公式渲染支持
- `src/components/DashboardView.tsx`
  - 仪表盘与数据概览
- `src/components/GraphView.tsx`
  - 知识图谱可视化
- `src/components/NotesView.tsx`
  - 笔记管理与 Markdown 渲染
- `src/components/ReviewView.tsx`
  - FSRS 复习系统
- `src/components/ImportDialog.tsx`
  - 对话导入弹窗
  - 支持 JSON / Markdown / 纯文本
  - 解析预览与去重检测
- `src/components/SettingsView.tsx`
  - 提供商配置（API Key / OAuth）
  - 人格管理（预设 + 自定义）
  - 主题切换
- `src/lib/personas.ts`
  - 多导师人格系统
  - 预设人格定义（通用助手 / CS / 数学 / 法学 / 金融）
  - 隐藏人格机制
  - 安全边界防护（prompt injection 拒绝、系统提示词保密）

### AI Layer

- `src/services/gemini.ts`
  - 前端 AI 业务逻辑
  - 流式对话与思考过程展示
  - 聊天、RAG、文档解构、语义链接、embedding
- `src/api/ai.ts`
  - 服务端 AI 路由
  - 多提供商请求分发（Gemini / OpenAI / MiniMax / 智谱 / Moonshot）
  - 优先 API Key，否则复用 Gemini CLI / Code Assist OAuth
- `src/lib/codeAssist.ts`
  - Code Assist `generateContent` 请求封装
  - fallback 模型逻辑
  - 流式 SSE 解析
- `src/lib/providerGateway.ts`
  - 非 Gemini 提供商的统一网关
  - OpenAI 兼容协议适配
  - Anthropic 兼容协议适配（MiniMax / 智谱）
- `src/lib/oauth.ts`
  - Gemini CLI / Code Assist 风格 OAuth
  - 解析本机 `gemini` CLI 内置 client
  - PKCE、本地回调、token 刷新、project 探测
- `src/lib/openaiCodexOAuth.ts`
  - OpenAI Codex 风格 OAuth 实现
  - 支持 OpenAI 官方 OAuth 登录
- `src/lib/aiModels.ts`
  - 多提供商模型配置
  - 模型列表与协议定义（gemini_native / openai_compat / anthropic_compat）
  - fallback 策略
  - 默认文本模型：MiniMax M2.7，默认 Embedding：智谱 embedding-3
- `src/services/importParsers.ts`
  - 对话导入解析器
  - 支持 JSON / Markdown / 纯文本自动检测
  - ChatGPT 官方导出格式（mapping/chat_messages/data 数组）
  - 自定义格式导入（用户可定义角色标记）
  - 去重检测与会话转换

### Data Layer

- `src/db/`
  - PostgreSQL 数据库配置和 Drizzle ORM schema
- `src/db/index.ts`
  - 数据库连接池配置（生产级设置）
- `src/repositories/`
  - 数据访问层（notes, flashcards, chat, personas, api-keys）
- `src/types.ts`
  - Note / Flashcard / ChatSession 等类型

### CLI

- `scripts/cli.ts`
  - CLI 主入口
  - `auth` 子命令（login / status / logout）
  - `import` 子命令（批量导入对话）
  - 文件导入与同步
  - 支持多提供商模型
- `scripts/cli-auth.ts`
  - 登录 / 状态 / 登出
  - OAuth 流程实现
  - 凭证管理与刷新

### Server

- `server.ts`
  - Express + Vite 开发服务器
  - better-auth 中间件集成
  - `/api/ai/*` - AI 路由（需认证）
  - `/api/data/*` - 数据 CRUD 路由
  - 社交登录 OAuth 回调处理

---

## Key Files

| Task | File | Notes |
|------|------|-------|
| 聊天 UI | `src/components/ChatView.tsx` | 模型切换、人格切换、流式对话、停止/重新生成 |
| 聊天业务逻辑 | `src/services/gemini.ts` | 流式 SSE 解析、思考过程展示、RAG |
| 服务端 AI 请求 | `src/api/ai.ts` | 多提供商路由（Gemini/OpenAI/MiniMax/智谱/Moonshot） |
| Provider 网关 | `src/lib/providerGateway.ts` | OpenAI/Anthropic 兼容协议适配 |
| OAuth 登录 | `src/lib/oauth.ts` | Gemini CLI / Code Assist OAuth |
| OpenAI OAuth | `src/lib/openaiCodexOAuth.ts` | Codex 风格 OAuth 实现 |
| Code Assist 请求 | `src/lib/codeAssist.ts` | `cloudcode-pa.googleapis.com` |
| 模型配置 | `src/lib/aiModels.ts` | 多提供商模型列表与 fallback 策略，默认 MiniMax M2.7 |
| 人格系统 | `src/lib/personas.ts` | 多导师人格定义、通用助手（默认）、安全边界防护 |
| 对话导入 | `src/services/importParsers.ts` | JSON/Markdown/TXT 解析与去重，支持Gemini网页导出格式 |
| 导入弹窗 | `src/components/ImportDialog.tsx` | 文件拖拽、粘贴、预览、导入 |
| 数学公式 | `src/components/ChatView.tsx` | LaTeX数学公式渲染（remark-math + rehype-katex） |
| 设置中心 | `src/components/SettingsView.tsx` | 提供商配置、人格管理、主题切换、知识提炼模型配置 |
| 知识提炼模型 | `src/lib/aiModels.ts` | 用户可配置结构化输出模型（独立于对话模型） |
| CLI 认证 | `scripts/cli-auth.ts` | `auth login/status/logout` |
| CLI 导入 | `scripts/cli.ts` | 文件解析后同步到后端、批量导入 |
| PostgreSQL 保存 | `src/App.tsx` | 会话、笔记、闪卡写入 |

---

## Entry Points

- Development: `npm run dev`
- Build: `npm run build`
- Type check / lint: `npm run lint`
- CLI auth login: `npx tsx cli.ts auth login`
- CLI auth status: `npx tsx cli.ts auth status`
- CLI file import: `npx tsx cli.ts <file.txt>`

默认开发地址：

- `http://localhost:3000`

OAuth 本地回调地址：

- `http://localhost:3088/oauth2callback`

---

## Auth System

### Multi-Provider Authentication

OpenSynapse uses better-auth for authentication with support for multiple login methods:

**Social Login:**
- **Google** - OAuth 2.0
- **GitHub** - OAuth 2.0
- **Discord** - OAuth 2.0

**Email/Password:**
- **Registration** - Users can create accounts with email and password
- **Login** - Direct email/password authentication
- **Password Requirements** - Minimum 8 characters, maximum 128 characters

### Architecture

```
User clicks login → Frontend redirects to provider OAuth
                           ↓
                Provider callback to /api/auth/{provider}/callback
                           ↓
           better-auth handles OAuth flow
                           ↓
           User created in PostgreSQL (better-auth tables)
                           ↓
           Session cookie set
                           ↓
           User is now authenticated
```

### Data Isolation

Each user has completely independent data:

- **PostgreSQL tables per user:**
  - `users` - User profile (managed by better-auth)
  - `accounts` - Social provider accounts
  - `sessions` - Active sessions
  - `notes` (with userId field) - Personal notes
  - `flashcards` (with userId field) - Personal flashcards
  - `chat_sessions` (with userId field) - Personal chat sessions
  - `custom_personas` (with userId field) - Personal personas

- **Account binding:** One user can bind multiple login methods
  - Primary key is user ID from better-auth
  - `accounts` table maps provider IDs to user

### Key Files

| Component | File | Description |
|-----------|------|-------------|
| Login UI | `src/components/auth/LoginSelection.tsx` | Multi-provider login selection |
| Auth Config | `src/auth/server.ts` | better-auth server configuration |
| Auth Client | `src/auth/client.ts` | better-auth client utilities |
| Auth Middleware | `src/api/auth-middleware.ts` | Route authentication middleware |
| Account Binding | SettingsView section | Manage connected accounts |

### Environment Variables

```bash
# Better-Auth Secret (required)
BETTER_AUTH_SECRET=your-super-secret-auth-key-minimum-32-chars

# Google OAuth
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# GitHub OAuth
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret

# Discord OAuth
DISCORD_CLIENT_ID=your_discord_client_id
DISCORD_CLIENT_SECRET=your_discord_client_secret

# Database (required)
DATABASE_URL=postgresql://opensynapse:password@localhost:5432/opensynapse
```

---

## User-Level API Keys

For commercial multi-tenant use, API keys are stored per-user in PostgreSQL.

### Storage

- **Location:** PostgreSQL `api_keys` table
- **Structure:** `{ id, userId, provider, key, createdAt }`
- **Security:** Row-level isolation via userId filtering

### Priority

1. User's personal API key (from PostgreSQL)
2. Global environment variable (fallback)
3. OAuth token (for Gemini, if no API key)

### Key Files

| Component | File | Description |
|-----------|------|-------------|
| API Key Repository | `src/repositories/apiKey.repo.ts` | Database operations for API keys |
| API Key Service | `src/services/userApiKeyService.ts` (client) / `.server.ts` (server) | CRUD operations |
| Settings UI | `src/components/SettingsView.tsx` | Personal API key configuration |
| Server Routes | `src/api/ai.ts` | Reads user key with env fallback |

---

## Legacy Auth Notes

当前认证主路径是：

- **Gemini CLI / Google Code Assist 风格 OAuth**

不是：

- 传统自建 Desktop OAuth + `generative-language` scope
- 也不是把 OAuth access token 当 `GEMINI_API_KEY`

认证实现特点：

- 优先复用本机已安装 `gemini` 命令内置的 OAuth client
- 登录成功后保存到 `~/.opensynapse/credentials.json`
- Access Token 短期有效，Refresh Token 自动续期
- Web 后端和 CLI 都可复用同一份登录态

---

## Model Notes

模型定义位于：

- `src/lib/aiModels.ts`

当前 UI 支持模型切换，包含：

**Google Gemini:**
- `gemini-3-flash-preview`
- `gemini-3.1-pro-preview`
- `gemini-2.5-pro`
- `gemini-2.5-flash`
- `gemini-2.5-flash-lite`

**OpenAI:**
- `gpt-5.4` (最新通用模型)
- `gpt-5.3` / `gpt-5.3-codex`
- `gpt-5.2` / `gpt-5.2-codex` / `gpt-5.2-pro`
- `gpt-5.1` / `gpt-5.1-codex` / `gpt-5.1-codex-max` / `gpt-5.1-codex-mini`
- `gpt-5-mini`

**MiniMax:**
- `MiniMax-M2.7` (默认文本模型)

**智谱 GLM:**
- `glm-5`
- `glm-4.7`

**Moonshot Kimi:**
- `kimi-k2-thinking`
- `kimi-k2-thinking-turbo`
- `kimi-k2-0905-preview`
- `kimi-k2-turbo-preview`

注意：

- Preview 模型在 Code Assist 路径上可能出现容量波动
- 某些官方模型名不代表在当前 Code Assist 后端一定可用
- 当前 fallback 已内置，但仍会遇到 `429` / `404`

---

## Current Caveats

### Chat UX

当前聊天体验已支持流式对话和思考过程展示，主要差距：

- 每轮请求偏重
- RAG 触发过于激进

对应改造方案见：

- `docs/gemini-like-chat-implementation.md`

### Web vs CLI

CLI 能正常，不代表 Web 聊天一定稳。

原因通常不是认证，而是：

- Web 请求体更重
- 模型容量不足
- fallback 后模型也可能暂时拥挤

### Session Persistence

聊天会话通过 REST API 保存到 PostgreSQL：

1. **前端调用** `dataApi.chatSessions.create()` 创建会话
2. **服务端验证** JWT session 并写入数据库
3. **数据隔离** 所有查询都过滤 userId

相关实现在 `src/App.tsx` 的 `handleSaveSession` 和 `src/api/data.ts`。

### Multi-Provider Limitations

非 Gemini provider（OpenAI/MiniMax/智谱/Moonshot）：

- **Embedding**：默认使用智谱 Embedding-3，支持所有提供商的 embedding 模型
- **结构化 JSON 输出**：格式可能有差异，系统已添加 `safeJsonParse` 自动提取 JSON
- **流式响应**：chunk 格式需适配，已完成 Gemini/OpenAI/MiniMax/智谱/Moonshot 的适配

### Knowledge Extraction

知识提炼功能现在支持所有 AI 提供商：

- 使用 `safeJsonParse` 处理不同模型的 JSON 输出格式
- 当使用非 Gemini 模型时，通过 prompt 明确要求 JSON 格式而非 schema 约束
- `convertGoogleGenAISchemaToStandard` 函数处理 Google GenAI Type 枚举与标准 JSON Schema 的兼容

---

## Conventions

### TypeScript

- Target: ES2022
- Module: ESNext
- Path alias: `@/`
- `noEmit: true`

### Code Style

- 优先不可变更新
- `async/await + try/catch`
- 生产代码避免无意义 `console.log`

### AI / Product Conventions

- 默认中文输出
- 聊天场景优先体验和可读性
- 模型错误要区分：
  - 认证错误
  - 模型不存在
  - 容量不足

---

## Anti-Patterns

- 不要再把 OAuth access token 直接塞给 `GoogleGenAI({ apiKey })`
- 不要默认要求用户自己创建 Google OAuth Desktop Client
- 不要假设官方模型页出现的模型一定能在当前 Code Assist 后端调用
- 不要在普通聊天里每轮都强塞长 RAG 和超长系统提示
- 不要把包含 `undefined` 的对象写入数据库

---

## Commands

```bash
# 安装依赖
npm install

# 启动开发环境
npm run dev

# 构建
npm run build

# 类型检查 / lint
npm run lint

# 登录 Gemini CLI / Code Assist
npx tsx cli.ts auth login

# 查看登录状态
npx tsx cli.ts auth status

# 退出登录
npx tsx cli.ts auth logout

# CLI 导入文件
npx tsx cli.ts ./path/to/file.txt
```

---

## Docs Map

建议优先阅读以下文档：

- `README.md`
  - 项目概览与快速开始
- `docs/auth/environment-variables.md`
  - 环境变量配置指南（商业部署）
- `docs/OAUTH_USAGE.md`
  - 快速使用认证说明
- `docs/gemini-cli-code-assist-auth-tutorial.md`
  - 认证实现、踩坑和最新调用教程
- `docs/gemini-cli-auth-reference.md`
  - 参考 OpenClaw / Gemini CLI 的分析文档
- `docs/gemini-like-chat-implementation.md`
  - 复刻 Gemini 网页端 / App 对话体验的实现方案
- `docs/PERSONA_SYSTEM_DESIGN.md`
  - 多导师人格系统设计文档
- `docs/PERSONA_AGENT_GUIDE.md`
  - 人格系统使用指南

---

## Notes

- AI Studio Origin: https://ai.studio/apps/0908f2c8-7d16-420f-904a-55223d56e571
- FSRS 逻辑在 `src/services/fsrs.ts`
- 知识图谱在 `src/components/GraphView.tsx`
- 多导师人格在 `src/lib/personas.ts`
- 对话导入在 `src/components/ImportDialog.tsx`，支持 JSON/Markdown/TXT/Gemini网页导出/ChatGPT导出/自定义格式
- 数学公式渲染在 `src/components/ChatView.tsx`（remark-math + rehype-katex）
- 多提供商网关在 `src/lib/providerGateway.ts`
- **Web 主数据路径为 PostgreSQL** (已迁移自 Firestore)
- CLI 仍保留 `/api/sync` 兼容导入链路（仅开发模式）
- 用户级 API Key 在 `src/repositories/apiKey.repo.ts` 和 `src/services/userApiKeyService.ts`
- 知识提炼模型配置在 `SettingsView`，用户可独立选择结构化输出模型（对话模型 vs 知识提炼模型）
- GPT-5.4 / GPT-5.3 系列模型已添加，支持通用版和 Codex 代码版
- 流式聊天体验已完成，支持 SSE 实时显示和停止/重新生成
- **认证系统已迁移到 better-auth** (已替换 Firebase Auth)
- **向量数据库使用 Chroma** (本地，替代 Firebase Vector Search)

---

## Deployment

### Production Server

- **Server**: Alibaba Cloud ECS (Ubuntu 24.04)
- **IP**: 101.133.166.67
- **Port**: 80 (Nginx reverse proxy) → 3000 (Node.js app)
- **Process Manager**: PM2
- **Database**: PostgreSQL 16

### Deploy Command

```bash
./deploy.sh
```

The deploy script will:
1. Build the frontend (`npm run build`)
2. Sync files to server via rsync
3. Run `npm install --production` on server
4. Restart PM2 process

### Nginx Configuration

Nginx is configured as reverse proxy to hide port 3000:

```nginx
server {
    listen 80;
    server_name 101.133.166.67;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Key Files

| File | Description |
|------|-------------|
| `deploy.sh` | Main deployment script |
| `ecosystem.config.cjs` | PM2 configuration |
| `nginx-opensynapse.conf` | Nginx config template |
| `docs/DEPLOYMENT_GUIDE.md` | Detailed deployment guide |

### Troubleshooting

- **Server unreachable**: Check Alibaba Cloud security group (ports 22, 80, 3000)
- **App not starting**: Check `pm2 logs opensynapse`
- **Chat sessions not saving**: Check Better Auth `trustedOrigins` in `src/auth/server.ts`
- **Rate limiting warnings**: Configure `trustedProxies` in auth config
