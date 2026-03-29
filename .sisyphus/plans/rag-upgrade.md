# RAG 系统升级：客户端硬编码检索 → 服务端智能工具调用

## TL;DR

将 RAG 从客户端 O(n) 遍历迁移到服务端工具调用架构：
- **Phase 1**：服务端正则化 RAG（服务端混合搜索，保留系统提示词注入）
- **Phase 2**：启用工具调用（AI 自主决定何时检索）
- **Phase 3**：引用与反馈

---

## 1. Architecture Overview

### 1.1 What Changes

| Component | Current | Target |
|-----------|---------|--------|
| RAG 触发 | 客户端 `shouldUseRAG()` 硬编码 | AI 模型通过 tool calling 决策 |
| 检索引擎 | 客户端 `cosineSimilarity()` O(n) | 服务端 Chroma 向量搜索 |
| 系统提示词 | 客户端拼接 context | 服务端动态注入 |
| Embedding | 客户端生成 → PostgreSQL | 服务端生成 → Chroma + PostgreSQL |
| 流式处理 | 纯文本 SSE | tool_call / tool_response / text 三轨 SSE |

### 1.2 What Stays

- **PostgreSQL**: 主数据存储（notes, users, sessions）
- **Chroma**: 向量存储（per-user collection: `notes_${userId}`）
- **better-auth**: 认证与 userId 隔离
- **多提供商路由**: Gemini / OpenAI / MiniMax / 智谱 / Moonshot
- **前端组件**: ChatView, Personas 系统不变

### 1.3 Data Flow (New Architecture)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND (ChatView)                            │
│                                                                              │
│  messages + persona + (allNotes for fallback)                              │
│         │                                                                   │
│         ▼                                                                   │
│  chatWithAIStream(messages, persona, userId)                                │
│         │                                                                   │
│         │  // Phase 1: 传递 userId，不传 allNotes                           │
│         │  // Phase 2: 传递 tools 参数                                       │
│         ▼                                                                   │
│  /api/ai/generateContentStream                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           SERVER (api/ai.ts)                                │
│                                                                              │
│  requireAuth → userId                                                        │
│         │                                                                    │
│         ▼                                                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    RAG Middleware Layer                               │   │
│  │                                                                       │   │
│  │  Phase 1: (no tool calling)                                          │   │
│  │    hybridSearch(queryEmbedding, userId) → contextText                │   │
│  │    systemPrompt = merge(personaSystemPrompt, contextText)            │   │
│  │                                                                       │   │
│  │  Phase 2: (tool calling enabled)                                     │   │
│  │    if (hasTools) → agenticLoop(params, userId) → unified SSE stream   │   │
│  │    else → Phase 1 path                                               │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│         │                                                                    │
│         ▼                                                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    Provider Gateway                                  │   │
│  │                                                                       │   │
│  │  Gemini native: { tools: [{functionDeclarations}] }                   │   │
│  │  OpenAI compat: { tools: [{type:"function", function:{}}] }          │   │
│  │  Anthropic compat: { tools: [{name, description, input_schema}] }     │   │
│  │                                                                       │   │
│  │  Code Assist: { request: { tools, toolConfig } }                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│         │                                                                    │
│         ▼                                                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    SSE Stream Output                                  │   │
│  │                                                                       │   │
│  │  Phase 1:  data: {"text": "..."} / {"thought": "..."}                 │   │
│  │  Phase 2:  data: {"text": "..."} / {"thought": "..."}                │   │
│  │            data: {"tool_call": {"name":"search_notes", "args":{...}}} │   │
│  │            (server executes tool, feeds result back, continues)      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           VECTOR LAYER                                      │
│                                                                              │
│  ┌──────────────────┐       ┌──────────────────┐                           │
│  │      Chroma       │       │   PostgreSQL     │                           │
│  │                  │       │                  │                           │
│  │  Collection:     │       │  notes.embedding │                           │
│  │  notes_${userId}  │◄──────│  (real[])        │                           │
│  │                  │ sync  │                  │                           │
│  │  search()        │       │  ILIKE search    │                           │
│  │  addNote()       │       │  (fallback)      │                           │
│  └──────────────────┘       └──────────────────┘                           │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Files to Create

### 2.1 New Files

