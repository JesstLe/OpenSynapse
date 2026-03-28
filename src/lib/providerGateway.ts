import {
  AIProviderId,
  getApiModelId,
  getResolvedProviderConfig,
  parseModelSelection,
} from './aiModels.js';
import {
  getValidOpenAICodexSession,
  isOpenAICodexOAuthModel,
  refreshOpenAICodexSession,
} from './openaiCodexOAuth.js';

export type GatewayParams = {
  model: string;
  contents: unknown;
  config?: Record<string, unknown>;
};

export type GatewayTextResult = {
  text: string;
  raw: unknown;
};

export type GatewayStreamChunk = {
  text?: string;
  thought?: string;
};

type OpenAITextBlock = { type: 'text'; text: string };
type OpenAIImageBlock = { type: 'image_url'; image_url: { url: string } };
type OpenAIContentBlock = OpenAITextBlock | OpenAIImageBlock;

type OpenAICodexInputText = { type: 'input_text'; text: string };
type OpenAICodexInputImage = { type: 'input_image'; image_url: string };
type OpenAICodexInputBlock = OpenAICodexInputText | OpenAICodexInputImage;

function hasApiKey(modelId: string): boolean {
  const provider = getResolvedProviderConfig(modelId);
  const envVar = provider.apiKeyEnvVar;
  return Boolean(envVar && process.env[envVar]?.trim());
}

function getRequiredApiKey(modelId: string): { provider: string; envVar: string; apiKey: string } {
  const provider = getResolvedProviderConfig(modelId);
  const envVar = provider.apiKeyEnvVar;
  const apiKey = envVar ? process.env[envVar]?.trim() : '';

  if (!envVar || !apiKey) {
    throw new Error(`当前模型需要配置 ${envVar || 'API Key'}。请在设置页或 .env.local 中设置后重启服务。`);
  }

  return { provider: provider.label, envVar, apiKey };
}

function getOpenAIAuthorizationHint(modelId: string): string {
  const bareModel = getApiModelId(modelId);
  if (isOpenAICodexOAuthModel(modelId)) {
    return `当前 OpenAI 模型 ${bareModel} 支持 Codex OAuth 或 OPENAI_API_KEY。请先在设置页完成 OpenAI OAuth 登录，或配置 OPENAI_API_KEY。`;
  }

  return `当前 OpenAI 模型 ${bareModel} 需要 OPENAI_API_KEY；如果想使用 OAuth，请切换到 gpt-5.2 / gpt-5.1 / Codex 模型。`;
}

function toGeminiContentsArray(contents: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(contents)) {
    return contents as Array<Record<string, unknown>>;
  }

  if (typeof contents === 'string') {
    return [{ role: 'user', parts: [{ text: contents }] }];
  }

  if (contents && typeof contents === 'object' && 'parts' in (contents as Record<string, unknown>)) {
    return [contents as Record<string, unknown>];
  }

  return [{ role: 'user', parts: [{ text: String(contents ?? '') }] }];
}

function toOpenAIContent(parts: unknown[]): string | OpenAIContentBlock[] {
  const blocks: OpenAIContentBlock[] = (parts || [])
    .filter(Boolean)
    .flatMap<OpenAIContentBlock>((part) => {
      if (typeof part === 'string') {
        return [{ type: 'text', text: part }];
      }

      if (!part || typeof part !== 'object') {
        return [{ type: 'text', text: String(part ?? '') }];
      }

      const typedPart = part as Record<string, unknown>;
      if (typeof typedPart.text === 'string') {
        return [{ type: 'text', text: typedPart.text }];
      }

      if (typedPart.inlineData && typeof typedPart.inlineData === 'object') {
        const inlineData = typedPart.inlineData as Record<string, string>;
        const mimeType = inlineData.mimeType;
        const data = inlineData.data;
        if (mimeType && data) {
          return [{
            type: 'image_url',
            image_url: {
              url: `data:${mimeType};base64,${data}`,
            },
          }];
        }
      }

      return [];
    });

  if (blocks.length === 1 && blocks[0].type === 'text') {
    return blocks[0].text;
  }

  return blocks;
}

