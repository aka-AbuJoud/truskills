import { Knex } from 'knex';

import { MeritEngineService, ListingType, DISCOVERY_ALLOCATION } from '../merit/merit.service';
import { BookingsService } from '../bookings/bookings.service';
import { CommunityService } from '../community/community.service';
import {
  CourseCard,
  TripCard,
  ProductCard,
  CourseDetailPublic,
  TripDetailPublic,
  ProductDetailPublic,
  ProviderPublicProfile,
  DiscoveryPage,
  SearchParams,
  SearchResult,
  SubmitReviewParams,
  ReviewRecord,
  ListingReviewSummary,
  ProviderCard,
} from './seeker.types';
import { MeritTier } from '../merit/merit.service';

export class SeekerService {
  constructor(
    private readonly db: Knex,
    private readonly meritService: MeritEngineService,
    private readonly bookingsService: BookingsService,
    private readonly communityService: CommunityService,
  ) {}

  // ── Discovery ───────────────────────────────────────────────────────────────

  // Build merit-ranked discovery page — 60/25/15 allocation enforced
  async buildDiscoveryPage(listingType: ListingType, totalSlots: number): Promise<DiscoveryPage> {
    const feed = await this.meritService.buildDiscoveryFeed(listingType, totalSlots);

    // Collect all listing IDs with their slot type
    const slotMap = new Map<string, string>(); // listingId → slotType
    for (const s of feed.merit_slots)    slotMap.set(s.listing_id, 'MERIT');
    for (const s of feed.boost_slots)    slotMap.set(s.listing_id, 'BOOST');
    for (const s of feed.strategic_slots) slotMap.set(s.listing_id, 'STRATEGIC');

    // Score lookup for enrichment
    const scoreMap = new Map<string, { score: number; tier: MeritTier }>();
    for (const s of [...feed.merit_slots, ...feed.boost_slots, ...feed.strategic_slots]) {
      scoreMap.set(s.listing_id, {
        score: Number(s.final_listing_score),
        tier: s.listing_tier,
      });
    }

    const allListingIds = [...slotMap.keys()];
    let results: (CourseCard | TripCard | ProductCard)[] = [];

    if (listingType === 'COURSE') {
      results = await this.enrichCourseCards(allListingIds, slotMap, scoreMap);
    } else if (listingType === 'TRIP') {
      results = await this.enrichTripCards(allListingIds, slotMap, scoreMap);
    } else {
      results = await this.enrichProductCards(allListingIds, slotMap, scoreMap);
    }

    // Preserve slot order: MERIT first, BOOST second, STRATEGIC third
    const slotOrder = { MERIT: 0, BOOST: 1, STRATEGIC: 2 };
    results.sort((a, b) => {
      const slotDiff = slotOrder[a.discovery_slot_type as keyof typeof slotOrder] -
                       slotOrder[b.discovery_slot_type as keyof typeof slotOrder];
      if (slotDiff !== 0) return slotDiff;
      return b.merit_score - a.merit_score; // within-slot: score descending
    });

    return {
      listing_type: listingType,
      total_slots: totalSlots,
      results,
      allocation: DISCOVERY_ALLOCATION,
    };
  }

  // Text search across listing types — ILIKE for Phase I (Phase K: upgrade to FTS)
  async searchListings(params: SearchParams): Promise<SearchResult> {
    const { query, listingTypes = ['COURSE', 'TRIP', 'PRODUCT'], limit = 20, offset = 0 } = params;
    const pattern = query ? `%${query}%` : '%';

    const [courses, trips, products] = await Promise.all([
      listingTypes.includes('COURSE')
        ? this.searchCourses(pattern, params, Math.ceil(limit / listingTypes.length), offset)
        : [],
      listingTypes.includes('TRIP')
        ? this.searchTrips(pattern, params, Math.ceil(limit / listingTypes.length), offset)
        : [],
      listingTypes.includes('PRODUCT')
        ? this.searchProducts(pattern, params, Math.ceil(limit / listingTypes.length), offset)
        : [],
    ]);

    return {
      query: query ?? null,
      courses,
      trips,
      products,
      total_count: courses.length + trips.length + products.length,
    };
  }

