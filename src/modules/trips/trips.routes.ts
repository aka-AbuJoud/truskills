import { Router, Request, Response } from 'express';
import { requireAuth } from '../../middleware/auth';
import { TripsService } from './trips.service';

export function buildTripsRouter(tripsService: TripsService): Router {
  const router = Router();

  router.get('/', async (req: Request, res: Response) => {
    try {
      const trips = await tripsService.listPublished({
        limit: Number(req.query.limit ?? 20),
        offset: Number(req.query.offset ?? 0),
      });
      res.json(trips);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const trip = await tripsService.getTrip(req.params.id);
      if (!trip || trip.status !== 'PUBLISHED') return res.status(404).json({ error: 'NOT_FOUND' });
      res.json(trip);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/', requireAuth, async (req: Request, res: Response) => {
    try {
      const providerId = req.user!.provider_id;
      if (!providerId) return res.status(403).json({ error: 'FORBIDDEN: Provider only' });
      const trip = await tripsService.createTrip({ ...req.body, providerId });
      res.status(201).json(trip);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.patch('/:id', requireAuth, async (req: Request, res: Response) => {
    try {
      const providerId = req.user!.provider_id;
      if (!providerId) return res.status(403).json({ error: 'FORBIDDEN: Provider only' });
      const trip = await tripsService.updateTrip(req.params.id, providerId, req.body);
      res.json(trip);
    } catch (e: any) {
      const status = e.message.startsWith('NOT_FOUND') ? 404 : e.message.startsWith('FORBIDDEN') ? 403 : 500;
      res.status(status).json({ error: e.message });
    }
  });

  router.post('/:id/publish', requireAuth, async (req: Request, res: Response) => {
    try {
      const providerId = req.user!.provider_id;
      if (!providerId) return res.status(403).json({ error: 'FORBIDDEN: Provider only' });
      const trip = await tripsService.publishTrip(req.params.id, providerId);
      res.json(trip);
    } catch (e: any) {
      const status = e.message.startsWith('NOT_FOUND') ? 404 : e.message.startsWith('FORBIDDEN') ? 403 : 500;
      res.status(status).json({ error: e.message });
    }
  });

  router.post('/:id/archive', requireAuth, async (req: Request, res: Response) => {
    try {
      const providerId = req.user!.provider_id;
      if (!providerId) return res.status(403).json({ error: 'FORBIDDEN: Provider only' });
      const trip = await tripsService.archiveTrip(req.params.id, providerId);
      res.json(trip);
    } catch (e: any) {
      const status = e.message.startsWith('NOT_FOUND') ? 404 : e.message.startsWith('FORBIDDEN') ? 403 : 500;
      res.status(status).json({ error: e.message });
    }
  });

  return router;
}
