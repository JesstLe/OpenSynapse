/**
 * 对话导入解析器
 * 支持 JSON（SaveChat / AI Chat Exporter 风格）、Markdown、纯文本三种格式
 * 提供自动格式检测与去重指纹计算
 */

import { ChatMessage, ChatSession, ChatSessionSource } from '../types';

// ─── 解析结果类型 ───

/** 单条解析出的对话 */
export interface ParsedConversation {
  title: string;
  messages: ChatMessage[];
  source: ChatSessionSource;
  exportedAt?: string;
}

/** 解析器返回（可能是一条或多条对话） */
export interface ParseResult {
  conversations: ParsedConversation[];
  format: 'json' | 'markdown' | 'text' | 'ai_parsed' | 'raw';
  warnings: string[];
  confidence?: number;
  usedParser?: string;
}

// ─── 角色映射 ───

/** 将各种导出工具使用的角色名统一映射为本项目的 'user' | 'model' */
function normalizeRole(role: string): 'user' | 'model' {
  const lower = role.toLowerCase().trim();
  if (['user', 'human', '用户', 'you', 'me'].includes(lower)) return 'user';
  // 其余全部视为模型
  return 'model';
}

/** 将各种来源字段统一映射为 ChatSessionSource */
function inferSource(rawSource?: string): ChatSessionSource {
  if (!rawSource) return 'gemini_import';
  const lower = rawSource.toLowerCase();
  if (lower.includes('chatgpt') || lower.includes('openai') || lower.includes('gpt')) return 'chatgpt_import';
  if (lower.includes('gemini') || lower.includes('bard')) return 'gemini_import';
  if (lower.includes('custom') || lower.includes('手动')) return 'custom_import';
  return 'gemini_import';
}

// ─── JSON 解析 ───

/**
 * 解析 JSON 格式的对话导出
 * 兼容多种插件输出结构：
 *   - SaveChat: { title, messages: [{ role, content }] }
 *   - AI Chat Exporter: { conversations: [{ title, messages }] }
 *   - 数组形式: [{ role, content }]
 *   - Google Takeout 活动日志: 尝试提取
 */
export function parseJsonImport(raw: string): ParseResult {
  const warnings: string[] = [];
  let data: any;

  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error('JSON 解析失败：文件内容不是有效的 JSON 格式。');
  }

  const conversations: ParsedConversation[] = [];

  // 情况 1：顶层是带 messages 的单个对话
  if (data.messages && Array.isArray(data.messages)) {
    const msgs = extractMessages(data.messages, warnings);
    if (msgs.length > 0) {
      conversations.push({
        title: data.title || data.name || data.conversationTitle || '导入的对话',
        messages: msgs,
        source: inferSource(data.source || data.platform),
        exportedAt: data.exportedAt || data.timestamp || data.date || data.created_at,
      });
    }
  }
  // 情况 2：conversations 数组（包含多个对话）
  else if (data.conversations && Array.isArray(data.conversations)) {
    for (const conv of data.conversations) {
      if (!conv.messages || !Array.isArray(conv.messages)) {
        warnings.push(`跳过了一个没有 messages 字段的对话条目。`);
        continue;
      }
      const msgs = extractMessages(conv.messages, warnings);
      if (msgs.length > 0) {
        conversations.push({
          title: conv.title || conv.name || '导入的对话',
          messages: msgs,
          source: inferSource(conv.source || data.source),
          exportedAt: conv.exportedAt || conv.timestamp || conv.date,
        });
      }
    }
  }
  // 情况 3：顶层直接是消息数组
  else if (Array.isArray(data)) {
    const msgs = extractMessages(data, warnings);
    if (msgs.length > 0) {
      conversations.push({
        title: '导入的对话',
        messages: msgs,
        source: 'gemini_import',
      });
    }
  }
  // 情况 4：ChatGPT 官方导出格式 — 有 mapping 字段
  else if (data.mapping && typeof data.mapping === 'object') {
    const msgs = extractChatGptMapping(data.mapping, warnings);
    if (msgs.length > 0) {
      conversations.push({
        title: data.title || '导入的 ChatGPT 对话',
        messages: msgs,
        source: 'chatgpt_import',
        exportedAt: data.create_time ? new Date(data.create_time * 1000).toISOString() : undefined,
      });
    }
  }
  // 情况 5：ChatGPT 分享链接格式 — 有 chat_messages 字段
  else if (data.chat_messages && Array.isArray(data.chat_messages)) {
    const msgs = extractChatGptShareMessages(data.chat_messages, warnings);
    if (msgs.length > 0) {
      conversations.push({
        title: data.title || data.name || '导入的 ChatGPT 对话',
        messages: msgs,
        source: 'chatgpt_import',
        exportedAt: data.created_at || data.timestamp,
      });
    }
  }
  // 情况 6：ChatGPT 导出工具格式 — ChatGPT Exporter / ChatGPT Save 等
  else if (data.data && Array.isArray(data.data)) {
    // 尝试解析 ChatGPT Exporter 格式
    for (const item of data.data) {
      if (item.messages && Array.isArray(item.messages)) {
        const msgs = extractMessages(item.messages, warnings);
        if (msgs.length > 0) {
          conversations.push({
            title: item.title || item.name || '导入的 ChatGPT 对话',
            messages: msgs,
            source: 'chatgpt_import',
            exportedAt: item.timestamp || item.created_at || item.date,
          });
        }
      }
    }
  }

  if (conversations.length === 0) {
    throw new Error('无法从 JSON 中提取对话内容。请确认文件格式是由 SaveChat、AI Chat Exporter、ChatGPT 官方导出等工具导出。');
  }

  return { conversations, format: 'json', warnings };
}

