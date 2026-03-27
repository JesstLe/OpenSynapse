import fs from 'fs';
import path from 'path';
import { GoogleGenAI, Type } from "@google/genai";
import { GoogleAuth } from 'google-auth-library';
import dotenv from 'dotenv';

dotenv.config();

const API_URL = process.env.APP_URL || 'http://localhost:3000';
const GEMINI_KEY = process.env.GEMINI_API_KEY;

let ai: GoogleGenAI;

if (!GEMINI_KEY || GEMINI_KEY === "AIzaSy..." || GEMINI_KEY.trim() === "") {
  console.log("[CLI] GEMINI_API_KEY is not set or valid in .env. Falling back to GoogleAuth (ADC/OAuth).");
  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform', 'https://www.googleapis.com/auth/generative-language']
  });
  // @ts-ignore
  ai = new GoogleGenAI({ auth } as any);
} else {
  ai = new GoogleGenAI({ apiKey: GEMINI_KEY });
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

const filePath = process.argv[2];
if (!filePath) {
  console.log("Usage: npx tsx cli.ts <path_to_exported_chat.txt>");
} else {
  processFile(path.resolve(filePath)).catch(console.error);
}
