# OpenSynapse 语言学习记忆引擎实现方案

**项目**: OpenSynapse  
**日期**: 2026-03-28  
**适用范围**: 语言学习、口语训练、长期掌握、个性化复习、语音交互  
**关联文档**:
- [language-learning-voice-design.md](./language-learning-voice-design.md)
- [maimemo-memory-algorithm-borrowings.md](./maimemo-memory-algorithm-borrowings.md)

---

## 1. 这份文档解决什么问题

上一份文档回答的是：

- 墨墨背单词有哪些值得借鉴的算法思想
- OpenSynapse 在语言学习里应该采用什么方向

这份文档继续往前走一步，解决的是：

1. 语言学习模块的记忆引擎具体怎么实现
2. 数据层该怎么建
3. 评分和调度应基于哪些信号
4. 如何从零基础逐步推进到熟练输出
5. 第一版和后续个性化升级应该怎么拆阶段

一句话：

**这是一份从“算法借鉴”走向“工程落地”的实现方案。**

---

## 2. 目标与约束

## 2.1 目标

语言学习模块要同时完成 4 件事：

1. 帮用户记住内容
2. 帮用户能用出来
3. 帮用户逐步自动化输出
4. 让整个过程负担可控，不靠硬刷题

## 2.2 约束

实现时要满足这些工程现实：

1. 第一版不能依赖大规模专有训练数据
2. 必须兼容现有 `FSRS` 能力
3. 要能同时支持：
   - 词汇
   - 句型
   - 语法点
   - 发音点
   - 场景表达模板
4. 要能接文本与语音练习
5. 要允许未来基于用户日志逐步个性化

---

## 3. 总体架构

建议把语言学习记忆引擎拆成 5 层：

1. **语言单元层**
   管理“学什么”

2. **掌握度层**
   衡量“会到什么程度”

3. **用户画像层**
   衡量“这个用户在哪些方面更强或更弱”

4. **调度层**
   决定“接下来复习什么、练什么、什么时候练”

5. **教学编排层**
   决定“用什么练法呈现给用户”

可以理解为：

- 墨墨更偏第 2~4 层
- OpenSynapse 需要把第 5 层也做强，因为我们不仅做记忆，还做会话与口语输出

---

## 4. 核心对象模型

## 4.1 Language Skill Unit

语言学习里最小被追踪对象，不应只叫“单词卡”。

建议统一抽象成：

`LanguageSkillUnit`

类型建议包括：

- `word`
- `phrase`
- `sentence_pattern`
- `grammar_point`
- `pronunciation_pair`
- `dialogue_move`
- `scenario_template`

建议字段：

```ts
type LanguageSkillUnit = {
  id: string
  type:
    | 'word'
    | 'phrase'
    | 'sentence_pattern'
    | 'grammar_point'
    | 'pronunciation_pair'
    | 'dialogue_move'
    | 'scenario_template'
  language: string
  title: string
  canonicalForm: string
  meaning: string
  examples: string[]
  tags: string[]
  cefrBand?: 'pre-A1' | 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2'
  scenarioTags?: string[]
  intrinsicDifficulty: number
  prerequisiteIds: string[]
  createdAt: number
  updatedAt: number
}
```

这里的 `intrinsicDifficulty` 就是借鉴墨墨 `WDR` 的位置，但我们把它泛化成适用于语言单元的难度值。

---

## 4.2 用户对语言单元的掌握记录

同一个用户对同一个语言单元，不应该只用一个“会/不会”表示。

建议设计成：

```ts
type UserLanguageSkillState = {
  userId: string
  unitId: string
  memoryStability: number
  memoryRetrievability: number
  recognitionScore: number
  recallScore: number
  productionScore: number
  pronunciationScore?: number
  automaticityScore: number
  errorProneness: number
  confidenceScore: number
  lastReviewedAt?: number
  nextReviewAt?: number
  totalAttempts: number
  totalSuccesses: number
  recentLatencyMs?: number
  currentStage:
    | 'introduced'
    | 'understanding'
    | 'recalling'
    | 'producing'
    | 'stabilizing'
    | 'automatic'
}
```

核心思想：

- `memoryStability / memoryRetrievability` 继续承接 FSRS 思路
- `recognition / recall / production / pronunciation / automaticity` 则是语言学习特有的多维掌握度

---

## 4.3 用户语言画像

这是借鉴墨墨 `MRL` 的位置，但要做成更适合语言训练的版本。

建议：

```ts
type UserLanguageProfile = {
  userId: string
  language: string
  memoryProfile: number
  productionProfile: number
  pronunciationProfile: number
  listeningProfile: number
  readingProfile: number
  correctionSensitivity: number
  averageDailyLoadTolerance: number
  preferredSessionMinutes: number
  currentBand:
    | 'starter'
    | 'survival'
    | 'functional'
    | 'structured'
    | 'fluent'
    | 'automatic'
  updatedAt: number
}
```

这里不要追求一开始就特别精确。第一版可以先从默认值起步，再根据日志更新。

---

## 5. 多维掌握模型

## 5.1 为什么不能只用一个分数

用户可能出现这些情况：

