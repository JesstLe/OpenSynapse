import { auth } from "../auth/server";
import type { Request, Response, NextFunction } from "express";

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const session = await auth.api.getSession({
      headers: new Headers(Object.entries(req.headers).map(([k, v]) => [k, String(v)])),
    });
    
    if (!session) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    req.user = session.user;
    next();
  } catch (error) {
    return res.status(401).json({ error: "Invalid session" });
  }
}

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        name?: string;
        image?: string;
      };
    }
  }
}
