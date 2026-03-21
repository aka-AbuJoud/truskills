import { Knex } from 'knex';

export interface ProductRecord {
  id: string;
  provider_id: string;
  title: string;
  description: string | null;
  price_halalas: number;
  currency: string;
  stock_quantity: number | null;
  is_digital: boolean;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  created_at: Date;
  updated_at: Date;
}

export class ProductsRepository {
  constructor(private readonly db: Knex) {}

  async insert(data: Omit<ProductRecord, 'id' | 'created_at' | 'updated_at'>): Promise<ProductRecord> {
    const [row] = await this.db('products')
      .insert({ ...data, created_at: new Date(), updated_at: new Date() })
      .returning('*');
    return row as ProductRecord;
  }

  async findById(id: string): Promise<ProductRecord | null> {
    const row = await this.db('products').where({ id }).first();
    return row ? (row as ProductRecord) : null;
  }

  async findByProvider(providerId: string): Promise<ProductRecord[]> {
    return this.db('products')
      .where({ provider_id: providerId })
      .orderBy('created_at', 'desc') as unknown as ProductRecord[];
  }

  async findPublished(opts: { limit?: number; offset?: number } = {}): Promise<ProductRecord[]> {
    return this.db('products')
      .where({ status: 'PUBLISHED' })
      .orderBy('created_at', 'desc')
      .limit(opts.limit ?? 20)
      .offset(opts.offset ?? 0) as unknown as ProductRecord[];
  }

  async update(id: string, data: Partial<ProductRecord>): Promise<ProductRecord> {
    const [row] = await this.db('products')
      .where({ id })
      .update({ ...data, updated_at: new Date() })
      .returning('*');
    return row as ProductRecord;
  }
}
