import { Knex } from 'knex';

export interface TripRecord {
  id: string;
  provider_id: string;
  title: string;
  description: string | null;
  price_halalas: number;
  currency: string;
  city: string | null;
  district: string | null;
  location_exact: string | null;
  max_capacity: number | null;
  group_enabled: boolean;
  departure_date: Date | null;
  return_date: Date | null;
  duration_days: number | null;
  waiver_required: boolean;
  waiver_template: string | null;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  created_at: Date;
  updated_at: Date;
}

export class TripsRepository {
  constructor(private readonly db: Knex) {}

  async insert(data: Omit<TripRecord, 'id' | 'created_at' | 'updated_at'>): Promise<TripRecord> {
    const [row] = await this.db('trips')
      .insert({ ...data, created_at: new Date(), updated_at: new Date() })
      .returning('*');
    return row as TripRecord;
  }

  async findById(id: string): Promise<TripRecord | null> {
    const row = await this.db('trips').where({ id }).first();
    return row ? (row as TripRecord) : null;
  }

  async findByProvider(providerId: string): Promise<TripRecord[]> {
    return this.db('trips')
      .where({ provider_id: providerId })
      .orderBy('created_at', 'desc') as unknown as TripRecord[];
  }

  async findPublished(opts: { limit?: number; offset?: number } = {}): Promise<TripRecord[]> {
    return this.db('trips')
      .where({ status: 'PUBLISHED' })
      .orderBy('departure_date', 'asc')
      .limit(opts.limit ?? 20)
      .offset(opts.offset ?? 0) as unknown as TripRecord[];
  }

  async update(id: string, data: Partial<TripRecord>): Promise<TripRecord> {
    const [row] = await this.db('trips')
      .where({ id })
      .update({ ...data, updated_at: new Date() })
      .returning('*');
    return row as TripRecord;
  }
}
