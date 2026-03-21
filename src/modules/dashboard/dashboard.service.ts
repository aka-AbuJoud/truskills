import { Knex } from 'knex';

import { MeritEngineService } from '../merit/merit.service';
import {
  TodaySummary,
  TodaySession,
  TodayActionItem,
  CalendarView,
  CalendarEvent,
  CustomerRecord,
  ProviderAnalytics,
  MeritSignalBreakdown,
} from './dashboard.types';

// DashboardService owns cross-cutting aggregation only.
// It does NOT own or replicate data from Finance, Bookings, Community, etc.
// Section-specific routes delegate directly to the owning service.

export class DashboardService {
  constructor(
    private readonly db: Knex,
    private readonly meritService: MeritEngineService,
  ) {}

  // ── TODAY / Home ─────────────────────────────────────────────────────────

  async getTodaySummary(providerId: string): Promise<TodaySummary> {
    const provider = await this.db('providers')
      .join('users', 'providers.user_id', 'users.id')
      .where('providers.id', providerId)
      .select(
        'providers.id',
        'providers.provider_type',
        'providers.activation_status',
        'users.display_name',
      )
      .first();

    if (!provider) throw new Error('NOT_FOUND: Provider not found');

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    // Sessions scheduled today
    const todayRows = await this.db('bookings')
      .join('users as seekers', 'bookings.seeker_id', 'seekers.id')
      .where('bookings.provider_id', providerId)
      .whereBetween('bookings.session_date', [todayStart, todayEnd])
      .whereIn('bookings.status', ['CONFIRMED', 'IN_PROGRESS'])
      .select(
        'bookings.id as booking_id',
        'bookings.listing_id',
        'bookings.listing_type',
        'bookings.listing_title_snapshot as listing_title',
        'seekers.display_name as seeker_display_name',
        'bookings.session_date as scheduled_at',
        'bookings.status',
      );

    const sessionsToday: TodaySession[] = todayRows.map((r: any) => ({
      booking_id: r.booking_id,
      listing_id: r.listing_id,
      listing_type: r.listing_type,
      listing_title: r.listing_title,
      seeker_display_name: r.seeker_display_name,
      scheduled_at: r.scheduled_at,
      status: r.status,
    }));

    // Pending bookings awaiting provider confirmation
    const pendingResult = await this.db('bookings')
      .where({ provider_id: providerId, status: 'PENDING_CONFIRMATION' })
      .count('id as count')
      .first();
    const pendingBookingCount = Number((pendingResult as any)?.count ?? 0);

    // Unread DMs (DMs where provider is a participant and latest message is not from them)
    const unreadDmCount = await this._countUnreadDMs(provider.id);

    // Reviews received in last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentReviewResult = await this.db('booking_reviews')
      .where('provider_id', providerId)
      .where('created_at', '>=', sevenDaysAgo)
      .count('id as count')
      .first();
    const recentReviewCount = Number((recentReviewResult as any)?.count ?? 0);

    // Action items
    const actionItems: TodayActionItem[] = [];

    if (provider.activation_status !== 'ACTIVATED') {
      actionItems.push({
        type: 'ACTIVATION_INCOMPLETE',
        label: `Activation status: ${provider.activation_status}`,
        reference_id: null,
      });
    }

    if (pendingBookingCount > 0) {
      actionItems.push({
        type: 'BOOKING_PENDING_CONFIRMATION',
        label: `${pendingBookingCount} booking${pendingBookingCount > 1 ? 's' : ''} awaiting confirmation`,
        reference_id: null,
      });
    }

    // Blog posts awaiting review feedback
    const blogInReviewResult = await this.db('blog_posts')
      .where({ provider_id: providerId, status: 'IN_REVIEW' })
      .count('id as count')
      .first();
    const blogInReviewCount = Number((blogInReviewResult as any)?.count ?? 0);

    if (blogInReviewCount > 0) {
      actionItems.push({
        type: 'BLOG_POST_IN_REVIEW',
        label: `${blogInReviewCount} blog post${blogInReviewCount > 1 ? 's' : ''} under review`,
        reference_id: null,
      });
    }

    return {
      provider_id: provider.id,
      display_name: provider.display_name,
      provider_type: provider.provider_type,
      activation_status: provider.activation_status,
      sessions_today: sessionsToday,
      pending_booking_count: pendingBookingCount,
      unread_dm_count: unreadDmCount,
      recent_review_count: recentReviewCount,
      action_items: actionItems,
    };
  }