- 看得懂，但说不出来
- 能写出来，但开口不自然
- 会造句，但发音总错
- 当时会，过几天就忘
- 单独练习会，用到真实场景就卡壳

所以必须至少拆成五个维度。

## 5.2 五维掌握向量

建议统一用：

`MasteryVector = [recognition, recall, production, pronunciation, automaticity]`

每一维范围：

- `0.0 ~ 1.0`

含义：

1. `recognition`
   听到 / 看到是否能识别

2. `recall`
   没提示时是否能想起来

3. `production`
   是否能生成正确表达

4. `pronunciation`
   发音是否稳定接近目标

5. `automaticity`
   是否能低延迟、低负担地自然使用

## 5.3 阶段推进规则

建议以“短板优先”原则推进：

- `recognition` 未达标，不进入高强度输出
- `recall` 未达标，不进入复杂变体生成
- `production` 未达标，不把它算作掌握
- `pronunciation` 未达标，口语场景继续强化
- `automaticity` 未达标，仍要安排快反训练

也就是说：

**完全掌握不是“某一维很高”，而是五维整体过线。**

---

## 6. 信号采集设计

## 6.1 练习事件结构

建议把每次练习都记录成标准事件：

```ts
type LanguageAttemptEvent = {
  id: string
  userId: string
  unitId: string
  sessionId?: string
  mode:
    | 'recognition'
    | 'recall'
    | 'translation'
    | 'sentence_building'
    | 'roleplay'
    | 'shadowing'
    | 'pronunciation'
    | 'free_speaking'
  prompt: string
  expectedAnswer?: string
  userAnswer: string
  transcript?: string
  latencyMs?: number
  hintUsed: boolean
  retries: number
  selfCorrectionCount: number
  teacherScore?: number
  rubricScores?: {
    correctness?: number
    naturalness?: number
    completeness?: number
    pronunciation?: number
    fluency?: number
  }
  outcome: 'fail' | 'hard' | 'good' | 'easy'
  createdAt: number
}
```

## 6.2 评分信号来源

每次事件后，更新掌握度时可以综合：

- 正确率
- 是否用了提示
- 响应时长
- 是否自我修正
- 生成长度
- 语法错误密度
- 词汇替换质量
- 发音评分
- 是否能迁移到新场景

---

## 7. 评分更新规则

## 7.1 第一版不要上复杂神经模型

第一版建议用“规则 + 线性加权 + FSRS”的混合方式。

原因：

- 容易解释
- 易于调参
- 先把日志收起来
- 后面再逐步升级成更复杂模型

## 7.2 掌握度更新思路

每次练习后：

1. 计算事件质量分 `attemptQuality`
2. 按练习模式更新对应维度
3. 对非直接维度做小幅联动更新
4. 交给 FSRS 更新记忆稳定性与下次复习时间

示意公式：

```ts
attemptQuality =
  0.35 * correctness
  + 0.20 * naturalness
  + 0.15 * fluency
  + 0.15 * pronunciation
  + 0.15 * latencyScore

if (hintUsed) attemptQuality -= 0.10
if (retries > 0) attemptQuality -= min(0.10, retries * 0.03)
if (selfCorrectionCount > 0) attemptQuality += min(0.08, selfCorrectionCount * 0.02)
```

维度更新示意：

```ts
recognition += 0.12 * delta
recall += 0.10 * delta
production += 0.08 * delta
pronunciation += 0.08 * delta
automaticity += 0.06 * delta
```

其中：

- `delta = attemptQuality - targetDifficultyAdjustedBaseline`

再根据模式做偏置，例如：

- `recognition` 练习主要更新 `recognition`
- `sentence_building` 主要更新 `production`
- `shadowing / pronunciation` 主要更新 `pronunciation`
- `free_speaking` 主要更新 `automaticity + production`

---

## 8. 调度算法设计

## 8.1 调度目标

调度器不能只回答“哪个该复习”，而要同时平衡：

1. 记忆即将衰退的内容
2. 当前阶段最需要补的短板
3. 用户当前负荷
4. 新内容和旧内容的比例
5. 口语、听力、词汇、句型的平衡

## 8.2 任务优先级公式

建议每个候选语言单元都有一个优先级：

```ts
priority =
  0.30 * forgettingRisk
  + 0.20 * stageGap
  + 0.15 * difficultyWeight
  + 0.15 * scenarioRelevance
  + 0.10 * errorRecency
  + 0.10 * fluencyNeed
```

解释：

- `forgettingRisk`
  用 FSRS / 稳定性估算遗忘风险

- `stageGap`
  当前目标阶段和实际掌握阶段差距

- `difficultyWeight`
  单元固有难度

- `scenarioRelevance`
  是否和当前课程 / 场景相关

- `errorRecency`
  最近是否频繁出错

- `fluencyNeed`
  是否需要从“会”推进到“自动化”

## 8.3 每次学习会话的任务配比

建议学习会话内任务配比是动态的：

- 20% 新内容
- 50% 待复习内容
- 20% 输出训练
- 10% 快反 / 自动化训练

不同阶段可以调整：

