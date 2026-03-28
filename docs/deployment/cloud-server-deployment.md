# OpenSynapse 云服务器部署手册

**项目**: OpenSynapse  
**日期**: 2026-03-28  
**适用范围**: Linux 云服务器、单机部署、Nginx 反代、PM2 守护、生产环境更新与回滚

---

## 1. 文档目标

这份文档解决 5 件事：

1. 如何把 OpenSynapse 部署到一台云服务器
2. 生产环境需要准备哪些配置和账号
3. 哪些登录 / OAuth 方式适合生产，哪些只适合本地开发
4. 本地代码更新后，云服务器如何同步升级
5. 上线后怎么启动、检查、回滚、日常维护

最后一节附带面向运营者的“使用说明”。

---

## 2. 当前项目的生产架构

OpenSynapse 当前是一个：

- React + Vite 前端
- Express Node 服务端
- Firebase Auth + Firestore 云同步
- 多 AI Provider 服务端网关

的单体应用。

生产模式下：

- `vite build` 生成前端静态文件到 `dist/`
- `tsx server.ts` 运行 Express 服务
- `server.ts` 在 `NODE_ENV=production` 时直接托管 `dist/` 静态资源并提供 `/api/*`

对应代码：

- [server.ts](/Users/lv/Workspace/OpenSynapse/server.ts)
- [package.json](/Users/lv/Workspace/OpenSynapse/package.json)

也就是说：

**这不是前后端分离多服务部署，而是一个 Node 进程同时提供前端页面和 API。**

---

## 3. 推荐部署方式

推荐生产部署方式：

- 一台 Linux 云服务器
- Nginx 做反向代理和 HTTPS
- PM2 守护 Node 进程
- Git 拉代码
- Node.js 22 LTS
- Firestore 作为业务数据存储

推荐系统：

- Ubuntu 24.04 LTS

推荐最小规格：

- 2 vCPU
- 4 GB RAM
- 40 GB SSD

如果只有自己用或小范围内测：

- 1 vCPU / 2 GB RAM 也能起，但余量偏小

---

## 4. 生产环境前必须明确的边界

### 4.1 Firebase 是云同步主存储

当前业务数据：

- `notes`
- `flashcards`
- `chat_sessions`
- `custom_personas`

主要依赖 Firestore。

### 4.2 本地文件 `data.json` 仍然存在

当前项目还保留了：

- `/api/data`
- `/api/notes`
- `/api/sync`

这些兼容链路会落本地 `data.json`。

这意味着：

- Web 主路径主要走 Firestore
- CLI 某些导入兼容路径仍依赖服务器本地磁盘

所以生产环境要把项目目录视作“有状态目录”，至少在当前阶段如此。

### 4.3 本地开发 OAuth 逻辑不等于生产最佳实践

有些认证方式更适合本地开发而不适合生产云服务器。

例如：

- Gemini CLI / Code Assist OAuth
- OpenAI Codex OAuth

它们依赖：

- 浏览器授权
- 本地回调端口
- 本机凭证文件

这类方式在云服务器上不是最稳的主路径。

**生产环境更推荐使用 API Key 或预先准备好的服务端凭证。**

---

## 5. 部署前准备

### 5.1 域名

建议准备：

- 一个正式域名，例如 `synapse.example.com`

### 5.2 云服务器

确认你有：

- Ubuntu 24.04
- 一个普通 sudo 用户
- 服务器公网 IP

### 5.3 Firebase 配置

至少准备：

- 前端 Firebase 配置
- Firestore 规则
- 如果后面要接自定义登录，还要准备 Firebase Admin 服务账号

当前前端 Firebase 配置在：

- [config/firebase-applet-config.json](/Users/lv/Workspace/OpenSynapse/config/firebase-applet-config.json)

如果你是部署当前这套现成项目到同一个 Firebase 项目，可以直接用现有配置。  
如果你要部署到自己的 Firebase 项目，需要替换这个文件并重新发布 Firestore 规则。