/** 从消息数组中提取 ChatMessage[]，兼容多种字段名 */
function extractMessages(rawMessages: any[], warnings: string[]): ChatMessage[] {
  const messages: ChatMessage[] = [];
  let skipped = 0;

  for (const msg of rawMessages) {
    // 兼容 content / text / value / message 等字段名
    const text = msg.content || msg.text || msg.value || msg.message || msg.body;
    const role = msg.role || msg.author || msg.sender || msg.from;

    if (!text || !role) {
      skipped++;
      continue;
    }

    const chatMsg: ChatMessage = {
      role: normalizeRole(String(role)),
      text: String(text).trim(),
    };

    // 如果有思考过程字段
    if (msg.thought || msg.thinking || msg.reasoning) {
      chatMsg.thought = String(msg.thought || msg.thinking || msg.reasoning).trim();
    }

    messages.push(chatMsg);
  }

  if (skipped > 0) {
    warnings.push(`跳过了 ${skipped} 条无法识别的消息（缺少 role 或 content）。`);
  }

  return messages;
}

/** 从 ChatGPT 官方导出的 mapping 结构中提取消息 */
function extractChatGptMapping(mapping: Record<string, any>, warnings: string[]): ChatMessage[] {
  const messages: ChatMessage[] = [];

  // 构建有序的消息链
  const nodes = Object.values(mapping);
  // 找到根节点
  const root = nodes.find(n => !n.parent);
  if (!root) {
    warnings.push('ChatGPT mapping 中未找到根节点。');
    return messages;
  }

  // 从根节点沿 children 遍历
  const visited = new Set<string>();
  function traverse(nodeId: string) {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);

    const node = mapping[nodeId];
    if (!node) return;

    const msg = node.message;
    if (msg && msg.content && msg.content.parts && msg.author) {
      const role = msg.author.role;
      if (role === 'user' || role === 'assistant') {
        const text = msg.content.parts
          .filter((p: any) => typeof p === 'string')
          .join('\n')
          .trim();
        if (text) {
          messages.push({
            role: normalizeRole(role),
            text,
          });
        }
      }
    }

    // 递归遍历子节点（取第一条路径）
    if (node.children && node.children.length > 0) {
      traverse(node.children[0]);
    }
  }

  traverse(root.id || Object.keys(mapping).find(k => mapping[k] === root) || '');
  return messages;
}

