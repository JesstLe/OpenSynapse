import { db } from "../db";
import { flashcards } from "../db/schema";
import { eq, and, desc, lte } from "drizzle-orm";

export type Flashcard = typeof flashcards.$inferSelect;
export type NewFlashcard = typeof flashcards.$inferInsert;

export const flashcardRepo = {
  async create(data: NewFlashcard) {
    const result = await db.insert(flashcards).values(data).returning();
    return result[0];
  },

  async createBatch(items: NewFlashcard[]) {
    if (items.length === 0) return [];
    const results = await db.insert(flashcards).values(items).returning();
    return results;
  },

  async findById(id: string) {
    return db.query.flashcards.findFirst({
      where: eq(flashcards.id, id),
    });
  },

  async findByUser(userId: string) {
    return db.query.flashcards.findMany({
      where: eq(flashcards.userId, userId),
      orderBy: desc(flashcards.createdAt),
    });
  },

  async findDueForReview(userId: string, date = new Date()) {
    return db.query.flashcards.findMany({
      where: and(
        eq(flashcards.userId, userId),
        lte(flashcards.due, date)
      ),
    });
  },

  async update(id: string, data: Partial<NewFlashcard>) {
    const result = await db
      .update(flashcards)
      .set(data)
      .where(eq(flashcards.id, id))
      .returning();
    return result[0];
  },

  async delete(id: string) {
    await db.delete(flashcards).where(eq(flashcards.id, id));
  },

  async findByNote(noteId: string) {
    return db.query.flashcards.findMany({
      where: eq(flashcards.noteId, noteId),
    });
  },
};
