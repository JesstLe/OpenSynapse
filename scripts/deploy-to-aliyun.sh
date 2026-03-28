#!/bin/bash
#
# OpenSynapse 阿里云 ECS 一键部署脚本
# 使用方法: 在阿里云 ECS 上运行: curl -fsSL <脚本URL> | bash
#

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查 root 权限
check_root() {
    if [ "$EUID" -ne 0 ]; then
        log_error "请使用 root 用户运行此脚本"
        exit 1
    fi
}

# 配置阿里云镜像源
setup_aliyun_mirror() {
    log_info "配置阿里云镜像源..."
    
    if [ -f "/etc/apt/sources.list" ]; then
        cp /etc/apt/sources.list /etc/apt/sources.list.bak.$(date +%Y%m%d)
        cat > /etc/apt/sources.list << 'EOF'
deb http://mirrors.aliyun.com/ubuntu/ noble main restricted universe multiverse
deb http://mirrors.aliyun.com/ubuntu/ noble-updates main restricted universe multiverse
deb http://mirrors.aliyun.com/ubuntu/ noble-backports main restricted universe multiverse
deb http://mirrors.aliyun.com/ubuntu/ noble-security main restricted universe multiverse
EOF
        log_success "阿里云镜像源配置完成"
    fi
}

# 更新系统
update_system() {
    log_info "更新系统..."
    apt update && apt upgrade -y
    log_success "系统更新完成"
}

# 安装基础依赖
install_base_deps() {
    log_info "安装基础依赖..."
    apt install -y git curl wget nginx build-essential ufw
    log_success "基础依赖安装完成"
}

# 安装 Node.js
install_nodejs() {
    log_info "安装 Node.js 22..."
    
    # 检查是否已安装
    if command -v node &> /dev/null; then
        NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
        if [ "$NODE_VERSION" -ge 18 ]; then
            log_warn "Node.js 已安装: $(node -v)，跳过安装"
            return
        fi
    fi
    
    # 安装 NodeSource 源
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt install -y nodejs
    
    # 验证
    log_success "Node.js 安装完成: $(node -v)"
    log_success "npm 安装完成: $(npm -v)"
}

# 安装 PM2
install_pm2() {
    log_info "安装 PM2..."
    
    if command -v pm2 &> /dev/null; then
        log_warn "PM2 已安装，跳过"
        return
    fi
    
    npm install -g pm2
    log_success "PM2 安装完成: $(pm2 -v)"
}

# 配置防火墙
setup_firewall() {
    log_info "配置防火墙..."
    
    ufw default deny incoming
    ufw default allow outgoing
    ufw allow OpenSSH
    ufw allow 'Nginx Full'
    
    # 启用防火墙（非交互式）
    echo "y" | ufw enable
    
    log_success "防火墙配置完成"
    ufw status
}

# 创建应用目录
setup_app_directory() {
    log_info "创建应用目录..."
    
    mkdir -p /srv/opensynapse
    cd /srv/opensynapse
    
    # 检查是否已有代码
    if [ -d "app/.git" ]; then
        log_warn "检测到已有代码，执行更新..."
        cd app
        git pull origin main
    else
        log_info "克隆代码..."
        git clone https://github.com/JesstLe/OpenSynapse.git app
        cd app
    fi
    
    log_success "代码准备完成"
}

# 安装项目依赖
install_app_deps() {
    log_info "安装项目依赖..."
    cd /srv/opensynapse/app
    
    # 使用 npm ci 如果存在 package-lock.json
    if [ -f "package-lock.json" ]; then
        npm ci
    else
        npm install
    fi
    
    log_success "依赖安装完成"
}

# 配置环境变量
setup_env() {
    log_info "配置环境变量..."
    cd /srv/opensynapse/app
    
    if [ -f ".env.local" ]; then
        log_warn ".env.local 已存在，保留现有配置"
        return
    fi
    
    # 获取服务器公网 IP
    PUBLIC_IP=$(curl -s ifconfig.me || echo "localhost")
    
    cat > .env.local << EOF
NODE_ENV=production
PORT=3000
APP_URL="http://${PUBLIC_IP}"

# AI 提供商 API Key (请修改为你自己的)
GEMINI_API_KEY=""
OPENAI_API_KEY=""
OPENAI_BASE_URL="https://api.openai.com/v1"
MINIMAX_API_KEY=""
MINIMAX_BASE_URL="https://api.minimaxi.com/anthropic"
ZHIPU_API_KEY=""
ZHIPU_BASE_URL="https://open.bigmodel.cn/api/anthropic"
MOONSHOT_API_KEY=""
MOONSHOT_BASE_URL="https://api.kimi.com/coding/"

# Firebase (可选)
# FIREBASE_SERVICE_ACCOUNT_KEY='{"type":"service_account",...}'
EOF
    
    log_success "环境变量模板已创建: /srv/opensynapse/app/.env.local"
    log_warn "请编辑 .env.local 填入你的 API Key"
}

