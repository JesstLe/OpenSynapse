# OpenCode 集成文档

本文档描述 OpenSynapse 的 OpenCode Agent 架构集成。

## 架构概览

```
OpenCode Agent → OpenSynapse SDK → Obsidian
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
npm run oc:status
```

### 3. OpenCode Skill (MCP)

**配置文件**: `~/.agents/skills/opensynapse/skill.json`
**服务器文件**: `scripts/skill-server.ts`

提供给 OpenCode 的工具：

| 工具名 | 功能 | 参数 |
|--------|------|------|
| `save_to_opensynapse` | 保存笔记到 Obsidian | `title`, `content`, `tags`, `vaultPath?` |
| `search_knowledge` | 搜索知识库（需后端） | `query`, `limit?` |
| `sync_to_obsidian` | 同步到 Obsidian（需后端） | `vaultPath` |
| `check_status` | 检查连接状态 | 无 |

**环境变量**:
```bash
export OBSIDIAN_VAULT_PATH="/path/to/your/vault"
export OPENCODE_BASE_URL="http://localhost:54321"  # 可选，默认
```

**Skill 启动命令**:
```bash
npx tsx /Users/lv/Workspace/OpenSynapse/scripts/skill-server.ts
```

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

## 安装依赖

```bash
npm install
```

依赖包括：
- `@opencode-ai/sdk` - OpenCode SDK
- `@modelcontextprotocol/sdk` - MCP SDK
- `commander` - CLI 框架

## 使用方法

### 方式一：CLI

```bash
# 检查 OpenCode 连接
npm run oc:status
```

### 方式二：Skill

1. 配置环境变量：
```bash
export OBSIDIAN_VAULT_PATH="/path/to/your/obsidian/vault"
```

2. 在 OpenCode 中配置 Skill：
```json
{
  "skills": [{
    "name": "opensynapse",
    "command": "npx tsx /Users/lv/Workspace/OpenSynapse/scripts/skill-server.ts"
  }]
}
```

3. 使用工具：
```
/skill opensynapse save_to_opensynapse --title "笔记标题" --content "笔记内容"
```

### 方式三：代码调用

```typescript
import { ObsidianIntegration } from './lib/obsidian/integration';

const obsidian = new ObsidianIntegration('/path/to/vault');
await obsidian.saveNote({
  title: '笔记标题',
  content: '# 标题\n\n内容',
  tags: ['标签1', '标签2'],
  createdAt: new Date(),
  updatedAt: new Date(),
});
```

## Git 提交记录

```
68a9ff1 feat: add OpenCode SDK integration foundation
656c31c feat: add CLI tool with OpenCode support
a27de5e feat: add OpenCode Skill with MCP support
ca1c7ed feat: add Obsidian integration
db505ea docs: add OpenCode integration documentation
efc451e fix: address Oracle verification issues
```

## 注意事项

- `save_to_opensynapse` 需要配置 `OBSIDIAN_VAULT_PATH` 环境变量或传入 `vaultPath` 参数
- `search_knowledge` 和 `sync_to_obsidian` 需要 OpenSynapse 后端 Firestore 连接
- 确保 Obsidian vault 路径有写入权限