function toOpenAICodexContent(parts: unknown[]): OpenAICodexInputBlock[] {
  const blocks: OpenAICodexInputBlock[] = (parts || [])
    .filter(Boolean)
    .flatMap<OpenAICodexInputBlock>((part) => {
      if (typeof part === 'string') {
        return [{ type: 'input_text', text: part }];
      }

      if (!part || typeof part !== 'object') {
        return [{ type: 'input_text', text: String(part ?? '') }];
      }

      const typedPart = part as Record<string, unknown>;
      if (typeof typedPart.text === 'string') {
        return [{ type: 'input_text', text: typedPart.text }];
      }

      if (typedPart.inlineData && typeof typedPart.inlineData === 'object') {
        const inlineData = typedPart.inlineData as Record<string, string>;
        const mimeType = inlineData.mimeType;
        const data = inlineData.data;
        if (mimeType && data) {
          return [{ type: 'input_image', image_url: `data:${mimeType};base64,${data}` }];
        }
      }

      return [];
    });

  return blocks.length > 0 ? blocks : [{ type: 'input_text', text: '' }];
}

function toOpenAICompatibleMessages(params: GatewayParams): Array<Record<string, unknown>> {
  const messages: Array<Record<string, unknown>> = [];
  const systemInstruction = params.config?.systemInstruction;

  if (typeof systemInstruction === 'string' && systemInstruction.trim()) {
    messages.push({
      role: 'system',
      content: systemInstruction,
    });
  }

  for (const content of toGeminiContentsArray(params.contents)) {
    const typedContent = content as { role?: string; parts?: unknown[] };
    messages.push({
      role: typedContent.role === 'model' ? 'assistant' : (typedContent.role || 'user'),
      content: toOpenAIContent(Array.isArray(typedContent.parts) ? typedContent.parts : []),
    });
  }

  return messages;
}

function toOpenAICodexInput(params: GatewayParams): Array<Record<string, unknown>> {
  return toGeminiContentsArray(params.contents).map((content) => {
    const typedContent = content as { role?: string; parts?: unknown[] };
    const role = typedContent.role === 'model'
      ? 'assistant'
      : typedContent.role === 'system'
        ? 'developer'
        : (typedContent.role || 'user');

    return {
      type: 'message',
      role,
      content: toOpenAICodexContent(Array.isArray(typedContent.parts) ? typedContent.parts : []),
    };
  });
}

function appendJsonInstruction(baseInstruction: string, responseSchema?: unknown): string {
  if (responseSchema && typeof responseSchema === 'object') {
    return `${baseInstruction}\n\n请仅输出一个合法 JSON 对象，并严格符合以下 schema：\n${JSON.stringify(responseSchema, null, 2)}`;
  }
  return `${baseInstruction}\n\n请仅输出一个合法 JSON 对象，不要添加额外解释。`;
}

function buildOpenAICodexInstructions(params: GatewayParams): string {
  let instructions = typeof params.config?.systemInstruction === 'string' && params.config.systemInstruction.trim()
    ? params.config.systemInstruction.trim()
    : 'You are a helpful assistant. Follow the user instructions carefully.';

  if (params.config?.responseMimeType === 'application/json') {
    instructions = appendJsonInstruction(instructions, params.config?.responseSchema);
  }

  return instructions;
}

function buildOpenAICodexBody(params: GatewayParams): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: getApiModelId(params.model),
    instructions: buildOpenAICodexInstructions(params),
    input: toOpenAICodexInput(params),
    store: false,
    stream: true,
    reasoning: { effort: 'medium', summary: 'auto' },
    text: { verbosity: 'medium', format: { type: 'text' } },
    include: ['reasoning.encrypted_content'],
  };

  if (typeof params.config?.temperature === 'number') body.temperature = params.config.temperature;
  if (typeof params.config?.topP === 'number') body.top_p = params.config.topP;
  if (typeof params.config?.maxOutputTokens === 'number') body.max_output_tokens = params.config.maxOutputTokens;

  return body;
}

