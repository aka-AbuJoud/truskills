import { Router, Request, Response } from 'express';
import { AuthService } from './auth.service';

export function buildAuthRouter(authService: AuthService): Router {
  const router = Router();

  // POST /auth/register
  router.post('/register', async (req: Request, res: Response) => {
    try {
      const { email, password, fullName, role, phone } = req.body;
      if (!email || !password || !fullName || !role) {
        res.status(400).json({ error: 'MISSING_FIELDS: email, password, fullName, role required' });
        return;
      }
      if (!['SEEKER', 'PROVIDER'].includes(role)) {
        res.status(400).json({ error: 'INVALID_ROLE: must be SEEKER or PROVIDER' });
        return;
      }
      const result = await authService.register({ email, password, fullName, role, phone });
      res.status(201).json(result);
    } catch (e: any) {
      if (e.message.startsWith('CONFLICT')) return res.status(409).json({ error: e.message });
      res.status(500).json({ error: e.message });
    }
  });

  // POST /auth/login
  router.post('/login', async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        res.status(400).json({ error: 'MISSING_FIELDS: email and password required' });
        return;
      }
      const result = await authService.login(email, password);
      res.json(result);
    } catch (e: any) {
      if (e.message === 'INVALID_CREDENTIALS') return res.status(401).json({ error: e.message });
      if (e.message === 'ACCOUNT_INACTIVE') return res.status(403).json({ error: e.message });
      res.status(500).json({ error: e.message });
    }
  });

  // POST /auth/refresh
  router.post('/refresh', async (req: Request, res: Response) => {
    try {
      const { refreshToken } = req.body;
      if (!refreshToken) {
        res.status(400).json({ error: 'MISSING_FIELDS: refreshToken required' });
        return;
      }
      const tokens = await authService.refresh(refreshToken);
      res.json(tokens);
    } catch (e: any) {
      if (e.message === 'INVALID_TOKEN') return res.status(401).json({ error: e.message });
      res.status(500).json({ error: e.message });
    }
  });

  // POST /auth/logout
  router.post('/logout', async (req: Request, res: Response) => {
    try {
      const { refreshToken } = req.body;
      if (refreshToken) await authService.logout(refreshToken);
      res.status(204).send();
    } catch {
      res.status(204).send(); // logout is always a success from client perspective
    }
  });

  return router;
}
