import { Knex } from 'knex';

import { ProviderMeritProfile, ListingMeritScore, SignalEvent, ListingType } from './merit.service';

export class MeritRepository {
  constructor(private readonly db: Knex) {}

  // ── Provider profiles ───────────────────────────────────────────────────────

  async upsertProviderProfile(profile: Omit<ProviderMeritProfile, 'id' | 'created_at' | 'updated_at'>): Promise<ProviderMeritProfile> {
    const [row] = await this.db('provider_merit_profiles')
      .insert({ ...profile, created_at: new Date(), updated_at: new Date() })
      .onConflict('provider_id')
      .merge({
        signal_1_score: profile.signal_1_score,
        signal_2_score: profile.signal_2_score,
        signal_3_score: profile.signal_3_score,
        signal_4_score: profile.signal_4_score,
        signal_5_score: profile.signal_5_score,
        signal_6_score: profile.signal_6_score,
        signal_7_score: profile.signal_7_score,
        signal_8_raw: profile.signal_8_raw,
        composite_score: profile.composite_score,
        tier: profile.tier,
        last_computed_at: profile.last_computed_at,
        updated_at: new Date(),
      })
      .returning('*');
    return row as ProviderMeritProfile;
  }

  async findProviderProfile(providerId: string): Promise<ProviderMeritProfile | null> {
    const row = await this.db('provider_merit_profiles').where({ provider_id: providerId }).first();
    return row ? (row as ProviderMeritProfile) : null;
  }

  // ── Listing scores ──────────────────────────────────────────────────────────

  async upsertListingScore(score: Omit<ListingMeritScore, 'id' | 'created_at' | 'updated_at'>): Promise<ListingMeritScore> {
    const [row] = await this.db('listing_merit_scores')
      .insert({ ...score, created_at: new Date(), updated_at: new Date() })
      .onConflict(['listing_id', 'listing_type'])
      .merge({
        provider_composite_snapshot: score.provider_composite_snapshot,
        provider_tier_snapshot: score.provider_tier_snapshot,
        raw_listing_score: score.raw_listing_score,
        final_listing_score: score.final_listing_score,
        listing_tier: score.listing_tier,
        active_boost_halalas: score.active_boost_halalas,
        discovery_slot_type: score.discovery_slot_type,
        last_computed_at: score.last_computed_at,
        updated_at: new Date(),
      })
      .returning('*');
    return row as ListingMeritScore;
  }

  async findListingScore(listingId: string, listingType: ListingType): Promise<ListingMeritScore | null> {
    const row = await this.db('listing_merit_scores')
      .where({ listing_id: listingId, listing_type: listingType })
      .first();
    return row ? (row as ListingMeritScore) : null;
  }

  async findListingsByProvider(providerId: string): Promise<ListingMeritScore[]> {
    return this.db('listing_merit_scores')
      .where({ provider_id: providerId })
      .orderBy('final_listing_score', 'desc') as unknown as ListingMeritScore[];
  }

  // ── Signal events ───────────────────────────────────────────────────────────

  async appendSignalEvent(event: Omit<SignalEvent, 'id' | 'created_at'>): Promise<SignalEvent> {
    const [row] = await this.db('merit_signal_events')
      .insert({ ...event, created_at: new Date() })
      .returning('*');
    return row as SignalEvent;
  }

  async findRecentSignalEvents(providerId: string, sinceDate: Date): Promise<SignalEvent[]> {
    return this.db('merit_signal_events')
      .where({ provider_id: providerId })
      .where('occurred_at', '>=', sinceDate)
      .orderBy('occurred_at', 'desc') as unknown as SignalEvent[];
  }

  // ── Discovery feed ──────────────────────────────────────────────────────────

  async fetchMeritSlots(listingType: ListingType, limit: number): Promise<ListingMeritScore[]> {
    return this.db('listing_merit_scores')
      .where({ listing_type: listingType, discovery_slot_type: 'MERIT' })
      .orderBy('final_listing_score', 'desc')
      .limit(limit) as unknown as ListingMeritScore[];
  }

  async fetchBoostSlots(listingType: ListingType, limit: number): Promise<ListingMeritScore[]> {
    return this.db('listing_merit_scores')
      .where({ listing_type: listingType, discovery_slot_type: 'BOOST' })
      .orderBy('active_boost_halalas', 'desc')
      .orderBy('final_listing_score', 'desc')
      .limit(limit) as unknown as ListingMeritScore[];
  }

  async fetchStrategicSlots(listingType: ListingType, limit: number): Promise<ListingMeritScore[]> {
    return this.db('listing_merit_scores')
      .where({ listing_type: listingType, discovery_slot_type: 'STRATEGIC' })
      .orderBy('final_listing_score', 'desc')
      .limit(limit) as unknown as ListingMeritScore[];
  }

  // ── Signal data sources ─────────────────────────────────────────────────────

  async getProviderReviewStats(providerId: string): Promise<{ avg_rating: number; review_count: number }> {
    const result = await this.db('booking_reviews')
      .where({ provider_id: providerId, status: 'PUBLISHED' })
      .select(
        this.db.raw('AVG(rating::numeric / 5.0) AS avg_rating'),
        this.db.raw('COUNT(*) AS review_count'),
      )
      .first();

    const count = parseInt(result?.review_count ?? '0', 10);
    if (count === 0) return { avg_rating: 0.5, review_count: 0 };

    return {
      avg_rating: parseFloat(result?.avg_rating ?? '0.5'),
      review_count: count,
    };
  }

