import { Type } from "@google/genai";
import { Note, Flashcard, ChatMessage } from "../types";

// Setup an API proxy that mirrors the GoogleGenAI interface but calls our backend API
const ai = {
  models: {
    generateContent: async (params: any) => {
      const response = await fetch('/api/ai/generateContent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      if (!response.ok) {
        throw new Error(`Failed to generate content: ${await response.text()}`);
      }
      return await response.json(); // { text: "..." }
    },
    embedContent: async (params: any) => {
      const response = await fetch('/api/ai/embedContent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      if (!response.ok) {
        throw new Error(`Failed to embed content: ${await response.text()}`);
      }
      return await response.json();
    }
  }
};

export async function chatWithAI(messages: ChatMessage[], allNotes: Note[]) {
  const lastUserMessage = messages.filter(m => m.role === 'user').pop()?.text || "";
  
  // RAG: Find relevant notes based on the last user message
  let relevantNotes: Note[] = [];
  if (lastUserMessage && allNotes.length > 0) {
    relevantNotes = await findRelevantNotes(lastUserMessage, allNotes);
  }

  const contextText = relevantNotes.length > 0 
    ? `\n# 相关知识背景 (RAG)\n以下是你过去记录的相关笔记，请在回答时参考并建立链接：\n${relevantNotes.map(n => `## ${n.title}\n${n.summary}\n${n.content}`).join('\n---\n')}`
    : `\n当前知识背景：${JSON.stringify(allNotes.map(n => n.title))}`;

  const contents = messages.map(m => {
    const parts: any[] = [{ text: m.text }];
    if (m.image) {
      const [mimeTypePart, data] = m.image.split(';base64,');
      const mimeType = mimeTypePart.split(':')[1];
      parts.push({
        inlineData: {
          mimeType: mimeType,
          data: data
        }
      });
    }
    return { parts, role: m.role };
  });

  const model = ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents,
    config: {
      systemInstruction: `# Role Definition
你是一位拥有深厚工程背景的**计算机科学与底层原理导师**，同时具备心理学和教育学视野。你的教学对象是一位具有高认知能力的成年学习者。

# Core Philosophy: "Genetic Epistemology" (发生认识论)
你的核心教学理念是：**知识不是凭空产生的，而是为了解决特定历史时期的特定“痛点”而发明的。**
因此，在解释任何概念（如数据结构、操作系统、数学定理）时，**严禁**直接抛出教科书式的定义。

# Instruction Protocol (The "Pain-Point" Framework)
对于用户的每一个疑问，你必须严格遵循以下**“三部曲”**进行拆解：

1.  **【史前时代】(The Context):**
    * 还原该技术诞生之前的“原始状态”。
    * 描述在没有该技术时，工程师们面临的**具体灾难**或**痛点**（例如：没有栈时，计算机无法处理嵌套括号）。
2.  **【笨办法】(The Naive Approach):**
    * 模拟人类直觉能想到的最简单方案。
    * 推演这个笨办法为什么行不通（会撞到什么南墙？效率低？易出错？）。
3.  **【救世主登场】(The Solution):**
    * 自然地引出该知识点。
    * 解释它如何巧妙地解决了上述痛点。
    * **关键点：** 强调它做出的**权衡（Trade-off）**（牺牲了什么，换取了什么）。

# Cognitive Tools (必须使用的思维模型)
1.  **上帝视角 vs. 物理视角：**
    * 区分“ADT（逻辑设计/立法者）”与“物理实现（内存/执行者）”。
    * 解释概念时，要穿透到**硬件层面**（内存、寄存器、指针）。
2.  **工程化比喻：**
    * 使用高保真的生活化比喻（如：栈是死胡同，Vector是排好的阅兵方阵，操作系统是搞隔离的监狱长）。
3.  **破坏性思维：**
    * 引导用户思考“如果我不遵守这个规则，系统会怎么崩？”（切斯特顿的栅栏）。
4.  **跨界关联：**
    * 适时关联**股票/投资**概念（如：均线是低通滤波器，期权是风险对冲），以辅助理解计算机逻辑。

# Domain Specific Constraints
* **语言：** 使用中文，风格通俗、幽默、逻辑严密（类似“直男硬核科技风”）。
* **排版优化：** 
    * 仅对**核心概念**或**关键结论**使用加粗（Markdown **），避免大段加粗。
    * 优先使用列表（- 或 1.）来展示步骤或对比。
    * 代码块必须指定语言（如 \`\`\`cpp）。
* **编程语言：** 默认使用 **C++**（特别是清华邓俊辉老师风格，强调模板、内存管理、指针操作）。
* **参考教材：** 
    * 数据结构：《清华大学数据结构（C++版）》
    * 底层原理：《深入理解计算机系统 (CS:APP)》
    * 操作系统：《操作系统导论 (OSTEP)》
    * 数学直觉：《3Blue1Brown》系列

# Context Injection
${contextText}
如果用户学到了相关的概念，请提及它们以建立“语义链接”。`,
    },
  });
  const response = await model;
  return response.text;
}

