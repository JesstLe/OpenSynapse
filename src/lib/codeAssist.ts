import crypto from 'node:crypto';
import {
  type OAuthClientConfig,
  OAUTH_CONFIG,
  getValidCredentials,
} from './oauth.js';

type GenerateContentParams = {
  model: string;
  contents: any;
  config?: any;
};

type GenerateContentResult = {
  text: string;
  raw: any;
};

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
  };
}

function maybeToContent(content: unknown): Record<string, unknown> | undefined {
  if (!content) {
    return undefined;
  }
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
  if (Array.isArray(contents)) {
    return contents.map(toContent);
  }

  return [toContent(contents)];
}

function toContent(content: any): Record<string, unknown> {
  if (Array.isArray(content)) {
    return {
      role: 'user',
      parts: toParts(content),
    };
  }

  if (typeof content === 'string') {
    return {
      role: 'user',
      parts: [{ text: content }],
    };
  }

  if (!isPart(content)) {
    return {
      ...content,
      parts: Array.isArray(content.parts) ? toParts(content.parts.filter(Boolean)) : [],
    };
  }

  return {
    role: 'user',
    parts: [toPart(content)],
  };
}

function toParts(parts: any[]): Array<Record<string, unknown>> {
  return parts.map(toPart);
}

function toPart(part: any): Record<string, unknown> {
  if (typeof part === 'string') {
    return { text: part };
  }

  if ('thought' in part && part.thought) {
    const nextPart = { ...part };
    delete nextPart.thought;
    const hasApiContent =
      'functionCall' in nextPart ||
      'functionResponse' in nextPart ||
      'inlineData' in nextPart ||
      'fileData' in nextPart;

    if (hasApiContent) {
      return nextPart;
    }

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
  if (!config) {
    return undefined;
  }

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

function extractResponseText(payload: any): string {
  const candidates = payload?.response?.candidates;
  if (!Array.isArray(candidates)) {
    return '';
  }

  return candidates
    .flatMap((candidate: any) => candidate?.content?.parts ?? [])
    .map((part: any) => (typeof part?.text === 'string' ? part.text : ''))
    .join('');
}

export async function generateContentWithCodeAssist(
  params: GenerateContentParams,
  clientConfig: OAuthClientConfig
): Promise<GenerateContentResult> {
  const credentials = await getValidCredentials(clientConfig.clientId, clientConfig.clientSecret);
  if (!credentials.project_id) {
    throw new Error('当前凭证缺少 Code Assist project，请重新运行 "npx tsx cli.ts auth login"。');
  }

  const response = await fetch(`${OAUTH_CONFIG.CODE_ASSIST_ENDPOINT}/v1internal:generateContent`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${credentials.access_token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'google-api-nodejs-client/9.15.1',
      'X-Goog-Api-Client': 'gl-node/opensynapse-cli',
    },
    body: JSON.stringify(toGenerateContentRequest(params, credentials.project_id)),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Code Assist request failed: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const payload = await response.json();
  return {
    text: extractResponseText(payload),
    raw: payload,
  };
}
