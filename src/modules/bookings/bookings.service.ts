import { Knex } from 'knex';

import { CommunityService } from '../community/community.service';
import { FinanceService } from '../finance/finance.service';
import { LegacyService } from '../legacy/legacy.service';
import { MeritEngineService } from '../merit/merit.service';
import { BookingsRepository } from './bookings.repository';

// ── Booking state machine (Phase E — LOCKED) ──────────────────────────────────
// Seeker-initiated bookings flow:
//   PENDING_PAYMENT → PENDING_CONFIRMATION → CONFIRMED → IN_PROGRESS → COMPLETED
//                                          ↓
//                              CANCELLED_BY_SEEKER | CANCELLED_BY_PROVIDER | CANCELLED_BY_OPS
//                                          ↓
//                              REFUND_REQUESTED → REFUNDED
//
// Provider-activated bookings (auto-confirm model) skip PENDING_CONFIRMATION.
// Finance captures payment at CONFIRMED transition (holds at PENDING_PAYMENT).

export type BookingStatus =
  | 'PENDING_PAYMENT'
  | 'PENDING_CONFIRMATION'
  | 'CONFIRMED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED_BY_SEEKER'
  | 'CANCELLED_BY_PROVIDER'
  | 'CANCELLED_BY_OPS'
  | 'REFUND_REQUESTED'
  | 'REFUNDED';

export interface BookingRecord {
  id: string;
  seeker_id: string;
  provider_id: string;
  listing_id: string;
  listing_type: 'COURSE' | 'TRIP' | 'PRODUCT';
  listing_title_snapshot: string;
  price_halalas: number;
  currency: string;
  status: BookingStatus;
  session_date: Date | null;
  course_id: string | null;
  notes: string | null;
  cancelled_reason: string | null;
  cancelled_at: Date | null;
  confirmed_at: Date | null;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateBookingParams {
  seekerId: string;
  listingId: string;
  listingType: 'COURSE' | 'TRIP' | 'PRODUCT';
  sessionDate?: Date;
  notes?: string;
  paymentMethodId: string;
}

export class BookingsService {
  constructor(
    private readonly db: Knex,
    private readonly repo: BookingsRepository,
    private readonly financeService: FinanceService,
    private readonly communityService: CommunityService,
    private readonly legacyService: LegacyService,
    private readonly meritService: MeritEngineService, // Phase K: Signal 3 trigger
  ) {}

  // ── Seeker-facing ─────────────────────────────────────────────────────────

  async createBooking(params: CreateBookingParams): Promise<BookingRecord> {
    const { seekerId, listingId, listingType, sessionDate, notes, paymentMethodId } = params;

    // Resolve listing — must be PUBLISHED and provider ACTIVATED
    const listing = await this._resolvePublishedListing(listingId, listingType);
    const provider = await this.db('providers').where({ id: listing.provider_id }).first();

    if (!provider || provider.activation_status !== 'ACTIVATED') {
      throw new Error('INVALID_LISTING: Provider is not activated');
    }

    // Capacity check (COURSE/TRIP only — Products always available if in stock)
    if (listingType !== 'PRODUCT') {
      await this._assertCapacityAvailable(listingId, listingType, sessionDate);
    }

    // Finance: hold payment (pre-authorization)
    const paymentHold = await this.financeService.holdPayment({
      seekerId,
      providerId: listing.provider_id,
      listingId,
      amountHalalas: listing.price_halalas,
      paymentMethodId,
    });

    const booking = await this.db.transaction(async (trx) => {
      const [b] = await trx('bookings')
        .insert({
          seeker_id: seekerId,
          provider_id: listing.provider_id,
          listing_id: listingId,
          listing_type: listingType,
          listing_title_snapshot: listing.title,
          price_halalas: listing.price_halalas,
          currency: listing.currency ?? 'SAR',
          status: 'PENDING_CONFIRMATION',
          session_date: sessionDate ?? null,
          course_id: listingType === 'COURSE' ? listingId : null,
          notes: notes ?? null,
          payment_hold_id: paymentHold.id,
          created_at: new Date(),
          updated_at: new Date(),
        })
        .returning('*');
      return b as BookingRecord;
    });

    return booking;
  }

  async getSeekerBookings(seekerId: string): Promise<BookingRecord[]> {
    return this.repo.findBySeekerAllStatuses(seekerId);
  }

