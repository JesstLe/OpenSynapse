import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { Request, Response } from 'express';
import {
  routePaymentProduct,
  getProductDocumentation,
  getIntegrationGuide,
  matchKeywords,
  getQuickStart,
  PAYMENT_PRODUCTS,
  QUICK_START_DOCS,
} from '../lib/alipay/index.js';

const server = new Server(
  {
    name: 'opensynapse',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'opensynapse_connect',
        description: 'Connect to OpenSynapse and authenticate',
        inputSchema: {
          type: 'object',
          properties: {
            method: {
              type: 'string',
              enum: ['oauth', 'api_key'],
              description: 'Authentication method',
            },
          },
          required: ['method'],
        },
      },
      {
        name: 'opensynapse_save',
        description: 'Save content to OpenSynapse',
        inputSchema: {
          type: 'object',
          properties: {
            content: { type: 'string' },
            title: { type: 'string' },
          },
          required: ['content'],
        },
      },
      {
        name: 'opensynapse_import',
        description: 'Import conversation',
        inputSchema: {
          type: 'object',
          properties: {
            content: { type: 'string' },
            format: { type: 'string' },
          },
          required: ['content'],
        },
      },
      {
        name: 'opensynapse_review',
        description: 'Get flashcards due for review',
        inputSchema: {
          type: 'object',
          properties: {
            limit: { type: 'number' },
          },
        },
      },
      {
        name: 'opensynapse_search',
        description: 'Search notes',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string' },
          },
          required: ['query'],
        },
      },
      // Alipay Payment Integration Tools
      {
        name: 'alipay_route_product',
        description: '根据业务场景路由到对应的支付宝支付产品',
        inputSchema: {
          type: 'object',
          properties: {
            scenario: {
              type: 'string',
              description: '业务场景',
              enum: [
                'face_to_face', 'order_code', 'app_payment', 'jsapi',
                'wap_payment', 'page_payment', 'pre_auth', 'merchant_deduction'
              ]
            },
            details: {
              type: 'string',
              description: '详细的业务需求描述'
            }
          },
          required: ['scenario']
        }
      },
      {
        name: 'alipay_get_documentation',
        description: '获取指定支付宝支付产品的在线文档索引',
        inputSchema: {
          type: 'object',
          properties: {
            product: {
              type: 'string',
              description: '支付产品名称',
              enum: [
                'face_to_face', 'order_code', 'app_payment', 'jsapi',
                'wap_payment', 'page_payment', 'pre_auth', 'merchant_deduction'
              ]
            }
          },
          required: ['product']
        }
      },
      {
        name: 'alipay_get_integration_guide',
        description: '获取指定支付宝支付产品的接入指南',
        inputSchema: {
          type: 'object',
          properties: {
            product: {
              type: 'string',
              description: '支付产品名称',
              enum: [
                'face_to_face', 'order_code', 'app_payment', 'jsapi',
                'wap_payment', 'page_payment', 'pre_auth', 'merchant_deduction'
              ]
            },
            language: {
              type: 'string',
              description: '编程语言',
              enum: ['java', 'php', 'python', 'nodejs', 'dotnet'],
              default: 'java'
            }
          },
          required: ['product']
        }
      },
      {
        name: 'alipay_match_keywords',
        description: '根据关键词匹配最佳支付宝支付产品',
        inputSchema: {
          type: 'object',
          properties: {
            keywords: {
              type: 'string',
              description: '用户输入的关键词或描述'
            }
          },
          required: ['keywords']
        }
      },
      {
        name: 'alipay_get_quick_start',
        description: '获取支付宝支付快速开始指南',
        inputSchema: {
          type: 'object',
          properties: {
            topic: {
              type: 'string',
              description: '主题',
              enum: [
                'sdk_download', 'get_appid', 'sign_method',
                'gateway', 'sandbox', 'best_practices', 'error_codes'
              ]
            }
          },
          required: ['topic']
        }
      }
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case 'opensynapse_connect':
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ success: true, message: 'Connected to OpenSynapse' }),
          },
        ],
      };

    case 'opensynapse_save':
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ success: true, session_id: `session_${Date.now()}` }),
          },
        ],
      };

    case 'opensynapse_import':
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ success: true, messages_parsed: 5 }),
          },
        ],
      };

    case 'opensynapse_review':
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ count: 3, cards: [] }),
          },
        ],
      };

    case 'opensynapse_search':
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ results: [] }),
          },
        ],
      };

    // Alipay Payment Integration Handlers
    case 'alipay_route_product': {
      const { scenario, details } = args as { scenario: string; details?: string };
      return {
        content: [
          {
            type: 'text',
            text: routePaymentProduct(scenario, details),
          },
        ],
      };
    }

    case 'alipay_get_documentation': {
      const { product } = args as { product: string };
      return {
        content: [
          {
            type: 'text',
            text: getProductDocumentation(product),
          },
        ],
      };
    }

    case 'alipay_get_integration_guide': {
      const { product, language } = args as { product: string; language?: string };
      return {
        content: [
          {
            type: 'text',
            text: getIntegrationGuide(product, language),
          },
        ],
      };
    }

    case 'alipay_match_keywords': {
      const { keywords } = args as { keywords: string };
      const match = matchKeywords(keywords);
      if (match) {
        return {
          content: [
            {
              type: 'text',
              text: `匹配到产品: ${match.product.name}\n匹配度: ${match.score}\n\n${getProductDocumentation(Object.keys(PAYMENT_PRODUCTS).find(key => PAYMENT_PRODUCTS[key].name === match.product.name) || '')}`,
            },
          ],
        };
      }
      return {
        content: [
          {
            type: 'text',
            text: '未找到匹配的支付产品。请尝试使用更具体的关键词描述您的业务场景。',
          },
        ],
      };
    }

    case 'alipay_get_quick_start': {
      const { topic } = args as { topic: string };
      return {
        content: [
          {
            type: 'text',
            text: getQuickStart(topic),
          },
        ],
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

export function setupMCPServer(app: any) {
  let transport: SSEServerTransport | null = null;

  app.get('/mcp', async (req: Request, res: Response) => {
    transport = new SSEServerTransport('/mcp/messages', res);
    await server.connect(transport);
  });

  app.post('/mcp/messages', async (req: Request, res: Response) => {
    if (transport) {
      await transport.handlePostMessage(req, res);
    } else {
      res.status(500).json({ error: 'No active transport' });
    }
  });
}

export { server };
