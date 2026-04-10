/**
 * 万能对话导入解析器
 * 
 * 核心特性：
 * 1. 永不失败 - 总有兜底方案
 * 2. 三级降级 - 结构化 → AI → 兜底
 * 3. 置信度评分 - 自动选择最佳结果
 * 4. 丰富回退 - 12+ 种 Markdown 模式
 * 
 * 使用方式：
 * ```typescript
 * const result = await parseImportUniversal(content, {
 *   filename: 'chat.md',
 *   aiService: geminiService,
 * });
 * // result 保证有效，不会抛出错误
 * ```
 */

import { ChatMessage, ChatSession, ChatSessionSource } from '../types';
import { safeJsonParse } from '../lib/utils';
import type { ParseResult, ParsedConversation } from './importParsers';

export type { ParseResult, ParsedConversation };

export interface ParseAttempt {
  parser: string;
  success: boolean;
  result?: ParseResult;
  confidence: number;
  error?: string;
}

export interface UniversalParseOptions {
  filename?: string;
  useAI?: boolean;
  minConfidence?: number;
  aiService?: AIService;
}

// AI 服务接口
export interface AIService {
  generate(prompt: string, options?: { model?: string }): Promise<string>;
}

// ─── 主入口：万能解析 ───

/**
 * 万能解析入口 - 永不失败
 * 
 * 解析层级：
 * 1. Level 1: 结构化解析（JSON/Markdown）- 置信度 > 0.7 直接返回
 * 2. Level 2: AI 智能解析 - 结构化失败时调用
 * 3. Level 3: 兜底保存 - 整体作为单条消息
 */
export async function parseImportUniversal(
  content: string,
  options: UniversalParseOptions = {}
): Promise<ParseResult> {
  const attempts: ParseAttempt[] = [];
  const { useAI = true, minConfidence = 0.6 } = options;

  // Level 1: 结构化解析
  const structuredAttempt = await tryStructuredParse(content, options.filename);
  attempts.push(structuredAttempt);

  if (structuredAttempt.success && structuredAttempt.confidence >= minConfidence) {
    return addMetadata(structuredAttempt.result!, 'structured');
  }

  // Level 2: AI 解析
  if (useAI && options.aiService) {
    const aiAttempt = await tryAIParse(content, options.aiService);
    attempts.push(aiAttempt);

    if (aiAttempt.success) {
      return addMetadata(aiAttempt.result!, 'ai');
    }
  }

  // Level 3: 兜底
  return createFallbackResult(content, attempts);
}

// ─── Level 1: 结构化解析 ───

async function tryStructuredParse(content: string, filename?: string): Promise<ParseAttempt> {
  const trimmed = content.trim();

  // 根据文件名后缀路由
  if (filename) {
    const ext = filename.toLowerCase().split('.').pop();
    if (ext === 'json') {
      const result = tryParseJSON(trimmed);
      if (result) {
        return { parser: 'json', success: true, result, confidence: result.confidence };
      }
    }
  }

  // 内容启发式检测
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    const result = tryParseJSON(trimmed);
    if (result) {
      return { parser: 'json', success: true, result, confidence: result.confidence };
    }
  }

  // Markdown 解析
  const mdResult = tryParseMarkdown(trimmed);
  if (mdResult && mdResult.conversations[0].messages.length > 0) {
    return { 
      parser: 'markdown', 
      success: true, 
      result: mdResult, 
      confidence: mdResult.confidence 
    };
  }

  return {
    parser: 'structured',
    success: false,
    confidence: 0,
    error: '结构化解析失败',
  };
}

// ─── JSON 解析（增强版）───