  // ── Listing detail pages ────────────────────────────────────────────────────

  async getCourseDetail(courseId: string): Promise<CourseDetailPublic | null> {
    const course = await this.db('courses').where({ id: courseId, status: 'PUBLISHED' }).first();
    if (!course) return null;

    const [provider, meritScore, reviews, sessions, hybridComponents] = await Promise.all([
      this.getProviderCard(course.provider_id),
      this.meritService.getListingScore(courseId, 'COURSE'),
      this.getListingReviewSummary(courseId, 'COURSE'),
      ['IN_PERSON', 'ONLINE_LIVE', 'HYBRID'].includes(course.delivery_channel)
        ? this.getCourseSessionsPublic(courseId)
        : Promise.resolve(undefined),
      course.delivery_channel === 'HYBRID'
        ? this.getHybridComponentsPublic(courseId)
        : Promise.resolve(undefined),
    ]);

    return {
      id: course.id,
      title: course.title,
      description: course.description ?? '',
      delivery_channel: course.delivery_channel,
      skill_level: course.skill_level ?? null,
      language: course.language ?? null,
      city: course.city ?? null,
      district: course.district ?? null,
      // exact_address_encrypted: NEVER exposed here — locked rule enforced
      // meeting_link_encrypted: NEVER exposed here — locked rule enforced
      price_halalas: Number(course.price_halalas ?? 0),
      currency: course.currency ?? 'SAR',
      is_free: course.is_free ?? false,
      cancellation_policy: course.cancellation_policy ?? null,
      certificate_availability: course.certificate_availability ?? false,
      has_cover_image: !!course.cover_image_reference,
      has_intro_video: !!course.intro_video_reference,
      status: course.status,
      provider: provider ?? { id: course.provider_id, display_name: '', provider_type: 'INSTRUCTOR', merit_tier: 'STANDARD' },
      merit_tier: meritScore?.listing_tier ?? 'STANDARD',
      merit_score: Number(meritScore?.final_listing_score ?? 0),
      reviews,
      ...(sessions !== undefined && { sessions }),
      ...(course.delivery_channel === 'SELF_PACED' && { access_window_days: course.access_window_days }),
      ...(hybridComponents !== undefined && { hybrid_components: hybridComponents }),
    };
  }

  async getTripDetail(tripId: string): Promise<TripDetailPublic | null> {
    const trip = await this.db('trips').where({ id: tripId, status: 'PUBLISHED' }).first();
    if (!trip) return null;

    const [provider, meritScore, reviews, sessions] = await Promise.all([
      this.getProviderCard(trip.provider_id),
      this.meritService.getListingScore(tripId, 'TRIP'),
      this.getListingReviewSummary(tripId, 'TRIP'),
      this.getTripSessionsPublic(tripId),
    ]);

    return {
      id: trip.id,
      title: trip.title,
      description: trip.description ?? '',
      city: trip.city ?? null,
      district: trip.district ?? null,
      // meeting_point_encrypted: NEVER exposed here — locked rule enforced
      price_halalas: Number(trip.price_halalas ?? 0),
      currency: trip.currency ?? 'SAR',
      is_free: trip.is_free ?? false,
      duration_days: trip.duration_days ?? null,
      min_group_size: trip.min_group_size ?? null,
      max_group_size: trip.max_group_size ?? null,
      cancellation_policy: trip.cancellation_policy ?? null,
      has_cover_image: !!trip.cover_image_reference,
      status: trip.status,
      provider: provider ?? { id: trip.provider_id, display_name: '', provider_type: 'INSTRUCTOR', merit_tier: 'STANDARD' },
      merit_tier: meritScore?.listing_tier ?? 'STANDARD',
      merit_score: Number(meritScore?.final_listing_score ?? 0),
      reviews,
      sessions,
    };
  }

