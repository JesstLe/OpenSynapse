# 面试项目口述稿：OpenSynapse（突触）

> 用途：二面项目陈述  
> 时长建议：10-15 分钟  
> 核心人设：**自驱型全栈 AI 工程实践者**，主动追踪前沿、动手验证、完成从 0 到 1 再到生产的完整闭环。

---

## 1. 30 秒电梯演讲（开场钩子）

"我做了一个 AI 驱动的知识复利系统，叫 **OpenSynapse**。它的核心理念是把学习从'被动收藏'变成'主动复利'。

系统打通了四个环节：
- **聊天学习** —— 和多人格 AI 导师对话
- **知识提炼** —— 自动把对话转成结构化笔记和闪卡
- **科学复习** —— 用墨墨背单词的 SSP-MMC 算法（KDD 2022）安排复习
- **知识图谱** —— 用 D3.js 可视化概念之间的关联

技术上，它支持 5 家 AI 提供商，完成了从 Firebase 到自托管架构的迁移，并且已经部署到了阿里云上运行。"

---

## 2. 项目缘起：自驱性起源（1-2 分钟）

**要说的：**

> "2025年底，我在用 Gemini 和 Kimi 学习新技术时发现一个痛点：和 AI 聊了很多，但聊完就散了。对话记录散落在各个平台，没有结构化沉淀，更没有复习机制。
>
> 我调研了 Notion、Obsidian、Anki 这些工具，发现它们各自只解决了片段问题：
> - Notion 适合记录，但不擅长 AI 对话学习
> - Anki 适合复习，但制卡成本很高
> - Obsidian 有图谱，但没有内置的 AI 提炼和间隔重复
>
> **我就想验证：能不能把 AI 对话、自动笔记、科学复习、知识图谱这四个环节，整合到一个自托管的系统里？**
>
> 更关键的是，我不想被单一 AI 提供商绑定，也不想让自己的学习数据放在别人的 SaaS 里。所以项目从一开始就有两个硬性约束：**多 AI 提供商支持**、**完全自托管**。
>
> 于是我从零开始，用两个月时间完成了从原型到生产部署的完整闭环。"

**自驱性证据（可随口带出）：**
- 独立完成全栈开发 + 生产部署（React + Express + PostgreSQL + Chroma + 阿里云 ECS + Nginx + PM2）
- 主动追踪并落地了 better-auth、Drizzle ORM、MaiMemo SSP-MMC 算法、Chroma 向量数据库
- 为了不被单一模型绑定，自己设计并实现了**多提供商统一网关**，支持 Gemini / OpenAI / MiniMax / 智谱 / Moonshot
- 完成了从 Firebase（Auth + Firestore）到自托管架构（better-auth + PostgreSQL + Chroma）的完整迁移

---

## 3. 架构全景：分层的理由（3-4 分钟）

**先放图：**

```
消费层
  └─ Web Browser (React 19 SPA)
         |
接口层
  ├─ Vite Dev Server (开发) / Static Serve (生产)
  └─ Express API Server
        ├─ /api/ai/*      → AI Gateway (多提供商路由)
        ├─ /api/data/*    → Data CRUD (notes/flashcards/chats)
        ├─ /api/auth/*    → better-auth (OAuth + 邮箱密码)
        └─ /api/rag/*     → 向量检索
         |
服务层
  ├─ ProviderGateway    → OpenAI/Anthropic 协议适配
  ├─ EmbeddingService   → 向量生成与检索
  ├─ MaiMemoService     → SSP-MMC 间隔重复算法
  ├─ ImportParsers      → 多格式对话导入
  └─ PersonaSystem      → 多导师人格 + 安全边界
         |
数据层
  ├─ PostgreSQL         → 用户数据、笔记、闪卡、会话
  ├─ Chroma (本地)      → 向量数据库 (embeddings)
  └─ Drizzle ORM        → Schema 定义与迁移
```

**强调分层的设计意图：**

> "我的架构设计遵循一个原则：**前端只关心 UI 状态，后端只关心数据与权限，AI 逻辑完全解耦到服务层。**
>
> 具体来说：
> - **ProviderGateway** 这层特别重要。我把所有非 Gemini 的提供商（OpenAI、MiniMax、智谱、Moonshot）都抽象成了统一的 `GatewayParams` 接口，内部再转成 OpenAI-compatible 或 Anthropic-compatible 的请求格式。这意味着前端调用 AI 时，完全不需要关心底层是哪家模型。
> - **数据层**经历了一次重大迁移：项目早期用 Firebase Auth + Firestore，后来我为了完全掌控数据，主动迁移到了 **better-auth + PostgreSQL + Chroma**。迁移后所有数据都留在自己的服务器上，且支持了邮箱/密码登录。
> - **复习算法**不是简单写个 SM-2，而是完整集成了 **墨墨背单词的 SSP-MMC 算法**（发表在 ACM KDD 2022），基于记忆半衰期而非稳定性来做调度，这在开源项目里是比较少见的。"

