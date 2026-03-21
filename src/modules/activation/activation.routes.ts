import { Router, Request, Response } from 'express';
import { requireAuth } from '../../middleware/auth';
import { requireOpsToken } from '../../middleware/ops';
import { ActivationService } from './activation.service';

export function buildActivationRouter(activationService: ActivationService): Router {
  const router = Router();

  // GET /activation/me — provider gets own activation status
  router.get('/me', requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const provider = await activationService.getProviderStatusByUserId(userId);
      if (!provider) return res.status(404).json({ error: 'NOT_FOUND: No provider profile' });
      res.json(provider);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /activation/start — provider begins activation
  router.post('/start', requireAuth, async (req: Request, res: Response) => {
    try {
      const provider = await activationService.getProviderStatusByUserId(req.user!.id);
      if (!provider) return res.status(404).json({ error: 'NOT_FOUND' });
      const updated = await activationService.startActivation(provider.id);
      res.json(updated);
    } catch (e: any) {
      res.status(e.message.startsWith('INVALID_TRANSITION') ? 422 : 500).json({ error: e.message });
    }
  });

  // POST /activation/submit — provider submits for review
  router.post('/submit', requireAuth, async (req: Request, res: Response) => {
    try {
      const provider = await activationService.getProviderStatusByUserId(req.user!.id);
      if (!provider) return res.status(404).json({ error: 'NOT_FOUND' });
      const updated = await activationService.submitForReview(provider.id);
      res.json(updated);
    } catch (e: any) {
      res.status(e.message.startsWith('INVALID_TRANSITION') ? 422 : 500).json({ error: e.message });
    }
  });

  // PATCH /activation/progress — provider updates requirement completion state
  router.patch('/progress', requireAuth, async (req: Request, res: Response) => {
    try {
      const provider = await activationService.getProviderStatusByUserId(req.user!.id);
      if (!provider) return res.status(404).json({ error: 'NOT_FOUND' });
      const updated = await activationService.updateProgress(provider.id, req.body.progress ?? {});
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /activation/:id/log — provider or ops retrieves audit log
  router.get('/:id/log', requireAuth, async (req: Request, res: Response) => {
    try {
      const log = await activationService.getActivationLog(req.params.id);
      res.json(log);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Ops-only routes ────────────────────────────────────────────────────────

  // POST /activation/ops/providers/:id/review
  router.post('/ops/providers/:id/review', requireOpsToken, async (req: Request, res: Response) => {
    try {
      const updated = await activationService.startReview(req.params.id, req.body.opsActorId);
      res.json(updated);
    } catch (e: any) {
      res.status(e.message.startsWith('INVALID_TRANSITION') ? 422 : 500).json({ error: e.message });
    }
  });

  // POST /activation/ops/providers/:id/revision
  router.post('/ops/providers/:id/revision', requireOpsToken, async (req: Request, res: Response) => {
    try {
      const updated = await activationService.requestRevision(
        req.params.id,
        req.body.opsActorId,
        req.body.reason,
      );
      res.json(updated);
    } catch (e: any) {
      res.status(e.message.startsWith('INVALID_TRANSITION') ? 422 : 500).json({ error: e.message });
    }
  });

  // POST /activation/ops/providers/:id/approve
  router.post('/ops/providers/:id/approve', requireOpsToken, async (req: Request, res: Response) => {
    try {
      const updated = await activationService.approve(req.params.id, req.body.opsActorId);
      res.json(updated);
    } catch (e: any) {
      res.status(e.message.startsWith('INVALID_TRANSITION') ? 422 : 500).json({ error: e.message });
    }
  });

  // POST /activation/ops/providers/:id/activate
  router.post('/ops/providers/:id/activate', requireOpsToken, async (req: Request, res: Response) => {
    try {
      const updated = await activationService.activate(req.params.id, req.body.opsActorId);
      res.json(updated);
    } catch (e: any) {
      res.status(e.message.startsWith('INVALID_TRANSITION') ? 422 : 500).json({ error: e.message });
    }
  });

  // POST /activation/ops/providers/:id/restrict — see ops-runbook.md Section 1
  router.post('/ops/providers/:id/restrict', requireOpsToken, async (req: Request, res: Response) => {
    try {
      const updated = await activationService.restrict(
        req.params.id,
        req.body.opsActorId,
        req.body.reason,
      );
      res.json(updated);
    } catch (e: any) {
      res.status(e.message.startsWith('INVALID_TRANSITION') ? 422 : 500).json({ error: e.message });
    }
  });

  return router;
}
