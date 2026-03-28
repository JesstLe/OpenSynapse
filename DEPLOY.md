# OpenSynapse 服务器部署指南

## 部署前准备

### 1. 环境要求

- **Node.js**: 18+ 
- **npm**: 9+ 或 **pnpm**: 8+
- **Git**
- **PM2** (进程管理): `npm install -g pm2`
- **Nginx** (反向代理，可选但推荐)

### 2. 服务器配置建议

| 配置项 | 最低配置 | 推荐配置 |
|--------|----------|----------|
| CPU | 2核 | 4核+ |
| 内存 | 2GB | 4GB+ |
| 存储 | 20GB SSD | 50GB+ SSD |
| 带宽 | 5Mbps | 10Mbps+ |

## 部署方案选择

### 方案一：自有服务器 + PM2 (推荐)

适合：有独立服务器，需要完全控制

#### 步骤 1: 克隆代码

```bash
cd /var/www
git clone https://github.com/JesstLe/OpenSynapse.git
cd OpenSynapse
```

#### 步骤 2: 安装依赖

```bash
npm install
```

#### 步骤 3: 配置环境变量

```bash
cp .env.example .env.production
nano .env.production
```

**必需配置**:
```bash
# AI 提供商 API Key (至少配置一个)
GEMINI_API_KEY="your_gemini_api_key"
# 或
OPENAI_API_KEY="your_openai_api_key"

# 应用 URL
APP_URL="https://your-domain.com"

# Firebase (必需)
FIREBASE_SERVICE_ACCOUNT_KEY='{"type":"service_account",...}'

# 多提供商认证 (可选，如需微信/QQ登录)
WECHAT_APP_ID="your_wechat_app_id"
WECHAT_APP_SECRET="your_wechat_app_secret"
QQ_APP_ID="your_qq_app_id"
QQ_APP_SECRET="your_qq_app_secret"
```

#### 步骤 4: 构建前端

```bash
npm run build
```

#### 步骤 5: 使用 PM2 启动

```bash
# 创建 PM2 配置文件
cat > ecosystem.config.js << 'EOF'
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
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    // 日志配置
    log_file: './logs/combined.log',
    out_file: './logs/out.log',
    error_file: './logs/error.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    // 自动重启配置
    min_uptime: '10s',
    max_restarts: 5,
    // 优雅关闭
    kill_timeout: 5000,
    listen_timeout: 10000
  }]
};
EOF

# 创建日志目录
mkdir -p logs

# 启动应用
pm2 start ecosystem.config.js --env production

# 保存 PM2 配置
pm2 save

# 设置开机自启
pm2 startup
```

#### 步骤 6: 配置 Nginx (可选但推荐)

```bash
sudo nano /etc/nginx/sites-available/opensynapse
```

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # 反向代理到 Node.js 应用
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # 超时设置
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # 静态资源缓存
    location /assets/ {
        proxy_pass http://localhost:3000;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # 安全头
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
}
```

启用配置:
```bash
sudo ln -s /etc/nginx/sites-available/opensynapse /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

#### 步骤 7: 配置 HTTPS (使用 Certbot)

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

---

### 方案二：Docker 部署

适合：需要容器化、快速部署

#### 创建 Dockerfile

```dockerfile
# 构建阶段
FROM node:18-alpine AS builder

WORKDIR /app

# 复制依赖文件
COPY package*.json ./
RUN npm ci --only=production

# 复制源代码
COPY . .

# 构建前端
RUN npm run build

# 运行阶段
FROM node:18-alpine

WORKDIR /app

# 安装 tsx
RUN npm install -g tsx pm2

# 从构建阶段复制文件
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/server.ts ./
COPY --from=builder /app/src ./src
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/config ./config

# 创建日志目录
RUN mkdir -p logs

# 暴露端口
EXPOSE 3000

# 启动命令
CMD ["pm2-runtime", "start", "server.ts", "--name", "opensynapse", "--interpreter", "tsx"]
```

#### 创建 docker-compose.yml

```yaml
version: '3.8'

services:
  opensynapse:
    build: .
    container_name: opensynapse
    restart: always
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - PORT=3000
    env_file:
      - .env.production
    volumes:
      - ./logs:/app/logs
      - ./.env.production:/app/.env.production:ro
    networks:
      - opensynapse-network

  # 可选：使用 Nginx 作为反向代理
  nginx:
    image: nginx:alpine
    container_name: opensynapse-nginx
    restart: always
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
    depends_on:
      - opensynapse
    networks:
      - opensynapse-network

networks:
  opensynapse-network:
    driver: bridge
```

#### 部署命令

```bash
# 构建并启动
docker-compose up -d --build

# 查看日志
docker-compose logs -f opensynapse

# 停止
docker-compose down
```

---

### 方案三：Firebase Hosting + Cloud Functions

适合：无服务器架构，简化运维

#### 步骤 1: 安装 Firebase CLI

```bash
npm install -g firebase-tools
firebase login
```

#### 步骤 2: 初始化 Firebase

```bash
firebase init
# 选择: Hosting, Functions
```

#### 步骤 3: 部署

```bash
# 构建前端
npm run build

# 部署
firebase deploy
```

**注意**: Firebase Hosting 只支持静态文件，Express 后端需要迁移到 Firebase Functions 或使用 Cloud Run。

---

## 部署后检查清单

### 1. 验证部署

```bash
# 检查应用状态
curl http://localhost:3000

# 检查 PM2 状态
pm2 status
pm2 logs opensynapse

# 检查端口监听
netstat -tlnp | grep 3000
```

### 2. 功能测试

- [ ] 前端页面正常加载
- [ ] AI 对话功能正常
- [ ] Firebase 登录正常
- [ ] 数据保存到 Firestore 正常
- [ ] 知识提炼功能正常
- [ ] 文件导入功能正常

### 3. 监控配置

```bash
# 查看实时日志
pm2 logs opensynapse --lines 100

# 监控资源使用
pm2 monit

# 查看应用信息
pm2 show opensynapse
```

---

## 常见问题

### Q: 应用启动后无法访问？

```bash
# 检查防火墙
sudo ufw status
sudo ufw allow 3000

# 检查端口占用
lsof -i :3000

# 查看错误日志
pm2 logs opensynapse
```

### Q: 环境变量不生效？

```bash
# 确保文件权限正确
chmod 600 .env.production

# 重启应用
pm2 restart opensynapse
```

### Q: 如何更新部署？

```bash
# 拉取最新代码
git pull origin main

# 安装新依赖
npm install

# 重新构建
npm run build

# 重启应用
pm2 restart opensynapse

# 查看状态
pm2 logs opensynapse
```

### Q: 如何备份数据？

OpenSynapse 使用 Firebase Firestore，数据自动云端备份。如需本地备份：

```bash
# 导出 Firestore 数据
firebase firestore:export ./backups/$(date +%Y%m%d)
```

---

## 生产环境优化建议

### 1. 启用 Gzip 压缩

在 `server.ts` 中添加:
```typescript
import compression from 'compression';
app.use(compression());
```

### 2. 配置 Redis (可选)

用于 session 存储和缓存:
```bash
npm install redis connect-redis
```

### 3. 启用日志轮转

```bash
npm install winston winston-daily-rotate-file
```

### 4. 监控和告警

- 使用 PM2 Plus: `pm2 plus`
- 或使用 Sentry 进行错误追踪

---

## 需要帮助？

查看详细文档:
- `docs/auth/environment-variables.md` - 环境变量配置
- `docs/firestore-rules-deployment.md` - Firestore 规则部署
- `AGENTS.md` - 架构文档

**选择你的部署方案，我帮你执行！** 🚀