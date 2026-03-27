import crypto from 'node:crypto';
import os from 'node:os';
import {
  type OAuthClientConfig,
  OAUTH_CONFIG,
  getValidCredentials,
} from './oauth.js';
import { getFallbackModels } from './aiModels.js';

// ─── 类型定义 ───

type GenerateContentParams = {
  model: string;
  contents: any;
  config?: any;
};

type GenerateContentResult = {
  text: string;
  raw: any;
};

// 流式 chunk 的结构化类型：区分正文和思考过程
export type StreamChunk = {
  text?: string;
  thought?: string;
};

// ─── 请求构造 ───

function toGenerateContentRequest(
  params: GenerateContentParams,
  projectId: string
): Record<string, unknown> {
  return {
    model: params.model,
    project: projectId,
    user_prompt_id: crypto.randomUUID(),
    request: {
      contents: toContents(params.contents),
      systemInstruction: maybeToContent(params.config?.systemInstruction),
      cachedContent: params.config?.cachedContent,
      tools: params.config?.tools,
      toolConfig: params.config?.toolConfig,
      labels: params.config?.labels,
      safetySettings: params.config?.safetySettings,
      generationConfig: toGenerationConfig(params.config),
      session_id: '',
    },
    // 官方 CLI billing.js 中确认：G1_CREDIT_TYPE = 'GOOGLE_ONE_AI'
    enabled_credit_types: ['GOOGLE_ONE_AI'],
  };
}

// ─── 内容转换工具 ───

function maybeToContent(content: unknown): Record<string, unknown> | undefined {
  if (!content) return undefined;
  return toContent(content);
}

function isPart(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    !('parts' in value) &&
    !('role' in value)
  );
}

function toContents(contents: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(contents)) return contents.map(toContent);
  return [toContent(contents)];
}

function toContent(content: any): Record<string, unknown> {
  if (Array.isArray(content)) {
    return { role: 'user', parts: toParts(content) };
  }
  if (typeof content === 'string') {
    return { role: 'user', parts: [{ text: content }] };
  }
  if (!isPart(content)) {
    return {
      ...content,
      parts: Array.isArray(content.parts) ? toParts(content.parts.filter(Boolean)) : [],
    };
  }
  return { role: 'user', parts: [toPart(content)] };
}

function toParts(parts: any[]): Array<Record<string, unknown>> {
  return parts.map(toPart);
}

function toPart(part: any): Record<string, unknown> {
  if (typeof part === 'string') return { text: part };

  // 处理思考 part（用于 countTokens 等 API 的兼容）
  if ('thought' in part && part.thought) {
    const nextPart = { ...part };
    delete nextPart.thought;
    const hasApiContent =
      'functionCall' in nextPart ||
      'functionResponse' in nextPart ||
      'inlineData' in nextPart ||
      'fileData' in nextPart;

    if (hasApiContent) return nextPart;

    const thoughtText = `[Thought: ${part.thought}]`;
    const existingText = nextPart.text ? String(nextPart.text) : '';
    return {
      ...nextPart,
      text: existingText ? `${existingText}\n${thoughtText}` : thoughtText,
    };
  }

  return part;
}

function toGenerationConfig(config: any): Record<string, unknown> | undefined {
  if (!config) return undefined;
  return {
    temperature: config.temperature,
    topP: config.topP,
    topK: config.topK,
    candidateCount: config.candidateCount,
    maxOutputTokens: config.maxOutputTokens,
    stopSequences: config.stopSequences,
    responseLogprobs: config.responseLogprobs,
    logprobs: config.logprobs,
    presencePenalty: config.presencePenalty,
    frequencyPenalty: config.frequencyPenalty,
    seed: config.seed,
    responseMimeType: config.responseMimeType,
    responseSchema: config.responseSchema,
    responseJsonSchema: config.responseJsonSchema,
    routingConfig: config.routingConfig,
    modelSelectionConfig: config.modelSelectionConfig,
    responseModalities: config.responseModalities,
    mediaResolution: config.mediaResolution,
    speechConfig: config.speechConfig,
    audioTimestamp: config.audioTimestamp,
    thinkingConfig: config.thinkingConfig,
  };
}

// ─── 公共工具函数 ───

/** 动态构建请求头，模拟官方 Gemini CLI 的头部 */
function buildHeaders(accessToken: string, modelId: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'User-Agent': `GeminiCLI/0.35.2/${modelId} (${os.platform()}; ${os.arch()}) google-api-nodejs-client/9.15.1`,
    'X-Goog-Api-Client': 'gl-node/24.12.0',
  };
}

/** 判断是否为 429 容量耗尽错误 */
function is429CapacityError(status: number, text: string): boolean {
  return (
    status === 429 &&
    (text.includes('MODEL_CAPACITY_EXHAUSTED') ||
      text.includes('No capacity available for model') ||
      text.includes('rateLimitExceeded') ||
      text.includes('RATE_LIMIT_EXCEEDED'))
  );
}

