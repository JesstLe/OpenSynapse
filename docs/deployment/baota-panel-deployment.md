# OpenSynapse 宝塔面板快速部署指南

**服务器**: 101.133.166.67  
**面板**: 宝塔 Linux 面板  
**适用**: 已有宝塔环境的阿里云 ECS

---

## 🚀 方式一：宝塔面板图形化部署（最简单）

### 步骤 1：登录宝塔面板

```
http://101.133.166.67:8888
```

### 步骤 2：安装 Node.js

1. 宝塔面板 → **软件商店**
2. 搜索 **"Node.js"**
3. 安装 **Node.js 22.x 版本管理器**
4. 安装完成后，在版本管理中安装 **v22.x.x**

### 步骤 3：克隆代码

1. 宝塔面板 → **文件**
2. 进入 `/srv` 目录
3. 点击 **"终端"** 或 **"远程下载"**
4. 执行：

```bash
cd /srv
git clone https://github.com/JesstLe/OpenSynapse.git opensynapse
```

### 步骤 4：添加 Node 项目

1. 宝塔面板 → **网站** → **Node 项目**
2. 点击 **"添加 Node 项目"**
3. 填写：
   - **项目目录**: `/srv/opensynapse`
   - **启动命令**: `npm run start`
   - **项目端口**: `3000`
   - **项目名称**: `opensynapse`
4. 点击 **"提交"**

### 步骤 5：配置环境变量

1. 宝塔面板 → **文件**
2. 进入 `/srv/opensynapse`
3. 点击 **"新建"** → **"空白文件"**
4. 文件名：`.env.local`
5. 内容：

```bash
NODE_ENV=production
PORT=3000
APP_URL="http://101.133.166.67"

# 填入你的 API Key（至少一个）
GEMINI_API_KEY="你的Gemini API Key"
# 或
OPENAI_API_KEY="你的OpenAI API Key"
OPENAI_BASE_URL="https://api.openai.com/v1"
```

### 步骤 6：安装依赖并构建

在宝塔终端中执行：

```bash
cd /srv/opensynapse
npm install
npm run build
```

### 步骤 7：添加反向代理

1. 宝塔面板 → **网站**
2. 点击 **"添加站点"**
3. 填写：
   - **域名**: `101.133.166.67`（或你的域名）
   - **根目录**: `/srv/opensynapse/dist`
4. 创建后，点击站点设置 → **反向代理**
5. 添加反向代理：
   - **代理名称**: `opensynapse`
   - **目标 URL**: `http://127.0.0.1:3000`
   - **发送域名**: `$host`

### 步骤 8：放行端口

1. 宝塔面板 → **安全**
2. 放行端口：**3000**
3. 阿里云安全组也要放行 3000 端口（如果用了反代则不需要）

### 步骤 9：访问

```
http://101.133.166.67:3000
```

---

## ⚡ 方式二：SSH 一键部署（更快）

如果你已经连接 SSH：

```bash
# 1. 连接服务器（在本地终端执行）
ssh admin@101.133.166.67
# 密码: Ljh200203280/

# 2. 下载并执行部署脚本
curl -fsSL https://raw.githubusercontent.com/JesstLe/OpenSynapse/main/scripts/deploy-to-aliyun.sh | sudo bash

# 3. 编辑环境变量
nano /srv/opensynapse/app/.env.local
# 填入你的 API Key

# 4. 重启应用
pm2 restart opensynapse
```

---

## 📋 方式三：手动分步部署

### 1. 连接服务器

```bash
ssh admin@101.133.166.67
# 密码: Ljh200203280/
```

### 2. 安装 Node.js

```bash
# 使用宝塔的 Node.js 安装器，或手动安装
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
```

### 3. 拉取代码

```bash
mkdir -p /srv/opensynapse
cd /srv/opensynapse
git clone https://github.com/JesstLe/OpenSynapse.git app
cd app
```

### 4. 安装依赖

```bash
npm install
```

### 5. 配置环境变量

```bash
cp .env.example .env.local
nano .env.local
```

编辑内容：
```bash
NODE_ENV=production
PORT=3000
APP_URL="http://101.133.166.67"

# AI API Keys（至少配置一个）
GEMINI_API_KEY="你的API Key"
```

### 6. 构建并启动

```bash
npm run build
pm2 start npm --name opensynapse -- run start
pm2 save
pm2 startup
```

### 7. 配置 Nginx（宝塔自动完成）

宝塔面板会自动处理，无需手动配置。

---

## ✅ 部署后检查

### 检查应用状态

```bash
pm2 status
pm2 logs opensynapse
```

### 检查端口

```bash
netstat -tlnp | grep 3000
# 或
ss -tlnp | grep 3000
```

### 测试访问

```bash
curl http://localhost:3000
```

### 浏览器访问

```
http://101.133.166.67:3000
```

---

## 🔧 常见问题

### Q: 宝塔面板打不开？

```bash
# 检查面板状态
bt status

# 重启面板
bt restart

# 查看面板地址
bt default
```

### Q: 3000 端口无法访问？

1. 宝塔面板 → **安全** → 放行 3000 端口
2. 阿里云控制台 → 安全组 → 放行 3000 端口
3. 检查防火墙：
   ```bash
   ufw status
   ufw allow 3000
   ```

### Q: 如何更新代码？

```bash
cd /srv/opensynapse/app
git pull origin main
npm install
npm run build
pm2 restart opensynapse
```

### Q: 如何配置 HTTPS？

1. 宝塔面板 → **网站** → 你的站点
2. 点击 **"SSL"**
3. 选择 **"Let's Encrypt"** 免费证书
4. 勾选域名，点击 **"申请"**

---

## 📁 项目目录结构

部署完成后：

```
/srv/opensynapse/
├── app/                      # 项目代码
│   ├── dist/                 # 构建产物
│   ├── src/                  # 源代码
│   ├── server.ts             # 服务端入口
│   ├── package.json          # 依赖配置
│   ├── .env.local            # 环境变量（你需要编辑）
│   └── ecosystem.config.cjs  # PM2 配置
├── logs/                     # 日志目录
└── backups/                  # 备份目录
```

---

## 🔄 推荐部署流程

```bash
# 1. 本地开发
# ... 编写代码 ...

# 2. 提交到 GitHub
git add .
git commit -m "更新功能"
git push origin main

# 3. 服务器更新
cd /srv/opensynapse/app
git pull origin main
npm install
npm run build
pm2 restart opensynapse
```

---

## 🆘 需要帮助？

如果部署遇到问题：

1. 查看日志：`pm2 logs opensynapse`
2. 检查环境变量：`cat /srv/opensynapse/app/.env.local`
3. 测试构建：`npm run lint && npm run build`
4. 重启试试：`pm2 restart opensynapse`

**现在就开始部署吧！推荐用方式二（SSH 一键部署），最快！** 🚀
