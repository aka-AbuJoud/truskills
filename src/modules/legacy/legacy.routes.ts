import { Router, Request, Response } from 'express';

import { requireAuth } from '../../middleware/auth';
import { requireOpsToken } from '../../middleware/ops';
import { LegacyService } from './legacy.service';

export function buildLegacyRouter(legacyService: LegacyService): Router {
  const router = Router();

  // ── Provider routes ─────────────────────────────────────────────────────────

  // GET /legacy/entries/mine — provider views their own lineage (dashboard)
  router.get('/entries/mine', requireAuth, async (req: Request, res: Response) => {
    try {
      const providerId = req.user!.provider_id;
      if (!providerId) return res.status(403).json({ error: 'FORBIDDEN: Provider account required' });
      const entries = await legacyService.listProviderEntries(providerId);
      res.json(entries);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Seeker routes ───────────────────────────────────────────────────────────

  // GET /legacy/entries/seeker — seeker views their own earned qualifications
  router.get('/entries/seeker', requireAuth, async (req: Request, res: Response) => {
    try {
      const seekerId = req.user!.id;
      const entries = await legacyService.listSeekerEntries(seekerId);
      res.json(entries);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Ops routes ──────────────────────────────────────────────────────────────

  // POST /legacy/ops/entries/:id/verify — ops marks a legacy entry as verified
  router.post('/ops/entries/:id/verify', requireOpsToken, async (req: Request, res: Response) => {
    try {
      const verifiedBy = (req.headers['x-ops-actor'] as string) ?? 'ops';
      const entry = await legacyService.verifyEntry(req.params.id, verifiedBy);
      res.json(entry);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /legacy/ops/entries/issue — ops-triggered certificate issuance
  // Normal path: recordCertificateIssued() is called internally by BookingsService
  // on enrollment completion. This endpoint is the manual ops fallback.
  router.post('/ops/entries/issue', requireOpsToken, async (req: Request, res: Response) => {
    try {
      const { providerId, seekerId, bookingId, qualificationName, metadata } = req.body;
      const entry = await legacyService.recordCertificateIssued({
        providerId,
        seekerId,
        bookingId,
        qualificationName,
        metadata,
      });
      res.status(201).json(entry);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
}
