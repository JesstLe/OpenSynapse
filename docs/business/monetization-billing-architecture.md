# OpenSynapse 商业化付费与账单架构设计

**项目**: OpenSynapse  
**日期**: 2026-03-28  
**适用范围**: 自用 / 商用双模式、多 Provider 供给、平台利润模型、BYOK、官方 API 包装、第三方中转、账单与风控

---

## 1. 这份文档解决什么问题

OpenSynapse 当前已经支持多模型、多 Provider 和用户级 API key。  
接下来如果要正式商业化，问题就不再只是“能不能调用模型”，而是：

1. 用户到底是自己买 API，还是买 OpenSynapse 的套餐
2. 平台是否可以包装官方 API 或第三方中转服务并加价
3. 自用和商用如何共存
4. 如何做到“能切换，但不是显性的模式开关”
5. 如何做计量、扣费、预警、利润核算和风控

这份文档给出的不是价格表，而是：

- 一套可长期演进的商业化架构
- 一套风险可控的供给与结算体系
- 一套能兼容“个人自用”和“面向客户商用”的账单模型

---

## 2. 先给结论

OpenSynapse 后续最合理的收费与供给模式，应当是三层并存：

1. **BYOK 模式**
   用户自己提供 API key / OAuth 凭证，平台只收产品订阅费或不收模型费

2. **平台托管计费模式**
   用户购买 OpenSynapse 套餐或充值积分，平台用自己的上游供给调用模型，并在成本上加价获利

3. **混合模式**
   某些 provider 用用户自己的 key，某些 provider 用平台托管额度

一句话：

**不要把“自用”和“商用”做成一个显眼的手动切换按钮，而要做成“基于账单配置自动选择的凭证来源策略”。**

---

## 3. 当前项目现状

OpenSynapse 已经具备几个关键基础：

### 3.1 多 Provider 网关

相关文件：

- [src/api/ai.ts](/Users/lv/Workspace/OpenSynapse/src/api/ai.ts)
- [src/lib/providerGateway.ts](/Users/lv/Workspace/OpenSynapse/src/lib/providerGateway.ts)
- [src/lib/aiModels.ts](/Users/lv/Workspace/OpenSynapse/src/lib/aiModels.ts)

说明：

- 已支持 Gemini、OpenAI、MiniMax、智谱、Moonshot
- 已支持不同协议适配：
  - `gemini_native`
  - `openai_compat`
  - `anthropic_compat`

### 3.2 用户级 secrets 雏形

当前服务端已经尝试从：

- Firestore `account_secrets/{uid}`
- 服务端环境变量

读取 provider key。

相关代码：

- [src/api/ai.ts](/Users/lv/Workspace/OpenSynapse/src/api/ai.ts)
- [config/firestore.rules](/Users/lv/Workspace/OpenSynapse/config/firestore.rules)

### 3.3 设置页

当前已经有 Settings 页，可配置 provider key 和部分 OAuth。

相关文件：

- [src/components/SettingsView.tsx](/Users/lv/Workspace/OpenSynapse/src/components/SettingsView.tsx)

这意味着：

**OpenSynapse 已经有“个人 BYOK”基础，但还没有完整的商业账单层。**

---

## 4. 商业化前必须先明确的现实约束

## 4.1 不能把“卖 API key”当作商业模式

以 OpenAI 为例，官方服务协议明确写到，客户不得“买、卖或转让 API keys”。  
来源：