### 5.4 生产环境变量

当前项目会读取这些关键环境变量：

- `NODE_ENV`
- `APP_URL`
- `GEMINI_API_KEY`
- `OPENAI_API_KEY`
- `OPENAI_BASE_URL`
- `MINIMAX_API_KEY`
- `MINIMAX_BASE_URL`
- `ZHIPU_API_KEY`
- `ZHIPU_BASE_URL`
- `MOONSHOT_API_KEY`
- `MOONSHOT_BASE_URL`
- `GOOGLE_CLOUD_PROJECT`
- `FIREBASE_SERVICE_ACCOUNT_KEY`
- `FIREBASE_DATABASE_URL`

模板可参考：

- [/.env.example](/Users/lv/Workspace/OpenSynapse/.env.example)

---

## 6. 服务器初始化

以下命令以 Ubuntu 为例。

### 6.1 更新系统

```bash
sudo apt update
sudo apt upgrade -y
```

### 6.2 安装基础依赖

```bash
sudo apt install -y git curl nginx build-essential
```

### 6.3 安装 Node.js 22

推荐使用 NodeSource：

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v
npm -v
```

### 6.4 安装 PM2

```bash
sudo npm install -g pm2
pm2 -v
```

---

## 7. 拉取项目代码

建议部署目录：

```bash
sudo mkdir -p /srv/opensynapse
sudo chown -R $USER:$USER /srv/opensynapse
cd /srv/opensynapse
git clone <你的仓库地址> app
cd app
```

如果仓库是私有的，请先配置：

- SSH key
- 或 deploy key
- 或 GitHub token

---

## 8. 安装依赖并构建

```bash
cd /srv/opensynapse/app
npm install
npm run lint
npm run build
```

说明：

- `npm run lint` 用于确认 TypeScript 没问题
- `npm run build` 会生成 `dist/`

---

## 9. 配置生产环境变量

### 9.1 新建生产用 `.env.local`

```bash
cd /srv/opensynapse/app
cp .env.example .env.local
```

然后编辑：

```bash
nano .env.local
```

### 9.2 推荐最小生产配置

```bash
NODE_ENV=production
APP_URL="https://synapse.example.com"

GEMINI_API_KEY="your_gemini_key"
OPENAI_API_KEY="your_openai_key"
MINIMAX_API_KEY="your_minimax_key"
ZHIPU_API_KEY="your_zhipu_key"
MOONSHOT_API_KEY="your_moonshot_key"

