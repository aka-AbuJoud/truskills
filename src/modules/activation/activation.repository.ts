import { Knex } from 'knex';

export type ActivationStatus =
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'NEEDS_REVISION'
  | 'APPROVED'
  | 'ACTIVATED'
  | 'RESTRICTED_ON_HOLD';

export interface ProviderRecord {
  id: string;
  user_id: string;
  provider_type: 'INSTRUCTOR' | 'CENTER';
  business_name: string | null;
  display_name: string;
  bio: string | null;
  city: string | null;
  district: string | null;
  activation_status: ActivationStatus;
  has_restriction_history: boolean;
  activation_progress: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export interface ActivationLogEntry {
  id: string;
  provider_id: string;
  from_status: string | null;
  to_status: string;
  actor_id: string | null;
  reason: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
}

export class ActivationRepository {
  constructor(private readonly db: Knex) {}

  async findByProviderId(providerId: string): Promise<ProviderRecord | null> {
    const row = await this.db('providers').where({ id: providerId }).first();
    return row ? (row as ProviderRecord) : null;
  }

  async findByUserId(userId: string): Promise<ProviderRecord | null> {
    const row = await this.db('providers').where({ user_id: userId }).first();
    return row ? (row as ProviderRecord) : null;
  }

  async updateStatus(
    providerId: string,
    toStatus: ActivationStatus,
    actorId: string | null,
    reason?: string,
    meta?: Record<string, unknown>,
  ): Promise<ProviderRecord> {
    const current = await this.findByProviderId(providerId);

    return this.db.transaction(async (trx) => {
      const [updated] = await trx('providers')
        .where({ id: providerId })
        .update({
          activation_status: toStatus,
          has_restriction_history: toStatus === 'RESTRICTED_ON_HOLD'
            ? true
            : current?.has_restriction_history ?? false,
          updated_at: new Date(),
        })
        .returning('*');

      await trx('provider_activation_log').insert({
        provider_id: providerId,
        from_status: current?.activation_status ?? null,
        to_status: toStatus,
        actor_id: actorId ?? null,
        reason: reason ?? null,
        metadata: meta ?? {},
        created_at: new Date(),
      });

      return updated as ProviderRecord;
    });
  }

  async updateProgress(
    providerId: string,
    progress: Record<string, unknown>,
  ): Promise<ProviderRecord> {
    const [updated] = await this.db('providers')
      .where({ id: providerId })
      .update({ activation_progress: progress, updated_at: new Date() })
      .returning('*');
    return updated as ProviderRecord;
  }

  async getActivationLog(providerId: string): Promise<ActivationLogEntry[]> {
    return this.db('provider_activation_log')
      .where({ provider_id: providerId })
      .orderBy('created_at', 'desc') as unknown as ActivationLogEntry[];
  }
}
