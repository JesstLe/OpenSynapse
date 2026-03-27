<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# OpenSynapse (突触)

AI 驱动的知识复利系统。  
它把学习会话、结构化笔记、FSRS 复习和知识图谱放到同一套工作流里，让“聊天 -> 提炼 -> 复习 -> 连接”变成一个闭环。

## 当前能力

- AI 学习会话：支持多轮问答、图片输入、PDF 处理、URL 解构
- 知识提炼：从对话或资料中提取结构化笔记和闪卡
- FSRS 复习：基于间隔重复算法安排复习
- 知识图谱：可视化查看概念之间的关联
- Firebase 同步：账号登录后在多端共享笔记、闪卡和聊天会话
- CLI 导入：从终端处理文本资料并同步回应用
- Gemini CLI 风格认证：无需强制配置 API key，也可直接复用本机 Gemini CLI 登录态

## 技术栈

- 前端：React 19 + TypeScript + Vite + Tailwind CSS 4
- 后端：Express + Vite Dev Server
- 数据：Firebase Auth + Firestore
- AI：
  - Gemini API
  - Gemini CLI / Google Code Assist 风格 OAuth
- 可视化：D3.js + Recharts + Motion
- 算法：FSRS

## 快速开始

环境要求：

- Node.js 18+

安装依赖：

```bash
npm install
```

启动开发环境：

```bash
npm run dev
```

开发地址：

- [http://localhost:3000](http://localhost:3000)

## 认证方式

当前项目支持两种 AI 认证路径。

### 方式一：Gemini CLI / Code Assist 风格登录

这是当前推荐方式。

```bash
npx tsx cli.ts auth login
```

登录成功后：

- 凭证会保存到 `~/.opensynapse/credentials.json`
- CLI 会优先复用这份登录态
- Web 后端 `/api/ai/*` 也能复用这份登录态

查看状态：

```bash
npx tsx cli.ts auth status
```

退出登录：

```bash
npx tsx cli.ts auth logout
```

### 方式二：Gemini API Key

如果你更希望走标准 API key 方式，可以创建 `.env.local`：

```bash
cp .env.example .env.local
```

然后填写：

```bash
GEMINI_API_KEY=your_api_key_here
```

项目会优先使用 API key；没有 API key 时再退到本地保存的 Gemini CLI / Code Assist 凭证。

## CLI 使用

处理导出的对话或学习资料：

```bash
npx tsx cli.ts ./path/to/exported_chat.txt
```

CLI 会：

1. 调用 AI 提取结构化笔记和闪卡
2. 把结果同步回本地开发服务的 `/api/sync`

如果你想切换 CLI 模型，可以临时指定：

```bash
OPENSYNAPSE_CLI_MODEL=gemini-2.5-flash npx tsx cli.ts ./path/to/file.txt
```

## Web 端模型切换

学习会话页面已经支持模型切换。当前内置选项包括：

- `gemini-3-flash-preview`
- `gemini-3.1-pro-preview`
- `gemini-2.5-pro`
- `gemini-2.5-flash`
- `gemini-2.5-flash-lite`

说明：

- Preview 模型更接近 Gemini 新产品形态，但可能更容易遇到容量波动
- `gemini-2.5-flash` 和 `gemini-2.5-flash-lite` 通常更稳
- 当前项目已经内置 fallback，但某些模型在 Code Assist 路径上仍可能返回 `404` 或短时 `429`

## 现状说明

当前 Web 聊天已经可以复用 Gemini CLI 风格登录态，但体验上还没有完全复刻 Gemini 网页端 / App，主要差距在：

- 还不是完整流式聊天体验
- 默认聊天链路偏重，容易触发限流
- RAG 与上下文注入仍然偏激进

这部分的后续设计见：

- [Gemini 式对话体验实现文档](./docs/gemini-like-chat-implementation.md)

## 项目结构

```txt
.
├── server.ts
├── cli.ts
├── cli-auth.ts
├── src/
│   ├── App.tsx
│   ├── types.ts
│   ├── firebase.ts
│   ├── api/
│   │   └── ai.ts
│   ├── components/
│   │   ├── ChatView.tsx
│   │   ├── DashboardView.tsx
│   │   ├── GraphView.tsx
│   │   ├── NotesView.tsx
│   │   └── ReviewView.tsx
│   ├── lib/
│   │   ├── aiModels.ts
│   │   ├── codeAssist.ts
│   │   ├── oauth.ts
│   │   └── utils.ts
│   └── services/
│       ├── fsrs.ts
│       └── gemini.ts
├── docs/
│   ├── OAUTH_USAGE.md
│   ├── gemini-cli-auth-reference.md
│   ├── gemini-cli-code-assist-auth-tutorial.md
│   └── gemini-like-chat-implementation.md
├── firestore.rules
├── README.md
└── AGENTS.md
```

## 常用命令

```bash
# 开发
npm run dev

# 构建
npm run build

# 类型检查 / lint
npm run lint

# Gemini CLI 风格登录
npx tsx cli.ts auth login

# 查看认证状态
npx tsx cli.ts auth status

# CLI 导入文件
npx tsx cli.ts ./path/to/file.txt
```

## 文档导航

- [AGENTS.md](./AGENTS.md)
  - 当前架构、关键文件、命令与维护说明
- [docs/OAUTH_USAGE.md](./docs/OAUTH_USAGE.md)
  - 快速认证使用说明
- [docs/gemini-cli-code-assist-auth-tutorial.md](./docs/gemini-cli-code-assist-auth-tutorial.md)
  - 认证实现、踩坑和最新调用教程
- [docs/gemini-cli-auth-reference.md](./docs/gemini-cli-auth-reference.md)
  - 基于 OpenClaw / Gemini CLI 的参考分析
- [docs/gemini-like-chat-implementation.md](./docs/gemini-like-chat-implementation.md)
  - 复刻 Gemini 网页端 / App 对话体验的实现方案

## AI Studio 原型来源

项目最初来源于 Google AI Studio：

- [AI Studio App](https://ai.studio/apps/0908f2c8-7d16-420f-904a-55223d56e571)

## License

MIT
