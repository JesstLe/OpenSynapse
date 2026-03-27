# 复刻 Gemini 网页端 / App 对话体验实现文档

**项目**: OpenSynapse  
**日期**: 2026-03-28  
**目标**: 在 OpenSynapse 中复刻接近 Gemini 网页端 / App 的对话体感，而不是继续沿用当前“重 RAG + 重系统提示 + 单次请求”的聊天链路。

## 1. 结论

可以复刻到一个用户可感知上非常接近 Gemini 网页端 / App 的版本，但建议分两层理解：

- **能复刻的**：流式输出、低延迟首字、对话式多轮上下文、图片/文件输入、模型切换、重新生成、停止生成、会话历史、语音模式、工具调用、附件工作流。
- **不能完全照搬的**：Gemini 官方网页端的一些闭源服务端策略，例如内部调度、专属限流桶、私有排序/重试器、产品侧提示工程、账号级实验特性。

因此，本项目的正确目标不是“1:1 复制 Google 私有后端”，而是：

1. 先把 **体感** 做到像 Gemini。
2. 再把 **底层实现** 尽量切到官方公开 API 能支持的最佳路径。

---

## 2. 当前现状

当前聊天主链路在以下文件：

- `/Users/lv/Workspace/OpenSynapse/src/components/ChatView.tsx`
- `/Users/lv/Workspace/OpenSynapse/src/services/gemini.ts`
- `/Users/lv/Workspace/OpenSynapse/src/api/ai.ts`
- `/Users/lv/Workspace/OpenSynapse/src/lib/codeAssist.ts`

### 2.1 当前做法

- 前端每次发送消息时，会调用 `chatWithAI(messages, notes)`。
- `chatWithAI()` 会在每一轮：
  - 查找相关笔记做 RAG
  - 注入一大段固定系统提示
  - 把整段会话历史一起发给模型
- 服务端 `/api/ai/generateContent` 当前支持两条路径：
  - `GEMINI_API_KEY` 路径
  - Gemini CLI / Code Assist OAuth 路径
- Code Assist 路径当前是非流式 `generateContent` 包装，并带简单 fallback。

### 2.2 为什么它不像 Gemini 网页端 / App

当前体验和 Gemini 网页端差异主要有 6 个：

1. **没有真正的流式体验**
   当前前端是整段返回后一次性展示，不像 Gemini 的“边生成边显示”。

2. **每轮请求过重**
   当前会把完整历史 + 长系统提示 + RAG 背景都塞进去，导致首字慢、429 更频繁。

3. **RAG 触发过于激进**
   用户只打个“你好”，也会走知识检索逻辑。这和 Gemini 网页端的“默认轻聊天，必要时再调工具”不同。

4. **模型能力与可用性没有分层**
   现在 UI 允许切模型，但没有把“推荐模型 / 不稳定模型 / 当前链路不可用模型”分层呈现。

5. **没有 Gemini 风格的消息生命周期**
   目前缺少：
   - 停止生成
   - 重新生成
   - 编辑后重发
   - 局部流式占位
   - 明确的“思考中 / 搜索中 / 读取附件中”状态

6. **语音与实时模式仍未接入**
   Gemini App 的核心感知之一是低延迟语音对话，这要靠 Live API 而不是普通文本 `generateContent`。

---

## 3. 目标体验定义

如果目标是“像 Gemini 网页端 / App 一样好用”，建议把体验拆成两个级别。

### 3.1 P0：先做出 Gemini 网页端文本体验

必须具备：

- 文本回复流式输出
- 首字延迟尽可能低
- 默认轻量聊天，不默认塞大段 RAG
- 支持多轮上下文
- 支持模型切换
- 支持停止生成
- 支持重新生成
- 支持编辑后重发
- 支持图片 / PDF / 文件提问
- 支持错误转可理解提示，而不是统一报错

### 3.2 P1：再做 Gemini App 式“实时助手体验”

增强项：

- 语音输入 / 语音输出
- 低延迟打断（barge-in）
- 实时转录
- 摄像头 / 截图 / 实时视觉输入
- 工具调用时的状态流

P0 建议优先落地，P1 作为第二阶段。

---

## 4. 推荐架构

## 4.1 文本聊天层

建议把当前聊天链路拆成 3 层：

### A. `Chat Orchestrator`

职责：

