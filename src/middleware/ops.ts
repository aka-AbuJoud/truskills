import { Request, Response, NextFunction } from 'express';

// requireOpsToken — validates the OPS_TOKEN header for ops-only endpoints.
// Separate from JWT auth: ops endpoints are called by internal tooling / runbook procedures.

export function requireOpsToken(req: Request, res: Response, next: NextFunction): void {
  const token = req.headers['x-ops-token'] as string | undefined;
  const expectedToken = process.env.OPS_TOKEN;

  if (!expectedToken) {
    res.status(500).json({ error: 'OPS_TOKEN not configured' });
    return;
  }

  if (!token || token !== expectedToken) {
    res.status(401).json({ error: 'UNAUTHORIZED' });
    return;
  }

  next();
}
