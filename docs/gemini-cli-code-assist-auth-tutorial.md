# OpenSynapse Gemini CLI / Code Assist 认证与调用教程

**项目**: OpenSynapse  
**日期**: 2026-03-28  
**适用范围**: CLI 登录、服务端复用登录态、Code Assist 对话调用、历史踩坑说明

---

## 1. 这份文档解决什么问题

本教程回答 4 件事：

1. 我们现在的登录认证功能到底是怎么实现的
2. 为什么没有继续走普通 `GEMINI_API_KEY` 或自建 Google OAuth Desktop Client
3. 这条链路在实现过程中踩过哪些坑，为什么会失败
4. 现在项目里“正确”的最新调用方式是什么

如果你只想快速用，先看：

- [docs/OAUTH_USAGE.md](/Users/lv/Workspace/OpenSynapse/docs/OAUTH_USAGE.md)

如果你想知道我们为什么这么实现、代码在哪、怎么调试，继续看这份教程。

---

## 2. 最终采用的方案

我们最终没有采用“自建 Gemini API OAuth 客户端 + 直接调 Developer API”的路线，而是采用了：

- **Gemini CLI / Google Code Assist 风格登录**
- **复用本机已安装 `gemini` CLI 内置的 OAuth client**
- **拿到 Google 登录后的 access token / refresh token**
- **调用 `cloudcode-pa.googleapis.com` 的 Code Assist 接口**

一句话概括：

**登录像 Gemini CLI，调用也尽量像 Gemini CLI。**

---

## 3. 为什么选这条路

最初我们尝试过两种更“直觉”的做法，但都不够稳。

### 3.1 方案 A：直接用 `GEMINI_API_KEY`

优点：

- 简单
- 官方标准路径
- 适合稳定服务端

缺点：

- 用户需要自己管理 API Key
- 不像 Gemini CLI 那样“浏览器登录一次就能用”

### 3.2 方案 B：自建 Google OAuth Desktop Client

我们尝试过：

- 自己在 Google Cloud Console 创建 OAuth Client
- 浏览器打开授权页
- 本地回调拿 code
- 用 code 换 token
- 再把 access token 交给模型 SDK

这条路表面上能登录，但后面会撞坑：

- `client_secret is missing`
- `redirect_uri_mismatch`
- `invalid_scope`
- `ACCESS_TOKEN_SCOPE_INSUFFICIENT`
- access token 不能直接当 Gemini API key 用

更关键的是：

**OpenClaw 和 Gemini CLI 真正能跑通的并不是这条路。**

它们本质上走的是：

- Google Code Assist OAuth
- `cloudcode-pa.googleapis.com`
- Gemini CLI 内置 client

所以我们最后决定直接复刻这条更接近真实 Gemini CLI 的方案。

---

## 4. 当前实现结构

当前认证与调用相关代码主要在这几个文件：

- [src/lib/oauth.ts](/Users/lv/Workspace/OpenSynapse/src/lib/oauth.ts)
- [src/lib/codeAssist.ts](/Users/lv/Workspace/OpenSynapse/src/lib/codeAssist.ts)
- [cli-auth.ts](/Users/lv/Workspace/OpenSynapse/cli-auth.ts)
- [cli.ts](/Users/lv/Workspace/OpenSynapse/cli.ts)
- [src/api/ai.ts](/Users/lv/Workspace/OpenSynapse/src/api/ai.ts)

各自职责如下：

### 4.1 `src/lib/oauth.ts`

负责：

- 解析 Gemini CLI 内置 OAuth client
- 生成 PKCE
- 启动本地回调服务
- 构造 Google 授权 URL
- 用 code 换 token
- 自动刷新 token
- 调用 Code Assist 探测用户 project
- 保存本地凭证

### 4.2 `src/lib/codeAssist.ts`

负责：

- 把 OpenSynapse 的 `generateContent` 请求转成 Code Assist 请求体
- 调用 `cloudcode-pa.googleapis.com/v1internal:generateContent`
- 处理 fallback 模型
- 把响应里的文本抽出来

### 4.3 `cli-auth.ts`

负责：

- `auth login`
- `auth status`
- `auth logout`

### 4.4 `cli.ts`

负责：

- CLI 启动时优先检查本地 OAuth 凭证
- 如果本地凭证兼容，就走 Code Assist
- 否则再退到 API Key 或 ADC

### 4.5 `src/api/ai.ts`

负责：

- Web 端 `/api/ai/generateContent`
- 优先用 API Key
- 没 API Key 时复用本地保存的 Gemini CLI / Code Assist 登录态

也就是说：

- CLI 和 Web 后端现在都可以复用同一份登录态
- 凭证保存一次即可

---

## 5. 登录流程长什么样

## 5.1 本地回调地址

当前本地回调固定为：

