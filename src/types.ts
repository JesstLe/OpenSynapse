export interface Note {
  id: string;
  title: string;
  summary: string;
  content: string;
  codeSnippet?: string;
  tags: string[];
  relatedIds: string[];
  createdAt: number;
  embedding?: number[];
  userId: string;
}

export interface Flashcard {
  id: string;
  noteId: string;
  question: string;
  answer: string;
  nextReview: number;
  lastReview: number;
  stability: number;
  difficulty: number;
  repetitions: number;
  state: number; // 0: New, 1: Learning, 2: Review, 3: Relearning
  userId: string;
  halflife?: number; // MaiMemo algorithm: half-life in days
  createdAt?: number;
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  thought?: string; // 模型思考过程（可折叠显示）
  image?: string; // base64 string
}

// 对话来源标记
export type ChatSessionSource = 
  | 'native' 
  | 'gemini_import' 
  | 'chatgpt_import' 
  | 'claude_import'
  | 'custom_import' 
  | 'markdown_import' 
  | 'text_import'
  | 'ai_import'
  | 'raw_import';

export interface Persona {
  id: string;           // 唯一标识 (如 'cs-tutor', 'math-expert')
  name: string;         // 显示名称
  icon: string;         // Lucide 图标名称
  description: string;  // 简短描述
  systemPrompt: string; // 核心系统指令
  category: 'general' | 'cs' | 'math' | 'law' | 'finance' | 'custom' | 'hidden';
  isLocked?: boolean;    // 是否禁止编辑（系统内置人格为 true）
  isHidden?: boolean;    // 是否为隐藏状态
  userId?: string;      // 所有人 ID（自定义人格使用）
}

export interface ChatSession {
  id: string;
  title?: string;
  messages: ChatMessage[];
  updatedAt: number;
  userId: string;
  source?: ChatSessionSource;       // 对话来源（默认 native）
  importedAt?: number;              // 导入时间戳
  fingerprint?: string;             // 去重指纹（基于内容哈希）
  originalExportedAt?: string;      // 原始导出时间（来自导出工具）
  personaId?: string;               // 使用的人格 ID
  model?: string;                   // 使用的 AI 模型
}
