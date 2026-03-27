<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# OpenSynapse (突触) - AI 驱动的知识复利系统

外挂式海马体 —— 通过 AI 驱动的知识捕获、图谱化存储和算法化复习，构建你的神经网络。

## 核心功能

- **🧠 知识图谱可视化** - D3.js 驱动的交互式知识网络，支持缩放、平移、节点点击查看详情
- **📝 智能笔记捕获** - CLI 工具 + AI 自动提取结构化笔记和闪卡
- **🎯 FSRS 算法复习** - 基于科学遗忘曲线的间隔重复算法，精准预测最佳复习时机
- **🤖 AI 导师对话** - 集成 Gemini AI，支持多轮对话、PDF 解析、图片识别
- **☁️ 多端云同步** - Firebase 实时同步，支持跨设备访问
- **📊 认知负荷仪表盘** - 可视化展示知识增长、复习完成率和大脑"负荷"状态

## 技术栈

- **前端**: React 19 + TypeScript + Vite + Tailwind CSS 4
- **可视化**: D3.js (力导向图) + Recharts (数据图表) + Motion (动画)
- **AI**: Google Gemini API + 向量嵌入
- **后端**: Express.js + 本地 JSON 存储 / Firebase Firestore
- **算法**: FSRS (Free Spaced Repetition Scheduler)

## 快速开始

**环境要求**: Node.js 18+

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量
cp .env.example .env.local
# 编辑 .env.local，添加你的 Gemini API Key
echo "GEMINI_API_KEY=your_api_key_here" >> .env.local

# 3. 启动开发服务器
npm run dev
```

应用将在 http://localhost:3000 运行

## CLI 工具使用

处理导出的对话或学习资料，自动提取笔记和闪卡：

```bash
npx tsx cli.ts path/to/exported_chat.txt
```

## 项目结构

```
./
├── server.ts              # Express + Vite 开发服务器
├── cli.ts                 # CLI 工具（AI 内容处理）
├── src/
│   ├── main.tsx           # React 入口
│   ├── App.tsx            # 主应用组件
│   ├── components/        # React 组件
│   │   ├── ChatView.tsx      # AI 对话界面
│   │   ├── DashboardView.tsx # 数据仪表盘
│   │   ├── GraphView.tsx     # 知识图谱
│   │   ├── NotesView.tsx     # 笔记管理
│   │   └── ReviewView.tsx    # 闪卡复习
│   ├── services/
│   │   ├── fsrs.ts        # FSRS 间隔重复算法
│   │   └── gemini.ts      # Gemini AI 服务
│   └── types.ts           # TypeScript 类型定义
├── firestore.rules        # Firebase 安全规则
└── AGENTS.md              # 项目文档（开发指南）
```

## 开发指南

详见 [AGENTS.md](./AGENTS.md) 了解：
- 项目架构和约定
- 代码风格和反模式
- 常用命令和入口点
- 各模块职责说明

## AI Studio 原型

本项目最初在 Google AI Studio 中创建：
https://ai.studio/apps/0908f2c8-7d16-420f-904a-55223d56e571

## 许可证

MIT