```txt
http://localhost:3088/oauth2callback
```

代码位置：

- [src/lib/oauth.ts](/Users/lv/Workspace/OpenSynapse/src/lib/oauth.ts)

## 5.2 OAuth scopes

当前请求的 scope 是：

```txt
https://www.googleapis.com/auth/cloud-platform
https://www.googleapis.com/auth/userinfo.email
https://www.googleapis.com/auth/userinfo.profile
```

注意：

**这里没有再使用 `generative-language` scope。**

这是我们踩坑后得出的结论，后面会详细讲。

## 5.3 凭证存储位置

本地凭证保存到：

```txt
~/.opensynapse/credentials.json
```

结构大致是：

```json
{
  "access_token": "ya29....",
  "refresh_token": "1//0....",
  "expires_at": 1774670000000,
  "token_type": "Bearer",
  "scope": "https://www.googleapis.com/auth/cloud-platform ...",
  "client_id": "681255809395-....apps.googleusercontent.com",
  "email": "you@example.com",
  "project_id": "your-code-assist-project"
}
```

---

## 6. 登录功能怎么实现

## 6.1 解析 Gemini CLI 内置 client

这是整条链路最关键的一步。

`src/lib/oauth.ts` 会优先尝试：

1. 从环境变量读取显式覆盖的 client id / secret
2. 从已安装的 `gemini` 命令所在目录里，解析 Gemini CLI 自带的 `oauth2.js`
3. 如果都没有，再退回旧环境变量

也就是说，默认情况下：

**用户不需要自己去 Google Cloud Console 新建 Desktop Client。**

这点和 OpenClaw 的实现思路一致。

## 6.2 生成 PKCE

登录前会生成：

- `verifier`
- `challenge`

用于：

- 防止授权码被截获
- 符合现代 OAuth 公共客户端安全要求

## 6.3 启动本地 HTTP 服务器

认证命令启动后，会在本地监听：

```txt
localhost:3088
```

用户在浏览器完成授权后，Google 会把 `code` 回调到：

```txt
/oauth2callback
```

## 6.4 用 code 换 token

拿到 `authorization_code` 后，会请求：

```txt
https://oauth2.googleapis.com/token
```

并带上：

- `client_id`
- `client_secret`（如果当前 client 需要）
- `code`
- `code_verifier`
- `grant_type=authorization_code`

## 6.5 探测 Code Assist project

仅拿到 token 还不够。

后续我们还会调用：

- `v1internal:loadCodeAssist`
- 必要时 `v1internal:onboardUser`

作用是：

- 探测当前账号有没有可用 project
- 没有的话尝试创建 / onboard
- 最终把 `project_id` 写入本地凭证

这一步是后面调用 `generateContent` 的前提。

---

## 7. 现在怎么登录

在项目根目录执行：

```bash
npx tsx cli.ts auth login
```

常见流程：

1. 终端显示 OAuth client 来源
2. 终端打印授权 URL
3. 浏览器打开 Google 登录页
4. 用户同意授权
5. 浏览器显示“认证成功”
6. 终端保存凭证并显示：
   - 账号邮箱
   - Code Assist Project
   - Token 过期时间

查看状态：

```bash
npx tsx cli.ts auth status
```

退出登录：

```bash
npx tsx cli.ts auth logout
```

---

## 8. 当前“正确”的调用方式

这部分是本教程最重要的内容。

## 8.1 CLI 里的调用

当前 CLI 启动时，认证优先级是：

1. 本地 Gemini CLI / Code Assist OAuth 凭证
2. `GEMINI_API_KEY`
3. ADC / GoogleAuth

代码位置：

- [cli.ts](/Users/lv/Workspace/OpenSynapse/cli.ts)

只要本地已经登录成功，CLI 就会走：

- `generateContentWithCodeAssist()`

而不是继续把 access token 当作 API key。

## 8.2 Web 后端的调用

当前 Web 服务端 `/api/ai/generateContent` 的逻辑是：

1. 如果配置了 `GEMINI_API_KEY`，走官方 API key client
2. 否则读取 `~/.opensynapse/credentials.json`
3. 检查凭证是否与当前 Gemini CLI client 兼容
4. 调用 `generateContentWithCodeAssist()`

代码位置：

- [src/api/ai.ts](/Users/lv/Workspace/OpenSynapse/src/api/ai.ts)

## 8.3 最新的请求落点

当前最终调用的后端接口是：

```txt
POST https://cloudcode-pa.googleapis.com/v1internal:generateContent
```

请求头核心字段：

```txt
Authorization: Bearer <access_token>
Content-Type: application/json
User-Agent: google-api-nodejs-client/9.15.1
X-Goog-Api-Client: gl-node/opensynapse-cli
```

请求体核心结构：