function tryParseJSON(raw: string): ParseResult | null {
  let data: any;

  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }

  const conversations: ParsedConversation[] = [];
  let totalMessages = 0;

  // 辅助函数：提取消息
  const extractMsgs = (msgs: any[]): ChatMessage[] => {
    const messages: ChatMessage[] = [];
    for (const msg of msgs) {
      const text = msg.content || msg.text || msg.value || msg.message || msg.body;
      const role = msg.role || msg.author?.role || msg.sender || msg.from;
      
      if (text && role) {
        messages.push({
          role: normalizeRole(String(role)),
          text: String(text).trim(),
          thought: msg.thought || msg.thinking || msg.reasoning,
        });
      }
    }
    return messages;
  };

  // 情况 1：带 messages 的单个对话
  if (data.messages && Array.isArray(data.messages)) {
    const msgs = extractMsgs(data.messages);
    if (msgs.length > 0) {
      conversations.push({
        title: data.title || data.name || '导入的对话',
        messages: msgs,
        source: inferSource(data.source),
        exportedAt: data.exportedAt || data.timestamp,
      });
      totalMessages = msgs.length;
    }
  }
  // 情况 2：conversations 数组
  else if (data.conversations && Array.isArray(data.conversations)) {
    for (const conv of data.conversations) {
      if (conv.messages && Array.isArray(conv.messages)) {
        const msgs = extractMsgs(conv.messages);
        if (msgs.length > 0) {
          conversations.push({
            title: conv.title || '导入的对话',
            messages: msgs,
            source: inferSource(conv.source),
            exportedAt: conv.exportedAt,
          });
          totalMessages += msgs.length;
        }
      }
    }
  }
  // 情况 3：顶层消息数组
  else if (Array.isArray(data)) {
    const msgs = extractMsgs(data);
    if (msgs.length > 0) {
      conversations.push({
        title: '导入的对话',
        messages: msgs,
        source: 'gemini_import',
      });
      totalMessages = msgs.length;
    }
  }
  // 情况 4：ChatGPT mapping
  else if (data.mapping && typeof data.mapping === 'object') {
    const msgs = extractChatGptMapping(data.mapping);
    if (msgs.length > 0) {
      conversations.push({
        title: data.title || 'ChatGPT 对话',
        messages: msgs,
        source: 'chatgpt_import',
        exportedAt: data.create_time ? new Date(data.create_time * 1000).toISOString() : undefined,
      });
      totalMessages = msgs.length;
    }
  }
  // 情况 5：chat_messages
  else if (data.chat_messages && Array.isArray(data.chat_messages)) {
    const msgs = extractMsgs(data.chat_messages);
    if (msgs.length > 0) {
      conversations.push({
        title: data.title || 'ChatGPT 对话',
        messages: msgs,
        source: 'chatgpt_import',
      });
      totalMessages = msgs.length;
    }
  }
  // 情况 6：data 数组（ChatGPT Exporter）
  else if (data.data && Array.isArray(data.data)) {
    for (const item of data.data) {
      if (item.messages && Array.isArray(item.messages)) {
        const msgs = extractMsgs(item.messages);
        if (msgs.length > 0) {
          conversations.push({
            title: item.title || '导入的对话',
            messages: msgs,
            source: 'chatgpt_import',
          });
          totalMessages += msgs.length;
        }
      }
    }
  }

  if (conversations.length === 0) {
    return null;
  }

  // 置信度计算：消息越多置信度越高，但上限 0.95
  const confidence = Math.min(0.5 + totalMessages * 0.05, 0.95);

  return {
    conversations,
    format: 'json',
    confidence,
    warnings: [],
    usedParser: 'json',
  };
}

// ─── Markdown 解析（12+ 模式）───

