# OpenSynapse 云服务器部署指南

## 概述

本文档记录将 OpenSynapse 部署到阿里云 ECS 的完整流程。由于中国大陆网络限制，本指南使用替代方案（APT 替代 Docker、rsync 替代 git clone）。

## 前置条件

- **服务器**: Ubuntu 24.04 LTS
- **IP 地址**: 101.133.166.67（示例）
- **SSH 密钥**: `opennew.pem`（存储在项目根目录）
- **域名**: 可选，可使用 IP 直接访问

---

## 第一步：服务器环境初始化

### 1.1 连接服务器

```bash
cd /Users/lv/Workspace/OpenSynapse
ssh -i opennew.pem -o StrictHostKeyChecking=accept-new root@101.133.166.67
```

### 1.2 安装 Node.js 20

```bash
# 使用 NodeSource 安装 Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# 验证安装
node --version  # 应显示 v20.x.x
npm --version   # 应显示 10.x.x
```

### 1.3 安装 PM2 和 tsx

```bash
npm install -g pm2 tsx

# 验证 PM2
pm2 --version
```

### 1.4 安装 PostgreSQL

由于 Docker Hub 被墙，使用 APT 直接安装：

```bash
# 添加 PostgreSQL 官方源
curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /usr/share/keyrings/postgresql.gpg
echo "deb [signed-by=/usr/share/keyrings/postgresql.gpg] http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list
apt-get update

# 安装 PostgreSQL 16
apt-get install -y postgresql-16 postgresql-client-16

# 启动 PostgreSQL
systemctl enable postgresql
systemctl start postgresql
```

---

## 第二步：配置数据库

### 2.1 创建数据库和用户

```bash
# 切换到 postgres 用户
su - postgres

# 进入 PostgreSQL 控制台
psql

# 创建数据库和用户
CREATE DATABASE opensynapse;
CREATE USER opensynapse WITH PASSWORD '你的密码';

# 授权
GRANT ALL PRIVILEGES ON DATABASE opensynapse TO opensynapse;

# 退出
\q
exit
```

### 2.2 执行数据库迁移

项目使用 Drizzle ORM，需要创建数据库表：

```bash
# 在服务器上执行
ssh -i opennew.pem root@101.133.166.67

# 执行 SQL 迁移文件
su - postgres -c "psql -d opensynapse -f /www/wwwroot/opensynapse/src/db/migrations/0000_gifted_madame_web.sql"
su - postgres -c "psql -d opensynapse -f /www/wwwroot/opensynapse/src/db/migrations/0001_swift_magus.sql"
su - postgres -c "psql -d opensynapse -f /www/wwwroot/opensynapse/src/db/migrations/0002_add_session_ip_columns.sql"

# 授予权限
su - postgres -c "psql -d opensynapse -c 'GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO opensynapse;'"
su - postgres -c "psql -d opensynapse -c 'GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO opensynapse;'"

# 验证表已创建
su - postgres -c "psql -d opensynapse -c '\dt'"
```

### 2.3 配置远程访问（可选）

如需从外部连接数据库：

```bash
# 编辑配置文件
nano /etc/postgresql/16/main/postgresql.conf
# 找到并修改：listen_addresses = '*'

nano /etc/postgresql/16/main/pg_hba.conf
# 添加：host  all  all  0.0.0.0/0  scram-sha-256

# 重启 PostgreSQL
systemctl restart postgresql
```

---

## 第三步：部署项目代码

### 3.1 创建项目目录

```bash
mkdir -p /www/wwwroot/opensynapse
cd /www/wwwroot/opensynapse
```

### 3.2 上传代码（使用 rsync）

由于 GitHub 被墙，从本地上传代码：

**在本地执行：**

```bash
cd /Users/lv/Workspace/OpenSynapse

# 使用 rsync 上传（排除 node_modules）
rsync -avz --exclude 'node_modules' \
  --exclude '.git' \
  --exclude 'dist' \
  -e "ssh -i opennew.pem" \
  ./ root@101.133.166.67:/www/wwwroot/opensynapse/
```

### 3.3 安装依赖

**在服务器上执行：**

```bash
cd /www/wwwroot/opensynapse
npm install
```

### 3.4 构建前端

