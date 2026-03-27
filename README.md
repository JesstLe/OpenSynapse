<div align="center">

# OpenSynapse (突触)

**AI 驱动的知识复利系统**

[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite)](https://vitejs.dev/)
[![Firebase](https://img.shields.io/badge/Firebase-Cloud-FFCA28?logo=firebase)](https://firebase.google.com/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

<p align="center">
  <b>聊天 → 提炼 → 复习 → 连接</b><br/>
  让知识积累成为复利增长
</p>

[快速开始](#快速开始) • [功能特性](#功能特性) • [架构设计](#架构设计) • [贡献指南](#贡献指南) • [路线图](#路线图)

</div>

---

## 📖 项目简介

OpenSynapse 是一个现代化的 AI 驱动知识管理系统，它将学习、记忆和知识连接整合到一个无缝的工作流中。灵感来源于神经元突触的形成机制——**通过反复刺激建立持久的知识连接**。

### 核心理念

> 知识的真正价值不在于收藏，而在于连接与提取。

传统笔记应用往往成为"知识的坟墓"——我们存储了大量信息却很少回顾。OpenSynapse 通过以下方式解决这个问题：

1. **主动学习** - AI 对话式学习，而非被动阅读
2. **智能提炼** - 自动提取结构化笔记和闪卡
3. **科学复习** - 基于 FSRS 间隔重复算法优化记忆
4. **可视化关联** - 知识图谱展示概念间的联系

---

## ✨ 功能特性

### 🤖 AI 学习会话
- **多轮对话** - 与 Gemini AI 进行深度学术讨论
- **多模态输入** - 支持文本、图片、PDF、URL 等多种输入方式
- **上下文感知** - 自动关联相关笔记和知识点
- **模型切换** - 支持 Gemini 系列多模型自由选择

### 📝 知识提炼
- **智能提取** - 从对话或文档中自动提取关键概念
- **结构化笔记** - 自动格式化 markdown 笔记
- **闪卡生成** - 一键生成 Anki 风格复习卡片
- **语义链接** - AI 自动识别并建议相关知识点连接

### 🔄 FSRS 复习系统
- **算法驱动** - 采用 Free Spaced Repetition Scheduler 算法
- **自适应调度** - 根据记忆曲线动态调整复习间隔
- **优先级排序** - 优先复习即将遗忘的内容
- **进度追踪** - 可视化学习进度和记忆保持率

### 🕸️ 知识图谱
- **交互式可视化** - 基于 D3.js 的力导向图
- **节点编辑** - 点击节点直接跳转编辑关联笔记
- **关系探索** - 发现知识点间的隐藏关联
- **性能优化** - 虚拟渲染支持大规模知识网络

### 🔐 多模态认证
- **OAuth 2.0** - Gemini CLI / Google Code Assist 风格登录
- **API Key** - 传统 API Key 认证方式
- **ADC** - Google Application Default Credentials
- **自动回退** - 智能切换可用认证方式

### ☁️ 云端同步
- **Firebase 集成** - Auth + Firestore 完整后端
- **实时同步** - 多设备间笔记、闪卡、会话实时同步
- **离线优先** - 本地缓存支持离线使用
- **数据安全** - Firestore 安全规则保护用户数据

### 💻 CLI 工具
- **命令行导入** - 从终端处理文本资料
- **批量处理** - 支持批量导入和同步
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

### FSRS 复习系统

<img src="docs/screenshots/SCR-20260328-dbrc.png" width="45%" alt="复习系统" />
&nbsp;&nbsp;
<img src="docs/screenshots/SCR-20260328-dbsg.png" width="45%" alt="复习统计" />

*基于间隔重复算法的科学复习系统*

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

### 认证配置

#### 方式一：OAuth 登录（推荐）

```bash
# 一键登录，复用 Gemini CLI 凭证
npx tsx scripts/cli.ts auth login
```

登录后凭证保存至 `~/.opensynapse/credentials.json`，Web 和 CLI 共享登录态。

#### 方式二：API Key

```bash
# 复制环境变量模板
cp .env.example .env.local

# 编辑 .env.local，添加你的 API Key
GEMINI_API_KEY=your_api_key_here
```

---

## 🏗️ 架构设计

### 系统架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend Layer                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  ChatView    │  │  GraphView   │  │  NotesView          │  │
│  │  (学习会话)   │  │  (知识图谱)   │  │  (笔记管理)          │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ ReviewView   │  │DashboardView │  │    Components       │  │
│  │  (复习系统)   │  │  (仪表盘)     │  │    (UI组件)          │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│                        Service Layer                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  Gemini      │  │    FSRS      │  │    Firebase         │  │
│  │  (AI服务)     │  │  (间隔重复)   │  │    (数据同步)        │  │
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
│  │  Firebase    │  │   Gemini     │  │   Google Cloud      │  │
│  │  Auth/Store  │  │    API       │  │     OAuth           │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### 核心模块

| 模块 | 职责 | 技术栈 |
|------|------|--------|
| **ChatView** | 学习会话 UI、模型切换、消息管理 | React 19 + Motion |
| **GraphView** | 知识图谱可视化、D3 力导向图 | D3.js + Canvas |
| **NotesView** | 笔记 CRUD、搜索筛选、标签管理 | React + Tailwind |
| **ReviewView** | FSRS 复习界面、进度追踪 | React + Recharts |
| **Gemini** | AI 对话、RAG、文档解析 | Google GenAI SDK |
| **FSRS** | 间隔重复算法实现 | TypeScript |
| **OAuth** | PKCE 认证流程、Token 管理 | Node.js + Express |

### 数据流设计

```
User Input → Component → Service → API → External Service
                ↓           ↓        ↓
            State Update  Cache   Error Handler
                ↓           ↓        ↓
            Firebase ←  LocalStorage  →  Retry Logic
```

---

## 🛠️ 软件工程实践

### 代码质量

- **TypeScript 严格模式** - 启用 `strict: true` 和 `noImplicitAny`
- **ESLint + Prettier** - 统一的代码风格和格式化
- **类型安全** - 全面类型定义，禁止 `any` 类型
- **不可变更新** - 使用 spread 运算符进行状态更新

### 错误处理

```typescript
// 统一的错误处理模式
try {
  const result = await riskyOperation()
  return { success: true, data: result }
} catch (error) {
  console.error('Operation failed:', error)
  return { 
    success: false, 
    error: error instanceof Error ? error.message : 'Unknown error' 
  }
}
```

### 测试策略

- **单元测试** - Jest + React Testing Library
- **E2E 测试** - Playwright 覆盖关键用户流程
- **类型检查** - `tsc --noEmit` 作为 CI 前置检查

### 性能优化

- **虚拟滚动** - 大量笔记列表使用虚拟化渲染
- **防抖节流** - 搜索输入和图谱交互的防抖处理
- **代码分割** - 路由级懒加载减少首屏时间
- **缓存策略** - Firestore 离线缓存 + 内存缓存

### 安全实践

- **OAuth 2.0 + PKCE** - 安全的认证流程
- **Firestore 规则** - 细粒度的数据访问控制
- **环境变量** - 敏感信息不提交到版本控制
- **输入验证** - 所有用户输入经过验证和消毒

### 持续集成

```yaml
# .github/workflows/ci.yml 示例
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run lint
      - run: npm run test
      - run: npm run build
```

---

## 📁 项目结构

```
OpenSynapse/
├── 📂 config/                  # 配置文件
│   └── firebase-applet-config.json
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
│   │   └── ai.ts
│   ├── 📂 components/          # React 组件
│   │   ├── ChatView.tsx
│   │   ├── DashboardView.tsx
│   │   ├── GraphView.tsx
│   │   ├── NotesView.tsx
│   │   └── ReviewView.tsx
│   ├── 📂 lib/                 # 工具库
│   │   ├── aiModels.ts         # AI 模型配置
│   │   ├── codeAssist.ts       # Code Assist 封装
│   │   ├── oauth.ts            # OAuth 实现
│   │   └── utils.ts
│   ├── 📂 services/            # 业务逻辑
│   │   ├── fsrs.ts             # FSRS 算法
│   │   └── gemini.ts           # Gemini 服务
│   ├── App.tsx                 # 应用入口
│   ├── firebase.ts             # Firebase 初始化
│   └── types.ts                # TypeScript 类型
├── 📄 .env.example             # 环境变量模板
├── 📄 .firebaserc              # Firebase 配置
├── 📄 firestore.rules          # Firestore 安全规则
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

| 模型 | 用途 | 特点 |
|------|------|------|
| `gemini-3-flash-preview` | 快速对话 | 低延迟 |
| `gemini-3.1-pro-preview` | 深度推理 | 高质量 |
| `gemini-2.5-pro` | 通用任务 | 平衡 |
| `gemini-2.5-flash` | 日常对话 | 稳定 |
| `gemini-2.5-flash-lite` | 轻量任务 | 经济 |

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

### Phase 2 🔄 进行中
- [ ] 流式聊天体验
- [ ] 智能 RAG 优化
- [ ] 多语言支持

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
| [docs/auth/OAUTH_USAGE.md](./docs/auth/OAUTH_USAGE.md) | OAuth 使用说明 |
| [docs/auth/gemini-cli-code-assist-auth-tutorial.md](./docs/auth/gemini-cli-code-assist-auth-tutorial.md) | 认证教程 |
| [docs/auth/gemini-cli-auth-reference.md](./docs/auth/gemini-cli-auth-reference.md) | OAuth 参考实现 |
| [docs/features/gemini-like-chat-implementation.md](./docs/features/gemini-like-chat-implementation.md) | 聊天功能设计 |

---

## 🔧 故障排除

### 常见问题

**Q: OAuth 登录失败？**
```bash
# 检查端口 3088 是否被占用
lsof -i :3088

# 清除凭证重新登录
rm ~/.opensynapse/credentials.json
npx tsx scripts/cli.ts auth login
```

**Q: Firestore 写入失败？**
```
确保没有 undefined 字段混入数据对象
```

**Q: 模型返回 429/404？**
```
这是容量问题，系统会自动 fallback 到其他模型
```

---

## 📄 许可证

[MIT](LICENSE) © OpenSynapse Contributors

---

## 🙏 致谢

- [Google AI Studio](https://ai.studio) - 项目原型来源
- [FSRS](https://github.com/open-spaced-repetition/fsrs-rs) - 间隔重复算法
- [Firebase](https://firebase.google.com/) - 后端服务
- [Gemini](https://deepmind.google/technologies/gemini/) - AI 能力支持

---

<div align="center">

**Star ⭐ 我们，如果这个项目对你有帮助！**

[Report Bug](https://github.com/JesstLe/OpenSynapse/issues) • [Request Feature](https://github.com/JesstLe/OpenSynapse/issues)

</div>