function tryParseMarkdown(raw: string): ParseResult | null {
  const messages: ChatMessage[] = [];
  let usedPattern = '';

  // 定义所有模式（优先级从高到低）
  const patterns: Array<{ name: string; regex: RegExp; roleExtractor: (match: RegExpMatchArray) => 'user' | 'model' }> = [
    // 1. 标准 Markdown 标题
    {
      name: 'heading',
      regex: /^##\s+(User|Gemini|Assistant|Model|Human|You|AI|ChatGPT|Claude|模型|用户|助手|我|你)\s*$/gmi,
      roleExtractor: (m) => normalizeRole(m[1]),
    },
    // 2. 加粗格式
    {
      name: 'bold',
      regex: /^\*\*(User|Gemini|Assistant|Model|Human|You|AI|ChatGPT|Claude|模型|用户|助手|我|你)\*\*\s*[:：]/gmi,
      roleExtractor: (m) => normalizeRole(m[1]),
    },
    // 3. 简单标记（英文）
    {
      name: 'simple_en',
      regex: /^(User|Gemini|Assistant|Model|Human|You|AI|ChatGPT|Claude)\s*[:：]\s*/gmi,
      roleExtractor: (m) => normalizeRole(m[1]),
    },
    // 4. 简单标记（中文）
    {
      name: 'simple_cn',
      regex: /^(用户|助手|模型|我|你|人类|AI|人工智能)\s*[:：]\s*/gmi,
      roleExtractor: (m) => normalizeRole(m[1]),
    },
    // 5. Gemini 网页导出
    {
      name: 'gemini_web',
      regex: /^#\s+(you asked|gemini response)/gmi,
      roleExtractor: (m) => m[1].toLowerCase().includes('you') ? 'user' : 'model',
    },
    // 6. 代码注释
    {
      name: 'comment',
      regex: /^\/\/\s*(User|AI|Assistant|Human|用户|助手|我|你)[\s:]*/gmi,
      roleExtractor: (m) => normalizeRole(m[1]),
    },
    // 7. 引用格式
    {
      name: 'quote',
      regex: /^>\s*(User|AI|Assistant|Human|用户|助手|我|你)[\s:]*/gmi,
      roleExtractor: (m) => normalizeRole(m[1]),
    },
    // 8. 时间戳 + 角色（聊天记录）
    {
      name: 'timestamp',
      regex: /^\[\d{2}:\d{2}(:\d{2})?\]\s*(我|你|用户|助手|AI|Model)/gm,
      roleExtractor: (m) => /我|用户/.test(m[2]) ? 'user' : 'model',
    },
    // 9. 箭头格式
    {
      name: 'arrow',
      regex: /^(-->|<--|->|<-)\s*(User|AI|Assistant|用户|助手|我|你)[\s:]*/gmi,
      roleExtractor: (m) => normalizeRole(m[2]),
    },
    // 10. 括号格式
    {
      name: 'bracket',
      regex: /^\[(User|AI|Assistant|用户|助手|我|你)\]\s*/gmi,
      roleExtractor: (m) => normalizeRole(m[1]),
    },
  ];

  // 尝试每种模式
  for (const pattern of patterns) {
    const matches = [...raw.matchAll(pattern.regex)];
    if (matches.length >= 2) {
      usedPattern = pattern.name;
      for (let i = 0; i < matches.length; i++) {
        const match = matches[i];
        const role = pattern.roleExtractor(match);
        const start = match.index! + match[0].length;
        const end = i < matches.length - 1 ? matches[i + 1].index! : raw.length;
        const text = raw.slice(start, end).trim();
        
        if (text) {
          messages.push({ role, text });
        }
      }
      break;
    }
  }

  // 11. 段落分割兜底（如果上述都失败）
  if (messages.length === 0) {
    const paragraphs = raw.split(/\n\s*\n/).filter(p => p.trim().length > 10);
    if (paragraphs.length >= 2) {
      usedPattern = 'paragraph';
      // 启发式：短段落可能是用户，长段落可能是 AI
      for (let i = 0; i < paragraphs.length; i++) {
        const text = paragraphs[i].trim();
        // 交替分配角色，或根据长度启发式
        const role = i % 2 === 0 ? 'user' : 'model';
        messages.push({ role, text });
      }
    }
  }

  // 12. 问答对检测（Q: A: 格式）
  if (messages.length === 0) {
    const qaPattern = /^(Q|Question|问|问题)[\s:：]\s*(.+?)\n+(A|Answer|答|回答)[\s:：]\s*(.+?)(?=\n+(?:Q|Question|问|问题)[\s:：]|$)/gmsi;
    const matches = [...raw.matchAll(qaPattern)];
    if (matches.length > 0) {
      usedPattern = 'qa_pairs';
      for (const match of matches) {
        messages.push({ role: 'user', text: match[2].trim() });
        messages.push({ role: 'model', text: match[4].trim() });
      }
    }
  }

  if (messages.length === 0) {
    return null;
  }

  // 置信度：匹配到的模式越具体，置信度越高
  const confidenceMap: Record<string, number> = {
    heading: 0.9,
    bold: 0.85,
    simple_en: 0.8,
    simple_cn: 0.8,
    gemini_web: 0.9,
    comment: 0.75,
    quote: 0.75,
    timestamp: 0.85,
    arrow: 0.7,
    bracket: 0.75,
    paragraph: 0.5,
    qa_pairs: 0.8,
  };

  const confidence = confidenceMap[usedPattern] || 0.5;
  const warnings = usedPattern === 'paragraph' 
    ? ['使用段落分割识别，角色分配可能不准确'] 
    : [];

  return {
    conversations: [{
      title: extractTitle(raw) || '导入的对话',
      messages,
      source: 'markdown_import',
    }],
    format: 'markdown',
    confidence,
    warnings,
    usedParser: `markdown:${usedPattern}`,
  };
}

