# 耗散结构安全阀斜杠命令设计

**项目**: OpenSynapse  
**日期**: 2026-03-28  
**适用范围**: `opencode`、`Claude Code CLI`、长链任务、长文生成、长程推理防漂移

---

## 1. 这份文档解决什么问题

长文本生成、长链分析、复杂重构和多阶段研究任务，经常在后半程出现这些问题：

- 偏离最初目标
- 不断重复之前的话
- 在错误假设上越走越远
- 生成越来越长，但信息密度越来越低
- 工具调用链条变长后，状态越来越混乱

这类问题可以被理解成一种“上下文熵增”。

你的思想实验是：

> 不要试图让模型在一个封闭上下文里永远保持低熵，而要把它变成一个开放系统，周期性排出噪音、注入压缩后的负熵状态。

这份文档的目标是把这个思想做成：

1. 一个可安装的 slash command
2. 一套“主命令 + 新会话续跑命令”的工作流
3. 一个能在 `opencode` 和 `Claude Code CLI` 中复用的工程方案

---

## 2. 核心思想

## 2.1 封闭上下文为什么会崩

模型在长链任务中并不是持续“变聪明”，而是在不断累积：

- 已完成状态
- 中间假设
- 失败分支
- 风格惯性
- 上下文污染

这些东西越积越多，就越容易让后续推理被旧噪音拖偏。

## 2.2 耗散结构对应到 AI 工作流

这个命令的核心不是一句“请不要偏题”，而是一个**周期性排气机制**：

1. 连续工作一小段
2. 强制停下
3. 压缩成极小状态核
4. 丢掉多余中间态
5. 重新锚定目标后继续

这相当于：

- 主模型负责高价值工作
- 安全阀负责降熵
- 状态核负责注入负熵

---

## 3. 为什么做成 slash command

slash command 的优势是：

- 用户可以显式在高风险任务里打开它
- 不需要改底层模型
- 可以跨 `opencode` 和 `Claude Code CLI` 复用
- 更容易形成稳定工作习惯

它本质上是一种：

**任务执行协议（execution protocol）**

而不是某个特定 provider 的能力。

---

## 3.1 为什么“新会话续跑”更关键

如果只在同一会话中反复要求模型“压缩自己”，仍然存在一个根本问题：

- 旧噪音并没有真的消失
- 只是被新的文字覆盖
- 模型仍处在原会话的长上下文中

所以更强的版本必须是：

1. 当前会话生成高密度 handoff packet
2. 停止当前会话
3. 在**新会话**中只读取 handoff packet
4. 从最小必要状态继续

这才真正接近“物理排气”。

---

## 4. 命令设计目标

这个命令需要做到：

1. 限制单轮扩散长度
2. 让任务强制进入 checkpoint 节奏
3. 让模型显式丢弃噪音
4. 在偏题时支持回卷
5. 让用户看到当前“压缩后的真实状态”

---

## 5. 命令行为定义

建议命令名：

- `/dissipative-valve`

输入：

```text
/dissipative-valve <task>
```

但更推荐的实际使用体验是：

- 先正常说出任务
- 再直接输入 `/dissipative-valve`

命令应优先读取：

1. 显式参数
2. 当前会话里主导性的未完成任务
3. 当前工作区的已修改工件、已有状态文件、当前工作焦点
4. 当前工作区的 `git status --short`、`git diff --stat`
5. 只有在无法恢复单一任务时，才反问

例如：

```text
/dissipative-valve 写一篇 5000 字的 AI 商业化分析，并给出结论与风险
```

命令行为：

1. 重述目标
2. 切分任务
3. 以最多 5 个“有意义节点”为一个工作周期
4. 每周期结束输出一个 `Valve Snapshot`
5. 每次快照都生成一个极小的 `State Kernel`
6. 若可写文件，则覆盖写入本地状态文件
7. 一旦漂移或矛盾，回退到最近快照继续

这条命令并不只用于“任务开始前”。

一个更重要的真实场景是：

1. 你已经和模型聊了很多轮
2. 你明显感觉输出质量开始下降
3. 你不想继续在这段高熵上下文里硬撑
4. 你希望把当前有效状态抽出来
5. 再在一个全新会话中继续

这时 `/dissipative-valve` 应该扮演的是：

**上下文抽离器（context extractor）**

---

## 6. 什么叫“有意义节点”

这里的 `node` 不是 token，也不是句子，而是：

- 一个关键推理跳跃
- 一个主要工具动作
- 一段完整小节生成
- 一次重要判断

这样设计的好处是：

- 约束的是工作节奏，不是文本字数
- 对写作、分析、编码三类任务都能适配

---

## 7. Valve Snapshot 设计

每个快照包含 6 个字段：

```md
## Valve Snapshot N
- Goal: <one-sentence goal>
- Verified State:
  - <fact 1>
  - <fact 2>
- Discarded Noise:
  - <branch/speculation removed>
- State Kernel: <50-char compact state>
- Next Action: <single next action>
- Risk: <top current risk or "none">
```

### 为什么这 6 个字段足够

- `Goal`
  防止方向漂移

- `Verified State`
  保留已经确认的真信息

- `Discarded Noise`
  显式排除垃圾上下文

- `State Kernel`
  作为低熵恢复点

- `Next Action`
  给下一周期提供唯一推进方向

