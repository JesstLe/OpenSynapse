import { db } from "../db";
import { apiKeys } from "../db/schema";
import { eq, and } from "drizzle-orm";

export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;

export const apiKeyRepo = {
  async create(data: NewApiKey) {
    const result = await db.insert(apiKeys).values(data).returning();
    return result[0];
  },

  async findByUser(userId: string) {
    return db.query.apiKeys.findMany({
      where: eq(apiKeys.userId, userId),
    });
  },

  async findByUserAndProvider(userId: string, provider: string) {
    return db.query.apiKeys.findFirst({
      where: and(
        eq(apiKeys.userId, userId),
        eq(apiKeys.provider, provider)
      ),
    });
  },

  async update(userId: string, provider: string, key: string) {
    const result = await db
      .update(apiKeys)
      .set({ key })
      .where(and(
        eq(apiKeys.userId, userId),
        eq(apiKeys.provider, provider)
      ))
      .returning();
    return result[0];
  },

  async delete(id: string) {
    await db.delete(apiKeys).where(eq(apiKeys.id, id));
  },
};
