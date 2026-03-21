import { MeritRepository } from './merit.repository';

// ── Locked constants — DO NOT REOPEN ──────────────────────────────────────────
//
// Signal weights — structurally enforce: signals 1–4 cannot be outweighed by 5–8
//   Heavy signals (1–4): 0.20 each → 80% of composite
//   Medium signal (5):   0.10       → 10%
//   Light signals (6–7): 0.03 each  → 6%
//   Boost cap (8):       0.04 max   → 4% ceiling
//   Total max = 1.00
//
// With this distribution: max score from signals 5–8 alone = 0.20
// A provider with perfect signals 1–4 (1.0 each) has 0.80 base — cannot be overtaken.
//
const SIGNAL_WEIGHTS = {
  sig1: 0.20, // Verification & Compliance — Heavy
  sig2: 0.20, // Review Quality — Heavy
  sig3: 0.20, // Operational Reliability — Heavy
  sig4: 0.20, // Trust Standing — Heavy
  sig5: 0.10, // Relevance — Medium
  sig6: 0.03, // Blog — Light
  sig7: 0.03, // Activity — Light
  sig8_cap: 0.04, // Boost — Capped (max contribution regardless of raw value)
} as const;

// Module-load assertion — fails at startup if weight distribution violates the locked 80/20 rule.
{
  const heavySum = SIGNAL_WEIGHTS.sig1 + SIGNAL_WEIGHTS.sig2 + SIGNAL_WEIGHTS.sig3 + SIGNAL_WEIGHTS.sig4;
  const lightSum = SIGNAL_WEIGHTS.sig5 + SIGNAL_WEIGHTS.sig6 + SIGNAL_WEIGHTS.sig7 + SIGNAL_WEIGHTS.sig8_cap;
  if (Math.abs(heavySum - 0.80) > 0.001 || Math.abs(heavySum + lightSum - 1.00) > 0.001) {
    throw new Error(
      `MERIT_ENGINE_INVARIANT: Signal weight distribution violates locked 80/20 rule. ` +
      `Heavy=${heavySum.toFixed(4)}, Total=${(heavySum + lightSum).toFixed(4)}`,
    );
  }
}

// Listing score ceiling: listing_score ≤ provider_composite × 1.25 (LOCKED)
const LISTING_SCORE_UPLIFT_MAX = 1.25;

// Tier thresholds (ascending composite score)
const TIER_THRESHOLDS = {
  PREMIER: 0.80,
  ESTABLISHED: 0.60,
  RISING: 0.40,
  // STANDARD: < 0.40
} as const;

// Discovery allocation — 60/25/15 (LOCKED)
export const DISCOVERY_ALLOCATION = {
  MERIT: 0.60,
  BOOST: 0.25,
  STRATEGIC: 0.15,
} as const;

// ── Types ─────────────────────────────────────────────────────────────────────

export type MeritTier = 'STANDARD' | 'RISING' | 'ESTABLISHED' | 'PREMIER';
export type ListingType = 'COURSE' | 'TRIP' | 'PRODUCT';
export type DiscoverySlotType = 'MERIT' | 'BOOST' | 'STRATEGIC';

export interface ProviderMeritProfile {
  id: string;
  provider_id: string;
  signal_1_score: number;
  signal_2_score: number;
  signal_3_score: number;
  signal_4_score: number;
  signal_5_score: number;
  signal_6_score: number;
  signal_7_score: number;
  signal_8_raw: number;
  composite_score: number;
  tier: MeritTier;
  last_computed_at: Date;
  created_at: Date;
  updated_at: Date;
}

export interface ListingMeritScore {
  id: string;
  listing_id: string;
  listing_type: ListingType;
  provider_id: string;
  provider_composite_snapshot: number;
  provider_tier_snapshot: MeritTier;
  raw_listing_score: number;
  final_listing_score: number;
  listing_tier: MeritTier;
  active_boost_halalas: bigint;
  discovery_slot_type: DiscoverySlotType;
  last_computed_at: Date;
  created_at: Date;
  updated_at: Date;
}

export interface SignalEvent {
  id: string;
  provider_id: string;
  signal_number: number; // 1–8
  event_type: string;
  value_delta: number | null;
  occurred_at: Date;
  metadata: Record<string, unknown>;
  created_at: Date;
}

