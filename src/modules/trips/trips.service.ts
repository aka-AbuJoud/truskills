import { Knex } from 'knex';
import { TripsRepository, TripRecord } from './trips.repository';

export class TripsService {
  constructor(
    private readonly db: Knex,
    private readonly repo: TripsRepository,
  ) {}

  async createTrip(params: {
    providerId: string;
    title: string;
    description?: string;
    priceHalalas: number;
    city?: string;
    district?: string;
    locationExact?: string;
    maxCapacity?: number;
    departureDate?: Date;
    returnDate?: Date;
    durationDays?: number;
    waiverRequired?: boolean;
    waiverTemplate?: string;
  }): Promise<TripRecord> {
    return this.repo.insert({
      provider_id: params.providerId,
      title: params.title,
      description: params.description ?? null,
      price_halalas: params.priceHalalas,
      currency: 'SAR',
      city: params.city ?? null,
      district: params.district ?? null,
      location_exact: params.locationExact ?? null,
      max_capacity: params.maxCapacity ?? null,
      group_enabled: true, // trips default to group
      departure_date: params.departureDate ?? null,
      return_date: params.returnDate ?? null,
      duration_days: params.durationDays ?? null,
      waiver_required: params.waiverRequired ?? false,
      waiver_template: params.waiverTemplate ?? null,
      status: 'DRAFT',
    });
  }

  async publishTrip(tripId: string, providerId: string): Promise<TripRecord> {
    const trip = await this._getOwnedOrThrow(tripId, providerId);
    if (trip.status !== 'DRAFT') throw new Error(`INVALID_STATE: Cannot publish from ${trip.status}`);
    await this._assertProviderActivated(providerId);
    return this.repo.update(tripId, { status: 'PUBLISHED' });
  }

  async archiveTrip(tripId: string, providerId: string): Promise<TripRecord> {
    await this._getOwnedOrThrow(tripId, providerId);
    return this.repo.update(tripId, { status: 'ARCHIVED' });
  }

  async updateTrip(tripId: string, providerId: string, data: Partial<Parameters<TripsService['createTrip']>[0]>): Promise<TripRecord> {
    await this._getOwnedOrThrow(tripId, providerId);
    return this.repo.update(tripId, {
      title: data.title,
      description: data.description,
      price_halalas: data.priceHalalas,
      city: data.city,
      district: data.district,
      location_exact: data.locationExact,
      max_capacity: data.maxCapacity,
      departure_date: data.departureDate,
      return_date: data.returnDate,
      duration_days: data.durationDays,
      waiver_required: data.waiverRequired,
      waiver_template: data.waiverTemplate,
    });
  }

  async getProviderTrips(providerId: string): Promise<TripRecord[]> {
    return this.repo.findByProvider(providerId);
  }

  async getTrip(tripId: string): Promise<TripRecord | null> {
    return this.repo.findById(tripId);
  }

  async listPublished(opts: { limit?: number; offset?: number } = {}): Promise<TripRecord[]> {
    return this.repo.findPublished(opts);
  }

  // ── Dashboard-facing aliases (names expected by dashboard.routes.ts) ─────────
  listByProvider = this.getProviderTrips.bind(this);
  getByIdForProvider = (id: string, providerId: string) =>
    this._getOwnedOrThrow(id, providerId).catch(() => null);
  create = this.createTrip.bind(this);
  update = this.updateTrip.bind(this);
  publish = this.publishTrip.bind(this);
  unpublish = (id: string, providerId: string) => this.archiveTrip(id, providerId);

  private async _getOwnedOrThrow(tripId: string, providerId: string): Promise<TripRecord> {
    const trip = await this.repo.findById(tripId);
    if (!trip) throw new Error('NOT_FOUND: Trip not found');
    if (trip.provider_id !== providerId) throw new Error('FORBIDDEN');
    return trip;
  }

  private async _assertProviderActivated(providerId: string): Promise<void> {
    const provider = await this.db('providers').where({ id: providerId }).first();
    if (!provider || provider.activation_status !== 'ACTIVATED') {
      throw new Error('PROVIDER_NOT_ACTIVATED: Provider must be ACTIVATED to publish trips');
    }
  }
}