export async function findRelevantNotes(query: string, notes: Note[], limit: number = 3): Promise<Note[]> {
  try {
    const queryEmbedding = await generateEmbedding(query);
    return notes
      .map(note => ({
        note,
        similarity: note.embedding ? cosineSimilarity(queryEmbedding, note.embedding) : 0
      }))
      .filter(item => item.similarity > 0.6) // Threshold for relevance
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit)
      .map(item => item.note);
  } catch (e) {
    console.warn("RAG retrieval failed:", e);
    return [];
  }
}

export async function processConversation(chatHistory: string[]): Promise<{ note: Partial<Note>, flashcards: Partial<Flashcard>[] }> {
  const prompt = `你是一位严谨的计算机科学导师。请分析以下对话，提取出核心知识点。
  
  对于每一个知识点，请生成：
  1. 一篇结构化的笔记 (Note)：
     - 标题要专业且具象。
     - 内容必须包含：【史前时代】（没有该技术时的灾难）、【解决方案】（该技术如何优雅地解决问题）、【权衡】（引入该技术带来的新问题或成本）。
  2. 3-5 个用于主动召回的高质量闪卡 (Flashcards)：
     - **严禁**简单的名词解释。
     - 问题必须是“场景化”或“原理化”的（例如：为什么在多线程环境下，简单的计数器会失效？）。
     - 答案必须包含底层逻辑。

  对话内容：
  ${chatHistory.join("\n")}
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

  return JSON.parse(response.text);
}

export async function findSemanticLinks(newNote: Note, existingNotes: Note[]): Promise<string[]> {
  if (existingNotes.length === 0) return [];
  
  // If we have embeddings, we can use them for more accurate/efficient linking
  if (newNote.embedding) {
    const related: string[] = [];
    for (const note of existingNotes) {
      if (note.embedding) {
        const similarity = cosineSimilarity(newNote.embedding, note.embedding);
        if (similarity > 0.8) { // Threshold for "related"
          related.push(note.id);
        }
      }
    }
    if (related.length > 0) return related;
  }

  // Fallback to LLM for linking if no embeddings or no matches
  const prompt = `给定一条新笔记： "${newNote.title}: ${newNote.summary}"
  以及现有笔记： ${existingNotes.map(n => `ID: ${n.id}, 标题: ${n.title}`).join("; ")}
  识别哪些现有笔记与新笔记在语义上相关。
  仅返回相关笔记的 ID 数组。`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
      },
    },
  });

  return JSON.parse(response.text);
}

export async function deconstructScannedDocument(base64Image: string): Promise<{ note: Partial<Note>, flashcards: Partial<Flashcard>[] }> {
  const prompt = `你是一位顶尖的知识架构师。请分析这张扫描文档或图片的页面内容，并将其“解构”为结构化的知识资产。
  
  请提取出最核心的一个知识点，并生成：
  1. 一篇结构化的笔记 (Note)：
     - 标题要专业且具象。
     - 内容必须包含：【史前时代】（没有该技术时的灾难）、【解决方案】（该技术如何优雅地解决问题）、【权衡】（引入该技术带来的新问题或成本）。
  2. 3-5 个用于主动召回的高质量闪卡 (Flashcards)：
     - 问题必须是“场景化”或“原理化”的。
     - 答案必须包含底层逻辑。
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: {
      parts: [
        { text: prompt },
        {
          inlineData: {
            mimeType: "image/jpeg",
            data: base64Image.split(',')[1],
          },
        },
      ],
    },
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

  return JSON.parse(response.text);
}

export async function deconstructTOC(text: string): Promise<{ chapters: { title: string, startPage: number, endPage: number, summary: string }[] }> {
  const prompt = `你是一位顶尖的知识架构师。请分析以下教材或文档的前几页内容，提取出其目录结构（Table of Contents）。
  
  请识别出最核心的 5-8 个章节，并为每个章节提供：
  1. 章节标题。
  2. 预估的起始页码和结束页码（基于文档中的页码标记）。
  3. 该章节的核心知识点简述。

  文档内容：
  ${text.slice(0, 20000)}
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          chapters: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                startPage: { type: Type.NUMBER },
                endPage: { type: Type.NUMBER },
                summary: { type: Type.STRING },
              },
              required: ["title", "startPage", "endPage", "summary"],
            },
          },
        },
        required: ["chapters"],
      },
    },
  });

  return JSON.parse(response.text);
}

export async function deconstructUrl(url: string): Promise<{ note: Partial<Note>, flashcards: Partial<Flashcard>[] }> {
  const prompt = `你是一位顶尖的知识架构师。请访问并深度解构以下 URL 的内容：${url}。
  
  请提取出最核心的一个知识点，并生成：
  1. 一篇结构化的笔记 (Note)：
     - 标题要专业且具象。
     - 内容必须包含：【史前时代】（没有该技术时的灾难）、【解决方案】（该技术如何优雅地解决问题）、【权衡】（引入该技术带来的新问题或成本）。
  2. 3-5 个用于主动召回的高质量闪卡 (Flashcards)：
     - 问题必须是“场景化”或“原理化”的。
     - 答案必须包含底层逻辑。
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      tools: [{ urlContext: {} }],
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

  return JSON.parse(response.text);
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const result = await ai.models.embedContent({
    model: 'gemini-embedding-2-preview',
    contents: [text],
  });
  return result.embeddings[0].values;
}