  async getProductDetail(productId: string): Promise<ProductDetailPublic | null> {
    const product = await this.db('products').where({ id: productId, status: 'PUBLISHED' }).first();
    if (!product) return null;

    const [provider, meritScore, reviews, variants] = await Promise.all([
      this.getProviderCard(product.provider_id),
      this.meritService.getListingScore(productId, 'PRODUCT'),
      this.getListingReviewSummary(productId, 'PRODUCT'),
      this.getProductVariantsPublic(productId),
    ]);

    return {
      id: product.id,
      title: product.title,
      description: product.description ?? '',
      product_type: product.product_type,
      price_halalas: Number(product.price_halalas ?? 0),
      currency: product.currency ?? 'SAR',
      is_free: product.is_free ?? false,
      shipping_required: product.shipping_required ?? false,
      has_cover_image: !!product.cover_image_reference,
      status: product.status,
      provider: provider ?? { id: product.provider_id, display_name: '', provider_type: 'INSTRUCTOR', merit_tier: 'STANDARD' },
      merit_tier: meritScore?.listing_tier ?? 'STANDARD',
      merit_score: Number(meritScore?.final_listing_score ?? 0),
      reviews,
      variants,
    };
  }

  async getProviderPublicProfile(providerId: string): Promise<ProviderPublicProfile | null> {
    const provider = await this.db('providers').where({ id: providerId, activation_status: 'ACTIVATED' }).first();
    if (!provider) return null;

    const [meritProfile, reviews, counts] = await Promise.all([
      this.meritService.getProviderProfile(providerId),
      this.getProviderReviewSummary(providerId),
      this.getProviderListingCounts(providerId),
    ]);

    return {
      id: provider.id,
      display_name: provider.display_name ?? provider.name ?? '',
      provider_type: provider.provider_type,
      bio: provider.bio ?? null,
      city: provider.city ?? null,
      merit_tier: meritProfile?.tier ?? 'STANDARD',
      merit_score: Number(meritProfile?.composite_score ?? 0),
      reviews,
      active_course_count: counts.courses,
      active_trip_count: counts.trips,
      active_product_count: counts.products,
    };
  }

  // ── Reviews ─────────────────────────────────────────────────────────────────

  async submitReview(params: SubmitReviewParams): Promise<ReviewRecord> {
    const { bookingId, seekerId, providerId, listingId, listingType, rating, reviewText } = params;

    if (rating < 1 || rating > 5) throw new Error('INVALID_RATING: Rating must be between 1 and 5');

    // Verify booking belongs to seeker and is in a reviewable state
    const booking = await this.db('bookings')
      .where({ id: bookingId, seeker_id: seekerId, provider_id: providerId })
      .whereIn('status', ['CONFIRMED'])
      .first();

    if (!booking) throw new Error('INVALID_BOOKING: Booking not found or not eligible for review');

    // Check for existing review (unique constraint is the DB-level guard; this is the fast path)
    const existing = await this.db('booking_reviews').where({ booking_id: bookingId }).first();
    if (existing) throw new Error('DUPLICATE_REVIEW: A review for this booking already exists');

    const now = new Date();
    const [review] = await this.db('booking_reviews')
      .insert({
        booking_id: bookingId,
        seeker_id: seekerId,
        provider_id: providerId,
        listing_id: listingId,
        listing_type: listingType,
        rating,
        review_text: reviewText ?? null,
        status: 'PUBLISHED',
        published_at: now,
      })
      .returning('*');

    // Trigger Merit Engine Signal 2 refresh for the provider
    // Fire-and-forget: review is already persisted; score refresh is async
    this.meritService
      .recordSignalEventAndRefresh({
        providerId,
        signalNumber: 2,
        eventType: 'REVIEW_RECEIVED',
        valueDelta: rating / 5,
        metadata: { booking_id: bookingId, rating },
      })
      .catch((err) => {
        // Log but do not fail the review submission — merit refresh is eventual
        console.error('[MERIT_SIGNAL_2] Review refresh failed:', err);
      });

    return review as ReviewRecord;
  }

  // Ops: remove a review for policy violation
  async removeReview(reviewId: string, removedBy: string, reason?: string): Promise<ReviewRecord> {
    const [review] = await this.db('booking_reviews')
      .where({ id: reviewId })
      .update({ status: 'REMOVED', removed_at: new Date(), removed_by: removedBy, removal_reason: reason ?? null, updated_at: new Date() })
      .returning('*');
    if (!review) throw new Error('NOT_FOUND: Review not found');
    return review as ReviewRecord;
  }

