import { Knex } from 'knex';

import { LegacyEntryRecord } from './legacy.service';

export class LegacyRepository {
  constructor(private readonly db: Knex) {}

  async insert(
    data: Omit<LegacyEntryRecord, 'id' | 'created_at' | 'updated_at'>,
    trx?: Knex.Transaction,
  ): Promise<LegacyEntryRecord> {
    const [row] = await (trx ?? this.db)('legacy_entries').insert(data).returning('*');
    return row as LegacyEntryRecord;
  }

  async findBySourceId(
    sourceType: string,
    sourceId: string,
  ): Promise<LegacyEntryRecord | null> {
    const row = await this.db('legacy_entries')
      .where({ source_type: sourceType, source_id: sourceId })
      .first();
    return row ? (row as LegacyEntryRecord) : null;
  }

  async findById(id: string): Promise<LegacyEntryRecord | null> {
    const row = await this.db('legacy_entries').where({ id }).first();
    return row ? (row as LegacyEntryRecord) : null;
  }

  async findByProvider(providerId: string): Promise<LegacyEntryRecord[]> {
    return this.db('legacy_entries')
      .where({ provider_id: providerId })
      .orderBy('issued_at', 'desc') as unknown as LegacyEntryRecord[];
  }

  async findBySeeker(seekerId: string): Promise<LegacyEntryRecord[]> {
    return this.db('legacy_entries')
      .where({ seeker_id: seekerId })
      .orderBy('issued_at', 'desc') as unknown as LegacyEntryRecord[];
  }

  async markVerified(id: string, verifiedBy: string): Promise<LegacyEntryRecord> {
    const [row] = await this.db('legacy_entries')
      .where({ id })
      .update({ verified_by: verifiedBy, verified_at: new Date(), updated_at: new Date() })
      .returning('*');
    return row as LegacyEntryRecord;
  }
}
