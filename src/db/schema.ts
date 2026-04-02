import { pgTable, text, timestamp, boolean, real, integer } from 'drizzle-orm/pg-core';

export const users = pgTable('user', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  name: text('name'),
  image: text('image'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const sessions = pgTable('session', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const accounts = pgTable('account', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  scope: text('scope'),
  idToken: text('id_token'),
  password: text('password'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const verifications = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const notes = pgTable('notes', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  title: text('title').notNull(),
  summary: text('summary').default(''),
  content: text('content').notNull(),
  codeSnippet: text('code_snippet'),
  tags: text('tags').array().default([]),
  relatedIds: text('related_ids').array().default([]),
  embedding: real('embedding').array(),
  source: text('source'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const flashcards = pgTable('flashcards', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  noteId: text('note_id').references(() => notes.id),
  question: text('question').notNull(),
  answer: text('answer').notNull(),
  stability: real('stability').default(0),
  difficulty: real('difficulty').default(0),
  elapsedDays: integer('elapsed_days').default(0),
  scheduledDays: integer('scheduled_days').default(0),
  reps: integer('reps').default(0),
  lapses: integer('lapses').default(0),
  state: integer('state').default(0),
  due: timestamp('due'),
  lastReview: timestamp('last_review'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const chatSessions = pgTable('chat_sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  title: text('title').notNull(),
  model: text('model'),
  personaId: text('persona_id'),
  source: text('source'),
  importedAt: timestamp('imported_at'),
  fingerprint: text('fingerprint'),
  originalExportedAt: text('original_exported_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const chatMessages = pgTable('chat_messages', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull().references(() => chatSessions.id),
  role: text('role').notNull(),
  content: text('content').notNull(),
  thinking: text('thinking'),
  image: text('image'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const apiKeys = pgTable('api_keys', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  provider: text('provider').notNull(),
  key: text('key').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const customPersonas = pgTable('custom_personas', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  name: text('name').notNull(),
  description: text('description'),
  systemPrompt: text('system_prompt').notNull(),
  icon: text('icon'),
  isHidden: boolean('is_hidden').default(false),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const orders = pgTable('orders', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  outTradeNo: text('out_trade_no').notNull().unique(),
  totalAmount: text('total_amount').notNull(),
  subject: text('subject').notNull(),
  body: text('body'),
  productCode: text('product_code').notNull(),
  status: text('status').notNull().default('pending'),
  alipayTradeNo: text('alipay_trade_no'),
  buyerId: text('buyer_id'),
  paidAt: timestamp('paid_at'),
  closedAt: timestamp('closed_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const mcpApiKeys = pgTable('mcp_api_keys', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  keyHash: text('key_hash').notNull(),
  name: text('name').notNull(),
  scopes: text('scopes').array().notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  lastUsedAt: timestamp('last_used_at'),
});
