/**
 * Agent 架构核心类型定义
 * 定义 Agent、Tool、State 等核心接口
 */

// ─── Tool 系统 ───

export interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description: string;
  required?: boolean;
  enum?: string[];
}

export interface Tool {
  name: string;
  description: string;
  parameters: ToolParameter[];
  execute: (params: Record<string, any>, context: ToolContext) => Promise<ToolResult>;
}

export interface ToolContext {
  agentId: string;
  sessionId: string;
  state: AgentState;
  llm: LLMClient;
}

export interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
  observations?: string[];
}

// ─── LLM 客户端 ───

export interface LLMClient {
  generate: (params: LLMParams) => Promise<LLMResponse>;
  generateStream: (params: LLMParams) => AsyncGenerator<LLMStreamChunk>;
}

export interface LLMParams {
  prompt: string;
  systemPrompt?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  tools?: Tool[];
}

export interface LLMResponse {
  content: string;
  toolCalls?: ToolCall[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
  };
}

export interface LLMStreamChunk {
  content?: string;
  toolCall?: ToolCall;
  done: boolean;
}

export interface ToolCall {
  name: string;
  arguments: Record<string, any>;
}

// ─── Agent 状态 ───

export interface AgentState {
  [key: string]: any;
}

export interface AgentMemory {
  shortTerm: string[];
  longTerm?: string[];
  workingMemory?: Record<string, any>;
}

// ─── Agent 配置 ───

export interface AgentConfig {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  tools: Tool[];
  maxIterations?: number;
  model?: string;
  temperature?: number;
}

// ─── Agent 运行结果 ───

export interface AgentRunResult {
  success: boolean;
  output: string;
  finalState: AgentState;
  toolCalls: ToolCallRecord[];
  iterations: number;
  error?: string;
}

export interface ToolCallRecord {
  tool: string;
  input: Record<string, any>;
  output: ToolResult;
  timestamp: number;
}

// ─── 事件系统 ───

export type AgentEventType = 
  | 'agent:start'
  | 'agent:thinking'
  | 'agent:tool_call'
  | 'agent:tool_result'
  | 'agent:complete'
  | 'agent:error';

export interface AgentEvent {
  type: AgentEventType;
  agentId: string;
  sessionId: string;
  data: any;
  timestamp: number;
}

export type AgentEventHandler = (event: AgentEvent) => void;