| File | Purpose | Phase |
|------|---------|-------|
| `src/api/rag.ts` | RAG 检索服务：混合搜索、语义重排序、上下文构建 | 1 |
| `src/services/agenticLoop.ts` | 工具调用循环：执行 tool_call → 返回 tool_response → 继续生成 | 2 |
| `src/lib/toolDefinitions.ts` | 多提供商工具定义：统一的 search_notes 工具适配不同协议 | 2 |
| `src/api/notes-vector.ts` | 笔记向量同步 API：创建/更新/删除笔记时同步 Chroma | 1 |
| `src/services/embeddingService.ts` | 服务端 embedding 生成（当前仅在客户端） | 1 |
| `src/types/rag.ts` | RAG 相关类型：SearchResult, RAGContext, ToolDefinition | 1 |

### 2.2 Existing Files to Modify

| File | Changes | Phase |
|------|---------|-------|
| `src/api/ai.ts` | 添加 `/generateContentStream` 支持 tools 参数；实现 RAG middleware；处理 tool_call 循环 | 1-2 |
| `src/services/gemini.ts` | 重构 `chatWithAIStream()`：传递 userId + tools，不做客户端 RAG | 1-2 |
| `src/vector/chroma.ts` | 添加 `healthCheck()` 方法；添加 `searchWithFilter()` 支持元数据过滤 | 1 |
| `src/components/ChatView.tsx` | 传递 userId 给 `chatWithAIStream`；接收 tool_call 显示（如需要） | 1 |
| `src/App.tsx` | `handleSaveNote()` 同时同步到 Chroma | 1 |
| `src/lib/providerGateway.ts` | 添加 `tools` 参数转发；添加 Anthropic 兼容工具调用 | 2 |
| `src/lib/codeAssist.ts` | 确保 `tools` 参数透传到 Code Assist 请求体 | 2 |

---

## 3. Implementation Phases

### Phase 1: Server-Side Hybrid RAG（服务端混合搜索）

**Goal**: 移除客户端 O(n) 遍历，服务端实现混合搜索（向量 + 关键词），保留现有系统提示词注入模式。

#### Step 1.1: 服务端 Embedding 生成 (`src/services/embeddingService.ts`)

```typescript
import { embedContentWithApiKeyProvider } from '../lib/providerGateway.js';
import { generateContentWithCodeAssist } from '../lib/codeAssist.js';
import { parseModelSelection, getPreferredEmbeddingModel, getApiModelId } from '../lib/aiModels.js';

export type EmbedResult = {
  values: number[];
  degraded?: boolean;
  reason?: string;
};

/**
 * 服务端生成 embedding（复用现有 /api/ai/embedContent 逻辑）
 * 支持多 provider：Gemini SDK / Code Assist OAuth / OpenAI 兼容 / Anthropic 兼容
 */
export async function generateEmbeddingServer(
  contents: string[],
  modelId?: string,
  credentials?: { apiKey?: string; baseUrl?: string }
): Promise<EmbedResult> {
  // ... 实现见 phase 1.1 详细设计
}
```

**Priority**: HIGH — 所有后续步骤依赖 embedding 服务

#### Step 1.2: Chroma 健康检查与增强 (`src/vector/chroma.ts`)

```typescript
// 新增方法
export const vectorStore = {
  // ... 现有方法 ...

  /** 健康检查 */
  async healthCheck(): Promise<{ healthy: boolean; error?: string }> {
    try {
      await client.listCollections();
      return { healthy: true };
    } catch (error) {
      return { healthy: false, error: String(error) };
    }
  },

  /** 带元数据过滤的语义搜索 */
  async searchWithFilter(
    userId: string,
    queryEmbedding: number[],
    filter: Record<string, any>,
    nResults: number = 5
  ) {
    const collection = await this.getCollection(userId);
    return collection.query({
      queryEmbeddings: [queryEmbedding],
      nResults,
      where: filter,
    });
  },

  /** 批量索引（用于初始化或重新同步） */
  async batchUpsert(
    userId: string,
    items: Array<{
      id: string;
      content: string;
      embedding: number[];
      metadata?: Record<string, any>;
    }>
  ) {
    if (items.length === 0) return;
    const collection = await this.getCollection(userId);
    await collection.upsert({
      ids: items.map(i => i.id),
      embeddings: items.map(i => i.embedding),
      metadatas: items.map(i => i.metadata || {}),
      documents: items.map(i => i.content),
    });
  },
};
```

