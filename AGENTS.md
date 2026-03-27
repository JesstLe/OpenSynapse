# OpenSynapse (突触) - AGENTS.md

**Updated:** 2026-03-28  
**Branch:** main

## Overview

OpenSynapse 是一个 AI 驱动的知识复利系统，核心能力包括：

- 学习会话与知识提炼
- 笔记、闪卡与 FSRS 复习
- 知识图谱可视化
- Firebase Auth + Firestore 云同步
- CLI 导入与 Gemini CLI / Code Assist 风格认证

当前项目已经不再是纯 `data.json` 本地存储架构。Web 主路径以 Firebase 为主，CLI 仍保留本地 `/api/sync` 兼容链路。

---

## Current Architecture

### Frontend

- `src/App.tsx`
  - 应用主入口
  - 登录态管理
  - Firestore 订阅
  - 主视图切换
- `src/components/ChatView.tsx`
  - 学习会话 UI
  - 模型切换
  - 图片 / PDF / URL 入口
  - 会话保存与历史
- `src/components/DashboardView.tsx`
- `src/components/GraphView.tsx`
- `src/components/NotesView.tsx`
- `src/components/ReviewView.tsx`

### AI Layer

- `src/services/gemini.ts`
  - 前端 AI 业务逻辑
  - 聊天、RAG、文档解构、语义链接、embedding
- `src/api/ai.ts`
  - 服务端 AI 路由
  - 优先 API Key
  - 否则复用 Gemini CLI / Code Assist OAuth 登录态
- `src/lib/codeAssist.ts`
  - Code Assist `generateContent` 请求封装
  - fallback 模型逻辑
- `src/lib/oauth.ts`
  - Gemini CLI / Code Assist 风格 OAuth
  - 解析本机 `gemini` CLI 内置 client
  - PKCE、本地回调、token 刷新、project 探测
- `src/lib/aiModels.ts`
  - 默认模型
  - 模型列表
  - fallback 策略

### Data Layer

- `src/firebase.ts`
  - Firebase 配置
- `firestore.rules`
  - Firestore 规则
- `src/types.ts`
  - Note / Flashcard / ChatSession 等类型

### CLI

- `cli.ts`
  - CLI 主入口
  - `auth` 子命令
  - 文件导入与同步
- `cli-auth.ts`
  - 登录 / 状态 / 登出

### Server

- `server.ts`
  - Express + Vite 开发服务器
  - `/api/ai/*`
  - `/api/sync`

---

## Key Files

| Task | File | Notes |
|------|------|-------|
| 聊天 UI | `src/components/ChatView.tsx` | 模型切换、会话发送、错误提示 |
| 聊天业务逻辑 | `src/services/gemini.ts` | 当前仍是重 prompt + RAG 方案 |
| 服务端 AI 请求 | `src/api/ai.ts` | API Key / Code Assist 双路径 |
| OAuth 登录 | `src/lib/oauth.ts` | Gemini CLI 风格认证核心 |
| Code Assist 请求 | `src/lib/codeAssist.ts` | `cloudcode-pa.googleapis.com` |
| 模型配置 | `src/lib/aiModels.ts` | 默认模型与 fallback |
| CLI 认证 | `cli-auth.ts` | `auth login/status/logout` |
| CLI 导入 | `cli.ts` | 文件解析后同步到后端 |
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

- `gemini-3-flash-preview`
- `gemini-3.1-pro-preview`
- `gemini-2.5-pro`
- `gemini-2.5-flash`
- `gemini-2.5-flash-lite`

注意：

- Preview 模型在 Code Assist 路径上可能出现容量波动
- 某些官方模型名不代表在当前 Code Assist 后端一定可用
- 当前 fallback 已内置，但仍会遇到 `429` / `404`

---

## Current Caveats

### Chat UX

当前聊天体验还没有完全复刻 Gemini 网页端 / App，主要差距：

- 非流式展示
- 每轮请求偏重
- RAG 触发过于激进
- 缺少停止生成 / 重新生成 / 编辑后重发

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

---

## Notes

- AI Studio Origin: https://ai.studio/apps/0908f2c8-7d16-420f-904a-55223d56e571
- FSRS 逻辑在 `src/services/fsrs.ts`
- 知识图谱在 `src/components/GraphView.tsx`
- Web 主数据路径为 Firestore
- CLI 仍保留 `/api/sync` 兼容导入链路
