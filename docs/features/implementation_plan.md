# Gemini 对话导入与增量同步

## 背景与问题

当 OpenSynapse 使用 Gemini 3.0+ preview 模型时，由于 Code Assist / API 容量波动，聊天偶发超时。用户在 Gemini 官方 App/网页端对话不会卡顿，但脱离了 OpenSynapse 的知识提炼体系。因此需要一条**从 Gemini 导入对话到 OpenSynapse**的通路，实现"在 Gemini 里对话，在 Synapse 里沉淀"。

## 调研结论

| 数据源 | 可行性 | 格式 | 增量能力 |
|--------|--------|------|----------|
| Google Takeout (Gemini) | ⚠️ 低 | 活动日志 HTML/JSON，**不含完整对话内容** | 无，每次全量导出 |
| Gemini 分享链接 (`g.co/gemini/share/xxx`) | ⚠️ 中 | 公开 HTML 页面，需 JS 渲染，结构不稳定 | 无，快照式 |
| 浏览器插件导出 (SaveChat, AI Chat Exporter 等) | ✅ 高 | **JSON / Markdown**，结构清晰 | 手动导出，可按时间筛选 |
| 用户手动复制 Markdown | ✅ 高 | 纯文本 | 手动 |

> [!IMPORTANT]
> **推荐主路径：浏览器插件导出 JSON/Markdown → OpenSynapse 导入**
> 
> 这是目前最可靠、格式最稳定的方案。Google Takeout 不包含完整对话内容，分享链接需要爬虫且结构随时可能变化。

## User Review Required

> [!WARNING]
> **关键设计决策**：
> 1. **导入粒度**：导入后的对话是作为 `ChatSession` 出现在"学习对话"历史中，还是直接触发知识提炼（生成 Note + Flashcard）？——**方案：两者都支持**，用户可选择"仅导入对话"或"导入并提炼"。
> 2. **去重策略**：输入相同文件多次导入时的去重机制？——**方案：基于对话首条消息内容 + 时间戳计算 fingerprint**，重复导入会提示用户。
> 3. **SettingsView 整合**：是否要把导入入口也放到设置页？——**方案：不放设置页，而是在"学习对话"侧边栏增加导入按钮，更贴近使用场景**。

## Proposed Changes

### 支持的导入格式

我们将支持三种主要输入格式，覆盖最常见的导出工具：

```
格式 A: 浏览器插件 JSON（SaveChat / AI Chat Exporter 风格）
───────────────────────────────────────────────────────────
{
  "title": "关于 React 状态管理的讨论",
  "source": "gemini",
  "messages": [
    { "role": "user", "content": "请解释 React 中的 useState 和 useReducer 的区别" },
    { "role": "model", "content": "useState 和 useReducer 都是 React 的状态管理 Hook..." }
  ],
  "exportedAt": "2026-03-28T03:00:00Z"
}

格式 B: Markdown（插件导出或手动复制）
───────────────────────────────────────
## User
请解释 React 中的 useState 和 useReducer 的区别

## Gemini
useState 和 useReducer 都是 React 的状态管理 Hook...

格式 C: 纯文本（用户手动粘贴）
──────────────────────────────
直接粘贴对话内容，系统使用 AI 自动识别对话轮次
```

---

### 类型定义

#### [MODIFY] [types.ts](file:///Users/lv/Workspace/OpenSynapse/src/types.ts)

新增导入相关类型：

```typescript
// 导入的对话来源标记
export type ChatSessionSource = 'native' | 'gemini_import' | 'chatgpt_import' | 'markdown_import';

export interface ChatSession {
  id: string;
  title?: string;
  messages: ChatMessage[];
  updatedAt: number;
  userId: string;
  // --- 新增字段 ---
  source?: ChatSessionSource;       // 对话来源
  importedAt?: number;              // 导入时间戳
  fingerprint?: string;             // 去重指纹
  originalExportedAt?: string;      // 原始导出时间
}
```

---

### 导入解析器

#### [NEW] [importParsers.ts](file:///Users/lv/Workspace/OpenSynapse/src/services/importParsers.ts)