**Priority**: HIGH

#### Step 1.3: RAG 检索服务 (`src/api/rag.ts`)

```typescript
import { vectorStore } from '../vector/chroma.js';
import { noteRepo } from '../repositories/note.repo.js';
import { generateEmbeddingServer } from '../services/embeddingService.js';

export type SearchResult = {
  noteId: string;
  title: string;
  content: string;
  summary: string;
  tags: string[];
  score: number;        // 语义相似度
  keywordScore: number; // 关键词匹配分
  combinedScore: number;// 加权总分
  source: 'chroma' | 'postgresql';
};

export type RAGConfig = {
  semanticWeight: number;  // 默认 0.7
  keywordWeight: number;   // 默认 0.3
  minScore: number;        // 默认 0.3
  maxResults: number;      // 默认 5
};

/**
 * 混合搜索：向量检索 + 关键词检索 + 加权融合
 */
export async function hybridSearch(
  userId: string,
  query: string,
  config: RAGConfig = { semanticWeight: 0.7, keywordWeight: 0.3, minScore: 0.3, maxResults: 5 }
): Promise<SearchResult[]> {
  const { semanticWeight, keywordWeight, minScore, maxResults } = config;

  // 1. 语义搜索（Chroma）
  let semanticResults: SearchResult[] = [];
  const chromaHealth = await vectorStore.healthCheck();
  
  if (chromaHealth.healthy) {
    try {
      const queryEmbedding = await generateEmbeddingServer([query]);
      if (!queryEmbedding.degraded && queryEmbedding.values.length > 0) {
        const chromaResults = await vectorStore.search(userId, queryEmbedding.values, maxResults);
        
        semanticResults = (chromaResults.ids[0] || []).map((id, i) => ({
          noteId: id,
          title: chromaResults.metadatas[0]?.[i]?.title || '',
          content: chromaResults.documents[0]?.[i] || '',
          summary: chromaResults.metadatas[0]?.[i]?.summary || '',
          tags: chromaResults.metadatas[0]?.[i]?.tags || [],
          score: chromaResults.distances?.[0]?.[i] !== undefined 
            ? 1 - (chromaResults.distances[0][i] as number) // 距离转相似度
            : 0,
          keywordScore: 0,
          combinedScore: 0,
          source: 'chroma' as const,
        }));
      }
    } catch (error) {
      console.warn('[RAG] Chroma search failed, falling back to PostgreSQL:', error);
    }
  }

  // 2. 关键词搜索（PostgreSQL ILIKE fallback）
  let keywordResults: SearchResult[] = [];
  try {
    const dbNotes = await noteRepo.search(userId, query);
    keywordResults = dbNotes.map(note => ({
      noteId: note.id,
      title: note.title,
      content: note.content,
      summary: note.summary || '',
      tags: note.tags || [],
      score: 0,
      keywordScore: calculateKeywordScore(query, note),
      combinedScore: 0,
      source: 'postgresql' as const,
    }));
  } catch (error) {
    console.warn('[RAG] PostgreSQL search failed:', error);
  }

  // 3. 融合排序（RRF 或加权）
  const fusedResults = fuseResults(semanticResults, keywordResults, semanticWeight, keywordWeight);
  
  // 4. 过滤与返回
  return fusedResults
    .filter(r => r.combinedScore >= minScore)
    .slice(0, maxResults);
}

/**
 * RRF (Reciprocal Rank Fusion) 融合
 */
function fuseResults(
  semantic: SearchResult[],
  keyword: SearchResult[],
  sWeight: number,
  kWeight: number
): SearchResult[] {
  const scoreMap = new Map<string, SearchResult>();
  
  // 语义结果
  semantic.forEach((r, i) => {
    const score = (1 / (i + 1)) * sWeight;
    scoreMap.set(r.noteId, { ...r, combinedScore: score });
  });
  
  // 关键词结果
  keyword.forEach((r, i) => {
    const score = (1 / (i + 1)) * kWeight;
    const existing = scoreMap.get(r.noteId);
    if (existing) {
      existing.combinedScore += score;
      // 合并元数据（如果有）
      existing.keywordScore = r.keywordScore;
    } else {
      scoreMap.set(r.noteId, { ...r, combinedScore: score });
    }
  });
  
  return Array.from(scoreMap.values())
    .sort((a, b) => b.combinedScore - a.combinedScore);
}

function calculateKeywordScore(query: string, note: { title: string; content: string; summary: string }): number {
  const queryLower = query.toLowerCase();
  const text = `${note.title} ${note.summary} ${note.content}`.toLowerCase();
  
  const queryTerms = queryLower.split(/\s+/);
  let matchCount = 0;
  for (const term of queryTerms) {
    if (text.includes(term)) matchCount++;
  }
  
  return matchCount / queryTerms.length;
}
```

