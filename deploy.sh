#!/bin/bash

# OpenSynapse 部署脚本
# 使用方法: ./deploy.sh [production|staging]

set -e

ENV=${1:-production}
echo "🚀 开始部署 OpenSynapse 到 $ENV 环境..."

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查依赖
echo "📦 检查依赖..."
if ! command -v node &> /dev/null; then
    echo -e "${RED}错误: Node.js 未安装${NC}"
    exit 1
fi

if ! command -v pm2 &> /dev/null; then
    echo -e "${YELLOW}警告: PM2 未安装，正在安装...${NC}"
    npm install -g pm2
fi

# 检查环境变量文件
if [ ! -f ".env.$ENV" ]; then
    if [ -f ".env.local" ]; then
        echo -e "${YELLOW}警告: .env.$ENV 不存在，使用 .env.local${NC}"
        cp .env.local .env.$ENV
    else
        echo -e "${RED}错误: 环境变量文件不存在 (.env.$ENV 或 .env.local)${NC}"
        exit 1
    fi
fi

# 安装依赖
echo "📥 安装依赖..."
npm ci --production

# 构建前端
echo "🏗️  构建前端..."
npm run build

# 创建日志目录
mkdir -p logs

# 停止旧进程 (如果存在)
echo "🛑 停止旧进程..."
pm2 stop opensynapse 2>/dev/null || true

# 启动新进程
echo "✅ 启动应用..."
pm2 start ecosystem.config.js --env $ENV

# 保存 PM2 配置
echo "💾 保存 PM2 配置..."
pm2 save

echo ""
echo -e "${GREEN}🎉 部署成功!${NC}"
echo ""
echo "应用状态:"
pm2 status opensynapse
echo ""
echo "查看日志:"
echo "  pm2 logs opensynapse"
echo ""
echo "监控资源:"
echo "  pm2 monit"
echo ""