import { db } from "../db";
import { orders } from "../db/schema";
import { eq, and, desc } from "drizzle-orm";

export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;

export const orderRepo = {
  async create(data: NewOrder) {
    const result = await db.insert(orders).values(data).returning();
    return result[0];
  },

  async findById(id: string) {
    return db.query.orders.findFirst({
      where: eq(orders.id, id),
    });
  },

  async findByOutTradeNo(outTradeNo: string) {
    return db.query.orders.findFirst({
      where: eq(orders.outTradeNo, outTradeNo),
    });
  },

  async findByUser(userId: string) {
    return db.query.orders.findMany({
      where: eq(orders.userId, userId),
      orderBy: desc(orders.createdAt),
    });
  },

  async updateStatus(outTradeNo: string, data: {
    status: string;
    alipayTradeNo?: string;
    buyerId?: string;
    paidAt?: Date;
    closedAt?: Date;
  }) {
    const result = await db
      .update(orders)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(orders.outTradeNo, outTradeNo))
      .returning();
    return result[0];
  },

  async hasUserPurchased(userId: string, productCode: string) {
    const result = await db.query.orders.findFirst({
      where: and(
        eq(orders.userId, userId),
        eq(orders.productCode, productCode),
        eq(orders.status, 'paid')
      ),
    });
    return !!result;
  },
};
