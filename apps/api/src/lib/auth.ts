import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthPayload {
  userId: string;
  email: string;
  globalRole: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return;
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as AuthPayload;
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  if (req.user.globalRole !== 'admin') {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
}
