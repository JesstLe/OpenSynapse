# OpenSynapse 学习路径规划设计

**项目**: OpenSynapse  
**日期**: 2026-03-28  
**适用范围**: 学习路径、课程树、阶段推进、目标规划、路径个性化

---

## 1. 目标

学习路径规划器要解决的问题是：

1. 用户应该按什么顺序学习
2. 哪些知识是前置依赖
3. 什么时候可以进入下一阶段
4. 如何根据用户目标、时间和能力带动态调整路径

一句话：

**路径规划器负责“学什么顺序最合理”。**

---

## 2. 为什么需要路径规划器

仅有：

- AI 导师
- 知识推荐
- 知识库

还不够。

因为用户会遇到：

- 学了很多，但不成体系
- 会局部知识点，但不会整体迁移
- 总在熟悉内容附近打转
- 不知道下一步该学什么

路径规划器的作用就是：

把离散知识点组织成一条可推进、可回退、可量化的学习路线。

---

## 3. 路径规划器在系统中的角色

路径规划器负责：

- 定义长期目标
- 选择合适的路径模板
- 生成个性化路径
- 管理节点依赖
- 控制节点推进条件

路径规划器不负责：

- 单轮讲解
- 单条推荐的排序
- 单次复习调度

它与其他模块的分工是：

- `AI Tutor`: 怎么教
- `Recommendation Engine`: 此刻最值得学什么
- `Path Planner`: 整体应该按什么路线走

---

## 4. 路径的层级结构

建议路径采用四层结构：

1. **Goal**
   最终目标，例如“掌握高中数学函数专题”“完成英语 A2 生存表达”

2. **Track**
   主题路线，例如“函数基础”“句型表达”“口语生存场景”

3. **Node**
   具体学习节点，例如“函数定义域”“一般现在时肯定句”

4. **Task**
   节点内的具体动作，例如：
   - 看解释
   - 做题
   - 复述
   - 口语练习
   - 主动召回

---

## 5. 路径对象模型

## 5.1 Goal

```ts
type LearningGoal = {
  id: string
  userId: string
  domain: string
  title: string
  targetLevel: string
  horizonDays?: number
  priority: number
  constraints?: {
    weeklyHours?: number
    deadline?: number
  }
  status: 'active' | 'paused' | 'completed' | 'archived'
  createdAt: number
  updatedAt: number
}
```

## 5.2 Path Node

```ts
type LearningPathNode = {
  id: string
  pathId: string
  domain: string
  title: string
  description: string
  conceptIds: string[]
  prerequisiteNodeIds: string[]
  estimatedMinutes: number
  difficulty: number
  nodeType:
    | 'concept'
    | 'skill'
    | 'application'
    | 'review'
    | 'milestone'
  masteryThreshold: number
  unlockRules: string[]
  completionRules: string[]
  recommendedResources?: string[]
  orderHint?: number
}
```

## 5.3 User Path Progress

```ts
type UserPathProgress = {
  userId: string
  pathId: string
  currentNodeId?: string
  completedNodeIds: string[]
  blockedNodeIds: string[]
  skippedNodeIds: string[]
  estimatedCompletionRate: number
  lastAdvancedAt?: number
  updatedAt: number
}
```

---

## 6. 路径来源

建议路径有三种来源：

## 6.1 模板路径

由产品预设，例如：

- 计算机基础路径
- 法考入门路径
- 金融分析入门路径
- 英语 A1/A2/B1 路径

## 6.2 自动生成路径

由系统根据用户目标和当前能力生成。

例如用户说：

- “我想从零开始学数据结构”
- “我想三个月把英语口语练到旅游可用”

系统自动创建路径骨架。

## 6.3 混合路径

以模板为骨架，再根据用户情况增删节点。

这是最实用的主路径。

---

## 7. 路径规划算法

## 7.1 第一版不追求最优解搜索

第一版建议采用：

- 图结构依赖
- 用户状态过滤
- 节点优先级打分

而不是一开始上复杂图搜索与多目标优化。

## 7.2 规划输入

路径规划应基于：

- 用户目标
- 用户当前能力水平
- 可投入时间
- 已掌握知识
- 知识图谱依赖关系
- 目标难度带

## 7.3 路径生成规则

生成一条路径时建议遵循：

1. 先确定目标终点
2. 回溯必要前置节点
3. 去掉已掌握节点
4. 为高风险薄弱点插入补漏节点
5. 为关键节点插入里程碑和复习节点

---

## 8. 节点优先级规则

对未完成节点计算优先级：