---

## 4. 三个架构亮点（3-4 分钟，重点讲）

### 亮点 1：多提供商 AI Gateway —— 不被任何一家模型绑架

> "这是我最花心思的一个模块。当前市面上的 AI 应用大多只接一家模型，但模型的可用性和价格变化很快。我设计了一个三层网关：
>
> **第一层：模型注册表**（`src/lib/aiModels.ts`）
> - 定义了所有支持的模型和提供商
> - 每个模型有 `protocol` 字段：`gemini_native`、`openai_compat`、`anthropic_compat`
> - 内置 fallback 链：比如 `gpt-5.4` 不可用时会自动降级到 `gpt-5.3`
>
> **第二层：ProviderGateway**（`src/lib/providerGateway.ts`）
> - 把内部统一的 `GatewayParams` 翻译成不同协议的请求体
> - 处理了三种流式响应的解析差异（OpenAI SSE、Anthropic SSE、Codex SSE）
> - 图片输入的格式转换：Gemini 用 inlineData，OpenAI 用 image_url，Anthropic 用 base64 source
>
> **第三层：Credential 解析**（`src/api/ai.ts`）
> - 优先级：用户个人 API Key（PostgreSQL 中存储） > 全局环境变量 > OAuth Token
> - 实现了基于锁的 env-var 切换（`withProviderCredentials`），保证多用户并发请求时不会串 Key
>
> 这套网关让我可以在 UI 里一键切换 5 家提供商、20+ 个模型，而业务代码完全无感。"

### 亮点 2：从 Firebase 到自托管的架构迁移

> "项目早期用 Firebase（Auth + Firestore）快速验证了原型，但当我想支持商业级多租户、用户级 API Key、以及完全的数据掌控时，Firebase 成了瓶颈。
>
> 我主动发起了一次完整迁移：
> - **认证**：Firebase Auth → **better-auth**，支持 Google/GitHub/Discord OAuth + 邮箱密码
> - **数据库**：Firestore → **PostgreSQL + Drizzle ORM**
> - **向量检索**：Firebase Vector Search → **本地 Chroma**
>
> 迁移中的关键技术点：
> 1. **Schema 兼容**：better-auth 对 Drizzle schema 有严格要求（比如 `verifications` 表、session 的 `ipAddress` / `userAgent` 列），我写了 4 个 migration 文件逐步修正
> 2. **数据隔离**：所有业务表（notes、flashcards、chat_sessions）都有 `userId` 字段，查询层统一过滤
> 3. **行级安全替代**：Firestore 有原生的 RLS，PostgreSQL 里没有。我在 repository 层（如 `note.repo.ts`、`flashcard.repo.ts`）显式封装了 `where eq(userId, ...)`，实现了等效隔离
>
> 迁移完成后，系统从'依赖 Google 基础设施'变成了'一台 VPS 就能跑完'的自托管方案。"

### 亮点 3：AI 对话 → 知识提炼 → 科学复习 → 知识图谱 的完整闭环

> "这四个字面功能是产品的灵魂，它们的连接方式体现了'知识复利'的设计理念：
>
> **Step 1：聊天学习**
> - 用户和 AI 导师对话，支持多模态（文本、图片、PDF、URL）
> - 每次对话都会保存为 `chatSession`，并存储在 PostgreSQL 中
>
> **Step 2：知识提炼**
> - 用户点击"提炼知识"，系统调用 `processConversation()`
> - AI 自动输出结构化 JSON：{ title, summary, content, flashcards[], tags, relatedConcepts }
> - 由于不同模型的 JSON 输出格式不一致（有的包 markdown code block，有的直接返回对象），我实现了 `safeJsonParse()` 做鲁棒提取
>
> **Step 3：科学复习**
> - 提炼出的 flashcards 会自动进入 MaiMemo SSP-MMC 调度队列
> - 复习时用户给 rating（Again/Hard/Good/Easy），算法更新记忆半衰期和难度系数
> - /dashboard 里会可视化展示记忆保持率和复习进度
>
> **Step 4：知识图谱**
> - 新笔记生成时会调用 `findSemanticLinks()`，基于 embedding 余弦相似度找到最相关的已有笔记
> - 这些链接关系被 D3.js 渲染成力导向图
> - 节点颜色深浅代表遗忘程度，实现'视觉驱动的学习'
>
> 这四个环节不是独立的 CRUD，而是**一个连续的数据流**。"

