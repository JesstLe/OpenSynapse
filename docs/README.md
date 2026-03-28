# OpenSynapse 文档中心

欢迎来到 OpenSynapse 文档中心！这里整理了项目的所有技术文档和使用指南。

## 📚 文档索引

### 🔐 认证相关 (docs/auth/)

| 文档 | 说明 | 适用场景 |
|------|------|----------|
| [OAUTH_USAGE.md](./auth/OAUTH_USAGE.md) | OAuth 2.0 使用指南 | 需要使用浏览器 OAuth 登录 |
| [gemini-cli-auth-reference.md](./auth/gemini-cli-auth-reference.md) | OpenClaw OAuth 实现参考 | 想了解 OAuth 实现细节 |
| [gemini-cli-code-assist-auth-tutorial.md](./auth/gemini-cli-code-assist-auth-tutorial.md) | Gemini CLI / Code Assist 认证教程 | 配置 Gemini CLI 风格认证 |
| [qq-wechat-firebase-sync-design.md](./auth/qq-wechat-firebase-sync-design.md) | QQ / 微信登录与 Firebase 云同步设计 | 规划第三方登录与账号绑定 |

### 🚀 部署相关 (docs/deployment/)

| 文档 | 说明 | 适用场景 |
|------|------|----------|
| [cloud-server-deployment.md](./deployment/cloud-server-deployment.md) | 云服务器完整部署手册 | 首次上线、生产部署、更新与回滚 |

### 🛡️ 安全相关 (docs/security/)

| 文档 | 说明 | 适用场景 |
|------|------|----------|
| [llm-security-risk-design.md](./security/llm-security-risk-design.md) | LLM 风险与安全设计 | 防提示词注入、角色保护、RAG 安全、凭证与审计 |

### 💰 商业化相关 (docs/business/)

| 文档 | 说明 | 适用场景 |
|------|------|----------|
| [monetization-billing-architecture.md](./business/monetization-billing-architecture.md) | 商业化付费与账单架构设计 | 自用 / 商用共存、BYOK、平台托管额度、利润模型 |

### ✨ 功能实现 (docs/features/)

| 文档 | 说明 | 适用场景 |
|------|------|----------|
| [gemini-like-chat-implementation.md](./features/gemini-like-chat-implementation.md) | Gemini 风格聊天实现方案 | 改进聊天体验 |
| [multi-provider-models.md](./features/multi-provider-models.md) | 多 Provider 模型接入说明 | 维护模型列表与鉴权策略 |

### 📋 项目规划

| 文档 | 说明 | 位置 |
|------|------|------|
| [implementation_plan.md](./implementation_plan.md) | 详细实现计划 | 项目根目录 |
| [PLAN.md](../PLAN.md) | 发展规划 | 项目根目录 |
| [AGENTS.md](../AGENTS.md) | 开发指南 | 项目根目录 |

## 🗂️ 项目结构

```
OpenSynapse/
├── README.md                 # 项目主文档
├── AGENTS.md                 # AI 助手开发指南
├── PLAN.md                   # 项目发展规划
├── package.json              # 项目配置
│
├── docs/                     # 📚 文档目录
│   ├── README.md            # 本文档
│   ├── implementation_plan.md
│   ├── auth/                # 🔐 认证文档
│   │   ├── OAUTH_USAGE.md
│   │   ├── gemini-cli-auth-reference.md
│   │   ├── gemini-cli-code-assist-auth-tutorial.md
│   │   └── qq-wechat-firebase-sync-design.md
│   ├── deployment/          # 🚀 部署文档
│   │   └── cloud-server-deployment.md
│   ├── security/            # 🛡️ 安全文档
│   │   └── llm-security-risk-design.md
│   ├── business/            # 💰 商业化文档
│   │   └── monetization-billing-architecture.md
│   └── features/            # ✨ 功能文档
│       └── gemini-like-chat-implementation.md
│
├── scripts/                 # 🛠️ 工具脚本
│   ├── cli.ts               # CLI 主程序
│   ├── cli-auth.ts          # 认证命令
│   └── test/               # 测试脚本
│
├── config/                  # ⚙️ 配置文件
│   ├── firebase-applet-config.json
│   ├── firebase-blueprint.json
│   └── firestore.rules
│
└── src/                     # 💻 源代码
    ├── components/          # React 组件
    ├── lib/                 # 工具库
    └── services/            # 业务逻辑
```

## 🚀 快速开始

### CLI 工具使用

```bash
# 使用浏览器 OAuth 登录
npx tsx scripts/cli.ts auth login

# 查看登录状态
npx tsx scripts/cli.ts auth status

# 处理文件
npx tsx scripts/cli.ts path/to/file.txt
```

### 开发服务器

```bash
npm run dev        # 启动开发服务器
npm run build      # 构建生产版本
npm run lint       # 类型检查
```

## 📝 文档贡献

添加新文档时，请：

1. 将文档放入合适的子目录 (`auth/`、`features/` 等)
2. 更新本文档索引
3. 遵循 Markdown 格式规范
4. 添加适当的代码示例

## 🔗 相关链接

- [项目主页](https://github.com/JesstLe/OpenSynapse)
- [README](../README.md)
- [PLAN](../PLAN.md)