/** 从 ChatGPT 分享链接格式中提取消息 */
function extractChatGptShareMessages(chatMessages: any[], warnings: string[]): ChatMessage[] {
  const messages: ChatMessage[] = [];

  for (const msg of chatMessages) {
    // ChatGPT 分享链接格式: { role: 'user' | 'assistant', content: string }
    const role = msg.role || msg.author?.role;
    const content = msg.content || msg.message;

    if (!role || !content) {
      continue;
    }

    // 处理 content 可能是对象的情况（如包含 parts）
    let text = '';
    if (typeof content === 'string') {
      text = content;
    } else if (content.parts && Array.isArray(content.parts)) {
      text = content.parts.filter((p: any) => typeof p === 'string').join('\n');
    } else if (content.text) {
      text = content.text;
    }

    text = text.trim();
    if (text) {
      messages.push({
        role: normalizeRole(role),
        text,
      });
    }
  }

  return messages;
}

// ─── Markdown 解析 ───

/**
 * 解析 Markdown 格式的对话导出
 * 支持的分隔符格式：
 *   - ## User / ## Gemini / ## Assistant / ## Model
 *   - **User:** / **Gemini:** / **Assistant:**
 *   - > User: / > Gemini:
 *   - # you asked / # gemini response (Gemini 网页导出格式)
 *   - > From: https://gemini.google.com/ (Gemini 网页导出带来源链接)
 */
export function parseMarkdownImport(raw: string): ParseResult {
  const warnings: string[] = [];
  const messages: ChatMessage[] = [];

  // 尝试用 ## 标题分隔
  const headingPattern = /^##\s+(User|Gemini|Assistant|Model|Human|You|AI|ChatGPT|Claude)\s*$/gmi;
  const headingMatches = [...raw.matchAll(headingPattern)];

  if (headingMatches.length >= 2) {
    // 按 heading 分割
    for (let i = 0; i < headingMatches.length; i++) {
      const match = headingMatches[i];
      const role = normalizeRole(match[1]);
      const start = match.index! + match[0].length;
      const end = i < headingMatches.length - 1 ? headingMatches[i + 1].index! : raw.length;
      const text = raw.slice(start, end).trim();

      if (text) {
        messages.push({ role, text });
      }
    }
  } else {
    // 尝试用 **Role:** 或 Role: 分隔
    const boldPattern = /^\*\*(User|Gemini|Assistant|Model|Human|You|AI|ChatGPT|Claude)\*\*\s*[:：]/gmi;
    const boldMatches = [...raw.matchAll(boldPattern)];

    if (boldMatches.length >= 2) {
      for (let i = 0; i < boldMatches.length; i++) {
        const match = boldMatches[i];
        const role = normalizeRole(match[1]);
        const start = match.index! + match[0].length;
        const end = i < boldMatches.length - 1 ? boldMatches[i + 1].index! : raw.length;
        const text = raw.slice(start, end).trim();

        if (text) {
          messages.push({ role, text });
        }
      }
    } else {
      // 尝试简单的 "角色:" 分隔
      const simplePattern = /^(User|Gemini|Assistant|Model|Human|You|AI)\s*[:：]\s*/gmi;
      const simpleMatches = [...raw.matchAll(simplePattern)];

      if (simpleMatches.length >= 2) {
        for (let i = 0; i < simpleMatches.length; i++) {
          const match = simpleMatches[i];
          const role = normalizeRole(match[1]);
          const start = match.index! + match[0].length;
          const end = i < simpleMatches.length - 1 ? simpleMatches[i + 1].index! : raw.length;
          const text = raw.slice(start, end).trim();

          if (text) {
            messages.push({ role, text });
          }
        }
      } else {
        // 新增：支持 Gemini 网页导出的原生格式
        // # you asked / # gemini response
        const geminiWebPattern = /^#\s+(you asked|gemini response)\s*$/gmi;
        const geminiWebMatches = [...raw.matchAll(geminiWebPattern)];

        if (geminiWebMatches.length >= 2) {
          for (let i = 0; i < geminiWebMatches.length; i++) {
            const match = geminiWebMatches[i];
            // "you asked" -> user, "gemini response" -> model
            const role = match[1].toLowerCase().includes('you') ? 'user' : 'model';
            const start = match.index! + match[0].length;
            const end = i < geminiWebMatches.length - 1 ? geminiWebMatches[i + 1].index! : raw.length;
            const text = raw.slice(start, end).trim();

            if (text) {
              messages.push({ role, text });
            }
          }
        }
      }
    }
  }

  if (messages.length === 0) {
    throw new Error('无法从 Markdown 中识别出对话轮次。请确保内容包含类似 "## User" / "## Gemini" 或 "# you asked" / "# gemini response" 的角色标记。');
  }

  // 尝试从开头提取标题
  const titleMatch = raw.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1].trim() : '导入的 Markdown 对话';

  return {
    conversations: [{
      title,
      messages,
      source: 'markdown_import',
    }],
    format: 'markdown',
    warnings,
  };
}

