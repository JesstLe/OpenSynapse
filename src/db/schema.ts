import { pgTable, text, timestamp, boolean, real, integer, jsonb } from 'drizzle-orm/pg-core';

// ============================================
// Users - better-auth 会自动创建基础表，这里定义扩展字段
// ============================================
export const users = pgTable('user', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  name: text('name'),
  image: text('image'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ============================================
// Sessions - better-auth 自动管理
// ============================================
export const sessions = pgTable('session', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ============================================
// Notes - 知识笔记
// ============================================
export const notes = pgTable('notes', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  title: text('title').notNull(),
  content: text('content').notNull(),
  tags: text('tags').array().default([]),
  source: text('source'), // 'chat', 'import', 'manual'
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// ============================================
// Flashcards - 闪卡（FSRS 算法）
// ============================================
export const flashcards = pgTable('flashcards', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  noteId: text('note_id').references(() => notes.id),
  question: text('question').notNull(),
  answer: text('answer').notNull(),
  // FSRS 算法字段
  stability: real('stability').default(0),
  difficulty: real('difficulty').default(0),
  elapsedDays: integer('elapsed_days').default(0),
  scheduledDays: integer('scheduled_days').default(0),
  reps: integer('reps').default(0),
  lapses: integer('lapses').default(0),
  state: integer('state').default(0), // 0=new, 1=learning, 2=review, 3=relearning
  due: timestamp('due'),
  lastReview: timestamp('last_review'),
  createdAt: timestamp('created_at').defaultNow(),
});

// ============================================
// Chat Sessions - 对话历史
// ============================================
export const chatSessions = pgTable('chat_sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  title: text('title').notNull(),
  model: text('model'), // 使用的 AI 模型
  personaId: text('persona_id'), // 使用的人格
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// ============================================
// Chat Messages - 对话内容
// ============================================
export const chatMessages = pgTable('chat_messages', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull().references(() => chatSessions.id),
  role: text('role').notNull(), // 'user' | 'model' | 'system'
  content: text('content').notNull(),
  thinking: text('thinking'), // 模型的思考过程
  createdAt: timestamp('created_at').defaultNow(),
});

// ============================================
// API Keys - 用户级 API 密钥
// ============================================
export const apiKeys = pgTable('api_keys', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  provider: text('provider').notNull(), // 'gemini', 'openai', etc.
  key: text('key').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});
