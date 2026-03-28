# OpenSynapse 知识推荐引擎设计

**项目**: OpenSynapse  
**日期**: 2026-03-28  
**适用范围**: 知识点推荐、学习资源召回、RAG 排序、概念关联、学习优先级排序

---

## 1. 目标

知识推荐引擎要回答的不是“最相关是什么”，而是：

**对这个用户、在这个时刻、最值得学的是什么。**

它需要支持：

1. 当前会话内推荐相关知识点
2. 当前阶段推荐最值得补的薄弱点
3. 从知识库、对话、笔记、闪卡中推荐下一步内容
4. 为 AI 导师和学习路径规划器提供排序结果

---

## 2. 推荐引擎在系统中的位置

推荐引擎位于：

- 用户状态层
- 知识图谱层
- 会话上下文层

之间，扮演“排序器”角色。

它的输出会供三个对象使用：

1. `AI Tutor`
2. `Learning Path Planner`
3. `Dashboard / Review / Knowledge Graph`

---

## 3. 推荐对象

推荐引擎不应只推荐“笔记”。

建议统一支持这些候选对象：

- `concept`
- `note`
- `flashcard`
- `prerequisite_gap`
- `exercise`
- `path_node`
- `resource_fragment`
- `conversation_recap`

也就是说，它的目标是：

**推荐“下一步最有学习价值的单元”，而不是只推荐一篇内容。**

---

## 4. 推荐场景

## 4.1 会话内推荐

用户正在和导师对话时，推荐：

- 当前概念的前置知识
- 当前问题的关联概念
- 用户最近混淆的相关点

## 4.2 会话后推荐

用户结束一轮学习后，推荐：

- 下一步应该复习什么
- 下一步应该延伸什么
- 下一步应该练什么应用题

## 4.3 首页推荐

仪表盘中推荐：

- 今日最值得完成的 3 个学习动作
- 最值得补的薄弱点
- 当前学习路径上的关键节点

## 4.4 长周期推荐

基于用户长期记录推荐：

- 哪个主题该系统化补课
- 哪些知识点一直学不稳
- 哪些模块已经可以升级难度

---

## 5. 推荐引擎输入

推荐排序至少需要以下输入：

- 当前用户消息
- 当前会话主题
- 当前路径节点
- 最近学习记录
- 用户掌握状态
- 知识图谱邻接关系
- 待复习队列
- 用户目标

建议统一建一个输入对象：

```ts
type RecommendationContext = {
  userId: string
  query?: string
  sessionId?: string
  domain?: string
  activeConceptIds: string[]
  currentPathNodeId?: string
  weakConceptIds: string[]
  overdueReviewIds: string[]
  goalType?: string
  preferredDifficulty?: number
  recentErrors: string[]
  topInterestTags: string[]
}
```

---

## 6. 推荐引擎输出

建议输出标准化结果：

```ts
type RecommendationItem = {
  id: string
  itemType:
    | 'concept'
    | 'note'
    | 'flashcard'
    | 'exercise'
    | 'path_node'
    | 'resource_fragment'
    | 'prerequisite_gap'
  title: string
  reasonCodes: string[]
  score: number
  urgencyScore: number
  relevanceScore: number
  masteryGapScore: number
  noveltyScore: number
  nextAction:
    | 'learn'
    | 'review'
    | 'practice'
    | 'clarify'
    | 'advance'
}
```

---

## 7. 推荐排序思路

## 7.1 推荐不应只靠语义相似度

当前很多 RAG 系统只按 embedding 相似度推荐，这对学习系统不够。

OpenSynapse 的推荐排序应是多因素融合：

- 语义相关性
- 知识依赖关系
- 用户掌握缺口
- 遗忘风险
- 路径优先级
- 当前学习目标

## 7.2 推荐总分公式

建议第一版用可解释的加权排序：

```ts
recommendationScore =
  0.25 * semanticRelevance
  + 0.20 * masteryGap
  + 0.15 * forgettingRisk
  + 0.15 * pathPriority
  + 0.10 * graphProximity
  + 0.10 * goalAlignment
  + 0.05 * novelty
```

说明：

- `semanticRelevance`
  和当前问题 / 会话主题的相似度

- `masteryGap`
  用户不会或不稳的程度

- `forgettingRisk`
  来自 FSRS / 记忆调度

