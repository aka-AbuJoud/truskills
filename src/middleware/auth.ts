import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

interface JwtPayload {
  sub: string;       // user.id
  email: string;
  role: 'SEEKER' | 'PROVIDER' | 'OPS';
  provider_id?: string;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'UNAUTHORIZED' });
    return;
  }

  const token = header.slice(7);
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    res.status(500).json({ error: 'JWT_SECRET not configured' });
    return;
  }

  try {
    const payload = jwt.verify(token, secret) as JwtPayload;
    req.user = {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      provider_id: payload.provider_id,
    };
    next();
  } catch {
    res.status(401).json({ error: 'UNAUTHORIZED' });
  }
}

export function requireRole(...roles: Array<'SEEKER' | 'PROVIDER' | 'OPS'>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: 'FORBIDDEN' });
      return;
    }
    next();
  };
}