// 将 Google GenAI Type 枚举转换为标准 JSON Schema 类型
// Google GenAI 使用 Type.OBJECT, Type.STRING 等枚举，而 OpenAI 兼容 API 需要 "object", "string" 等字符串
function convertGoogleGenAISchemaToStandard(schema: unknown): unknown {
  if (schema === null || typeof schema !== 'object') {
    return schema;
  }

  if (Array.isArray(schema)) {
    return schema.map(item => convertGoogleGenAISchemaToStandard(item));
  }

  const result: Record<string, unknown> = {};
  const typedSchema = schema as Record<string, unknown>;

  for (const [key, value] of Object.entries(typedSchema)) {
    if (key === 'type' && typeof value === 'number') {
      // Google GenAI Type 枚举值转换为标准 JSON Schema 类型字符串
      // Type.OBJECT = 1, Type.STRING = 2, Type.ARRAY = 3, etc.
      const typeMapping: Record<number, string> = {
        1: 'object',
        2: 'string',
        3: 'array',
        4: 'number',
        5: 'integer',
        6: 'boolean',
        7: 'null',
      };
      result[key] = typeMapping[value] ?? 'string';
    } else if (key === 'items' || key === 'properties' || key === 'additionalProperties') {
      result[key] = convertGoogleGenAISchemaToStandard(value);
    } else if (key === 'required' && Array.isArray(value)) {
      result[key] = value;
    } else {
      result[key] = value;
    }
  }

  return result;
}

function buildChatCompletionsBody(params: GatewayParams) {
  const body: Record<string, unknown> = {
    model: getApiModelId(params.model),
    messages: toOpenAICompatibleMessages(params),
  };

  const config = params.config || {};
  if (typeof config.temperature === 'number') body.temperature = config.temperature;
  if (typeof config.topP === 'number') body.top_p = config.topP;
  if (typeof config.maxOutputTokens === 'number') body.max_tokens = config.maxOutputTokens;
  if (Array.isArray(config.stopSequences) && config.stopSequences.length > 0) body.stop = config.stopSequences;

  if (config.responseMimeType === 'application/json') {
    // 对于 OpenAI 兼容 API，使用 json_object 类型而不是复杂的 json_schema
    // 因为并非所有提供商（如智谱）都支持严格的 json_schema 格式
    body.response_format = { type: 'json_object' };
  }

  return body;
}

function buildAnthropicBody(params: GatewayParams) {
  const body: Record<string, unknown> = {
    model: getApiModelId(params.model),
    max_tokens: typeof params.config?.maxOutputTokens === 'number' ? params.config.maxOutputTokens : 4096,
    messages: toOpenAICompatibleMessages(params).filter((message) => message.role !== 'system'),
  };

  if (typeof params.config?.systemInstruction === 'string' && params.config.systemInstruction.trim()) {
    body.system = params.config.systemInstruction;
  }

  if (typeof params.config?.temperature === 'number') body.temperature = params.config.temperature;
  if (typeof params.config?.topP === 'number') body.top_p = params.config.topP;
  if (Array.isArray(params.config?.stopSequences) && params.config.stopSequences.length > 0) {
    body.stop_sequences = params.config.stopSequences;
  }

  if (params.config?.responseMimeType === 'application/json') {
    body.metadata = { expected_format: 'json' };
  }

  return body;
}

function extractChatCompletionText(payload: any): string {
  const message = payload?.choices?.[0]?.message;
  if (!message) return '';

  if (typeof message.content === 'string') {
    return message.content;
  }

  if (Array.isArray(message.content)) {
    return message.content
      .map((item: any) => {
        if (typeof item === 'string') return item;
        if (typeof item?.text === 'string') return item.text;
        if (typeof item?.content === 'string') return item.content;
        return '';
      })
      .join('');
  }

  return '';
}

function extractAnthropicText(payload: any): string {
  const content = payload?.content;
  if (!Array.isArray(content)) return '';

  return content
    .map((item: any) => (typeof item?.text === 'string' ? item.text : ''))
    .join('');
}