- 接受前端消息
- 判定是否需要 RAG / 文件分析 / URL context
- 选择模型
- 组装系统提示
- 执行 fallback / retry / backoff

建议新增：

- `src/lib/chatOrchestrator.ts`

### B. `Transport`

职责：

- 对 Gemini API 或 Code Assist 做最薄的一层适配
- 提供：
  - `generateContent`
  - `streamGenerateContent`
  - `uploadFile`
  - `countTokens`

建议新增：

- `src/lib/aiTransport.ts`

### C. `Conversation State`

职责：

- 维护前端会话状态
- 消息草稿、流式增量、停止信号、重试状态
- Firestore 持久化和本地 UI 状态解耦

建议新增：

- `src/lib/chatSessionStore.ts`

---

## 5. 官方能力映射

下面是“Gemini 体验”对应到官方公开 API 的推荐映射。

### 5.1 多轮对话

官方文档说明，SDK 提供 `chats.create()` / `sendMessage()` / `sendMessageStream()` 这类 chat 接口，但底层仍然是 `generateContent`，并且**每次 follow-up 都会带上完整历史**。

这意味着：

- 我们不能依赖服务端“神奇记忆”
- 需要自己管理会话历史
- 更要控制历史长度，否则延迟和限流会越来越明显

适合当前项目的做法：

- 前端/服务端自己维护 `ChatSession`
- 每轮只发送：
  - 近期若干轮对话
  - 结构化的长期摘要
  - 必要时才加检索上下文

### 5.2 流式输出

官方文档支持多轮对话下的流式发送。  
这部分是最接近 Gemini 网页端体感的关键能力。

建议：

- 文本聊天默认全部切到流式
- 前端展示增量 token
- 支持“停止生成”
- 流结束后再持久化最终消息

### 5.3 上下文缓存

官方文档支持 Context Caching。  
对于“长系统提示 + 长资料 + 长附件”的场景，这比每次重发整个大 prompt 更接近 Gemini 产品的实际体验。

适合本项目的场景：

- 长系统提示
- 大 PDF / 文档问答
- 固定知识包或课程大纲

建议：

- 对“会话常驻前缀”做缓存
- 对“大文件分析会话”做缓存
- 普通短聊天不强制使用缓存

### 5.4 文件输入

官方公开 API 提供 Files API。  
对 PDF、图片、长文档，不建议继续默认走前端 base64 直塞。

建议：

- 图片：保留轻量 base64 直传作为开发兜底
- PDF / 大文件：走 Files API 上传后引用
- 文档分析：文件上传后分离“解析”和“聊天”

### 5.5 工具调用

官方文档支持 Function Calling。  
如果要复刻 Gemini 网页端“必要时自己去搜、去查、去算”的体感，工具调用比“每轮硬塞所有知识背景”更合理。

建议优先的本地工具：

- `searchNotes(query)`
- `openNote(noteId)`
- `extractFlashcards(sessionId)`
- `summarizeDocument(fileId)`

原则：

- 默认聊天先不用工具
- 模型需要外部知识时再调用
- 让工具替代过度 RAG

### 5.6 语音与实时体验

官方文档中，Live API 是实现 Gemini App 风格实时语音/视觉体验的正确路径。  
Live API 支持低延迟、可打断、多语言、转录、工具调用和状态化 WebSocket。

因此：

- 如果只是复刻 Gemini 网页端文本聊天，不需要 Live API
- 如果想接近 Gemini App，必须上 Live API

---

## 6. 推荐的产品行为

## 6.1 默认消息策略

当前问题是“所有轮次都像在做复杂知识工程”。  
Gemini 网页端不是这样工作的。

建议改成三档策略：

### 档位 A：轻聊天

触发条件：

- 消息较短
- 没附件
- 没有明确知识库查询意图

发送内容：

- 短系统提示
- 最近 6~12 条消息

不做：

- RAG
- embeddings
- 长上下文拼接

### 档位 B：增强聊天

触发条件：

- 提到已有笔记概念
- 用户问“结合我之前的内容”
- 命中高相似度知识点

发送内容：

- 轻系统提示
- 最近消息
- 最多 1~3 条摘要型知识上下文

### 档位 C：文档/研究模式

触发条件：

- 上传文件
- 处理长 PDF
- 显式要求深度分析

发送内容：

- Files API / cache / 专门的分析 prompt
- 与普通聊天会话隔离