负责将不同格式的输入统一解析为 `ChatMessage[]`：

- `parseJsonImport(content: string)` — 解析 JSON 格式（支持多种插件的字段名变体）
- `parseMarkdownImport(content: string)` — 解析 Markdown 格式（`## User` / `## Gemini` / `## Assistant` 分隔符）
- `autoDetectAndParse(content: string)` — 自动检测格式并调用对应解析器
- `generateFingerprint(messages: ChatMessage[])` — 基于首条用户消息 + 消息数量 + 时间生成去重指纹
- `checkDuplicate(fingerprint: string, existingSessions: ChatSession[])` — 检查是否已存在相同对话

**核心解析逻辑：**

```typescript
// JSON 解析 — 兼容多种插件导出格式
function parseJsonImport(raw: string): ParsedImport {
  const data = JSON.parse(raw);
  
  // 兼容 SaveChat 风格
  if (data.messages && Array.isArray(data.messages)) {
    return {
      title: data.title || data.name || '导入的对话',
      messages: data.messages.map(normalizeMessage),
      exportedAt: data.exportedAt || data.timestamp || data.date,
    };
  }
  
  // 兼容 AI Chat Exporter 风格（conversations 数组）
  if (data.conversations && Array.isArray(data.conversations)) {
    return data.conversations.map(conv => ({
      title: conv.title,
      messages: conv.messages.map(normalizeMessage),
      exportedAt: conv.exportedAt,
    }));
  }
  
  throw new Error('无法识别的 JSON 格式');
}

// Markdown 解析 — 按角色分隔符拆分
function parseMarkdownImport(raw: string): ParsedImport {
  const blocks = raw.split(/^##\s+(User|Gemini|Assistant|Model|Human)/mi);
  // ... 逐块解析为 ChatMessage[]
}
```

---

### 导入 UI 组件

#### [NEW] [ImportDialog.tsx](file:///Users/lv/Workspace/OpenSynapse/src/components/ImportDialog.tsx)

一个模态弹窗，提供三种导入方式：

1. **拖拽/选择文件** — 支持 `.json` / `.md` / `.txt`
2. **粘贴内容** — 大文本框，直接粘贴对话
3. **从 URL 获取** — 预留，暂不实现（Gemini 分享链接需要 headless browser，不可靠）

**UI 流程：**

```
┌─────────────────────────────────────────────┐
│  📥 导入 Gemini 对话                         │
│                                              │
│  ┌─────────┐ ┌──────────┐ ┌───────────┐     │
│  │ 📄 文件  │ │ 📋 粘贴   │ │ 🔗 URL    │     │
│  └─────────┘ └──────────┘ └───────────┘     │
│                                              │
│  [拖拽区域 / 文本框 / URL 输入]              │
│                                              │
│  ── 解析预览 ──                               │
│  ✅ 检测到 12 轮对话                          │
│  📝 标题: "React 状态管理讨论"                │
│  ⚠️  已存在相似对话（点击查看）               │
│                                              │
│  ┌────────────────┐ ┌──────────────────┐     │
│  │ 仅导入为对话    │ │ 导入并提炼知识    │     │
│  └────────────────┘ └──────────────────┘     │
└─────────────────────────────────────────────┘
```

**关键交互：**
- 文件拖入后立即解析并预览（标题、轮次数、首条消息预览）
- 如果检测到重复（fingerprint 匹配），显示黄色警告但不阻止
- "仅导入为对话"→ 写入 `ChatSession`，来源标记 `gemini_import`
- "导入并提炼知识"→ 写入 `ChatSession` + 触发现有的 `processConversation()` 生成 Note + Flashcard

---

### 集成入口

#### [MODIFY] [ChatView.tsx](file:///Users/lv/Workspace/OpenSynapse/src/components/ChatView.tsx)

在历史会话侧边栏顶部增加导入按钮：

