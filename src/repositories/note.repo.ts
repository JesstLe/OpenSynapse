import { db } from "../db";
import { notes } from "../db/schema";
import { eq, and, or, ilike, desc, sql } from "drizzle-orm";

export type Note = typeof notes.$inferSelect;
export type NewNote = typeof notes.$inferInsert;

export const noteRepo = {
  async create(data: NewNote) {
    const result = await db.insert(notes).values(data).returning();
    return result[0];
  },

  async findById(id: string) {
    return db.query.notes.findFirst({
      where: eq(notes.id, id),
    });
  },

  async findByUser(userId: string) {
    return db.query.notes.findMany({
      where: eq(notes.userId, userId),
      orderBy: desc(notes.updatedAt),
    });
  },

  async update(id: string, data: Partial<NewNote>) {
    const result = await db
      .update(notes)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(notes.id, id))
      .returning();
    return result[0];
  },

  async delete(id: string) {
    await db.delete(notes).where(eq(notes.id, id));
  },

  async search(userId: string, query: string) {
    return db.query.notes.findMany({
      where: and(
        eq(notes.userId, userId),
        or(
          ilike(notes.title, `%${query}%`),
          ilike(notes.content, `%${query}%`)
        )
      ),
    });
  },

  async findByTags(userId: string, tags: string[]) {
    return db.query.notes.findMany({
      where: and(
        eq(notes.userId, userId),
        sql`${notes.tags} && ${tags}`
      ),
    });
  },
};
