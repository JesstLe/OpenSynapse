import { db } from "../db";
import { chatSessions, chatMessages } from "../db/schema";
import { eq, and, desc } from "drizzle-orm";

export type ChatSession = typeof chatSessions.$inferSelect;
export type NewChatSession = typeof chatSessions.$inferInsert;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type NewChatMessage = typeof chatMessages.$inferInsert;

export const chatRepo = {
  session: {
    async create(data: NewChatSession) {
      const result = await db.insert(chatSessions).values(data).returning();
      return result[0];
    },

    async findById(id: string) {
      return db.query.chatSessions.findFirst({
        where: eq(chatSessions.id, id),
      });
    },

    async findByUser(userId: string) {
      return db.query.chatSessions.findMany({
        where: eq(chatSessions.userId, userId),
        orderBy: desc(chatSessions.updatedAt),
      });
    },

    async update(id: string, data: Partial<NewChatSession>) {
      const result = await db
        .update(chatSessions)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(chatSessions.id, id))
        .returning();
      return result[0];
    },

    async delete(id: string) {
      await db.delete(chatSessions).where(eq(chatSessions.id, id));
    },
  },

  message: {
    async create(data: NewChatMessage) {
      const result = await db.insert(chatMessages).values(data).returning();
      return result[0];
    },

    async findBySession(sessionId: string) {
      return db.query.chatMessages.findMany({
        where: eq(chatMessages.sessionId, sessionId),
        orderBy: chatMessages.createdAt,
      });
    },

    async deleteBySession(sessionId: string) {
      await db.delete(chatMessages).where(eq(chatMessages.sessionId, sessionId));
    },
  },
};
