# Phase G — BookingsService Additions (Enrollment Completion + Legacy Trigger)

These additions must be merged into `bookings.service.ts` and `bookings.routes.ts`
from Phase E/F. They complete the course completion → legacy lineage chain.

---

## 1. Constructor update — inject LegacyService

```typescript
// Add to imports
import { LegacyService } from '../legacy/legacy.service';

// Add to constructor parameters
constructor(
  private readonly db: Knex,
  private readonly repo: BookingsRepository,
  private readonly financeService: FinanceService,
  private readonly communityService: CommunityService,
  private readonly legacyService: LegacyService, // <-- Phase G addition
) {}
```

---

## 2. New method — completeEnrollment()

Add to BookingsService class:

```typescript
// Ops-triggered: mark a CONFIRMED course enrollment as completed.
// If the course has certificate_availability = true, fires legacy lineage entry creation.
async completeEnrollment(
  bookingId: string,
  opsActorId: string,
): Promise<{ booking: BookingRecord; legacyEntry: import('../legacy/legacy.service').LegacyEntryRecord | null }> {
  const booking = await this.repo.findByIdOrThrow(bookingId);

  if (booking.status !== 'CONFIRMED') {
    throw new Error('INVALID_STATE: Can only complete CONFIRMED bookings');
  }
  if (booking.service_type !== 'COURSE') {
    throw new Error('INVALID_TYPE: Enrollment completion is for course bookings only');
  }

  const now = new Date();

  // Mark enrollment detail as completed
  await this.db('course_enrollment_details')
    .where({ booking_id: bookingId })
    .update({ completion_status: 'COMPLETED', updated_at: now });

  // Finance: record booking completed (makes transaction payout-eligible)
  await this.financeService.recordBookingCompleted(bookingId, now);

  // Legacy: fire certificate issuance if course has certificate_availability = true
  let legacyEntry = null;

  const course = await this.db('courses').where({ id: booking.course_id }).first();

  if (course?.certificate_availability) {
    legacyEntry = await this.legacyService.recordCertificateIssued({
      providerId: booking.provider_id,
      seekerId: booking.seeker_id,
      bookingId: booking.id,
      qualificationName: course.title, // snapshot at time of issuance
      metadata: {
        completed_by_ops: opsActorId,
        completed_at: now.toISOString(),
        course_id: course.id,
      },
    });
  }

  return { booking, legacyEntry };
}
```

---

## 3. New ops route — bookings.routes.ts

Add inside the bookings router (ops section):

```typescript
// POST /bookings/ops/:id/complete-enrollment
// Marks enrollment as COMPLETED; triggers legacy chain if certificate-eligible.
router.post('/ops/:id/complete-enrollment', requireOpsToken, async (req, res) => {
  try {
    const opsActorId = (req.headers['x-ops-actor'] as string) ?? 'ops';
    const result = await bookingsService.completeEnrollment(req.params.id, opsActorId);
    res.json(result);
  } catch (e: any) {
    const status = e.message.startsWith('NOT_FOUND')
      ? 404
      : e.message.startsWith('INVALID')
        ? 422
        : 500;
    res.status(status).json({ error: e.message });
  }
});
```

---

## 4. routes/index.ts additions

```typescript
// Phase G additions — add after Phase F wiring

import { BlogRepository } from '../modules/blog/blog.repository';
import { BlogService } from '../modules/blog/blog.service';
import { buildBlogRouter } from '../modules/blog/blog.routes';
import { LegacyRepository } from '../modules/legacy/legacy.repository';
import { LegacyService } from '../modules/legacy/legacy.service';
import { buildLegacyRouter } from '../modules/legacy/legacy.routes';

// --- inside the wiring block ---

const blogRepo = new BlogRepository(db);
const blogService = new BlogService(db, blogRepo, communityService);
app.use('/blog', buildBlogRouter(blogService));

const legacyRepo = new LegacyRepository(db);
const legacyService = new LegacyService(legacyRepo);
app.use('/legacy', buildLegacyRouter(legacyService));

// Rebuild BookingsService with legacyService injected (Phase G adds 5th constructor arg)
// Replace the existing bookingsService instantiation with:
const bookingsService = new BookingsService(db, bookingsRepo, financeService, communityService, legacyService);
app.use('/bookings', buildBookingsRouter(bookingsService));
```
