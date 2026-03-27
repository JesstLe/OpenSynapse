# 实现计划：生产级 Gemini 对话体验改造

**目标**：让 OpenSynapse 的对话体验达到 Gemini 网页端/App 的流畅度——流式输出、可显示思考过程、无频繁报错或超时。一步到位，不做简易实现。

---

## 当前状态（已完成）

| 能力 | 状态 |
|------|------|
| SSE 流式管道 (`codeAssist → ai.ts → gemini.ts → ChatView`) | ✅ 基础管道已通 |
| 429 指数退避（非流式路径） | ✅ 已实现 |
| 官方 CLI 头部对齐 | ✅ 已实现 |
| `enabled_credit_types` | ❌ 传了错误的值 `'G1'`，已移除 |

---

## Workstream 1：修复 SSE 流式路径的可靠性

> [!CAUTION]
> 当前流式路径 ([generateContentStreamWithCodeAssist](file:///Users/lv/Workspace/OpenSynapse/src/lib/codeAssist.ts#273-360)) **没有模型 fallback**，且 SSE 解析可能遗漏思考块。这是最优先要修复的问题。

### 问题分析

1. 非流式路径 [generateContentWithCodeAssist](file:///Users/lv/Workspace/OpenSynapse/src/lib/codeAssist.ts#170-272) 有完整的模型 fallback 循环，但流式路径直接用 `params.model` 单一请求，429 后只重试同一模型，不会切换到 fallback。
2. SSE 响应的 `data:` 行可能是 `[{...}]` 数组格式（官方 CLI 使用 `readline` 逐行解析），当前解析逻辑可能遗漏带 `thought` 属性的 part。
3. 流式没有超时控制——如果连接挂起，前端会永远等待。

### 修改方案

#### [MODIFY] [codeAssist.ts](file:///Users/lv/Workspace/OpenSynapse/src/lib/codeAssist.ts)

**1a. 为流式路径增加模型 fallback 循环**

```typescript
export async function* generateContentStreamWithCodeAssist(
  params: GenerateContentParams,
  clientConfig: OAuthClientConfig
): AsyncGenerator<{ text?: string; thought?: string }> {
  const credentials = await getValidCredentials(clientConfig.clientId, clientConfig.clientSecret);
  if (!credentials.project_id) {
    throw new Error('当前凭证缺少 Code Assist project');
  }

  const candidateModels = [params.model, ...getFallbackModels(params.model)];

  for (let index = 0; index < candidateModels.length; index++) {
    const modelId = candidateModels[index];
    const maxRetries = 3;
    let attempt = 0;
    let succeeded = false;

    while (attempt <= maxRetries) {
      try {
        const requestBody = {
          ...toGenerateContentRequest(params, credentials.project_id),
          model: modelId,
          // 正确的 credit type 值（从官方 CLI billing.js 中确认）
          enabled_credit_types: ['GOOGLE_ONE_AI'],
        };

        const headers = buildHeaders(credentials.access_token, modelId);
        const response = await fetch(
          `${OAUTH_CONFIG.CODE_ASSIST_ENDPOINT}/v1internal:streamGenerateContent?alt=sse`,
          { method: 'POST', headers, body: JSON.stringify(requestBody) }
        );

        if (!response.ok) {
          const errorText = await response.text();
          const isCapacity = is429CapacityError(response.status, errorText);
          const isNotFound = is404NotFound(response.status, errorText);

          // 瞬态错误：重试当前模型
          if (isCapacity && attempt < maxRetries) {
            attempt++;
            await exponentialDelay(attempt);
            continue;
          }
          // 容量耗尽或 404：切换到下一个 fallback 模型
          if ((isCapacity || isNotFound) && index < candidateModels.length - 1) {
            console.warn(`[CodeAssist] ${modelId} 不可用，切换到 ${candidateModels[index + 1]}`);
            break;
          }
          throw new Error(`Stream failed: ${response.status} - ${errorText}`);
        }

        // 成功连接——解析 SSE
        yield* parseSSEStream(response);
        succeeded = true;
        break;
      } catch (err: any) {
        if (err.name === 'AbortError') throw err; // 用户主动取消
        if (attempt >= maxRetries) {
          if (index < candidateModels.length - 1) break; // 尝试下一个模型
          throw err;
        }
        attempt++;
        await exponentialDelay(attempt);
      }
    }
    if (succeeded) return;
  }
  throw new Error('所有候选模型均不可用');
}
```

**1b. 提取 SSE 解析为独立函数，支持 thinking chunks**

```typescript
// SSE chunk 的 yield 类型：区分正文和思考
type StreamChunk = { text?: string; thought?: string };

async function* parseSSEStream(response: Response): AsyncGenerator<StreamChunk> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Response body is not readable');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') continue;

      try {
        const json = JSON.parse(data);
        // 官方 SSE 可能是 [{...}] 数组格式
        const payload = Array.isArray(json) ? json[0] : json;
        const candidates = payload?.response?.candidates;
        if (!Array.isArray(candidates)) continue;

        for (const candidate of candidates) {
          for (const part of candidate?.content?.parts ?? []) {
            if (part.thought && part.text) {
              yield { thought: part.text }; // 思考内容
            } else if (part.text) {
              yield { text: part.text }; // 正常输出
            }
          }
        }
      } catch {
        // 跳过无法解析的行
      }
    }
  }
}
```

**1c. 提取公共工具函数**

```typescript
function buildHeaders(accessToken: string, modelId: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'User-Agent': `GeminiCLI/0.35.2/${modelId} (${process.platform}; ${process.arch}) google-api-nodejs-client/9.15.1`,
    'X-Goog-Api-Client': 'gl-node/24.12.0',
  };
}

function is429CapacityError(status: number, text: string): boolean {
  return status === 429 && (
    text.includes('MODEL_CAPACITY_EXHAUSTED') ||
    text.includes('No capacity available for model') ||
    text.includes('rateLimitExceeded') ||
    text.includes('RATE_LIMIT_EXCEEDED')
  );
}

function is404NotFound(status: number, text: string): boolean {
  return status === 404 || text.includes('"status": "NOT_FOUND"');
}

async function exponentialDelay(attempt: number): Promise<void> {
  const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
  console.warn(`[CodeAssist] 第 ${attempt} 次重试，延迟 ${Math.round(delay)}ms...`);
  await new Promise(r => setTimeout(r, delay));
}
```

**1d. 修复 `enabled_credit_types` 的正确值**

从官方 CLI 源码 [billing.js](file:///Users/lv/.local/state/fnm_multishells/44770_1774623883957/lib/node_modules/@google/gemini-cli/node_modules/@google/gemini-cli-core/dist/src/billing/billing.js) 中确认：`G1_CREDIT_TYPE = 'GOOGLE_ONE_AI'`。之前我们传的 `'G1'` 导致 `INVALID_ARGUMENT`。现在传正确值，同时应用到非流式路径。

---

## Workstream 2：服务端流式路径升级

#### [MODIFY] [ai.ts](file:///Users/lv/Workspace/OpenSynapse/src/api/ai.ts)

SSE chunk 类型变更为 `{ text?, thought?, error?, fallbackModel? }`，让前端能区分正文、思考、错误和模型切换事件。

```typescript
router.post('/generateContentStream', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // 防止 nginx 缓冲

  try {
    if (apiKeyClient) {
      const result = await apiKeyClient.models.generateContentStream(req.body);
      for await (const chunk of result) {
        // @google/genai SDK 的 chunk 结构
        const parts = chunk.candidates?.[0]?.content?.parts ?? [];
        for (const part of parts) {
          if (part.thought && part.text) {
            res.write(`data: ${JSON.stringify({ thought: part.text })}\n\n`);
          } else if (part.text) {
            res.write(`data: ${JSON.stringify({ text: part.text })}\n\n`);
          }
        }
      }
    } else {
      const credentials = await loadCredentials();
      const clientConfig = resolveOAuthClientConfig();
      if (!credentials || !isCredentialsCompatible(credentials, clientConfig.clientId)) {
        throw new Error('凭证无效');
      }
      const stream = generateContentStreamWithCodeAssist(req.body, clientConfig);
      for await (const chunk of stream) {
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }
    }
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error: any) {
    console.error('[AI] Stream Error:', error);
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    res.end();
  }
});
```

---

## Workstream 3：前端流式消费 + 思考过程展示

#### [MODIFY] [types.ts](file:///Users/lv/Workspace/OpenSynapse/src/types.ts)

扩展 [ChatMessage](file:///Users/lv/Workspace/OpenSynapse/src/types.ts#28-33) 以支持思考内容：

```typescript
export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  thought?: string; // 模型思考过程（可折叠显示）
  image?: string;
}
```

#### [MODIFY] [gemini.ts](file:///Users/lv/Workspace/OpenSynapse/src/services/gemini.ts)

SSE 消费升级——yield 结构化 chunk 而非纯文本：

```typescript
type StreamChunk = { text?: string; thought?: string; error?: string };

generateContentStream: async function* (params: any): AsyncGenerator<StreamChunk> {
  const response = await fetch('/api/ai/generateContentStream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
    signal: params.config?.abortSignal, // 支持前端取消
  });

  if (!response.ok) {
    throw new Error(`Failed to start stream: ${await response.text()}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No readable stream');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') return;
      try {
        const json: StreamChunk = JSON.parse(data);
        if (json.error) throw new Error(json.error);
        yield json;
      } catch (e) {
        if (e instanceof Error && e.message !== data) throw e;
      }
    }
  }
}
```

[chatWithAIStream](file:///Users/lv/Workspace/OpenSynapse/src/services/gemini.ts#113-153) 返回类型变更：

```typescript
export async function* chatWithAIStream(
  messages: ChatMessage[],
  allNotes: Note[],
  abortSignal?: AbortSignal
): AsyncGenerator<StreamChunk> {
  // ... 省略 RAG 逻辑（见 Workstream 4）
  const stream = ai.models.generateContentStream({
    model: modelId,
    contents,
    config: {
      systemInstruction: getSystemInstruction(contextText),
      thinkingConfig: { thinkingBudget: 8192 }, // 启用思考模式
      abortSignal,
    },
  });

  for await (const chunk of stream) {
    yield chunk;
  }
}
```

#### [MODIFY] [ChatView.tsx](file:///Users/lv/Workspace/OpenSynapse/src/components/ChatView.tsx)

**3a. [handleSend](file:///Users/lv/Workspace/OpenSynapse/src/components/ChatView.tsx#291-354) 支持 AbortController + 思考累积**

```tsx
const [abortController, setAbortController] = useState<AbortController | null>(null);
const [showThinking, setShowThinking] = useState(true); // 用户可切换

const handleSend = async () => {
  if ((!input.trim() && !selectedImage) || isLoading) return;

  const userMsg: ChatMessage = selectedImage
    ? { role: 'user', text: input, image: selectedImage }
    : { role: 'user', text: input };

  const newMessages = [...messages, userMsg];
  setMessages(newMessages);
  setInput('');
  setSelectedImage(null);
  setIsLoading(true);

  const controller = new AbortController();
  setAbortController(controller);

  try {
    setMessages(prev => [...prev, { role: 'model', text: '', thought: '' }]);

    let fullText = '';
    let fullThought = '';
    const stream = chatWithAIStream(newMessages, notes, controller.signal);

    for await (const chunk of stream) {
      if (chunk.thought) {
        fullThought += chunk.thought;
        setMessages(prev => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last.role === 'model') {
            updated[updated.length - 1] = { ...last, thought: fullThought };
          }
          return updated;
        });
      }
      if (chunk.text) {
        fullText += chunk.text;
        setMessages(prev => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last.role === 'model') {
            updated[updated.length - 1] = { ...last, text: fullText };
          }
          return updated;
        });
      }
    }

    // 保存会话（思考内容不持久化到 Firestore，节省空间）
    const finalMessages: ChatMessage[] = [
      ...newMessages,
      { role: 'model', text: fullText }
    ];
    // ... 保存逻辑不变
  } catch (error) {
    if (controller.signal.aborted) return; // 用户主动停止，不显示错误
    // ... 错误处理
  } finally {
    setIsLoading(false);
    setAbortController(null);
  }
};
```

**3b. 停止生成按钮**

```tsx
const handleStop = () => {
  abortController?.abort();
  setAbortController(null);
  setIsLoading(false);
};
```

在 loading 状态下替换发送按钮为停止按钮：

```tsx
{isLoading ? (
  <button onClick={handleStop} className="p-3 bg-red-500/20 text-red-400 rounded-full">
    <Square size={20} />
  </button>
) : (
  <button onClick={handleSend} className="p-3 bg-orange-500 text-white rounded-full">
    <Send size={20} />
  </button>
)}
```

**3c. 思考过程折叠展示**

```tsx
{msg.thought && showThinking && (
  <details className="mb-2 text-xs text-white/30 bg-white/5 rounded-lg p-2">
    <summary className="cursor-pointer font-bold">💭 思考过程</summary>
    <div className="mt-2 whitespace-pre-wrap font-mono">{msg.thought}</div>
  </details>
)}
```

**3d. 重新生成 / 编辑重发**

```tsx
// 重新生成最后一条 AI 回复
const handleRegenerate = () => {
  const lastUserIdx = messages.findLastIndex(m => m.role === 'user');
  if (lastUserIdx === -1) return;
  const truncated = messages.slice(0, lastUserIdx + 1);
  setMessages(truncated);
  // 用截断后的消息重新触发流式请求
  handleSendWithMessages(truncated);
};

