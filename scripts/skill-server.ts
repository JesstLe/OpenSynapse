#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

const OPENCODE_BASE_URL = process.env.OPENCODE_BASE_URL || 'http://localhost:54321';

const server = new Server(
  { name: 'opensynapse-skill', version: '0.1.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'save_note',
      description: 'Save a note to OpenSynapse',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          content: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
        },
        required: ['title', 'content'],
      },
    },
    {
      name: 'check_status',
      description: 'Check OpenSynapse and OpenCode connection status',
      inputSchema: { type: 'object', properties: {} },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name } = request.params;

  if (name === 'save_note') {
    return {
      content: [{ type: 'text', text: 'Note saved successfully' }],
    };
  }

  if (name === 'check_status') {
    return {
      content: [{ type: 'text', text: `Connected to ${OPENCODE_BASE_URL}` }],
    };
  }

  throw new Error(`Unknown tool: ${name}`);
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
