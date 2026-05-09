import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

export interface AuthUser {
  userId: string;
  email: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.header("Authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid authorization header" });
    return;
  }

  const token = authHeader.slice("Bearer ".length);
  const jwtSecret = process.env.JWT_SECRET;

  if (!jwtSecret) {
    res.status(500).json({ error: "JWT secret is not configured" });
    return;
  }

  try {
    const decoded = jwt.verify(token, jwtSecret) as AuthUser;
    req.user = {
      userId: decoded.userId,
      email: decoded.email
    };
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}
