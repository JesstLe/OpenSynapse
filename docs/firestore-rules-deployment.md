# Firestore 安全规则部署踩坑记录

**日期**: 2026-03-28  
**状态**: ✅ 已解决

---

## 问题现象

导入对话时，控制台报错：

```
Missing or insufficient permissions
```

完整错误信息：

```json
{
  "error": "Missing or insufficient permissions.",
  "authInfo": {
    "userId": "8QYSiPYal3PrQUZC4WSvRgeDpl03",
    "email": "lv1335765788@gmail.com",
    "emailVerified": true
  },
  "operationType": "write",
  "path": "chat_sessions/import_1774679985878_edbl8e6"
}
```

用户已通过 Google 登录认证，`userId` 和 `email` 都正常，但 Firestore 拒绝写入。

---

## 排查过程

### 1. 检查代码逻辑 → 无问题

`sanitizeChatSession()` 函数正确设置了 `userId` 字段：

```typescript
function sanitizeChatSession(session: ChatSession, userId: string) {
  const base: Record<string, any> = {
    id: session.id,
    title: session.title || '新会话',
    messages: session.messages.map(/* ... */),
    updatedAt: session.updatedAt,
    userId,  // ← 正确传入当前用户 uid
  };
  return base;
}
```

并且有 fallback 逻辑：如果扩展字段导致权限问题，会降级为 `sanitizeChatSessionLegacy()`。

### 2. 检查本地规则文件 → 语法正确

`config/firestore.rules` 中 `chat_sessions` 的规则：

```
match /chat_sessions/{sessionId} {
  allow read: if isOwner(resource.data.userId);
  allow create: if isAuthenticated() && request.resource.data.userId == request.auth.uid;
  allow update: if isOwner(resource.data.userId) && request.resource.data.userId == request.auth.uid;
  allow delete: if isOwner(resource.data.userId);
}
```

规则逻辑没有问题：只要 `request.resource.data.userId == request.auth.uid` 就允许创建。

### 3. 发现根因 → 规则从未部署到线上

关键发现：

- 项目中 **没有** `firebase.json` 和 `.firebaserc`
- 本地的 `config/firestore.rules` 只是一份"草稿"，**从未通过 Firebase CLI 或 Console 部署**
- 线上 Firestore 使用的是 AI Studio Applet 的**默认规则**，可能完全禁止客户端写入

> [!CAUTION]
> 本地写了规则文件 ≠ 线上生效。Firestore 安全规则必须**显式部署**才会生效。这是最容易被忽略的一步。

---

## 修复方案

### 第 1 步：创建 Firebase CLI 配置文件

**firebase.json**（项目根目录）：

```json
{
  "firestore": {
    "rules": "config/firestore.rules",
    "database": "ai-studio-0908f2c8-7d16-420f-904a-55223d56e571"
  }
}
```

> 注意：`database` 字段必须指定实际使用的 Firestore 数据库 ID。如果你使用的是非 `(default)` 数据库（比如 AI Studio Applet 创建的），必须显式声明。

**.firebaserc**（项目根目录）：

```json
{
  "projects": {
    "default": "gen-lang-client-0883778016"
  }
}
```

### 第 2 步：安装 Firebase CLI

```bash
npm install -g firebase-tools
```

### 第 3 步：登录 Firebase

```bash
firebase login
```

会打开浏览器，用 Google 账号授权。

### 第 4 步：部署规则

```bash
firebase deploy --only firestore:rules
```

成功输出：

```
✔  cloud.firestore: rules file config/firestore.rules compiled successfully
✔  firestore: released rules config/firestore.rules to cloud.firestore
✔  Deploy complete!
```

---

## 验证

部署后重新导入对话，写入 `chat_sessions` 成功，不再报权限错误。

---

## 经验总结

| 坑点 | 说明 |
|------|------|
| 本地规则 ≠ 线上规则 | `config/firestore.rules` 只是源码，不会自动生效 |
| 缺少 `firebase.json` | 没有这个文件就无法通过 CLI 部署任何 Firebase 资源 |
| 非默认数据库 | AI Studio Applet 创建的 Firestore 数据库 ID 不是 `(default)`，`firebase.json` 中必须用 `database` 字段显式指定 |
| 错误信息误导 | `Missing or insufficient permissions` 容易被误判为代码中 `userId` 传错或认证失败，实际是**安全规则本身没有部署** |

### 后续规则更新流程

以后修改 `config/firestore.rules` 后，只需执行：

```bash
firebase deploy --only firestore:rules
```

即可将新规则推送到线上。

---

## 相关文件

- [firestore.rules](../config/firestore.rules) — Firestore 安全规则源文件
- [firebase.json](../firebase.json) — Firebase CLI 部署配置
- [.firebaserc](../.firebaserc) — Firebase 项目关联
- [App.tsx](../src/App.tsx) — `sanitizeChatSession()` / `handleFirestoreError()` 逻辑