这 3 档是复刻 Gemini 体感的核心。  
**不要让所有请求都走 C 档。**

## 6.2 历史消息压缩

建议加入两级记忆：

- **短期记忆**：最近 N 轮原始消息
- **长期记忆**：模型生成的会话摘要

当消息过长时：

1. 保留最近消息
2. 把更早对话压缩成摘要
3. 摘要作为系统前缀或专门 memory block

这样可以明显降低延迟和 429。

## 6.3 模型策略

当前建议把模型分成 3 类。

### 默认模型

- `gemini-2.5-flash`

原因：

- 稳定
- 通用
- 成本和延迟都更容易控制

### 高阶模型

- `gemini-2.5-pro`
- `gemini-3.1-pro-preview`

适用于：

- 长文分析
- 复杂推理
- 代码重构 / 长规划

### 实验模型

- `gemini-3-flash-preview`

适用于：

- 想接近 Gemini 新网页体验时的默认候选
- 但要明确标记为可能容量波动

当前项目若追求“好用优先”，建议默认模型先切回：

- `gemini-2.5-flash`

而不是把 Preview 当主默认。

---

## 7. 具体实现方案

## Phase 1：把当前 Web 文本聊天改得像 Gemini

### 7.1 服务端

#### 7.1.1 增加流式接口

新增接口：

- `POST /api/ai/streamGenerateContent`

返回方式：

- `text/event-stream`
或
- chunked response

服务端职责：

- 调用模型流式接口
- 逐 chunk 返回给前端
- 流结束时附带最终 metadata

#### 7.1.2 实现请求编排器

新增模块：

- `src/lib/chatOrchestrator.ts`

功能：

- 判定请求档位 A/B/C
- 选模型
- 选 fallback
- 控制重试和 backoff
- 只在需要时注入 RAG

#### 7.1.3 加入退避与限流策略

建议：

- 429 / capacity exhausted:
  - 指数退避
  - 单次请求最多 2 次轻量重试
- 404 model not found:
  - 直接切 fallback，不重试原模型

#### 7.1.4 引入消息摘要器

新增模块：

- `src/lib/chatMemory.ts`

能力：

- 当历史超过阈值时自动摘要
- 保存：
  - `recentMessages`
  - `conversationSummary`

### 7.2 前端

#### 7.2.1 流式渲染

`ChatView.tsx` 需要改成：

- 发送后立即插入一条空的 model message
- 每收到一个 chunk，就 append 到这条 message
- 支持停止按钮
- 完成后再允许“重新生成”

#### 7.2.2 消息操作

补齐 Gemini 风格操作：

- 停止生成
- 重新生成最后一条回复
- 编辑用户最后一条消息并重发
- 复制回复

#### 7.2.3 更像 Gemini 的状态提示

需要区分：

- 正在生成
- 正在读取知识库
- 正在处理附件
- 当前模型拥挤，正在切换备用模型

而不是统一提示“抱歉，我遇到了错误”。

#### 7.2.4 模型选择器重构

推荐把当前模型列表分成：

- 推荐
- 高推理
- 实验
- 自定义

并给每个模型明确标签：

- 稳定
- 预览
- 当前链路可能不可用

---

## Phase 2：接近 Gemini 网页端的“附件 + 工具”体验

### 8.1 文件聊天

目标：

- 上传 PDF 后进入“围绕这份文件聊天”的专门会话

建议：

- 普通聊天与文件聊天分离
- 文件上传后生成 `fileContext`
- 后续问题直接引用 file context，而不是重新抽全文

### 8.2 工具调用代替过度 RAG

目标：

- 让模型自己决定是否要检索笔记，而不是每轮强塞知识背景

第一批工具：

- `searchNotes`
- `getNoteById`
- `getRecentSessions`
- `extractKnowledgeAssetsFromConversation`

### 8.3 URL / Search / Web 内容

如果后续要更像 Gemini 网页端的“联网感”，建议：

- 先做 URL context
- 再做 web fetch/search

但这部分要和产品目标区分：

- 学习助手优先：先做好 notes / files / docs
- 通用 Gemini 替代品：再加 web tools

---

## Phase 3：接近 Gemini App 的实时语音体验

这部分只有在你真的想做 App 风格助手时才值得上。

### 9.1 采用 Live API

推荐结构：

- Web 前端采集麦克风
- 服务端签发临时凭证
- 前端通过 WebSocket 直连 Live API