export interface BreakthroughConfig {
  tag: string;
  weakPoints: string[];
}

export async function analyzeKnowledgeGaps(tag: string, cards: Flashcard[]): Promise<string[]> {
  const prompt = `你是一位教育心理学家和计算机科学专家。
  用户在 [${tag}] 领域的以下知识点上遇到了困难（复习表现不佳）：
  ${cards.map(c => `- Q: ${c.question}\n  A: ${c.answer}`).join('\n')}
  
  请分析这些错误背后的“认知断层”或“思维盲区”。
  不要只是重复问题，要总结出用户可能在理解什么底层逻辑上存在障碍。
  返回一个包含 2-3 个具体薄弱点的字符串数组。`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
      },
    },
  });

  return JSON.parse(response.text);
}

export async function startBreakthroughChat(config: BreakthroughConfig, allNotes: Note[]) {
  const relevantNotes = allNotes.filter(n => n.tags.includes(config.tag));
  
  const contextText = relevantNotes.length > 0 
    ? `\n# 攻坚背景 (RAG)\n以下是你过去记录的关于 [${config.tag}] 的笔记：\n${relevantNotes.map(n => `## ${n.title}\n${n.summary}\n${n.content}`).join('\n---\n')}`
    : `\n当前没有关于 [${config.tag}] 的笔记。`;

  const systemInstruction = `# Role Definition
你是一位拥有深厚工程背景的**苏格拉底式导师**。你的任务是针对用户在 [${config.tag}] 领域的知识薄弱点进行“专项攻坚”。

# 攻坚目标
用户在以下方面表现较弱：${config.weakPoints.join(', ')}。
你的目标是通过引导式提问，帮助用户从底层逻辑上彻底理解这些概念。

# Instruction Protocol (Socratic Method)
1. **严禁直接给出答案**：即使面对用户的直接提问，也要通过反问来引导。
2. **由浅入深**：从最基础的物理直觉或生活常识开始，逐步推导到复杂的工程实现。
3. **识别认知断层**：如果用户回答错误，不要纠正，而是通过一个“归谬法”提问，让用户自己发现逻辑矛盾。
4. **穿透底层**：所有的讨论最终都要回归到：内存、CPU、权衡（Trade-off）或历史痛点。

# Context Injection
${contextText}

请开始你的第一轮引导，针对 [${config.tag}] 的核心痛点抛出一个启发性的问题。`;

  const model = ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: "你好，导师。我准备好开始针对 [" + config.tag + "] 的专项攻坚了。",
    config: {
      systemInstruction,
    },
  });
  const response = await model;
  return response.text;
}

export async function deconstructDocument(text: string): Promise<{ note: Partial<Note>, flashcards: Partial<Flashcard>[] }> {
  const prompt = `你是一位顶尖的知识架构师。请将以下长文档或文章“解构”为结构化的知识资产。
  
  请提取出最核心的一个知识点，并生成：
  1. 一篇结构化的笔记 (Note)：
     - 标题要专业且具象。
     - 内容必须包含：【史前时代】（没有该技术时的灾难）、【解决方案】（该技术如何优雅地解决问题）、【权衡】（引入该技术带来的新问题或成本）。
  2. 3-5 个用于主动召回的高质量闪卡 (Flashcards)：
     - 问题必须是“场景化”或“原理化”的。
     - 答案必须包含底层逻辑。

  文档内容：
  ${text.slice(0, 20000)} // Limit text length for safety
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

  return JSON.parse(response.text);
}

export async function semanticSearch(query: string, notes: Note[]): Promise<{ note: Note, similarity: number }[]> {
  const queryEmbedding = await generateEmbedding(query);
  return notes
    .map(note => ({
      note,
      similarity: note.embedding ? cosineSimilarity(queryEmbedding, note.embedding) : 0
    }))
    .filter(item => item.similarity > 0.4) // Lower threshold for search
    .sort((a, b) => b.similarity - a.similarity);
}

function cosineSimilarity(vecA: number[], vecB: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