```tsx
// 历史侧边栏头部
<div className="flex items-center justify-between px-4 py-3">
  <span className="text-xs font-bold uppercase tracking-widest text-text-muted">历史对话</span>
  <div className="flex items-center gap-1">
    <button onClick={() => setShowImportDialog(true)} title="导入对话">
      <Download size={16} />
    </button>
    <button onClick={handleNewChat} title="新建对话">
      <Plus size={16} />
    </button>
  </div>
</div>
```

导入的对话在历史列表中会有特殊标记（小图标区分来源）。

---

### CLI 导入增强

#### [MODIFY] [cli.ts](file:///Users/lv/Workspace/OpenSynapse/scripts/cli.ts)

新增 `import` 子命令：

```bash
# 导入单个 JSON/Markdown 文件
npx tsx scripts/cli.ts import ./gemini-export.json

# 批量导入目录下所有对话
npx tsx scripts/cli.ts import ./exports/

# 导入并提炼知识
npx tsx scripts/cli.ts import ./gemini-export.json --extract
```

CLI 复用 `importParsers.ts` 的解析逻辑，通过 `/api/sync` 或直接 Firestore 写入。

---

### 服务端 API

#### [MODIFY] [server.ts](file:///Users/lv/Workspace/OpenSynapse/server.ts)

新增导入专用接口：

```typescript
// 批量导入对话
app.post("/api/import/conversations", async (req, res) => {
  const { sessions } = req.body; // ChatSession[]
  // 写入 data.json 或返回给前端由 Firestore 写入
  // ...
});
```

> [!NOTE]
> Web 端实际直接由前端写 Firestore（已有 `onSaveSession` 回调）。Server API 主要服务于 CLI 链路。

---

### 增量同步策略

由于 Gemini 没有提供稳定的 API 来拉取对话历史，"增量同步"的核心策略是**基于 fingerprint 去重的重复导入安全性**：

1. **导入时**：计算 fingerprint，检查已有 sessions
2. **重复检测**：如果 fingerprint 已存在，提示用户但不阻止（对话可能有更新）
3. **合并策略**：如果用户选择覆盖，保留原有 session ID，更新消息内容
4. **批量导入**：支持一次导入多个文件，自动跳过已存在的对话

```
fingerprint = sha256(
  firstUserMessage.text.slice(0, 200) +
  "|" + messages.length +
  "|" + (exportedAt || "")
)
```

---

## 文件变更汇总

| 操作 | 文件 | 描述 |
|------|------|------|
| MODIFY | `src/types.ts` | 增加 `source`, `importedAt`, `fingerprint` 字段 |
| NEW | `src/services/importParsers.ts` | JSON / Markdown / 自动检测解析器 + 去重 |
| NEW | `src/components/ImportDialog.tsx` | 导入弹窗 UI（拖拽/粘贴/预览/去重提示） |
| MODIFY | `src/components/ChatView.tsx` | 侧边栏增加导入按钮，集成 ImportDialog |
| MODIFY | `scripts/cli.ts` | 新增 `import` 子命令 |
| MODIFY | `server.ts` | 新增 `/api/import/conversations` 端点（服务 CLI） |

## Open Questions

> [!IMPORTANT]
> 1. **是否需要支持 ChatGPT 导出格式？** ChatGPT 的 JSON 导出格式与 Gemini 插件不同，但解析器可以扩展。如果你也在 ChatGPT 上对话，我可以一并支持。
> 2. **多文件批量导入的 UI 体验**：是在弹窗中支持多文件拖拽，还是单独做一个批量导入页面？
> 3. **导入后的可视化标记**：导入的对话在历史列表中需要什么级别的视觉区分？仅一个小图标？还是单独分组？

## Verification Plan

### Automated Tests
- 为 `importParsers.ts` 编写单元测试，覆盖 JSON / Markdown / 混合格式 / 边界情况
- 测试 fingerprint 去重逻辑

### Manual Verification
- 使用 SaveChat 从 Gemini 导出一份 JSON，验证端到端导入流程
- 测试拖拽、粘贴两种输入方式
- 验证导入后对话显示在历史列表中，来源标记正确
- 验证"导入并提炼"能正确触发 Note + Flashcard 生成
- 验证重复导入的警告提示
- CLI `import` 命令端到端测试