// ─── 纯文本解析（AI 辅助） ───

/**
 * 将纯文本内容包装为单条用户消息
 * 后续由前端调用 AI 进行对话轮次自动拆分
 */
export function parseTextImport(raw: string): ParseResult {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error('粘贴的内容为空。');
  }

  // 尝试先用 Markdown 解析器解析
  try {
    const mdResult = parseMarkdownImport(trimmed);
    if (mdResult.conversations[0].messages.length >= 2) {
      return mdResult;
    }
  } catch {
    // Markdown 解析失败，继续走纯文本路径
  }

  // 纯文本：整体作为一条用户消息，标记为 text_import
  return {
    conversations: [{
      title: trimmed.slice(0, 50).replace(/\n/g, ' ') + (trimmed.length > 50 ? '...' : ''),
      messages: [{ role: 'user', text: trimmed }],
      source: 'text_import',
    }],
    format: 'text',
    warnings: ['无法自动识别对话轮次，已将全部内容作为单条消息导入。你可以在对话中继续与 AI 互动。'],
  };
}

// ─── 自定义格式解析 ───

/**
 * 自定义对话格式配置
 */
export interface CustomFormatConfig {
  userMarker: string;      // 用户消息标记，如 "User:" 或 "人类："
  assistantMarker: string; // AI 消息标记，如 "AI:" 或 "助手："
  separator?: string;      // 消息分隔符（可选）
}

/**
 * 解析自定义格式的对话
 * 根据用户提供的标记来识别对话轮次
 */
export function parseCustomFormat(raw: string, config: CustomFormatConfig): ParseResult {
  const warnings: string[] = [];
  const messages: ChatMessage[] = [];

  const { userMarker, assistantMarker } = config;

  // 构建正则表达式来匹配两种角色
  // 转义特殊字符
  const escapeRegExp = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const userPattern = escapeRegExp(userMarker);
  const assistantPattern = escapeRegExp(assistantMarker);

  // 创建一个综合正则来匹配两种标记
  const combinedPattern = new RegExp(`^(?:${userPattern}|${assistantPattern})`, 'mi');

  // 检查内容是否包含任何标记
  if (!combinedPattern.test(raw)) {
    throw new Error(`未找到自定义标记 "${userMarker}" 或 "${assistantMarker}"。请检查标记设置是否正确。`);
  }

  // 按行分割并解析
  const lines = raw.split('\n');
  let currentRole: 'user' | 'model' | null = null;
  let currentText: string[] = [];

  const flushMessage = () => {
    if (currentRole && currentText.length > 0) {
      const text = currentText.join('\n').trim();
      if (text) {
        messages.push({ role: currentRole, text });
      }
    }
    currentText = [];
  };

  for (const line of lines) {
    const trimmedLine = line.trim();

    // 检查是否是用户标记
    if (new RegExp(`^${userPattern}`, 'i').test(trimmedLine)) {
      flushMessage();
      currentRole = 'user';
      // 提取标记后的内容
      const content = trimmedLine.slice(userMarker.length).trim();
      if (content) {
        currentText.push(content);
      }
    }
    // 检查是否是助手标记
    else if (new RegExp(`^${assistantPattern}`, 'i').test(trimmedLine)) {
      flushMessage();
      currentRole = 'model';
      // 提取标记后的内容
      const content = trimmedLine.slice(assistantMarker.length).trim();
      if (content) {
        currentText.push(content);
      }
    }
    // 普通内容行
    else if (currentRole) {
      currentText.push(line);
    }
  }

  // 刷新最后一条消息
  flushMessage();

  if (messages.length === 0) {
    throw new Error('未能从内容中解析出任何对话消息。请检查标记设置是否正确。');
  }

  if (messages.length < 2) {
    warnings.push('只解析到一条消息，建议至少包含一个完整的问答轮次。');
  }

  return {
    conversations: [{
      title: '自定义格式导入的对话',
      messages,
      source: 'custom_import',
    }],
    format: 'text',
    warnings,
  };
}