**Priority**: HIGH

#### Step 1.4: RAG 上下文构建 (`src/api/rag.ts`)

```typescript
/**
 * 构建 RAG 上下文文本，注入到系统提示词
 */
export function buildRAGContext(results: SearchResult[]): string {
  if (results.length === 0) return '';
  
  return `
# Relevant Knowledge
${results.map((r, i) => `
## [${i + 1}] ${r.title} (relevance: ${(r.combinedScore * 100).toFixed(0)}%)
${r.summary || r.content.slice(0, 500)}
${r.tags.length > 0 ? `Tags: ${r.tags.join(', ')}` : ''}
`).join('\n---\n')}
`.trim();
}

/**
 * 生成引用标记（用于 Phase 3）
 */
export function buildCitations(results: SearchResult[]): string {
  if (results.length === 0) return '';
  
  return results.map((r, i) => `[${i + 1}] ${r.title}`).join(' | ');
}
```

#### Step 1.5: 修改 `/api/ai/generateContentStream` 支持 RAG (`src/api/ai.ts`)

```typescript
// 在 generateContentStream 路由中

router.post('/generateContentStream', requireAuth(async (req, res, userId) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  try {
    const { 
      model, 
      contents, 
      config,
      // Phase 1 新增参数
      enableRAG = true,        // 默认启用 RAG
      ragConfig,               // 可选的 RAG 配置
      // Phase 2 新增参数  
      enableToolCalling = false, // 默认关闭工具调用
    } = req.body;

    let systemInstruction = config?.systemInstruction || '';
    
    // Phase 1: RAG 上下文注入
    if (enableRAG && !enableToolCalling) {
      const lastUserMessage = extractLastUserMessage(contents);
      if (lastUserMessage && shouldRetrieveRAG(lastUserMessage)) {
        const { hybridSearch } = await import('./rag.js');
        const results = await hybridSearch(userId, lastUserMessage, ragConfig);
        if (results.length > 0) {
          const { buildRAGContext } = await import('./rag.js');
          const ragContext = buildRAGContext(results);
          systemInstruction = mergeSystemInstruction(systemInstruction, ragContext);
        }
      }
    }

    // 构建最终请求参数（注入 RAG 后的 systemInstruction）
    const finalParams = {
      model,
      contents,
      config: {
        ...config,
        systemInstruction,
      },
    };

    // 然后继续现有的多提供商路由逻辑...
    // （调用 Code Assist 或 API Key Provider 的流式接口）

  } catch (error: any) {
    // ...
  }
}));
```

#### Step 1.6: 前端重构 (`src/services/gemini.ts`)

**移除客户端 RAG 逻辑，改为传递参数给服务端：**

```typescript
// 修改 chatWithAIStream 签名
export async function* chatWithAIStream(
  messages: ChatMessage[],
  persona?: Persona,
  userId?: string,         // 新增：服务端需要 userId
  options?: {
    enableRAG?: boolean;
    ragConfig?: RAGConfig;
  }
): AsyncGenerator<StreamChunk> {
  const modelId = getPreferredTextModel();
  
  // 不再调用 shouldUseRAG / findRelevantNotes
  // 这些逻辑移到服务端

  const recentMessages = messages.slice(-12);
  const contents = buildContentParts(recentMessages);
  
  const activePersona = persona || PRESET_PERSONAS.find(p => p.id === DEFAULT_PERSONA_ID)!;
  const systemInstruction = getSystemInstructionLight(activePersona); // 轻量提示词

  // Phase 1: 传递 userId 和 RAG 配置给服务端
  const stream = ai.models.generateContentStream({
    model: modelId,
    contents,
    config: {
      systemInstruction,
      thinkingConfig: { thinkingBudget: 8192 },
      abortSignal,
    },
    // Phase 1 新增
    enableRAG: true,
    userId,  // 服务端需要 userId 访问 Chroma
  });
  
  // ...
}
```

