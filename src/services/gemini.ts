import { Note, Flashcard, ChatMessage, Persona } from "../types";
import {
  getModelOption,
  getPreferredEmbeddingModel,
  getPreferredStructuredModel,
  getPreferredTextModel,
  parseModelSelection,
} from "../lib/aiModels";
import { PRESET_PERSONAS, DEFAULT_PERSONA_ID } from "../lib/personas";
import { getUserApiKeys } from "./userApiKeyService";

// ─── 流式 chunk 类型定义 ───

export type StreamChunk = {
  text?: string;
  thought?: string;
  error?: string;
};

function isEmbeddingUnsupportedError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('embedding 仅支持 API Key 路径');
}

// ─── AI 后端代理 ───

const ai = {
  models: {
    generateContent: async (params: any) => {
      const headers = await getAiRequestHeadersForModel(params?.model);
      const response = await fetch('/api/ai/generateContent', {
        method: 'POST',
        headers,
        body: JSON.stringify(params),
      });
      if (!response.ok) {
        throw new Error(`Failed to generate content: ${await response.text()}`);
      }
      return await response.json();
    },
    /** 流式生成——返回结构化 StreamChunk，支持 AbortSignal */
    generateContentStream: async function* (params: any): AsyncGenerator<StreamChunk> {
      const { abortSignal, ...configWithoutSignal } = params.config || {};
      const requestBody = { ...params, config: configWithoutSignal };
      const headers = await getAiRequestHeadersForModel(params?.model);

      const response = await fetch('/api/ai/generateContentStream', {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
        signal: abortSignal,
      });

      if (!response.ok) {
        throw new Error(`Failed to start stream: ${await response.text()}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No readable stream in response');

      const decoder = new TextDecoder();
      let buffer = '';

      try {
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
      } finally {
        reader.releaseLock();
      }
    },
    embedContent: async (params: any) => {
      const headers = await getAiRequestHeadersForModel(params?.model);
      const response = await fetch('/api/ai/embedContent', {
        method: 'POST',
        headers,
        body: JSON.stringify(params),
      });
      if (!response.ok) {
        throw new Error(`Failed to embed content: ${await response.text()}`);
      }
      return await response.json();
    }
  }
};

async function getAiRequestHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (typeof window !== 'undefined' && (window as any).__DEV_AUTH_BYPASS__) {
    headers['X-Dev-Bypass'] = '1';
  }
  return headers;
}

async function getAiRequestHeadersForModel(model?: string | null): Promise<Record<string, string>> {
  const headers = await getAiRequestHeaders();
  const parsed = parseModelSelection(model);
  if (parsed.provider === 'gemini') {
    return headers;
  }

  try {
    const userApiKeys = await getUserApiKeys();
    const providerConfig = userApiKeys?.[parsed.provider];
    if (!providerConfig?.apiKey) {
      return headers;
    }

    headers['X-OpenSynapse-Provider'] = parsed.provider;
    headers['X-OpenSynapse-Provider-Api-Key'] = providerConfig.apiKey;
    if (providerConfig.baseUrl?.trim()) {
      headers['X-OpenSynapse-Provider-Base-Url'] = providerConfig.baseUrl.trim();
    }
  } catch (error) {
    console.warn('[AI] Failed to attach user provider credentials:', error);
  }

  return headers;
}

// ─── 智能 RAG 档位判断 ───

/** 判断本轮是否需要 RAG 增强 */
function shouldUseRAG(messages: ChatMessage[], allNotes: Note[]): boolean {
  if (allNotes.length === 0) return false;
  const lastMsg = messages.filter(m => m.role === 'user').pop()?.text || '';
  // 短消息（<20字）且无明确知识查询关键词 → 跳过 RAG，加速首字渲染
  if (lastMsg.length < 20 &&
    !lastMsg.includes('笔记') &&
    !lastMsg.includes('之前') &&
    !lastMsg.includes('复习') &&
    !lastMsg.includes('总结') &&
    !lastMsg.includes('知识')) {
    return false;
  }
  return true;
}

/** 构建消息的 content parts */
function buildContentParts(messages: ChatMessage[]) {
  return messages.map(m => {
    const parts: any[] = [{ text: m.text }];
    if (m.image) {
      const [mimeTypePart, data] = m.image.split(';base64,');
      const mimeType = mimeTypePart.split(':')[1];
      parts.push({ inlineData: { mimeType, data } });
    }
    return { parts, role: m.role };
  });
}

/**
 * 调用智谱 OCR API 提取图片中的文字
 * @param imageBase64 - base64 编码的图片
 * @returns 提取的文字内容
 */
async function callZhipuOcr(imageBase64: string): Promise<string> {
  try {
    const response = await fetch('/api/ai/ocr/zhipu', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageBase64,
        tool_type: 'hand_write',
        language_type: 'CHN_ENG',
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'OCR 请求失败');
    }

    const result = await response.json();
    
    if (result.status === 'succeeded' && result.words_result) {
      return result.words_result.map((item: any) => item.words).join('\n');
    }
    
    return '';
  } catch (error) {
    console.error('[OCR] 提取失败:', error);
    return '';
  }
}

/**
 * 对于非 vision 模型，使用 OCR 提取图片内容并附加到消息中
 */
/**
 * 调用 MiniMax 图片理解 API
 * 使用 Token Plan 的 understand_image 工具
 */
async function callMiniMaxVision(imageBase64: string, prompt?: string): Promise<string> {
  try {
    const response = await fetch('/api/ai/vision/minimax', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageBase64,
        prompt: prompt || '请详细描述这张图片的内容',
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      // 如果需要 Token Plan 或失败，返回空字符串让上层处理
      if (error.fallback === 'ocr') {
        console.warn('[MiniMax Vision] Token Plan required, falling back to OCR if available');
      }
      throw new Error(error.message || error.error || 'Vision request failed');
    }

    const result = await response.json();
    return result.description || result.text || '';
  } catch (error) {
    console.error('[MiniMax Vision] 提取失败:', error);
    return '';
  }
}

async function extractImagesWithOcr(messages: ChatMessage[], modelId: string): Promise<ChatMessage[]> {
  const parsed = parseModelSelection(modelId);
  
  // 支持智谱 OCR 和 MiniMax 图片理解
  if (parsed.provider !== 'zhipu' && parsed.provider !== 'minimax') {
    return messages;
  }

  const processedMessages: ChatMessage[] = [];
  
  for (const message of messages) {
    if (message.role === 'user' && message.image) {
      let extractedContent = '';
      
      if (parsed.provider === 'minimax') {
        // 尝试 MiniMax 图片理解
        extractedContent = await callMiniMaxVision(message.image, message.text);
      }
      
      // MiniMax 失败或未提取到内容，尝试 OCR（智谱 OCR 对中文更好）
      if (!extractedContent) {
        extractedContent = await callZhipuOcr(message.image);
      }
      
      if (extractedContent) {
        processedMessages.push({
          ...message,
          text: `${message.text}\n\n[图片内容]\n${extractedContent}`,
          image: undefined,
        });
      } else {
        processedMessages.push(message);
      }
    } else {
      processedMessages.push(message);
    }
  }
  
  return processedMessages;
}

// ─── 非流式聊天（保留用于兼容和 JSON 输出场景） ───

export async function chatWithAI(messages: ChatMessage[], allNotes: Note[], persona?: Persona) {
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

  const recentMessages = messages.slice(-12);
  const contents = buildContentParts(recentMessages);
  
  // 使用选定的人格，默认为预设人格（数学导师）
  const activePersona = persona || PRESET_PERSONAS.find(p => p.id === DEFAULT_PERSONA_ID)!;
  const systemInstruction = useRAG 
    ? getSystemInstruction(contextText, activePersona) 
    : getSystemInstructionLight(activePersona);

  const response = await ai.models.generateContent({
    model: modelId,
    contents,
    config: { systemInstruction },
  });
  return response.text;
}

// ─── 流式聊天（前端主路径） ───

export async function* chatWithAIStream(
  messages: ChatMessage[],
  allNotes: Note[],
  persona?: Persona,
  abortSignal?: AbortSignal
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

  // 历史裁剪：只保留最近 12 条消息，避免上下文过长导致超时
  let recentMessages = messages.slice(-12);
  
  // 对于非 vision 模型，尝试使用 OCR 提取图片内容
  const modelOption = getModelOption(modelId);
  if (!modelOption?.supportsVision) {
    recentMessages = await extractImagesWithOcr(recentMessages, modelId);
  }
  
  const contents = buildContentParts(recentMessages);
  
  // 使用选定的人格，默认为预设人格（数学导师）
  const activePersona = persona || PRESET_PERSONAS.find(p => p.id === DEFAULT_PERSONA_ID)!;
  const systemInstruction = useRAG 
    ? getSystemInstruction(contextText, activePersona) 
    : getSystemInstructionLight(activePersona);

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

// ─── 系统提示词 ───

/** 轻量系统提示：短消息和日常闲聊使用，响应更快 */
function getSystemInstructionLight(persona: Persona): string {
  return `${persona.systemPrompt}\n\n注意：用中文回答，保持你的角色风格。`;
}

/** 完整系统提示：涉及知识检索的增强模式使用 */
function getSystemInstruction(contextText: string, persona: Persona): string {
  return `${persona.systemPrompt}

# Context Injection
${contextText}
如果用户学到了相关的概念，请提及它们以建立"语义链接"。用中文回答，保持你的角色风格。`;
}

// ─── RAG 检索 ───

export async function findRelevantNotes(query: string, notes: Note[], limit: number = 3): Promise<Note[]> {
  try {
    const queryEmbedding = await generateEmbedding(query);
    // 如果 embedding 服务不可用，返回空数组（RAG 降级）
    if (queryEmbedding.length === 0) {
      return [];
    }
    return notes
      .map(note => ({
        note,
        similarity: note.embedding ? cosineSimilarity(queryEmbedding, note.embedding) : 0
      }))
      .filter(item => item.similarity > 0.6)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit)
      .map(item => item.note);
  } catch (e) {
    if (!isEmbeddingUnsupportedError(e)) {
      console.warn("RAG retrieval failed:", e);
    }
    return [];
  }
}

// ─── JSON 安全解析辅助函数 ───

function safeJsonParse(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    // 尝试从文本中提取 JSON 块（被 ```json 和 ``` 包围的内容）
    const jsonBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonBlockMatch) {
      try {
        return JSON.parse(jsonBlockMatch[1].trim());
      } catch {}
    }

    // 尝试从文本中提取第一个看起来像 JSON 对象的内容
    const jsonObjectMatch = text.match(/\{[\s\S]*\}/);
    if (jsonObjectMatch) {
      try {
        return JSON.parse(jsonObjectMatch[0]);
      } catch {}
    }

    // 尝试从文本中提取第一个看起来像 JSON 数组的内容
    const jsonArrayMatch = text.match(/\[[\s\S]*\]/);
    if (jsonArrayMatch) {
      try {
        return JSON.parse(jsonArrayMatch[0]);
      } catch {}
    }

    throw new Error(`无法解析 JSON，返回内容：${text.substring(0, 200)}...`);
  }
}

// ─── 知识提炼 ───

const MAX_CONVERSATION_MESSAGES = 60;

export async function processConversation(chatHistory: string[]): Promise<{ note: Partial<Note>, flashcards: Partial<Flashcard>[] }> {
  const modelId = getPreferredStructuredModel();
  const truncatedHistory = chatHistory.length > MAX_CONVERSATION_MESSAGES
    ? chatHistory.slice(0, 15).concat(['...(中间省略若干轮)...']).concat(chatHistory.slice(-45))
    : chatHistory;
  const prompt = `你是一位严谨的计算机科学导师。请分析以下对话，提取出核心知识点。

对于每一个知识点，请生成：
1. 一篇结构化的笔记 (Note)：
   - 标题要专业且具象。
   - 内容必须包含：【史前时代】（没有该技术时的灾难）、【解决方案】（该技术如何优雅地解决问题）、【权衡】（引入该技术带来的新问题或成本）。
2. 3-5 个用于主动召回的高质量闪卡 (Flashcards)：
   - **严禁**简单的名词解释。
   - 问题必须是"场景化"或"原理化"的。
   - 答案必须包含底层逻辑。

请严格按以下 JSON 格式输出，不要添加任何其他解释文字：
{
  "note": {
    "title": "笔记标题",
    "summary": "简短摘要",
    "content": "详细内容",
    "tags": ["标签1", "标签2"]
  },
  "flashcards": [
    {"question": "问题1", "answer": "答案1"},
    {"question": "问题2", "answer": "答案2"}
  ]
}

对话内容：
${truncatedHistory.join("\n")}
`;

  const response = await ai.models.generateContent({
    model: modelId,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
    },
  });

  const text = response.text;
  if (!text || typeof text !== 'string' || !text.trim()) {
    throw new Error(`AI 模型返回了空内容，无法提取资产。请重试或切换到其他模型。`);
  }

  return safeJsonParse(text);
}

export async function findSemanticLinks(newNote: Note, existingNotes: Note[]): Promise<string[]> {
  const modelId = getPreferredStructuredModel();
  if (existingNotes.length === 0) return [];
  
  if (newNote.embedding) {
    const related: string[] = [];
    for (const note of existingNotes) {
      if (note.embedding) {
        const similarity = cosineSimilarity(newNote.embedding, note.embedding);
        if (similarity > 0.8) {
          related.push(note.id);
        }
      }
    }
    if (related.length > 0) return related;
  }

  const prompt = `给定一条新笔记： "${newNote.title}: ${newNote.summary}"
以及现有笔记： ${existingNotes.map(n => `ID: ${n.id}, 标题: ${n.title}`).join("; ")}
识别哪些现有笔记与新笔记在语义上相关。

请严格按以下 JSON 数组格式输出相关笔记的 ID，不要添加任何其他解释文字：
["note-id-1", "note-id-2"]`;

  const response = await ai.models.generateContent({
    model: modelId,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
    },
  });

  return safeJsonParse(response.text);
}

export async function deconstructScannedDocument(base64Image: string): Promise<{ note: Partial<Note>, flashcards: Partial<Flashcard>[] }> {
  const modelId = getPreferredStructuredModel();
  const prompt = `你是一位顶尖的知识架构师。请分析这张扫描文档或图片的页面内容，并将其"解构"为结构化的知识资产。

请提取出最核心的一个知识点，并生成：
1. 一篇结构化的笔记 (Note)：
   - 标题要专业且具象
   - 内容包含详细解释
   - 添加相关标签
2. 3-5 个用于主动召回的高质量闪卡 (Flashcards)

请严格按以下 JSON 格式输出，不要添加任何其他解释文字：
{
  "note": {
    "title": "笔记标题",
    "summary": "简短摘要",
    "content": "详细内容",
    "tags": ["标签1", "标签2"]
  },
  "flashcards": [
    {"question": "问题1", "answer": "答案1"},
    {"question": "问题2", "answer": "答案2"}
  ]
}`;

  const response = await ai.models.generateContent({
    model: modelId,
    contents: {
      parts: [
        { text: prompt },
        {
          inlineData: {
            mimeType: "image/jpeg",
            data: base64Image.split(',')[1],
          },
        },
      ],
    },
    config: {
      responseMimeType: "application/json",
    },
  });

  return safeJsonParse(response.text);
}

export async function deconstructTOC(text: string): Promise<{ chapters: { title: string, startPage: number, endPage: number, summary: string }[] }> {
  const modelId = getPreferredStructuredModel();
  const prompt = `你是一位顶尖的知识架构师。请分析以下教材或文档的前几页内容，提取出其目录结构。

请识别出最核心的 5-8 个章节，并为每个章节提供标题、起始/结束页码、核心知识点简述。

请严格按以下 JSON 格式输出，不要添加任何其他解释文字：
{
  "chapters": [
    {"title": "章节1", "startPage": 1, "endPage": 10, "summary": "简述1"},
    {"title": "章节2", "startPage": 11, "endPage": 20, "summary": "简述2"}
  ]
}

文档内容：
${text.slice(0, 20000)}`;

  const response = await ai.models.generateContent({
    model: modelId,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
    },
  });

  return safeJsonParse(response.text);
}

export async function deconstructUrl(url: string): Promise<{ note: Partial<Note>, flashcards: Partial<Flashcard>[] }> {
  const modelId = getPreferredStructuredModel();
  const prompt = `你是一位顶尖的知识架构师。请访问并深度解构以下 URL 的内容：${url}。

请提取出最核心的一个知识点，并生成：
1. 一篇结构化的笔记 (Note)：
   - 标题要专业且具象
   - 内容包含详细解释
   - 添加相关标签
2. 3-5 个用于主动召回的高质量闪卡 (Flashcards)

请严格按以下 JSON 格式输出，不要添加任何其他解释文字：
{
  "note": {
    "title": "笔记标题",
    "summary": "简短摘要",
    "content": "详细内容",
    "tags": ["标签1", "标签2"]
  },
  "flashcards": [
    {"question": "问题1", "answer": "答案1"},
    {"question": "问题2", "answer": "答案2"}
  ]
}`;

  const response = await ai.models.generateContent({
    model: modelId,
    contents: prompt,
    config: {
      tools: [{ urlContext: {} }],
      responseMimeType: "application/json",
    },
  });

  return safeJsonParse(response.text);
}

export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const modelId = getPreferredEmbeddingModel();
    const result = await ai.models.embedContent({
      model: modelId,
      contents: [text],
    });
    if (result?.degraded) {
      return [];
    }

    const values = result?.embeddings?.[0]?.values;
    return Array.isArray(values) ? values : [];
  } catch (error: any) {
    // 如果 embedding 服务不可用（如未配置 Gemini API Key），返回空数组
    // 这样 RAG 和语义搜索会优雅降级，不会阻塞主要功能
    if (error.message?.includes('501') || error.message?.includes('embedding 仅支持')) {
      console.warn('[Embedding] Service unavailable, returning empty array');
      return [];
    }
    throw error;
  }
}

export interface BreakthroughConfig {
  tag: string;
  weakPoints: string[];
}

export async function analyzeKnowledgeGaps(tag: string, cards: Flashcard[]): Promise<string[]> {
  const modelId = getPreferredStructuredModel();
  const prompt = `你是一位教育心理学家和计算机科学专家。
  用户在 [${tag}] 领域的以下知识点上遇到了困难：
  ${cards.map(c => `- Q: ${c.question}\n  A: ${c.answer}`).join('\n')}
  
  请分析这些错误背后的"认知断层"。
  请严格按以下 JSON 数组格式输出 2-3 个具体薄弱点，不要添加任何其他解释文字：
  ["薄弱点1", "薄弱点2", "薄弱点3"]`;

  const response = await ai.models.generateContent({
    model: modelId,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
    },
  });

  return safeJsonParse(response.text);
}

export async function startBreakthroughChat(config: BreakthroughConfig, allNotes: Note[]) {
  const modelId = getPreferredTextModel();
  const relevantNotes = allNotes.filter(n => n.tags.includes(config.tag));
  
  const contextText = relevantNotes.length > 0 
    ? `\n# 攻坚背景\n${relevantNotes.map(n => `## ${n.title}\n${n.summary}`).join('\n---\n')}`
    : `\n当前没有关于 [${config.tag}] 的笔记。`;

  const systemInstruction = getBreakthroughInstruction(config, contextText);

  const response = await ai.models.generateContent({
    model: modelId,
    contents: "你好，导师。我准备好开始针对 [" + config.tag + "] 的专项攻坚了。",
    config: { systemInstruction },
  });
  return response.text;
}

export async function* startBreakthroughChatStream(
  config: BreakthroughConfig,
  allNotes: Note[],
  abortSignal?: AbortSignal
): AsyncGenerator<StreamChunk> {
  const modelId = getPreferredTextModel();
  const relevantNotes = allNotes.filter(n => n.tags.includes(config.tag));
  
  const contextText = relevantNotes.length > 0 
    ? `\n# 攻坚背景\n${relevantNotes.map(n => `## ${n.title}\n${n.summary}`).join('\n---\n')}`
    : `\n当前没有关于 [${config.tag}] 的笔记。`;

  const systemInstruction = getBreakthroughInstruction(config, contextText);

  const stream = ai.models.generateContentStream({
    model: modelId,
    contents: "你好，导师。我准备好开始针对 [" + config.tag + "] 的专项攻坚了。",
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

/** 攻坚模式系统提示 */
function getBreakthroughInstruction(config: BreakthroughConfig, contextText: string): string {
  return `# Role Definition
你是一位拥有深厚工程背景的**苏格拉底式导师**。你的任务是针对用户在 [${config.tag}] 领域的知识薄弱点进行"专项攻坚"。

# 攻坚目标
用户在以下方面表现较弱：${config.weakPoints.join(', ')}。
你的目标是通过引导式提问，帮助用户从底层逻辑上彻底理解这些概念。

# Instruction Protocol (Socratic Method)
1. **严禁直接给出答案**：通过反问来引导。
2. **由浅入深**：从基础物理直觉开始，逐步推导。
3. **识别认知断层**：用"归谬法"让用户自己发现矛盾。
4. **穿透底层**：最终回归到内存、CPU、权衡或历史痛点。

# Context Injection
${contextText}

请开始你的第一轮引导。`;
}

export async function deconstructDocument(text: string): Promise<{ note: Partial<Note>, flashcards: Partial<Flashcard>[] }> {
  const modelId = getPreferredStructuredModel();
  const prompt = `你是一位顶尖的知识架构师。请将以下长文档"解构"为结构化的知识资产。

请提取出最核心的一个知识点，并生成：
1. 一篇结构化的笔记 (Note)：
   - 标题要专业且具象
   - 内容包含详细解释
   - 添加相关标签
2. 3-5 个用于主动召回的高质量闪卡 (Flashcards)

请严格按以下 JSON 格式输出，不要添加任何其他解释文字：
{
  "note": {
    "title": "笔记标题",
    "summary": "简短摘要",
    "content": "详细内容",
    "tags": ["标签1", "标签2"]
  },
  "flashcards": [
    {"question": "问题1", "answer": "答案1"},
    {"question": "问题2", "answer": "答案2"}
  ]
}

文档内容：
${text.slice(0, 20000)}`;

  const response = await ai.models.generateContent({
    model: modelId,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
    },
  });

  return safeJsonParse(response.text);
}

export async function semanticSearch(query: string, notes: Note[]): Promise<{ note: Note, similarity: number }[]> {
  const queryEmbedding = await generateEmbedding(query);
  // 如果 embedding 服务不可用，返回空数组
  if (queryEmbedding.length === 0) {
    return [];
  }
  return notes
    .map(note => ({
      note,
      similarity: note.embedding ? cosineSimilarity(queryEmbedding, note.embedding) : 0
    }))
    .filter(item => item.similarity > 0.4)
    .sort((a, b) => b.similarity - a.similarity);
}

function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length === 0 || vecB.length === 0) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
