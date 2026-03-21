import { Router, Request, Response, NextFunction } from 'express';

import { requireAuth } from '../../middleware/auth';
import { requireOpsToken } from '../../middleware/ops';
import { BookingsService } from '../bookings/bookings.service';
import { BlogService } from '../blog/blog.service';
import { CommunityService } from '../community/community.service';
import { CoursesService } from '../courses/courses.service';
import { FinanceService } from '../finance/finance.service';
import { LegacyService } from '../legacy/legacy.service';
import { MarketingService } from '../marketing/marketing.service';
import { MeritEngineService } from '../merit/merit.service';
import { ProductsService } from '../products/products.service';
import { SettingsService } from '../settings/settings.service';
import { TripsService } from '../trips/trips.service';
import { DashboardService } from './dashboard.service';

export interface DashboardRouterDeps {
  dashboardService: DashboardService;
  bookingsService: BookingsService;
  blogService: BlogService;
  communityService: CommunityService;
  coursesService: CoursesService;
  financeService: FinanceService;
  legacyService: LegacyService;
  marketingService: MarketingService;
  meritService: MeritEngineService;
  productsService: ProductsService;
  settingsService: SettingsService;
  tripsService: TripsService;
}

// Middleware: ensures the authenticated user is a provider and injects req.providerId
function requireProvider(req: Request, res: Response, next: NextFunction): void {
  const user = req.user;
  if (!user) {
    res.status(401).json({ error: 'UNAUTHORIZED' });
    return;
  }
  if (user.role !== 'PROVIDER' || !user.provider_id) {
    res.status(403).json({ error: 'FORBIDDEN: Provider account required' });
    return;
  }
  req.providerId = user.provider_id;
  next();
}