  // Post-confirmation access reveal: exact address or meeting link
  // Location privacy rule (LOCKED): revealed only for CONFIRMED or later status
  async getBookingAccess(bookingId: string, seekerId: string): Promise<{ address?: string; meeting_link?: string }> {
    const booking = await this.repo.findByIdOrThrow(bookingId);

    if (booking.seeker_id !== seekerId) {
      throw new Error('FORBIDDEN: Not the booking owner');
    }

    if (!['CONFIRMED', 'IN_PROGRESS', 'COMPLETED'].includes(booking.status)) {
      throw new Error('ACCESS_DENIED: Access details only available for confirmed bookings');
    }

    // Location privacy: exact address stored separately, decrypted only post-confirmation
    const accessDetails = await this.db('booking_access_details')
      .where({ booking_id: bookingId })
      .first();

    return {
      address: accessDetails?.exact_address ?? undefined,
      meeting_link: accessDetails?.meeting_link ?? undefined,
    };
  }

  async cancelBooking(bookingId: string, seekerId: string): Promise<BookingRecord> {
    const booking = await this.repo.findByIdOrThrow(bookingId);

    if (booking.seeker_id !== seekerId) throw new Error('FORBIDDEN: Not the booking owner');

    if (!['PENDING_CONFIRMATION', 'CONFIRMED'].includes(booking.status)) {
      throw new Error(`INVALID_STATE: Cannot cancel booking in ${booking.status} status`);
    }

    const [updated] = await this.db('bookings')
      .where({ id: bookingId })
      .update({
        status: 'CANCELLED_BY_SEEKER',
        cancelled_at: new Date(),
        updated_at: new Date(),
      })
      .returning('*');

    // Finance: release hold or initiate refund
    await this.financeService.handleBookingCancellation(bookingId, 'SEEKER');

    return updated as BookingRecord;
  }

  // ── Provider-facing ───────────────────────────────────────────────────────

  async getProviderBookings(providerId: string): Promise<BookingRecord[]> {
    return this.repo.findByProviderAllStatuses(providerId);
  }

  async getBookingForProvider(bookingId: string, providerId: string): Promise<BookingRecord | null> {
    const booking = await this.repo.findById(bookingId);
    if (!booking) return null;
    if (booking.provider_id !== providerId) throw new Error('FORBIDDEN: Not the booking provider');
    return booking;
  }

  async confirmBooking(bookingId: string, providerId: string): Promise<BookingRecord> {
    const booking = await this.repo.findByIdOrThrow(bookingId);

    if (booking.provider_id !== providerId) throw new Error('FORBIDDEN: Not the booking provider');
    if (booking.status !== 'PENDING_CONFIRMATION') {
      throw new Error(`INVALID_STATE: Cannot confirm booking in ${booking.status} status`);
    }

    const [updated] = await this.db('bookings')
      .where({ id: bookingId })
      .update({
        status: 'CONFIRMED',
        confirmed_at: new Date(),
        updated_at: new Date(),
      })
      .returning('*');

    // Finance: capture the held payment
    await this.financeService.capturePayment(bookingId);

    // Community: create group for group-capable bookings (TRIP/COURSE with group capacity)
    // Group creation is idempotent — safe to fire; CommunityService checks for existing group.
    const listing = await this._resolvePublishedListing(booking.listing_id, booking.listing_type as any);
    if (listing.group_enabled) {
      await this.communityService.createGroup({
        triggerType: 'BOOKING_GROUP',
        triggerId: bookingId,
        name: `${listing.title} — Group`,
        memberIds: [booking.seeker_id, providerId],
      });
    }

    return updated as BookingRecord;
  }

  async cancelBookingByProvider(
    bookingId: string,
    providerId: string,
    reason?: string,
  ): Promise<BookingRecord> {
    const booking = await this.repo.findByIdOrThrow(bookingId);

    if (booking.provider_id !== providerId) throw new Error('FORBIDDEN: Not the booking provider');

    if (!['PENDING_CONFIRMATION', 'CONFIRMED'].includes(booking.status)) {
      throw new Error(`INVALID_STATE: Cannot cancel booking in ${booking.status} status`);
    }

    const [updated] = await this.db('bookings')
      .where({ id: bookingId })
      .update({
        status: 'CANCELLED_BY_PROVIDER',
        cancelled_reason: reason ?? null,
        cancelled_at: new Date(),
        updated_at: new Date(),
      })
      .returning('*');

    await this.financeService.handleBookingCancellation(bookingId, 'PROVIDER');

    return updated as BookingRecord;
  }

