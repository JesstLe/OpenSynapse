# OpenSynapse 域名配置完整教程

## 概述

本文档记录了将 OpenSynapse 应用从 IP 访问升级为域名访问的完整过程，包括 DNS 解析、Nginx 配置、SSL 证书申请等步骤。

**服务器信息：**
- 服务器：阿里云 ECS (Ubuntu 24.04)
- IP：101.133.166.67
- 域名：opensynapse.top
- 应用端口：3000 (Node.js + PM2)

---

## 一、DNS 解析配置

### 1.1 登录阿里云域名控制台

访问 [阿里云域名控制台](https://dc.console.aliyun.com/)，找到你的域名 `opensynapse.top`。

**截图位置：** 域名列表页面，显示域名状态为"正常"

### 1.2 添加 DNS 解析记录

进入 **DNS 管理** → **解析设置**，添加以下记录：

#### 记录 1：根域名
- **主机记录**：`@` (代表根域名 opensynapse.top)
- **记录类型**：`A`
- **解析线路**：默认
- **记录值**：`101.133.166.67`
- **TTL**：10分钟

#### 记录 2：WWW 子域名
- **主机记录**：`www`
- **记录类型**：`A`
- **解析线路**：默认
- **记录值**：`101.133.166.67`
- **TTL**：10分钟

**截图位置：** DNS 解析设置页面，显示两条记录状态为"正常"

### 1.3 验证 DNS 解析

在本地终端测试 DNS 是否生效：

```bash
nslookup opensynapse.top
nslookup www.opensynapse.top
```

**预期输出：**
```
Server:  8.8.8.8
Address: 8.8.8.8#53

Name:    opensynapse.top
Address: 101.133.166.67
```

---

## 二、服务器 Nginx 配置

### 2.1 更新 Nginx 配置文件

SSH 登录服务器，更新 Nginx 配置：

```bash
# 编辑 Nginx 配置文件
sudo nano /etc/nginx/sites-enabled/opensynapse
```

添加以下内容：

```nginx
server {
    listen 80;
    server_name opensynapse.top www.opensynapse.top 101.133.166.67;

    # ACME challenge for Let's Encrypt SSL
    location ^~ /.well-known/acme-challenge/ {
        alias /var/www/certbot/.well-known/acme-challenge/;
        try_files $uri =404;
    }

    # 反向代理到 Node.js 应用
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 2.2 测试并重载 Nginx

```bash
# 测试配置语法
sudo nginx -t

# 重载配置
sudo systemctl reload nginx
```

**预期输出：**
```
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful
```

---

## 三、应用配置更新

### 3.1 更新 Better Auth 信任域名

编辑 `src/auth/server.ts`，在 `trustedOrigins` 中添加域名：

```typescript
trustedOrigins: [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://101.133.166.67:3000",
  "http://101.133.166.67",
  "http://101.133.166.67:80",
  // 新增域名支持
  "http://opensynapse.top",
  "http://www.opensynapse.top",
  "https://opensynapse.top",
  "https://www.opensynapse.top"
],
```

### 3.2 构建并部署

```bash
# 构建前端
npm run build

# 同步到服务器
rsync -avz --delete \
  -e "ssh -i ~/.ssh/opensynapse_server.pem" \
  ./dist/ root@101.133.166.67:/www/wwwroot/opensynapse/dist/
```

---

## 四、SSL 证书申请（Let's Encrypt）

### 4.1 安装 Certbot

```bash
# 更新软件包
sudo apt update

# 安装 Certbot 和 Nginx 插件
sudo apt install -y certbot python3-certbot-nginx
```

### 4.2 创建 ACME 挑战目录

```bash
# 创建目录
sudo mkdir -p /var/www/certbot/.well-known/acme-challenge

# 设置权限
sudo chown -R www-data:www-data /var/www/certbot
```

### 4.3 申请 SSL 证书

#### 方式 1：Webroot 模式（推荐）

```bash
sudo certbot certonly --webroot \
  -w /var/www/certbot \
  -d opensynapse.top \
  -d www.opensynapse.top \
  --agree-tos \
  -m your-email@example.com
```

**遇到的问题：**
Let's Encrypt 验证服务器返回 403 错误，无法访问 ACME 挑战文件。

**可能原因：**
1. 阿里云安全组阻止了 Let's Encrypt 的验证请求
2. Nginx 配置中的 location 优先级问题
3. 文件权限问题

#### 方式 2：Standalone 模式

临时停止 Nginx，使用 Certbot 内置的 Web 服务器：

```bash
# 停止 Nginx
sudo systemctl stop nginx

# 申请证书
sudo certbot certonly --standalone \
  -d opensynapse.top \
  -d www.opensynapse.top \
  --agree-tos \
  -m your-email@example.com

# 重新启动 Nginx
sudo systemctl start nginx
```

**遇到的问题：**
同样返回 403 错误，怀疑是阿里云层面的拦截。

### 4.4 替代方案：阿里云免费 SSL 证书

由于 Let's Encrypt 验证失败，建议使用阿里云的免费 SSL 证书：

1. 登录 [阿里云 SSL 证书控制台](https://www.aliyun.com/product/cas)
2. 点击"创建证书" → "免费证书"
3. 选择"单域名"，输入 `opensynapse.top`
4. 完成域名验证（DNS 或文件验证）
5. 下载证书并部署到服务器

---

## 五、配置 HTTPS（证书申请成功后）

### 5.1 更新 Nginx 配置

获得 SSL 证书后，更新 Nginx 配置：

```nginx
# HTTP 重定向到 HTTPS
server {
    listen 80;
    server_name opensynapse.top www.opensynapse.top;
    return 301 https://$server_name$request_uri;
}

# HTTPS 服务
server {
    listen 443 ssl http2;
    server_name opensynapse.top www.opensynapse.top;

    # SSL 证书配置
    ssl_certificate /etc/letsencrypt/live/opensynapse.top/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/opensynapse.top/privkey.pem;

    # SSL 安全设置
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
    ssl_prefer_server_ciphers off;
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:50m;

    # 反向代理
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}

# IP 访问保持 HTTP（可选）
server {
    listen 80;
    server_name 101.133.166.67;
    
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 5.2 自动续期

Let's Encrypt 证书有效期为 90 天，设置自动续期：

```bash
# 测试自动续期
sudo certbot renew --dry-run

# 添加定时任务
sudo crontab -e

# 添加以下行（每天凌晨 2 点尝试续期）
0 2 * * * /usr/bin/certbot renew --quiet --nginx
```

---

## 六、验证部署

### 6.1 测试 HTTP 访问

```bash
# 测试根域名
curl -I http://opensynapse.top

# 测试 WWW 子域名
curl -I http://www.opensynapse.top

# 测试 IP
curl -I http://101.133.166.67
```

**预期输出：**
```
HTTP/1.1 200 OK
Server: nginx/1.24.0
```

### 6.2 浏览器访问

打开浏览器访问：
- http://opensynapse.top
- http://www.opensynapse.top

**截图位置：** 浏览器显示应用正常加载

---

## 七、遇到的问题与解决方案

### 问题 1：DNS 解析未生效

**现象：** 访问域名显示 "无法访问此网站"

**解决：**
- 等待 DNS 全球生效（通常 5-10 分钟）
- 使用 `nslookup` 命令验证解析是否正确
- 清除本地 DNS 缓存

### 问题 2：SSL 证书申请失败（403 错误）

**现象：** Let's Encrypt 验证返回 403 Forbidden

**原因分析：**
1. 阿里云安全组可能阻止了 Let's Encrypt 的验证服务器 IP
2. Nginx 配置中的 ACME challenge location 可能未正确配置
3. 文件权限问题

**解决方案：**
- 使用阿里云提供的免费 SSL 证书服务
- 或临时关闭防火墙进行验证

### 问题 3：ICP 备案拦截

**现象：** 访问域名显示 "域名暂时无法访问，该域名当前备案状态不符合访问要求"

**原因：** 中国大陆服务器要求域名必须完成 ICP 备案

**解决方案：**
- **短期：** 使用 IP 地址直接访问 (http://101.133.166.67)
- **长期：** 在阿里云备案管理平台提交 ICP 备案申请
- **替代：** 迁移到非中国大陆服务器（香港、新加坡、美国等）

---

## 八、最终状态

| 配置项 | 状态 | 访问地址 |
|--------|------|----------|
| DNS 解析 | ✅ 正常 | opensynapse.top, www.opensynapse.top |
| Nginx 反向代理 | ✅ 正常 | 端口 80 → 3000 |
| 应用访问 | ✅ 正常 | http://101.133.166.67 |
| SSL/HTTPS | ⏳ 待备案后配置 | - |
| ICP 备案 | ⏳ 待申请 | - |

---

## 九、相关截图位置说明

为了完整记录部署过程，建议在以下步骤截图：

1. **阿里云域名控制台**：显示域名信息和 DNS 服务器
2. **DNS 解析设置页面**：显示两条 A 记录配置
3. **服务器终端**：显示 Nginx 配置测试成功
4. **浏览器访问**：显示应用正常加载
5. **PM2 状态**：显示应用运行正常
6. **阿里云备案拦截页面**：记录 ICP 备案要求

---

## 十、参考命令速查

```bash
# 检查 DNS 解析
nslookup opensynapse.top

# 检查 Nginx 状态
sudo systemctl status nginx

# 检查应用状态
pm2 status

# 查看 Nginx 错误日志
sudo tail -f /var/log/nginx/error.log

# 查看 Nginx 访问日志
sudo tail -f /var/log/nginx/access.log

# 测试 SSL 证书续期
sudo certbot renew --dry-run

# 重启所有服务
sudo systemctl restart nginx
pm2 restart opensynapse
```

---

## 附录：完整 Nginx 配置

```nginx
server {
    listen 80;
    server_name opensynapse.top www.opensynapse.top 101.133.166.67;

    # ACME challenge for Let's Encrypt
    location ^~ /.well-known/acme-challenge/ {
        alias /var/www/certbot/.well-known/acme-challenge/;
        try_files $uri =404;
    }

    # Reverse proxy to Node.js app
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

**文档版本：** 1.0  
**创建时间：** 2026-03-30  
**最后更新：** 2026-03-30