```json
{
  "model": "gemini-2.5-flash",
  "project": "your-code-assist-project",
  "user_prompt_id": "uuid",
  "request": {
    "contents": [...],
    "systemInstruction": {...},
    "generationConfig": {...},
    "session_id": ""
  }
}
```

组装逻辑在：

- [src/lib/codeAssist.ts](/Users/lv/Workspace/OpenSynapse/src/lib/codeAssist.ts)

## 8.4 模型 fallback

当前调用不是只打一种模型，而是会按配置 fallback。

模型配置在：

- [src/lib/aiModels.ts](/Users/lv/Workspace/OpenSynapse/src/lib/aiModels.ts)

当前 fallback 思路大致是：

- `gemini-3-flash-preview` 不可用时，退到 `gemini-2.5-flash` / `gemini-2.5-flash-lite`
- `gemini-3.1-pro-preview` 不可用时，退到 `gemini-2.5-pro` / `gemini-2.5-flash-lite`

触发条件通常是：

- `429 RATE_LIMIT_EXCEEDED`
- `MODEL_CAPACITY_EXHAUSTED`
- `404 NOT_FOUND`

---

## 9. 我们踩过的坑

这部分是整个迁移里最有价值的经验。

## 9.1 坑一：回调端口和 redirect URI 不一致

我们一开始出现过这种情况：

- 本地监听一个端口
- `REDIRECT_URI` 却写成另一个端口

结果就是：

- 浏览器授权看起来正常
- 回调时直接 `ERR_CONNECTION_REFUSED`

最终修正：

- 本地监听和 `REDIRECT_URI` 统一到同一地址
- 当前固定为 `http://localhost:3088/oauth2callback`

## 9.2 坑二：本地端口被占用

如果 `3088` 已被别的进程占用，登录命令一启动就会失败：

```txt
EADDRINUSE
```

解决办法：

```bash
lsof -nP -iTCP:3088 -sTCP:LISTEN
kill <PID>
```

## 9.3 坑三：使用自建 OAuth client 时缺少 `client_secret`

我们一度尝试使用自己在 Google Cloud Console 下载的 Desktop Client JSON。

表面上浏览器能授权成功，但换 token 时失败：

```txt
client_secret is missing
```

根因：

- 当前 client 类型在这个流程里实际上仍要求 `client_secret`
- 只带 `client_id` 不够

最终结论：

- 不再以“自己新建 Desktop Client”作为主路径
- 默认优先复用 Gemini CLI 内置 client

## 9.4 坑四：自建 OAuth + `generative-language` scope 失败

我们尝试过把 scope 改成：

```txt
https://www.googleapis.com/auth/generative-language
```

结果授权阶段直接报：

```txt
invalid_scope
```

这说明：

- 这条自建浏览器 OAuth 流程并不适合这么接 Gemini Developer API
- 至少它不是 OpenClaw / Gemini CLI 的真实路径

最终修正：

- 不再走 `generative-language` scope
- 改走 `cloud-platform + userinfo.*`
- 调用 Code Assist 后端

## 9.5 坑五：把 OAuth access token 当成 `apiKey`

这是一个很容易犯的错。

错误做法是：

- 浏览器登录拿到 OAuth token
- 然后把它塞进 `new GoogleGenAI({ apiKey: access_token })`

这样并不成立。

原因：

- `apiKey` 是 Gemini API key
- `access_token` 是 OAuth Bearer token
- 它们不是同一种认证材料

最终修正：

- OAuth 登录后走 `cloudcode-pa.googleapis.com`
- API Key 路径保留给真正的 `GEMINI_API_KEY`

## 9.6 坑六：旧凭证与新 OAuth client 不兼容

我们切换实现后，之前保存过的旧凭证还在本地。

结果会出现：

- 明明有凭证
- 但调用仍然失败

最终修正：

- 在状态检查和调用前比对 `client_id`
- 不兼容就提示重新登录

代码位置：

- [src/lib/oauth.ts](/Users/lv/Workspace/OpenSynapse/src/lib/oauth.ts)
- [cli-auth.ts](/Users/lv/Workspace/OpenSynapse/cli-auth.ts)

## 9.7 坑七：有些模型在当前 Code Assist 链路并不支持

虽然官方模型页会列出一批模型，但在当前 Code Assist 路径下：

- 某些 Preview 模型可能直接 `404 NOT_FOUND`
- 某些模型会频繁 `MODEL_CAPACITY_EXHAUSTED`

这不是认证坏了，而是：

- 当前后端链路不支持该模型
或
- 当前窗口容量不够

所以后来我们加了：

- fallback 模型
- 更明确的错误提示

## 9.8 坑八：CLI 能用，不代表 Web 页面就一定稳

这也是很关键的经验。

CLI 能正常回复，只能说明：

