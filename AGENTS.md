# OpenSynapse (突触) - AGENTS.md

**Updated:** 2026-03-28  
**Branch:** main

## Overview

OpenSynapse 是一个 AI 驱动的知识复利系统，核心能力包括：

- **多导师人格系统** - 计算机、数学、法学、金融等专业导师，每种人格有独特的教学风格
- **AI 学习会话** - 流式对话、思考过程展示、停止/重新生成功能
- **知识提炼** - 从对话或文档自动提取结构化笔记和闪卡
- **对话导入** - 支持 JSON、Markdown、纯文本格式导入历史对话
- **多 AI 提供商** - 支持 Gemini、OpenAI、MiniMax、智谱 GLM、Moonshot Kimi
- **FSRS 复习** - 基于间隔重复算法的科学复习系统
- **知识图谱** - D3.js 可视化展示概念关联
- **明暗主题** - 支持亮色/暗色模式切换
- **Firebase 云同步** - Auth + Firestore 多端实时同步
- **CLI 工具** - 命令行导入、多提供商支持、批量处理

当前项目已经不再是纯 `data.json` 本地存储架构。Web 主路径以 Firebase 为主，CLI 仍保留本地 `/api/sync` 兼容链路。

---

## Current Architecture

### Frontend

- `src/App.tsx`
  - 应用主入口
  - 登录态管理
  - Firestore 订阅
  - 主视图切换
  - 主题状态管理（明暗切换）
- `src/components/ChatView.tsx`
  - 学习会话 UI
  - 流式对话与思考过程展示
  - 人格切换（多导师系统）
  - 模型切换（多提供商支持）
  - 图片 / PDF / URL 入口
  - 会话保存与历史
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
  - 预设人格定义（CS / 数学 / 法学 / 金融）
  - 隐藏人格机制

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
- `src/services/importParsers.ts`
  - 对话导入解析器
  - 支持 JSON / Markdown / 纯文本自动检测
  - 去重检测与会话转换

### Data Layer

- `src/firebase.ts`
  - Firebase 配置
- `firestore.rules`
  - Firestore 规则
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
  - `/api/ai/*`
  - `/api/sync`

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
| 模型配置 | `src/lib/aiModels.ts` | 多提供商模型列表与 fallback 策略 |
| 人格系统 | `src/lib/personas.ts` | 多导师人格定义与隐藏人格机制 |
| 对话导入 | `src/services/importParsers.ts` | JSON/Markdown/TXT 解析与去重 |
| 导入弹窗 | `src/components/ImportDialog.tsx` | 文件拖拽、粘贴、预览、导入 |
| 设置中心 | `src/components/SettingsView.tsx` | 提供商配置、人格管理、主题切换 |
| CLI 认证 | `scripts/cli-auth.ts` | `auth login/status/logout` |
| CLI 导入 | `scripts/cli.ts` | 文件解析后同步到后端、批量导入 |
| Firestore 保存 | `src/App.tsx` | 会话、笔记、闪卡写入 |

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

## Auth Notes

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
- `gpt-5.2`
- `gpt-5.2-pro`
- `gpt-5-mini`

**MiniMax:**
- `MiniMax-M2.5`
- `MiniMax-M2.5-highspeed`

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
- 缺少编辑后重发

对应改造方案见：

- `docs/gemini-like-chat-implementation.md`

### Web vs CLI

CLI 能正常，不代表 Web 聊天一定稳。

原因通常不是认证，而是：

- Web 请求体更重
- 模型容量不足
- fallback 后模型也可能暂时拥挤

### Firestore

Firestore 不接受 `undefined` 字段。  
保存聊天会话前如果结构里混入 `undefined`，写入会失败。

### Multi-Provider Limitations

非 Gemini provider（OpenAI/MiniMax/智谱/Moonshot）：

- 某些高级功能（如 embedding）可能不可用
- 结构化 JSON 输出格式可能有差异
- 流式响应的 chunk 格式需适配

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
- 不要把 Firestore 文档写入包含 `undefined` 的对象

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
- 对话导入在 `src/components/ImportDialog.tsx`
- 多提供商网关在 `src/lib/providerGateway.ts`
- Web 主数据路径为 Firestore
- CLI 仍保留 `/api/sync` 兼容导入链路
