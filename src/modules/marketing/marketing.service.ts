import { Knex } from 'knex';

// ── Marketing: controlled boost/promotion request surface only (LOCKED) ───────
// Providers may submit self-serve boost requests.
// No open ad manager. No arbitrary promotion configuration.
// BOOST_DAILY_SPEND_CAP is a commercial constant loaded from config — never hardcoded.
// Boost label: "Sponsored" (self-serve — locked).

export type BoostStatus = 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';
export type BoostListingType = 'COURSE' | 'TRIP' | 'PRODUCT';

export interface BoostCampaign {
  id: string;
  provider_id: string;
  listing_id: string;
  listing_type: BoostListingType;
  daily_budget_halalas: number;
  total_budget_halalas: number;
  spent_halalas: number;
  status: BoostStatus;
  starts_at: Date;
  ends_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateBoostParams {
  providerId: string;
  listingId: string;
  listingType: BoostListingType;
  dailyBudgetHalalas: number;
  totalBudgetHalalas: number;
  startsAt: Date;
  endsAt?: Date;
}

export class MarketingService {
  // BOOST_DAILY_SPEND_CAP: configurable commercial constant — must not be hardcoded.
  // Loaded from environment config. Default = '__PLACEHOLDER__' until Director + Build Lead sign-off.
  private readonly dailySpendCap: number;

  constructor(
    private readonly db: Knex,
    dailySpendCapHalalas: number,
  ) {
    this.dailySpendCap = dailySpendCapHalalas;
  }

  // List all boost campaigns for a provider
  async listBoosts(providerId: string): Promise<BoostCampaign[]> {
    const rows = await this.db('boost_campaigns')
      .where({ provider_id: providerId })
      .orderBy('created_at', 'desc');
    return rows as BoostCampaign[];
  }

  // Get a specific boost campaign — must belong to the requesting provider
  async getBoost(boostId: string, providerId: string): Promise<BoostCampaign | null> {
    const row = await this.db('boost_campaigns')
      .where({ id: boostId, provider_id: providerId })
      .first();
    return row ? (row as BoostCampaign) : null;
  }

  // Create a new self-serve boost campaign
  async createBoost(params: CreateBoostParams): Promise<BoostCampaign> {
    if (params.dailyBudgetHalalas <= 0) {
      throw new Error('INVALID_BUDGET: Daily budget must be greater than zero');
    }

    if (params.dailyBudgetHalalas > this.dailySpendCap) {
      throw new Error(
        `BUDGET_EXCEEDS_CAP: Daily budget ${params.dailyBudgetHalalas} exceeds cap ${this.dailySpendCap}`,
      );
    }

    if (params.totalBudgetHalalas < params.dailyBudgetHalalas) {
      throw new Error('INVALID_BUDGET: Total budget must be >= daily budget');
    }

    if (params.endsAt && params.endsAt <= params.startsAt) {
      throw new Error('INVALID_DATES: End date must be after start date');
    }

    // Provider must be activated to run boosts
    const provider = await this.db('providers')
      .where({ id: params.providerId })
      .select('activation_status')
      .first();
    if (!provider) throw new Error('NOT_FOUND: Provider not found');
    if (provider.activation_status !== 'ACTIVATED') {
      throw new Error('PROVIDER_NOT_ACTIVATED: Provider must be activated to create boost campaigns');
    }

    // Listing must exist and belong to provider
    await this._assertListingOwnership(params.listingId, params.listingType, params.providerId);

    const [campaign] = await this.db('boost_campaigns')
      .insert({
        provider_id: params.providerId,
        listing_id: params.listingId,
        listing_type: params.listingType,
        daily_budget_halalas: params.dailyBudgetHalalas,
        total_budget_halalas: params.totalBudgetHalalas,
        spent_halalas: 0,
        status: 'ACTIVE',
        starts_at: params.startsAt,
        ends_at: params.endsAt ?? null,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning('*');

    return campaign as BoostCampaign;
  }

  // Pause an active boost campaign
  async pauseBoost(boostId: string, providerId: string): Promise<BoostCampaign> {
    const campaign = await this._getOwnedBoostOrThrow(boostId, providerId);

    if (campaign.status !== 'ACTIVE') {
      throw new Error(`INVALID_STATE: Can only pause ACTIVE campaigns, current status: ${campaign.status}`);
    }

    const [updated] = await this.db('boost_campaigns')
      .where({ id: boostId })
      .update({ status: 'PAUSED', updated_at: new Date() })
      .returning('*');

    return updated as BoostCampaign;
  }

  // Resume a paused boost campaign
  async resumeBoost(boostId: string, providerId: string): Promise<BoostCampaign> {
    const campaign = await this._getOwnedBoostOrThrow(boostId, providerId);

    if (campaign.status !== 'PAUSED') {
      throw new Error(`INVALID_STATE: Can only resume PAUSED campaigns, current status: ${campaign.status}`);
    }

    const [updated] = await this.db('boost_campaigns')
      .where({ id: boostId })
      .update({ status: 'ACTIVE', updated_at: new Date() })
      .returning('*');

    return updated as BoostCampaign;
  }

  // Cancel a boost campaign — terminal state
  async cancelBoost(boostId: string, providerId: string): Promise<BoostCampaign> {
    const campaign = await this._getOwnedBoostOrThrow(boostId, providerId);

    if (!['ACTIVE', 'PAUSED'].includes(campaign.status)) {
      throw new Error(`INVALID_STATE: Cannot cancel a ${campaign.status} campaign`);
    }

    const [updated] = await this.db('boost_campaigns')
      .where({ id: boostId })
      .update({ status: 'CANCELLED', updated_at: new Date() })
      .returning('*');

    return updated as BoostCampaign;
  }

  // ── Internal helpers ──────────────────────────────────────────────────────

  private async _getOwnedBoostOrThrow(boostId: string, providerId: string): Promise<BoostCampaign> {
    const campaign = await this.db('boost_campaigns')
      .where({ id: boostId, provider_id: providerId })
      .first();
    if (!campaign) throw new Error('NOT_FOUND: Boost campaign not found');
    return campaign as BoostCampaign;
  }

  private async _assertListingOwnership(
    listingId: string,
    listingType: BoostListingType,
    providerId: string,
  ): Promise<void> {
    const tableMap: Record<BoostListingType, string> = {
      COURSE: 'courses',
      TRIP: 'trips',
      PRODUCT: 'products',
    };
    const table = tableMap[listingType];
    const listing = await this.db(table)
      .where({ id: listingId, provider_id: providerId })
      .select('id')
      .first();
    if (!listing) throw new Error(`NOT_FOUND: ${listingType} listing not found or not owned by provider`);
  }
}