export interface DiscoveryFeed {
  listing_type: ListingType;
  total_slots: number;
  merit_slots: ListingMeritScore[];   // 60%
  boost_slots: ListingMeritScore[];   // 25%
  strategic_slots: ListingMeritScore[]; // 15%
  allocation: typeof DISCOVERY_ALLOCATION;
}

// ── Service ───────────────────────────────────────────────────────────────────

export class MeritEngineService {
  constructor(private readonly repo: MeritRepository) {}

  // Compute and persist the full provider merit profile (all 8 signals + composite + tier)
  async computeAndPersistProviderComposite(providerId: string): Promise<ProviderMeritProfile> {
    const [
      complianceState,
      reviewStats,
      reliabilityStats,
      blogCount,
      activityStats,
      taxonomyRichness,
    ] = await Promise.all([
      this.repo.getProviderComplianceState(providerId),
      this.repo.getProviderReviewStats(providerId),
      this.repo.getProviderReliabilityStats(providerId),
      this.repo.getProviderBlogPostCount(providerId),
      this.repo.getProviderActivityStats(providerId),
      this.repo.getProviderTaxonomyRichness(providerId),
    ]);

    // ── Signal 1: Verification & Compliance ───────────────────────────────────
    const sig1 = this.computeSignal1(complianceState.activation_status);

    // ── Signal 2: Review Quality ───────────────────────────────────────────────
    // Normalized from 0–5 rating scale. Review count modulates confidence.
    const sig2 = this.computeSignal2(reviewStats.avg_rating, reviewStats.review_count);

    // ── Signal 3: Operational Reliability ─────────────────────────────────────
    const sig3 = this.computeSignal3(reliabilityStats.completion_rate, reliabilityStats.total_bookings);

    // ── Signal 4: Trust Standing ───────────────────────────────────────────────
    const sig4 = this.computeSignal4(complianceState.activation_status, complianceState.has_restriction_history);

    // ── Signal 5: Relevance ────────────────────────────────────────────────────
    const sig5 = taxonomyRichness; // already normalized 0–1

    // ── Signal 6: Blog ─────────────────────────────────────────────────────────
    const sig6 = this.computeSignal6(blogCount);

    // ── Signal 7: Activity ─────────────────────────────────────────────────────
    const sig7 = this.computeSignal7(activityStats.active_listing_count, activityStats.recent_booking_count);

    // ── Signal 8: Boost (raw — capped in composite formula) ───────────────────
    // Phase K: reads active daily boost spend from boost_campaigns (Marketing module).
    // Normalization: 1,000,000 halalas/day (10,000 SAR/day) = 1.0 raw signal.
    // Cap of 0.04 is enforced in the composite formula (SIGNAL_WEIGHTS.sig8_cap) — LOCKED.
    const activeBoostHalalas = await this.repo.getProviderActiveDailyBoostHalalas(providerId);
    const sig8Raw = Math.min(1.0, activeBoostHalalas / 1_000_000);

    // ── Composite score ────────────────────────────────────────────────────────
    // Weight distribution enforces locked rule: signals 1–4 cannot be outweighed by 5–8
    const composite = clamp(
      sig1 * SIGNAL_WEIGHTS.sig1 +
      sig2 * SIGNAL_WEIGHTS.sig2 +
      sig3 * SIGNAL_WEIGHTS.sig3 +
      sig4 * SIGNAL_WEIGHTS.sig4 +
      sig5 * SIGNAL_WEIGHTS.sig5 +
      sig6 * SIGNAL_WEIGHTS.sig6 +
      sig7 * SIGNAL_WEIGHTS.sig7 +
      Math.min(sig8Raw, 1.0) * SIGNAL_WEIGHTS.sig8_cap,
      0, 1,
    );

    const tier = this.assignTier(composite);

    return this.repo.upsertProviderProfile({
      provider_id: providerId,
      signal_1_score: round4(sig1),
      signal_2_score: round4(sig2),
      signal_3_score: round4(sig3),
      signal_4_score: round4(sig4),
      signal_5_score: round4(sig5),
      signal_6_score: round4(sig6),
      signal_7_score: round4(sig7),
      signal_8_raw: round4(sig8Raw),
      composite_score: round4(composite),
      tier,
      last_computed_at: new Date(),
    });
  }