**同时删除：**
- `shouldUseRAG()` — 移到服务端
- `findRelevantNotes()` — 移到服务端 `rag.ts`
- `cosineSimilarity()` — 移到服务端
- `generateEmbedding()` — 移到服务端 `embeddingService.ts`

**保留（其他功能依赖）：**
- `semanticSearch()` — 但降级为服务端调用
- `findSemanticLinks()` — 依赖 embedding，仍需改造

#### Step 1.7: 笔记同步 Chroma (`src/App.tsx`)

```typescript
// handleSaveNote() 同步到 Chroma

async function handleSaveNote(note: Note, userId: string) {
  // 1. 保存到 PostgreSQL（现有逻辑）
  const savedNote = await notesApi.create({ ...note, userId });
  
  // 2. 同步到 Chroma
  if (savedNote.embedding && Array.isArray(savedNote.embedding)) {
    try {
      const { vectorStore } = await import('./vector/chroma.js');
      await vectorStore.addNote(userId, savedNote.id, 
        `${savedNote.title}\n\n${savedNote.summary}\n\n${savedNote.content}`,
        savedNote.embedding,
        {
          title: savedNote.title,
          summary: savedNote.summary,
          tags: savedNote.tags,
        }
      );
    } catch (error) {
      console.warn('[App] Failed to sync note to Chroma:', error);
      // 不阻塞主流程，Chroma 降级不影响功能
    }
  }
  
  return savedNote;
}
```

**同样处理 `handleUpdateNote()` 和 `handleDeleteNote()`**

#### Phase 1 验证清单

- [ ] 服务端 `generateEmbeddingServer()` 生成正确 embedding
- [ ] Chroma 健康检查在 Chroma 不可用时返回 `{ healthy: false }`
- [ ] 混合搜索在 Chroma 可用时使用向量检索
- [ ] 混合搜索在 Chroma 不可用时降级到 PostgreSQL ILIKE
- [ ] RAG 上下文正确注入到 systemInstruction
- [ ] 前端 `chatWithAIStream` 不再加载所有笔记到内存
- [ ] 新笔记创建时同步到 Chroma
- [ ] 笔记更新/删除时同步 Chroma
- [ ] SSE 流式输出正常工作

---

### Phase 2: Tool Calling（工具调用）

**Goal**: AI 模型通过 function calling 主动决定何时检索知识。

#### Step 2.1: 工具定义（多提供商适配）(`src/lib/toolDefinitions.ts`)

```typescript
/**
 * 统一的工具定义
 */
export const TOOL_DEFINITIONS = {
  search_notes: {
    name: 'search_notes',
    description: 'Search the user\'s knowledge base for relevant notes. Use this when the user asks about concepts, techniques, or topics that might be covered in their notes. Returns the most relevant notes with relevance scores.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query - describe what concept or topic to search for in the user\'s notes.',
        },
        max_results: {
          type: 'integer',
          description: 'Maximum number of notes to return (default: 3, max: 10)',
          default: 3,
        },
      },
      required: ['query'],
    },
  },
};

/**
 * Gemini native format (functionDeclarations)
 */
export function toGeminiTools() {
  return [{
    functionDeclarations: [TOOL_DEFINITIONS.search_notes],
  }];
}

/**
 * OpenAI compatible format (tools array)
 */
export function toOpenAITools() {
  return [{
    type: 'function',
    function: {
      name: TOOL_DEFINITIONS.search_notes.name,
      description: TOOL_DEFINITIONS.search_notes.description,
      parameters: TOOL_DEFINITIONS.search_notes.parameters,
    },
  }];
}

/**
 * Anthropic compatible format (tools array)
 */
export function toAnthropicTools() {
  return [{
    name: TOOL_DEFINITIONS.search_notes.name,
    description: TOOL_DEFINITIONS.search_notes.description,
    input_schema: TOOL_DEFINITIONS.search_notes.parameters,
  }];
}
```

#### Step 2.2: 工具执行服务 (`src/services/toolExecutor.ts`)

