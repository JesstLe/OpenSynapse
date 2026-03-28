#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { ObsidianIntegration } from '../src/lib/obsidian/integration.js';

const OPENCODE_BASE_URL = process.env.OPENCODE_BASE_URL || 'http://localhost:54321';
const OBSIDIAN_VAULT_PATH = process.env.OBSIDIAN_VAULT_PATH;

const server = new Server(
  { name: 'opensynapse-skill', version: '0.1.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'save_to_opensynapse',
      description: 'Save a note to Obsidian vault via OpenSynapse',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Note title' },
          content: { type: 'string', description: 'Note content in markdown' },
          tags: { type: 'array', items: { type: 'string' }, description: 'Tags' },
          vaultPath: { type: 'string', description: 'Optional: Obsidian vault path' },
        },
        required: ['title', 'content'],
      },
    },
    {
      name: 'search_knowledge',
      description: 'Search OpenSynapse knowledge base',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          limit: { type: 'number', description: 'Max results', default: 5 },
        },
        required: ['query'],
      },
    },
    {
      name: 'sync_to_obsidian',
      description: 'Sync OpenSynapse notes to Obsidian vault',
      inputSchema: {
        type: 'object',
        properties: {
          vaultPath: { type: 'string', description: 'Obsidian vault path' },
        },
        required: ['vaultPath'],
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
  const { name, arguments: args } = request.params;

  if (name === 'save_to_opensynapse') {
    const { title, content, tags = [], vaultPath } = args as any;
    const targetVault = vaultPath || OBSIDIAN_VAULT_PATH;

    if (!targetVault) {
      return {
        content: [{ type: 'text', text: 'Error: No Obsidian vault path configured. Set OBSIDIAN_VAULT_PATH env var or provide vaultPath parameter.' }],
        isError: true,
      };
    }

    try {
      const obsidian = new ObsidianIntegration(targetVault);
      await obsidian.saveNote({
        title,
        content,
        tags,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      return {
        content: [{ type: 'text', text: `Successfully saved "${title}" to Obsidian vault at ${targetVault}` }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error saving note: ${error instanceof Error ? error.message : String(error)}` }],
        isError: true,
      };
    }
  }

  if (name === 'search_knowledge') {
    return {
      content: [{ type: 'text', text: 'Search feature requires OpenSynapse backend with Firestore integration.' }],
    };
  }

  if (name === 'sync_to_obsidian') {
    return {
      content: [{ type: 'text', text: 'Sync feature requires OpenSynapse backend connection.' }],
    };
  }

  if (name === 'check_status') {
    return {
      content: [{ type: 'text', text: `OpenCode: ${OPENCODE_BASE_URL}\nObsidian vault: ${OBSIDIAN_VAULT_PATH || 'Not configured'}` }],
    };
  }

  throw new Error(`Unknown tool: ${name}`);
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
