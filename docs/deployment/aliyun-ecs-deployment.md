# OpenSynapse 阿里云 ECS 部署补充指南

**适用**: 阿里云 ECS 服务器  
**系统**: Ubuntu 24.04 LTS / Alibaba Cloud Linux 3  
**基础文档**: [cloud-server-deployment.md](./cloud-server-deployment.md)

本文档是阿里云环境的补充，请先阅读基础部署文档，再按本文档进行阿里云特定配置。

---

## 1. 阿里云 ECS 选购建议

### 1.1 实例规格选择

| 使用场景 | 推荐规格 | 配置 | 预估价格(月) |
|----------|----------|------|--------------|
| 个人/小团队 | ecs.t6-c1m2.large | 2 vCPU / 4GB | ~60元 |
| 中小团队 | ecs.c7.large | 2 vCPU / 4GB | ~180元 |
| 高并发 | ecs.c7.xlarge | 4 vCPU / 8GB | ~350元 |

**建议**: 
- 选择 **突发性能实例(t6)** 性价比高，适合个人使用
- 选择 **计算型(c7)** 性能稳定，适合团队
- 系统盘至少 **40GB SSD**

### 1.2 镜像选择

推荐:
- ✅ **Ubuntu 24.04 LTS** (首选)
- ✅ **Alibaba Cloud Linux 3** (阿里云优化)

不推荐:
- ❌ CentOS (已停止维护)
- ❌ Windows (浪费资源)

### 1.3 地域选择

- 国内用户: 选择离你最近的节点(如 杭州、上海、北京、深圳)
- 如果需要域名备案: 必须选择中国大陆节点
- 如果不需要备案: 可选择香港、新加坡等海外节点

---

## 2. 阿里云安全组配置

**安全组 = 阿里云的防火墙**

### 2.1 入方向规则 (必须)

| 协议 | 端口 | 授权对象 | 说明 |
|------|------|----------|------|
| TCP | 22 | 你的IP/0.0.0.0/0 | SSH 远程连接 |
| TCP | 80 | 0.0.0.0/0 | HTTP 访问 |
| TCP | 443 | 0.0.0.0/0 | HTTPS 访问 |

### 2.2 入方向规则 (可选)

| 协议 | 端口 | 授权对象 | 说明 |
|------|------|----------|------|
| TCP | 3000 | 你的IP | 开发调试(不建议对外) |
| TCP | 3088 | 0.0.0.0/0 | OAuth 回调端口 |

**⚠️ 重要**: 
- 生产环境 **不要** 将 3000 端口对外开放
- 3088 端口用于本地 OAuth 回调，如果只用 API Key 可不开放

### 2.3 安全组配置步骤