- `Risk`
  保留当前最危险的不确定项

---

## 8. 状态核设计

状态核是整个命令的关键。

要求：

- 中文 50 字以内，或英文 25 词以内
- 只能包含：
  - 当前目标
  - 已完成核心状态
  - 当前唯一下一步

示例：

```text
已完成市场现状与成本拆解，下一步写利润模型与风险边界。
```

它要做到的是：

- 足够短
- 足够稳
- 足够让模型继续前进
- 不带多余包袱

---

## 9. 在 CLI 里怎样逼近“上下文排泄”

严格说，在同一会话里我们不能真正操纵模型底层记忆。

但在工程上，我们可以逼近这个效果：

1. 强制阶段性摘要
2. 显式丢弃低价值中间态
3. 把压缩状态外部化到文件
4. 后续工作只围绕最新状态核展开

建议状态文件：

- `./.ai/valves/dissipative-valve-latest.md`

这个文件相当于“外部记忆器官”。

---

## 10. 为什么同时支持屏幕快照和文件快照

屏幕上的 `Valve Snapshot` 用于：

- 给用户可见性
- 便于人工干预

文件快照用于：

- 在长会话中外部化状态
- 断点恢复
- 会话崩溃后续跑
- 后续做自动化恢复命令

---

## 11. 命令适用场景

特别适合：

- 超长写作
- 研究报告
- 多阶段设计文档
- 复杂重构
- 多轮计划生成
- 多工具分析链

不太适合：

- 一句话问答
- 简短修 bug
- 低复杂度任务

---

## 12. 预期收益

这个命令最主要的收益有 5 个：

1. 明显降低偏题概率
2. 降低“越写越空”的现象
3. 更容易从错误分支回滚
4. 让长任务更可控
5. 让用户更容易理解模型现在到底进行到哪

---

## 13. 局限性

需要明确，这个命令不是万能药。

它不能：

- 改变底层模型能力上限
- 真正清空模型内部上下文
- 消灭所有幻觉

它能做的是：

**把长任务从“连续扩散”改造成“阶段推进 + 压缩恢复”的工作流。**

---

## 14. 两个 CLI 的命令文件位置

本仓库已经提供了六份命令文件：

- `/.opencode/commands/dissipative-valve.md`
- `/.opencode/commands/dissipative-valve-continue.md`
- `/.opencode/commands/dissipative-valve-review.md`
- `/.claude/commands/dissipative-valve.md`
- `/.claude/commands/dissipative-valve-continue.md`
- `/.claude/commands/dissipative-valve-review.md`

安装方式：

### Opencode

将文件放入工作区：

```bash
mkdir -p .opencode/commands
cp .opencode/commands/dissipative-valve.md <your-workspace>/.opencode/commands/
cp .opencode/commands/dissipative-valve-continue.md <your-workspace>/.opencode/commands/
cp .opencode/commands/dissipative-valve-review.md <your-workspace>/.opencode/commands/
```

### Claude Code CLI

将文件复制到你的用户命令目录：

```bash
mkdir -p ~/.claude/commands
cp .claude/commands/dissipative-valve.md ~/.claude/commands/
cp .claude/commands/dissipative-valve-continue.md ~/.claude/commands/
cp .claude/commands/dissipative-valve-review.md ~/.claude/commands/
```

---

## 15. 使用建议

推荐在这些场景手动启用：

- “帮我写完整方案”
- “给我做长篇研究”
- “从头到尾重构这个模块”
- “多阶段排查这个复杂故障”

可以直接这样用：

```text
/dissipative-valve 设计 OpenSynapse 的多租户权限架构，并输出实施步骤和风险
```

也可以这样用：

```text
请帮我写一份 OpenSynapse 多租户权限架构设计
/dissipative-valve
```

还可以这样用：

```text
<已经进行了很多轮开发对话，明显开始发散>
/dissipative-valve
```

这时命令应自动理解为：

- 从当前对话中恢复真实任务
- 抽取可信状态
- 生成 handoff packet
- 明确提示“当前对话可以关闭”

这里最关键的一点是：

**不能只看最近一句话。**

因为真实开发会话里，最后几条消息经常只是：

- “继续”
- “可以”
- “按这个来”
- “开始”

真正的任务定义往往埋在更前面的对话和当前工件中。

因此更合理的恢复策略应该是：

1. 看整个可见会话中的主导未完成线程
2. 看当前有哪些文件正在被修改
3. 看 `git status --short` 和 `git diff --stat` 暴露出的真实工作焦点
4. 看已有的状态核 / handoff packet
5. 综合恢复“当前真正的工作目标”

当它生成 handoff packet 后，在**新会话**里继续：

```text
/dissipative-valve-continue
```

如果你怀疑多次 handoff 后已经开始偏题，可以在任意新会话中运行：

```text
/dissipative-valve-review
```

---

## 16. 后续增强方向

后续可以继续升级成：

1. 小模型摘要器模式
   把快照压缩交给更小、更便宜的模型

2. 自动插阀
   当检测到上下文长度、工具步数、输出长度超过阈值时自动触发

---

## 17. 一句话结论

`Dissipative Structure Valve` 的本质不是“更强的 prompt”，而是：

**把长链任务从封闭熵增系统，改造成可阶段排气、可压缩恢复、可回卷的开放执行系统。**
