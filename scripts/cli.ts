import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';
import { handleAuthCommand } from './cli-auth.js';
import { generateContentWithCodeAssist } from '../src/lib/codeAssist.js';
import { DEFAULT_TEXT_MODEL } from '../src/lib/aiModels.js';
import {
  loadCredentials,
  resolveOAuthClientConfig,
  isCredentialsCompatible,
} from '../src/lib/oauth.js';

dotenv.config({ path: '.env.local' });

const API_URL = process.env.APP_URL || 'http://localhost:3000';
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const GOOGLE_CLOUD_PROJECT = process.env.GOOGLE_CLOUD_PROJECT;
const CLI_MODEL = process.env.OPENSYNAPSE_CLI_MODEL || DEFAULT_TEXT_MODEL;

type GenerateContentResult = { text: string };
type AIClient = {
  models: {
    generateContent: (params: any) => Promise<GenerateContentResult>;
  };
};

let ai: AIClient;

function wrapGoogleGenAI(client: GoogleGenAI): AIClient {
  return {
    models: {
      generateContent: async (params: any) => {
        const response = await client.models.generateContent(params);
        return { text: response.text };
      },
    },
  };
}

async function initAI() {
  const savedCredentials = await loadCredentials();

  if (savedCredentials) {
    try {
      const clientConfig = resolveOAuthClientConfig();
      if (isCredentialsCompatible(savedCredentials, clientConfig.clientId)) {
        console.log(`[CLI] 使用 Gemini CLI / Code Assist OAuth 认证 (${clientConfig.source})`);
        ai = {
          models: {
            generateContent: async (params: any) => {
              const response = await generateContentWithCodeAssist(params, clientConfig);
              return { text: response.text };
            },
          },
        };
        return;
      }

      console.log('[CLI] 检测到旧版 OAuth 凭证，请重新运行 auth login 升级到 Gemini CLI 认证。');
    } catch (error) {
      console.log(
        `[CLI] 已发现本地凭证，但当前无法解析 Gemini CLI OAuth 配置: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  if (GEMINI_KEY && GEMINI_KEY !== 'AIzaSy...' && GEMINI_KEY.trim() !== '') {
    console.log('[CLI] 使用 API Key 进行认证');
    ai = wrapGoogleGenAI(new GoogleGenAI({ apiKey: GEMINI_KEY }));
    return;
  }

  console.log('[CLI] 未找到可用 OAuth 凭证或 API Key，尝试使用 ADC');
  console.log('[CLI] 提示：运行 "npx tsx cli.ts auth login" 使用 Gemini CLI 风格登录');
  ai = wrapGoogleGenAI(
    new GoogleGenAI({
      googleAuthOptions: {
        projectId: GOOGLE_CLOUD_PROJECT,
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      },
    })
  );
}

async function processFile(filePath: string) {
  console.log(`[CLI] Reading file: ${filePath}`);
  const content = fs.readFileSync(filePath, 'utf-8');

  console.log('[CLI] Processing with AI...');
  const prompt = `分析以下导出的对话或学习资料，并提取：
  1. 结构化的学习笔记（标题、摘要、深度解析、适用时的代码片段、核心标签）。
  2. 3-5 个用于主动召回的闪卡（问题和答案）。
  请务必使用中文输出。
  
  内容：
  ${content}
  `;

  const response = await ai.models.generateContent({
    model: CLI_MODEL,
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          note: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              summary: { type: Type.STRING },
              content: { type: Type.STRING },
              codeSnippet: { type: Type.STRING },
              tags: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ['title', 'summary', 'content', 'tags'],
          },
          flashcards: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                question: { type: Type.STRING },
                answer: { type: Type.STRING },
              },
              required: ['question', 'answer'],
            },
          },
        },
        required: ['note', 'flashcards'],
      },
    },
  });

  const result = JSON.parse(response.text);
  const note = {
    ...result.note,
    id: Math.random().toString(36).substr(2, 9),
    relatedIds: [],
    createdAt: Date.now(),
  };

  const flashcards = result.flashcards.map((flashcard: any) => ({
    ...flashcard,
    id: Math.random().toString(36).substr(2, 9),
    noteId: note.id,
    nextReview: Date.now(),
    interval: 0,
    easeFactor: 2.5,
    repetitions: 0,
  }));

  console.log(`[CLI] Syncing to backend: ${API_URL}`);
  const syncRes = await fetch(`${API_URL}/api/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ note, flashcards }),
  });

  if (syncRes.ok) {
    console.log(`[CLI] Successfully synced: ${note.title}`);
  } else {
    console.error(`[CLI] Sync failed: ${syncRes.statusText}`);
  }
}

function showHelp() {
  console.log('OpenSynapse CLI\n');
  console.log('用法:');
  console.log('  npx tsx cli.ts <command> [options]\n');
  console.log('命令:');
  console.log('  auth     认证管理 (login/logout/status)');
  console.log('  help     显示此帮助信息\n');
  console.log('处理文件:');
  console.log('  npx tsx cli.ts <path_to_file.txt>\n');
  console.log('认证:');
  console.log('  npx tsx cli.ts auth login   使用 Google 账号登录');
  console.log('  npx tsx cli.ts auth status  查看登录状态');
  console.log('  npx tsx cli.ts auth logout  退出登录\n');
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === 'auth') {
    await handleAuthCommand(args.slice(1));
    return;
  }

  if (command === 'help' || command === '--help' || command === '-h') {
    showHelp();
    return;
  }

  if (!command || !fs.existsSync(path.resolve(command))) {
    console.log('错误: 请提供有效的文件路径\n');
    showHelp();
    process.exit(1);
  }

  await initAI();
  await processFile(path.resolve(command));
}

main().catch((error) => {
  console.error('[CLI] Error:', error);
  process.exit(1);
});