  // Compute and persist listing merit score for a single listing
  async computeAndPersistListingScore(
    listingId: string,
    listingType: ListingType,
    providerId: string,
  ): Promise<ListingMeritScore> {
    // Ensure provider composite is current
    const providerProfile = await this.getOrComputeProviderProfile(providerId);

    // Listing score: taxonomy and relevance factor on top of provider composite
    // In Phase H: listing raw score = provider composite (listing-level signals feed Phase I/J)
    const rawListingScore = providerProfile.composite_score;

    // Apply ceiling: final ≤ provider_composite × 1.25 (LOCKED)
    const ceiling = clamp(providerProfile.composite_score * LISTING_SCORE_UPLIFT_MAX, 0, 1);
    const finalListingScore = clamp(rawListingScore, 0, ceiling);

    // Listing tier cannot exceed provider tier (hard tier boundary — LOCKED)
    const rawListingTier = this.assignTier(finalListingScore);
    const listingTier = this.enforceHardTierBoundary(rawListingTier, providerProfile.tier);

    // Phase K: Slot type assignment
    // BOOST: listing has active boost campaign spend > 0
    // STRATEGIC: ops-set override (stored on listing record; Phase K reads it)
    // MERIT: default — no boost, no strategic override
    const activeBoostHalalas = await this.repo.getListingActiveBoostHalalas(listingId);

    // Strategic override: ops can flag a listing for strategic slot via listing_merit_overrides table
    // Fail-open: repo method returns false if table doesn't exist (dev without migration 012)
    const hasStrategicOverride = await this.repo.hasStrategicOverride(listingId);

    const discoverySlotType: DiscoverySlotType =
      hasStrategicOverride ? 'STRATEGIC' :
      activeBoostHalalas > BigInt(0) ? 'BOOST' :
      'MERIT';

    return this.repo.upsertListingScore({
      listing_id: listingId,
      listing_type: listingType,
      provider_id: providerId,
      provider_composite_snapshot: round4(providerProfile.composite_score),
      provider_tier_snapshot: providerProfile.tier,
      raw_listing_score: round4(rawListingScore),
      final_listing_score: round4(finalListingScore),
      listing_tier: listingTier,
      active_boost_halalas: activeBoostHalalas,
      discovery_slot_type: discoverySlotType,
      last_computed_at: new Date(),
    });
  }

  // Build discovery feed with 60/25/15 allocation (LOCKED)
  async buildDiscoveryFeed(listingType: ListingType, totalSlots: number): Promise<DiscoveryFeed> {
    const meritCount = Math.round(totalSlots * DISCOVERY_ALLOCATION.MERIT);
    const boostCount = Math.round(totalSlots * DISCOVERY_ALLOCATION.BOOST);
    const strategicCount = totalSlots - meritCount - boostCount; // absorb rounding remainder

    const [merit_slots, boost_slots, strategic_slots] = await Promise.all([
      this.repo.fetchMeritSlots(listingType, meritCount),
      this.repo.fetchBoostSlots(listingType, boostCount),
      this.repo.fetchStrategicSlots(listingType, strategicCount),
    ]);

    return {
      listing_type: listingType,
      total_slots: totalSlots,
      merit_slots,
      boost_slots,
      strategic_slots,
      allocation: DISCOVERY_ALLOCATION,
    };
  }

  // Refresh all listing scores for a provider (called after provider profile recomputation)
  async refreshProviderListings(providerId: string): Promise<void> {
    const { courses, trips, products } = await this.repo.findPublishedListingIds(providerId);

    await Promise.all([
      ...courses.map((id) => this.computeAndPersistListingScore(id, 'COURSE', providerId)),
      ...trips.map((id) => this.computeAndPersistListingScore(id, 'TRIP', providerId)),
      ...products.map((id) => this.computeAndPersistListingScore(id, 'PRODUCT', providerId)),
    ]);
  }

  // Full provider refresh: composite + all listings
  async refreshProvider(providerId: string): Promise<ProviderMeritProfile> {
    const profile = await this.computeAndPersistProviderComposite(providerId);
    await this.refreshProviderListings(providerId);
    return profile;
  }

