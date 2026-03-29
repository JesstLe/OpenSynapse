#!/bin/bash

# OpenSynapse 云服务器一键部署脚本
# 用法: ./deploy.sh [首次部署 | 更新]

set -e

# 配置
SERVER_IP="101.133.166.67"
SSH_KEY="./opennew.pem"
REMOTE_DIR="/www/wwwroot/opensynapse"
LOCAL_DIR="/Users/lv/Workspace/OpenSynapse"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  OpenSynapse 部署脚本${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# 检查参数
if [ "$1" == "首次部署" ]; then
    DEPLOY_TYPE="init"
elif [ "$1" == "更新" ]; then
    DEPLOY_TYPE="update"
else
    echo "用法: ./deploy.sh [首次部署 | 更新]"
    echo ""
    echo "  首次部署 - 完整的服务器初始化和部署"
    echo "  更新     - 仅更新代码并重启"
    exit 1
fi

# 检查 SSH 密钥
if [ ! -f "$SSH_KEY" ]; then
    echo -e "${RED}错误: 找不到 SSH 密钥 $SSH_KEY${NC}"
    exit 1
fi

# 设置 SSH 选项
SSH_OPTS="-i $SSH_KEY -o StrictHostKeyChecking=no -o ConnectTimeout=10"

echo -e "${YELLOW}目标服务器: $SERVER_IP${NC}"
echo -e "${YELLOW}部署类型: $1${NC}"
echo ""

if [ "$DEPLOY_TYPE" == "init" ]; then
    echo -e "${GREEN}[1/6] 连接到服务器并安装依赖...${NC}"
    ssh $SSH_OPTS root@$SERVER_IP << 'EOF'
        # 更新系统
        apt-get update
        
        # 安装基础工具
        apt-get install -y curl wget git rsync net-tools
        
        # 安装 Node.js 20
        if ! command -v node &> /dev/null || [ "$(node -v | cut -d'v' -f2 | cut -d'.' -f1)" != "20" ]; then
            echo "安装 Node.js 20..."
            curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
            apt-get install -y nodejs
        fi
        
        echo "Node.js 版本: $(node -v)"
        echo "NPM 版本: $(npm -v)"
        
        # 安装 PM2 和 tsx
        npm install -g pm2 tsx
        
        # 安装 PostgreSQL
        if ! command -v psql &> /dev/null; then
            echo "安装 PostgreSQL..."
            curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /usr/share/keyrings/postgresql.gpg
            echo "deb [signed-by=/usr/share/keyrings/postgresql.gpg] http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list
            apt-get update
            apt-get install -y postgresql-16 postgresql-client-16
            systemctl enable postgresql
            systemctl start postgresql
        fi
        
        # 创建项目目录
        mkdir -p $REMOTE_DIR
EOF
    
    echo -e "${GREEN}[2/6] 配置数据库...${NC}"
    read -p "请输入 PostgreSQL 密码 (直接回车使用默认 'opensynapse'): " DB_PASSWORD
    DB_PASSWORD=${DB_PASSWORD:-opensynapse}
    
    ssh $SSH_OPTS root@$SERVER_IP << EOF
        su - postgres -c "psql -c \\"
            CREATE DATABASE opensynapse;
            CREATE USER opensynapse WITH PASSWORD '$DB_PASSWORD';
            GRANT ALL PRIVILEGES ON DATABASE opensynapse TO opensynapse;
        \\" 2>/dev/null || echo '数据库可能已存在，继续...'"
EOF
    
    echo -e "${GREEN}[3/6] 上传项目代码...${NC}"
    cd "$LOCAL_DIR"
    rsync -avz --exclude 'node_modules' \
        --exclude '.git' \
        --exclude 'dist' \
        -e "ssh -i $SSH_KEY -o StrictHostKeyChecking=no" \
        ./ root@$SERVER_IP:$REMOTE_DIR/
    
    echo -e "${GREEN}[4/6] 安装依赖并构建...${NC}"
    ssh $SSH_OPTS root@$SERVER_IP << 'EOF'
        cd /www/wwwroot/opensynapse
        npm install
        npm run build

        # 修复 ecosystem.config.js 模块问题
        if [ -f ecosystem.config.js ]; then
            mv ecosystem.config.js ecosystem.config.cjs
        fi

        # 执行数据库迁移
        echo "执行数据库迁移..."
        su - postgres -c "psql -d opensynapse -f /www/wwwroot/opensynapse/src/db/migrations/0000_gifted_madame_web.sql"
        su - postgres -c "psql -d opensynapse -f /www/wwwroot/opensynapse/src/db/migrations/0001_swift_magus.sql"
        su - postgres -c "psql -d opensynapse -f /www/wwwroot/opensynapse/src/db/migrations/0002_add_session_ip_columns.sql"

        # 授予权限
        su - postgres -c "psql -d opensynapse -c 'GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO opensynapse;'"
        su - postgres -c "psql -d opensynapse -c 'GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO opensynapse;'"
EOF
    
    echo -e "${GREEN}[5/6] 配置环境变量...${NC}"
    echo "请在服务器上手动创建 .env.production 文件:"
    echo "  ssh -i $SSH_KEY root@$SERVER_IP"
    echo "  nano $REMOTE_DIR/.env.production"
    echo ""
    echo "参考模板:"
    cat << EOF
DATABASE_URL=postgresql://opensynapse:$DB_PASSWORD@localhost:5432/opensynapse
BETTER_AUTH_SECRET=$(openssl rand -base64 32)
NODE_ENV=production
PORT=3000
EOF
    
    read -p "配置完成后按回车继续..."
    
    echo -e "${GREEN}[6/6] 启动应用...${NC}"
    ssh $SSH_OPTS root@$SERVER_IP << 'EOF'
        cd /www/wwwroot/opensynapse
        pm2 start ecosystem.config.cjs --env production
        pm2 save
        pm2 startup systemd
        
        echo ""
        echo "应用状态:"
        pm2 status
EOF
    
    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}  部署完成！${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
    echo "请在阿里云控制台配置安全组，开放端口 3000"
    echo "访问地址: http://$SERVER_IP:3000"
    echo ""
    echo "查看日志: ssh -i $SSH_KEY root@$SERVER_IP 'pm2 logs opensynapse'"

else
    # 更新部署
    echo -e "${GREEN}[1/2] 上传更新的代码...${NC}"
    cd "$LOCAL_DIR"
    
    # 先本地构建
    echo "本地构建中..."
    npm run build
    
    # 上传代码
    rsync -avz --exclude 'node_modules' \
        --exclude '.git' \
        -e "ssh -i $SSH_KEY -o StrictHostKeyChecking=no" \
        ./ root@$SERVER_IP:$REMOTE_DIR/
    
    echo -e "${GREEN}[2/2] 服务器端构建并重启...${NC}"
    ssh $SSH_OPTS root@$SERVER_IP << 'EOF'
        cd /www/wwwroot/opensynapse
        npm install
        npm run build
        pm2 restart opensynapse
        
        echo ""
        echo "应用状态:"
        pm2 status
EOF
    
    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}  更新完成！${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
    echo "访问地址: http://$SERVER_IP:3000"
fi