# 构建应用
build_app() {
    log_info "构建应用..."
    cd /srv/opensynapse/app
    
    # 类型检查
    npm run lint
    
    # 构建
    npm run build
    
    log_success "应用构建完成"
}

# 创建 PM2 配置
create_pm2_config() {
    log_info "创建 PM2 配置..."
    cd /srv/opensynapse/app
    
    cat > ecosystem.config.cjs << 'EOF'
module.exports = {
  apps: [{
    name: 'opensynapse',
    script: 'server.ts',
    interpreter: 'tsx',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    log_file: './logs/combined.log',
    out_file: './logs/out.log',
    error_file: './logs/error.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    min_uptime: '10s',
    max_restarts: 5,
    kill_timeout: 5000,
    listen_timeout: 10000
  }]
};
EOF
    
    mkdir -p logs
    log_success "PM2 配置创建完成"
}

# 配置 Nginx
setup_nginx() {
    log_info "配置 Nginx..."
    
    # 获取服务器 IP
    SERVER_IP=$(curl -s ifconfig.me || echo "localhost")
    
    cat > /etc/nginx/sites-available/opensynapse << EOF
server {
    listen 80;
    server_name ${SERVER_IP};

    client_max_body_size 50m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF
    
    # 启用站点
    rm -f /etc/nginx/sites-enabled/opensynapse
    ln -s /etc/nginx/sites-available/opensynapse /etc/nginx/sites-enabled/
    
    # 测试配置
    nginx -t
    
    # 重启 Nginx
    systemctl restart nginx
    
    log_success "Nginx 配置完成"
}

# 启动应用
start_app() {
    log_info "启动应用..."
    cd /srv/opensynapse/app
    
    # 检查 .env.local 是否配置
    if [ ! -f ".env.local" ]; then
        log_error ".env.local 不存在，请先配置环境变量"
        exit 1
    fi
    
    # 停止旧进程
    pm2 stop opensynapse 2>/dev/null || true
    pm2 delete opensynapse 2>/dev/null || true
    
    # 启动
    pm2 start ecosystem.config.cjs --env production
    
    # 保存配置
    pm2 save
    
    # 设置开机自启
    pm2 startup systemd -u root --hp /root
    
    log_success "应用启动完成"
}

# 显示完成信息
show_completion() {
    SERVER_IP=$(curl -s ifconfig.me || echo "你的服务器IP")
    
    echo ""
    echo "=========================================="
    echo -e "${GREEN}🎉 OpenSynapse 部署完成!${NC}"
    echo "=========================================="
    echo ""
    echo "访问地址:"
    echo "  - http://${SERVER_IP} (Nginx 反代)"
    echo "  - http://${SERVER_IP}:3000 (直连)"
    echo ""
    echo "项目目录: /srv/opensynapse/app"
    echo ""
    echo "常用命令:"
    echo "  pm2 status          # 查看应用状态"
    echo "  pm2 logs opensynapse # 查看日志"
    echo "  pm2 restart opensynapse # 重启应用"
    echo ""
    echo "重要提醒:"
    echo "  1. 请编辑 /srv/opensynapse/app/.env.local 填入 API Key"
    echo "  2. 修改后运行: pm2 restart opensynapse"
    echo "  3. 如需 HTTPS，请运行: certbot --nginx"
    echo ""
    echo "=========================================="
}

# 主函数
main() {
    echo "=========================================="
    echo "  OpenSynapse 阿里云 ECS 一键部署"
    echo "=========================================="
    echo ""
    
    check_root
    setup_aliyun_mirror
    update_system
    install_base_deps
    install_nodejs
    install_pm2
    setup_firewall
    setup_app_directory
    install_app_deps
    setup_env
    build_app
    create_pm2_config
    setup_nginx
    start_app
    show_completion
}

# 运行主函数
main "$@"
