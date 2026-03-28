# 自托管架构设计

## 目标
完全替代 Google Firebase，实现完全本地化的 OpenSynapse

## 架构对比

### Before (Firebase)
```
Frontend → Firebase Auth (Google)
         → Firestore (Google)
         → Firebase Functions
```

### After (Self-Hosted)
```
Frontend → JWT Auth (本地)
         → PostgreSQL (本地/阿里云 RDS)
         → Chroma (本地向量)
```

## 技术选型

| 组件 | 选型 | 理由 |
|------|------|------|
| 认证 | better-auth + JWT | 成熟、TypeScript原生、支持多策略 |
| 数据库 | PostgreSQL | better-auth原生支持、向量扩展 |
| 向量 | Chroma | 纯本地、无需服务、JS原生 |
| ORM | Drizzle | TypeScript原生、类型安全 |

## 数据库 Schema

### Users
```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Sessions
```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Notes
```sql
CREATE TABLE notes (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  title TEXT NOT NULL,
  content TEXT,
  tags TEXT[],
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Flashcards
```sql
CREATE TABLE flashcards (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  note_id TEXT REFERENCES notes(id),
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  next_review TIMESTAMP,
  interval INTEGER DEFAULT 0,
  ease_factor REAL DEFAULT 2.5,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Chat Sessions
```sql
CREATE TABLE chat_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  title TEXT,
  messages JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
```

## 迁移路径

### Phase 1: 基础设施 (Week 1)
- [ ] 安装依赖: better-auth, drizzle-orm, pg, chromadb
- [ ] 配置 PostgreSQL 连接
- [ ] 创建数据库 Schema
- [ ] 初始化 Chroma

### Phase 2: 认证迁移 (Week 1-2)
- [ ] 实现 better-auth 配置
- [ ] 替换 Firebase Auth 登录
- [ ] 实现 JWT 验证中间件
- [ ] 测试登录流程

### Phase 3: 数据层迁移 (Week 2)
- [ ] 创建 Repository 层
- [ ] 替换 Firestore 查询
- [ ] 实现 Chroma 向量存储
- [ ] 数据导出/导入工具

### Phase 4: 清理 (Week 3)
- [ ] 移除 Firebase 依赖
- [ ] 清理 Firebase 配置文件
- [ ] 更新文档
- [ ] E2E测试

## 依赖清单

```bash
# 核心依赖
npm install better-auth drizzle-orm pg
npm install chromadb

# 开发依赖
npm install -D drizzle-kit @types/pg
```

## 环境变量

```bash
# 数据库
DATABASE_URL="postgresql://user:pass@localhost:5432/opensynapse"

# JWT
JWT_SECRET="your-secret-key-min-32-chars"

# Chroma
CHROMA_PATH="./data/chroma"

# 可选: 加密
ENCRYPTION_KEY="another-secret-key"
```
