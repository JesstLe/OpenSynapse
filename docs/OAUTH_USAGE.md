# OAuth 2.0 认证使用说明

**功能**: 使用 Google 账号通过浏览器 OAuth 登录，无需 API Key  
**端口**: 3088 (避免与 8085 冲突)  
**存储路径**: `~/.opensynapse/credentials.json`

---

## 快速开始

### 1. 登录

```bash
npx tsx cli.ts auth login
```

流程：
1. 终端显示授权 URL
2. 浏览器自动打开（或手动复制到浏览器）
3. 使用 Google 账号登录并点击"允许"
4. 看到"认证成功"页面后，返回终端
5. 凭证自动保存到 `~/.opensynapse/credentials.json`

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
2. 使用凭证调用 Gemini API
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
3. **GoogleAuth ADC** (gcloud CLI 配置)

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
│         │ ──7. 保存凭证到本地文件────────────▶│          │
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
- **自动刷新**: 使用 `getValidAccessToken()` 自动处理过期

---

## 故障排除

### 端口 3088 被占用

如果端口被占用，修改 `src/lib/oauth.ts` 中的 `PORT` 常量：

```typescript
const OAUTH_CONFIG = {
  PORT: 3089,  // 改为其他端口
  // ...
}
```

### "No credentials found"

运行登录命令：
```bash
npx tsx cli.ts auth login
```

### Token 刷新失败

尝试重新登录：
```bash
npx tsx cli.ts auth logout
npx tsx cli.ts auth login
```

### 浏览器未自动打开

手动复制终端显示的 URL 到浏览器中打开。

---

## 文件结构

```
src/lib/oauth.ts      - OAuth 核心实现 (PKCE、服务器、Token管理)
cli-auth.ts           - CLI auth 命令实现 (login/logout/status)
cli.ts                - 修改后的 CLI，支持 OAuth
```

---

## 对比：OAuth vs API Key

| 特性 | OAuth | API Key |
|------|-------|---------|
| 需要 Google Cloud Console 配置 | ✅ 需要创建 OAuth 客户端 | ❌ 不需要 |
| 用户操作 | 浏览器授权一次 | 手动复制粘贴 Key |
| 安全性 | 高 (Token 自动刷新) | 中 (Key 泄露风险) |
| 适用场景 | 终端用户应用 | 开发者个人使用 |
| 成本 | 免费 | 可能需要购买额度 |

---

## 下一步（可选）

- [ ] 在 `src/api/ai.ts` 后端路由中也支持 OAuth
- [ ] 添加 Web 界面 OAuth 登录（React 组件）
- [ ] 支持多个 Google 账号切换

---

**创建时间**: 2025-03-27  
**端口**: 3088  
**版本**: v1.0
