import { Knex } from 'knex';

// ── Settings: account-level configuration only (LOCKED) ──────────────────────
// Settings does NOT own: item editing, live pricing, or campaign management.
// Those belong to Courses/Trips/Products and Marketing respectively.

export interface ProviderSettings {
  provider_id: string;
  // Notification preferences
  notify_new_booking: boolean;
  notify_booking_cancelled: boolean;
  notify_review_received: boolean;
  notify_dm_received: boolean;
  notify_payout_processed: boolean;
  // Display preferences
  show_response_time: boolean;
  // Contact preferences
  preferred_contact_channel: 'DM' | 'EMAIL' | 'NONE';
  created_at: Date;
  updated_at: Date;
}

export interface UpdateSettingsParams {
  notify_new_booking?: boolean;
  notify_booking_cancelled?: boolean;
  notify_review_received?: boolean;
  notify_dm_received?: boolean;
  notify_payout_processed?: boolean;
  show_response_time?: boolean;
  preferred_contact_channel?: 'DM' | 'EMAIL' | 'NONE';
}

export class SettingsService {
  constructor(private readonly db: Knex) {}

  // Get provider settings — creates default row on first access
  async getSettings(providerId: string): Promise<ProviderSettings> {
    const existing = await this.db('provider_settings')
      .where({ provider_id: providerId })
      .first();

    if (existing) return existing as ProviderSettings;

    // First access — seed defaults
    const [created] = await this.db('provider_settings')
      .insert({
        provider_id: providerId,
        notify_new_booking: true,
        notify_booking_cancelled: true,
        notify_review_received: true,
        notify_dm_received: true,
        notify_payout_processed: true,
        show_response_time: true,
        preferred_contact_channel: 'DM',
        created_at: new Date(),
        updated_at: new Date(),
      })
      .onConflict('provider_id')
      .merge({ updated_at: new Date() }) // idempotent on race
      .returning('*');

    return created as ProviderSettings;
  }

  // Update provider settings — partial update, only supplied fields change
  async updateSettings(
    providerId: string,
    params: UpdateSettingsParams,
  ): Promise<ProviderSettings> {
    if (Object.keys(params).length === 0) {
      throw new Error('INVALID_UPDATE: No fields provided for update');
    }

    await this.getSettings(providerId); // ensure row exists

    const [updated] = await this.db('provider_settings')
      .where({ provider_id: providerId })
      .update({ ...params, updated_at: new Date() })
      .returning('*');

    return updated as ProviderSettings;
  }
}
