# OpenCode 集成文档

本文档描述 OpenSynapse 的 OpenCode Agent 架构集成。

## 架构概览

```
OpenCode Agent → OpenSynapse SDK → OpenSynapse Core → Obsidian
                ↓
              CLI Tool
                ↓
              Skill (MCP)
```

## 已实现功能

### 1. OpenCode SDK 集成

**文件**: `src/lib/opencode/client.ts`

提供 OpenCode SDK 的封装：
- 单例模式管理客户端
- 自动配置管理
- 连接状态检查

```typescript
import { getOpenCodeClient } from './lib/opencode/client';

const oc = getOpenCodeClient();
const available = await isOpenCodeAvailable();
```

### 2. CLI 工具

**文件**: `scripts/cli-opencode.ts`

命令行工具支持：

```bash
# 检查 OpenCode 连接状态
npx tsx scripts/cli-opencode.ts status
```

添加到 package.json scripts：
```json
{
  "scripts": {
    "oc:status": "tsx scripts/cli-opencode.ts status"
  }
}
```

### 3. OpenCode Skill

**文件**: 
- `~/.agents/skills/opensynapse/skill.json` - Skill 配置
- `scripts/skill-server.ts` - MCP 服务器

提供给 OpenCode 的工具：
- `save_note` - 保存笔记
- `check_status` - 检查连接状态

### 4. Obsidian 集成

**文件**: `src/lib/obsidian/integration.ts`

功能：
- 保存笔记到 Obsidian vault
- 读取 Obsidian 笔记
- 批量同步
- Frontmatter 支持

```typescript
import { ObsidianIntegration } from './lib/obsidian/integration';

const obsidian = new ObsidianIntegration('/path/to/vault');
await obsidian.saveNote({
  title: 'My Note',
  content: 'Note content',
  tags: ['tag1', 'tag2'],
  createdAt: new Date(),
  updatedAt: new Date(),
});
```

## 环境变量

```bash
# OpenCode 服务器地址
OPENCODE_BASE_URL=http://localhost:54321
```

## 安装依赖

```bash
npm install @opencode-ai/sdk @modelcontextprotocol/sdk commander
```

## 使用方式

### 作为 Agent 使用

1. 启动 OpenCode 服务器
2. 使用 `getOpenCodeClient()` 获取客户端
3. 调用 OpenCode 的 session API

### 作为 CLI 使用

```bash
npm run oc:status
```

### 作为 Skill 使用

在 OpenCode 配置中添加 Skill：

```json
{
  "skills": [{
    "name": "opensynapse",
    "command": "node /Users/lv/Workspace/OpenSynapse/scripts/skill-server.js"
  }]
}
```

### 同步到 Obsidian

```typescript
const obsidian = new ObsidianIntegration('/path/to/vault');
const notes = await getNotesFromOpenSynapse();
await obsidian.syncFromOpenSynapse(notes);
```

## Git 提交记录

- `68a9ff1` - OpenCode SDK 基础集成
- `656c31c` - CLI 工具
- `a27de5e` - OpenCode Skill (MCP)
- `ca1c7ed` - Obsidian 集成

## 下一步

- [ ] 将现有 LLM 调用迁移到 OpenCode Agent
- [ ] 添加更多 Skill 工具
- [ ] 实现双向 Obsidian 同步
- [ ] 添加错误处理和重试机制