  async getListingReviews(
    listingId: string,
    listingType: 'COURSE' | 'TRIP' | 'PRODUCT',
    params: { limit?: number; offset?: number } = {},
  ): Promise<ReviewRecord[]> {
    return this.db('booking_reviews')
      .where({ listing_id: listingId, listing_type: listingType, status: 'PUBLISHED' })
      .orderBy('published_at', 'desc')
      .limit(params.limit ?? 20)
      .offset(params.offset ?? 0) as unknown as ReviewRecord[];
  }

  // ── Account views ───────────────────────────────────────────────────────────

  async getSeekerBookings(seekerId: string): Promise<unknown[]> {
    return this.db('bookings')
      .where({ seeker_id: seekerId })
      .orderBy('created_at', 'desc')
      .select('id', 'service_type', 'status', 'quantity', 'total_price_halalas', 'currency', 'created_at');
  }

  async getSeekerEnrollments(seekerId: string): Promise<unknown[]> {
    return this.db('bookings as b')
      .join('course_enrollment_details as e', 'e.booking_id', 'b.id')
      .join('courses as c', 'c.id', 'b.course_id')
      .where({ 'b.seeker_id': seekerId, 'b.status': 'CONFIRMED' })
      .select(
        'b.id as booking_id',
        'c.id as course_id',
        'c.title as course_title',
        'c.delivery_channel',
        'e.completion_status',
        'e.access_window_starts_at',
        'e.access_window_ends_at',
      )
      .orderBy('b.created_at', 'desc');
  }

  // ── Private helpers — enrichment ────────────────────────────────────────────

  private async enrichCourseCards(
    courseIds: string[],
    slotMap: Map<string, string>,
    scoreMap: Map<string, { score: number; tier: MeritTier }>,
  ): Promise<CourseCard[]> {
    if (!courseIds.length) return [];

    const [courses, providerIds] = await Promise.all([
      this.db('courses').whereIn('id', courseIds).select(
        'id', 'title', 'description', 'delivery_channel', 'city', 'district',
        'price_halalas', 'currency', 'is_free', 'skill_level', 'language',
        'certificate_availability', 'cover_image_reference', 'provider_id',
      ),
      Promise.resolve([] as string[]),
    ]);

    const uniqueProviderIds = [...new Set(courses.map((c: any) => c.provider_id))];
    const providerCards = await this.getProviderCards(uniqueProviderIds);
    const providerMap = new Map(providerCards.map((p) => [p.id, p]));
    const reviewMap = await this.batchGetReviewSummaries(courseIds, 'COURSE');

    return courses.map((c: any): CourseCard => {
      const slot = slotMap.get(c.id) ?? 'MERIT';
      const score = scoreMap.get(c.id) ?? { score: 0, tier: 'STANDARD' as MeritTier };
      return {
        id: c.id,
        title: c.title,
        excerpt: c.description?.slice(0, 200) ?? null,
        delivery_channel: c.delivery_channel,
        provider: providerMap.get(c.provider_id) ?? { id: c.provider_id, display_name: '', provider_type: 'INSTRUCTOR', merit_tier: 'STANDARD' },
        city: c.city ?? null,
        district: c.district ?? null,
        price_halalas: Number(c.price_halalas ?? 0),
        currency: c.currency ?? 'SAR',
        is_free: c.is_free ?? false,
        has_cover_image: !!c.cover_image_reference,
        skill_level: c.skill_level ?? null,
        language: c.language ?? null,
        certificate_available: c.certificate_availability ?? false,
        merit_tier: score.tier,
        merit_score: score.score,
        reviews: reviewMap.get(c.id) ?? { avg_rating: null, review_count: 0 },
        discovery_slot_type: slot,
      };
    });
  }

