import {
  AIProviderId,
  getApiModelId,
  getProviderForModel,
  parseModelSelection,
} from './aiModels.js';

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

function getRequiredApiKey(modelId: string): { provider: string; envVar: string; apiKey: string } {
  const provider = getProviderForModel(modelId);
  const envVar = provider.apiKeyEnvVar;
  const apiKey = envVar ? process.env[envVar]?.trim() : '';

  if (!envVar || !apiKey) {
    throw new Error(`当前模型需要配置 ${envVar || 'API Key'}。请在 .env.local 中设置后重启服务。`);
  }

  return { provider: provider.label, envVar, apiKey };
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

  if (
    blocks.length === 1 &&
    blocks[0].type === 'text' &&
    typeof blocks[0].text === 'string'
  ) {
    return blocks[0].text;
  }

  return blocks;
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
    if (config.responseSchema && typeof config.responseSchema === 'object') {
      body.response_format = {
        type: 'json_schema',
        json_schema: {
          name: 'opensynapse_structured_output',
          schema: config.responseSchema,
          strict: true,
        },
      };
    } else {
      body.response_format = { type: 'json_object' };
    }
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

function toProviderEndpoint(providerId: AIProviderId): string {
  const provider = getProviderForModel(`${providerId}/placeholder`);
  if (!provider.baseUrl) {
    throw new Error(`Provider ${provider.label} 未配置 API 基础地址。`);
  }
  return `${provider.baseUrl}/chat/completions`;
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

export async function generateContentWithApiKeyProvider(params: GatewayParams): Promise<GatewayTextResult> {
  const parsed = parseModelSelection(params.model);
  if (parsed.provider === 'gemini') {
    throw new Error('generateContentWithApiKeyProvider 不能处理 Gemini provider。');
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

  yield* streamChatCompletions(parsed.provider, parsed.canonicalId, buildChatCompletionsBody(params));
}