// 编辑最后一条用户消息后重发
const handleEditResend = (editedText: string) => {
  const lastUserIdx = messages.findLastIndex(m => m.role === 'user');
  if (lastUserIdx === -1) return;
  const truncated = messages.slice(0, lastUserIdx);
  const editedMsg: ChatMessage = { role: 'user', text: editedText };
  const newMessages = [...truncated, editedMsg];
  setMessages(newMessages);
  handleSendWithMessages(newMessages);
};
```

---

## Workstream 4：智能 RAG 档位（避免每轮都重）

#### [MODIFY] [gemini.ts](file:///Users/lv/Workspace/OpenSynapse/src/services/gemini.ts)

```typescript
function shouldUseRAG(messages: ChatMessage[], allNotes: Note[]): boolean {
  if (allNotes.length === 0) return false;
  const lastMsg = messages.filter(m => m.role === 'user').pop()?.text || '';
  // 短消息（<20字）且无明确知识查询关键词 → 不做 RAG
  if (lastMsg.length < 20 && !lastMsg.includes('笔记') && !lastMsg.includes('之前')) return false;
  return true;
}

function getSystemInstructionLight(): string {
  return `你是一位计算机科学导师。用中文回答，风格通俗、逻辑严密。`;
}

export async function* chatWithAIStream(
  messages: ChatMessage[], allNotes: Note[], abortSignal?: AbortSignal
): AsyncGenerator<StreamChunk> {
  const modelId = getPreferredTextModel();
  const useRAG = shouldUseRAG(messages, allNotes);

  let contextText = '';
  if (useRAG) {
    const lastUserMessage = messages.filter(m => m.role === 'user').pop()?.text || '';
    const relevantNotes = await findRelevantNotes(lastUserMessage, allNotes);
    if (relevantNotes.length > 0) {
      contextText = `\n# 相关笔记\n${relevantNotes.map(n => `## ${n.title}\n${n.summary}`).join('\n---\n')}`;
    }
  }

  // 历史裁剪：最多保留最近 12 条消息
  const recentMessages = messages.slice(-12);
  const contents = recentMessages.map(buildContentPart);

  const systemInstruction = useRAG
    ? getSystemInstruction(contextText)
    : getSystemInstructionLight();

  const stream = ai.models.generateContentStream({
    model: modelId,
    contents,
    config: {
      systemInstruction,
      thinkingConfig: { thinkingBudget: 8192 },
      abortSignal,
    },
  });

  for await (const chunk of stream) {
    yield chunk;
  }
}
```

---

## Workstream 5：`enabled_credit_types` 修复

#### [MODIFY] [codeAssist.ts](file:///Users/lv/Workspace/OpenSynapse/src/lib/codeAssist.ts)

从官方 CLI [billing.js](file:///Users/lv/.local/state/fnm_multishells/44770_1774623883957/lib/node_modules/@google/gemini-cli/node_modules/@google/gemini-cli-core/dist/src/billing/billing.js) 确认：`G1_CREDIT_TYPE = 'GOOGLE_ONE_AI'`。
在 [toGenerateContentRequest](file:///Users/lv/Workspace/OpenSynapse/src/lib/codeAssist.ts#20-41) 中添加：

```typescript
function toGenerateContentRequest(
  params: GenerateContentParams,
  projectId: string
): Record<string, unknown> {
  return {
    model: params.model,
    project: projectId,
    user_prompt_id: crypto.randomUUID(),
    request: { /* ... 不变 ... */ },
    enabled_credit_types: ['GOOGLE_ONE_AI'],
  };
}
```

---

## Workstream 6：动态 `User-Agent`

#### [MODIFY] [codeAssist.ts](file:///Users/lv/Workspace/OpenSynapse/src/lib/codeAssist.ts)

```typescript
import os from 'node:os';

