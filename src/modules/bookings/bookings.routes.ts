import { Router, Request, Response } from 'express';
import { requireAuth } from '../../middleware/auth';
import { requireOpsToken } from '../../middleware/ops';
import { BookingsService } from './bookings.service';

export function buildBookingsRouter(bookingsService: BookingsService): Router {
  const router = Router();

  // ── Seeker routes ──────────────────────────────────────────────────────────

  // POST /bookings — seeker creates booking
  router.post('/', requireAuth, async (req: Request, res: Response) => {
    try {
      const seekerId = req.user!.id;
      const { listingId, listingType, sessionDate, notes, paymentMethodId } = req.body;
      const booking = await bookingsService.createBooking({
        seekerId,
        listingId,
        listingType,
        sessionDate: sessionDate ? new Date(sessionDate) : undefined,
        notes,
        paymentMethodId,
      });
      res.status(201).json(booking);
    } catch (e: any) {
      const status = e.message.startsWith('NOT_FOUND') ? 404
        : e.message.startsWith('INVALID') ? 422
        : e.message.startsWith('CAPACITY_FULL') ? 409
        : 500;
      res.status(status).json({ error: e.message });
    }
  });

  // GET /bookings/my — seeker views own bookings
  router.get('/my', requireAuth, async (req: Request, res: Response) => {
    try {
      const bookings = await bookingsService.getSeekerBookings(req.user!.id);
      res.json(bookings);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /bookings/:id/access — seeker gets exact address/link (post-confirmation only)
  router.get('/:id/access', requireAuth, async (req: Request, res: Response) => {
    try {
      const access = await bookingsService.getBookingAccess(req.params.id, req.user!.id);
      res.json(access);
    } catch (e: any) {
      const status = e.message.startsWith('FORBIDDEN') ? 403
        : e.message.startsWith('ACCESS_DENIED') ? 403
        : e.message.startsWith('NOT_FOUND') ? 404
        : 500;
      res.status(status).json({ error: e.message });
    }
  });

  // POST /bookings/:id/cancel — seeker cancels booking
  router.post('/:id/cancel', requireAuth, async (req: Request, res: Response) => {
    try {
      const booking = await bookingsService.cancelBooking(req.params.id, req.user!.id);
      res.json(booking);
    } catch (e: any) {
      const status = e.message.startsWith('FORBIDDEN') ? 403
        : e.message.startsWith('INVALID_STATE') ? 422
        : e.message.startsWith('NOT_FOUND') ? 404
        : 500;
      res.status(status).json({ error: e.message });
    }
  });

  // ── Provider routes ────────────────────────────────────────────────────────

  // GET /bookings/provider — provider views own bookings
  router.get('/provider', requireAuth, async (req: Request, res: Response) => {
    try {
      const providerId = req.user!.provider_id;
      if (!providerId) return res.status(403).json({ error: 'FORBIDDEN: Provider only' });
      const bookings = await bookingsService.getProviderBookings(providerId);
      res.json(bookings);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /bookings/provider/:id — provider views single booking
  router.get('/provider/:id', requireAuth, async (req: Request, res: Response) => {
    try {
      const providerId = req.user!.provider_id;
      if (!providerId) return res.status(403).json({ error: 'FORBIDDEN: Provider only' });
      const booking = await bookingsService.getBookingForProvider(req.params.id, providerId);
      if (!booking) return res.status(404).json({ error: 'NOT_FOUND' });
      res.json(booking);
    } catch (e: any) {
      const status = e.message.startsWith('FORBIDDEN') ? 403 : 500;
      res.status(status).json({ error: e.message });
    }
  });

  // POST /bookings/:id/confirm — provider confirms booking
  router.post('/:id/confirm', requireAuth, async (req: Request, res: Response) => {
    try {
      const providerId = req.user!.provider_id;
      if (!providerId) return res.status(403).json({ error: 'FORBIDDEN: Provider only' });
      const booking = await bookingsService.confirmBooking(req.params.id, providerId);
      res.json(booking);
    } catch (e: any) {
      const status = e.message.startsWith('FORBIDDEN') ? 403
        : e.message.startsWith('INVALID_STATE') ? 422
        : 500;
      res.status(status).json({ error: e.message });
    }
  });

  // POST /bookings/:id/provider-cancel — provider cancels booking
  router.post('/:id/provider-cancel', requireAuth, async (req: Request, res: Response) => {
    try {
      const providerId = req.user!.provider_id;
      if (!providerId) return res.status(403).json({ error: 'FORBIDDEN: Provider only' });
      const booking = await bookingsService.cancelBookingByProvider(
        req.params.id,
        providerId,
        req.body.reason,
      );
      res.json(booking);
    } catch (e: any) {
      const status = e.message.startsWith('FORBIDDEN') ? 403
        : e.message.startsWith('INVALID_STATE') ? 422
        : 500;
      res.status(status).json({ error: e.message });
    }
  });

  // ── Ops routes ─────────────────────────────────────────────────────────────

  // POST /bookings/:id/complete — ops marks enrollment complete (course bookings only)
  router.post('/:id/complete', requireOpsToken, async (req: Request, res: Response) => {
    try {
      const result = await bookingsService.completeEnrollment(req.params.id, req.body.opsActorId);
      res.json(result);
    } catch (e: any) {
      const status = e.message.startsWith('INVALID_STATE') ? 422
        : e.message.startsWith('INVALID_TYPE') ? 422
        : e.message.startsWith('NOT_FOUND') ? 404
        : 500;
      res.status(status).json({ error: e.message });
    }
  });

  return router;
}