```ts
nodePriority =
  0.30 * prerequisiteReadiness
  + 0.20 * goalCloseness
  + 0.20 * masteryGap
  + 0.15 * transferValue
  + 0.15 * urgency
```

解释：

- `prerequisiteReadiness`
  前置是否已满足

- `goalCloseness`
  该节点是否直通用户目标

- `masteryGap`
  用户与要求差距多大

- `transferValue`
  学会它能否带来大量迁移收益

- `urgency`
  是否受到考试、项目、截止时间影响

---

## 9. 节点推进条件

路径不能只看“是否学过”，而要看是否达标。

建议节点推进条件由三类组成：

1. **掌握度条件**
   对应概念掌握度达到阈值

2. **行为条件**
   完成一定数量练习、问答或会话

3. **应用条件**
   能在新场景中正确使用

例如：

- `mastery(concept_A) >= 0.75`
- `at least 2 successful recall attempts`
- `one successful application exercise`

---

## 10. 路径动态调整

路径不是静态课表，应支持实时调整。

## 10.1 插入补漏节点

如果用户在某节点连续失败，应自动插入：

- 前置补漏节点
- 误区澄清节点

## 10.2 快速跳过

如果用户已经掌握，应允许：

- 节点跳过
- 节点压缩
- 直接进入里程碑测试

## 10.3 路径分叉

当用户目标发生变化时，应允许从主路径分出支线。

例如：

- 从“通用英语”分出“面试英语”
- 从“编程基础”分出“前端项目实战”

---

## 11. 与知识图谱的关系

学习路径可以视为知识图谱上的“优选行走路线”。

图谱负责：

- 全部知识关系

路径负责：

- 哪一条顺序更适合当前用户

因此路径节点建议直接引用图谱概念：

- 一个路径节点可绑定多个 `conceptIds`
- 同一概念可出现在多个路径中，但任务形式不同

---

## 12. 与推荐引擎的关系

路径提供主线，推荐引擎提供局部排序。

例如：

- 路径决定现在应学“链表”
- 推荐引擎决定这时先补“指针概念”还是先做“链表插入练习”

---

## 13. 与 AI 导师的关系

AI 导师读取当前路径节点后，可以：

- 按节点目标进行讲解
- 判断是否达标
- 引导用户完成节点任务
- 在节点完成时触发推进

---

## 14. 前端体验设计

建议新增 `学习路径` 页面，或者在现有导航中作为一级入口。

页面包含：

- 当前目标卡片
- 当前路径进度条
- 当前节点
- 下一节点预览
- 卡住原因
- 可选支线

在聊天页中也可展示：

- 当前路径节点
- 当前节点完成度
- “推进到下一步”提示

---

## 15. 数据结构建议

建议新增集合：

- `learning_goals`
- `learning_paths`
- `learning_path_nodes`
- `user_path_progress`
- `path_node_attempts`
- `path_adjustment_events`

### 15.1 `path_adjustment_events`

记录路径为何被动态调整：

- 因薄弱点插入补课
- 因已掌握而跳过
- 因目标变化重排

这对后续优化很重要。

---

## 16. API 设计建议

建议新增：

- `POST /api/path/create`
  根据目标创建路径

- `GET /api/path/current`
  获取当前路径与进度

- `POST /api/path/evaluate-node`
  评估节点是否达标

- `POST /api/path/advance`
  推进到下一节点

- `POST /api/path/adjust`
  触发动态调整

---

## 17. 质量评估指标

路径规划器重点看：

- 路径完成率
- 节点卡住率
- 从目标创建到完成的周期
- 动态调整次数
- 路径跳过率
- 达标后真实掌握度
- 用户主观“是否清楚下一步做什么”

---

## 18. 实施阶段

## Phase 1

- 支持模板路径
- 支持节点和前置依赖
- 在 UI 中显示当前路径和当前节点

## Phase 2

- 支持自动生成路径
- 支持节点达标评估
- 与 AI 导师联动

## Phase 3

- 支持动态补漏和节点跳过
- 与推荐引擎联动
- 加入里程碑与专题路径

## Phase 4

- 个性化路径
- 基于长期数据自动优化顺序
- 支持多目标并行规划

---

## 19. 一句话结论

OpenSynapse 的学习路径规划器应被设计为：

**一个把知识图谱、用户状态、目标约束和达标条件组织成可推进学习路线的课程编排引擎。**

它的价值不在于画一张好看的路线图，而在于真正让用户始终知道：

**自己现在在哪、下一步去哪、为什么要这样走。**