---

## 5. 工程实践与部署（1 分钟）

> "这个项目不是停留在本地的玩具，而是**真正部署上线**的系统。
>
> **生产环境**：
> - 服务器：阿里云 ECS（Ubuntu 24.04）
> - 进程管理：PM2
> - 反向代理：Nginx（80 → 3000）
> - 数据库：PostgreSQL 16
> - 部署方式：本地 `./deploy.sh` 一键 rsync + 服务器端 npm install + PM2 restart
>
> **工程规范**：
> - TypeScript 严格模式 + `tsc --noEmit` 类型检查
> - 优先不可变更新，async/await + try/catch 统一错误处理
> - 前后端共享类型定义，通过 Drizzle schema 保证数据结构一致
>
> 产线运行地址：`http://101.133.166.67`（已下线或内网则略过）"

---

## 6. 与竞品的差异化（主动带出）

| 维度 | Notion AI | Anki | Obsidian + 插件 | **OpenSynapse** |
|------|-----------|------|-----------------|-----------------|
| AI 对话学习 | 有，但弱 | 无 | 依赖第三方插件 | **原生多人格导师** |
| 自动笔记提炼 | 部分支持 | 无 | 依赖 AI 插件 | **内置结构化提取** |
| 科学复习 | 无 | **SM-2/FSRS** | 需插件 | **SSP-MMC (KDD 2022)** |
| 知识图谱 | 弱 | 无 | **强** | **强 + 遗忘程度着色** |
| 多 AI 提供商 | 无 | 无 | 无 | **5 家提供商一键切换** |
| 数据掌控 | SaaS | 本地 | 本地 | **完全自托管** |

> "OpenSynapse 的定位不是取代上面任何一款工具，而是**把 AI 对话、笔记、复习、图谱这四个环节无缝打通**，并且坚持自托管和多模型不绑定。"

---

## 7. 收尾：体现自驱性与成长性（1 分钟）

> "这个项目做完后，我最大的收获是对 **AI 原生应用架构** 的系统性理解：
>
> 1. **模型层必须抽象**：不能把业务代码和某一家的 API 格式绑死。ProviderGateway 的设计让我能在 GPT-5.4 发布当天就支持上线。
> 2. **数据层必须可控**：对于知识管理这种高频、私密的数据，自托管是长期最优解。Firebase 迁移虽然痛苦，但换来了完全的掌控力。
> 3. **AI 不是替代人，而是放大人**：SSP-MMC 算法、自动提炼、RAG 这些能力的终极目标，都是**降低用户的认知负荷**，让知识积累变成复利。
>
> 接下来我还在迭代：
> - 把 RAG 从'全文检索'升级为'工具调用 + Agentic RAG'
> - 探索浏览器扩展，实现'一键把网页内容加入突触'
> - 研究 OpenAI 的 Deep Research 模式，看看能不能把'知识调研'也纳入工作流"

---

## 8. 二面讲述时间分配建议

| 环节 | 时间 | 关键动作 |
|------|------|----------|
| 电梯演讲 | 30s | 抛出四个关键词：聊天、提炼、复习、图谱 |
| 项目缘起 | 1-2min | **重点突出自驱性**：发现问题、调研缺口、动手验证 |
| 架构全景 | 2min | 展示分层图，强调 ProviderGateway 的解耦价值 |
| 三个亮点 | 4-5min | 多提供商网关、Firebase 迁移、知识复利闭环 |
| 部署实践 | 1min | 阿里云 + PM2 + Nginx，体现工程完整度 |
| 差异化 | 1min | 主动对比竞品，展示产品判断力 |
| 收尾 | 1min | 升华到 AI 原生应用架构的认知 |

---

## 9. 附件清单（面试前准备好）

1. **系统演示**：打开 `http://101.133.166.67`（或本地 dev 环境），展示 ChatView → 提炼 → 复习 → 图谱的完整流程
2. **架构图**：`docs/architecture-deep-dive.md` 中的分层图
3. **Git 演进**：展示从 Firebase 版 → 自托管迁移 → 多提供商支持的 commit 路径
4. **关键代码片段**（可选）：
   - `providerGateway.ts` 的协议适配逻辑
   - `aiModels.ts` 的 fallback 链定义
   - `maimemo.ts` 的 SSP-MMC 调度核心
   - `db/schema.ts` 的 Drizzle schema 定义
