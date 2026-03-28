# Firebase 授权域名配置指南

## 问题
部署已完成，但登录时出现错误：
```
FirebaseError: Error (auth/unauthorized-domain)
```

服务器 IP `101.133.166.67` 未被添加到 Firebase Authentication 的授权域名列表。

## 解决方案

### 方法一：Firebase Console (推荐，最简单)

1. 访问 Firebase Console:
   ```
   https://console.firebase.google.com/project/gen-lang-client-0883778016/authentication/settings
   ```

2. 向下滚动到 **"Authorized domains"** 部分

3. 点击 **"Add domain"** 按钮

4. 输入: `101.133.166.67`

5. 点击 **"Add"** 保存

6. 等待 5-10 分钟生效

7. 访问 http://101.133.166.67 测试登录

### 方法二：Firebase CLI (如果你已在本地安装)

```bash
# 登录 Firebase
firebase login

# 添加授权域名
firebase auth:domains:add 101.133.166.67 --project gen-lang-client-0883778016
```

### 方法三：使用服务账号 (程序化)

如果你需要程序化管理，可以在 Firebase Console 中生成服务账号密钥：

1. 访问: https://console.firebase.google.com/project/gen-lang-client-0883778016/settings/serviceaccounts/adminsdk

2. 点击 **"Generate new private key"**

3. 下载 JSON 文件并上传到服务器的 `/www/wwwroot/opensynapse/config/serviceAccountKey.json`

4. 运行修复脚本:
   ```bash
   cd /www/wwwroot/opensynapse
   export FIREBASE_SERVICE_ACCOUNT=$(cat config/serviceAccountKey.json)
   node scripts/add-auth-domain.js
   ```

## 验证

配置完成后，打开 http://101.133.166.67 点击 "Google 登录" 按钮：

- ✅ 如果弹出 Google 登录窗口 = 配置成功
- ❌ 如果仍然显示 "unauthorized-domain" 错误 = 等待 5-10 分钟后刷新重试

## 其他注意事项

1. **安全组规则**: 服务器已开放 80 端口，无需额外配置
2. **Nginx**: 已配置反向代理 (80 → 3000)
3. **进程守护**: Node.js 和 Nginx 均已设置开机自启
4. **HTTPS**: 当前使用 HTTP，如需 HTTPS 请配置 SSL 证书

## 联系

如有问题，请检查：
- 服务器状态: `systemctl status nginx` 和 `systemctl status opensynapse`
- 日志: `tail -f /www/wwwroot/opensynapse/app.log`