/** 判断是否为 404 模型不存在错误 */
function is404NotFound(status: number, text: string): boolean {
  return status === 404 || text.includes('"status": "NOT_FOUND"');
}

/** 指数退避延迟 */
async function exponentialDelay(attempt: number): Promise<void> {
  const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
  console.warn(`[CodeAssist] 第 ${attempt} 次重试，延迟 ${Math.round(delay)}ms...`);
  await new Promise((r) => setTimeout(r, delay));
}

// ─── 响应解析 ───

/** 从非流式响应中提取纯文本 */
function extractResponseText(payload: any): string {
  const candidates = payload?.response?.candidates;
  if (!Array.isArray(candidates)) return '';
  return candidates
    .flatMap((candidate: any) => candidate?.content?.parts ?? [])
    .map((part: any) => (typeof part?.text === 'string' ? part.text : ''))
    .join('');
}

/** 从 SSE 流中解析结构化 chunk（区分正文和思考） */
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
            // thought 为 true 的 part 是思考内容
            if (part.thought && part.text) {
              yield { thought: part.text };
            } else if (part.text) {
              yield { text: part.text };
            }
          }
        }
      } catch {
        // 跳过无法解析的 SSE 行
      }
    }
  }
}

// ─── 非流式 API（保留用于 JSON 结构化输出等场景） ───

export async function generateContentWithCodeAssist(
  params: GenerateContentParams,
  clientConfig: OAuthClientConfig
): Promise<GenerateContentResult> {
  const credentials = await getValidCredentials(clientConfig.clientId, clientConfig.clientSecret);
  if (!credentials.project_id) {
    throw new Error('当前凭证缺少 Code Assist project，请重新运行 "npx tsx cli.ts auth login"。');
  }

  const candidateModels = [params.model, ...getFallbackModels(params.model)];
  let lastErrorMessage = '';
  let payload: any = null;

  for (let index = 0; index < candidateModels.length; index += 1) {
    const modelId = candidateModels[index];
    const requestBody = {
      ...toGenerateContentRequest(params, credentials.project_id),
      model: modelId,
    };
    const headers = buildHeaders(credentials.access_token, modelId);

    const maxRetries = 3;
    let attempt = 0;

    while (attempt <= maxRetries) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000);

        const response = await fetch(
          `${OAUTH_CONFIG.CODE_ASSIST_ENDPOINT}/v1internal:generateContent`,
          { method: 'POST', headers, body: JSON.stringify(requestBody), signal: controller.signal }
        );

        clearTimeout(timeoutId);

        if (response.ok) {
          payload = await response.json();
          break;
        }

        const errorText = await response.text();
        const isCapacity = is429CapacityError(response.status, errorText);
        const isTransient = response.status >= 500 || isCapacity;

        if (isTransient && attempt < maxRetries) {
          attempt += 1;
          await exponentialDelay(attempt);
          continue;
        }

        lastErrorMessage = `Code Assist request failed: ${response.status} ${response.statusText} - ${errorText}`;
        const isNotFound = is404NotFound(response.status, errorText);
        const hasNextFallback = index < candidateModels.length - 1;

        if ((isCapacity || isNotFound) && hasNextFallback) {
          console.warn(`[CodeAssist] ${modelId} 不可用，切换到 ${candidateModels[index + 1]}`);
          break;
        }

        throw new Error(lastErrorMessage);
      } catch (err: any) {
        if (err.name === 'AbortError') {
          console.error(`[CodeAssist] ${modelId} 请求超时`);
        }
        if (attempt >= maxRetries) throw err;
        attempt += 1;
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    if (payload) break;
  }

  if (!payload) {
    throw new Error(lastErrorMessage || 'Code Assist request failed without response payload.');
  }

  return { text: extractResponseText(payload), raw: payload };
}

// ─── 流式 API（带模型 fallback + 思考 chunk 解析） ───

export async function* generateContentStreamWithCodeAssist(
  params: GenerateContentParams,
  clientConfig: OAuthClientConfig
): AsyncGenerator<StreamChunk> {
  const credentials = await getValidCredentials(clientConfig.clientId, clientConfig.clientSecret);
  if (!credentials.project_id) {
    throw new Error('当前凭证缺少 Code Assist project，请重新运行 "npx tsx cli.ts auth login"。');
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
          // 容量耗尽或 404：尝试下一个 fallback 模型
          if ((isCapacity || isNotFound) && index < candidateModels.length - 1) {
            console.warn(`[CodeAssist] ${modelId} 不可用，切换到 ${candidateModels[index + 1]}`);
            break;
          }
          throw new Error(`Stream request failed: ${response.status} - ${errorText}`);
        }

        // 成功——解析 SSE 流
        yield* parseSSEStream(response);
        succeeded = true;
        break;
      } catch (err: any) {
        if (err.name === 'AbortError') throw err; // 用户主动取消，直接抛出
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

  throw new Error('所有候选模型均不可用，请稍后重试或切换模型。');
}
