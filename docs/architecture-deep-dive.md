# OpenSynapse 深度架构文档

> 用途：补充面试中"架构设计需要再充分一点"的缺口  
> 内容：架构决策记录 (ADR)、核心数据流时序图、性能/扩展性/安全设计

---

## 目录

1. [架构决策记录 (ADRs)](#1-架构决策记录-adrs)
2. [核心数据流时序图](#2-核心数据流时序图)
3. [多提供商 AI Gateway 设计](#3-多提供商-ai-gateway-设计)
4. [知识复利数据流](#4-知识复利数据流)
5. [性能与扩展性设计](#5-性能与扩展性设计)
6. [安全模型](#6-安全模型)

---

## 1. 架构决策记录 (ADRs)

### ADR-1：为什么选择 React + Vite + Express 的"轻全栈"架构？

**状态**：已接受  
**背景**：项目需要快速迭代的前端体验，同时要有服务端能力处理 AI 代理、认证和持久化。

**决策**：
- 前端：**React 19 + Vite 6 + Tailwind CSS 4**
- 后端：**Express 4 + tsx**（开发时直接运行 TypeScript）
- 同仓库、共享类型定义

**考量**：
| 方案 | 优点 | 缺点 |
|------|------|------|
| Next.js (App Router) | 生态丰富、SSR/SSG 内置 | 框架本身较重，部署到 VPS 需要 Node.js 长期运行，且对 SSE 流式支持有坑 |
| 纯前端 + Serverless | 部署简单 | 不适合需要长期运行的 AI 流式代理、向量数据库、本地 Chroma |
| React + Vite + Express | 轻量、启动快、流式响应简单、VPS 部署直接 | 需要手动处理路由和状态管理 |

**结论**：
对于**自托管的 AI 原生应用**，Vite + Express 的组合提供了最佳的开发体验与部署灵活性平衡。tsx 让服务端代码无需构建即可运行，极大加快了迭代速度。

---

### ADR-2：为什么从 Firebase 迁移到自托管（better-auth + PostgreSQL + Chroma）？

**状态**：已接受（迁移完成）  
**背景**：项目原型阶段使用 Firebase Auth + Firestore 快速验证，但随着功能扩展遇到了天花板。

**决策**：
- **认证**：Firebase Auth → **better-auth**
- **主数据库**：Firestore → **PostgreSQL 16 + Drizzle ORM**
- **向量检索**：Firebase Vector Search → **本地 Chroma**

**Firebase 的瓶颈**：
1. **多提供商 AI Key 管理**：Firestore 的文档模型不适合存储和查询"每个用户的每个提供商 API Key"
2. **关系型查询弱**：笔记-闪卡-会话之间的关联查询在 Firestore 中需要多次往返或冗余反规范化
3. **数据主权**：用户的学习数据敏感，长期依赖 Google SaaS 不符合"完全掌控"的产品理念
4. **成本**：Firebase 的读写计费模式在大规模 RAG 检索时成本不可控

**自托管的收益**：
1. **关系型数据模型**：笔记、闪卡、会话、消息表之间有清晰的外键/关联关系
2. **向量检索本地化**：Chroma 本地运行，embedding 写入和相似度搜索无外部 API 调用成本
3. **认证灵活**：better-auth 一行配置即可添加 Google/GitHub/Discord OAuth + 邮箱密码
4. **部署成本可控**：一台阿里云 ECS 即可跑完整套系统

**迁移成本**：
- 编写了 4 个 Drizzle migration 文件逐步修正 schema
- 重构了所有数据访问代码（从 Firestore SDK 切到 Drizzle ORM）
- 但换来的是**完全可控的数据层**和**更低的外部依赖**

---

### ADR-3：为什么自己实现 ProviderGateway，而不是用 litellm / vercel-ai-sdk？

**状态**：已接受  
**背景**：需要同时支持 Gemini 原生协议、OpenAI-compatible 协议、Anthropic-compatible 协议，以及各自的 OAuth 认证方式。

**决策**：
- 自行实现 `providerGateway.ts` 作为内部统一适配层

**为什么不直接用 litellm？**
- litellm 需要额外跑一个 Python 服务，对纯 Node.js 项目来说引入了新语言栈和运维负担
- 我们需要的是**代码层面的适配**，不是代理层面的转发

**为什么不直接用 Vercel AI SDK？**
- 项目不是 Next.js 架构
- Vercel AI SDK 对非 OpenAI 协议的流式响应封装并不完全透明，调试困难
- 我们需要更细粒度的控制（比如图片格式的协议转换、自定义 fallback 逻辑）

**Gateway 的设计优势**：
1. **零额外依赖**：纯 TypeScript 实现，没有引入新的运行时
2. **完全可控**：可以自定义 fallback 策略、重试逻辑、错误分类（认证错误 vs 容量错误 vs 模型不存在）
3. **前后端复用**：`aiModels.ts` 中的模型定义和解析逻辑被前后端共同引用

---

### ADR-4：为什么选择 MaiMemo SSP-MMC 而不是标准 SM-2 / FSRS？

**状态**：已接受（已完成 SSP-MMC 集成）  
**背景**：闪卡复习算法需要科学、可解释，并且最好有工业级验证。

**决策**：
- 主算法：**MaiMemo SSP-MMC**（墨墨背单词，发表于 ACM KDD 2022 & IEEE TKDE）
- 兼容层：保留 `fsrs.ts` 作为备用

**算法对比**：
| 算法 | 核心思想 | 优点 | 缺点 |
|------|----------|------|------|
| SM-2 | 基于稳定性（Stability） | 简单、经典 | 对新卡调度偏保守，难度调整粗糙 |
| FSRS | 基于记忆痕迹的四变量模型 | 开源、可自训练 | 参数调优复杂，对普通用户门槛高 |
| **SSP-MMC** | 基于**记忆半衰期**（Half-life） | 更精准预测遗忘，工业级验证（墨墨背单词千万用户） | 实现细节论文中未完全开源，需要逆向推导 |

**工程实现**：
- `src/services/maimemo.ts` 完整实现了 SSP-MMC 的核心调度逻辑
- 支持 1-18 的难度系数分级
- 遗忘后的重新学习采用精细调整（非简单重置）
- 提供 `predictNextReview` 做纯预览（不持久化）

---

### ADR-5：Persona 系统的设计 —— 为什么要在前端做系统提示词管理？

**状态**：已接受  
**背景**：不同的学习场景（数学、法学、计算机）需要不同的 AI 教学风格。

**决策**：
- 在前端代码中定义预设人格（`src/lib/personas.ts`）
- 支持用户创建自定义人格（存储在 PostgreSQL `customPersonas` 表）
- 所有系统提示词在请求时注入，不在服务端持久化

**设计要点**：
1. **安全边界**：每个预设人格内置 prompt injection 防护，拒绝恶意覆盖系统提示词的尝试
2. **隐藏人格机制**：CS 导师人格被 base64 obfuscate，通过 UI Easter egg（Logo 七连击）解锁，增加产品趣味性
3. **前后端分离**：人格定义在前端，但用户自定义人格保存在后端，实现"预设不可改，自定义可持久化"

---

### ADR-6：为什么选择 Chroma 作为本地向量数据库？

**状态**：已接受  
**背景**：RAG 需要存储笔记的 embedding 并进行相似度检索。

**决策**：使用 **Chroma** 本地运行

**考量**：
| 方案 | 优点 | 缺点 |
|------|------|------|
| Pinecone / Weaviate Cloud | 托管、高可用 | 额外成本、外部依赖、数据出境 |
| PostgreSQL pgvector | 与主数据库统一、事务一致 | 需要安装 pgvector 扩展，某些 VPS 镜像不支持 |
| **Chroma** | 纯 Python/JS 客户端、零配置启动、本地文件存储 | 非分布式、大规模时性能下降 |

**结论**：
对于**个人自托管**场景，Chroma 的"零配置启动"特性非常关键。用户不需要安装 PostgreSQL 扩展，也不需要注册云服务账号。项目中的 `src/vector/chroma.ts` 封装了懒初始化逻辑，即使 Chroma URL 暂时不可用也不会导致应用启动崩溃。

---

## 2. 核心数据流时序图

### 2.1 多提供商 AI 聊天流式请求

```
+--------+     +------------+     +------------+     +----------------+     +-------------+
|  User  |     |  ChatView  |     |  gemini.ts |     |  /api/ai.ts    |     | ProviderGW  |
+--------+     +------------+     +------------+     +----------------+     +-------------+
   |                 |                  |                    |                    |
   | 发送消息        |                  |                    |                    |
   |---------------->|                  |                    |                    |
   |                 | chatWithAIStream()                   |                    |
   |                 |------------------------------------->|                    |
   |                 |                  |                    | resolve credentials|
   |                 |                  |                    | (user DB → env)    |
   |                 |                  |                    |                    |
   |                 |                  |                    | 若为非 Gemini      |
   |                 |                  |                    |------------------->|
   |                 |                  |                    | (GatewayParams)    |
   |                 |                  |                    |                    |
   |                 |                  |                    |<-------------------|
   |                 |                  |                    | (SSE stream)       |
   |                 |                  |<-------------------| (chunk proxy)      |
   |                 |<-----------------| (parsed chunk)     |                    |
   | 逐字显示        |                  |                    |                    |
   |<----------------|                  |                    |                    |
```

### 2.2 知识提炼闭环（Chat → Note → Flashcard → Graph）

```
+--------+     +------------+     +---------------+     +-------------+     +------------+
|  User  |     |  ChatView  |     |  gemini.ts    |     |   App.tsx   |     |  PostgreSQL |
+--------+     +------------+     +---------------+     +-------------+     +------------+
   |                 |                  |                    |                    |
   | 点击"提炼知识"  |                  |                    |                    |
   |---------------->|                  |                    |                    |
   |                 | processConversation()                  |                    |
   |                 |--------------------------------------->|                    |
   |                 |                  | AI 返回 {note, flashcards, tags}        |
   |                 |                  |<-------------------|                    |
   |                 | onProcess()      |                    |                    |
   |                 |----------------->| handleSaveNote()   |                    |
   |                 |                  |------------------->|                    |
   |                 |                  |                    | 1. insert note     |
   |                 |                  |                    | 2. generate embedding
   |                 |                  |                    | 3. findSemanticLinks
   |                 |                  |                    | 4. insert flashcards
   |                 |                  |                    |------------> commit |
   |                 |                  |<-------------------|                    |
   | 显示"已保存"     |                  |                    |                    |
   |<----------------|                  |                    |                    |
```

---

## 3. 多提供商 AI Gateway 设计

### 3.1 模型注册表（`src/lib/aiModels.ts`）

```typescript
AI_PROVIDERS = {
  gemini:     { protocol: 'gemini_native',     auth: 'api_key_or_oauth' },
  openai:     { protocol: 'openai_compat',     auth: 'api_key' },
  minimax:    { protocol: 'anthropic_compat',  auth: 'api_key' },
  zhipu:      { protocol: 'openai_compat',     auth: 'api_key' },
  moonshot:   { protocol: 'openai_compat',     auth: 'api_key' },
}
```

### 3.2 请求分发流程

```
User selects "openai/gpt-5.4"
        |
        v
+---------------+
| parseModelId  |  → { provider: 'openai', modelId: 'gpt-5.4' }
+---------------+
        |
        v
+---------------+
| resolveProviderConfig |
+---------------+
        |
        v
   Is provider 'gemini'?
     ├─ Yes → codeAssist.ts (Gemini native)
     └─ No  → providerGateway.ts
                  |
                  ├─ protocol === 'openai_compat'
                  │     → buildChatCompletionsBody() → OpenAI API
                  │
                  ├─ protocol === 'anthropic_compat'
                  │     → buildAnthropicBody() → Anthropic/MiniMax API
                  │
                  └─ protocol === 'codex_oauth'
                        → buildOpenAICodexBody() → Codex OAuth API
```

### 3.3 流式响应解析的差异处理

不同提供商的 SSE 格式不同，ProviderGateway 为每种协议实现了独立的 parser：

- **OpenAI-compatible**：`data: {"choices":[{"delta":{"content":"..."}}]}`
- **Anthropic-compatible**：`event: content_block_delta\ndata: {"delta":{"text":"..."}}`
- **OpenAI Codex**：与 OpenAI 类似，但需要在 header 中携带 OAuth token

```typescript
// 统一的 async generator 接口
async function* generateContentStreamWithApiKeyProvider(params) {
    if (provider.protocol === 'openai_compat') {
        yield* streamChatCompletions(body, apiKey, baseUrl);
    } else if (provider.protocol === 'anthropic_compat') {
        yield* streamAnthropicCompletions(body, apiKey, baseUrl);
    }
}
```

### 3.4 Credential 解析优先级与并发安全

```
请求到达 /api/ai/generateContentStream
        |
        v
+----------------------------------+
| resolveProviderCredentialsFromRequest |
+----------------------------------+
        |
        v
   优先级链：
   1. req.headers['x-provider-api-key'] (临时传入)
   2. PostgreSQL api_keys 表中该用户的 Key
   3. 全局环境变量 (GEMINI_API_KEY / OPENAI_API_KEY ...)
   4. OAuth Token (仅限 Gemini)
```

**并发安全**：
对于非 Gemini 提供商，代码使用了一个基于 Promise 的锁机制（`withProviderCredentials`）来确保多用户并发时，临时的 env-var 覆盖不会互相串扰。

---

## 4. 知识复利数据流

### 4.1 Embedding 生成与 RAG 检索

```
Note 被创建/更新
        |
        v
+---------------+
| generateEmbedding(note.content) |
+---------------+
        |
        v
 调用 /api/ai/embedContent
        |
        v
+---------------+
| 首选智谱 Embedding-3 |
| 失败则 fallback 到 Gemini/OpenAI embedding |
+---------------+
        |
        v
 返回 1024/1536 维向量
        |
        v
 存储到 PostgreSQL notes.embedding
        |
        v
 写入 Chroma collection (用于大规模相似度检索)
```

RAG 检索时：
1. 将用户当前问题生成 embedding
2. 在 Chroma 中做 cosine similarity top-k 检索
3. 将相关笔记内容注入到 system prompt 中作为上下文

### 4.2 MaiMemo SSP-MMC 算法核心

```typescript
// 简化逻辑
function schedule(card, rating) {
    const elapsedDays = daysSince(card.lastReview);
    const currentRetention = Math.pow(0.5, elapsedDays / card.halflife);
    
    // 根据 rating 和用户历史表现更新 halflife 和 difficulty
    const newHalflife = calculateNewHalflife(card, rating, elapsedDays);
    const newDifficulty = clamp(card.difficulty + difficultyDelta(rating), 1, 18);
    
    return {
        ...card,
        halflife: newHalflife,
        difficulty: newDifficulty,
        nextReview: addDays(now, newHalflife * scheduleFactor),
        state: rating === 'Again' ? 'relearning' : 'review',
    };
}
```

**与 SM-2 的关键差异**：
- SM-2 基于 Stability（稳定性）调度
- SSP-MMC 基于 **Half-life（半衰期）** 调度，更强调"记忆随时间自然衰减的物理规律"

---

## 5. 性能与扩展性设计

### 5.1 前端性能

**知识图谱大规模优化**：
- D3.js 力导向图在节点超过 500 时容易卡顿
- 优化措施：
  1. **虚拟渲染**：只渲染视口内的节点和边
  2. **力仿真参数调优**：降低碰撞检测强度，启用 alpha decay
  3. **节点聚合**：当缩放级别较低时，将相近节点聚合成 cluster

**聊天消息列表**：
- 使用 React 的 `key` 优化和消息组件的 memoization
- 长会话采用"加载更多"而非一次性渲染全部历史

### 5.2 后端性能

**数据库连接池**：
```typescript
// src/db/index.ts
export const db = drizzle({
    connection: {
        connectionString: process.env.DATABASE_URL,
        max: 20,        // 最大连接数
        idle_timeout: 20,
        connect_timeout: 10,
    },
});
```

**Embedding 降级策略**：
如果智谱 embedding API 不可用，系统会 fallback 到 Gemini/OpenAI 的 embedding 模型，保证 RAG 功能不因单一服务故障而完全失效。

### 5.3 扩展性预留

**水平扩展路径**：
当前是单进程 Express + 本地 Chroma。如果要支持更多用户：
1. **应用层**：用 PM2 cluster mode 或 Docker Compose 横向扩展 Express 实例（无状态）
2. **数据库层**：PostgreSQL 主从复制或升级到 RDS
3. **向量层**：将本地 Chroma 替换为 Chroma Server 或 pgvector
4. **AI Gateway**：本身就是无状态的，可以直接多实例部署

---

## 6. 安全模型

### 6.1 认证安全

- **better-auth** 默认使用安全的 session cookie + CSRF 防护
- `trustedOrigins` 严格白名单：`localhost:3000` 和生产域名
- `trustedProxies` 配置防止 IP 伪造攻击
- 密码策略：最小 8 字符，最大 128 字符

### 6.2 数据隔离

- 所有业务表都有 `userId` 字段
- Repository 层强制过滤：
  ```typescript
  // note.repo.ts
  await db.select().from(notes).where(eq(notes.userId, userId));
  ```
- API 路由统一通过 `auth-middleware.ts` 验证 session

### 6.3 API Key 安全

- 用户级 API Key 存储在 PostgreSQL，不暴露给其他用户
- 服务端查询时只返回当前用户的 Key
- 全局环境变量作为 fallback，但优先级最低

### 6.4 Prompt 安全

- 所有预设人格的系统提示词包含 **prompt injection 防护指令**
- 如果用户输入试图覆盖系统提示词，AI 会被要求拒绝执行
- CS 导师的提示词做了 base64 obfuscate，增加逆向成本

### 6.5 部署安全

- 生产服务器仅开放 22 (SSH)、80 (HTTP)、3000 (内部)
- Nginx 作为反向代理隐藏 Node.js 进程
- PM2 进程守护，崩溃自动重启