  private async enrichTripCards(
    tripIds: string[],
    slotMap: Map<string, string>,
    scoreMap: Map<string, { score: number; tier: MeritTier }>,
  ): Promise<TripCard[]> {
    if (!tripIds.length) return [];

    const trips = await this.db('trips').whereIn('id', tripIds).select(
      'id', 'title', 'description', 'city', 'district', 'price_halalas', 'currency',
      'is_free', 'duration_days', 'min_group_size', 'max_group_size',
      'cover_image_reference', 'provider_id',
    );

    const uniqueProviderIds = [...new Set(trips.map((t: any) => t.provider_id))];
    const providerCards = await this.getProviderCards(uniqueProviderIds);
    const providerMap = new Map(providerCards.map((p) => [p.id, p]));
    const reviewMap = await this.batchGetReviewSummaries(tripIds, 'TRIP');

    return trips.map((t: any): TripCard => {
      const slot = slotMap.get(t.id) ?? 'MERIT';
      const score = scoreMap.get(t.id) ?? { score: 0, tier: 'STANDARD' as MeritTier };
      return {
        id: t.id,
        title: t.title,
        excerpt: t.description?.slice(0, 200) ?? null,
        provider: providerMap.get(t.provider_id) ?? { id: t.provider_id, display_name: '', provider_type: 'INSTRUCTOR', merit_tier: 'STANDARD' },
        city: t.city ?? null,
        district: t.district ?? null,
        price_halalas: Number(t.price_halalas ?? 0),
        currency: t.currency ?? 'SAR',
        is_free: t.is_free ?? false,
        has_cover_image: !!t.cover_image_reference,
        duration_days: t.duration_days ?? null,
        min_group_size: t.min_group_size ?? null,
        max_group_size: t.max_group_size ?? null,
        merit_tier: score.tier,
        merit_score: score.score,
        reviews: reviewMap.get(t.id) ?? { avg_rating: null, review_count: 0 },
        discovery_slot_type: slot,
      };
    });
  }

  private async enrichProductCards(
    productIds: string[],
    slotMap: Map<string, string>,
    scoreMap: Map<string, { score: number; tier: MeritTier }>,
  ): Promise<ProductCard[]> {
    if (!productIds.length) return [];

    const products = await this.db('products').whereIn('id', productIds).select(
      'id', 'title', 'description', 'product_type', 'price_halalas', 'currency',
      'is_free', 'cover_image_reference', 'provider_id',
    );

    const uniqueProviderIds = [...new Set(products.map((p: any) => p.provider_id))];
    const providerCards = await this.getProviderCards(uniqueProviderIds);
    const providerMap = new Map(providerCards.map((p) => [p.id, p]));
    const reviewMap = await this.batchGetReviewSummaries(productIds, 'PRODUCT');

    return products.map((p: any): ProductCard => {
      const slot = slotMap.get(p.id) ?? 'MERIT';
      const score = scoreMap.get(p.id) ?? { score: 0, tier: 'STANDARD' as MeritTier };
      return {
        id: p.id,
        title: p.title,
        excerpt: p.description?.slice(0, 200) ?? null,
        provider: providerMap.get(p.provider_id) ?? { id: p.provider_id, display_name: '', provider_type: 'INSTRUCTOR', merit_tier: 'STANDARD' },
        price_halalas: Number(p.price_halalas ?? 0),
        currency: p.currency ?? 'SAR',
        is_free: p.is_free ?? false,
        has_cover_image: !!p.cover_image_reference,
        product_type: p.product_type,
        merit_tier: score.tier,
        merit_score: score.score,
        reviews: reviewMap.get(p.id) ?? { avg_rating: null, review_count: 0 },
        discovery_slot_type: slot,
      };
    });
  }

  // ── Private helpers — search ─────────────────────────────────────────────────