  // ── Ops-triggered ─────────────────────────────────────────────────────────

  // Ops-triggered: mark a confirmed course enrollment as completed.
  // Fires legacy certificate issuance if course has certificate_availability = true.
  // Phase K: fires Signal 3 (Operational Reliability) merit refresh.
  async completeEnrollment(
    bookingId: string,
    opsActorId: string,
  ): Promise<{ booking: BookingRecord; legacyEntry: Awaited<ReturnType<LegacyService['recordCertificateIssued']>> | null }> {
    const booking = await this.repo.findByIdOrThrow(bookingId);

    if (booking.status !== 'CONFIRMED') {
      throw new Error('INVALID_STATE: Can only complete CONFIRMED bookings');
    }
    if (booking.listing_type !== 'COURSE') {
      throw new Error('INVALID_TYPE: Enrollment completion is for course bookings only');
    }

    const now = new Date();

    // Mark enrollment as completed
    await this.db('course_enrollment_details')
      .where({ booking_id: bookingId })
      .update({ completion_status: 'COMPLETED', updated_at: now });

    // Update booking status
    const [updatedBooking] = await this.db('bookings')
      .where({ id: bookingId })
      .update({ status: 'COMPLETED', completed_at: now, updated_at: now })
      .returning('*');

    // Finance: record completion (makes transaction payout-eligible)
    await this.financeService.recordBookingCompleted(bookingId, now);

    // Legacy: issue certificate if course has certificate_availability = true
    let legacyEntry = null;
    const course = await this.db('courses').where({ id: booking.course_id }).first();

    if (course?.certificate_availability) {
      legacyEntry = await this.legacyService.recordCertificateIssued({
        providerId: booking.provider_id,
        seekerId: booking.seeker_id,
        bookingId: booking.id,
        qualificationName: course.title,
        metadata: {
          completed_by_ops: opsActorId,
          completed_at: now.toISOString(),
          course_id: course.id,
        },
      });
    }

    // Phase K — Signal 3: Operational Reliability refresh
    // Non-blocking: merit refresh failure must not roll back the completion.
    this.meritService.recordSignalEventAndRefresh({
      providerId: booking.provider_id,
      signalNumber: 3,
      eventType: 'BOOKING_COMPLETED',
      metadata: { booking_id: booking.id },
    }).catch(() => {
      // Best-effort. Ops can trigger manual merit refresh via /merit/ops/providers/:id/refresh.
    });

    return { booking: updatedBooking as BookingRecord, legacyEntry };
  }

  // ── Internal helpers ──────────────────────────────────────────────────────

  private async _resolvePublishedListing(
    listingId: string,
    listingType: 'COURSE' | 'TRIP' | 'PRODUCT',
  ): Promise<any> {
    const tableMap = { COURSE: 'courses', TRIP: 'trips', PRODUCT: 'products' };
    const listing = await this.db(tableMap[listingType]).where({ id: listingId }).first();
    if (!listing) throw new Error(`NOT_FOUND: ${listingType} listing not found`);
    if (listing.status !== 'PUBLISHED') throw new Error(`INVALID_LISTING: ${listingType} is not published`);
    return listing;
  }

  private async _assertCapacityAvailable(
    listingId: string,
    listingType: 'COURSE' | 'TRIP' | 'PRODUCT',
    sessionDate?: Date,
  ): Promise<void> {
    const tableMap = { COURSE: 'courses', TRIP: 'trips', PRODUCT: 'products' };
    const listing = await this.db(tableMap[listingType]).where({ id: listingId }).first();
    if (!listing?.max_capacity) return; // no capacity limit

    const activeBookings = await this.db('bookings')
      .where({ listing_id: listingId, listing_type: listingType })
      .whereIn('status', ['PENDING_CONFIRMATION', 'CONFIRMED', 'IN_PROGRESS'])
      .modify((qb) => {
        if (sessionDate) {
          qb.where('session_date', sessionDate);
        }
      })
      .count('id as count')
      .first();

    const current = Number((activeBookings as any)?.count ?? 0);
    if (current >= listing.max_capacity) {
      throw new Error('CAPACITY_FULL: No capacity available for this session');
    }
  }
}
