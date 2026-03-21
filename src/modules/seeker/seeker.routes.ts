import { Router, Request, Response } from 'express';

import { requireAuth } from '../../middleware/auth';
import { requireOpsToken } from '../../middleware/ops';
import { BookingsService } from '../bookings/bookings.service';
import { CommunityService } from '../community/community.service';
import { ListingType } from '../merit/merit.service';
import { SeekerService } from './seeker.service';

export function buildSeekerRouter(
  seekerService: SeekerService,
  bookingsService: BookingsService,
  communityService: CommunityService,
): Router {
  const router = Router();

  // ── Discovery — no auth required (public browsing) ──────────────────────────

  // GET /seeker/discover/:listingType?slots=20
  // Merit-ranked discovery feed — 60/25/15 allocation enforced
  router.get('/discover/:listingType', async (req: Request, res: Response) => {
    try {
      const listingType = req.params.listingType.toUpperCase() as ListingType;
      if (!['COURSE', 'TRIP', 'PRODUCT'].includes(listingType)) {
        return res.status(422).json({ error: 'listingType must be COURSE, TRIP, or PRODUCT' });
      }
      const totalSlots = Math.min(parseInt(req.query.slots as string) || 20, 100);
      const feed = await seekerService.buildDiscoveryPage(listingType, totalSlots);
      res.json(feed);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /seeker/search?query=...&listingTypes=COURSE,TRIP&categoryId=...
  router.get('/search', async (req: Request, res: Response) => {
    try {
      const query = req.query.query as string | undefined;
      const listingTypesRaw = req.query.listingTypes as string | undefined;
      const listingTypes = listingTypesRaw
        ? (listingTypesRaw.split(',').map((t) => t.trim().toUpperCase()) as ('COURSE' | 'TRIP' | 'PRODUCT')[])
        : undefined;

      const results = await seekerService.searchListings({
        query,
        listingTypes,
        categoryId: req.query.categoryId as string | undefined,
        subcategoryId: req.query.subcategoryId as string | undefined,
        isFree: req.query.isFree === 'true' ? true : req.query.isFree === 'false' ? false : undefined,
        minPriceHalalas: req.query.minPrice ? parseInt(req.query.minPrice as string) : undefined,
        maxPriceHalalas: req.query.maxPrice ? parseInt(req.query.maxPrice as string) : undefined,
        limit: Math.min(parseInt(req.query.limit as string) || 20, 100),
        offset: parseInt(req.query.offset as string) || 0,
      });
      res.json(results);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Listing detail pages — no auth required ─────────────────────────────────

  // GET /seeker/courses/:id
  router.get('/courses/:id', async (req: Request, res: Response) => {
    try {
      const detail = await seekerService.getCourseDetail(req.params.id);
      if (!detail) return res.status(404).json({ error: 'NOT_FOUND' });
      res.json(detail);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /seeker/trips/:id
  router.get('/trips/:id', async (req: Request, res: Response) => {
    try {
      const detail = await seekerService.getTripDetail(req.params.id);
      if (!detail) return res.status(404).json({ error: 'NOT_FOUND' });
      res.json(detail);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /seeker/products/:id
  router.get('/products/:id', async (req: Request, res: Response) => {
    try {
      const detail = await seekerService.getProductDetail(req.params.id);
      if (!detail) return res.status(404).json({ error: 'NOT_FOUND' });
      res.json(detail);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /seeker/providers/:id — public provider profile
  router.get('/providers/:id', async (req: Request, res: Response) => {
    try {
      const profile = await seekerService.getProviderPublicProfile(req.params.id);
      if (!profile) return res.status(404).json({ error: 'NOT_FOUND' });
      res.json(profile);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Reviews — public read, authenticated write ──────────────────────────────

  // GET /seeker/reviews/:listingType/:listingId
  router.get('/reviews/:listingType/:listingId', async (req: Request, res: Response) => {
    try {
      const listingType = req.params.listingType.toUpperCase() as 'COURSE' | 'TRIP' | 'PRODUCT';
      const reviews = await seekerService.getListingReviews(req.params.listingId, listingType, {
        limit: Math.min(parseInt(req.query.limit as string) || 20, 100),
        offset: parseInt(req.query.offset as string) || 0,
      });
      res.json(reviews);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /seeker/reviews — submit review for a completed booking (auth required)
  router.post('/reviews', requireAuth, async (req: Request, res: Response) => {
    try {
      const seekerId = req.user!.id;
      const { bookingId, providerId, listingId, listingType, rating, reviewText } = req.body;
      const review = await seekerService.submitReview({
        bookingId,
        seekerId,
        providerId,
        listingId,
        listingType,
        rating,
        reviewText,
      });
      res.status(201).json(review);
    } catch (e: any) {
      const status = e.message.startsWith('INVALID')
        ? 422
        : e.message.startsWith('DUPLICATE')
          ? 409
          : 500;
      res.status(status).json({ error: e.message });
    }
  });

  // ── Bookings — auth required ────────────────────────────────────────────────
  // Delegates to BookingsService (Phase E). Seeker routes are a thin auth layer.

  // POST /seeker/bookings — create booking
  router.post('/bookings', requireAuth, async (req: Request, res: Response) => {
    try {
      const seekerId = req.user!.id;
      const booking = await bookingsService.createBooking({ ...req.body, seekerId });
      res.status(201).json(booking);
    } catch (e: any) {
      const status = e.message.startsWith('NOT_FOUND')
        ? 404
        : e.message.startsWith('INVALID') || e.message.startsWith('CAPACITY')
          ? 422
          : e.message.startsWith('PAYMENT_FAILED')
            ? 402
            : 500;
      res.status(status).json({ error: e.message });
    }
  });

  // GET /seeker/bookings — list own bookings
  router.get('/bookings', requireAuth, async (req: Request, res: Response) => {
    try {
      const bookings = await seekerService.getSeekerBookings(req.user!.id);
      res.json(bookings);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /seeker/bookings/:id/access — post-confirmed privacy reveal (exact address / meeting link)
  router.get('/bookings/:id/access', requireAuth, async (req: Request, res: Response) => {
    try {
      const seekerId = req.user!.id;
      const access = await bookingsService.getBookingAccess(req.params.id, seekerId);
      res.json(access);
    } catch (e: any) {
      const status = e.message.startsWith('NOT_FOUND')
        ? 404
        : e.message.startsWith('FORBIDDEN') || e.message.startsWith('ACCESS_DENIED')
          ? 403
          : 500;
      res.status(status).json({ error: e.message });
    }
  });

  // POST /seeker/bookings/:id/cancel
  router.post('/bookings/:id/cancel', requireAuth, async (req: Request, res: Response) => {
    try {
      const seekerId = req.user!.id;
      const booking = await bookingsService.cancelBooking(req.params.id, seekerId);
      res.json(booking);
    } catch (e: any) {
      const status = e.message.startsWith('NOT_FOUND') ? 404 : e.message.startsWith('INVALID') ? 422 : 500;
      res.status(status).json({ error: e.message });
    }
  });

  // ── Account views — auth required ───────────────────────────────────────────

  // GET /seeker/account/enrollments — active course enrollments with access window details
  router.get('/account/enrollments', requireAuth, async (req: Request, res: Response) => {
    try {
      const enrollments = await seekerService.getSeekerEnrollments(req.user!.id);
      res.json(enrollments);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Community access — auth required ────────────────────────────────────────
  // Delegates to CommunityService (Phase F).

  // GET /seeker/community/threads/:id — read blog thread + replies
  router.get('/community/threads/:id', requireAuth, async (req: Request, res: Response) => {
    try {
      const thread = await communityService.getThread(req.params.id);
      if (!thread) return res.status(404).json({ error: 'NOT_FOUND' });
      res.json(thread);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /seeker/community/threads/:id/replies — reply to a blog thread
  router.post('/community/threads/:id/replies', requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const reply = await communityService.addThreadReply({
        threadId: req.params.id,
        authorId: userId,
        content: req.body.content,
      });
      res.status(201).json(reply);
    } catch (e: any) {
      const status = e.message.startsWith('NOT_FOUND') ? 404 : e.message.startsWith('INVALID') ? 422 : 500;
      res.status(status).json({ error: e.message });
    }
  });

  // GET /seeker/community/dms — list own DM conversations
  router.get('/community/dms', requireAuth, async (req: Request, res: Response) => {
    try {
      const dms = await communityService.listUserDMs(req.user!.id);
      res.json(dms);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /seeker/community/dms — start or find DM with a provider
  router.post('/community/dms', requireAuth, async (req: Request, res: Response) => {
    try {
      const dm = await communityService.getOrCreateDM(req.user!.id, req.body.recipientId);
      res.status(201).json(dm);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /seeker/community/dms/:id/messages
  router.get('/community/dms/:id/messages', requireAuth, async (req: Request, res: Response) => {
    try {
      const messages = await communityService.getDMMessages(req.params.id, req.user!.id, {
        limit: Math.min(parseInt(req.query.limit as string) || 50, 100),
        offset: parseInt(req.query.offset as string) || 0,
      });
      res.json(messages);
    } catch (e: any) {
      const status = e.message.startsWith('FORBIDDEN') ? 403 : e.message.startsWith('NOT_FOUND') ? 404 : 500;
      res.status(status).json({ error: e.message });
    }
  });

  // POST /seeker/community/dms/:id/messages
  router.post('/community/dms/:id/messages', requireAuth, async (req: Request, res: Response) => {
    try {
      const msg = await communityService.sendDMMessage({
        dmId: req.params.id,
        senderId: req.user!.id,
        content: req.body.content,
      });
      res.status(201).json(msg);
    } catch (e: any) {
      const status = e.message.startsWith('FORBIDDEN') ? 403 : e.message.startsWith('NOT_FOUND') ? 404 : 500;
      res.status(status).json({ error: e.message });
    }
  });

  // GET /seeker/community/groups/:id — read group (gated: seeker must be a member)
  router.get('/community/groups/:id', requireAuth, async (req: Request, res: Response) => {
    try {
      const group = await communityService.getGroupForMember(req.params.id, req.user!.id);
      if (!group) return res.status(404).json({ error: 'NOT_FOUND or not a member' });
      res.json(group);
    } catch (e: any) {
      const status = e.message.startsWith('FORBIDDEN') ? 403 : 500;
      res.status(status).json({ error: e.message });
    }
  });

  // POST /seeker/community/groups/:id/messages — post to a group (seeker must be a member)
  router.post('/community/groups/:id/messages', requireAuth, async (req: Request, res: Response) => {
    try {
      const msg = await communityService.sendGroupMessage({
        groupId: req.params.id,
        senderId: req.user!.id,
        content: req.body.content,
      });
      res.status(201).json(msg);
    } catch (e: any) {
      const status = e.message.startsWith('FORBIDDEN') ? 403 : e.message.startsWith('NOT_FOUND') ? 404 : 500;
      res.status(status).json({ error: e.message });
    }
  });

  // ── Ops — review management ─────────────────────────────────────────────────

  // POST /seeker/ops/reviews/:id/remove — ops removes a review for policy violation
  router.post('/ops/reviews/:id/remove', requireOpsToken, async (req: Request, res: Response) => {
    try {
      const removedBy = (req.headers['x-ops-actor'] as string) ?? 'ops';
      const review = await seekerService.removeReview(req.params.id, removedBy, req.body.reason);
      res.json(review);
    } catch (e: any) {
      const status = e.message.startsWith('NOT_FOUND') ? 404 : 500;
      res.status(status).json({ error: e.message });
    }
  });

  return router;
}
