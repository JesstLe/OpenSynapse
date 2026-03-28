# OpenSynapse 功能缺口分析

基于代码审计，按优先级列出当前需要补充的功能和改进点。

---

## 🔴 关键 Bug / 必须修复

### 1. `sanitizeChatSession` 丢失导入字段
[App.tsx:83-95](file:///Users/lv/Workspace/OpenSynapse/src/App.tsx#L83-L95) 中的 `sanitizeChatSession()` 在写入 Firestore 前**会丢弃**新增的 `source`、`importedAt`、`fingerprint`、`originalExportedAt` 字段。导入的对话存入 Firestore 后会丢失来源标记。

```diff
 function sanitizeChatSession(session: ChatSession, userId: string) {
   return {
     id: session.id,
     title: session.title || '新会话',
     messages: ...,
     updatedAt: session.updatedAt,
     userId,
+    ...(session.source && { source: session.source }),
+    ...(session.importedAt && { importedAt: session.importedAt }),
+    ...(session.fingerprint && { fingerprint: session.fingerprint }),
+    ...(session.originalExportedAt && { originalExportedAt: session.originalExportedAt }),
+    ...(session.thought !== undefined && { thought: session.thought }),
   };
 }
```

**工作量：** 10 分钟

---

## 🟠 高优先级 — 体验关键

### 2. 笔记编辑功能不完整
NotesView 有编辑入口但功能可能不完善。用户从导入对话中提炼出的笔记，应该支持：
- 编辑标题/内容/标签
- 手动添加代码片段
- 合并重复笔记

**工作量：** 2-3 小时

### 3. 闪卡管理缺失
ReviewView 只有复习流程，缺少：
- 查看所有闪卡列表
- 手动创建/编辑/删除闪卡
- 暂停某张闪卡的复习

**工作量：** 3-4 小时

### 4. 导出功能增强
Dashboard 有 Markdown+ZIP 导出，但缺少：
- 导出为 Anki 格式（`.apkg`）用于外部复习
- 导出对话历史
- 导出为 PDF

**工作量：** 3-4 小时

---

## 🟡 中优先级 — 完善体验

### 5. 对话搜索
历史对话列表目前没有搜索功能。随着对话增多（尤其是大量导入后），找到特定对话变得困难。

**需要：**
- 侧边栏搜索框
- 按标题/内容关键字搜索
- 按来源筛选（原生 / Gemini 导入 / ChatGPT 导入）

**工作量：** 2 小时

### 6. 提取资产进度反馈
当前"提取资产"操作缺乏进度指示。对于长对话，用户不知道还要等多久。

**需要：**
- 提取开始时的 loading 动画
- 提取完成后的成功提示（"已生成 1 篇笔记 + 4 张闪卡"）
- 错误时的清晰反馈

**工作量：** 1 小时

### 7. 笔记内容 Markdown 渲染
NotesView 的内容区域（`note.content`）包含 Markdown 格式的文字，但目前似乎是**纯文本显示**，没有使用 ReactMarkdown 渲染。代码片段、列表、粗体等格式丢失。

**工作量：** 30 分钟

### 8. 移动端适配不足
当前 UI 在桌面端体验良好，但移动端存在：
- 知识图谱在小屏上不可用
- 笔记详情页缺少返回按钮
- 底部导航栏可能遮挡输入框

**工作量：** 3-4 小时

---

## 🟢 锦上添花 — Nice to Have

### 9. 多语言系统提示词配置
当前系统提示词硬编码为中文，且编程语言默认 C++。应该允许用户自定义：
- 学科领域（不仅限于计算机科学）
- 输出语言
- 默认编程语言

**工作量：** 2 小时（设置页新增面板）

### 10. 知识图谱交互增强
GraphView 目前展示了节点和连线，但缺少：
- 按标签过滤节点
- 高亮特定知识路径
- 从图谱直接创建新连接

**工作量：** 4-5 小时

### 11. 复习统计仪表盘
Dashboard 有基础统计，但缺少：
- 每日复习量趋势图
- 记忆保留率曲线
- 知识熟练度热力图

**工作量：** 3-4 小时

### 12. PWA 支持
添加 Service Worker + manifest.json，使系统可以作为桌面 PWA 安装，离线访问已有笔记。

**工作量：** 2 小时

---

## 推荐执行顺序

| 优先级 | 项目 | 耗时 |
|--------|------|------|
| **立即修复** | #1 sanitizeChatSession 字段保留 | 10 分钟 |
| **第一轮** | #6 提取资产进度反馈 | 1 小时 |
| **第一轮** | #7 笔记 Markdown 渲染 | 30 分钟 |
| **第一轮** | #5 对话搜索 | 2 小时 |
| **第二轮** | #2 笔记编辑完善 | 3 小时 |
| **第二轮** | #3 闪卡管理 | 4 小时 |
| **第三轮** | #9 系统提示词配置 | 2 小时 |
| **第三轮** | #12 PWA 支持 | 2 小时 |

> [!IMPORTANT]
> **#1 是 bug，应该立即修复**，否则刚实现的导入功能写入 Firestore 后会丢失 `source` 标记。
