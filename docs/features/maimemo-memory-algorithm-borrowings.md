# 墨墨背单词记忆算法借鉴分析

**项目**: OpenSynapse  
**日期**: 2026-03-28  
**适用范围**: 语言学习、词汇记忆、口语训练中的长期掌握算法设计

---

## 1. 这份文档解决什么问题

你提到墨墨背单词可能有一套强化学习算法或记忆算法，并且发过论文。  
我查到的结论是：

1. 墨墨确实公开了比较系统的记忆算法体系
2. 公开线索里最核心的是：
   - `MM` / `MMX` 系列算法
   - `WDR`（单词难度排名）
   - `MRL`（用户记忆能力等级）
   - 两篇核心论文
3. 它们非常值得借鉴，但不能原样照搬到 OpenSynapse 的“语言学习 + 口语 + 语音交互”场景

这份文档的目标是：

- 提炼墨墨最值得借鉴的算法思想
- 说明哪些适合直接借用
- 说明哪些必须改造后才能落到 OpenSynapse

---

## 2. 我查到的公开资料

### 2.1 墨墨自己的算法文档

- [记忆算法 | 墨墨百科](https://memodocs.maimemo.com/docs/algorithm-intro)
- [WDR | 墨墨百科](https://memodocs.maimemo.com/docs/WDR/)
- [MM 记忆算法更新日志 | 墨墨百科](https://memodocs.maimemo.com/docs/maimemo-algorithm-updates/)
- [墨墨论文 | 墨墨百科](https://memodocs.maimemo.com/docs/paper/)
- [MaiMemo 间隔重复记忆行为开源数据集 | 墨墨百科](https://memodocs.maimemo.com/docs/dataset)
- [MaiMemo Memory Algorithm Experiment 2025 - Preliminary Report | 墨墨百科](https://memodocs.maimemo.com/docs/2025_experiment)

### 2.2 论文与代码

- [SSP-MMC GitHub 仓库](https://github.com/maimemo/SSP-MMC)
- [通过捕捉记忆动态，优化间隔重复调度 | 墨墨百科](https://memodocs.maimemo.com/docs/2023_TKDE/)

从这些资料里，可以比较明确地看出墨墨这套方法不是简单的“艾宾浩斯时间表”，而是一套：

- 基于海量学习日志
- 带单词难度建模
- 带用户差异建模
- 带时序记忆状态建模
- 再叠加调度优化

的系统化方法。

---

## 3. 墨墨算法体系里最重要的几个概念

## 3.1 WDR：单词难度排名

墨墨公开资料里明确提到：

- `WDR (Words Difficulty Rank)` 是核心特点之一  
  来源：
  [WDR | 墨墨百科](https://memodocs.maimemo.com/docs/WDR/)

它的核心思想不是“所有单词同样难”，而是：

**在相似熟悉度下，不同单词的遗忘和巩固速度不同。**

这点非常重要。

对于 OpenSynapse 来说，对应的启发是：

- 不能把所有词汇、短语、语法结构、发音点都当成统一难度
- 必须给语言知识对象建立“固有难度”维度

## 3.2 FM：熟知度

在早期版本里，墨墨用 `FM (Familiarity)` 来描述熟悉程度。  
来源：
[MM 记忆算法更新日志](https://memodocs.maimemo.com/docs/maimemo-algorithm-updates/)

简化理解就是：

- 认识 -> 熟知度提高
- 模糊 -> 熟知度下降
- 忘记 -> 接近重置

这是一种非常实用的工程化抽象。

## 3.3 MRL：用户记忆能力等级

墨墨在 `MM-4` 中引入了：

- `MRL (Memory Recall Level)`  
  来源：
  [MM 记忆算法更新日志](https://memodocs.maimemo.com/docs/maimemo-algorithm-updates/)

它的意义是：

**不仅单词有难度，用户本身也有记忆能力差异。**

也就是：

- 同一个词
- 对不同人
- 适合的复习间隔不一样

这对 OpenSynapse 非常有借鉴意义，因为语言学习里用户差异更大。

## 3.4 时间序列记忆模型

墨墨在 TKDE 扩展论文里明确强调：

- 不仅看“当前会不会”
- 还要建模“过去若干次复习间隔 + 回忆结果”的时间序列  
  来源：
  [通过捕捉记忆动态，优化间隔重复调度](https://memodocs.maimemo.com/docs/2023_TKDE/)

也就是：

**记忆不是静态分数，而是动态过程。**

## 3.5 SSP-MMC：把复习规划当作最优控制 / 随机最短路径问题

墨墨 2022 KDD 论文最核心的贡献，就是把调度问题形式化为：

- `Stochastic Shortest Path`

目标是：

- 在达到目标记忆状态之前
- 最小化总期望复习成本  
  来源：
  [SSP-MMC GitHub](https://github.com/maimemo/SSP-MMC)
  [2023 TKDE 扩展介绍](https://memodocs.maimemo.com/docs/2023_TKDE/)

这和普通 SRS 最大的区别在于：

**不是只追求“记住”，而是追求“以更低总复习成本记住”。**

---

## 4. 墨墨最值得借鉴的地方

我认为最值得借鉴的不是某一个公式，而是 5 个思想。

## 4.1 借鉴点一：把“难度”显式建模

这是最值得立刻借的。

OpenSynapse 现在如果做语言学习，绝不能只用：

- 统一词卡
- 统一复习间隔

而应该给每个语言单元建立难度。

比如：

- 高频具体词：低难度
- 抽象表达：中高难度
- 发音最小对立对：高难度
- 一词多义：高难度
- 场景化句型：中难度

这本质上就是把墨墨的 `WDR` 思路扩展成更泛化的：

- `Language Unit Difficulty Rank`

## 4.2 借鉴点二：把用户差异建模

墨墨的 `MRL` 很值得借。

OpenSynapse 做语言学习时，用户会在几个维度上差异极大：

- 记忆能力
- 输出能力
- 发音能力
- 迁移能力
- 学习强度

所以我们不能只给“知识点”打分，还要给“用户”建 profile。

建议后续在语言模块里引入：

- `Memory Profile`
- `Production Profile`
- `Pronunciation Profile`

这其实是对 `MRL` 的扩展版。

## 4.3 借鉴点三：优化目标是“复习压力最小化”

墨墨更新日志里多次提到：

- 降低用户复习压力
- 提高学习效率  
  来源：
  [MM 记忆算法更新日志](https://memodocs.maimemo.com/docs/maimemo-algorithm-updates/)

这个产品思想非常值得借。

OpenSynapse 做语言学习，不应该只追求：

- 记更多

还要追求：

- 以更小挫败感、更低重复劳动、更稳定节奏去掌握

也就是：

**算法目标不只是 retention，还包括 review pressure。**

## 4.4 借鉴点四：冷启动和长期优化分开

TKDE 文档里提到：

- 冷启动阶段可以先用简单调度
- 收集日志后，再拟合更好的模型和最优策略  
  来源：
  [通过捕捉记忆动态，优化间隔重复调度](https://memodocs.maimemo.com/docs/2023_TKDE/)

这是非常实用的工程路线。

对 OpenSynapse 来说意味着：

- 第一版不需要一上来就做最复杂算法
- 可以先用：
  - 难度分层
  - FSRS
  - 用户画像初值
- 然后随着用户练习记录增加，再逐步个性化

## 4.5 借鉴点五：研究和生产之间有持续实验机制

墨墨不仅有论文，还有算法更新日志和实验报告：

- 2025 甚至在比较 MMX-5（FSRS-3 变种）与 MMX-6（FSRS-6 变种）  
  来源：
  [MaiMemo Memory Algorithm Experiment 2025](https://memodocs.maimemo.com/docs/2025_experiment)

这点很重要。

对 OpenSynapse 的启发是：

- 不要把记忆算法做成一锤子买卖
- 应该内置实验能力：
  - 不同排程策略
  - 不同目标 retention
  - 不同提示与反馈方式

---

## 5. 哪些不能照搬

## 5.1 墨墨的“词汇记忆算法”非常专业化

墨墨自己也明确说了：

- 墨墨背单词的算法更专业化
- 2025 实验主要在记忆卡产品上讨论 MMX/FSRS 变体  
  来源：
  [MaiMemo Memory Algorithm Experiment 2025](https://memodocs.maimemo.com/docs/2025_experiment)

所以不能简单假设：

- 墨墨背单词的词汇算法 = 我们的语言学习通用算法

OpenSynapse 的语言学习对象更复杂，包括：

- 单词
- 句型
- 语法
- 发音
- 场景表达
- 口语输出

## 5.2 他们的目标更偏“记住词”，我们要覆盖“会用”

墨墨核心优化目标很强，但仍主要围绕：

- 长期记忆
- 复习调度

OpenSynapse 后续语言模块还要处理：

- 生成能力
- 口语流利度
- 发音可理解度
- 真实场景迁移

所以不能只用一个“记忆半衰期”来衡量全部语言能力。

## 5.3 他们的开源数据集不能直接拿来做商业训练闭环

墨墨公开数据集页面写明：

- 数据集采用 `CC BY-NC 4.0`  
  来源：
  [MaiMemo 间隔重复记忆行为开源数据集](https://memodocs.maimemo.com/docs/dataset)

这意味着：

- 可以研究、学习、借鉴
- 但不能直接拿来做商业训练数据资产

所以对我们来说：

- 借鉴方法论可以
- 直接复用数据集做商业模型要谨慎

---

## 6. 对 OpenSynapse 最值得借的具体设计

这里给出我建议直接吸收进 OpenSynapse 的 7 个点。

## 6.1 引入“语言单元难度排名”

类似墨墨的 `WDR`，但对象从单词扩展为：

- 词汇
- 固定搭配
- 句型
- 语法结构
- 发音难点
- 错误模式

可以叫：

- `LDR (Language Difficulty Rank)`

## 6.2 引入“用户语言掌握画像”

类似 `MRL`，但要扩展为多维画像：

- `memoryLevel`
- `productionLevel`
- `pronunciationLevel`
- `fluencyLevel`

这样同一知识点在不同用户身上的调度才会真的个性化。

## 6.3 保留 FSRS 作为第一阶段主调度器

OpenSynapse 当前已经有：

- [src/services/fsrs.ts](/Users/lv/Workspace/OpenSynapse/src/services/fsrs.ts)

所以第一阶段不必急着上 SSP-MMC 全量版本。

推荐路线：

1. 先让 FSRS 承担词汇 / 句型 / 错误卡 / 发音卡的调度
2. 再在 FSRS 外面叠加：
   - 难度
   - 用户画像
   - 目标 retention

## 6.4 用“复习压力”作为一等指标

建议新增几个产品指标：

- 每日复习压力
- 单位掌握成本
- 每周净掌握增长
- 高负担区间预警

这样产品不会变成“越学越累的系统”。

## 6.5 把冷启动和个性化明确分层

推荐：

- 冷启动：规则 + 难度 + FSRS
- 中期：基于用户日志拟合画像
- 长期：按用户个体行为动态调度

## 6.6 建立真正的学习行为日志

墨墨最强的基础之一是大量、结构化的学习行为数据。

OpenSynapse 如果以后要做强算法，必须从现在就开始采：

- 复习结果
- 响应时间
- 自我纠正次数
- 发音评分
- 任务完成情况
- 是否依赖提示

如果没有这些数据，后面再强的算法都只是空中楼阁。

## 6.7 把算法更新机制做成产品能力

墨墨的更新日志很有启发：

- 他们不是一次性发明一个算法然后永远不变
- 而是持续迭代、压复习压力、改目标 retention、做实验

OpenSynapse 也应该如此：

- 记忆算法要能 A/B test
- 语言训练路径要能实验
- 不同用户群体可用不同策略

---

## 7. 我建议的 OpenSynapse 算法组合

如果把墨墨的经验和我们自己的产品目标结合，我建议采用：

### Layer 1：难度建模

借鉴 `WDR`，做 `LDR`

### Layer 2：用户画像

借鉴 `MRL`，做多维语言能力 profile

### Layer 3：记忆调度

先用 FSRS 做主调度

### Layer 4：动态掌握建模

逐步加入时序特征：

- 间隔历史
- 反馈历史
- 输出历史
- 发音历史

### Layer 5：优化目标

不只优化 retention，还优化：

- review pressure
- time-to-mastery
- production readiness

---

## 8. 对“口语和语言学习”特别重要的改造

墨墨的强项在记忆调度，但语言学习还要额外加 3 层。

## 8.1 生成能力维度

一个单词：

- 看得懂
- 记得住
- 不等于说得出

所以要引入：

- `productionScore`

## 8.2 发音维度

墨墨公开方法里没有把发音作为主对象。  
但我们做口语必须加入：

- `pronunciationScore`

## 8.3 自动化维度

真正掌握语言不是“能答对卡片”，而是：

- 能快速自然地输出

所以还要加入：

- `automaticityScore`

这也是 OpenSynapse 相比背单词应用能走得更远的地方。

---

## 9. 推荐的实施路线

## Phase 1：借鉴墨墨思想，但工程上先保守

1. 给语言单元增加难度等级
2. 用 FSRS 管理词汇 / 句型 / 错误点
3. 增加用户语言画像

## Phase 2：开始收集高质量行为数据

1. 记录复习反馈
2. 记录口语评分
3. 记录响应时长与纠错行为

## Phase 3：引入时序记忆模型

1. 不再只看当前分数
2. 开始使用历史间隔和反馈序列

## Phase 4：做目标优化

1. 优化“掌握速度”
2. 优化“复习压力”
3. 优化“口语输出准备度”

---

## 10. 一句话结论

墨墨最值得我们借鉴的，不是某个神秘公式，而是：

1. **显式建模知识难度**
2. **显式建模用户差异**
3. **把记忆看成动态过程**
4. **把调度问题当成优化问题**
5. **把“降低复习压力”当成一等产品目标**

对 OpenSynapse 来说，最合理的路线不是直接复制墨墨，而是：

- 借鉴 `WDR` -> 做 `LDR`
- 借鉴 `MRL` -> 做多维语言画像
- 借鉴时序建模 -> 逐步升级 FSRS
- 借鉴最优控制 -> 后续优化“时间到掌握”的成本

而真正超越墨墨的地方，会在：

- 口语
- 发音
- 生成能力
- 自动化掌握

这些“会用”而不只是“记住”的维度上。