- `pathPriority`
  是否处在当前路径主线上

- `graphProximity`
  在知识图谱里是否近邻

- `goalAlignment`
  是否符合当前目标，例如“考试”“入门”“项目实战”

- `novelty`
  是否能防止推荐全是已经学过的旧内容

---

## 8. 候选召回策略

推荐引擎建议采用“两阶段”：

## 8.1 第一阶段：候选召回

候选来源：

- 向量检索
- 知识图谱邻居扩散
- 当前路径节点周边
- 近期错误点
- 复习到期内容

## 8.2 第二阶段：重排序

对召回候选按多因素评分再排序。

这样可以兼顾：

- 语义相关
- 学习价值高
- 路径合理

---

## 9. 知识图谱与推荐的关系

知识图谱在推荐引擎中非常关键。

建议使用这些边：

- `prerequisite_of`
- `related_to`
- `often_confused_with`
- `used_in`
- `generalizes_to`
- `example_of`

推荐时可以利用：

- 当前概念的前置节点
- 当前概念的高频混淆点
- 当前概念的应用节点

这会比单纯向量检索更适合学习。

---

## 10. 冷启动设计

## 10.1 新用户

对没有历史的用户，推荐引擎应依赖：

- 用户目标
- 当前选择的人格 / 学科
- 初始能力评估
- 热门入门路径

## 10.2 新知识点

新知识点没有足够用户日志时，先依赖：

- 图谱位置
- 知识难度
- 语义标签
- 人工设定优先级

---

## 11. 推荐解释能力

推荐系统最好不仅给结果，还给理由。

建议 reason code 包括：

- `related_to_current_question`
- `prerequisite_gap`
- `frequently_missed`
- `due_for_review`
- `next_step_in_path`
- `high_transfer_value`
- `strong_graph_neighbor`

前端可以把它渲染成：

- “这是你当前主题的前置知识”
- “你最近 3 次在这里出错”
- “这是当前学习路径的下一步”

---

## 12. 数据结构建议

建议新增：

- `knowledge_concepts`
- `concept_edges`
- `user_concept_states`
- `recommendation_logs`
- `recommendation_feedback`

### 12.1 `user_concept_states`

记录：

- 掌握度
- 最近错误
- 最近接触时间
- 当前优先级

### 12.2 `recommendation_logs`

记录每次推荐的：

- 输入上下文
- 候选集合
- 最终排序
- 用户是否点击 / 学习 / 忽略

这样后续可以优化推荐。

---

## 13. API 设计建议

建议新增：

- `POST /api/recommendations/session`
  返回当前会话内推荐

- `POST /api/recommendations/dashboard`
  返回仪表盘推荐

- `POST /api/recommendations/path-support`
  返回路径推进时需要补的知识点

- `POST /api/recommendations/feedback`
  记录用户对推荐的接受或跳过行为

---

## 14. 前端落点

## 14.1 ChatView

在聊天页显示：

- 当前相关知识点
- 推荐补充前置知识
- 推荐下一步练习

## 14.2 DashboardView

显示：

- 今日最值得做的 3 件事
- 当前最薄弱的概念簇
- 当前学习路径关键推荐

## 14.3 GraphView

允许从当前节点触发：

- 学前置
- 学相关
- 学应用

---

## 15. 质量评估指标

推荐引擎应重点观察：

- 推荐点击率
- 推荐后学习完成率
- 推荐后掌握提升率
- 推荐后路径推进率
- 被忽略率
- 重复推荐率
- 用户主观有用性评分

---

## 16. 实施阶段

## Phase 1

- 构建基础候选召回
- 构建可解释加权排序
- 在聊天页和仪表盘落推荐卡片

## Phase 2

- 接入图谱边类型
- 接入用户掌握状态
- 接入推荐反馈日志

## Phase 3

- 引入路径感知排序
- 支持专题推荐和补漏推荐
- 对推荐结果做 A/B 实验

## Phase 4

- 个性化权重学习
- 长周期兴趣与目标建模
- 推荐策略自动优化

---

## 17. 一句话结论

OpenSynapse 的知识推荐引擎不应只是“找相关内容”，而应成为：

**一个把语义相关、知识依赖、用户薄弱点、复习时机和学习路径合并排序的学习价值引擎。**