1. 登录 [阿里云控制台](https://ecs.console.aliyun.com/)
2. 进入 ECS 实例详情 → 安全组
3. 点击「配置规则」→「入方向」→「手动添加」
4. 按上表添加规则

---

## 3. 阿里云域名配置 (可选但推荐)

### 3.1 购买域名

1. 前往 [阿里云域名注册](https://wanwang.aliyun.com/)
2. 搜索并购买域名(如 `yourname.com`)

### 3.2 域名解析

1. 进入 [阿里云域名控制台](https://dc.console.aliyun.com/)
2. 找到你的域名 → 解析
3. 添加 A 记录:
   - 主机记录: `@` (根域名) 或 `synapse` (子域名)
   - 记录值: 你的 ECS 公网 IP
   - TTL: 默认 10 分钟

### 3.3 域名备案 (中国大陆节点必需)

如果你选择的中国大陆节点:
1. 必须进行 ICP 备案
2. 前往 [阿里云备案系统](https://beian.aliyun.com/)
3. 备案流程约 7-20 个工作日

**免备案方案**: 
- 选择香港、新加坡、美国等海外节点
- 或使用 IP 直接访问(不推荐)

---

## 4. 阿里云 ECS 初始化

### 4.1 连接服务器

```bash
# 使用 SSH 连接
ssh root@你的公网IP

# 或使用密钥
ssh -i ~/.ssh/aliyun.pem root@你的公网IP
```

### 4.2 创建普通用户 (推荐)

```bash
# 创建用户
adduser opensynapse
usermod -aG sudo opensynapse

# 切换用户
su - opensynapse
```

### 4.3 阿里云源配置 (Ubuntu)

```bash
# 备份原源
cp /etc/apt/sources.list /etc/apt/sources.list.bak

# 使用阿里云镜像源
cat > /etc/apt/sources.list << 'EOF'
deb http://mirrors.aliyun.com/ubuntu/ noble main restricted universe multiverse
deb http://mirrors.aliyun.com/ubuntu/ noble-updates main restricted universe multiverse
deb http://mirrors.aliyun.com/ubuntu/ noble-backports main restricted universe multiverse
deb http://mirrors.aliyun.com/ubuntu/ noble-security main restricted universe multiverse
EOF

# 更新
apt update
```

---

## 5. 阿里云特定优化

### 5.1 安装阿里云监控插件 (可选)

```bash
# 自动安装云监控
wget http://update.aegis.aliyun.com/download/quartz_install.sh
chmod +x quartz_install.sh
./quartz_install.sh
```

### 5.2 配置自动快照 (强烈推荐)

1. 进入 [阿里云 ECS 控制台](https://ecs.console.aliyun.com/)
2. 选择实例 → 磁盘
3. 点击「设置自动快照策略」
4. 建议: 每天 02:00 自动快照，保留 7 天

**作用**: 系统崩溃时可快速恢复

### 5.3 启用云防火墙 (可选)

如果安全组不够，可启用阿里云云防火墙:
1. 进入 [云防火墙控制台](https://yundun.console.aliyun.com/)
2. 开启防护
3. 可配置更精细的访问控制

---

## 6. 部署流程速查

```bash
# ========== 第 1 步: 系统初始化 ==========
ssh root@你的服务器IP
apt update && apt upgrade -y
apt install -y git curl nginx build-essential

# ========== 第 2 步: 安装 Node.js ==========
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
apt install -y nodejs
npm install -g pm2

# ========== 第 3 步: 拉取代码 ==========
mkdir -p /srv/opensynapse
cd /srv/opensynapse
git clone https://github.com/JesstLe/OpenSynapse.git app
cd app

# ========== 第 4 步: 安装依赖 ==========
npm install

# ========== 第 5 步: 配置环境变量 ==========
cp .env.example .env.local
nano .env.local
# 编辑: APP_URL, GEMINI_API_KEY 等

# ========== 第 6 步: 构建 ==========
npm run lint
npm run build

# ========== 第 7 步: 启动 ==========
pm2 start npm --name opensynapse -- run start
pm2 save
pm2 startup

# ========== 第 8 步: Nginx 配置 ==========
# 见 cloud-server-deployment.md 第 11 节

# ========== 第 9 步: HTTPS ==========
# 见 cloud-server-deployment.md 第 12 节
```

---

## 7. 阿里云免费资源利用

### 7.1 免费 SSL 证书

阿里云提供免费 SSL 证书:
1. 进入 [SSL 证书控制台](https://yundun.console.aliyun.com/)
2. 申请免费证书
3. 按指引验证域名
4. 下载 Nginx 格式证书
5. 配置到 `/etc/nginx/ssl/`

### 7.2 免费 DDoS 基础防护

阿里云 ECS 自带:
- 5Gbps DDoS 基础防护
- 无需配置，自动生效

---

## 8. 常见问题 (阿里云特供)

### Q: 安全组规则已添加，但仍无法访问？

检查:
1. 安全组是否绑定到 ECS 实例
2. 云防火墙是否拦截
3. 系统内防火墙是否开启
   ```bash
   ufw status
   ufw allow 80
   ufw allow 443
   ```

### Q: 网站访问慢？

优化方案:
1. 开启阿里云 CDN
2. 使用阿里云 OSS 存储静态资源
3. 选择离用户近的地域

### Q: 如何备份整个系统？

方法 1: 快照
- 阿里云控制台 → 实例 → 创建快照

方法 2: 镜像
- 阿里云控制台 → 实例 → 创建自定义镜像

### Q: 流量费用高？

优化:
1. 购买流量包
2. 开启 CDN 减少源站流量
3. 压缩静态资源

### Q: 收到阿里云安全告警？

常见原因:
- 端口扫描被检测
- 暴力破解尝试
- 恶意软件上传

处理:
1. 查看告警详情
2. 检查服务器日志
3. 加固安全组规则
4. 必要时重置密码/重装系统

---

## 9. 阿里云 + OpenSynapse 最佳实践

### 场景 1: 个人使用 (省钱版)

- ECS: 突发性能实例 t6 (2核4G)
- 带宽: 按流量计费 (1元/GB)
- 域名: 备案后使用国内节点
- 存储: 系统盘 40GB
- SSL: 阿里云免费证书
- 月费用: ~60-80元

### 场景 2: 小团队 (稳定版)

- ECS: 计算型 c7 (2核4G)
- 带宽: 固定 5Mbps
- 域名: 备案 + CDN
- 存储: ESSD 云盘 100GB
- SSL: 阿里云免费证书
- 备份: 自动快照策略
- 月费用: ~200-300元

### 场景 3: 高可用 (企业版)

- ECS: 2台 c7.xlarge (负载均衡)
- SLB: 阿里云负载均衡
- RDS: 阿里云数据库 (可选)
- OSS: 对象存储静态资源
- CDN: 全站加速
- 月费用: ~1000元+

---

## 10. 一键部署脚本 (阿里云版)

```bash
#!/bin/bash
# aliyun-deploy.sh - 阿里云 ECS 一键部署

set -e

echo "🚀 OpenSynapse 阿里云部署脚本"

# 检查 root
if [ "$EUID" -ne 0 ]; then 
    echo "请使用 root 运行"
    exit 1
fi

# 配置阿里云源
echo "📦 配置阿里云源..."
cp /etc/apt/sources.list /etc/apt/sources.list.bak
cat > /etc/apt/sources.list << 'EOF'
deb http://mirrors.aliyun.com/ubuntu/ noble main restricted universe multiverse
deb http://mirrors.aliyun.com/ubuntu/ noble-updates main restricted universe multiverse
deb http://mirrors.aliyun.com/ubuntu/ noble-backports main restricted universe multiverse
deb http://mirrors.aliyun.com/ubuntu/ noble-security main restricted universe multiverse
EOF

# 更新系统
apt update && apt upgrade -y

# 安装依赖
echo "📥 安装依赖..."
apt install -y git curl nginx build-essential ufw

# 安装 Node.js
echo "🔧 安装 Node.js..."
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
npm install -g pm2

# 配置防火墙
echo "🛡️ 配置防火墙..."
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

echo ""
echo "✅ 系统初始化完成!"
echo ""
echo "下一步:"
echo "1. 创建普通用户: adduser opensynapse"
echo "2. 切换到用户: su - opensynapse"
echo "3. 拉取代码并部署"
echo ""
echo "安全组请确保开放: 22, 80, 443"
```

使用方法:
```bash
chmod +x aliyun-deploy.sh
./aliyun-deploy.sh
```

---

## 相关文档

- [云服务器部署手册](./cloud-server-deployment.md) - 详细部署步骤
- [环境变量配置](../auth/environment-variables.md) - 认证配置说明
- [Firestore 规则部署](../firestore-rules-deployment.md) - 数据库规则

---

**祝你部署顺利!** 🎉