```typescript
import { hybridSearch, buildRAGContext, type RAGConfig } from '../api/rag.js';

export type ToolResult = {
  success: boolean;
  result?: string;
  error?: string;
};

export async function executeTool(
  toolName: string,
  args: Record<string, any>,
  userId: string
): Promise<ToolResult> {
  switch (toolName) {
    case 'search_notes':
      return executeSearchNotes(args, userId);
    default:
      return { success: false, error: `Unknown tool: ${toolName}` };
  }
}

async function executeSearchNotes(
  args: { query: string; max_results?: number },
  userId: string
): Promise<ToolResult> {
  try {
    const config: RAGConfig = {
      semanticWeight: 0.7,
      keywordWeight: 0.3,
      minScore: 0.25,  // 工具调用时稍微降低阈值
      maxResults: args.max_results || 3,
    };
    
    const results = await hybridSearch(userId, args.query, config);
    
    if (results.length === 0) {
      return { success: true, result: 'No relevant notes found for the query.' };
    }
    
    // 返回格式化为模型可理解的文本
    const context = buildRAGContext(results);
    return { success: true, result: context };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}
```

#### Step 2.3: Agentic Loop（代理循环）(`src/services/agenticLoop.ts`)

```typescript
import { executeTool } from './toolExecutor.js';
import { toGeminiTools, toOpenAITools, toAnthropicTools } from '../lib/toolDefinitions.js';
import { parseModelSelection, type AIProviderId } from '../lib/aiModels.js';

export type ToolCall = {
  name: string;
  args: Record<string, any>;
};

export type AgenticConfig = {
  maxIterations: number;  // 默认 3，防止无限循环
  userId: string;
};

type StreamChunk = { text?: string; thought?: string; tool_call?: ToolCall };

/**
 * 通用代理循环：处理多提供商的 tool_call
 * 
 * 返回 AsyncGenerator，逐步 yield：
 * - text / thought chunks（正常输出）
 * - tool_call chunks（需要外部执行时暂停）
 * 
 * 注意：实际执行在调用侧，此处仅解析和格式化工具响应
 */
export async function* agenticStream(
  params: {
    model: string;
    contents: any;
    config: any;
    provider: AIProviderId;
  },
  userId: string
): AsyncGenerator<StreamChunk> {
  const maxIterations = 3;
  let iteration = 0;
  
  while (iteration < maxIterations) {
    iteration++;
    
    // 调用模型（此处需要根据 provider 调用不同的流式接口）
    // ... (provider-specific streaming logic)
    
    // 解析响应
    for await (const chunk of stream) {
      if (chunk.tool_call) {
        // 遇到 tool_call，yield 并等待执行
        yield chunk;
        
        // 执行工具
        const toolResult = await executeTool(chunk.tool_call.name, chunk.tool_call.args, userId);
        
        // 将工具结果作为新消息注入
        // ... (不同 provider 的 tool_result 格式)
        
        // 继续循环
      } else {
        yield chunk;
      }
    }
    
    // 如果没有 tool_call，正常结束
    if (!hasToolCall) break;
  }
}
```

#### Step 2.4: 修改 SSE 流式处理 (`src/api/ai.ts`)

```typescript
// 在 generateContentStream 路由中

router.post('/generateContentStream', requireAuth(async (req, res, userId) => {
  // ...
  try {
    const {
      model,
      contents,
      config,
      enableRAG = true,
      ragConfig,
      enableToolCalling = false, // Phase 2
    } = req.body;

    // Phase 2: 工具调用模式
    if (enableToolCalling) {
      const parsed = parseModelSelection(model);
      const tools = getToolsForProvider(parsed.provider); // toGeminiTools() / toOpenAITools() / etc.
      
      const finalConfig = {
        ...config,
        tools,
      };

      // 使用 agenticLoop 处理
      const { agenticStream } = await import('../services/agenticLoop.js');
      
      for await (const chunk of agenticStream({ model, contents, config: finalConfig }, userId)) {
        if (chunk.tool_call) {
          // 工具调用 chunk
          res.write(`data: ${JSON.stringify({ tool_call: chunk.tool_call })}\n\n`);
        } else {
          // 正常文本/thought chunk
          res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        }
      }
      
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }

    // Phase 1: 非工具调用模式（降级路径）
    // ... 现有逻辑

  } catch (error: any) {
    // ...
  }
}));
```