export function buildDashboardRouter(deps: DashboardRouterDeps): Router {
  const router = Router();
  const {
    dashboardService,
    bookingsService,
    blogService,
    communityService,
    coursesService,
    financeService,
    legacyService,
    marketingService,
    productsService,
    settingsService,
    tripsService,
  } = deps;

  // All dashboard routes require auth + provider identity
  router.use(requireAuth, requireProvider);

  // ── TODAY / Home ───────────────────────────────────────────────────────────
  // GET /dashboard/home — today summary: sessions, pending bookings, action items

  router.get('/home', async (req: Request, res: Response) => {
    try {
      const summary = await dashboardService.getTodaySummary(req.providerId!);
      res.json(summary);
    } catch (e: any) {
      const status = e.message.startsWith('NOT_FOUND') ? 404 : 500;
      res.status(status).json({ error: e.message });
    }
  });

  // ── TODAY / Calendar ───────────────────────────────────────────────────────
  // GET /dashboard/calendar?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD

  router.get('/calendar', async (req: Request, res: Response) => {
    try {
      const startDate = req.query.startDate
        ? new Date(req.query.startDate as string)
        : (() => { const d = new Date(); d.setDate(d.getDate() - 7); return d; })();
      const endDate = req.query.endDate
        ? new Date(req.query.endDate as string)
        : (() => { const d = new Date(); d.setDate(d.getDate() + 30); return d; })();

      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return res.status(422).json({ error: 'INVALID_DATES: startDate and endDate must be valid dates' });
      }
      if (endDate < startDate) {
        return res.status(422).json({ error: 'INVALID_DATES: endDate must be on or after startDate' });
      }

      const calendar = await dashboardService.getCalendarEvents(req.providerId!, startDate, endDate);
      res.json(calendar);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── TODAY / Bookings ───────────────────────────────────────────────────────
  // Delegates to BookingsService (Phase E). Dashboard is a thin auth + provider-scoping layer.

  // GET /dashboard/bookings — provider's booking list
  router.get('/bookings', async (req: Request, res: Response) => {
    try {
      const bookings = await bookingsService.getProviderBookings(req.providerId!);
      res.json(bookings);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /dashboard/bookings/:id — single booking detail
  router.get('/bookings/:id', async (req: Request, res: Response) => {
    try {
      const booking = await bookingsService.getBookingForProvider(req.params.id, req.providerId!);
      if (!booking) return res.status(404).json({ error: 'NOT_FOUND' });
      res.json(booking);
    } catch (e: any) {
      const status = e.message.startsWith('FORBIDDEN') ? 403 : e.message.startsWith('NOT_FOUND') ? 404 : 500;
      res.status(status).json({ error: e.message });
    }
  });

  // POST /dashboard/bookings/:id/confirm — provider confirms a pending booking
  router.post('/bookings/:id/confirm', async (req: Request, res: Response) => {
    try {
      const booking = await bookingsService.confirmBooking(req.params.id, req.providerId!);
      res.json(booking);
    } catch (e: any) {
      const status = e.message.startsWith('NOT_FOUND') ? 404 : e.message.startsWith('INVALID') ? 422 : e.message.startsWith('FORBIDDEN') ? 403 : 500;
      res.status(status).json({ error: e.message });
    }
  });

  // POST /dashboard/bookings/:id/cancel — provider cancels a booking
  router.post('/bookings/:id/cancel', async (req: Request, res: Response) => {
    try {
      const booking = await bookingsService.cancelBookingByProvider(req.params.id, req.providerId!, req.body.reason);
      res.json(booking);
    } catch (e: any) {
      const status = e.message.startsWith('NOT_FOUND') ? 404 : e.message.startsWith('INVALID') ? 422 : e.message.startsWith('FORBIDDEN') ? 403 : 500;
      res.status(status).json({ error: e.message });
    }
  });

  // ── MY SERVICES / Courses ──────────────────────────────────────────────────
  // Delegates to CoursesService (Phase D).

  router.get('/courses', async (req: Request, res: Response) => {
    try {
      const courses = await coursesService.listByProvider(req.providerId!);
      res.json(courses);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/courses/:id', async (req: Request, res: Response) => {
    try {
      const course = await coursesService.getByIdForProvider(req.params.id, req.providerId!);
      if (!course) return res.status(404).json({ error: 'NOT_FOUND' });
      res.json(course);
    } catch (e: any) {
      const status = e.message.startsWith('FORBIDDEN') ? 403 : e.message.startsWith('NOT_FOUND') ? 404 : 500;
      res.status(status).json({ error: e.message });
    }
  });

  router.post('/courses', async (req: Request, res: Response) => {
    try {
      const course = await coursesService.create({ ...req.body, providerId: req.providerId! });
      res.status(201).json(course);
    } catch (e: any) {
      const status = e.message.startsWith('INVALID') ? 422 : e.message.startsWith('PROVIDER_NOT_ACTIVATED') ? 403 : 500;
      res.status(status).json({ error: e.message });
    }
  });

  router.patch('/courses/:id', async (req: Request, res: Response) => {
    try {
      const course = await coursesService.update(req.params.id, req.providerId!, req.body);
      res.json(course);
    } catch (e: any) {
      const status = e.message.startsWith('FORBIDDEN') ? 403 : e.message.startsWith('NOT_FOUND') ? 404 : e.message.startsWith('INVALID') ? 422 : 500;
      res.status(status).json({ error: e.message });
    }
  });

  router.post('/courses/:id/publish', async (req: Request, res: Response) => {
    try {
      const course = await coursesService.publish(req.params.id, req.providerId!);
      res.json(course);
    } catch (e: any) {
      const status = e.message.startsWith('FORBIDDEN') ? 403 : e.message.startsWith('NOT_FOUND') ? 404 : e.message.startsWith('INVALID') || e.message.startsWith('PROVIDER_NOT_ACTIVATED') ? 422 : 500;
      res.status(status).json({ error: e.message });
    }
  });

  router.post('/courses/:id/unpublish', async (req: Request, res: Response) => {
    try {
      const course = await coursesService.unpublish(req.params.id, req.providerId!);
      res.json(course);
    } catch (e: any) {
      const status = e.message.startsWith('FORBIDDEN') ? 403 : e.message.startsWith('NOT_FOUND') ? 404 : 500;
      res.status(status).json({ error: e.message });
    }
  });

  // ── MY SERVICES / Trips ────────────────────────────────────────────────────

  router.get('/trips', async (req: Request, res: Response) => {
    try {
      const trips = await tripsService.listByProvider(req.providerId!);
      res.json(trips);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/trips/:id', async (req: Request, res: Response) => {
    try {
      const trip = await tripsService.getByIdForProvider(req.params.id, req.providerId!);
      if (!trip) return res.status(404).json({ error: 'NOT_FOUND' });
      res.json(trip);
    } catch (e: any) {
      const status = e.message.startsWith('FORBIDDEN') ? 403 : e.message.startsWith('NOT_FOUND') ? 404 : 500;
      res.status(status).json({ error: e.message });
    }
  });

  router.post('/trips', async (req: Request, res: Response) => {
    try {
      const trip = await tripsService.create({ ...req.body, providerId: req.providerId! });
      res.status(201).json(trip);
    } catch (e: any) {
      const status = e.message.startsWith('INVALID') ? 422 : e.message.startsWith('PROVIDER_NOT_ACTIVATED') ? 403 : 500;
      res.status(status).json({ error: e.message });
    }
  });

  router.patch('/trips/:id', async (req: Request, res: Response) => {
    try {
      const trip = await tripsService.update(req.params.id, req.providerId!, req.body);
      res.json(trip);
    } catch (e: any) {
      const status = e.message.startsWith('FORBIDDEN') ? 403 : e.message.startsWith('NOT_FOUND') ? 404 : e.message.startsWith('INVALID') ? 422 : 500;
      res.status(status).json({ error: e.message });
    }
  });

  router.post('/trips/:id/publish', async (req: Request, res: Response) => {
    try {
      const trip = await tripsService.publish(req.params.id, req.providerId!);
      res.json(trip);
    } catch (e: any) {
      const status = e.message.startsWith('FORBIDDEN') ? 403 : e.message.startsWith('NOT_FOUND') ? 404 : e.message.startsWith('INVALID') || e.message.startsWith('PROVIDER_NOT_ACTIVATED') ? 422 : 500;
      res.status(status).json({ error: e.message });
    }
  });

  router.post('/trips/:id/unpublish', async (req: Request, res: Response) => {
    try {
      const trip = await tripsService.unpublish(req.params.id, req.providerId!);
      res.json(trip);
    } catch (e: any) {
      const status = e.message.startsWith('FORBIDDEN') ? 403 : e.message.startsWith('NOT_FOUND') ? 404 : 500;
      res.status(status).json({ error: e.message });
    }
  });

  // ── MY SERVICES / Products ─────────────────────────────────────────────────

  router.get('/products', async (req: Request, res: Response) => {
    try {
      const products = await productsService.listByProvider(req.providerId!);
      res.json(products);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/products/:id', async (req: Request, res: Response) => {
    try {
      const product = await productsService.getByIdForProvider(req.params.id, req.providerId!);
      if (!product) return res.status(404).json({ error: 'NOT_FOUND' });
      res.json(product);
    } catch (e: any) {
      const status = e.message.startsWith('FORBIDDEN') ? 403 : e.message.startsWith('NOT_FOUND') ? 404 : 500;
      res.status(status).json({ error: e.message });
    }
  });

  router.post('/products', async (req: Request, res: Response) => {
    try {
      const product = await productsService.create({ ...req.body, providerId: req.providerId! });
      res.status(201).json(product);
    } catch (e: any) {
      const status = e.message.startsWith('INVALID') ? 422 : e.message.startsWith('PROVIDER_NOT_ACTIVATED') ? 403 : 500;
      res.status(status).json({ error: e.message });
    }
  });

  router.patch('/products/:id', async (req: Request, res: Response) => {
    try {
      const product = await productsService.update(req.params.id, req.providerId!, req.body);
      res.json(product);
    } catch (e: any) {
      const status = e.message.startsWith('FORBIDDEN') ? 403 : e.message.startsWith('NOT_FOUND') ? 404 : e.message.startsWith('INVALID') ? 422 : 500;
      res.status(status).json({ error: e.message });
    }
  });

  router.post('/products/:id/publish', async (req: Request, res: Response) => {
    try {
      const product = await productsService.publish(req.params.id, req.providerId!);
      res.json(product);
    } catch (e: any) {
      const status = e.message.startsWith('FORBIDDEN') ? 403 : e.message.startsWith('NOT_FOUND') ? 404 : e.message.startsWith('INVALID') || e.message.startsWith('PROVIDER_NOT_ACTIVATED') ? 422 : 500;
      res.status(status).json({ error: e.message });
    }
  });

  router.post('/products/:id/unpublish', async (req: Request, res: Response) => {
    try {
      const product = await productsService.unpublish(req.params.id, req.providerId!);
      res.json(product);
    } catch (e: any) {
      const status = e.message.startsWith('FORBIDDEN') ? 403 : e.message.startsWith('NOT_FOUND') ? 404 : 500;
      res.status(status).json({ error: e.message });
    }
  });

  // ── MY SERVICES / Blog ─────────────────────────────────────────────────────
  // Delegates to BlogService (Phase G). Provider's own posts only.

  router.get('/blog', async (req: Request, res: Response) => {
    try {
      const posts = await blogService.listProviderPosts(req.providerId!);
      res.json(posts);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/blog/:id', async (req: Request, res: Response) => {
    try {
      const post = await blogService.findById(req.params.id);
      if (!post) return res.status(404).json({ error: 'NOT_FOUND' });
      if (post.provider_id !== req.providerId!) {
        return res.status(403).json({ error: 'FORBIDDEN' });
      }
      res.json(post);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/blog', async (req: Request, res: Response) => {
    try {
      const post = await blogService.createPost({ ...req.body, providerId: req.providerId! });
      res.status(201).json(post);
    } catch (e: any) {
      const status = e.message.startsWith('INVALID') ? 422 : 500;
      res.status(status).json({ error: e.message });
    }
  });

  router.patch('/blog/:id', async (req: Request, res: Response) => {
    try {
      const post = await blogService.updateDraft(req.params.id, req.providerId!, req.body);
      res.json(post);
    } catch (e: any) {
      const status = e.message.startsWith('FORBIDDEN') ? 403 : e.message.startsWith('NOT_FOUND') ? 404 : e.message.startsWith('INVALID') ? 422 : 500;
      res.status(status).json({ error: e.message });
    }
  });

  router.post('/blog/:id/submit', async (req: Request, res: Response) => {
    try {
      const post = await blogService.submitForReview(req.params.id, req.providerId!);
      res.json(post);
    } catch (e: any) {
      const status = e.message.startsWith('FORBIDDEN') ? 403 : e.message.startsWith('NOT_FOUND') ? 404 : e.message.startsWith('INVALID') ? 422 : 500;
      res.status(status).json({ error: e.message });
    }
  });

  // ── AUDIENCE / Customers ───────────────────────────────────────────────────

  router.get('/customers', async (req: Request, res: Response) => {
    try {
      const customers = await dashboardService.getCustomers(req.providerId!, {
        limit: Math.min(parseInt(req.query.limit as string) || 50, 200),
        offset: parseInt(req.query.offset as string) || 0,
      });
      res.json(customers);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── AUDIENCE / Community ───────────────────────────────────────────────────
  // Provider accesses their own booking groups and can read/send group messages.
  // Delegates to CommunityService. Groups were created by Bookings (system-triggered).

  // GET /dashboard/community/dms — provider's DM list
  router.get('/community/dms', async (req: Request, res: Response) => {
    try {
      const dms = await communityService.listUserDMs(req.providerId!);
      res.json(dms);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /dashboard/community/dms/:id/messages
  router.get('/community/dms/:id/messages', async (req: Request, res: Response) => {
    try {
      const messages = await communityService.getDMMessages(req.params.id, req.providerId!, {
        limit: Math.min(parseInt(req.query.limit as string) || 50, 100),
        offset: parseInt(req.query.offset as string) || 0,
      });
      res.json(messages);
    } catch (e: any) {
      const status = e.message.startsWith('FORBIDDEN') ? 403 : e.message.startsWith('NOT_FOUND') ? 404 : 500;
      res.status(status).json({ error: e.message });
    }
  });

  // POST /dashboard/community/dms/:id/messages
  router.post('/community/dms/:id/messages', async (req: Request, res: Response) => {
    try {
      const message = await communityService.sendDMMessage({
        dmId: req.params.id,
        senderId: req.providerId!,
        content: req.body.content,
      });
      res.status(201).json(message);
    } catch (e: any) {
      const status = e.message.startsWith('FORBIDDEN') ? 403 : e.message.startsWith('NOT_FOUND') ? 404 : e.message.startsWith('INVALID') ? 422 : 500;
      res.status(status).json({ error: e.message });
    }
  });

  // GET /dashboard/community/groups/:id — view a group (provider must be a member)
  router.get('/community/groups/:id', async (req: Request, res: Response) => {
    try {
      const group = await communityService.getGroupForMember(req.params.id, req.providerId!);
      if (!group) return res.status(404).json({ error: 'NOT_FOUND or not a member' });
      res.json(group);
    } catch (e: any) {
      const status = e.message.startsWith('FORBIDDEN') ? 403 : 500;
      res.status(status).json({ error: e.message });
    }
  });

  // POST /dashboard/community/groups/:id/messages
  router.post('/community/groups/:id/messages', async (req: Request, res: Response) => {
    try {
      const message = await communityService.sendGroupMessage({
        groupId: req.params.id,
        senderId: req.providerId!,
        content: req.body.content,
      });
      res.status(201).json(message);
    } catch (e: any) {
      const status = e.message.startsWith('FORBIDDEN') ? 403 : e.message.startsWith('NOT_FOUND') ? 404 : e.message.startsWith('INVALID') ? 422 : 500;
      res.status(status).json({ error: e.message });
    }
  });

  // ── GROWTH / Marketing ─────────────────────────────────────────────────────
  // Self-serve boost only at launch. Label: "Sponsored". (LOCKED)

  // GET /dashboard/marketing/boosts
  router.get('/marketing/boosts', async (req: Request, res: Response) => {
    try {
      const boosts = await marketingService.listBoosts(req.providerId!);
      res.json(boosts);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /dashboard/marketing/boosts/:id
  router.get('/marketing/boosts/:id', async (req: Request, res: Response) => {
    try {
      const boost = await marketingService.getBoost(req.params.id, req.providerId!);
      if (!boost) return res.status(404).json({ error: 'NOT_FOUND' });
      res.json(boost);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /dashboard/marketing/boosts — create new boost campaign
  router.post('/marketing/boosts', async (req: Request, res: Response) => {
    try {
      const { listingId, listingType, dailyBudgetHalalas, totalBudgetHalalas, startsAt, endsAt } = req.body;
      const boost = await marketingService.createBoost({
        providerId: req.providerId!,
        listingId,
        listingType,
        dailyBudgetHalalas,
        totalBudgetHalalas,
        startsAt: new Date(startsAt),
        endsAt: endsAt ? new Date(endsAt) : undefined,
      });
      res.status(201).json(boost);
    } catch (e: any) {
      const status =
        e.message.startsWith('NOT_FOUND') ? 404 :
        e.message.startsWith('INVALID') || e.message.startsWith('BUDGET') ? 422 :
        e.message.startsWith('PROVIDER_NOT_ACTIVATED') ? 403 :
        500;
      res.status(status).json({ error: e.message });
    }
  });

  // POST /dashboard/marketing/boosts/:id/pause
  router.post('/marketing/boosts/:id/pause', async (req: Request, res: Response) => {
    try {
      const boost = await marketingService.pauseBoost(req.params.id, req.providerId!);
      res.json(boost);
    } catch (e: any) {
      const status = e.message.startsWith('NOT_FOUND') ? 404 : e.message.startsWith('INVALID') ? 422 : 500;
      res.status(status).json({ error: e.message });
    }
  });

  // POST /dashboard/marketing/boosts/:id/resume
  router.post('/marketing/boosts/:id/resume', async (req: Request, res: Response) => {
    try {
      const boost = await marketingService.resumeBoost(req.params.id, req.providerId!);
      res.json(boost);
    } catch (e: any) {
      const status = e.message.startsWith('NOT_FOUND') ? 404 : e.message.startsWith('INVALID') ? 422 : 500;
      res.status(status).json({ error: e.message });
    }
  });

  // POST /dashboard/marketing/boosts/:id/cancel
  router.post('/marketing/boosts/:id/cancel', async (req: Request, res: Response) => {
    try {
      const boost = await marketingService.cancelBoost(req.params.id, req.providerId!);
      res.json(boost);
    } catch (e: any) {
      const status = e.message.startsWith('NOT_FOUND') ? 404 : e.message.startsWith('INVALID') ? 422 : 500;
      res.status(status).json({ error: e.message });
    }
  });

  // ── BUSINESS / Finance ─────────────────────────────────────────────────────
  // Finance is single authoritative money source of truth (LOCKED).
  // Dashboard provides read-only pass-through to provider's own finance summary.

  // GET /dashboard/finance/summary — earnings, pending payouts, payout history
  router.get('/finance/summary', async (req: Request, res: Response) => {
    try {
      const summary = await financeService.getProviderSummary(req.providerId!);
      res.json(summary);
    } catch (e: any) {
      const status = e.message.startsWith('NOT_FOUND') ? 404 : 500;
      res.status(status).json({ error: e.message });
    }
  });

  // GET /dashboard/finance/payouts — payout history
  router.get('/finance/payouts', async (req: Request, res: Response) => {
    try {
      const payouts = await financeService.getProviderPayouts(req.providerId!, {
        limit: Math.min(parseInt(req.query.limit as string) || 20, 100),
        offset: parseInt(req.query.offset as string) || 0,
      });
      res.json(payouts);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /dashboard/finance/transactions — transaction ledger for provider
  router.get('/finance/transactions', async (req: Request, res: Response) => {
    try {
      const transactions = await financeService.getProviderTransactions(req.providerId!, {
        limit: Math.min(parseInt(req.query.limit as string) || 20, 100),
        offset: parseInt(req.query.offset as string) || 0,
      });
      res.json(transactions);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── BUSINESS / Analytics ───────────────────────────────────────────────────
  // Aggregation: merit scores + booking stats + review stats + active listings.

  router.get('/analytics', async (req: Request, res: Response) => {
    try {
      const analytics = await dashboardService.getAnalytics(req.providerId!);
      res.json(analytics);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── ACCOUNT / Settings ─────────────────────────────────────────────────────
  // Account-level configuration only (LOCKED — not item editing, not pricing).

  router.get('/settings', async (req: Request, res: Response) => {
    try {
      const settings = await settingsService.getSettings(req.providerId!);
      res.json(settings);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.patch('/settings', async (req: Request, res: Response) => {
    try {
      const settings = await settingsService.updateSettings(req.providerId!, req.body);
      res.json(settings);
    } catch (e: any) {
      const status = e.message.startsWith('INVALID') ? 422 : 500;
      res.status(status).json({ error: e.message });
    }
  });

  // ── ACCOUNT / Legacy ───────────────────────────────────────────────────────
  // Qualification-unlocked, on-platform lineage only (LOCKED — no external import).
  // Provider reads their own earned legacy entries.

  router.get('/legacy', async (req: Request, res: Response) => {
    try {
      const entries = await legacyService.listProviderEntries(req.providerId!);
      res.json(entries);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/legacy/:id', async (req: Request, res: Response) => {
    try {
      const entry = await legacyService.findById(req.params.id);
      if (!entry) return res.status(404).json({ error: 'NOT_FOUND' });
      // Ownership check: legacy entries belong to a provider — must match requesting provider
      if (entry.provider_id !== req.providerId!) {
        return res.status(403).json({ error: 'FORBIDDEN' });
      }
      res.json(entry);
    } catch (e: any) {
      const status = e.message.startsWith('NOT_FOUND') ? 404 : 500;
      res.status(status).json({ error: e.message });
    }
  });

  // ── Ops — provider management ──────────────────────────────────────────────

  // POST /dashboard/ops/providers/:id/restrict — ops restricts a provider
  router.post('/ops/providers/:id/restrict', requireOpsToken, async (req: Request, res: Response) => {
    try {
      // Activation state machine is owned by Phase B (ActivationService).
      // Restriction is an ops-only transition — delegated to activation module.
      // This route is a surface convenience only — the owning logic is in activation.
      res.status(501).json({ error: 'NOT_IMPLEMENTED: Delegate to /activation/ops/providers/:id/restrict' });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
}
