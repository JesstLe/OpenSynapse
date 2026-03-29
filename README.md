<div align="center">

# OpenSynapse (突触)

**🧠 AI 驱动的知识复利系统 | 智能学习笔记 | 间隔重复 | 知识图谱**

[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite)](https://vitejs.dev/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql)](https://www.postgresql.org/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

<p align="center">
  <b>聊天 → 提炼 → 复习 → 连接</b><br/>
  <span style="color: #666;">AI 对话学习 + 智能笔记 + FSRS 复习 + 知识图谱可视化</span><br/>
  <span style="color: #666;">让知识积累成为复利增长</span>
</p>

[快速开始](#快速开始) • [功能特性](#功能特性) • [架构设计](#架构设计) • [贡献指南](#贡献指南) • [路线图](#路线图)

</div>

> 🎯 **OpenSynapse** 是一个开源的 AI 驱动知识管理系统，将多提供商 AI 对话、智能笔记提取、[墨墨背单词算法](https://github.com/maimemo/SSP-MMC) 间隔重复复习和 D3.js 知识图谱整合到一个工作流中。采用自托管架构（better-auth + PostgreSQL + Chroma），支持多设备访问、多登录方式认证，以及 CLI 命令行工具。

---

---

## 📖 项目简介

OpenSynapse 是一个现代化的 AI 驱动知识管理系统，它将学习、记忆和知识连接整合到一个无缝的工作流中。灵感来源于神经元突触的形成机制——**通过反复刺激建立持久的知识连接**。

### 核心理念

> 知识的真正价值不在于收藏，而在于连接与提取。

传统笔记应用往往成为"知识的坟墓"——我们存储了大量信息却很少回顾。OpenSynapse 通过以下方式解决这个问题：

1. **主动学习** - AI 对话式学习，而非被动阅读
2. **智能提炼** - 自动提取结构化笔记和闪卡
3. **科学复习** - 基于 [墨墨背单词 SSP-MMC 算法](https://github.com/maimemo/SSP-MMC)（ACM KDD 2022）优化记忆
4. **可视化关联** - 知识图谱展示概念间的联系

---

## ✨ 功能特性

### 🤖 AI 学习会话
- **多导师人格系统** - 通用助手（默认）、计算机、数学、法学、金融等专业导师，每种人格都有独特的教学风格和知识体系
- **LaTeX 数学公式渲染** - 支持数学、物理等学科公式完美显示（remark-math + rehype-katex）
- **流式对话** - 实时显示 AI 思考过程，支持停止生成和重新生成
- **多模态输入** - 支持文本、图片、PDF、URL 等多种输入方式
- **上下文感知** - 自动关联相关笔记和知识点
- **多模型支持** - Gemini、OpenAI、MiniMax、智谱、Moonshot 等多个 AI 提供商，支持模型切换与自动回退

### 📝 知识提炼
- **智能提取** - 从对话或文档中自动提取关键概念
- **结构化笔记** - 自动格式化 markdown 笔记
- **闪卡生成** - 一键生成 Anki 风格复习卡片
- **语义链接** - AI 自动识别并建议相关知识点连接

### 📥 对话导入
- **多格式支持** - JSON、Markdown、纯文本、Gemini网页导出格式一键导入
- **ChatGPT 支持** - 完整支持 ChatGPT 官方导出、分享链接、第三方工具格式
- **自定义格式** - 支持定义自己的角色标记（如"用户："、"助手："），导入任意格式的对话
- **智能解析** - 自动检测格式，预览解析结果
- **去重提醒** - 检测重复会话，避免重复导入
- **双模式导入** - 仅导入会话，或导入并自动提炼知识

### 🔄 MaiMemo 复习系统
- **算法驱动** - 采用 [墨墨背单词 SSP-MMC 算法](https://github.com/maimemo/SSP-MMC)（ACM KDD 2022 & IEEE TKDE）
- **半衰期模型** - 基于记忆半衰期而非稳定性，更精准预测遗忘
- **难度自适应** - 每张卡片独立难度系数（1-18），个性化调度
- **智能重新学习** - 忘记后精细调整而非简单重置
- **进度追踪** - 可视化学习进度和记忆保持率

### 🕸️ 知识图谱
- **交互式可视化** - 基于 D3.js 的力导向图
- **节点编辑** - 点击节点直接跳转编辑关联笔记
- **关系探索** - 发现知识点间的隐藏关联
- **性能优化** - 虚拟渲染支持大规模知识网络

### 🔐 多 AI 提供商支持
- **五家提供商** - Gemini、OpenAI、MiniMax、智谱 GLM、Moonshot Kimi
- **灵活认证** - OAuth 2.0、API Key、Gemini CLI / Code Assist 多种方式
- **模型回退** - 当首选模型不可用时自动切换到备用模型
- **统一接口** - 不同提供商的模型使用一致的调用接口

### 🎨 个性化体验
- **明暗主题切换** - 支持亮色/暗色模式，自动跟随系统偏好
- **多导师人格** - 根据学习场景切换不同专业导师
- **隐藏人格解锁** - 特殊交互解锁隐藏导师模式

### ☁️ 自托管与多租户
- **完全自托管** - better-auth + PostgreSQL + Chroma，数据完全掌控
- **多登录支持** - Google、GitHub、Discord OAuth + 邮箱/密码登录
- **数据隔离** - 用户级数据隔离，商业级安全
- **用户级 API Key** - 支持每个用户使用独立的 AI 提供商 API Key
- **实时同步** - 多设备间笔记、闪卡、会话实时同步

### 💻 CLI 工具
- **命令行导入** - 从终端处理文本资料，支持多种格式
- **批量处理** - 支持批量导入和同步
- **多提供商支持** - CLI 同样支持切换不同 AI 提供商
- **脚本化** - 可集成到自动化工作流

---

## 📸 界面展示

<div align="center">

### 学习会话界面

<img src="docs/screenshots/SCR-20260328-crnx.png" width="90%" alt="学习会话界面" />

*AI 驱动的学习会话，支持多轮对话和知识提取*

</div>

<div align="center">

### 知识图谱可视化

<img src="docs/screenshots/SCR-20260328-cyir.png" width="90%" alt="知识图谱" />

*交互式知识图谱，可视化展示概念间的关联关系*

</div>

<div align="center">

### 笔记管理与搜索

<img src="docs/screenshots/SCR-20260328-dbpo.png" width="90%" alt="笔记管理" />

*强大的笔记管理功能，支持标签、日期筛选和全文搜索*

</div>

<div align="center">

### MaiMemo 复习系统

<img src="docs/screenshots/SCR-20260328-dbrc.png" width="45%" alt="复习系统" />
&nbsp;&nbsp;
<img src="docs/screenshots/SCR-20260328-dbsg.png" width="45%" alt="复习统计" />

*基于墨墨背单词 SSP-MMC 算法的科学复习系统*

</div>

<div align="center">

### 仪表盘与数据概览

<img src="docs/screenshots/SCR-20260328-dbvq.png" width="90%" alt="仪表盘" />

*个人学习数据中心，可视化展示学习进度和统计*

</div>

---

## 🚀 快速开始

### 环境要求

- **Node.js** 18+ 
- **npm** 9+ 或 **pnpm** 8+
- **Git**

### 安装步骤

```bash
# 克隆仓库
git clone https://github.com/JesstLe/OpenSynapse.git
cd OpenSynapse

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

访问 [http://localhost:3000](http://localhost:3000) 开始使用。

### 环境配置

#### 必需配置

```bash
# 复制环境变量模板
cp .env.example .env.local

# 编辑 .env.local，添加以下必需配置：

# Better Auth 密钥（必需，至少32字符）
BETTER_AUTH_SECRET=your-super-secret-key-minimum-32-characters

# 数据库连接（必需）
DATABASE_URL=postgresql://user:password@localhost:5432/opensynapse
```

#### AI 提供商配置（至少配置一种）

```bash
# 复制环境变量模板
cp .env.example .env.local

# 编辑 .env.local，添加你想使用的提供商 API Key
# 支持以下任意组合：
GEMINI_API_KEY=your_gemini_key          # Google Gemini
OPENAI_API_KEY=your_openai_key          # OpenAI
MINIMAX_API_KEY=your_minimax_key        # MiniMax
ZHIPU_API_KEY=your_zhipu_key            # 智谱 GLM
MOONSHOT_API_KEY=your_moonshot_key      # Moonshot Kimi
```

配置完成后，在 Settings 页面或聊天界面切换模型即可使用对应的 AI 提供商。

---

## 🏗️ 架构设计

### 系统架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend Layer                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  ChatView    │  │  ImportDialog│  │  NotesView          │  │
│  │  (学习会话)   │  │  (对话导入)   │  │  (笔记管理)          │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  GraphView   │  │  ReviewView  │  │  SettingsView       │  │
│  │  (知识图谱)   │  │  (复习系统)   │  │  (设置中心)          │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │DashboardView │  │   Persona    │  │    Components       │  │
│  │  (仪表盘)     │  │  (人格系统)   │  │    (UI组件)          │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│                        Service Layer                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ AI Gateway   │  │   MaiMemo    │  │  PostgreSQL/Chroma  │  │
│  │ (多提供商)    │  │  (SSP-MMC)   │  │  (数据/向量存储)      │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│                        Library Layer                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │    OAuth     │  │  CodeAssist  │  │     AI Models       │  │
│  │  (认证库)     │  │  (API封装)    │  │   (模型管理)         │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│                        API Layer                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              Express + Vite Dev Server                   │  │
│  │         /api/ai/*  |  /api/sync  |  Static Assets        │  │
│  └──────────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│                      External Services                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  PostgreSQL  │  │  AI Models   │  │   OAuth Providers    │  │
│  │  better-auth │  │  Gemini/     │  │  Google/GitHub/      │  │
│  │              │  │  OpenAI/     │  │  Discord/Email       │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### 核心模块

| 模块 | 职责 | 技术栈 |
|------|------|--------|
| **ChatView** | 学习会话 UI、模型切换、消息管理、流式对话 | React 19 + Motion |
| **PersonaSystem** | 多导师人格管理、系统提示词注入 | React + TypeScript |
| **ImportDialog** | 对话导入、格式解析、去重检测 | React + Motion |
| **SettingsView** | 提供商配置、人格管理、主题切换 | React + Tailwind |
| **GraphView** | 知识图谱可视化、D3 力导向图 | D3.js + Canvas |
| **NotesView** | 笔记 CRUD、搜索筛选、标签管理 | React + Tailwind |
| **ReviewView** | MaiMemo 复习界面、进度追踪 | React + Motion |
| **AI Gateway** | 多提供商路由、协议适配、模型回退 | Express + Fetch API |
| **MaiMemo** | SSP-MMC 间隔重复算法 | TypeScript |
| **Auth** | better-auth 认证、会话管理 | better-auth + PostgreSQL |

### 数据流设计

```
User Input → Component → Service → API → External Service
                ↓           ↓        ↓
            State Update  Cache   Error Handler
                ↓           ↓        ↓
         PostgreSQL ←  LocalStorage  →  Retry Logic
```

---

## 🛠️ 软件工程实践

### 1. 系统架构

```mermaid
flowchart TB
    subgraph Client["🖥️ 客户端"]
        UI["UI Components<br/>React 19"]
        State["状态管理<br/>React Hooks"]
    end
    
    subgraph Server["⚙️ 服务端"]
        API["Express API"]
        Auth["认证中间件"]
    end
    
    subgraph Services["☁️ 外部服务"]
        DB["PostgreSQL<br/>Auth + Data"]
        AI["AI Providers<br/>Gemini | OpenAI | MiniMax | GLM | Kimi"]
    end
    
    UI --> API --> Auth --> DB
    API --> AI
    
    style Client fill:#e3f2fd
    style Server fill:#f3e5f5
    style Services fill:#e8f5e9
```

### 2. 认证流程（OAuth 2.0 + PKCE）

```mermaid
sequenceDiagram
    actor U as 用户
    participant CLI as CLI/Web
    participant OAuth as OAuth Server
    participant CB as 回调服务器<br/>localhost:3088
    participant FS as File System
    
    U->>CLI: auth login
    CLI->>CLI: 生成 PKCE
    CLI->>OAuth: 授权请求
    OAuth->>U: 打开授权页面
    U->>OAuth: 登录授权
    OAuth->>CB: 重定向回调
    CB->>CLI: 获取 code
    CLI->>OAuth: 请求 Token
    OAuth->>CLI: 返回 Token
    CLI->>FS: 保存凭证
    CLI->>U: 登录成功
```

### 3. 数据处理流

```mermaid
flowchart LR
    Input[用户输入<br/>文本/图片/PDF] --> AI[AI 分析] --> Extract[信息提取]
    Extract --> Note[笔记存储]
    Extract --> Card[闪卡生成]
    Extract --> Graph[图谱节点]
    Note --> Sync[云端同步]
    Card --> Review[复习系统]
    
    style AI fill:#fff3e0
    style Extract fill:#e8f5e9
```

### 4. 开发规范

| 类别 | 规范 | 工具 |
|------|------|------|
| **代码风格** | TypeScript 严格模式 | `tsc --noEmit` |
| **提交规范** | Conventional Commits | git hooks |
| **分支管理** | Git Flow | Git |
| **错误处理** | try/catch + 统一格式 | ESLint |

### 5. 代码示例

**错误处理模式：**
```typescript
try {
  const result = await riskyOperation()
  return { success: true, data: result }
} catch (error) {
  return { 
    success: false, 
    error: error instanceof Error ? error.message : 'Unknown error' 
  }
}
```

**不可变更新：**
```typescript
// ✅ 正确
setNotes(prev => [...prev, newNote])

// ❌ 错误
notes.push(newNote)
```

---

## 📁 项目结构

```
OpenSynapse/
├── 📂 config/                  # 配置文件
├── 📂 docs/                    # 文档
│   ├── screenshots/            # 界面截图
│   ├── auth/                   # 认证文档
│   └── features/               # 功能文档
├── 📂 scripts/                 # CLI 脚本
│   ├── cli.ts                  # 主 CLI
│   ├── cli-auth.ts             # 认证命令
│   └── test/                   # 测试脚本
├── 📂 src/
│   ├── 📂 api/                 # API 路由
│   │   ├── ai.ts               # AI 服务路由
│   │   ├── data.ts             # 数据 CRUD 路由
│   │   └── auth-middleware.ts  # 认证中间件
│   ├── 📂 auth/                # 认证系统
│   │   ├── client.ts           # better-auth 客户端
│   │   └── server.ts           # better-auth 服务端配置
│   ├── 📂 components/          # React 组件
│   │   ├── auth/               # 认证相关组件
│   │   │   ├── LoginSelection.tsx
│   │   │   └── AuthCallback.tsx
│   │   ├── ChatView.tsx
│   │   ├── DashboardView.tsx
│   │   ├── GraphView.tsx
│   │   ├── NotesView.tsx
│   │   ├── ReviewView.tsx
│   │   └── SettingsView.tsx
│   ├── 📂 db/                  # 数据库
│   │   ├── index.ts            # Drizzle ORM 配置
│   │   └── schema.ts           # 数据库 Schema
│   ├── 📂 lib/                 # 工具库
│   │   ├── aiModels.ts         # AI 模型配置
│   │   ├── codeAssist.ts       # Code Assist 封装
│   │   ├── oauth.ts            # OAuth 实现
│   │   └── utils.ts
│   ├── 📂 repositories/        # 数据访问层
│   │   ├── flashcard.repo.ts
│   │   ├── note.repo.ts
│   │   ├── chat.repo.ts
│   │   └── apiKey.repo.ts
│   ├── 📂 services/            # 业务逻辑
│   │   ├── maimemo.ts          # MaiMemo SSP-MMC 算法
│   │   ├── fsrs.ts             # FSRS 算法（兼容）
│   │   ├── gemini.ts           # Gemini 服务
│   │   └── userApiKeyService.ts
│   ├── App.tsx                 # 应用入口
│   └── types.ts                # TypeScript 类型
├── 📄 .env.example             # 环境变量模板
├── 📄 package.json
├── 📄 server.ts                # Express 服务器
├── 📄 tsconfig.json
└── 📄 vite.config.ts
```

---

## 📝 开发指南

### 本地开发

```bash
# 安装依赖
npm install

# 启动开发服务器（包含热更新）
npm run dev

# 类型检查
npm run lint

# 构建生产版本
npm run build

# 预览生产构建
npm run preview
```

### CLI 使用

```bash
# 认证相关
npx tsx scripts/cli.ts auth login    # 登录
npx tsx scripts/cli.ts auth status   # 查看状态
npx tsx scripts/cli.ts auth logout   # 退出

# 导入文件
npx tsx scripts/cli.ts ./notes.txt

# 使用特定模型
OPENSYNAPSE_CLI_MODEL=gemini-2.5-pro npx tsx scripts/cli.ts ./file.txt
```

### 模型配置

支持的模型列表（位于 `src/lib/aiModels.ts`）：

| Provider | 模型 ID | 认证方式 | 说明 |
|----------|---------|----------|------|
| Gemini | `gemini/gemini-3-flash-preview` | `GEMINI_API_KEY` | Preview，多模态/agentic |
| Gemini | `gemini/gemini-3.1-pro-preview` | `GEMINI_API_KEY` | Preview，复杂推理 |
| Gemini | `gemini/gemini-2.5-pro` | `GEMINI_API_KEY` | 稳定高阶推理 |
| Gemini | `gemini/gemini-2.5-flash` | `GEMINI_API_KEY` | 高性价比模型 |
| Gemini | `gemini/gemini-2.5-flash-lite` | `GEMINI_API_KEY` | 轻量 fallback |
| OpenAI | `openai/gpt-5.4` | `OPENAI_API_KEY` | GPT-5.4 最新模型 |
| OpenAI | `openai/gpt-5.3` | `OPENAI_API_KEY` | GPT-5.3 主力模型 |
| OpenAI | `openai/gpt-5.3-codex` | `OPENAI_API_KEY` | GPT-5.3 代码版 |
| OpenAI | `openai/gpt-5.2` | `OPENAI_API_KEY` | GPT-5.2 主力模型 |
| OpenAI | `openai/gpt-5.2-codex` | `OPENAI_API_KEY` | GPT-5.2 代码版 |
| OpenAI | `openai/gpt-5-mini` | `OPENAI_API_KEY` | 轻量低延迟 |
| MiniMax | `minimax/MiniMax-M2.7` | `MINIMAX_API_KEY` | MiniMax 主力文本模型（默认） |
| Zhipu | `zhipu/glm-5` | `ZHIPU_API_KEY` | 智谱主力模型 |
| Zhipu | `zhipu/glm-4.7` | `ZHIPU_API_KEY` | 稳定 fallback |
| Moonshot | `moonshot/kimi-k2-thinking` | `MOONSHOT_API_KEY` | Kimi 推理模型 |
| Moonshot | `moonshot/kimi-k2-thinking-turbo` | `MOONSHOT_API_KEY` | 低延迟推理模型 |
| Moonshot | `moonshot/kimi-k2-0905-preview` | `MOONSHOT_API_KEY` | K2 Preview |
| Moonshot | `moonshot/kimi-k2-turbo-preview` | `MOONSHOT_API_KEY` | 低延迟 Preview |

使用方法：
- 自定义模型请输入完整的 `provider/model`，例如 `openai/gpt-5.4`
- 在 Settings 页面配置各提供商的 API Key
- 系统会自动 fallback 到可用模型

---

## 🤝 贡献指南

我们欢迎所有形式的贡献！

### 开发流程

1. **Fork** 本仓库
2. 创建特性分支：`git checkout -b feature/amazing-feature`
3. 提交变更：`git commit -m 'Add amazing feature'`
4. 推送分支：`git push origin feature/amazing-feature`
5. 创建 **Pull Request**

### 提交规范

- `feat:` 新功能
- `fix:` 修复 bug
- `docs:` 文档更新
- `style:` 代码格式调整
- `refactor:` 重构
- `test:` 测试相关
- `chore:` 构建/工具相关

### 代码审查清单

- [ ] TypeScript 类型完整
- [ ] 通过 `npm run lint` 检查
- [ ] 无 `console.log` 调试代码
- [ ] 错误处理完善
- [ ] 组件有适当的注释

---

## 🗺️ 路线图

### Phase 1 ✅ 已完成
- [x] 知识图谱节点交互增强
- [x] NotesView 搜索与筛选
- [x] 图谱性能优化

### Phase 2 ✅ 已完成
- [x] 多提供商认证 (Google / 微信 / QQ)
- [x] 用户级 API Key 管理
- [x] 商业级数据隔离

### Phase 3 ✅ 已完成
- [x] 流式聊天体验（SSE + 思考过程展示）
- [x] 知识提炼模型可配置（支持自定义结构化输出模型）
- [x] GPT-5.4 / GPT-5.3 模型支持
- [x] 墨墨背单词 SSP-MMC 算法集成（ACM KDD 2022）
- [x] 闪卡复习体验优化
- [x] 默认模型切换为 MiniMax M2.7
- [x] 通用助手人格（含安全边界防护）
- [x] ChatView 布局优化

### Phase 3 🔄 进行中
- [ ] 智能 RAG 优化（基础功能可用，需工具调用改造）

### Phase 3 📋 计划中
- [ ] 移动端适配
- [ ] 浏览器扩展
- [ ] 社区插件系统
- [ ] 协作编辑功能

### Phase 4 🔮 愿景
- [ ] AI 智能导师
- [ ] 知识推荐引擎
- [ ] 学习路径规划
- [ ] 社区知识共享

---

## 📚 文档导航

| 文档 | 说明 |
|------|------|
| [AGENTS.md](./AGENTS.md) | 架构详解与开发指南 |
| [docs/auth/environment-variables.md](./docs/auth/environment-variables.md) | 环境变量配置指南 (微信/QQ/商业部署) |
| [docs/auth/OAUTH_USAGE.md](./docs/auth/OAUTH_USAGE.md) | OAuth 使用说明 |
| [docs/auth/gemini-cli-code-assist-auth-tutorial.md](./docs/auth/gemini-cli-code-assist-auth-tutorial.md) | 认证教程 |
| [docs/auth/gemini-cli-auth-reference.md](./docs/auth/gemini-cli-auth-reference.md) | OAuth 参考实现 |
| [docs/features/gemini-like-chat-implementation.md](./docs/features/gemini-like-chat-implementation.md) | 聊天功能设计 |

---

## 🔧 故障排除

### 常见问题

**Q: 数据库连接失败？**
```bash
# 检查 PostgreSQL 是否运行
psql $DATABASE_URL -c "SELECT 1"

# 检查数据库是否存在
psql postgresql://user:password@localhost:5432/postgres -c "CREATE DATABASE opensynapse;"
```

**Q: OAuth 登录失败？**
```bash
# 检查环境变量是否正确配置
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret

# 确保回调 URL 已在开放平台注册
# Google: https://console.cloud.google.com/apis/credentials
# GitHub: Settings -> Developer settings -> OAuth Apps
```

**Q: 模型返回 429/404？**
```
这是容量问题，系统会自动 fallback 到其他模型
```

**Q: 商业部署时 API Key 如何配置？**
```
1. 每个用户在 Settings 页面配置个人 API Key
2. 如未配置，使用全局环境变量作为 fallback
3. 用户数据完全隔离在各自的 PostgreSQL 行中
详见 docs/auth/environment-variables.md
```

---

## 📄 许可证

[MIT](LICENSE) © OpenSynapse Contributors

---

## 🙏 致谢

- [Google AI Studio](https://ai.studio) - 项目原型来源
- [MaiMemo](https://github.com/maimemo/SSP-MMC) - 墨墨背单词 SSP-MMC 间隔重复算法 (ACM KDD 2022)
- [FSRS](https://github.com/open-spaced-repetition/fsrs-rs) - 间隔重复算法参考
- [better-auth](https://github.com/better-auth/better-auth) - 认证系统
- [Gemini](https://deepmind.google/technologies/gemini/) - AI 能力支持
- [OpenAI](https://openai.com/) / [MiniMax](https://www.minimaxi.com/) / [Zhipu](https://www.zhipuai.cn/) / [Moonshot](https://www.moonshot.cn/) - 多 AI 提供商支持

---

<div align="center">

**Star ⭐ 我们，如果这个项目对你有帮助！**

[Report Bug](https://github.com/JesstLe/OpenSynapse/issues) • [Request Feature](https://github.com/JesstLe/OpenSynapse/issues)

</div>
