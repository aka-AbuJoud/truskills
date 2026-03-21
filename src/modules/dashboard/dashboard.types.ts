// Phase J — Provider Dashboard Types
// All types here are read-only provider-facing projections.
// Each section maps to the locked dashboard navigation structure.

import { MeritTier } from '../merit/merit.service';

// ── TODAY / Home ─────────────────────────────────────────────────────────────

export interface TodaySession {
  booking_id: string;
  listing_id: string;
  listing_type: 'COURSE' | 'TRIP' | 'PRODUCT';
  listing_title: string;
  seeker_display_name: string;
  scheduled_at: Date;
  status: string;
}

export interface TodayActionItem {
  type:
    | 'ACTIVATION_INCOMPLETE'
    | 'BOOKING_PENDING_CONFIRMATION'
    | 'BLOG_POST_IN_REVIEW'
    | 'DOCUMENT_EXPIRING'
    | 'REVIEW_RECEIVED';
  label: string;
  reference_id: string | null;
}

export interface TodaySummary {
  provider_id: string;
  display_name: string;
  provider_type: 'INSTRUCTOR' | 'CENTER';
  activation_status: string;
  sessions_today: TodaySession[];
  pending_booking_count: number;
  unread_dm_count: number;
  recent_review_count: number; // reviews received in last 7 days
  action_items: TodayActionItem[];
}

// ── TODAY / Calendar ─────────────────────────────────────────────────────────

export interface CalendarEvent {
  date: string; // ISO date YYYY-MM-DD
  booking_id: string;
  listing_id: string;
  listing_type: 'COURSE' | 'TRIP' | 'PRODUCT';
  listing_title: string;
  seeker_display_name: string;
  scheduled_at: Date;
  status: string;
}

export interface CalendarView {
  start_date: string;
  end_date: string;
  events: CalendarEvent[];
}

// ── AUDIENCE / Customers ─────────────────────────────────────────────────────

export interface CustomerRecord {
  seeker_id: string;
  display_name: string;
  booking_count: number;
  completed_booking_count: number;
  last_booking_date: Date | null;
  total_paid_halalas: number;
}

// ── BUSINESS / Analytics ─────────────────────────────────────────────────────

export interface MeritSignalBreakdown {
  signal_1_verification: number;
  signal_2_review_quality: number;
  signal_3_reliability: number;
  signal_4_trust_standing: number;
  signal_5_relevance: number;
  signal_6_blog: number;
  signal_7_activity: number;
  signal_8_boost_raw: number;
  composite_score: number;
  tier: MeritTier;
  last_computed_at: Date | null;
}

export interface ProviderAnalytics {
  provider_id: string;
  merit: MeritSignalBreakdown | null; // null if merit profile not yet computed
  total_bookings: number;
  confirmed_bookings: number;
  completed_bookings: number;
  cancellation_count: number;
  completion_rate: number | null; // null if no confirmed bookings
  avg_review_rating: number | null;
  review_count: number;
  active_listings: number;
}