- 认证链路通了
- 账号没问题
- Code Assist 请求至少能成功

但 Web 页面仍可能更容易 429，因为它当前的聊天链路更重：

- 长系统提示
- 全量历史
- RAG

所以“CLI 正常，页面容易限流”并不矛盾。

---

## 10. 最新验证方式

## 10.1 验证登录是否成功

```bash
npx tsx cli.ts auth status
```

你应该看到：

- 已登录
- OAuth Client
- 账号邮箱
- Code Assist Project
- Access Token 剩余有效时间

## 10.2 验证 CLI 实际调用是否成功

最直接方式是让 CLI 处理一个文件：

```bash
npx tsx cli.ts ./path/to/file.txt
```

如果想做更细粒度的 smoke test，可以在代码里直接调用：

- `generateContentWithCodeAssist()`

## 10.3 验证 Web 后端是否复用成功

启动开发服务后，可直接打：

```bash
curl -X POST http://127.0.0.1:3000/api/ai/generateContent \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "gemini-2.5-flash",
    "contents": "你好"
  }'
```

如果返回：

```json
{"text":"..."}
```

就说明：

- 服务端已经成功复用了本地登录态
- Web 路由与 CLI 一样可以工作

---

## 11. 常见排障

### 11.1 `未找到 Gemini CLI OAuth client`

说明：

- 本机没有安装 `gemini`
或
- 没配置显式覆盖的 client id / secret

解决：

- 安装 Gemini CLI
或
- 在 `.env.local` 中配置：

```bash
OPENSYNAPSE_GEMINI_OAUTH_CLIENT_ID=...
OPENSYNAPSE_GEMINI_OAUTH_CLIENT_SECRET=...
```

### 11.2 `Token request failed`

优先检查：

- 当前登录是不是旧 URL
- 本地回调服务是否仍在运行
- 端口是否被占用
- client id / secret 是否匹配

### 11.3 `当前账号需要设置 GOOGLE_CLOUD_PROJECT`

说明当前账号的 Code Assist tier 需要显式 project。

可以这样设置：

```bash
GOOGLE_CLOUD_PROJECT=your-project-id
```

或：

```bash
GOOGLE_CLOUD_PROJECT_ID=your-project-id
```

### 11.4 `429 Too Many Requests`

这不是登录失败，而是：

- 当前模型短时限流
或
- 当前模型没有容量

处理方式：

- 等几十秒再试
- 让 fallback 自动切到别的模型
- 切到更稳的 `gemini-2.5-flash`

### 11.5 `404 Requested entity was not found`

通常说明：

- 当前模型不被这条 Code Assist 链路支持

这时不要先怀疑认证，要先怀疑模型可用性。

---

## 12. 当前建议

如果你要在 OpenSynapse 里继续沿用这套登录能力，建议坚持下面这几个原则：

1. **默认优先 Gemini CLI / Code Assist 登录**
   这样用户体验最好，不用自己管 API key。

2. **不要再把 OAuth token 当 API key**
   这两个认证体系不是一回事。

3. **不要再把 `generative-language` scope 当主路径**
   我们已经验证过，这条路在当前实现里不稳，且与 OpenClaw / Gemini CLI 实际做法不一致。

4. **Web 与 CLI 共用同一份凭证**
   这样登录一次即可全项目复用。

5. **把模型可用性问题和认证问题分开看**
   认证成功不代表每个模型都能用。

---

## 13. 推荐阅读顺序

建议后续维护时按这个顺序读代码：

1. [cli-auth.ts](/Users/lv/Workspace/OpenSynapse/cli-auth.ts)
2. [src/lib/oauth.ts](/Users/lv/Workspace/OpenSynapse/src/lib/oauth.ts)
3. [src/lib/codeAssist.ts](/Users/lv/Workspace/OpenSynapse/src/lib/codeAssist.ts)
4. [src/api/ai.ts](/Users/lv/Workspace/OpenSynapse/src/api/ai.ts)
5. [cli.ts](/Users/lv/Workspace/OpenSynapse/cli.ts)

如果要看我们参考的外部思路，再看：

- [docs/gemini-cli-auth-reference.md](/Users/lv/Workspace/OpenSynapse/docs/gemini-cli-auth-reference.md)

---

## 14. 一句话总结

这套登录认证功能的本质不是“给 OpenSynapse 接了一个普通 Google OAuth”，而是：

**把 OpenSynapse 接到了 Gemini CLI / Google Code Assist 那套更接近真实终端体验的认证与调用链路上。**

而我们真正踩出来的经验是：

- 登录能成功，不代表模型就都能用
- CLI 能用，不代表 Web 请求就一定轻
- 认证、模型、限流、上下文重量，这 4 件事必须分开看

把这几点分清楚，后面的实现和排障会简单很多。