- [OpenAI Services Agreement](https://openai.com/policies/services-agreement/)

因此：

- 不能把平台自己的 OpenAI API key 分发给用户
- 不能做“把 key 卖给客户”这种设计

但可以做的是：

- 由 OpenSynapse 平台作为 API 客户
- 用户通过 OpenSynapse 的产品界面使用模型能力
- 平台按自己的产品计费

也就是：

**可以卖产品能力，不要卖原始 key。**

## 4.2 Google Gemini 的免费 / 未付费额度不适合正式商业托管

Gemini 最新附加条款明确区分了：

- Unpaid Services
- Paid Services

并说明未付费服务的数据使用与 paid services 不同。  
来源：

- [Gemini API Additional Terms](https://ai.google.dev/gemini-api/terms)

对商用平台意味着：

- 平台托管模式不要依赖免费额度
- 正式商用应尽量使用有 Cloud Billing 的 paid services

## 4.3 第三方中转站可以接，但不能成为核心商业基础

原因包括：

- 服务稳定性不可控
- 上游条款变动风险高
- 封号 / 限流 / 账单争议风险高
- 成本与 SLA 难预测

所以建议：

- 官方 API 作为商用主供给
- 中转站只作为实验性或区域性补充供给
- 默认不把“灰色中转”作为平台主卖点

## 4.4 把用户 API key 上传到第三方工具本身有风险

Anthropic 的官方 key 安全建议明确提醒，把 API key 交给第三方工具意味着把账户访问权交给该工具。  
来源：

- [Anthropic API Key Best Practices](https://support.claude.com/en/articles/9767949-api-key-best-practices-keeping-your-keys-safe-and-secure)

这意味着：

- OpenSynapse 一旦提供 BYOK，本质上也在替用户托管密钥
- 所以必须做最小化访问、脱敏、加密与审计

---

## 5. 目标模式：不显性的“自动账单配置路由”

用户不应该看到一个非常粗暴的：

- 自用模式
- 商用模式

切换按钮。

更合理的是引入：

**Billing Profile（账单配置档案）**

然后系统根据当前用户 / 工作区配置，自动决定请求走哪条供给链。

### 5.1 账单配置优先级

推荐优先级：

1. 用户显式绑定的 **BYOK 凭证**
2. 工作区 / 团队级 **托管配额**
3. 平台级 **默认托管额度**
4. 无可用供给时，引导购买或配置 key

这不是一个显眼的“切模式”，而是一个：

**凭证来源决策引擎**

---

## 6. 推荐的供给模式

## 6.1 模式 A：BYOK

用户自己提供：

- OpenAI API key
- Gemini API key
- MiniMax / 智谱 / Moonshot API key

平台负责：

- 模型路由
- UI 体验
- 知识管理
- 云同步

平台收费建议：

- 纯 SaaS 订阅费
- 或高级功能订阅费

适合：

- 高阶用户
- 对成本敏感用户
- 对供应商自主性要求高的用户

优点：

- 平台几乎没有模型成本风险
- 成本转嫁给用户
- 容易快速上线

缺点：

- 用户配置门槛高
- 体验不如开箱即用
- 用户会直接感知各家模型价格和复杂度

## 6.2 模式 B：平台托管计费

平台自己维护上游：

- 官方 OpenAI / Gemini / MiniMax / 智谱 / Moonshot
- 必要时可配置受控的第三方 relay

用户只购买：

- 月订阅
- 套餐额度
- 积分余额

优点：

- 体验最好
- 商业闭环最强
- 平台可以做利润空间

缺点：

- 平台承担模型成本波动
- 需要更强的账单、风控和限流系统

## 6.3 模式 C：混合模式

例如：

- 日常聊天走平台额度
- 高级模型走用户 BYOK
- 某些受限 provider 只能 BYOK

这是最推荐的长期模式。

---

## 7. 推荐的计费产品设计

不要直接卖“某家的 token 数量”，而是卖 OpenSynapse 自己的产品层能力。

推荐拆成三类商品：

### 7.1 基础订阅

例如：

- Free
- Pro
- Team

基础订阅负责：

- 功能权限
- 存储上限
- 导入上限
- 高级导师 / 高级图谱 / 高级导出能力

### 7.2 托管 AI 配额

平台托管额度可设计为：

- 月包额度
- 充值积分
- 超量按量计费

建议不要直接暴露：

- “你还剩 xx OpenAI token”

而是暴露：

- “你还剩 xx Synapse Credits”
- “本月托管 AI 额度还剩 xx”

### 7.3 企业 / 工作区计费

团队版建议支持：

- 工作区统一付费
- 多成员共享配额
- 成员可覆盖为个人 BYOK

---

## 8. 利润模型怎么设计

平台利润应建立在：

- 统一的产品包装
- 体验价值
- 路由价值
- 管理价值

而不只是“简单加价差”。

### 8.1 成本公式

平台应记录每次请求的：

- provider
- model
- input tokens
- output tokens
- cache / reasoning / image / file 成本
- 请求耗时
- 是否命中 fallback

形成：

```txt
provider_cost = upstream_unit_cost * usage_quantity + relay_fee + infra_overhead
```

### 8.2 售价公式

可按：

```txt
customer_price = provider_cost * markup_factor + platform_margin_floor
```

但前台不一定需要直接展示这个公式。

### 8.3 更推荐的呈现方式

前台卖的是：

- `Synapse Credits`
- 套餐内赠送额度
- 超量后按 credits 扣减

后台再做：

- credits -> 实际 provider 成本 的映射

这样用户体验更统一，平台也更容易调价。

---

## 9. 官方 API、官方代卖、第三方中转的供给分级

建议把供给分成 3 级：

### Level 1：官方 API

例如：

- OpenAI 官方
- Google Gemini 官方
- MiniMax 官方
- 智谱官方
- Moonshot 官方

适用：

- 正式商用
- 高可靠要求
- 财务可审计

### Level 2：云厂商代卖 / Marketplace

例如：

- Vertex AI
- Bedrock

适用：

- 企业客户
- 统一云账单
- 更强合规要求

### Level 3：第三方中转 / Relay

适用：

- 自用实验
- 区域性兼容
- 特定模型临时补位

不建议：

- 作为核心商业化主供给

---

## 10. “不显性切换”的具体实现方式

这里是最关键的产品设计点。

不要给用户一个醒目的：

- 自用
- 商用

切换开关。

而是引入：

### 10.1 `billing_profiles`

```ts
type BillingProfile = {
  id: string;
  ownerType: 'user' | 'workspace';
  ownerId: string;
  mode: 'byok_only' | 'managed_only' | 'hybrid';
  defaultProviderPolicy: 'prefer_byok' | 'prefer_managed' | 'require_byok';
  creditsBalance: number;
  softLimitCents?: number;
  hardLimitCents?: number;
  status: 'active' | 'suspended';
  createdAt: number;
  updatedAt: number;
};
```

### 10.2 `provider_credentials`

```ts
type ProviderCredential = {
  id: string;
  ownerType: 'user' | 'workspace';
  ownerId: string;
  provider: 'gemini' | 'openai' | 'minimax' | 'zhipu' | 'moonshot';
  authType: 'api_key' | 'oauth';
  source: 'user_uploaded' | 'platform_managed' | 'shared_workspace';
  encryptedSecretRef?: string;
  status: 'active' | 'revoked' | 'invalid';
  createdAt: number;
  updatedAt: number;
};
```

### 10.3 `routing_policy`

请求到来时，系统不问“你现在是自用还是商用”，而是自动计算：

1. 当前用户是否为该 provider 配置了可用 BYOK
2. 当前工作区是否有托管额度
3. 当前请求是否属于高成本模型
4. 当前托管余额是否足够
5. 当前策略是否要求某模型只能 BYOK

最终输出：

- 用哪个 provider credential
- 这次记到谁的账单

这就实现了：

**可以切，但不是显性的切换。**

---

## 11. 推荐的计量体系

每次模型请求都需要记录 usage event。

### 11.1 `usage_events`

```ts
type UsageEvent = {
  id: string;
  userId: string;
  workspaceId?: string;
  billingProfileId: string;
  provider: string;
  model: string;
  routeType: 'byok' | 'managed' | 'relay';
  credentialOwnerType?: 'user' | 'workspace' | 'platform';
  inputTokens?: number;
  outputTokens?: number;
  cachedTokens?: number;
  reasoningTokens?: number;
  requestCount: 1;
  upstreamCostMicros?: number;
  customerChargeCredits?: number;
  latencyMs?: number;
  status: 'success' | 'failed' | 'partial';
  createdAt: number;
};
```

### 11.2 为什么必须记录

用途包括：

- 用户账单
- 成本核算
- 利润分析
- 限流与反滥用
- 客诉排查

---

## 12. 推荐的收费模式

## 12.1 最优先建议：订阅 + Credits

推荐组合：

- 基础订阅费
- 每月赠送 credits
- credits 不够时支持充值
- 高级模型按更高 credits 倍率消耗

优点：

- 体验清晰
- 收入可预测
- 可以兼容多 provider

## 12.2 企业版：席位费 + 用量费

适合团队版：

- 每个 seat 固定月费
- 工作区共享 credits
- 支持 BYOK 覆盖

## 12.3 BYOK 用户：轻订阅或功能订阅

BYOK 用户不一定愿意再为 token 付费。

建议向他们收：

- 产品功能费
- 高级存储与导入费
- 团队协作费

而不是二次收同一份模型成本。

---

## 13. Stripe 设计建议

Stripe 官方已经支持 usage-based billing、meter 和 credits。  
来源：

- [Stripe usage-based billing implementation guide](https://docs.stripe.com/billing/subscriptions/usage-based/implementation-guide)
- [Stripe record usage for billing](https://docs.stripe.com/billing/subscriptions/usage-based/recording-usage)
- [Stripe billing credits](https://docs.stripe.com/billing/subscriptions/usage-based/billing-credits/implementation-guide)

推荐做法：

### 13.1 Stripe 负责的钱

- 订阅
- 充值
- 发票
- 支付状态
- 自动续费

### 13.2 OpenSynapse 自己负责的账

- token 用量
- credits 扣减
- routeType
- provider 成本
- 用户级用量统计

也就是说：

- Stripe 负责收钱
- OpenSynapse 负责记“AI 用量账”

### 13.3 推荐计费结构

1. `subscription_products`
   - Free / Pro / Team
2. `credit_topups`
   - 充值包
3. `metered_usage`
   - 按月汇总或按天上报 Stripe

---

## 14. 中转站怎么设计才安全

用户提到“官方付费或中转站付费包装后加价”，这个方向可以设计，但必须分级。

### 14.1 自用场景

可以允许：

- 用户自己填中转站地址
- 用户自己承担稳定性风险

这时平台只提供：

- 通用 OpenAI / Anthropic 兼容协议支持

### 14.2 商用场景

不建议直接把任意中转站作为默认商用主供给。

更稳的做法：

- 只接入经过审核的 relay provider
- 建立 `supply_providers` 配置
- 标记 SLA、区域、支持模型、成本、风险等级

### 14.3 `supply_providers`

```ts
type SupplyProvider = {
  id: string;
  provider: 'openai' | 'gemini' | 'minimax' | 'zhipu' | 'moonshot';
  supplyType: 'official' | 'cloud_marketplace' | 'relay';
  baseUrl: string;
  billingOwner: 'platform' | 'customer';
  status: 'active' | 'degraded' | 'disabled';
  riskLevel: 'low' | 'medium' | 'high';
  createdAt: number;
  updatedAt: number;
};
```

---

## 15. 推荐的产品表现方式

### 15.1 用户能看到的

推荐展示：

- 当前模型是否可用
- 当前请求走的是“你的凭证”还是“平台额度”
- 当前账户剩余 credits
- 超量提醒

### 15.2 不建议直接展示的

- 非技术用户不需要看到“你现在处于自用模式 / 商用模式”
- 不需要看到复杂的 provider 成本换算
- 不需要看到原始上游计费细节

产品上更推荐的表达：

- “优先使用你自己的 API”
- “未配置个人 API 时将使用平台额度”
- “高级模型会优先消耗平台 credits”

---

## 16. 自用与商用共存的推荐路径

## Phase 1：先把 BYOK 做好

目标：

- 用户可稳定配置自己的 key
- 用户级 secrets 存储安全
- 请求记录完整 usage event

## Phase 2：加平台托管 credits

目标：

- 平台配置官方 API 供给
- 用户可购买 credits
- 请求按自动路由消耗 credits

## Phase 3：工作区和团队计费

目标：

- 工作区统一付费
- 成员可共享额度
- 成员可 BYOK 覆盖

## Phase 4：受控 relay 供给

目标：

- 把中转站纳入受控供给层
- 风险和成本可观测

---

## 17. 风险与反滥用设计

## 17.1 防用户刷平台额度

必须做：

- 每用户速率限制
- 每工作区预算上限
- 高成本模型单次请求大小限制
- 每日软上限 / 硬上限

## 17.2 防泄露导致爆账

必须做：

- 分环境 API key
- 供应商 usage alert
- credits 余额阈值告警
- 异常峰值告警

## 17.3 防负毛利

必须做：

- 每个 provider / model 成本表
- 每次请求记录真实成本
- 账单策略可热更新
- 高成本模型单独倍率

## 17.4 防条款风险

必须做：

- 不分发平台 API key
- 不把第三方 consumer subscription 凭证当商业主路径
- 不把“中转站权益”包装成稳定官方服务

---

## 18. 推荐的数据模型

建议新增以下集合：

### 18.1 `billing_profiles`

存账单归属与策略。

### 18.2 `provider_credentials`

存用户或工作区的 provider 凭证元信息。

### 18.3 `supply_providers`

存平台侧上游供给源。

### 18.4 `usage_events`

存每次模型调用的用量账。

### 18.5 `credit_ledgers`

存 credits 增减流水。

```ts
type CreditLedger = {
  id: string;
  billingProfileId: string;
  type: 'grant' | 'topup' | 'consume' | 'refund' | 'adjustment';
  amount: number;
  balanceAfter: number;
  refId?: string;
  description?: string;
  createdAt: number;
};
```

### 18.6 `pricing_rules`

存平台内部售价与倍率。

```ts
type PricingRule = {
  id: string;
  provider: string;
  model: string;
  routeType: 'managed' | 'relay';
  chargeUnit: 'credits_per_1k_input' | 'credits_per_1k_output' | 'flat_per_request';
  inputRate?: number;
  outputRate?: number;
  flatRate?: number;
  effectiveFrom: number;
  status: 'active' | 'archived';
};
```

---

## 19. 面向当前代码的落地建议

### 19.1 保留当前 `account_secrets`

但建议未来演进成：

- `provider_credentials` 元信息
- `account_secrets` 只存加密密钥或 secret ref

### 19.2 在 `src/api/ai.ts` 中增加“账单决策层”

当前这层已经有：

- 用户 token 验证
- 用户级 API key 解析
- 平台环境变量 fallback

下一步建议把它升级为：

```txt
request -> resolve billing profile -> resolve credential source -> route -> record usage -> charge credits
```

### 19.3 设置页增加“凭证来源”展示

不是做模式切换按钮，而是展示：

- 已配置个人 API
- 正在使用平台额度
- 当前账户剩余 credits

### 19.4 聊天页增加轻量反馈

例如：

- “本次使用平台额度”
- “本次使用你的 OpenAI API”

这样用户知道费用归属，但不需要切模式。

---

## 20. 推荐实施顺序

## P0：先打基础

1. 记录标准化 `usage_events`
2. 抽象 `billing profile`
3. 规范化 provider credential 存储

## P1：自用 / 商用自动路由

1. 实现 credential source resolver
2. 支持 `prefer_byok / prefer_managed / require_byok`

## P2：平台 credits

1. 建立 `credit_ledgers`
2. 对接 Stripe 订阅与充值
3. 消耗 credits

## P3：团队账单

1. workspace 级 billing profile
2. seat + credits 组合

## P4：受控 relay 供给

1. 建立 `supply_providers`
2. 风险分级
3. 可灰度切流

---

## 21. 一句话结论

OpenSynapse 的商业化最佳路线不是：

- 强行在 UI 上做“自用 / 商用”大开关
- 也不是直接“卖 API key”

而是：

**做一套自动账单配置路由系统。**

对用户来说：

- 配了自己的 key，就优先用自己的
- 没配，就自动走平台额度
- 高级模型和团队版按 credits / 套餐扣费

对平台来说：

- 可以用官方 API 做主供给
- 可以包装产品体验获取利润
- 可以在必要时接受控 relay，但不把它当唯一基础

这条路线能同时满足：

- 自用体验
- 商用闭环
- 未来团队版
- 多 provider 长期可维护性

---

## 22. 参考资料

- [OpenAI Services Agreement](https://openai.com/policies/services-agreement/)
- [Gemini API Additional Terms](https://ai.google.dev/gemini-api/terms)
- [Anthropic API Key Best Practices](https://support.claude.com/en/articles/9767949-api-key-best-practices-keeping-your-keys-safe-and-secure)
- [Stripe usage-based billing implementation guide](https://docs.stripe.com/billing/subscriptions/usage-based/implementation-guide)
- [Stripe record usage for billing](https://docs.stripe.com/billing/subscriptions/usage-based/recording-usage)
- [Stripe billing credits](https://docs.stripe.com/billing/subscriptions/usage-based/billing-credits/implementation-guide)

