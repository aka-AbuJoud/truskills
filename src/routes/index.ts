import { Express } from 'express';
import { Knex } from 'knex';

// ── Phase A — Auth ────────────────────────────────────────────────────────────
import { buildAuthRouter } from '../modules/auth/auth.routes';
import { AuthService } from '../modules/auth/auth.service';

// ── Phase B — Provider Activation ────────────────────────────────────────────
import { ActivationRepository } from '../modules/activation/activation.repository';
import { ActivationService } from '../modules/activation/activation.service';
import { buildActivationRouter } from '../modules/activation/activation.routes';

// ── Phase C — Finance ─────────────────────────────────────────────────────────
import { FinanceRepository } from '../modules/finance/finance.repository';
import { FinanceService } from '../modules/finance/finance.service';
import { buildFinanceRouter } from '../modules/finance/finance.routes';

// ── Phase D — Services (Courses, Trips, Products) ────────────────────────────
import { CoursesRepository } from '../modules/courses/courses.repository';
import { CoursesService } from '../modules/courses/courses.service';
import { buildCoursesRouter } from '../modules/courses/courses.routes';
import { TripsRepository } from '../modules/trips/trips.repository';
import { TripsService } from '../modules/trips/trips.service';
import { buildTripsRouter } from '../modules/trips/trips.routes';
import { ProductsRepository } from '../modules/products/products.repository';
import { ProductsService } from '../modules/products/products.service';
import { buildProductsRouter } from '../modules/products/products.routes';

// ── Phase E — Bookings ────────────────────────────────────────────────────────
import { BookingsRepository } from '../modules/bookings/bookings.repository';
import { BookingsService } from '../modules/bookings/bookings.service';
import { buildBookingsRouter } from '../modules/bookings/bookings.routes';

// ── Phase F — Community ───────────────────────────────────────────────────────
import { CommunityService } from '../modules/community/community.service';

// ── Phase G — Blog + Legacy ───────────────────────────────────────────────────
import { BlogRepository } from '../modules/blog/blog.repository';
import { BlogService } from '../modules/blog/blog.service';
import { buildBlogRouter } from '../modules/blog/blog.routes';
import { LegacyRepository } from '../modules/legacy/legacy.repository';
import { LegacyService } from '../modules/legacy/legacy.service';
import { buildLegacyRouter } from '../modules/legacy/legacy.routes';

// ── Phase H — Merit Engine ────────────────────────────────────────────────────
import { MeritRepository } from '../modules/merit/merit.repository';
import { MeritEngineService } from '../modules/merit/merit.service';
import { buildMeritRouter } from '../modules/merit/merit.routes';

// ── Phase I — Seeker Experience ───────────────────────────────────────────────
import { SeekerService } from '../modules/seeker/seeker.service';
import { buildSeekerRouter } from '../modules/seeker/seeker.routes';

// ── Phase J — Provider Dashboard ─────────────────────────────────────────────
import { DashboardService } from '../modules/dashboard/dashboard.service';
import { buildDashboardRouter } from '../modules/dashboard/dashboard.routes';
import { MarketingService } from '../modules/marketing/marketing.service';
import { SettingsService } from '../modules/settings/settings.service';

// ─────────────────────────────────────────────────────────────────────────────