function extractOpenAICodexText(payload: any): string {
  const completed = payload?.response ?? payload;
  const output = completed?.output;
  if (!Array.isArray(output)) return '';

  return output
    .flatMap((item: any) => Array.isArray(item?.content) ? item.content : [])
    .map((content: any) => (typeof content?.text === 'string' ? content.text : ''))
    .filter(Boolean)
    .join('');
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function trimLeadingSlash(value: string): string {
  return value.replace(/^\/+/, '');
}

function joinUrl(baseUrl: string, path: string): string {
  return `${trimTrailingSlash(baseUrl)}/${trimLeadingSlash(path)}`;
}

function toProviderEndpoint(providerId: AIProviderId): string {
  const provider = getResolvedProviderConfig(`${providerId}/placeholder`);
  if (!provider.baseUrl) {
    throw new Error(`Provider ${provider.label} 未配置 API 基础地址。`);
  }

  if (provider.protocol === 'anthropic_compat') {
    return joinUrl(provider.baseUrl, '/v1/messages');
  }

  return joinUrl(provider.baseUrl, '/chat/completions');
}

function parseApiErrorText(status: number, statusText: string, errorText: string): never {
  throw new Error(`${status} ${statusText} - ${errorText}`);
}

async function requestChatCompletions(
  providerId: AIProviderId,
  modelId: string,
  body: Record<string, unknown>
): Promise<GatewayTextResult> {
  const { apiKey } = getRequiredApiKey(modelId);
  const response = await fetch(toProviderEndpoint(providerId), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    parseApiErrorText(response.status, response.statusText, await response.text());
  }

  const payload = await response.json();
  return {
    text: extractChatCompletionText(payload),
    raw: payload,
  };
}

async function requestAnthropicCompletions(
  providerId: AIProviderId,
  modelId: string,
  body: Record<string, unknown>
): Promise<GatewayTextResult> {
  const { apiKey } = getRequiredApiKey(modelId);
  const response = await fetch(toProviderEndpoint(providerId), {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    parseApiErrorText(response.status, response.statusText, await response.text());
  }

  const payload = await response.json();
  return {
    text: extractAnthropicText(payload),
    raw: payload,
  };
}

async function fetchOpenAICodexResponse(body: Record<string, unknown>) {
  let session = await getValidOpenAICodexSession();
  if (!session) {
    return null;
  }

  const doRequest = async (accessToken: string, accountId: string) => fetch('https://chatgpt.com/backend-api/codex/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'chatgpt-account-id': accountId,
      'OpenAI-Beta': 'responses=experimental',
      originator: 'codex_cli_rs',
      accept: 'text/event-stream',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  let response = await doRequest(session.accessToken, session.accountId);
  if ((response.status === 401 || response.status === 403) && session.refreshToken) {
    session = await refreshOpenAICodexSession(session);
    response = await doRequest(session.accessToken, session.accountId);
  }

  return response;
}

function shouldUseOpenAICodexOAuth(modelId: string): boolean {
  return isOpenAICodexOAuthModel(modelId);
}

function isOpenAICodexFallbackCandidate(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return message.includes('404') || message.includes('Not Found') || message.includes('No capacity available');
}

async function requestOpenAICodexCompletions(params: GatewayParams): Promise<GatewayTextResult> {
  const body = buildOpenAICodexBody(params);
  const response = await fetchOpenAICodexResponse(body);

  if (!response) {
    throw new Error(getOpenAIAuthorizationHint(params.model));
  }

  if (!response.ok) {
    parseApiErrorText(response.status, response.statusText, await response.text());
  }

  const rawText = await response.text();
  let aggregatedText = '';
  let completedPayload: any = null;

  for (const line of rawText.split('\n')) {
    if (!line.startsWith('data: ')) continue;
    const data = line.slice(6).trim();
    if (!data || data === '[DONE]') continue;

    try {
      const payload = JSON.parse(data);
      if (payload?.type === 'response.output_text.delta' && typeof payload.delta === 'string') {
        aggregatedText += payload.delta;
      }
      if (payload?.type === 'response.completed' || payload?.type === 'response.done') {
        completedPayload = payload.response ?? payload;
      }
    } catch {
      // Ignore malformed SSE frames.
    }
  }

  return {
    text: extractOpenAICodexText(completedPayload) || aggregatedText,
    raw: completedPayload ?? rawText,
  };
}

async function* streamChatCompletions(
  providerId: AIProviderId,
  modelId: string,
  body: Record<string, unknown>
): AsyncGenerator<GatewayStreamChunk> {
  const { apiKey } = getRequiredApiKey(modelId);
  const response = await fetch(toProviderEndpoint(providerId), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ...body, stream: true }),
  });

  if (!response.ok) {
    parseApiErrorText(response.status, response.statusText, await response.text());
  }

  const reader = response.body?.getReader();
  if (!reader) {
    const fallback = await requestChatCompletions(providerId, modelId, body);
    if (fallback.text) {
      yield { text: fallback.text };
    }
    return;
  }

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
      if (!data || data === '[DONE]') continue;

      try {
        const payload = JSON.parse(data);
        const delta = payload?.choices?.[0]?.delta;
        if (!delta) continue;

        if (typeof delta.reasoning_content === 'string' && delta.reasoning_content) {
          yield { thought: delta.reasoning_content };
        }

        if (typeof delta.content === 'string' && delta.content) {
          yield { text: delta.content };
        } else if (Array.isArray(delta.content)) {
          for (const item of delta.content) {
            if (typeof item?.text === 'string' && item.text) {
              yield { text: item.text };
            }
          }
        }
      } catch {
        // Ignore malformed SSE frames from compatible providers.
      }
    }
  }
}