  async getProviderReliabilityStats(providerId: string): Promise<{ completion_rate: number; total_bookings: number }> {
    const result = await this.db('bookings')
      .where({ provider_id: providerId })
      .whereIn('status', ['CONFIRMED', 'CANCELLED_BY_SEEKER', 'CANCELLED_BY_PROVIDER', 'REFUND_REQUESTED', 'REFUNDED'])
      .select(
        this.db.raw(`COUNT(*) FILTER (WHERE status = 'CONFIRMED') AS completed_count`),
        this.db.raw(`COUNT(*) AS total_count`),
      )
      .first();

    const completed = parseInt(result?.completed_count ?? '0', 10);
    const total = parseInt(result?.total_count ?? '0', 10);

    if (total === 0) return { completion_rate: 0.5, total_bookings: 0 };

    return { completion_rate: completed / total, total_bookings: total };
  }

  async getProviderBlogPostCount(providerId: string): Promise<number> {
    const result = await this.db('blog_posts')
      .where({ provider_id: providerId, status: 'PUBLISHED' })
      .count('id as count')
      .first();
    return parseInt(result?.count as string ?? '0', 10);
  }

  async getProviderActivityStats(providerId: string): Promise<{ active_listing_count: number; recent_booking_count: number }> {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    const [courseCount, tripCount, productCount, recentBookings] = await Promise.all([
      this.db('courses').where({ provider_id: providerId, status: 'PUBLISHED' }).count('id as count').first(),
      this.db('trips').where({ provider_id: providerId, status: 'PUBLISHED' }).count('id as count').first(),
      this.db('products').where({ provider_id: providerId, status: 'PUBLISHED' }).count('id as count').first(),
      this.db('bookings')
        .where({ provider_id: providerId })
        .where('created_at', '>=', ninetyDaysAgo)
        .count('id as count')
        .first(),
    ]);

    return {
      active_listing_count:
        parseInt(courseCount?.count as string ?? '0', 10) +
        parseInt(tripCount?.count as string ?? '0', 10) +
        parseInt(productCount?.count as string ?? '0', 10),
      recent_booking_count: parseInt(recentBookings?.count as string ?? '0', 10),
    };
  }

  async findPublishedListingIds(providerId: string): Promise<{
    courses: string[];
    trips: string[];
    products: string[];
  }> {
    const [courses, trips, products] = await Promise.all([
      this.db('courses').where({ provider_id: providerId, status: 'PUBLISHED' }).select('id'),
      this.db('trips').where({ provider_id: providerId, status: 'PUBLISHED' }).select('id'),
      this.db('products').where({ provider_id: providerId, status: 'PUBLISHED' }).select('id'),
    ]);
    return {
      courses: courses.map((r: { id: string }) => r.id),
      trips: trips.map((r: { id: string }) => r.id),
      products: products.map((r: { id: string }) => r.id),
    };
  }

  // Signal 1 & 4: activation state + restriction history
  async getProviderComplianceState(providerId: string): Promise<{
    activation_status: string;
    has_restriction_history: boolean;
  }> {
    const provider = await this.db('providers').where({ id: providerId }).first();
    return {
      activation_status: provider?.activation_status ?? 'NOT_STARTED',
      has_restriction_history: provider?.has_restriction_history ?? false,
    };
  }

  // Signal 5: taxonomy richness — normalized count of unique tags across all provider listings
  async getProviderTaxonomyRichness(providerId: string): Promise<number> {
    const result = await this.db.raw(`
      SELECT COUNT(DISTINCT t.tag_id) AS tag_count
      FROM (
        SELECT tag_id FROM course_tags ct
        JOIN courses c ON c.id = ct.course_id AND c.provider_id = :providerId
        UNION ALL
        SELECT tag_id FROM trip_tags tt
        JOIN trips tr ON tr.id = tt.trip_id AND tr.provider_id = :providerId
        UNION ALL
        SELECT tag_id FROM product_tags pt
        JOIN products p ON p.id = pt.product_id AND p.provider_id = :providerId
      ) t
    `, { providerId });

    const tagCount = parseInt(result.rows[0]?.tag_count ?? '0', 10);
    // Normalize: 10+ unique tags = 1.0; 0 tags = 0.0
    return Math.min(1.0, tagCount / 10);
  }

  // Signal 8 (provider level): total daily budget of all active boost campaigns for a provider
  async getProviderActiveDailyBoostHalalas(providerId: string): Promise<number> {
    const result = await this.db('boost_campaigns')
      .where({ provider_id: providerId, status: 'ACTIVE' })
      .sum('daily_budget_halalas as total')
      .first();
    return Number(result?.total ?? 0);
  }

  // Signal 8 (listing level): total active boost halalas for a specific listing
  async getListingActiveBoostHalalas(listingId: string): Promise<bigint> {
    const result = await this.db('boost_campaigns')
      .where({ listing_id: listingId, status: 'ACTIVE' })
      .sum('daily_budget_halalas as total')
      .first();
    return BigInt(Math.round(Number(result?.total ?? 0)));
  }

  // Strategic override check — used by merit.service.ts for slot type assignment
  // Fail-open: returns false if table doesn't exist (dev/staging without migration 012)
  async hasStrategicOverride(listingId: string): Promise<boolean> {
    return this.db('listing_merit_overrides')
      .where({ listing_id: listingId, override_type: 'STRATEGIC', is_active: true })
      .where('expires_at', '>', new Date())
      .first()
      .then((row: unknown) => !!row)
      .catch(() => false);
  }
}
