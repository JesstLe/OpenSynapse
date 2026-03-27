import fs from 'fs';
import path from 'path';
import { GoogleGenAI, Type } from "@google/genai";
import { GoogleAuth } from 'google-auth-library';
import dotenv from 'dotenv';
import { handleAuthCommand, getAccessToken } from './cli-auth.js';
import { loadCredentials } from './src/lib/oauth.js';

dotenv.config();

const API_URL = process.env.APP_URL || 'http://localhost:3000';
const GEMINI_KEY = process.env.GEMINI_API_KEY;

let ai: GoogleGenAI;

/**
 * 初始化 GoogleGenAI
 * 优先级：1. OAuth凭证 2. API Key 3. GoogleAuth ADC
 */
async function initAI() {
  // 1. 尝试使用OAuth凭证
  const oauthCredentials = await loadCredentials();
  if (oauthCredentials) {
    console.log("[CLI] 使用OAuth凭证进行认证");
    // @ts-ignore - Using OAuth access token directly
    ai = new GoogleGenAI({ apiKey: oauthCredentials.access_token });
    return;
  }

  // 2. 尝试使用API Key
  if (GEMINI_KEY && GEMINI_KEY !== "AIzaSy..." && GEMINI_KEY.trim() !== "") {
    console.log("[CLI] 使用API Key进行认证");
    ai = new GoogleGenAI({ apiKey: GEMINI_KEY });
    return;
  }

  // 3. 回退到GoogleAuth ADC
  console.log("[CLI] 未找到OAuth凭证或API Key，尝试使用GoogleAuth ADC");
  console.log("[CLI] 提示：运行 'npx tsx cli.ts auth login' 使用浏览器OAuth登录");
  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform', 'https://www.googleapis.com/auth/generative-language']
  });
  ai = new GoogleGenAI({ auth } as any);
}

async function processFile(filePath: string) {
  console.log(`[CLI] Reading file: ${filePath}`);
  const content = fs.readFileSync(filePath, 'utf-8');

  console.log(`[CLI] Processing with AI...`);
  const prompt = `分析以下导出的对话或学习资料，并提取：
  1. 结构化的学习笔记（标题、摘要、深度解析、适用时的代码片段、核心标签）。
  2. 3-5 个用于主动召回的闪卡（问题和答案）。
  请务必使用中文输出。
  
  内容：
  ${content}
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
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
            required: ["title", "summary", "content", "tags"],
          },
          flashcards: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                question: { type: Type.STRING },
                answer: { type: Type.STRING },
              },
              required: ["question", "answer"],
            },
          },
        },
        required: ["note", "flashcards"],
      },
    },
  });

  const result = JSON.parse(response.text);
  
  const note = {
    ...result.note,
    id: Math.random().toString(36).substr(2, 9),
    relatedIds: [],
    createdAt: Date.now()
  };

  const flashcards = result.flashcards.map((f: any) => ({
    ...f,
    id: Math.random().toString(36).substr(2, 9),
    noteId: note.id,
    nextReview: Date.now(),
    interval: 0,
    easeFactor: 2.5,
    repetitions: 0
  }));

  console.log(`[CLI] Syncing to backend: ${API_URL}`);
  const syncRes = await fetch(`${API_URL}/api/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ note, flashcards })
  });

  if (syncRes.ok) {
    console.log(`[CLI] Successfully synced: ${note.title}`);
  } else {
    console.error(`[CLI] Sync failed: ${syncRes.statusText}`);
  }
}

/**
 * 显示帮助信息
 */
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
  console.log('  npx tsx cli.ts auth login   使用Google账号登录');
  console.log('  npx tsx cli.ts auth status  查看登录状态');
  console.log('  npx tsx cli.ts auth logout  退出登录\n');
}

/**
 * 主函数
 */
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  // 处理 auth 命令
  if (command === 'auth') {
    await handleAuthCommand(args.slice(1));
    return;
  }

  // 处理 help 命令
  if (command === 'help' || command === '--help' || command === '-h') {
    showHelp();
    return;
  }

  // 没有参数或参数不是文件
  if (!command || !fs.existsSync(path.resolve(command))) {
    console.log('错误: 请提供有效的文件路径\n');
    showHelp();
    process.exit(1);
  }

  // 初始化AI（支持OAuth/API Key/ADC）
  await initAI();

  // 处理文件
  await processFile(path.resolve(command));
}

// 运行主函数
main().catch(err => {
  console.error('[CLI] Error:', err);
  process.exit(1);
});