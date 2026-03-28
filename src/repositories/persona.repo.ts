import { db } from "../db";
import { customPersonas } from "../db/schema";
import { eq, desc } from "drizzle-orm";

export type Persona = typeof customPersonas.$inferSelect;
export type NewPersona = typeof customPersonas.$inferInsert;

export const personaRepo = {
  async create(data: NewPersona) {
    const result = await db.insert(customPersonas).values(data).returning();
    return result[0];
  },

  async findById(id: string) {
    return db.query.customPersonas.findFirst({
      where: eq(customPersonas.id, id),
    });
  },

  async findByUser(userId: string) {
    return db.query.customPersonas.findMany({
      where: eq(customPersonas.userId, userId),
      orderBy: desc(customPersonas.createdAt),
    });
  },

  async update(id: string, data: Partial<NewPersona>) {
    const result = await db
      .update(customPersonas)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(customPersonas.id, id))
      .returning();
    return result[0];
  },

  async delete(id: string) {
    await db.delete(customPersonas).where(eq(customPersonas.id, id));
  },
};
