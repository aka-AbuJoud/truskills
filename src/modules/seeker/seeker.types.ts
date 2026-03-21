// Public-facing types for Seeker Experience — Phase I
// These are read-only projections consumed from existing module data.
// No encrypted fields. No exact addresses. No meeting links.
// Location: city/district only pre-booking — locked rule enforced at projection layer.

import { MeritTier } from '../merit/merit.service';

// ── Listing cards (discovery feed / search results) ──────────────────────────

export interface ListingReviewSummary {
  avg_rating: number | null; // null = no reviews yet
  review_count: number;
}

export interface ProviderCard {
  id: string;
  display_name: string;
  provider_type: 'INSTRUCTOR' | 'CENTER';
  merit_tier: MeritTier;
}

export interface CourseCard {
  id: string;
  title: string;
  excerpt: string | null;
  delivery_channel: string;
  provider: ProviderCard;
  city: string | null;    // city/district only — no exact address
  district: string | null;
  price_halalas: number;
  currency: string;
  is_free: boolean;
  has_cover_image: boolean;
  skill_level: string | null;
  language: string | null;
  certificate_available: boolean;
  merit_tier: MeritTier;
  merit_score: number;
  reviews: ListingReviewSummary;
  discovery_slot_type: string; // MERIT | BOOST | STRATEGIC
}

export interface TripCard {
  id: string;
  title: string;
  excerpt: string | null;
  provider: ProviderCard;
  city: string | null;
  district: string | null;
  price_halalas: number;
  currency: string;
  is_free: boolean;
  has_cover_image: boolean;
  duration_days: number | null;
  min_group_size: number | null;
  max_group_size: number | null;
  merit_tier: MeritTier;
  merit_score: number;
  reviews: ListingReviewSummary;
  discovery_slot_type: string;
}

export interface ProductCard {
  id: string;
  title: string;
  excerpt: string | null;
  provider: ProviderCard;
  price_halalas: number;
  currency: string;
  is_free: boolean;
  has_cover_image: boolean;
  product_type: string;
  merit_tier: MeritTier;
  merit_score: number;
  reviews: ListingReviewSummary;
  discovery_slot_type: string;
}

// ── Discovery feed response ───────────────────────────────────────────────────

export interface DiscoveryPage {
  listing_type: 'COURSE' | 'TRIP' | 'PRODUCT';
  total_slots: number;
  results: (CourseCard | TripCard | ProductCard)[];
  allocation: { MERIT: number; BOOST: number; STRATEGIC: number };
}

// ── Listing detail pages ──────────────────────────────────────────────────────
// Full public detail — still no encrypted fields, no exact location pre-booking.

export interface CourseDetailPublic {
  id: string;
  title: string;
  description: string;
  delivery_channel: string;
  skill_level: string | null;
  language: string | null;
  city: string | null;
  district: string | null;
  // exact_address_encrypted: NEVER exposed here
  // meeting_link_encrypted: NEVER exposed here
  price_halalas: number;
  currency: string;
  is_free: boolean;
  cancellation_policy: string | null;
  certificate_availability: boolean;
  has_cover_image: boolean;
  has_intro_video: boolean;
  status: string;
  provider: ProviderCard;
  merit_tier: MeritTier;
  merit_score: number;
  reviews: ListingReviewSummary;
  sessions?: CourseSessionPublic[];     // for IN_PERSON and ONLINE_LIVE
  access_window_days?: number;          // for SELF_PACED
  hybrid_components?: HybridComponentPublic[]; // for HYBRID
}

export interface CourseSessionPublic {
  id: string;
  session_date: Date;
  start_time: string;
  end_time: string;
  capacity_max: number;
  enrolled_count: number;
  status: string;
}

export interface HybridComponentPublic {
  component_type: string;
  sequence_order: number;
  access_window_days: number | null;
}

export interface TripDetailPublic {
  id: string;
  title: string;
  description: string;
  city: string | null;
  district: string | null;
  // meeting_point_encrypted: NEVER exposed here
  price_halalas: number;
  currency: string;
  is_free: boolean;
  duration_days: number | null;
  min_group_size: number | null;
  max_group_size: number | null;
  cancellation_policy: string | null;
  has_cover_image: boolean;
  status: string;
  provider: ProviderCard;
  merit_tier: MeritTier;
  merit_score: number;
  reviews: ListingReviewSummary;
  sessions?: TripSessionPublic[];
}

export interface TripSessionPublic {
  id: string;
  start_date: Date;
  end_date: Date;
  enrolled_count: number;
  capacity_max: number;
  status: string;
}

export interface ProductDetailPublic {
  id: string;
  title: string;
  description: string;
  product_type: string;
  price_halalas: number;
  currency: string;
  is_free: boolean;
  shipping_required: boolean;
  has_cover_image: boolean;
  status: string;
  provider: ProviderCard;
  merit_tier: MeritTier;
  merit_score: number;
  reviews: ListingReviewSummary;
  variants?: ProductVariantPublic[];
}

export interface ProductVariantPublic {
  id: string;
  variant_name: string;
  price_override_halalas: number | null;
  inventory_available: boolean; // true if inventory_count > 0 or inventory_count IS NULL
  sku: string | null;
}

// ── Provider public profile ───────────────────────────────────────────────────

export interface ProviderPublicProfile {
  id: string;
  display_name: string;
  provider_type: 'INSTRUCTOR' | 'CENTER';
  bio: string | null;
  city: string | null;
  merit_tier: MeritTier;
  merit_score: number;
  reviews: ListingReviewSummary;
  active_course_count: number;
  active_trip_count: number;
  active_product_count: number;
}

// ── Review types ──────────────────────────────────────────────────────────────

export interface ReviewRecord {
  id: string;
  booking_id: string;
  seeker_id: string;
  provider_id: string;
  listing_id: string;
  listing_type: string;
  rating: number;
  review_text: string | null;
  status: 'PUBLISHED' | 'REMOVED';
  published_at: Date;
  created_at: Date;
}

export interface SubmitReviewParams {
  bookingId: string;
  seekerId: string;
  providerId: string;
  listingId: string;
  listingType: 'COURSE' | 'TRIP' | 'PRODUCT';
  rating: number; // 1–5
  reviewText?: string;
}

// ── Search ────────────────────────────────────────────────────────────────────

export interface SearchParams {
  query?: string;
  listingTypes?: ('COURSE' | 'TRIP' | 'PRODUCT')[];
  categoryId?: string;
  subcategoryId?: string;
  cityId?: string;
  minPriceHalalas?: number;
  maxPriceHalalas?: number;
  isFree?: boolean;
  limit?: number;
  offset?: number;
}

export interface SearchResult {
  query: string | null;
  courses: CourseCard[];
  trips: TripCard[];
  products: ProductCard[];
  total_count: number;
}
