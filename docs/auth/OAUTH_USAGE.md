# OAuth 2.0 认证使用说明

**功能**: 使用 Gemini CLI / Google Code Assist 风格的 Google 账号登录，无需 API Key  
**端口**: 3088  
**存储路径**: `~/.opensynapse/credentials.json`

---

## 快速开始

默认情况下，CLI 会优先复用本机已安装 `gemini` 命令内置的 OAuth client，因此通常不需要手动创建 Google Cloud Console 的 desktop client。

如果你想显式覆盖它，再配置：

```bash
cp .env.example .env.local
```

然后在 `.env.local` 中填写可选覆盖项：

```bash
OPENSYNAPSE_GEMINI_OAUTH_CLIENT_ID=your_oauth_client_id
OPENSYNAPSE_GEMINI_OAUTH_CLIENT_SECRET=your_oauth_client_secret
```

### 1. 登录

```bash
npx tsx cli.ts auth login
```

流程：
1. 终端显示授权 URL
2. 浏览器自动打开（或手动复制到浏览器）
3. 使用 Google 账号登录并点击"允许"
4. 看到"认证成功"页面后，返回终端
5. CLI 会自动探测账号邮箱和 Code Assist project
6. 凭证自动保存到 `~/.opensynapse/credentials.json`

### 2. 查看登录状态

```bash
npx tsx cli.ts auth status
```

显示：
- 是否已登录
- 凭证路径
- Access Token 有效期

### 3. 使用 CLI 处理文件

登录后，直接运行：

```bash
npx tsx cli.ts path/to/your/file.txt
```

CLI 会自动：
1. 检测 OAuth 凭证
2. 使用保存的 Gemini CLI / Code Assist 凭证调用 `cloudcode-pa.googleapis.com`
3. 无需设置 `GEMINI_API_KEY` 环境变量

### 4. 退出登录

```bash
npx tsx cli.ts auth logout
```

删除保存的凭证文件。

---

## 认证优先级

CLI 按以下优先级选择认证方式：

1. **OAuth 凭证** (`~/.opensynapse/credentials.json`)
2. **API Key** (`GEMINI_API_KEY` 环境变量)
3. **GoogleAuth ADC** (gcloud / ADC 配置)

---

## 技术细节

### OAuth 2.0 + PKCE 流程

```
┌─────────┐                                    ┌──────────┐
│   CLI   │ ──1. 生成 PKCE 参数────────────────▶│          │
│         │                                    │          │
│         │ ──2. 启动本地服务器:3088───────────▶│          │
│         │                                    │  Google  │
│         │ ──3. 打开浏览器访问授权页──────────▶│  OAuth   │
│         │                                    │  Server  │
│         │ ◀─4. 用户登录并授权────────────────│          │
│         │                                    │          │
│         │ ◀─5. 重定向到 localhost:3088───────│          │
│         │      (携带 authorization code)     │          │
│         │                                    │          │
│         │ ──6. 用 code 换取 access_token─────▶│          │
│         │                                    │          │
│         │ ──7. 调用 Code Assist 探测 project ─▶│         │
│         │                                    │          │
│         │ ──8. 保存凭证到本地文件────────────▶│          │
└─────────┘                                    └──────────┘
```

### 安全特性

- **PKCE**: 防止授权码被截获
- **State 参数**: 防止 CSRF 攻击
- **Token 自动刷新**: Access Token 过期前自动刷新
- **文件权限**: 凭证文件设置为 0o600 (仅所有者可读写)

### Token 管理

- **Access Token**: 有效期约 1 小时
- **Refresh Token**: 长期有效（除非用户撤销）
- **自动刷新**: CLI 会基于保存的 refresh token 自动续期
- **授权范围**: 当前登录会请求 `cloud-platform`、`userinfo.email`、`userinfo.profile`
- **后端接口**: 当前 CLI 的 OAuth 路径走 Gemini CLI / Code Assist 后端 `cloudcode-pa.googleapis.com`

---

## 故障排除

### 端口 3088 被占用

认证命令会在本地监听 `localhost:3088`。如果之前有残留的登录进程，可以先关闭它：

```bash
lsof -nP -iTCP:3088 -sTCP:LISTEN
kill <PID>
```

### "No credentials found"

运行登录命令：
```bash
npx tsx cli.ts auth login
```

### Token 刷新失败 / 旧版凭证不兼容

尝试重新登录：
```bash
npx tsx cli.ts auth logout
npx tsx cli.ts auth login
```

### 当前账号需要 project

部分 Code Assist 账号需要显式设置 `GOOGLE_CLOUD_PROJECT` 或 `GOOGLE_CLOUD_PROJECT_ID`：

```bash
GOOGLE_CLOUD_PROJECT=your-project-id
```

### 浏览器未自动打开

手动复制终端显示的 URL 到浏览器中打开。

---

## 文件结构

```
src/lib/oauth.ts      - OAuth 核心实现 (PKCE、Gemini CLI client 解析、Token 管理)
src/lib/codeAssist.ts - Code Assist generateContent 请求封装
cli-auth.ts           - CLI auth 命令实现 (login/logout/status)
cli.ts                - CLI 主入口，优先走 Code Assist OAuth
```

---

## 对比：OAuth vs API Key

| 特性 | Gemini CLI OAuth | API Key |
|------|------------------|---------|
| 需要手动创建 OAuth 客户端 | 通常不需要 | 不需要 |
| 用户操作 | 浏览器授权一次 | 手动复制粘贴 Key |
| 安全性 | 高 (Token 自动刷新) | 中 (Key 泄露风险) |
| 适用场景 | 类 OpenClaw / Gemini CLI 终端体验 | 开发者个人使用 |
| 成本 | 取决于账号对应 Code Assist tier | 取决于 Gemini API 额度 |

---

## 下一步（可选）

- [ ] 在 `src/api/ai.ts` 后端路由中接入 Code Assist OAuth
- [ ] 添加 Web 界面 OAuth 登录（React 组件）
- [ ] 支持多个 Google 账号切换

---

**创建时间**: 2025-03-27  
**端口**: 3088  
**版本**: v1.0