// ─── 自动格式检测 ───

/** 自动检测输入格式并调用对应解析器 */
export function autoDetectAndParse(content: string, filename?: string): ParseResult {
  const trimmed = content.trim();

  // 根据文件名后缀判断
  if (filename) {
    const ext = filename.toLowerCase().split('.').pop();
    if (ext === 'json') return parseJsonImport(trimmed);
    if (ext === 'md' || ext === 'markdown') return parseMarkdownImport(trimmed);
    if (ext === 'txt') return parseTextImport(trimmed);
  }

  // 根据内容判断
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return parseJsonImport(trimmed);
    } catch {
      // JSON 解析失败，尝试其他格式
    }
  }

  // 检测 Markdown 角色标记
  if (/^##\s+(User|Gemini|Assistant|Model|Human)/mi.test(trimmed)) {
    try {
      return parseMarkdownImport(trimmed);
    } catch {
      // Markdown 解析失败
    }
  }

  // 兜底：纯文本
  return parseTextImport(trimmed);
}

// ─── 去重指纹 ───

/**
 * 基于对话内容生成去重指纹
 * 算法：取首条用户消息前200字符 + 消息总数 + 导出时间
 * 使用 Web Crypto API 计算 SHA-256
 */
export async function generateFingerprint(
  messages: ChatMessage[],
  exportedAt?: string
): Promise<string> {
  const firstUserMsg = messages.find(m => m.role === 'user');
  const raw = [
    (firstUserMsg?.text || '').slice(0, 200),
    String(messages.length),
    exportedAt || '',
  ].join('|');

  // 使用 Web Crypto API 计算 SHA-256
  const encoder = new TextEncoder();
  const data = encoder.encode(raw);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 检查 fingerprint 是否已存在于已有会话中
 * 返回匹配到的会话（可能为 undefined）
 */
export function checkDuplicate(
  fingerprint: string,
  existingSessions: ChatSession[]
): ChatSession | undefined {
  return existingSessions.find(s => s.fingerprint === fingerprint);
}

// ─── 转换为 ChatSession ───

/**
 * 将解析结果转换为可直接写入的 ChatSession 对象
 */
export async function toSessions(
  parsed: ParseResult,
  userId: string
): Promise<ChatSession[]> {
  const sessions: ChatSession[] = [];

  for (const conv of parsed.conversations) {
    const fingerprint = await generateFingerprint(conv.messages, conv.exportedAt);
    const now = Date.now();

    sessions.push({
      id: `import_${now}_${Math.random().toString(36).slice(2, 9)}`,
      title: conv.title,
      messages: conv.messages,
      updatedAt: now,
      userId,
      source: conv.source,
      importedAt: now,
      fingerprint,
      originalExportedAt: conv.exportedAt,
    });
  }

  return sessions;
}