function buildHeaders(accessToken: string, modelId: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'User-Agent': `GeminiCLI/0.35.2/${modelId} (${os.platform()}; ${os.arch()}) google-api-nodejs-client/9.15.1`,
    'X-Goog-Api-Client': 'gl-node/24.12.0',
  };
}
```

非流式路径 [generateContentWithCodeAssist](file:///Users/lv/Workspace/OpenSynapse/src/lib/codeAssist.ts#170-272) 也需要统一使用 `buildHeaders`。

---

## Workstream 7：模型配置优化

#### [MODIFY] [aiModels.ts](file:///Users/lv/Workspace/OpenSynapse/src/lib/aiModels.ts)

模型描述增加稳定性标签，fallback 覆盖流式路径：

```typescript
export const AI_MODEL_OPTIONS: AIModelOption[] = [
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', description: '推荐 · 稳定 · 适合通用对话', badge: '推荐' },
  { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash', description: '实验 · 更强多模态能力', badge: '预览' },
  { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro', description: '实验 · 最强推理', badge: '预览' },
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', description: '稳定 · 长文分析与深度推理' },
  { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite', description: '稳定 · 最低延迟' },
];

// 默认模型改为更稳定的选项
export const DEFAULT_TEXT_MODEL = 'gemini-2.5-flash';
```

---

## 文件修改汇总

| 文件 | 改动范围 |
|------|---------|
| [codeAssist.ts](file:///Users/lv/Workspace/OpenSynapse/src/lib/codeAssist.ts) | 重写流式路径（+fallback, +thinking, +AbortSignal, +动态UA, +credit_types） |
| [ai.ts](file:///Users/lv/Workspace/OpenSynapse/src/api/ai.ts) | 流式路由升级（传递 thought/text 结构化 chunk） |
| [gemini.ts](file:///Users/lv/Workspace/OpenSynapse/src/services/gemini.ts) | SSE 消费升级 + 智能 RAG 档位 + AbortSignal + thinkingConfig |
| [ChatView.tsx](file:///Users/lv/Workspace/OpenSynapse/src/components/ChatView.tsx) | 停止/重新生成/编辑重发 + 思考折叠 + AbortController |
| [types.ts](file:///Users/lv/Workspace/OpenSynapse/src/types.ts) | ChatMessage 增加 `thought` 字段 |
| [aiModels.ts](file:///Users/lv/Workspace/OpenSynapse/src/lib/aiModels.ts) | 默认模型改为 2.5-flash + badge 标签 |

## Verification Plan

### Automated
1. `npx tsx` 运行测试脚本，验证 [generateContentStreamWithCodeAssist](file:///Users/lv/Workspace/OpenSynapse/src/lib/codeAssist.ts#273-360) 的 SSE 解析和 fallback 逻辑
2. `npm run build` 确保无 TypeScript 编译错误

### Manual (Browser)
1. `npm run dev` 启动开发服务器
2. 选择 Gemini 3.1 Pro 发送消息 → 验证流式输出 + 思考内容折叠展示
3. 在流式输出过程中点击"停止" → 验证立即中断
4. 点击"重新生成" → 验证重新请求
5. 故意触发 429 → 验证自动回退到备用模型并提示用户
