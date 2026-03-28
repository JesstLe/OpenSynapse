import { Router } from "express";
import { auth } from "../auth/server";

export function requireAuth(handler: (req: any, res: any, userId: string) => Promise<void>) {
  return async (req: any, res: any) => {
    try {
      const session = await auth.api.getSession({ headers: req.headers });
      const userId = session?.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      return handler(req, res, userId);
    } catch (error) {
      console.error("[Auth] Session verification failed:", error);
      return res.status(401).json({ error: "Unauthorized" });
    }
  };
}

export default { requireAuth };
