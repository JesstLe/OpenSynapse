# Task: Production-Quality Gemini-Like Chat Overhaul

## Workstream 1: codeAssist.ts 流式可靠性
- [ ] 提取公共工具函数 (buildHeaders, is429, is404, exponentialDelay)
- [ ] 非流式路径统一用 buildHeaders + enabled_credit_types
- [ ] 重写 generateContentStreamWithCodeAssist (fallback + thinking + AbortSignal)
- [ ] 提取 parseSSEStream 独立函数

## Workstream 2: ai.ts 服务端流式升级
- [ ] 流式路由传递结构化 chunk (text/thought/error)
- [ ] 增加 X-Accel-Buffering: no 头

## Workstream 3: 前端流式消费 + 思考展示
- [ ] types.ts 增加 thought 字段
- [ ] gemini.ts SSE 消费升级 (结构化 chunk + AbortSignal)
- [ ] chatWithAIStream 增加 thinkingConfig + abortSignal
- [ ] ChatView.tsx 停止生成 (AbortController)
- [ ] ChatView.tsx 思考过程折叠展示
- [ ] ChatView.tsx 重新生成 / 编辑重发

## Workstream 4: 智能 RAG 档位
- [ ] gemini.ts shouldUseRAG + 轻量系统提示
- [ ] 历史裁剪 (最近 12 条)

## Workstream 5: enabled_credit_types 修复
- [ ] 传 'GOOGLE_ONE_AI' 到请求体

## Workstream 6: 动态 User-Agent
- [ ] 用 os.platform() / os.arch() 替换硬编码

## Workstream 7: 模型配置优化
- [ ] 默认模型改为 gemini-2.5-flash
- [ ] 模型描述增加 badge 标签

## Verification
- [ ] npm run build 无错误
- [ ] 浏览器端到端验证流式 + 思考 + 停止
