import { Knex } from 'knex';

export interface CourseRecord {
  id: string;
  provider_id: string;
  title: string;
  description: string | null;
  delivery_channel: 'IN_PERSON' | 'ONLINE_LIVE' | 'SELF_PACED' | 'HYBRID';
  price_halalas: number;
  currency: string;
  city: string | null;
  district: string | null;
  location_exact: string | null;
  meeting_link: string | null;
  max_capacity: number | null;
  certificate_availability: boolean;
  group_enabled: boolean;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  created_at: Date;
  updated_at: Date;
}

export class CoursesRepository {
  constructor(private readonly db: Knex) {}

  async insert(data: Omit<CourseRecord, 'id' | 'created_at' | 'updated_at'>): Promise<CourseRecord> {
    const [row] = await this.db('courses')
      .insert({ ...data, created_at: new Date(), updated_at: new Date() })
      .returning('*');
    return row as CourseRecord;
  }

  async findById(id: string): Promise<CourseRecord | null> {
    const row = await this.db('courses').where({ id }).first();
    return row ? (row as CourseRecord) : null;
  }

  async findByProvider(providerId: string): Promise<CourseRecord[]> {
    return this.db('courses')
      .where({ provider_id: providerId })
      .orderBy('created_at', 'desc') as unknown as CourseRecord[];
  }

  async findPublished(opts: { limit?: number; offset?: number } = {}): Promise<CourseRecord[]> {
    return this.db('courses')
      .where({ status: 'PUBLISHED' })
      .orderBy('updated_at', 'desc')
      .limit(opts.limit ?? 20)
      .offset(opts.offset ?? 0) as unknown as CourseRecord[];
  }

  async update(id: string, data: Partial<CourseRecord>): Promise<CourseRecord> {
    const [row] = await this.db('courses')
      .where({ id })
      .update({ ...data, updated_at: new Date() })
      .returning('*');
    return row as CourseRecord;
  }
}