  // ── TODAY / Calendar ──────────────────────────────────────────────────────

  async getCalendarEvents(
    providerId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<CalendarView> {
    const rows = await this.db('bookings')
      .join('users as seekers', 'bookings.seeker_id', 'seekers.id')
      .where('bookings.provider_id', providerId)
      .whereBetween('bookings.session_date', [startDate, endDate])
      .whereIn('bookings.status', ['CONFIRMED', 'IN_PROGRESS', 'COMPLETED'])
      .orderBy('bookings.session_date', 'asc')
      .select(
        'bookings.id as booking_id',
        'bookings.listing_id',
        'bookings.listing_type',
        'bookings.listing_title_snapshot as listing_title',
        'seekers.display_name as seeker_display_name',
        'bookings.session_date as scheduled_at',
        'bookings.status',
      );

    const events: CalendarEvent[] = rows.map((r: any) => {
      const d = new Date(r.scheduled_at);
      const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return {
        date,
        booking_id: r.booking_id,
        listing_id: r.listing_id,
        listing_type: r.listing_type,
        listing_title: r.listing_title,
        seeker_display_name: r.seeker_display_name,
        scheduled_at: r.scheduled_at,
        status: r.status,
      };
    });

    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    return { start_date: fmt(startDate), end_date: fmt(endDate), events };
  }

  // ── AUDIENCE / Customers ──────────────────────────────────────────────────

  async getCustomers(
    providerId: string,
    opts: { limit: number; offset: number },
  ): Promise<CustomerRecord[]> {
    // Aggregate from bookings — Finance owns the financial truth.
    // We project total_paid_halalas from the bookings table's captured amount field,
    // which is written by Finance at capture time. No Finance replication.
    const rows = await this.db('bookings')
      .join('users as seekers', 'bookings.seeker_id', 'seekers.id')
      .where('bookings.provider_id', providerId)
      .groupBy('bookings.seeker_id', 'seekers.display_name')
      .select(
        'bookings.seeker_id',
        'seekers.display_name',
        this.db.raw('COUNT(bookings.id) as booking_count'),
        this.db.raw(`COUNT(CASE WHEN bookings.status = 'COMPLETED' THEN 1 END) as completed_booking_count`),
        this.db.raw('MAX(bookings.created_at) as last_booking_date'),
        this.db.raw(`COALESCE(SUM(CASE WHEN bookings.status IN ('CONFIRMED','COMPLETED') THEN bookings.price_halalas ELSE 0 END), 0) as total_paid_halalas`),
      )
      .orderBy('last_booking_date', 'desc')
      .limit(opts.limit)
      .offset(opts.offset);

    return rows.map((r: any) => ({
      seeker_id: r.seeker_id,
      display_name: r.display_name,
      booking_count: Number(r.booking_count),
      completed_booking_count: Number(r.completed_booking_count),
      last_booking_date: r.last_booking_date ? new Date(r.last_booking_date) : null,
      total_paid_halalas: Number(r.total_paid_halalas),
    }));
  }

  // ── BUSINESS / Analytics ──────────────────────────────────────────────────

  async getAnalytics(providerId: string): Promise<ProviderAnalytics> {
    // Merit profile — from Merit Engine (single source of truth)
    const meritProfile = await this.meritService.getProviderProfile(providerId);

    let meritBreakdown: MeritSignalBreakdown | null = null;
    if (meritProfile) {
      meritBreakdown = {
        signal_1_verification: Number(meritProfile.signal_1_score),
        signal_2_review_quality: Number(meritProfile.signal_2_score),
        signal_3_reliability: Number(meritProfile.signal_3_score),
        signal_4_trust_standing: Number(meritProfile.signal_4_score),
        signal_5_relevance: Number(meritProfile.signal_5_score),
        signal_6_blog: Number(meritProfile.signal_6_score),
        signal_7_activity: Number(meritProfile.signal_7_score),
        signal_8_boost_raw: Number(meritProfile.signal_8_raw),
        composite_score: Number(meritProfile.composite_score),
        tier: meritProfile.tier,
        last_computed_at: meritProfile.last_computed_at ?? null,
      };
    }

    // Booking stats
    const bookingStats = await this.db('bookings')
      .where('provider_id', providerId)
      .select(
        this.db.raw('COUNT(*) as total'),
        this.db.raw(`COUNT(CASE WHEN status IN ('CONFIRMED','IN_PROGRESS','COMPLETED') THEN 1 END) as confirmed`),
        this.db.raw(`COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END) as completed`),
        this.db.raw(`COUNT(CASE WHEN status = 'CANCELLED_BY_SEEKER' OR status = 'CANCELLED_BY_PROVIDER' OR status = 'CANCELLED_BY_OPS' THEN 1 END) as cancelled`),
      )
      .first();

    const totalBookings = Number((bookingStats as any)?.total ?? 0);
    const confirmedBookings = Number((bookingStats as any)?.confirmed ?? 0);
    const completedBookings = Number((bookingStats as any)?.completed ?? 0);
    const cancellationCount = Number((bookingStats as any)?.cancelled ?? 0);
    const completionRate = confirmedBookings > 0
      ? Math.round((completedBookings / confirmedBookings) * 100) / 100
      : null;

    // Review stats
    const reviewStats = await this.db('booking_reviews')
      .where('provider_id', providerId)
      .where('removed_at', null)
      .select(
        this.db.raw('COUNT(*) as review_count'),
        this.db.raw('AVG(rating) as avg_rating'),
      )
      .first();

    const reviewCount = Number((reviewStats as any)?.review_count ?? 0);
    const avgRating = reviewCount > 0 ? Number(Number((reviewStats as any)?.avg_rating).toFixed(2)) : null;

    // Active listings count across all service types
    const courseCount = await this.db('courses')
      .where({ provider_id: providerId, status: 'PUBLISHED' })
      .count('id as count')
      .first();
    const tripCount = await this.db('trips')
      .where({ provider_id: providerId, status: 'PUBLISHED' })
      .count('id as count')
      .first();
    const productCount = await this.db('products')
      .where({ provider_id: providerId, status: 'PUBLISHED' })
      .count('id as count')
      .first();

    const activeListings =
      Number((courseCount as any)?.count ?? 0) +
      Number((tripCount as any)?.count ?? 0) +
      Number((productCount as any)?.count ?? 0);

    return {
      provider_id: providerId,
      merit: meritBreakdown,
      total_bookings: totalBookings,
      confirmed_bookings: confirmedBookings,
      completed_bookings: completedBookings,
      cancellation_count: cancellationCount,
      completion_rate: completionRate,
      avg_review_rating: avgRating,
      review_count: reviewCount,
      active_listings: activeListings,
    };
  }

  // ── Internal helpers ──────────────────────────────────────────────────────

  private async _countUnreadDMs(providerId: string): Promise<number> {
    // Count DM conversations where last message was sent by the other participant
    const rows = await this.db('community_dms')
      .where(function () {
        this.where('participant_a_id', providerId).orWhere('participant_b_id', providerId);
      })
      .whereNotNull('last_message_at');

    let unread = 0;
    for (const dm of rows) {
      const lastMsg = await this.db('community_dm_messages')
        .where({ dm_id: (dm as any).id })
        .orderBy('created_at', 'desc')
        .first();
      if (lastMsg && (lastMsg as any).sender_id !== providerId) {
        unread++;
      }
    }
    return unread;
  }
}
