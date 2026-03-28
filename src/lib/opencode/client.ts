import { createOpencodeClient, OpencodeClient, type OpencodeClientConfig } from '@opencode-ai/sdk';

let client: OpencodeClient | null = null;

export interface OpenCodeConfig extends OpencodeClientConfig {
  baseUrl?: string;
}

export function getOpenCodeClient(config?: OpenCodeConfig): OpencodeClient {
  if (client) return client;

  client = createOpencodeClient({
    baseUrl: config?.baseUrl || process.env.OPENCODE_BASE_URL,
  });

  return client;
}

export function resetOpenCodeClient(): void {
  client = null;
}

export async function isOpenCodeAvailable(): Promise<boolean> {
  try {
    const oc = getOpenCodeClient();
    await oc.config.get();
    return true;
  } catch {
    return false;
  }
}