export function wireRoutes(app: Express, db: Knex): void {

  // ── Phase A: Auth ───────────────────────────────────────────────────────────
  const authService = new AuthService(db);
  app.use('/auth', buildAuthRouter(authService));

  // ── Phase B: Activation ─────────────────────────────────────────────────────
  const activationRepo = new ActivationRepository(db);
  const activationService = new ActivationService(db, activationRepo);
  app.use('/activation', buildActivationRouter(activationService));

  // ── Phase C: Finance ────────────────────────────────────────────────────────
  // Finance is the single authoritative money source of truth (LOCKED).
  const financeRepo = new FinanceRepository(db);
  const financeService = new FinanceService(db, financeRepo);
  app.use('/finance', buildFinanceRouter(financeService));

  // ── Phase D: Services ───────────────────────────────────────────────────────
  const coursesRepo = new CoursesRepository(db);
  const coursesService = new CoursesService(db, coursesRepo);
  app.use('/courses', buildCoursesRouter(coursesService));

  const tripsRepo = new TripsRepository(db);
  const tripsService = new TripsService(db, tripsRepo);
  app.use('/trips', buildTripsRouter(tripsService));

  const productsRepo = new ProductsRepository(db);
  const productsService = new ProductsService(db, productsRepo);
  app.use('/products', buildProductsRouter(productsService));

  // ── Phase F: Community ──────────────────────────────────────────────────────
  // Community has no router of its own — it is shared infrastructure triggered
  // by Bookings (group creation) and Blog (thread creation). No self-initiated
  // community surface is exposed at launch. Seeker access is via /seeker routes.
  const communityService = new CommunityService(db);

  // ── Phase H: Merit Engine (hoisted — Phase K: blog + bookings now depend on it) ─
  // Merit signals 3 and 6 are wired in Phase K. Hoisted above blog and bookings
  // so meritService is available at the point of their instantiation.
  const meritRepo = new MeritRepository(db);
  const meritService = new MeritEngineService(meritRepo);
  app.use('/merit', buildMeritRouter(meritService));

  // ── Phase G: Blog + Legacy ──────────────────────────────────────────────────
  const blogRepo = new BlogRepository(db);
  // Phase K: BlogService receives meritService for Signal 6 trigger on publish
  const blogService = new BlogService(db, blogRepo, communityService, meritService);
  app.use('/blog', buildBlogRouter(blogService));

  const legacyRepo = new LegacyRepository(db);
  const legacyService = new LegacyService(legacyRepo);
  app.use('/legacy', buildLegacyRouter(legacyService));

  // ── Phase E: Bookings (instantiated after G/H so all deps are available) ────
  // Phase G adds legacyService as 5th arg; Phase K adds meritService as 6th arg (Signal 3).
  const bookingsRepo = new BookingsRepository(db);
  const bookingsService = new BookingsService(
    db,
    bookingsRepo,
    financeService,
    communityService,
    legacyService,
    meritService, // Phase K: Signal 3 trigger on enrollment completion
  );
  app.use('/bookings', buildBookingsRouter(bookingsService));

  // ── Phase I: Seeker Experience ──────────────────────────────────────────────
  const seekerService = new SeekerService(db, meritService, bookingsService, communityService);
  app.use('/seeker', buildSeekerRouter(seekerService, bookingsService, communityService));

  // ── Phase J: Provider Dashboard ────────────────────────────────────────────
  // Dashboard is an aggregation + routing layer. It does NOT own any data domain.
  // All section-specific operations delegate to the owning service from prior phases.
  //
  // BOOST_DAILY_SPEND_CAP: commercial constant — must come from config, not hardcoded.
  const boostDailySpendCap = Number(process.env.BOOST_DAILY_SPEND_CAP);
  if (!process.env.BOOST_DAILY_SPEND_CAP || process.env.BOOST_DAILY_SPEND_CAP === '__PLACEHOLDER__') {
    // Non-fatal in non-production: marketing routes will guard at service layer.
    // Production safety validator (bootstrap Check 2) will hard-throw before server starts.
  }

  const dashboardService = new DashboardService(db, meritService);
  const marketingService = new MarketingService(db, boostDailySpendCap);
  const settingsService = new SettingsService(db);

  app.use(
    '/dashboard',
    buildDashboardRouter({
      dashboardService,
      bookingsService,
      blogService,
      communityService,
      coursesService,
      financeService,
      legacyService,
      marketingService,
      meritService,
      productsService,
      settingsService,
      tripsService,
    }),
  );
}
