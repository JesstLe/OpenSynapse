import { Note, ChatSession } from '../types';

export interface MCPRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: any;
}

export interface MCPResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
    additionalProperties?: boolean;
  };
}

export interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface MCPPrompt {
  name: string;
  description: string;
  arguments?: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface SaveContentRequest {
  type: 'note' | 'flashcard' | 'chat_session';
  data: Partial<Note> | {
    noteId: string;
    question: string;
    answer: string;
    nextReview: number;
  } | Partial<ChatSession>;
  tags?: string[];
  relatedIds?: string[];
  userId: string;
}

export interface ImportConversationRequest {
  fileContent: string;
  fileName: string;
  format: 'json' | 'markdown' | 'txt' | 'chatgpt' | 'gemini' | 'claude' | 'custom';
  characterMapping?: {
    user: string;
    assistant: string;
    system?: string;
  };
  userId: string;
  importNotes?: boolean;
  extractPrompts?: string[];
}

export interface ReviewQueryRequest {
  query: string;
  noteIds?: string[];
  maxResults?: number;
  userId: string;
  filters?: {
    tags?: string[];
    dateRange?: {
      start: number;
      end: number;
    };
    minRelevanceScore?: number;
  };
}

export interface SearchRequest {
  query: string;
  type: 'notes' | 'flashcards' | 'chat_sessions' | 'all';
  userId: string;
  filters?: {
    tags?: string[];
    dateRange?: {
      start: number;
      end: number;
    };
    maxResults?: number;
  };
  vectorSearch?: boolean;
}

export interface MCPSession {
  userId: string;
  sessionId: string;
  authContext?: {
    apiKey?: string;
    accessToken?: string;
    tokenType?: string;
    expiresAt?: number;
  };
  createdAt: number;
  lastActivity: number;
}

export interface SaveResult {
  success: boolean;
  id?: string;
  message?: string;
  error?: string;
}

export interface ImportResult {
  success: boolean;
  sessionId?: string;
  noteIds?: string[];
  flashcardIds?: string[];
  stats?: {
    totalMessages: number;
    importedSessions: number;
    importedNotes: number;
    importedFlashcards: number;
    skipped: number;
  };
  errors?: string[];
}

export interface ReviewResult {
  success: boolean;
  results: Array<{
    id: string;
    title?: string;
    content: string;
    relevanceScore: number;
    date: number;
    tags?: string[];
  }>;
  query?: string;
  totalResults: number;
  queryTime: number;
}

export interface SearchResult {
  success: boolean;
  results: Array<{
    id: string;
    type: 'note' | 'flashcard' | 'chat_session';
    title?: string;
    content: string;
    snippet: string;
    relevanceScore: number;
    date: number;
    tags?: string[];
  }>;
  query?: string;
  totalResults: number;
  queryTime: number;
}

export interface MCPServerConfig {
  name: string;
  version: string;
  description?: string;
  tools: MCPTool[];
  resources: MCPResource[];
  prompts: MCPPrompt[];
}

export interface ToolExecutionContext {
  toolName: string;
  arguments: any;
  session?: MCPSession;
  userId: string;
  timestamp: number;
}

export interface ResourceContext {
  uri: string;
  session?: MCPSession;
  userId: string;
  timestamp: number;
}

export enum MCPErrorCode {
  ParseError = -32700,
  InvalidRequest = -32600,
  MethodNotFound = -32601,
  InvalidParams = -32602,
  InternalError = -32603,
  MethodNotSupported = -32604,
  ResourceNotFound = -32004,
  PermissionDenied = -32005,
  RateLimitExceeded = -32006,
  AuthenticationRequired = -32007,
}

export interface MCPError {
  code: MCPErrorCode;
  message: string;
  data?: any;
}

export const createSuccessResponse = (id: string | number, result: any): MCPResponse => ({
  jsonrpc: '2.0',
  id,
  result,
});

export const createErrorResponse = (id: string | number, code: MCPErrorCode, message: string, data?: any): MCPResponse => ({
  jsonrpc: '2.0',
  id,
  error: {
    code,
    message,
    data,
  },
});

export const createToolResult = (success: boolean, data: any, message?: string, error?: string): SaveResult | ImportResult | ReviewResult | SearchResult => ({
  success,
  ...data,
  ...(message && { message }),
  ...(error && { error }),
});

export const validateToolArguments = (schema: any, args: any): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];
  
  if (schema.required) {
    for (const requiredField of schema.required) {
      if (!(requiredField in args)) {
        errors.push(`Missing required field: ${requiredField}`);
      }
    }
  }
  
  return { valid: errors.length === 0, errors };
};

export const validateSession = (session: MCPSession | undefined): boolean => {
  if (!session) return false;
  
  const now = Date.now();
  const isExpired = now - session.lastActivity > 24 * 60 * 60 * 1000;
  
  return !isExpired && !!session.userId;
};

export const sanitizeInput = (input: any): any => {
  if (typeof input === 'string') {
    return input.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  }
  return input;
};