// ─── Level 2: AI 解析 ───

async function tryAIParse(content: string, aiService: AIService): Promise<ParseAttempt> {
  const prompt = `你是一个对话解析专家。请分析以下文本，提取对话轮次。

如果文本是：
1. 对话记录 → 提取每轮发言的角色和内容
2. 文章/笔记 → 提取关键问答对
3. 纯文本 → 识别可能的问答结构

文本内容（前8000字符）：
"""
${content.slice(0, 8000)}${content.length > 8000 ? '\n...(内容已截断)' : ''}
"""

请以 JSON 格式返回（不要 markdown 代码块）：
{
  "format_detected": "对话|文章|问答|代码|其他",
  "title": "简短标题（20字以内）",
  "messages": [
    {
      "role": "user|assistant",
      "text": "消息内容",
      "thought": "思考过程（如果有）"
    }
  ],
  "confidence": 0.0-1.0
}

注意：
- confidence 表示你对解析结果的确定程度
- 如果无法确定角色，用 "user" 和 "assistant" 交替
- 至少提取一条有效消息`;

  try {
    const response = await aiService.generate(prompt);
    const parsed = safeJsonParse<{
      format_detected?: string;
      title?: string;
      messages?: Array<{ role?: string; text?: string; thought?: string }>;
      confidence?: number;
    }>(response);

    if (!parsed || !Array.isArray(parsed.messages) || parsed.messages.length === 0) {
      return {
        parser: 'ai',
        success: false,
        confidence: 0,
        error: 'AI 返回无效格式',
      };
    }

    const messages: ChatMessage[] = parsed.messages
      .filter((m) => m.text && typeof m.text === 'string')
      .map((m) => ({
        role: normalizeRole(m.role || 'assistant'),
        text: m.text.trim(),
        thought: m.thought,
      }));

    if (messages.length === 0) {
      return {
        parser: 'ai',
        success: false,
        confidence: 0,
        error: 'AI 未返回有效消息',
      };
    }

    const confidence = Math.min(Math.max(parsed.confidence || 0.7, 0), 1);

    return {
      parser: 'ai',
      success: true,
      confidence,
      result: {
        conversations: [{
          title: parsed.title || 'AI解析内容',
          messages,
          source: 'ai_import',
        }],
        format: 'ai_parsed',
        confidence,
        warnings: confidence < 0.7 ? ['AI 解析置信度较低，建议检查'] : [],
        usedParser: 'ai',
      },
    };
  } catch (error) {
    return {
      parser: 'ai',
      success: false,
      confidence: 0,
      error: error instanceof Error ? error.message : 'AI 解析失败',
    };
  }
}

// ─── Level 3: 兜底 ───