  private async searchCourses(
    pattern: string,
    params: SearchParams,
    limit: number,
    offset: number,
  ): Promise<CourseCard[]> {
    let q = this.db('courses as c')
      .where({ 'c.status': 'PUBLISHED' })
      .andWhere((b) => b.whereILike('c.title', pattern).orWhereILike('c.description', pattern));

    if (params.categoryId) q = q.where('c.category_id', params.categoryId);
    if (params.subcategoryId) q = q.where('c.subcategory_id', params.subcategoryId);
    if (params.isFree !== undefined) q = q.where('c.is_free', params.isFree);
    if (params.minPriceHalalas !== undefined) q = q.where('c.price_halalas', '>=', params.minPriceHalalas);
    if (params.maxPriceHalalas !== undefined) q = q.where('c.price_halalas', '<=', params.maxPriceHalalas);

    const courses = await q.select('c.*').limit(limit).offset(offset);
    const ids = courses.map((c: any) => c.id);
    if (!ids.length) return [];

    const scoreResults = await this.db('listing_merit_scores')
      .whereIn('listing_id', ids)
      .where({ listing_type: 'COURSE' });
    const scoreMap = new Map(scoreResults.map((s: any) => [s.listing_id, { score: Number(s.final_listing_score), tier: s.listing_tier as MeritTier }]));
    const slotMap = new Map(scoreResults.map((s: any) => [s.listing_id, s.discovery_slot_type]));

    return this.enrichCourseCards(ids, slotMap, scoreMap);
  }

  private async searchTrips(pattern: string, params: SearchParams, limit: number, offset: number): Promise<TripCard[]> {
    let q = this.db('trips as t')
      .where({ 't.status': 'PUBLISHED' })
      .andWhere((b) => b.whereILike('t.title', pattern).orWhereILike('t.description', pattern));

    if (params.isFree !== undefined) q = q.where('t.is_free', params.isFree);

    const trips = await q.select('t.*').limit(limit).offset(offset);
    const ids = trips.map((t: any) => t.id);
    if (!ids.length) return [];

    const scoreResults = await this.db('listing_merit_scores').whereIn('listing_id', ids).where({ listing_type: 'TRIP' });
    const scoreMap = new Map(scoreResults.map((s: any) => [s.listing_id, { score: Number(s.final_listing_score), tier: s.listing_tier as MeritTier }]));
    const slotMap = new Map(scoreResults.map((s: any) => [s.listing_id, s.discovery_slot_type]));

    return this.enrichTripCards(ids, slotMap, scoreMap);
  }

  private async searchProducts(pattern: string, params: SearchParams, limit: number, offset: number): Promise<ProductCard[]> {
    let q = this.db('products as p')
      .where({ 'p.status': 'PUBLISHED' })
      .andWhere((b) => b.whereILike('p.title', pattern).orWhereILike('p.description', pattern));

    if (params.isFree !== undefined) q = q.where('p.is_free', params.isFree);

    const products = await q.select('p.*').limit(limit).offset(offset);
    const ids = products.map((p: any) => p.id);
    if (!ids.length) return [];

    const scoreResults = await this.db('listing_merit_scores').whereIn('listing_id', ids).where({ listing_type: 'PRODUCT' });
    const scoreMap = new Map(scoreResults.map((s: any) => [s.listing_id, { score: Number(s.final_listing_score), tier: s.listing_tier as MeritTier }]));
    const slotMap = new Map(scoreResults.map((s: any) => [s.listing_id, s.discovery_slot_type]));

    return this.enrichProductCards(ids, slotMap, scoreMap);
  }

  // ── Private helpers — data fetching ─────────────────────────────────────────

  private async getProviderCard(providerId: string): Promise<ProviderCard | null> {
    const provider = await this.db('providers').where({ id: providerId }).first();
    if (!provider) return null;
    const merit = await this.meritService.getProviderProfile(providerId);
    return {
      id: provider.id,
      display_name: provider.display_name ?? provider.name ?? '',
      provider_type: provider.provider_type,
      merit_tier: merit?.tier ?? 'STANDARD',
    };
  }

  private async getProviderCards(providerIds: string[]): Promise<ProviderCard[]> {
    if (!providerIds.length) return [];
    const providers = await this.db('providers').whereIn('id', providerIds);
    const meritProfiles = await this.db('provider_merit_profiles').whereIn('provider_id', providerIds);
    const meritMap = new Map(meritProfiles.map((m: any) => [m.provider_id, m]));

    return providers.map((p: any): ProviderCard => ({
      id: p.id,
      display_name: p.display_name ?? p.name ?? '',
      provider_type: p.provider_type,
      merit_tier: (meritMap.get(p.id)?.tier as MeritTier) ?? 'STANDARD',
    }));
  }

