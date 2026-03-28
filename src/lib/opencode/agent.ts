import { getOpenCodeClient } from './client';
import type { 
  SessionCreateData, 
  SessionPromptData,
  SessionStatusData 
} from '@opencode-ai/sdk';

/**
 * OpenCode Agent 服务
 * 封装常用的 Agent 操作
 */

export interface AgentOptions {
  model?: string;
  systemPrompt?: string;
  temperature?: number;
}

export interface AgentResponse {
  content: string;
  sessionId: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
  };
}

/**
 * 创建一个新的 Agent 会话
 */
export async function createAgentSession(
  name: string, 
  options?: AgentOptions
): Promise<string> {
  const oc = getOpenCodeClient();
  
  const result = await oc.session.create({
    body: {
      name,
      systemPrompt: options?.systemPrompt,
      model: options?.model,
      temperature: options?.temperature,
    } as SessionCreateData['body'],
  });

  if (!result.data?.id) {
    throw new Error('Failed to create agent session');
  }

  return result.data.id;
}

/**
 * 发送提示给 Agent
 */
export async function promptAgent(
  sessionId: string,
  prompt: string,
  options?: {
    async?: boolean;
    tools?: string[];
  }
): Promise<AgentResponse> {
  const oc = getOpenCodeClient();

  const result = await oc.session.prompt({
    body: {
      sessionId,
      prompt,
      async: options?.async ?? false,
      tools: options?.tools,
    } as SessionPromptData['body'],
  });

  if (!result.data) {
    throw new Error('Agent prompt failed');
  }

  return {
    content: result.data.content || '',
    sessionId,
    usage: result.data.usage,
  };
}

/**
 * 获取 Agent 会话状态
 */
export async function getAgentStatus(sessionId: string): Promise<{
  status: string;
  isActive: boolean;
}> {
  const oc = getOpenCodeClient();

  const result = await oc.session.status({
    query: { sessionId } as SessionStatusData['query'],
  });

  return {
    status: result.data?.status || 'unknown',
    isActive: result.data?.status === 'active',
  };
}

/**
 * 删除 Agent 会话
 */
export async function deleteAgentSession(sessionId: string): Promise<void> {
  const oc = getOpenCodeClient();

  await oc.session.delete({
    body: { sessionId } as { sessionId: string },
  });
}

/**
 * 运行一个完整的 Agent 任务（创建会话 → 发送提示 → 删除会话）
 */
export async function runAgentTask(
  name: string,
  prompt: string,
  options?: AgentOptions & { tools?: string[] }
): Promise<AgentResponse> {
  const sessionId = await createAgentSession(name, options);
  
  try {
    const response = await promptAgent(sessionId, prompt, {
      tools: options?.tools,
    });
    return response;
  } finally {
    await deleteAgentSession(sessionId);
  }
}