function createFallbackResult(content: string, attempts: ParseAttempt[]): ParseResult {
  const trimmed = content.trim();
  const warnings: string[] = [];

  // 尝试提取一些有用的信息
  const lines = trimmed.split('\n');
  const firstLine = lines[0].slice(0, 50);
  const title = firstLine.replace(/^#+\s*/, '') || '导入的内容';

  // 如果内容很长，提示用户
  if (trimmed.length > 1000) {
    warnings.push(`内容较长(${trimmed.length}字符)，已作为整体保存。建议导入后使用 AI 拆分。`);
  }

  // 记录之前的尝试
  const failedParsers = attempts
    .filter(a => !a.success)
    .map(a => a.parser)
    .join(', ');
  
  if (failedParsers) {
    warnings.push(`尝试了 ${failedParsers} 解析均未成功，已使用兜底方案。`);
  }

  return {
    conversations: [{
      title,
      messages: [{ role: 'user', text: trimmed }],
      source: 'raw_import',
    }],
    format: 'raw',
    confidence: 0.3,
    warnings,
    usedParser: 'fallback',
  };
}

// ─── 辅助函数 ───

function normalizeRole(role: string): 'user' | 'model' {
  const lower = role.toLowerCase().trim();
  
  // 用户角色变体
  const userPatterns = [
    'user', 'human', 'you', 'me', 'customer', 'client', 'student',
    '用户', '人类', '你', '我', '客户', '学生', '提问者',
    'asker', 'questioner', 'sender', 'author',
  ];
  
  if (userPatterns.some(p => lower.includes(p))) {
    return 'user';
  }
  
  // 其他都视为模型
  return 'model';
}

function inferSource(rawSource?: string): ChatSessionSource {
  if (!rawSource) return 'gemini_import';
  const lower = rawSource.toLowerCase();
  if (lower.includes('chatgpt') || lower.includes('openai') || lower.includes('gpt')) {
    return 'chatgpt_import';
  }
  if (lower.includes('gemini') || lower.includes('bard')) {
    return 'gemini_import';
  }
  if (lower.includes('claude') || lower.includes('anthropic')) {
    return 'claude_import';
  }
  return 'gemini_import';
}

function extractChatGptMapping(mapping: Record<string, any>): ChatMessage[] {
  const messages: ChatMessage[] = [];
  const nodes = Object.values(mapping);
  const root = nodes.find((n: any) => !n.parent);
  
  if (!root) return messages;

  const visited = new Set<string>();
  
  function traverse(nodeId: string) {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);

    const node = mapping[nodeId];
    if (!node) return;

    const msg = node.message;
    if (msg && msg.content && msg.author) {
      const role = msg.author.role;
      if (role === 'user' || role === 'assistant') {
        let text = '';
        if (msg.content.parts && Array.isArray(msg.content.parts)) {
          text = msg.content.parts.filter((p: any) => typeof p === 'string').join('\n');
        } else if (typeof msg.content === 'string') {
          text = msg.content;
        }
        
        if (text.trim()) {
          messages.push({
            role: normalizeRole(role),
            text: text.trim(),
          });
        }
      }
    }

    if (node.children && node.children.length > 0) {
      traverse(node.children[0]);
    }
  }

  const rootId = root.id || Object.keys(mapping).find(k => mapping[k] === root) || '';
  traverse(rootId);
  
  return messages;
}

function extractTitle(raw: string): string {
  // 尝试提取标题
  const titleMatch = raw.match(/^#\s+(.+)$/m);
  if (titleMatch) {
    return titleMatch[1].trim();
  }
  
  // 第一行作为标题
  const firstLine = raw.split('\n')[0].trim();
  if (firstLine && firstLine.length < 100) {
    return firstLine.replace(/^#+\s*/, '');
  }
  
  return '';
}

function addMetadata(result: ParseResult, level: string): ParseResult {
  return {
    ...result,
    warnings: [
      ...result.warnings,
      level === 'ai' ? '使用 AI 智能解析，建议检查识别准确性' : '',
      level === 'fallback' ? '使用兜底方案保存，内容可能未正确拆分' : '',
    ].filter(Boolean),
  };
}

// ─── 向后兼容导出 ───

export { parseImportUniversal as parseImport };

// 保留旧函数签名用于兼容 - 同步版本，不使用 AI
export function autoDetectAndParse(content: string, filename?: string): ParseResult {
  const trimmed = content.trim();
  
  // 尝试 JSON
  if (filename?.endsWith('.json') || trimmed.startsWith('{') || trimmed.startsWith('[')) {
    const result = tryParseJSON(trimmed);
    if (result) return result;
  }
  
  // 尝试 Markdown
  const mdResult = tryParseMarkdown(trimmed);
  if (mdResult && mdResult.conversations[0].messages.length > 0) {
    return mdResult;
  }
  
  // 兜底
  return createFallbackResult(trimmed, []);
}