#### Step 2.5: Provider Gateway 工具支持 (`src/lib/providerGateway.ts`)

```typescript
// 修改 buildChatCompletionsBody
function buildChatCompletionsBody(params: GatewayParams) {
  const body: Record<string, unknown> = {
    model: getApiModelId(params.model),
    messages: toOpenAICompatibleMessages(params),
  };

  // ... 现有字段 ...

  // Phase 2: 转发 tools
  if (Array.isArray(params.config?.tools) && params.config.tools.length > 0) {
    body.tools = params.config.tools;
  }

  // Phase 2: tool_choice
  if (params.config?.toolChoice) {
    body.tool_choice = params.config.toolChoice;
  }

  return body;
}

// 修改 streamChatCompletions 解析 tool_calls
async function* streamChatCompletions(...) {
  // ...
  for (const line of lines) {
    // ...
    try {
      const payload = JSON.parse(data);
      
      // Phase 2: 处理 tool_call
      const delta = payload?.choices?.[0]?.delta;
      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          yield {
            tool_call: {
              name: tc.function?.name,
              args: tc.function?.arguments 
                ? JSON.parse(tc.function.arguments) 
                : {},
            },
          };
        }
      }
      
      // 正常文本/thought
      // ...
    } catch {
      // ...
    }
  }
}
```

#### Step 2.6: Code Assist 工具支持 (`src/lib/codeAssist.ts`)

```typescript
// toGenerateContentRequest 已经支持 tools
// 只需确保透传正确

function toGenerateContentRequest(params: GenerateContentParams, projectId: string) {
  return {
    model: params.model,
    project: projectId,
    user_prompt_id: crypto.randomUUID(),
    request: {
      contents: toContents(params.contents),
      systemInstruction: maybeToContent(params.config?.systemInstruction),
      cachedContent: params.config?.cachedContent,
      // Phase 2: tools 和 toolConfig 已经存在
      tools: params.config?.tools,          // ← 确认透传
      toolConfig: params.config?.toolConfig,
      // ...
    },
  };
}

// parseSSEStream 需要处理 tool_call 格式
async function* parseSSEStream(response: Response): AsyncGenerator<StreamChunk> {
  // ...
  for (const line of lines) {
    // ...
    try {
      const payload = Array.isArray(json) ? json[0] : json;
      const candidates = payload?.response?.candidates;
      
      for (const candidate of candidates) {
        for (const part of candidate?.content?.parts ?? []) {
          // Phase 2: 处理 functionCall
          if ((part as any).functionCall) {
            const fc = (part as any).functionCall;
            yield {
              tool_call: {
                name: fc.name,
                args: typeof fc.args === 'string' ? JSON.parse(fc.args) : fc.args,
              },
            };
            continue;
          }
          
          // 正常文本/thought
          if (part.thought && part.text) {
            yield { thought: part.text };
          } else if (part.text) {
            yield { text: part.text };
          }
        }
      }
    } catch {
      // ...
    }
  }
}
```

#### Phase 2 验证清单

- [ ] 工具定义在所有 provider 格式下正确
- [ ] AI 模型能够发出 tool_call
- [ ] 服务端正确执行工具并返回结果
- [ ] 工具结果正确注入到后续请求
- [ ] 最大迭代次数防止无限循环
- [ ] 非工具调用场景（Phase 1）继续工作

---

### Phase 3: Citations & Feedback（引用与反馈）

**Goal**: 在响应中引用来源笔记，用户可反馈检索质量。

#### Step 3.1: 引用注入

```typescript
// 在 agenticLoop 或 rag.ts 中

export function buildCitationAnnotation(results: SearchResult[]): string {
  if (results.length === 0) return '';
  
  const citations = results.map((r, i) => `[${i + 1}] "${r.title}" (score: ${(r.combinedScore * 100).toFixed(0)}%)`).join(', ');
  return `\n\nSources: ${citations}`;
}
```

#### Step 3.2: 检索反馈 API

```typescript
// POST /api/rag/feedback
router.post('/rag/feedback', requireAuth(async (req, res, userId) => {
  const { searchId, query, results, helpful, noteIds } = req.body;
  
  // 存储反馈用于分析
  // ...
  
  res.json({ success: true });
}));
```

---

## 4. Key Function Signatures

### Phase 1

