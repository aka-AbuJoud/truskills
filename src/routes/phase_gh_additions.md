# Phase G + H — routes/index.ts Additions

These additions must be merged into `routes/index.ts` from Phase F.

## Phase G additions (Blog + Legacy + Bookings update)

```typescript
// Phase G imports
import { BlogRepository } from '../modules/blog/blog.repository';
import { BlogService } from '../modules/blog/blog.service';
import { buildBlogRouter } from '../modules/blog/blog.routes';
import { LegacyRepository } from '../modules/legacy/legacy.repository';
import { LegacyService } from '../modules/legacy/legacy.service';
import { buildLegacyRouter } from '../modules/legacy/legacy.routes';

// --- inside the wiring function, after community wiring ---

// Blog
const blogRepo = new BlogRepository(db);
const blogService = new BlogService(db, blogRepo, communityService);
app.use('/blog', buildBlogRouter(blogService));

// Legacy
const legacyRepo = new LegacyRepository(db);
const legacyService = new LegacyService(legacyRepo);
app.use('/legacy', buildLegacyRouter(legacyService));

// Bookings: rebuild with legacyService injected (Phase G adds 5th constructor arg)
// IMPORTANT: Replace the Phase E/F BookingsService instantiation:
//   Before: new BookingsService(db, bookingsRepo, financeService, communityService)
//   After:  new BookingsService(db, bookingsRepo, financeService, communityService, legacyService)
const bookingsService = new BookingsService(db, bookingsRepo, financeService, communityService, legacyService);
app.use('/bookings', buildBookingsRouter(bookingsService));
```

## Phase H additions (Merit Engine)

```typescript
// Phase H imports
import { MeritRepository } from '../modules/merit/merit.repository';
import { MeritEngineService } from '../modules/merit/merit.service';
import { buildMeritRouter } from '../modules/merit/merit.routes';

// --- inside the wiring function, after legacy wiring ---

// Merit Engine
// Note: MeritEngineService triggers are also wired into other services:
//   - BookingsService.completeEnrollment() fires Signal 3 (reliability) refresh
//   - BlogService.publishPost() fires Signal 6 (blog) refresh
//   For Phase H: these are [PHASE_K_INTEGRATION] hooks — merit refresh is ops-triggered.
const meritRepo = new MeritRepository(db);
const meritService = new MeritEngineService(meritRepo);
app.use('/merit', buildMeritRouter(meritService));
```

## Phase G + H full import block (consolidated)

```typescript
import { BlogRepository } from '../modules/blog/blog.repository';
import { BlogService } from '../modules/blog/blog.service';
import { buildBlogRouter } from '../modules/blog/blog.routes';
import { LegacyRepository } from '../modules/legacy/legacy.repository';
import { LegacyService } from '../modules/legacy/legacy.service';
import { buildLegacyRouter } from '../modules/legacy/legacy.routes';
import { MeritRepository } from '../modules/merit/merit.repository';
import { MeritEngineService } from '../modules/merit/merit.service';
import { buildMeritRouter } from '../modules/merit/merit.routes';
```

## Cross-module signal trigger hooks (Phase K wiring notes)

When merit refresh is wired into other modules (Phase K):

```typescript
// After BlogService.publishPost() succeeds — fire Signal 6 event
await meritService.recordSignalEventAndRefresh({
  providerId: post.provider_id,
  signalNumber: 6,
  eventType: 'BLOG_POST_PUBLISHED',
  valueDelta: 1,
  metadata: { post_id: post.id },
});

// After BookingsService.completeEnrollment() succeeds — fire Signal 3 event
await meritService.recordSignalEventAndRefresh({
  providerId: booking.provider_id,
  signalNumber: 3,
  eventType: 'BOOKING_COMPLETED',
  metadata: { booking_id: booking.id },
});
```
