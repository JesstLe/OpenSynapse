# OpenSynapse AI 智能导师系统设计

**项目**: OpenSynapse  
**日期**: 2026-03-28  
**适用范围**: AI 导师、人格系统、教学编排、自适应讲解、会话教学闭环

---

## 1. 目标

AI 智能导师不是“换一个 prompt 的聊天机器人”，而是 OpenSynapse 的核心教学引擎。它要解决的是：

1. 根据用户当前水平动态调整讲解深度
2. 根据知识状态决定下一步应该讲什么、问什么、练什么
3. 在一次对话内完成“解释、提问、纠错、总结、提炼”的闭环
4. 与知识推荐、学习路径、FSRS 复习形成统一系统

一句话：

**AI 导师负责“怎么教”，而不是只负责“怎么答”。**

---

## 2. 核心原则

## 2.1 教学优先，不是闲聊优先

导师的目标不是尽快输出答案，而是帮助用户掌握。

因此导师应优先考虑：

- 是否需要追问
- 是否需要拆步骤
- 是否需要引导用户自己说出来
- 是否需要安排下一轮巩固

## 2.2 人格只是外层，教学状态才是内核

现有 `persona` 系统已经定义了学科风格和表达方式。  
后续智能导师应该在此基础上再叠一层：

- `Persona` 决定语气、风格、专业背景
- `Tutor State` 决定教学策略、难度、节奏、纠错力度

## 2.3 导师要显式感知学习状态

导师每次生成回复前，应知道至少这些信息：

- 用户当前会话目标
- 当前主题涉及的知识点
- 用户对这些知识点的掌握状态
- 当前推荐学习路径节点
- 最近错误与混淆点

---

## 3. 系统分层

建议 AI 导师系统拆成 6 层：

1. **人格层**
   定义导师身份、语气、学科边界

2. **会话状态层**
   记录当前学习目标、上下文、已讲内容、待巩固点

3. **用户建模层**
   记录用户能力带、偏好、历史错误、掌握度

4. **教学策略层**
   决定当前应该解释、提问、纠错还是召回

5. **内容生成层**
   由 LLM 生成具体教学话语、例子和练习

6. **课后沉淀层**
   把对话沉淀为笔记、闪卡、知识状态更新、路径推进

---

## 4. AI 导师的职责边界

AI 导师主要负责：

- 解释知识
- 拆解难点
- 提出问题
- 给出反馈
- 动态调节难度
- 帮用户形成下一步学习动作

AI 导师不直接负责：

- 全局推荐排序
- 路径图的最终规划
- 复习队列最终排程

这些分别交给：

- 知识推荐引擎
- 学习路径规划器
- 复习调度器

但 AI 导师必须能读取这些系统的结果。

---

## 5. 导师状态模型

建议新增一个运行态对象：

```ts
type TutorSessionState = {
  sessionId: string
  userId: string
  personaId: string
  domain: string
  topic: string
  goalType:
    | 'understand'
    | 'practice'
    | 'recall'
    | 'debug-misconception'
    | 'exam-prep'
    | 'apply'
  userStage: 'novice' | 'beginner' | 'intermediate' | 'advanced'
  teachingMode:
    | 'explain'
    | 'guided-discovery'
    | 'socratic'
    | 'drill'
    | 'case-study'
    | 'roleplay'
  difficultyLevel: number
  frustrationRisk: number
  confidenceLevel: number
  activeConceptIds: string[]
  misconceptionIds: string[]
  currentPathNodeId?: string
  nextRecommendedAction?:
    | 'continue-explanation'
    | 'ask-checkpoint-question'
    | 'do-active-recall'
    | 'practice-application'
    | 'review-prerequisite'
    | 'extract-note'
  updatedAt: number
}
```

这个对象不一定完整存库，但应在服务端和前端会话链路中存在。

---

## 6. 教学策略引擎

## 6.1 输入

教学策略引擎每轮接收：

- 当前用户消息
- 最近对话上下文
- 当前导师状态
- 推荐知识点
- 当前学习路径节点
- 用户掌握状态摘要

## 6.2 输出

输出不是直接文本，而是“本轮教学计划”：

```ts
type TutorTurnPlan = {
  intent:
    | 'explain'
    | 'clarify'
    | 'diagnose'
    | 'quiz'
    | 'correct'
    | 'summarize'
    | 'advance-path'
  responseStyle:
    | 'concise'
    | 'step-by-step'
    | 'analogy'
    | 'example-first'
    | 'theory-first'
  shouldAskQuestion: boolean
  shouldUseSocraticPrompt: boolean
  shouldGenerateExercise: boolean
  shouldExtractKnowledgeAfterTurn: boolean
  targetConceptIds: string[]
  fallbackPrerequisiteIds: string[]
}
```

然后再把这个计划交给 LLM 生成具体回复。

## 6.3 策略规则

建议第一版用规则引擎实现，而不是直接让模型自己决定全部教学策略。

示例：

- 如果用户连续两轮答错同一知识点
  - 切换到 `clarify + example-first`

- 如果用户能正确回答但表述含糊
  - 切换到 `correct + ask-checkpoint-question`