理由：

- 延迟更低
- 体验更像 Gemini App
- 可支持打断、转录、语气更自然的连续对话

### 9.2 语音模式与文本模式分离

不要把普通文本聊天和实时语音混成一条复杂链路。

建议：

- `Text Chat`
- `Live Voice`

分别维护状态机。

---

## 8. 具体代码改造建议

### 第一优先级

1. 新增 `streamGenerateContent` 服务端接口
2. `ChatView` 改成流式渲染
3. `chatWithAI()` 改为轻量默认模式
4. 把 RAG 改成按需触发
5. 加入短期历史 + 摘要记忆

### 第二优先级

6. 文件聊天独立会话
7. function calling 接笔记检索
8. context caching 处理长上下文
9. 模型可用性标签和自动切换

### 第三优先级

10. Live API 语音模式
11. 视觉输入
12. 更细的工具状态流

---

## 9. 推荐的数据结构

```ts
type ConversationMemory = {
  summary: string;
  recentMessages: ChatMessage[];
  retrievedContext: Array<{
    sourceId: string;
    title: string;
    snippet: string;
  }>;
};

type ChatGenerationMode =
  | 'light'
  | 'augmented'
  | 'document';

type ModelExecutionPlan = {
  requestedModel: string;
  effectiveModel: string;
  fallbacks: string[];
  mode: ChatGenerationMode;
  useRag: boolean;
  useTools: boolean;
  useCache: boolean;
  useStreaming: boolean;
};
```

---

## 10. 最小可行版本（推荐）

如果要以最少改动先做出“像 Gemini”的版本，我建议只做下面这些：

1. 默认模型改为 `gemini-2.5-flash`
2. 所有聊天改成流式
3. 普通聊天默认不做 RAG
4. 只有用户明确引用已有知识时才做 RAG
5. 历史过长时自动摘要
6. 支持停止生成 / 重新生成
7. 把模型错误改成“自动降级并提示当前使用的备用模型”

只做这 7 项，用户感知会明显更接近 Gemini 网页端。

---

## 11. 风险与边界

### 11.1 用 Code Assist 复刻 Gemini 体验的边界

当前项目已经接上 Gemini CLI / Code Assist 风格登录。  
这能解决“登录”和“免费可用”的问题，但它不等于 Gemini 官方网页端的完整产品后端。

潜在问题：

- 某些模型在 Code Assist 路径下不可用
- 某些 Preview 模型容量波动大
- 行为和 Gemini API 正式公开端点不一定完全一致

因此，如果后续你的产品目标是：

- **内部自用 / 个人产品**：继续走 Code Assist 可以
- **稳定商用**：最终建议切到公开 Gemini API / Vertex AI 正式链路

### 11.2 不要继续把所有知识能力绑在首轮聊天里

“聊天像 Gemini” 的前提是：

- 快
- 轻
- 自然

而不是：

- 每轮都做知识工程
- 每轮都塞很多上下文
- 每轮都走复杂分析

---

## 12. 建议的下一步

推荐按这个顺序推进：

1. **先做 P0 文本体验**
   - 流式
   - 轻量默认聊天
   - 停止/重试/重生成功能
   - 摘要记忆

2. **再做工具化增强**
   - 按需检索 notes
   - 文件聊天
   - context caching

3. **最后做 Live 语音**
   - 只有确定要做 App 风格助手时再上

---

## 13. 参考资料

以下是本实现文档参考的官方资料：

- [Gemini API Text generation](https://ai.google.dev/gemini-api/docs/text-generation)
- [Gemini API Models](https://ai.google.dev/gemini-api/docs/models)
- [Gemini API Context caching](https://ai.google.dev/gemini-api/docs/caching/)
- [Gemini API Function calling](https://ai.google.dev/gemini-api/docs/function-calling)
- [Gemini Live API overview](https://ai.google.dev/gemini-api/docs/live-api)

---

## 14. 给 OpenSynapse 的最终建议

如果目标是“先让它像 Gemini 一样好聊”，不要先追求全功能。  
对当前项目，最值得立刻做的不是继续堆模型，也不是继续加更长的 prompt，而是：

- **把聊天链路变轻**
- **把响应方式变流式**
- **把知识检索变成按需能力**
- **把历史管理做成摘要 + 最近消息**

这样做出来的体验，才会真正向 Gemini 网页端 / App 靠拢。