```typescript
// embeddingService.ts
export async function generateEmbeddingServer(
  contents: string[],
  modelId?: string,
  credentials?: { apiKey?: string; baseUrl?: string }
): Promise<{ values: number[]; degraded?: boolean; reason?: string }>

// rag.ts
export async function hybridSearch(
  userId: string,
  query: string,
  config?: Partial<RAGConfig>
): Promise<SearchResult[]>

export function buildRAGContext(results: SearchResult[]): string

// vector/chroma.ts
export async function healthCheck(): Promise<{ healthy: boolean; error?: string }>

export async function batchUpsert(
  userId: string,
  items: Array<{ id: string; content: string; embedding: number[]; metadata?: Record<string, any> }>
): Promise<void>

// services/gemini.ts (改动)
export async function* chatWithAIStream(
  messages: ChatMessage[],
  persona?: Persona,
  userId?: string,
  options?: { enableRAG?: boolean; ragConfig?: RAGConfig }
): AsyncGenerator<StreamChunk>
```

### Phase 2

```typescript
// toolDefinitions.ts
export const TOOL_DEFINITIONS: Record<string, ToolDefinition>
export function toGeminiTools(): any[]
export function toOpenAITools(): any[]
export function toAnthropicTools(): any[]

// toolExecutor.ts
export async function executeTool(
  toolName: string,
  args: Record<string, any>,
  userId: string
): Promise<{ success: boolean; result?: string; error?: string }>

// agenticLoop.ts
export async function* agenticStream(
  params: { model: string; contents: any; config: any; provider: AIProviderId },
  userId: string
): AsyncGenerator<StreamChunk>
```

### Phase 3

```typescript
// api/rag.ts
export function buildCitationAnnotation(results: SearchResult[]): string
```

---

## 5. Migration Path

### 兼容性策略

1. **渐进式迁移**：Phase 1 完全向后兼容
   - 前端传递 `enableRAG: true`（默认）
   - 服务端检测到则使用新的 RAG 路径
   - 检测不到则 fallback 到现有逻辑（客户端 RAG）

2. **功能开关**：
   ```typescript
   // 前端配置
   const RAG_OPTIONS = {
     enableRAG: true,           // Phase 1: 服务端 RAG
     enableToolCalling: false,   // Phase 2: 工具调用
     enableCitations: false,     // Phase 3: 引用
   };
   ```

### 部署步骤

1. **部署 Phase 1**（无功能变更，用户无感知）
   - 部署 `embeddingService.ts`, `rag.ts`, 修改后的 `ai.ts`
   - 验证 Chroma 健康检查和混合搜索
   - 验证 RAG 上下文注入

2. **切换前端**
   - 修改 `chatWithAIStream` 传递 `userId` 和 `enableRAG`
   - 移除客户端 RAG 代码
   - 验证流式输出正常

3. **部署 Phase 2**（工具调用）
   - 部署 `toolDefinitions.ts`, `toolExecutor.ts`, `agenticLoop.ts`
   - 验证工具调用循环

4. **Phase 3**（可选）
   - 引用注入和反馈 API

---

## 6. Edge Cases & Error Handling

| Scenario | Handling |
|----------|----------|
| Chroma 不可用 | 降级到 PostgreSQL ILIKE，继续 RAG |
| Embedding 服务不可用 | 返回空 context，AI 无知识增强但正常回答 |
| 工具调用超时 | 返回错误给模型，模型决定是否重试或跳过 |
| 工具调用无限循环 | agenticLoop 的 maxIterations=3 保护 |
| 用户无笔记 | 返回空 context，AI 正常回答 |
| 模型不支持工具调用 | 服务端检测并降级到 Phase 1 |
| 工具返回空结果 | 返回 "No relevant notes found"，模型正常回答 |

---

## 7. Effort Estimate

| Phase | Effort | Complexity | Notes |
|-------|--------|------------|-------|
| Phase 1 | **2-3 days** | Medium | 服务端 embedding + hybrid search + 前端重构 |
| Phase 2 | **3-4 days** | High | Agentic loop + 多 provider 工具适配 |
| Phase 3 | **1-2 days** | Low | 引用注入和反馈 API |

**Total: ~1 week for full implementation**

Priority: **Start with Phase 1** — provides immediate performance improvement (removes client-side O(n)) and is fully backward compatible.