```bash
npm run build

# 确认 dist 目录生成
ls -la dist/
```

---

## 第四步：配置环境变量

### 4.1 创建生产环境配置

```bash
cd /www/wwwroot/opensynapse
nano .env.production
```

**填入以下内容：**

```env
# 数据库连接（使用 PostgreSQL）
DATABASE_URL=postgresql://opensynapse:你的密码@localhost:5432/opensynapse

# Better Auth 密钥（32 位以上随机字符串）
BETTER_AUTH_SECRET=your-super-secret-auth-key-minimum-32-characters

# 社交登录配置（可选，如需登录功能）
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret

DISCORD_CLIENT_ID=your_discord_client_id
DISCORD_CLIENT_SECRET=your_discord_client_secret

# AI API 密钥（可选，如需 AI 功能）
GEMINI_API_KEY=your_gemini_api_key
OPENAI_API_KEY=your_openai_api_key

# 其他配置
NODE_ENV=production
PORT=3000
```

### 4.2 修复 PM2 配置模块问题

由于 package.json 使用 `"type": "module"`，需要将 PM2 配置改为 CommonJS 格式：

```bash
cd /www/wwwroot/opensynapse
mv ecosystem.config.js ecosystem.config.cjs
```

**验证 ecosystem.config.cjs 内容：**

```javascript
module.exports = {
  apps: [
    {
      name: 'opensynapse',
      script: 'server.ts',
      interpreter: 'tsx',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      error_file: './logs/error.log',
      out_file: './logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
  ],
};
```

---

## 第五步：启动应用

### 5.1 使用 PM2 启动

```bash
cd /www/wwwroot/opensynapse
pm2 start ecosystem.config.cjs --env production

# 保存 PM2 配置
pm2 save

# 设置开机自启
pm2 startup systemd
```

### 5.2 检查运行状态

```bash
# 查看进程状态
pm2 status

# 查看日志
pm2 logs opensynapse --lines 50

# 本地测试
curl http://localhost:3000
```

---

## 第六步：配置阿里云安全组

### 6.1 创建安全组模板

1. 登录 **阿里云控制台** → **ECS** → **安全组**
2. 点击 **创建安全组模板**
3. 填写：
   - **模板名称**: `opensynapse`
   - **添加规则**: 
     - 类型：自定义 TCP
     - 端口范围：`3000`
     - 来源 IP：`0.0.0.0/0`（或你的 IP）
     - 策略：允许
     - 备注：`OpenSynapse`
   - 点击 **创建模板**

### 6.2 应用安全组到实例

1. 进入 **ECS 实例列表**
2. 找到目标实例 → **更多** → **网络和安全组** → **安全组配置**
3. 点击 **加入安全组**
4. 选择刚才创建的 `opensynapse` 模板
5. 确认加入

---

## 第七步：验证部署

### 7.1 外部访问测试

```bash
# 从本地测试
curl http://101.133.166.67:3000
```

或在浏览器访问：`http://101.133.166.67:3000`

### 7.2 常见问题排查

**问题 1：连接被拒绝**
```bash
# 检查 PM2 状态
pm2 status

# 检查日志
pm2 logs opensynapse

# 检查端口监听
netstat -tlnp | grep 3000
```

**问题 2：模块错误**
- 确保已执行 `mv ecosystem.config.js ecosystem.config.cjs`

**问题 3：数据库连接失败**
```bash
# 测试数据库连接
su - postgres -c "psql -d opensynapse -c '\dt'"

# 检查 PostgreSQL 状态
systemctl status postgresql
```

---

## 第八步：可选配置

### 8.1 配置 Nginx 反向代理（推荐）

如需使用域名访问：

```bash
apt-get install -y nginx

# 创建配置
nano /etc/nginx/sites-available/opensynapse
```

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
ln -s /etc/nginx/sites-available/opensynapse /etc/nginx/sites-enabled/
nginx -t
systemctl restart nginx
```

### 8.2 配置 HTTPS（使用 Certbot）

```bash
apt-get install -y certbot python3-certbot-nginx
certbot --nginx -d your-domain.com
```

### 8.3 配置 Chroma 向量数据库（可选）

如需知识图谱和 RAG 功能：

```bash
# 安装 Chroma（使用 pip，Docker 被墙）
pip install chromadb

