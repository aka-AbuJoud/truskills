import { LegacyRepository } from './legacy.repository';

// Locked: qualification-unlocked, on-platform lineage only.
// No external credential import — there is no import method.
// Entries are created exclusively by internal system events (certificate issuance on course completion).

export interface LegacyEntryRecord {
  id: string;
  provider_id: string;
  seeker_id: string;
  entry_type: 'CERTIFICATE_ISSUED';
  source_type: 'COURSE_COMPLETION';
  source_id: string; // booking_id of the completed enrollment
  qualification_name: string; // course title snapshot at time of issuance
  issued_at: Date;
  verified_by: string | null;
  verified_at: Date | null;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export interface IssueCertificateParams {
  providerId: string;
  seekerId: string;
  bookingId: string;           // becomes source_id
  qualificationName: string;   // course title snapshot — not live-linked
  metadata?: Record<string, unknown>;
}

export class LegacyService {
  constructor(private readonly repo: LegacyRepository) {}

  // Called internally when a course enrollment is completed and the course has
  // certificate_availability = true. Idempotent: unique DB constraint on
  // (source_type, source_id) guarantees at-most-one entry per completion event.
  async recordCertificateIssued(params: IssueCertificateParams): Promise<LegacyEntryRecord> {
    // Check before insert — unique constraint is the hard guarantee, this is the fast path
    const existing = await this.repo.findBySourceId('COURSE_COMPLETION', params.bookingId);
    if (existing) return existing;

    return this.repo.insert({
      provider_id: params.providerId,
      seeker_id: params.seekerId,
      entry_type: 'CERTIFICATE_ISSUED',
      source_type: 'COURSE_COMPLETION',
      source_id: params.bookingId,
      qualification_name: params.qualificationName,
      issued_at: new Date(),
      verified_by: null,
      verified_at: null,
      metadata: params.metadata ?? {},
    });
  }

  async findById(entryId: string): Promise<LegacyEntryRecord | null> {
    return this.repo.findById(entryId);
  }

  async listProviderEntries(providerId: string): Promise<LegacyEntryRecord[]> {
    return this.repo.findByProvider(providerId);
  }

  async listSeekerEntries(seekerId: string): Promise<LegacyEntryRecord[]> {
    return this.repo.findBySeeker(seekerId);
  }

  // Ops-only: mark a legacy entry as ops-verified
  async verifyEntry(entryId: string, verifiedBy: string): Promise<LegacyEntryRecord> {
    return this.repo.markVerified(entryId, verifiedBy);
  }
}
