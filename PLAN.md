# Synapse 突触 (Knowledge Compounding System) 发展规划

本项目旨在构建一个“外挂式海马体”，通过 AI 驱动的知识捕获、图谱化存储和算法化复习，构建你的神经网络。

## 阶段 1：增强交互与可视化 - [已完成]
- [x] **交互式知识图谱**：点击节点查看笔记详情，支持在图谱中直接跳转到编辑界面。
- [x] **全局搜索与过滤**：在笔记列表和图谱中增加关键词搜索，支持按标签、日期范围过滤。
- [x] **图谱布局优化**：改进 D3 力的参数，支持缩放（Zoom）和平移（Pan），处理大规模节点时的性能优化。

## 阶段 2：智能引擎升级 (Intelligence) - [已完成]
- [x] **深度语义关联**：利用向量嵌入（Embeddings）计算笔记间的相似度，自动推荐"你可能感兴趣的相关知识"。
- [x] **长期记忆 (Long-term Memory)**：在 AI 对话中引入 RAG，让 AI 导师能够引用你过去记录的笔记来解释新问题。
- [x] **多模态支持**：支持上传图片（如手写笔记、架构图），AI 自动识别并转化为结构化笔记。
- [x] **多导师人格系统 (Persona)**：计算机、数学、法学、金融等专业导师人格，每种人格有独特的教学风格和系统提示词。
- [x] **隐藏人格机制**：通过 Logo 七连击解锁"计算机导师"隐藏人格。
- [x] **自定义 Agent**：在人格实验室中创建、编辑、删除自定义导师人格。
- [x] **流式对话与思考展示**：实时显示 AI 思考过程，支持停止/重新生成。

## 阶段 3：学习科学与复利 (Learning Science) - [已完成]
- [x] **FSRS 算法集成**：从简单的 SM-2 升级为更科学性更强的 FSRS 算法，更精准地预测遗忘曲线。
- [x] **认知负荷仪表盘**：可视化展示用户的知识增长速度、复习完成率和大脑“负荷”状态。
- [x] **沉浸式复习模式**：复习闪卡时，背景动态展示该知识点在图谱中的位置，强化上下文记忆。

## 阶段 4：生态与工程化 (Ecosystem) - [已完成]
- [x] **多端同步**：引入 Firebase 实现云端存储和多设备同步。
- [x] **导出功能**：支持导出为 Markdown 压缩包，兼容 Obsidian/Logseq。

## 阶段 5：深度认知与可视化优化 (Deep Cognition & Visualization) - [已完成]
- [x] **FSRS 记忆洞察 (FSRS Insights)**：在闪卡复习界面实时展示“记忆稳定性”和“下一次复习时间”的预测。
- [x] **动态薄弱点分析 (Dynamic Gap Analysis)**：自动扫描复习失败的闪卡，总结具体的“认知断层”，为“专项攻坚”提供精准指令。
- [x] **图谱智能着色 (Graph Intelligence)**：在知识图谱中通过颜色深浅表示“遗忘程度”或“认知负荷”，实现视觉驱动的学习。
- [x] **移动端体验优化 (Mobile Optimization)**：针对手机屏幕优化仪表盘和复习界面，提升碎片化时间的学习效率。
- [x] **外部集成增强**：完善 Chrome 插件或“快速捕获”接口，实现无缝的知识输入（支持 PDF、长文章及 URL 深度解构）。

## 阶段 6：多 AI 提供商与生态 (Multi-Provider Ecosystem) - [已完成]
- [x] **五家 AI 提供商支持**：Gemini、OpenAI、MiniMax、智谱 GLM、Moonshot Kimi。
- [x] **统一 API 网关**：通过 providerGateway 统一适配 OpenAI 和 Anthropic 兼容协议。
- [x] **模型自动回退**：当首选模型不可用时自动切换到备用模型。
- [x] **多认证方式**：支持 OAuth 2.0、API Key、Gemini CLI / Code Assist 认证。
- [x] **明暗主题切换**：支持亮色/暗色模式，自动跟随系统偏好。
- [x] **对话导入功能**：支持 JSON、Markdown、纯文本格式导入历史对话。
- [x] **ChatGPT 导入增强**：完整支持 ChatGPT 官方导出、分享链接、第三方工具格式。
- [x] **自定义格式导入**：用户可定义自己的角色标记，导入任意格式的对话。
- [x] **知识提炼模型配置**：用户可独立选择结构化输出模型（支持所有提供商）。
- [x] **非 Gemini 提供商兼容**：修复 JSON Schema 转换、embedding 降级、safeJsonParse 等问题。
- [x] **CLI 工具增强**：支持多提供商模型切换、批量导入、认证管理。

## 阶段 7：自托管架构迁移 (Self-Hosted Architecture) - [已完成]
- [x] **Firebase 迁移**：从 Firebase Auth + Firestore 迁移到自托管架构。
- [x] **better-auth 集成**：使用 better-auth 实现多提供商认证（Google、GitHub、Discord）。
- [x] **PostgreSQL 数据库**：使用 PostgreSQL 替代 Firestore，完整数据掌控。
- [x] **Chroma 向量数据库**：使用本地 Chroma 替代 Firebase Vector Search。
- [x] **Drizzle ORM**：使用 Drizzle ORM 进行数据库操作。
- [x] **邮箱/密码认证**：添加邮箱/密码注册和登录功能。
- [x] **Schema 修复**：修复 Drizzle schema 以兼容 better-auth（verifications 表、session ipAddress/userAgent 列）。

## 阶段 8：默认模型与体验优化 (Default Model & UX) - [已完成]
- [x] **默认模型切换**：默认文本模型从 Gemini 2.5 Flash 切换为 MiniMax M2.7。
- [x] **默认 Embedding 切换**：默认向量模型从 Gemini Embedding 切换为智谱 Embedding-3。
- [x] **通用助手人格**：新增不限领域的通用 AI 助手作为默认人格，包含 prompt injection 防护等安全边界。
- [x] **ChatView 布局优化**：压缩 header、消息区域、输入区域的 padding 和间距，释放更多内容显示空间。
- [x] **Chroma 懒初始化**：防止 Chroma URL 无效导致启动崩溃。
- [x] **Auth 轮询容错**：auth session 轮询增加错误处理，服务器不可达时静默忽略。