# 启动 Chroma 服务
chroma run --path /www/chroma_data --port 8000
```

然后在 `.env.production` 添加：
```env
CHROMA_URL=http://localhost:8000
```

---

## 第六步（可选）：配置 Nginx 反向代理（隐藏端口号）

默认情况下应用运行在 3000 端口，访问时需要输入 `http://IP:3000`。使用 Nginx 反向代理可以隐藏端口号，直接通过 `http://IP` 访问。

### 6.1 快速配置（使用脚本）

```bash
# 在项目根目录执行
./setup-nginx.sh
```

### 6.2 手动配置

```bash
# 1. 安装 Nginx
ssh -i opennew.pem root@101.133.166.67
apt-get update
apt-get install -y nginx

# 2. 创建配置文件
cat > /etc/nginx/sites-available/opensynapse << 'EOF'
server {
    listen 80;
    server_name _;

    access_log /var/log/nginx/opensynapse-access.log;
    error_log /var/log/nginx/opensynapse-error.log;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400s;
        proxy_buffering off;
    }

    location /assets/ {
        proxy_pass http://localhost:3000;
        expires 1d;
        add_header Cache-Control "public, immutable";
    }
}
EOF

# 3. 启用配置
rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/opensynapse /etc/nginx/sites-enabled/opensynapse

# 4. 测试并重启
nginx -t
systemctl restart nginx
systemctl enable nginx
```

### 6.3 更新 Better Auth 配置

使用 Nginx 后，需要添加端口 80 到 Better Auth 的信任来源：

```typescript
// src/auth/server.ts
trustedOrigins: [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://101.133.166.67:3000",
  "http://101.133.166.67",        // 添加：Nginx 反向代理
  "http://101.133.166.67:80"
],
```

修改后重新部署：
```bash
./deploy.sh 更新
```

### 6.4 阿里云安全组配置

配置 Nginx 后，需要更新安全组规则：

| 规则方向 | 授权策略 | 协议类型 | 端口范围 | 授权对象 | 说明 |
|---------|---------|---------|---------|---------|------|
| 入方向 | 允许 | HTTP (80) | 80/80 | 0.0.0.0/0 | Nginx 对外服务 |
| 入方向 | 允许 | 自定义 TCP | 3000/3000 | 127.0.0.1/32 | 仅本地访问（可选） |

**建议**：可以关闭外部对 3000 端口的访问，只允许本地（127.0.0.1）访问，增强安全性。

### 6.5 验证

配置完成后访问：
```
http://101.133.166.67
```

不再需要使用 `:3000` 端口号。

---

## 附录 A：快速命令参考

```bash
# SSH 登录
ssh -i opennew.pem root@101.133.166.67

# PM2 常用命令
pm2 status              # 查看状态
pm2 logs opensynapse    # 查看日志
pm2 restart opensynapse # 重启应用
pm2 stop opensynapse    # 停止应用
pm2 delete opensynapse  # 删除进程

# PostgreSQL 常用命令
su - postgres
psql -d opensynapse
\dt                     # 查看表
\q                      # 退出

# 查看端口占用
netstat -tlnp | grep 3000
lsof -i :3000

# 查看防火墙（阿里云安全组是主要限制）
iptables -L -n | grep 3000
```

---

## 附录 B：更新部署流程

当代码更新时：

```bash
# 1. 本地构建并上传
cd /Users/lv/Workspace/OpenSynapse
npm run build
rsync -avz --exclude 'node_modules' --exclude '.git' \
  -e "ssh -i opennew.pem" \
  ./ root@101.133.166.67:/www/wwwroot/opensynapse/

# 2. 服务器上重启
ssh -i opennew.pem root@101.133.166.67 "pm2 restart opensynapse"
```

---

## 已知限制

1. **GitHub 访问**: 中国大陆服务器无法直接访问 GitHub，使用 rsync 上传代码
2. **Docker Hub**: 被墙，使用 APT 安装 PostgreSQL 而非 Docker
3. **API 访问**: 如需使用 AI 功能，确保 API 密钥可用（Gemini/OpenAI 等）
4. **Chroma**: 向量数据库使用本地安装而非 Docker

---

**最后更新**: 2026-03-30
