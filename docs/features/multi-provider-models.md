# 多 Provider 模型接入说明

更新时间：2026-03-28

## 1. 目标

OpenSynapse 现在不再把模型列表写死成一组 Gemini 字符串，而是改成了可扩展的多 provider 注册表：

- Gemini：支持 Gemini CLI / Code Assist OAuth，或 `GEMINI_API_KEY`
- OpenAI：当前使用 `OPENAI_API_KEY`
- MiniMax：当前使用 `MINIMAX_API_KEY`
- Zhipu GLM：当前使用 `ZHIPU_API_KEY`
- Moonshot Kimi：当前使用 `MOONSHOT_API_KEY`

核心文件：

- `src/lib/aiModels.ts`
- `src/lib/providerGateway.ts`
- `src/api/ai.ts`

## 2. 现在支持的模型

### 2.1 Gemini

- `gemini/gemini-3-flash-preview`
- `gemini/gemini-3.1-pro-preview`
- `gemini/gemini-2.5-pro`
- `gemini/gemini-2.5-flash`
- `gemini/gemini-2.5-flash-lite`

### 2.2 OpenAI

截至 2026-03-28，我核对 OpenAI 官方模型页时，公开列出的 GPT-5 系列是：

- `openai/gpt-5.2`
- `openai/gpt-5.2-pro`
- `openai/gpt-5-mini`

项目里没有硬塞 `gpt-5.4`，原因是我这次查到的 OpenAI 官方公开模型页并没有把它列为可直接接入的公开 API 模型名。

### 2.3 MiniMax

截至 2026-03-28，我核对 MiniMax 官方模型文档时，当前接入的是：

- `minimax/MiniMax-M2.5`
- `minimax/MiniMax-M2.5-highspeed`

项目里没有直接写 `MiniMax 2.7`，因为这次核对到的官方文档主力模型名是 `MiniMax-M2.5` 系列。

### 2.4 Zhipu GLM

截至 2026-03-28，我核对智谱官方 API 文档时，当前接入的是：

- `zhipu/glm-5`
- `zhipu/glm-4.7`

项目里没有直接写 `glm-5.1`，因为这次核对到的官方公开 API 名称是 `glm-5`。

### 2.5 Moonshot Kimi

截至 2026-03-28，我核对 Moonshot 官方文档 / 官方博客时，当前接入的是：

- `moonshot/kimi-k2-thinking`
- `moonshot/kimi-k2-thinking-turbo`
- `moonshot/kimi-k2-0905-preview`
- `moonshot/kimi-k2-turbo-preview`

项目里没有把 `kimi2.5` 当作官方模型名写进去，因为 Moonshot 当前官方公开 API 名称是 `K2` 系列。

## 3. 鉴权设计

### 3.1 Gemini

Gemini 维持当前实现：

- 优先复用 Gemini CLI / Code Assist OAuth
- 也允许 `GEMINI_API_KEY`

### 3.2 其他 provider

其他 provider 目前统一使用 API Key：

- `OPENAI_API_KEY`
- `MINIMAX_API_KEY`
- `ZHIPU_API_KEY`
- `MOONSHOT_API_KEY`

### 3.3 为什么没有实现 OpenAI OAuth

这不是偷懒，而是基于当前官方文档做的边界判断：

- 截至 2026-03-28，我核对到的 OpenAI 官方 API 认证文档仍然是 API key 认证
- 没有看到“你自己的应用直接调用 OpenAI 模型时，用终端 OAuth 登录替代 API key”的官方路径

所以当前项目对 OpenAI 的实现是：

- 先落稳定可用的 `OPENAI_API_KEY`
- 同时把 provider / auth 结构抽象好
- 如果以后 OpenAI 官方真的开放适用于这个场景的 OAuth，我们只需要在 provider 层补一条 auth adapter，而不用重写前端或业务层

## 4. 代码结构

### 4.1 `src/lib/aiModels.ts`

这是整个多 provider 方案的单一真相源，负责：

- provider 定义
- 模型注册
- 默认模型
- fallback 关系
- `provider/model` 解析
- 旧模型 ID 兼容

### 4.2 `src/api/ai.ts`

服务端路由按模型前缀分发：

- `gemini/...` -> Gemini API Key 或 Code Assist OAuth
- 其他 provider -> `src/lib/providerGateway.ts`

### 4.3 `src/lib/providerGateway.ts`

当前负责 API key provider 的统一调用适配：

- 把现有的 Gemini 风格 `contents` 转成 OpenAI-compatible `messages`
- 统一走各家 `/chat/completions`
- 流式优先，必要时可回退

## 5. 自定义模型的约定

现在自定义模型输入建议使用完整格式：

```txt
provider/model
```

例如：

```txt
openai/gpt-5.2
gemini/gemini-2.5-flash
moonshot/kimi-k2-thinking
```

如果输入的是旧的裸模型名，比如 `gemini-2.5-flash` 或 `gpt-5.2`，系统会尽量自动推断 provider。

## 6. 未来更新模型时怎么做

以后有新模型，不要在组件里直接写字符串。只按下面步骤更新：

1. 去官方文档核对最新模型名
2. 只改 `src/lib/aiModels.ts`
3. 如果需要，补 `MODEL_FALLBACKS`
4. 如果是新 provider，再补 `AI_PROVIDERS`
5. 如果该 provider 的协议不同，再补 `src/lib/providerGateway.ts`
6. 运行 `npm run lint`
7. 至少验证：
   - 一个 Gemini 模型
   - 一个 API key provider
   - 前端模型切换 UI

## 7. 当前边界

### 7.1 结构化任务仍默认走 Gemini

像这些功能：

- 提取资产
- 文档解构
- 目录识别
- embedding / 语义搜索

当前仍主要围绕 Gemini 路径设计。这样做是为了先保证现有功能稳定，而不是一口气把所有 provider 的结构化输出差异都吃掉。

### 7.2 API key provider 先保证“能聊天”，再逐步补齐“高级能力”

当前多 provider 优先级是：

1. 模型切换可用
2. 后端分发稳定
3. 缺少密钥时提示清晰
4. 未来再逐步补更深的 provider 特性

## 8. 官方来源

- OpenAI models: <https://platform.openai.com/docs/models>
- OpenAI authentication: <https://platform.openai.com/docs/api-reference/authentication>
- MiniMax text models: <https://platform.minimax.io/docs/guide/Models/Text%20Models>
- MiniMax OpenAI-compatible API: <https://platform.minimax.io/docs/guide/text-generation?id=65f0b757af0af4d4dd8a1153>
- Zhipu API docs: <https://open.bigmodel.cn/dev/api>
- Moonshot docs: <https://platform.moonshot.ai/docs>
- Moonshot K2 announcement: <https://platform.moonshot.ai/blog>
