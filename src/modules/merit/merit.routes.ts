import { Router, Request, Response } from 'express';

import { requireAuth } from '../../middleware/auth';
import { requireOpsToken } from '../../middleware/ops';
import { ListingType, MeritEngineService } from './merit.service';

export function buildMeritRouter(meritService: MeritEngineService): Router {
  const router = Router();

  // ── Ops routes — score management ───────────────────────────────────────────

  // POST /merit/ops/providers/:id/refresh
  // Trigger full provider merit recomputation (composite + all listings)
  router.post('/ops/providers/:id/refresh', requireOpsToken, async (req: Request, res: Response) => {
    try {
      const profile = await meritService.refreshProvider(req.params.id);
      res.json(profile);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /merit/ops/listings/:listingType/:listingId/refresh
  // Trigger listing-level score recomputation for a single listing
  router.post(
    '/ops/listings/:listingType/:listingId/refresh',
    requireOpsToken,
    async (req: Request, res: Response) => {
      try {
        const listingType = req.params.listingType.toUpperCase() as ListingType;
        const { providerId } = req.body;
        if (!providerId) return res.status(422).json({ error: 'providerId required in body' });

        const score = await meritService.computeAndPersistListingScore(
          req.params.listingId,
          listingType,
          providerId,
        );
        res.json(score);
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    },
  );

  // ── Provider-facing routes ──────────────────────────────────────────────────

  // GET /merit/providers/me/profile — provider views own merit profile
  // Required at launch: tier output must be available even if Analytics UI is deferred
  router.get('/providers/me/profile', requireAuth, async (req: Request, res: Response) => {
    try {
      const providerId = req.user!.provider_id;
      if (!providerId) return res.status(403).json({ error: 'FORBIDDEN: Provider account required' });

      const profile = await meritService.getProviderProfile(providerId);
      if (!profile) {
        // Profile not yet computed — trigger initial computation
        const computed = await meritService.computeAndPersistProviderComposite(providerId);
        return res.json(computed);
      }
      res.json(profile);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /merit/providers/me/listings — provider views merit scores for own listings
  router.get('/providers/me/listings', requireAuth, async (req: Request, res: Response) => {
    try {
      const providerId = req.user!.provider_id;
      if (!providerId) return res.status(403).json({ error: 'FORBIDDEN: Provider account required' });
      const scores = await meritService.listProviderListingScores(providerId);
      res.json(scores);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Discovery feed (internal / seeker-facing) ───────────────────────────────
  // Note: public seeker discovery UI is Phase I scope.
  // This endpoint exposes the merit-ranked feed for integration testing and Phase I wiring.

  // GET /merit/discovery/:listingType?slots=20
  // Returns discovery feed with 60/25/15 allocation enforced
  router.get('/discovery/:listingType', async (req: Request, res: Response) => {
    try {
      const listingType = req.params.listingType.toUpperCase() as ListingType;
      const totalSlots = Math.min(parseInt(req.query.slots as string) || 20, 100);

      if (!['COURSE', 'TRIP', 'PRODUCT'].includes(listingType)) {
        return res.status(422).json({ error: 'listingType must be COURSE, TRIP, or PRODUCT' });
      }

      const feed = await meritService.buildDiscoveryFeed(listingType, totalSlots);
      res.json(feed);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
}