async function* streamAnthropicCompletions(
  providerId: AIProviderId,
  modelId: string,
  body: Record<string, unknown>
): AsyncGenerator<GatewayStreamChunk> {
  const { apiKey } = getRequiredApiKey(modelId);
  const response = await fetch(toProviderEndpoint(providerId), {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ...body, stream: true }),
  });

  if (!response.ok) {
    parseApiErrorText(response.status, response.statusText, await response.text());
  }

  const reader = response.body?.getReader();
  if (!reader) {
    const fallback = await requestAnthropicCompletions(providerId, modelId, body);
    if (fallback.text) {
      yield { text: fallback.text };
    }
    return;
  }

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
      if (!data || data === '[DONE]') continue;

      try {
        const payload = JSON.parse(data);
        if (typeof payload?.delta?.text === 'string' && payload.delta.text) {
          yield { text: payload.delta.text };
        }
      } catch {
        // Ignore malformed SSE frames.
      }
    }
  }
}

async function* streamOpenAICodexCompletions(params: GatewayParams): AsyncGenerator<GatewayStreamChunk> {
  const body = buildOpenAICodexBody(params);
  const response = await fetchOpenAICodexResponse(body);

  if (!response) {
    throw new Error(getOpenAIAuthorizationHint(params.model));
  }

  if (!response.ok) {
    parseApiErrorText(response.status, response.statusText, await response.text());
  }

  const reader = response.body?.getReader();
  if (!reader) {
    const fallback = await requestOpenAICodexCompletions(params);
    if (fallback.text) {
      yield { text: fallback.text };
    }
    return;
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let finalText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (!data || data === '[DONE]') continue;

      try {
        const payload = JSON.parse(data);
        if (payload?.type === 'response.output_text.delta' && typeof payload.delta === 'string') {
          finalText += payload.delta;
          yield { text: payload.delta };
          continue;
        }

        if ((payload?.type === 'response.completed' || payload?.type === 'response.done') && !finalText) {
          const completedText = extractOpenAICodexText(payload);
          if (completedText) {
            finalText = completedText;
            yield { text: completedText };
          }
        }
      } catch {
        // Ignore malformed SSE frames.
      }
    }
  }
}