- 如果用户在一个主题上停留过久且掌握度已高
  - 触发 `advance-path`

- 如果用户明显缺失前置知识
  - 切换到 `review-prerequisite`

---

## 7. 导师回复生成框架

建议每轮回复都由四个部分拼装：

1. **系统规则**
   教学安全、人格边界、不可泄露内容、反注入要求

2. **人格提示**
   来自现有 `src/lib/personas.ts`

3. **教学计划**
   由策略层生成

4. **学习上下文**
   包括：
   - 当前主题
   - 用户掌握情况
   - 推荐知识点
   - 路径节点
   - 最近错误

这样可以避免把“教学逻辑”全塞进单一大 prompt。

---

## 8. 自适应讲解机制

## 8.1 难度调节

建议按三类信号动态调节：

- 用户回答正确率
- 用户响应时间
- 用户主观反馈或挫败感信号

调节方向：

- 难度太高：减少抽象度、增加例子、减少跳步
- 难度太低：增加追问、减少直接答案、提高迁移要求

## 8.2 讲解风格切换

对同一概念，导师应支持这些风格：

- 定义优先
- 类比优先
- 例子优先
- 历史脉络优先
- 误区优先

后续可以基于用户偏好记录“最有效讲解风格”。

---

## 9. 导师的提问机制

导师不能一直讲，必须会提问。

建议提问分 4 类：

1. **确认理解**
   检查用户是否跟上

2. **主动召回**
   不看答案让用户说出关键点

3. **迁移应用**
   把概念放进新题目或新情境

4. **误区诊断**
   故意探测用户是否带着错误理解

每次提问后，都应更新：

- 对应知识点掌握度
- 误区状态
- 路径推进条件

---

## 10. 错误诊断与纠错

建议把错误分成：

- 概念错误
- 推理错误
- 术语错误
- 表达不清
- 步骤跳跃

然后让导师输出不同类型的反馈：

- 直接纠错
- 提示性纠错
- 反问式纠错
- 对比式纠错

第一版可以先使用 LLM 打标签，再由规则决定反馈风格。

---

## 11. 与知识推荐引擎的关系

知识推荐引擎负责给出：

- 当前最值得讲的知识点
- 当前会话最相关的关联概念
- 用户近期最需要补的前置知识

AI 导师负责把这些推荐“教出来”。

也就是说：

- 推荐引擎决定“教什么更值”
- 导师决定“怎么教更有效”

---

## 12. 与学习路径规划器的关系

学习路径规划器负责定义：

- 当前路径节点
- 前置依赖
- 达标条件
- 下一节点

AI 导师负责：

- 把当前节点讲透
- 判断用户是否达到进入下一节点的条件
- 触发路径推进事件

---

## 13. 数据结构建议

建议新增集合：

- `tutor_sessions`
- `tutor_turn_plans`
- `tutor_feedback_events`
- `misconception_states`

### 13.1 `tutor_sessions`

记录会话级教学状态。

### 13.2 `tutor_turn_plans`

记录每轮教学决策，方便后续分析导师策略是否有效。

### 13.3 `misconception_states`

记录用户在某些知识点上的典型误区及其是否已纠正。

---

## 14. API 设计建议

建议新增：

- `POST /api/tutor/plan-turn`
  输入当前状态，输出教学计划

- `POST /api/tutor/respond`
  根据教学计划生成导师回复

- `POST /api/tutor/evaluate-answer`
  评估用户回答并输出纠错标签

- `POST /api/tutor/advance-path`
  当会话达标时推进路径

第一版也可以把 `plan-turn` 和 `respond` 合并，但内部仍保留两段式结构。

---

## 15. 前端交互建议

在现有 `ChatView` 中新增：

- 当前教学模式提示
- 当前目标知识点标签
- 本轮导师动作标识
  - 讲解中
  - 提问中
  - 纠错中
  - 巩固中
- “切换解释方式”
  - 举例讲
  - 类比讲
  - 严谨讲
  - 快速讲

这样可以让导师更像教学界面，而不是普通聊天框。

---

## 16. 质量评估指标

AI 导师系统应重点看：

- 单会话知识掌握提升
- 用户回答正确率提升
- 误区纠正率
- 用户停留时长
- 会话后知识提炼质量
- 从路径节点 A 到 B 的推进成功率
- 用户主观满意度

---

## 17. 实施阶段

## Phase 1

- 建立 `TutorSessionState`
- 建立简单策略规则
- 在 `ChatView` 中显示教学模式

## Phase 2

- 接入误区检测
- 接入主动提问和答案评估
- 与知识推荐联动

## Phase 3

- 与路径规划器联动
- 支持会话内动态推进节点
- 记录教学策略效果

## Phase 4

- 个性化教学风格
- 个性化难度控制
- 长期教师风格偏好学习

---

## 18. 一句话结论

OpenSynapse 的 AI 智能导师应被设计为：

**“人格系统 + 教学策略引擎 + 用户状态建模 + 知识/路径联动”的教学中枢。**

它不是单独的聊天模型包装，而是整个学习系统里真正负责“如何把用户教会”的核心模块。