OPENAI_BASE_URL="https://api.openai.com/v1"
MINIMAX_BASE_URL="https://api.minimaxi.com/anthropic"
ZHIPU_BASE_URL="https://open.bigmodel.cn/api/anthropic"
MOONSHOT_BASE_URL="https://api.kimi.com/coding/"
```

### 9.3 Firebase Admin 推荐配置

如果后续要用：

- Firebase custom token
- 服务端校验 Firebase ID token
- QQ / 微信登录桥接

建议提前配置：

```bash
FIREBASE_SERVICE_ACCOUNT_KEY='{"type":"service_account",...}'
FIREBASE_DATABASE_URL="https://<your-project-id>.firebaseio.com"
```

对应代码：

- [src/lib/firebaseAdmin.ts](/Users/lv/Workspace/OpenSynapse/src/lib/firebaseAdmin.ts)

### 9.4 关于生产环境下的 OAuth 建议

当前项目支持的两条“本机式 OAuth”：

- Gemini CLI / Code Assist OAuth
- OpenAI Codex OAuth

更适合：

- 本地开发机
- 个人桌面环境

不推荐作为生产服务器主认证方式，因为它们依赖：

- 浏览器弹窗
- `localhost` 回调端口
- 本机登录态文件

生产环境请优先使用：

- API Key
- 或后续标准化的服务端 OAuth / Firebase custom auth

---

## 10. 启动应用

### 10.1 直接试跑一次

```bash
cd /srv/opensynapse/app
NODE_ENV=production npm run start
```

确认输出类似：

```bash
Server running on http://localhost:3000
```

按 `Ctrl + C` 停掉。

### 10.2 用 PM2 守护

```bash
cd /srv/opensynapse/app
NODE_ENV=production pm2 start npm --name opensynapse -- run start
pm2 save
pm2 startup
```

常用命令：

```bash
pm2 status
pm2 logs opensynapse
pm2 restart opensynapse
pm2 stop opensynapse
pm2 delete opensynapse
```

---

## 11. 配置 Nginx

### 11.1 新建站点配置

```bash
sudo nano /etc/nginx/sites-available/opensynapse
```

写入：

```nginx
server {
    listen 80;
    server_name synapse.example.com;

    client_max_body_size 50m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

启用站点：

```bash
sudo ln -s /etc/nginx/sites-available/opensynapse /etc/nginx/sites-enabled/opensynapse
sudo nginx -t
sudo systemctl reload nginx
```

---

## 12. 配置 HTTPS

推荐使用 Certbot：

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d synapse.example.com
```

完成后验证：

```bash
sudo certbot renew --dry-run
```

---

## 13. 防火墙与端口

如果启用了 UFW：

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status
```

说明：

- 外网只需要开放 `80/443`
- `3000` 不建议直接对公网开放

---

## 14. 首次上线检查清单

上线前请确认：

1. `npm run lint` 通过
2. `npm run build` 通过
3. `.env.local` 已填写
4. 域名已解析到服务器 IP
5. Nginx 已反代到 `127.0.0.1:3000`
6. HTTPS 证书已签发
7. Firestore 规则已部署
8. Firebase 前端配置已指向正确项目

上线后请检查：

1. 首页可访问
2. `/api/ai/*` 可正常返回
3. 登录页正常显示
4. Firestore 读写正常
5. 提取资产正常
6. 模型调用正常

---

## 15. 如何更新云服务器代码

这是上线后最关键的部分。

### 15.1 标准更新流程

每次本地代码更新并推送到仓库后，在服务器执行：

```bash
cd /srv/opensynapse/app
git fetch --all
git pull origin main
npm install
npm run lint
npm run build
pm2 restart opensynapse
```

如果依赖没变，也可以省略 `npm install`，但保守起见建议保留。

### 15.2 更新后验证

```bash
pm2 logs opensynapse --lines 100
curl -I https://synapse.example.com
```

浏览器侧再验证：

1. 页面是否加载
2. 登录是否正常
3. 聊天接口是否正常

---

## 16. 推荐做一个一键更新脚本

可以在服务器上新建：

```bash
nano /srv/opensynapse/update.sh
```

内容：

```bash
#!/usr/bin/env bash
set -e

cd /srv/opensynapse/app

echo "[1/6] Pull latest code"
git fetch --all
git pull origin main

echo "[2/6] Install dependencies"
npm install

echo "[3/6] Type check"
npm run lint

echo "[4/6] Build"
npm run build

echo "[5/6] Restart service"
pm2 restart opensynapse

echo "[6/6] Done"
pm2 status
```

赋予权限：

```bash
chmod +x /srv/opensynapse/update.sh
```

之后更新只需要：

```bash
/srv/opensynapse/update.sh
```

---

## 17. 回滚方案

如果新版本上线后有问题：

### 17.1 查看最近提交

```bash
cd /srv/opensynapse/app
git log --oneline -n 10
```

### 17.2 切回上一个稳定版本

```bash
git checkout <稳定提交哈希>
npm install
npm run build
pm2 restart opensynapse
```

如果之后还要继续跟主分支：

```bash
git checkout main
git pull origin main
```

注意：

- 不要在不了解当前工作区状态时使用破坏性命令
- 生产环境建议通过“已知稳定 tag”回滚，而不是临时猜提交

---

## 18. 推荐的版本发布策略

建议采用：

1. 本地开发
2. 本地 `npm run lint && npm run build`
3. 推送到 Git 仓库
4. 服务器执行更新脚本
5. 验证线上

更稳的做法是：

- `main` 只放可上线代码
- 发布前打 tag，例如：
  - `v0.1.0`
  - `v0.1.1`

这样线上回滚更容易。

---

## 19. 日志与排障

### 19.1 PM2 日志

```bash
pm2 logs opensynapse
pm2 logs opensynapse --lines 200
```

### 19.2 Nginx 日志

```bash
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

### 19.3 端口检查

```bash
lsof -nP -iTCP:3000 -sTCP:LISTEN
```

### 19.4 进程状态

```bash
pm2 status
```

---

## 20. 数据与备份建议

### 20.1 Firestore 数据

业务主数据在 Firestore，建议：

- 定期导出 Firestore
- 或至少保留项目级备份策略

### 20.2 本地项目目录

当前项目目录里还有一些本地状态值得备份：

- `.env.local`
- `data.json`
- 未来可能新增的服务端凭证文件

建议至少做：

```bash
tar -czf opensynapse-backup-$(date +%F).tar.gz \
  .env.local \
  data.json \
  config/
```

说明：

- 如果 `config/` 中含私密文件，请控制访问权限
- 不要把生产密钥直接提交到 Git

---

## 21. 生产环境特别提醒

### 21.1 Settings API 在生产环境不可用

当前 `server.ts` 中：

- `/api/local-config/providers`
- `/api/local-config/openai-oauth/*`

在 `NODE_ENV=production` 下会返回 404。

这意味着：

- 线上不能通过设置页修改 `.env.local`
- 线上环境变量应通过服务器文件或部署系统统一管理

### 21.2 本地开发免登录不要带到生产

当前前端有：

- `VITE_DISABLE_AUTH`

它只适合本地 UI 调试。生产环境不要开启。

### 21.3 本机式 OAuth 不适合无人值守服务器

这些方式更适合本地：

- Gemini CLI / Code Assist OAuth
- OpenAI Codex OAuth

线上主路径请优先使用：

- API Key
- 或后续标准化的服务端登录桥接

---

## 22. 推荐的生产环境目录结构

```txt
/srv/opensynapse/
├── app/                     # Git 仓库
│   ├── dist/
│   ├── src/
│   ├── server.ts
│   ├── package.json
│   ├── .env.local
│   └── data.json
├── update.sh                # 一键更新脚本
└── backups/                 # 备份目录（可选）
```

---

## 23. 使用说明

这部分面向部署完成后的管理员或使用者。

### 23.1 启动服务

```bash
cd /srv/opensynapse/app
pm2 start npm --name opensynapse -- run start
```

### 23.2 查看服务状态

```bash
pm2 status
pm2 logs opensynapse
```

### 23.3 更新代码

```bash
/srv/opensynapse/update.sh
```

### 23.4 修改生产环境变量

```bash
cd /srv/opensynapse/app
nano .env.local
pm2 restart opensynapse
```

### 23.5 常见问题

#### 页面打不开

先检查：

```bash
pm2 status
sudo nginx -t
sudo systemctl status nginx
```

#### 模型调用失败

先检查：

- `.env.local` 的 API key 是否存在
- 对应 provider base URL 是否正确
- PM2 日志中是否有 401 / 403 / 429

#### 登录正常但数据不同步

先检查：

- Firebase 配置是否指向正确项目
- Firestore 规则是否已部署
- 当前用户是否能成功读取自己的 `notes / flashcards / chat_sessions`

---

## 24. 一句话结论

OpenSynapse 当前非常适合：

- 一台云服务器
- Nginx + PM2
- Firestore 作为主数据层
- API Key 作为生产环境主认证方式

而且后续本地代码更新后，服务器端同步更新的标准流程就是：

```bash
git pull -> npm install -> npm run lint -> npm run build -> pm2 restart
```

只要按这份手册执行，当前版本就可以稳定上线和维护。