export async function generateContentWithApiKeyProvider(params: GatewayParams): Promise<GatewayTextResult> {
  const parsed = parseModelSelection(params.model);
  if (parsed.provider === 'gemini') {
    throw new Error('generateContentWithApiKeyProvider 不能处理 Gemini provider。');
  }

  if (parsed.provider === 'openai') {
    if (shouldUseOpenAICodexOAuth(parsed.canonicalId)) {
      try {
        return await requestOpenAICodexCompletions({ ...params, model: parsed.canonicalId });
      } catch (error) {
        if (!hasApiKey(parsed.canonicalId)) {
          throw error;
        }
        if (!isOpenAICodexFallbackCandidate(error)) {
          throw error;
        }
      }
    } else if (!hasApiKey(parsed.canonicalId)) {
      throw new Error(getOpenAIAuthorizationHint(parsed.canonicalId));
    }
  }

  const provider = getResolvedProviderConfig(parsed.canonicalId);
  if (provider.protocol === 'anthropic_compat') {
    return requestAnthropicCompletions(parsed.provider, parsed.canonicalId, buildAnthropicBody(params));
  }

  return requestChatCompletions(parsed.provider, parsed.canonicalId, buildChatCompletionsBody(params));
}

export async function* generateContentStreamWithApiKeyProvider(
  params: GatewayParams
): AsyncGenerator<GatewayStreamChunk> {
  const parsed = parseModelSelection(params.model);
  if (parsed.provider === 'gemini') {
    throw new Error('generateContentStreamWithApiKeyProvider 不能处理 Gemini provider。');
  }

  if (parsed.provider === 'openai') {
    if (shouldUseOpenAICodexOAuth(parsed.canonicalId)) {
      try {
        yield* streamOpenAICodexCompletions({ ...params, model: parsed.canonicalId });
        return;
      } catch (error) {
        if (!hasApiKey(parsed.canonicalId)) {
          throw error;
        }
        if (!isOpenAICodexFallbackCandidate(error)) {
          throw error;
        }
      }
    } else if (!hasApiKey(parsed.canonicalId)) {
      throw new Error(getOpenAIAuthorizationHint(parsed.canonicalId));
    }
  }

  const provider = getResolvedProviderConfig(parsed.canonicalId);
  if (provider.protocol === 'anthropic_compat') {
    yield* streamAnthropicCompletions(parsed.provider, parsed.canonicalId, buildAnthropicBody(params));
    return;
  }

  yield* streamChatCompletions(parsed.provider, parsed.canonicalId, buildChatCompletionsBody(params));
}

export type EmbedContentResult = {
  embeddings: Array<{ values: number[] }>;
};

function toEmbeddingEndpoint(providerId: AIProviderId): string {
  const provider = getResolvedProviderConfig(`${providerId}/placeholder`);
  if (!provider.baseUrl) {
    throw new Error(`Provider ${provider.label} 未配置 API 基础地址，无法调用 embedding。`);
  }
  return joinUrl(provider.baseUrl, '/embeddings');
}

export async function embedContentWithApiKeyProvider(params: {
  model: string;
  contents: string[];
}): Promise<EmbedContentResult> {
  const parsed = parseModelSelection(params.model);
  if (parsed.provider === 'gemini') {
    throw new Error('embedContentWithApiKeyProvider 不能处理 Gemini provider，请使用 Gemini SDK。');
  }

  const provider = getResolvedProviderConfig(parsed.canonicalId);
  if (provider.protocol !== 'openai_compat') {
    throw new Error(
      `Provider ${provider.label} 使用 ${provider.protocol} 协议，暂不支持 embedding。` +
      `仅 openai_compat 协议提供商（OpenAI、智谱等）支持 embedding。`
    );
  }

  const { apiKey } = getRequiredApiKey(parsed.canonicalId);
  const bareModel = getApiModelId(parsed.canonicalId);
  const endpoint = toEmbeddingEndpoint(parsed.provider);

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: bareModel,
      input: params.contents,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Embedding 请求失败 (${parsed.provider}/${bareModel}): ` +
      `${response.status} ${response.statusText} - ${errorText}`
    );
  }

  const payload = await response.json();
  const dataItems = payload?.data;
  if (!Array.isArray(dataItems) || dataItems.length === 0) {
    throw new Error(
      `Embedding 响应格式异常：未返回 data 数组。provider=${parsed.provider} model=${bareModel}`
    );
  }

  const embeddings = dataItems.map((item: { embedding?: number[] }) => ({
    values: Array.isArray(item.embedding) ? item.embedding : [],
  }));

  return { embeddings };
}
