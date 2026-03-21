import { Knex } from 'knex';
import { ActivationRepository, ActivationStatus, ProviderRecord } from './activation.repository';

// Provider activation state machine (8 states — LOCKED)
// NOT_STARTED → IN_PROGRESS → SUBMITTED → UNDER_REVIEW
//   → NEEDS_REVISION → (back to IN_PROGRESS for flagged groups)
//   → APPROVED → ACTIVATED
//   → RESTRICTED_ON_HOLD (post-activation control state)
//
// Allowed transitions (enforced here — DB constraint covers status values):
const ALLOWED_TRANSITIONS: Record<ActivationStatus, ActivationStatus[]> = {
  NOT_STARTED:       ['IN_PROGRESS'],
  IN_PROGRESS:       ['SUBMITTED'],
  SUBMITTED:         ['UNDER_REVIEW'],
  UNDER_REVIEW:      ['NEEDS_REVISION', 'APPROVED'],
  NEEDS_REVISION:    ['IN_PROGRESS', 'SUBMITTED'], // provider resubmits after revision
  APPROVED:          ['ACTIVATED'],
  ACTIVATED:         ['RESTRICTED_ON_HOLD'],
  RESTRICTED_ON_HOLD: ['UNDER_REVIEW', 'ACTIVATED'], // ops can lift restriction
};

export class ActivationService {
  constructor(
    private readonly db: Knex,
    private readonly repo: ActivationRepository,
  ) {}

  async getProviderStatus(providerId: string): Promise<ProviderRecord | null> {
    return this.repo.findByProviderId(providerId);
  }

  async getProviderStatusByUserId(userId: string): Promise<ProviderRecord | null> {
    return this.repo.findByUserId(userId);
  }

  // Provider initiates activation
  async startActivation(providerId: string): Promise<ProviderRecord> {
    const provider = await this._getOrThrow(providerId);
    this._assertTransition(provider.activation_status, 'IN_PROGRESS');
    return this.repo.updateStatus(providerId, 'IN_PROGRESS', null, 'Provider initiated activation');
  }

  // Provider submits for ops review
  async submitForReview(providerId: string): Promise<ProviderRecord> {
    const provider = await this._getOrThrow(providerId);
    this._assertTransition(provider.activation_status, 'SUBMITTED');
    return this.repo.updateStatus(providerId, 'SUBMITTED', providerId, 'Provider submitted for review');
  }

  // Ops: pick up a submitted application
  async startReview(providerId: string, opsActorId: string): Promise<ProviderRecord> {
    const provider = await this._getOrThrow(providerId);
    this._assertTransition(provider.activation_status, 'UNDER_REVIEW');
    return this.repo.updateStatus(providerId, 'UNDER_REVIEW', opsActorId, 'Ops review started');
  }

  // Ops: flag for revision
  async requestRevision(providerId: string, opsActorId: string, reason: string): Promise<ProviderRecord> {
    const provider = await this._getOrThrow(providerId);
    this._assertTransition(provider.activation_status, 'NEEDS_REVISION');
    return this.repo.updateStatus(providerId, 'NEEDS_REVISION', opsActorId, reason);
  }

  // Ops: approve (all required documents reviewed and passed)
  async approve(providerId: string, opsActorId: string): Promise<ProviderRecord> {
    const provider = await this._getOrThrow(providerId);
    this._assertTransition(provider.activation_status, 'APPROVED');
    return this.repo.updateStatus(providerId, 'APPROVED', opsActorId, 'Requirements approved');
  }

  // Ops: activate (final gates completed — payout setup + contract acceptance)
  async activate(providerId: string, opsActorId: string): Promise<ProviderRecord> {
    const provider = await this._getOrThrow(providerId);
    this._assertTransition(provider.activation_status, 'ACTIVATED');
    return this.repo.updateStatus(providerId, 'ACTIVATED', opsActorId, 'Provider activated');
  }

  // Ops: restrict (see ops-runbook.md Section 1)
  async restrict(providerId: string, opsActorId: string, reason: string): Promise<ProviderRecord> {
    const provider = await this._getOrThrow(providerId);
    this._assertTransition(provider.activation_status, 'RESTRICTED_ON_HOLD');
    return this.repo.updateStatus(providerId, 'RESTRICTED_ON_HOLD', opsActorId, reason);
  }

  // Ops: lift restriction
  async liftRestriction(providerId: string, opsActorId: string, reason: string): Promise<ProviderRecord> {
    const provider = await this._getOrThrow(providerId);
    this._assertTransition(provider.activation_status, 'ACTIVATED');
    return this.repo.updateStatus(providerId, 'ACTIVATED', opsActorId, reason);
  }

  // Provider updates activation progress (requirement group completion state)
  async updateProgress(
    providerId: string,
    progress: Record<string, unknown>,
  ): Promise<ProviderRecord> {
    return this.repo.updateProgress(providerId, progress);
  }

  async getActivationLog(providerId: string) {
    return this.repo.getActivationLog(providerId);
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async _getOrThrow(providerId: string): Promise<ProviderRecord> {
    const provider = await this.repo.findByProviderId(providerId);
    if (!provider) throw new Error(`NOT_FOUND: Provider ${providerId} not found`);
    return provider;
  }

  private _assertTransition(from: ActivationStatus, to: ActivationStatus): void {
    const allowed = ALLOWED_TRANSITIONS[from] ?? [];
    if (!allowed.includes(to)) {
      throw new Error(
        `INVALID_TRANSITION: Cannot transition from ${from} to ${to}. ` +
        `Allowed transitions from ${from}: ${allowed.join(', ') || 'none'}`,
      );
    }
  }
}