  // Record a signal event and trigger provider refresh
  async recordSignalEventAndRefresh(event: {
    providerId: string;
    signalNumber: number;
    eventType: string;
    valueDelta?: number;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.repo.appendSignalEvent({
      provider_id: event.providerId,
      signal_number: event.signalNumber,
      event_type: event.eventType,
      value_delta: event.valueDelta ?? null,
      occurred_at: new Date(),
      metadata: event.metadata ?? {},
    });

    // Refresh scores after any signal event
    await this.refreshProvider(event.providerId);
  }

  async getProviderProfile(providerId: string): Promise<ProviderMeritProfile | null> {
    return this.repo.findProviderProfile(providerId);
  }

  async getListingScore(listingId: string, listingType: ListingType): Promise<ListingMeritScore | null> {
    return this.repo.findListingScore(listingId, listingType);
  }

  async listProviderListingScores(providerId: string): Promise<ListingMeritScore[]> {
    return this.repo.findListingsByProvider(providerId);
  }

  // ── Private signal computation helpers ────────────────────────────────────

  private computeSignal1(activationStatus: string): number {
    // Signal 1: Verification & Compliance
    // ACTIVATED = full score; RESTRICTED_ON_HOLD = 0; others = partial
    switch (activationStatus) {
      case 'ACTIVATED':         return 1.0;
      case 'APPROVED':          return 0.8; // approved but final gates incomplete
      case 'UNDER_REVIEW':      return 0.5;
      case 'SUBMITTED':         return 0.4;
      case 'IN_PROGRESS':       return 0.2;
      case 'NEEDS_REVISION':    return 0.1;
      case 'NOT_STARTED':       return 0.0;
      case 'RESTRICTED_ON_HOLD': return 0.0; // compliance breach — hard zero
      default:                  return 0.0;
    }
  }

  private computeSignal2(avgRating: number, reviewCount: number): number {
    // Signal 2: Review Quality
    // avgRating is 0.0–1.0 (pre-normalized by caller)
    // Low review count → dampen score toward neutral (0.5) — more reviews = more signal confidence
    if (reviewCount === 0) return 0.5; // no reviews = neutral (not zero — new provider protection)
    const confidence = Math.min(1.0, reviewCount / 20); // 20+ reviews = full confidence
    return avgRating * confidence + 0.5 * (1 - confidence);
  }

  private computeSignal3(completionRate: number, totalBookings: number): number {
    // Signal 3: Operational Reliability
    if (totalBookings === 0) return 0.5; // no bookings = neutral baseline for new providers
    const confidence = Math.min(1.0, totalBookings / 10); // 10+ bookings = full confidence
    return completionRate * confidence + 0.5 * (1 - confidence);
  }

  private computeSignal4(activationStatus: string, hasRestrictionHistory: boolean): number {
    // Signal 4: Trust Standing
    if (activationStatus === 'RESTRICTED_ON_HOLD') return 0.0;
    if (hasRestrictionHistory) return 0.5; // past restriction on record
    if (activationStatus === 'ACTIVATED') return 1.0;
    return 0.7; // active provider, no restrictions
  }

  private computeSignal6(publishedBlogCount: number): number {
    // Signal 6: Blog — normalized; 5+ published posts = full score
    return Math.min(1.0, publishedBlogCount / 5);
  }

  private computeSignal7(activeListingCount: number, recentBookingCount: number): number {
    // Signal 7: Activity — blend of listing count and recent booking volume
    const listingScore = Math.min(1.0, activeListingCount / 5);  // 5+ active listings = 1.0
    const bookingScore = Math.min(1.0, recentBookingCount / 20); // 20+ recent bookings = 1.0
    return (listingScore * 0.4) + (bookingScore * 0.6); // booking activity weighted higher
  }

  private assignTier(compositeScore: number): MeritTier {
    if (compositeScore >= TIER_THRESHOLDS.PREMIER)     return 'PREMIER';
    if (compositeScore >= TIER_THRESHOLDS.ESTABLISHED) return 'ESTABLISHED';
    if (compositeScore >= TIER_THRESHOLDS.RISING)      return 'RISING';
    return 'STANDARD';
  }

  // Hard tier boundary (LOCKED): listing tier cannot exceed provider tier
  private enforceHardTierBoundary(listingTier: MeritTier, providerTier: MeritTier): MeritTier {
    const tierOrder: MeritTier[] = ['STANDARD', 'RISING', 'ESTABLISHED', 'PREMIER'];
    const providerIdx = tierOrder.indexOf(providerTier);
    const listingIdx = tierOrder.indexOf(listingTier);
    return tierOrder[Math.min(listingIdx, providerIdx)];
  }

  private async getOrComputeProviderProfile(providerId: string): Promise<ProviderMeritProfile> {
    const existing = await this.repo.findProviderProfile(providerId);
    if (existing) return existing;
    return this.computeAndPersistProviderComposite(providerId);
  }
}

// ── Pure utility functions ────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}