  private async getListingReviewSummary(listingId: string, listingType: string): Promise<ListingReviewSummary> {
    const result = await this.db('booking_reviews')
      .where({ listing_id: listingId, listing_type: listingType, status: 'PUBLISHED' })
      .select(this.db.raw('AVG(rating) AS avg_rating'), this.db.raw('COUNT(*) AS review_count'))
      .first();
    const count = parseInt(result?.review_count ?? '0', 10);
    return {
      avg_rating: count > 0 ? parseFloat(result?.avg_rating) : null,
      review_count: count,
    };
  }

  private async getProviderReviewSummary(providerId: string): Promise<ListingReviewSummary> {
    const result = await this.db('booking_reviews')
      .where({ provider_id: providerId, status: 'PUBLISHED' })
      .select(this.db.raw('AVG(rating) AS avg_rating'), this.db.raw('COUNT(*) AS review_count'))
      .first();
    const count = parseInt(result?.review_count ?? '0', 10);
    return {
      avg_rating: count > 0 ? parseFloat(result?.avg_rating) : null,
      review_count: count,
    };
  }

  private async batchGetReviewSummaries(
    listingIds: string[],
    listingType: string,
  ): Promise<Map<string, ListingReviewSummary>> {
    if (!listingIds.length) return new Map();

    const rows = await this.db('booking_reviews')
      .whereIn('listing_id', listingIds)
      .where({ listing_type: listingType, status: 'PUBLISHED' })
      .groupBy('listing_id')
      .select(
        'listing_id',
        this.db.raw('AVG(rating) AS avg_rating'),
        this.db.raw('COUNT(*) AS review_count'),
      );

    const map = new Map<string, ListingReviewSummary>();
    for (const row of rows) {
      const count = parseInt(row.review_count, 10);
      map.set(row.listing_id, {
        avg_rating: count > 0 ? parseFloat(row.avg_rating) : null,
        review_count: count,
      });
    }
    return map;
  }

  private async getCourseSessionsPublic(courseId: string) {
    return this.db('course_sessions')
      .where({ course_id: courseId, status: 'SCHEDULED' })
      .select('id', 'session_date', 'start_time', 'end_time', 'capacity_max', 'capacity_override_max', 'status')
      .orderBy('session_date', 'asc');
  }

  private async getHybridComponentsPublic(courseId: string) {
    return this.db('course_hybrid_components')
      .where({ course_id: courseId })
      .select('component_type', 'sequence_order', 'access_window_days')
      .orderBy('sequence_order', 'asc');
  }

  private async getTripSessionsPublic(tripId: string) {
    return this.db('trip_sessions')
      .where({ trip_id: tripId, status: 'SCHEDULED' })
      .select('id', 'start_date', 'end_date', 'capacity_max', 'status')
      .orderBy('start_date', 'asc');
  }

  private async getProductVariantsPublic(productId: string) {
    const variants = await this.db('product_variants')
      .where({ product_id: productId })
      .select('id', 'variant_name', 'price_override_halalas', 'inventory_count', 'sku');

    return variants.map((v: any) => ({
      id: v.id,
      variant_name: v.variant_name,
      price_override_halalas: v.price_override_halalas ? Number(v.price_override_halalas) : null,
      inventory_available: v.inventory_count === null || v.inventory_count > 0,
      sku: v.sku ?? null,
    }));
  }

  private async getProviderListingCounts(providerId: string) {
    const [courses, trips, products] = await Promise.all([
      this.db('courses').where({ provider_id: providerId, status: 'PUBLISHED' }).count('id as count').first(),
      this.db('trips').where({ provider_id: providerId, status: 'PUBLISHED' }).count('id as count').first(),
      this.db('products').where({ provider_id: providerId, status: 'PUBLISHED' }).count('id as count').first(),
    ]);
    return {
      courses: parseInt(courses?.count as string ?? '0', 10),
      trips: parseInt(trips?.count as string ?? '0', 10),
      products: parseInt(products?.count as string ?? '0', 10),
    };
  }
}