- 初学者：新内容比重更高
- 中级：输出训练增加
- 高级：自动化与真实场景任务增加

---

## 9. 从基础到熟练的推进路径

## 9.1 Stage A: 基础识别

目标：

- 看见 / 听见能理解
- 建立基本词义和句型映射

主要任务：

- 听辨
- 选择题
- 看图识词
- 跟读模仿

## 9.2 Stage B: 主动回忆

目标：

- 不看答案能回忆出来

主要任务：

- 中译外
- 填空
- 提示回忆
- 关键词重建

## 9.3 Stage C: 结构化表达

目标：

- 能自己造句
- 能在限定场景中表达

主要任务：

- 句型替换
- 场景问答
- 角色扮演

## 9.4 Stage D: 流利使用

目标：

- 低延迟表达
- 错误率下降
- 变体更自然

主要任务：

- 快速对话
- 限时表达
- 复述与改写
- 连续多轮场景会话

## 9.5 Stage E: 自动化掌握

目标：

- 在真实或接近真实场景中稳定输出

主要任务：

- 自由口语
- 多轮任务型对话
- 干扰条件下表达
- 跨场景迁移

---

## 10. 语音交互的算法位置

语音不是独立模块，而是掌握引擎的一部分。

## 10.1 语音链路

1. 用户音频输入
2. STT 得到文本转写
3. 计算：
   - 内容正确性
   - 流利度
   - 发音分
   - 停顿与延迟
4. 更新：
   - `productionScore`
   - `pronunciationScore`
   - `automaticityScore`
5. 输出：
   - 纠错
   - 跟读版本
   - 更自然表达

## 10.2 发音评分建议

第一版不需要追求音素级极致精细，可以先从三类指标起步：

- 可理解度
- 音节重音 / 节奏
- 关键音混淆

后续再扩展到：

- 音素级偏差
- 连读 / 弱读
- 语调模式

---

## 11. 推荐数据结构

建议新增这些集合：

- `language_courses`
- `language_skill_units`
- `user_language_profiles`
- `user_language_skill_states`
- `language_attempt_events`
- `language_sessions`
- `language_review_queue`

### 11.1 `language_skill_units`

存语言学习对象本体。

### 11.2 `user_language_skill_states`

存用户对每个语言单元的多维掌握状态。

### 11.3 `language_attempt_events`

存每次练习事件，是后续个性化升级最关键的原始数据。

### 11.4 `language_review_queue`

存已排好的近期任务，避免每次都全量实时计算。

---

## 12. 推荐 API 设计

建议先有 4 类接口：

1. `POST /api/language/session/start`
   开始一轮语言训练

2. `POST /api/language/attempt`
   提交一次回答或语音练习结果

3. `GET /api/language/review-queue`
   获取待练任务

4. `POST /api/language/extract-units`
   从对话 / 材料自动提炼语言单元

---

## 13. 第一版算法实现建议

## 13.1 MVP 不做什么

第一版不要做：

- 强化学习训练器
- 复杂神经网络记忆预测
- 大规模最优控制求解
- 过于复杂的多目标规划器

## 13.2 MVP 做什么

第一版建议是：

1. 语言单元难度分层
2. 五维掌握向量
3. `FSRS + 多维分数` 混合调度
4. 规则化的阶段推进
5. 基础语音评分接入
6. 日志全量埋点

这样已经足够做出“明显强于普通 AI 聊天”的语言学习体验。

---

## 14. 第二版升级方向

当日志积累后，再逐步升级：

1. 学习用户自己的 `difficulty adjustment`
2. 对不同任务模式学习转移增益
3. 学习不同用户对不同纠错强度的偏好
4. 预测“达到自动化掌握还需要多少轮”
5. 优化“每周复习负担最小化”

这时才更接近墨墨那种：

- 有用户画像
- 有时序建模
- 有优化目标

的系统。

---

## 15. 评估指标

不要只看 retention。

建议至少跟踪：

- 7 日回忆率
- 30 日回忆率
- 输出正确率
- 口语可理解度
- 平均反应时
- 单位掌握成本
- 每周复习压力
- 完成一个场景单元所需总练习次数
- 自动化掌握比例

---

## 16. 推荐实施顺序

## Phase 1

- 新增 `语言训练` 一级入口
- 建立 `language_skill_units`
- 建立 `user_language_skill_states`
- 接入基础文本训练

## Phase 2

- 接入语音输入 / 输出
- 建立 `language_attempt_events`
- 支持发音评分与跟读

## Phase 3

- 接入队列调度器
- 支持课程化推进
- 建立阶段迁移逻辑

## Phase 4

- 个性化画像
- 动态负荷控制
- 自动化掌握优化

---

## 17. 一句话结论

OpenSynapse 语言学习引擎的最佳路径不是“照搬墨墨”，而是：

1. 以 `FSRS` 为基础
2. 借鉴墨墨的“难度 + 用户差异 + 时序优化”思想
3. 扩展成适合语言学习的五维掌握模型
4. 用文本与语音练习共同驱动
5. 先做可解释、可落地的规则引擎，再逐步个性化

这样才能从“背会”真正走到“能说、能用、能自动化输出”。
