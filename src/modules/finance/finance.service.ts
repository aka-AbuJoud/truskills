import { Knex } from 'knex';
import { FinanceRepository, FinanceTransaction, PayoutBatch } from './finance.repository';

// Finance is the SINGLE authoritative money source of truth (LOCKED).
// Payment flow:
//   1. holdPayment()    — PENDING_PAYMENT state → hold placed on seeker card
//   2. capturePayment() — CONFIRMED state → hold captured
//   3. handleBookingCancellation() — releases hold or issues refund
//   4. recordBookingCompleted() — marks transaction payout-eligible
//   5. processProviderPayout() — scheduled payout run

export interface HoldPaymentParams {
  seekerId: string;
  providerId: string;
  listingId: string;
  amountHalalas: number;
  paymentMethodId: string;
}

export class FinanceService {
  constructor(
    private readonly db: Knex,
    private readonly repo: FinanceRepository,
  ) {}

  // Step 1: Place payment hold when booking is created
  async holdPayment(params: HoldPaymentParams): Promise<{ id: string }> {
    const tx = await this.repo.insertTransaction({
      booking_id: null, // booking not yet created
      seeker_id: params.seekerId,
      provider_id: params.providerId,
      amount_halalas: params.amountHalalas,
      currency: 'SAR',
      transaction_type: 'PAYMENT_HOLD',
      status: 'PENDING',
      payment_hold_id: params.paymentMethodId, // adapter hold ID stored here
      gateway_transaction_id: null,
      ops_note: null,
    });
    return { id: tx.id };
  }

  // Step 2: Capture hold when booking is confirmed
  async capturePayment(bookingId: string): Promise<void> {
    const booking = await this.db('bookings').where({ id: bookingId }).first();
    if (!booking) throw new Error(`NOT_FOUND: Booking ${bookingId}`);

    await this.repo.insertTransaction({
      booking_id: bookingId,
      seeker_id: booking.seeker_id,
      provider_id: booking.provider_id,
      amount_halalas: booking.price_halalas,
      currency: booking.currency ?? 'SAR',
      transaction_type: 'PAYMENT_CAPTURE',
      status: 'COMPLETED',
      payment_hold_id: booking.payment_hold_id ?? null,
      gateway_transaction_id: null,
      ops_note: null,
    });
  }

  // Step 3a: Cancellation — release hold or refund captured amount
  async handleBookingCancellation(bookingId: string, cancelledBy: 'SEEKER' | 'PROVIDER' | 'OPS'): Promise<void> {
    const booking = await this.db('bookings').where({ id: bookingId }).first();
    if (!booking) return;

    const transactions = await this.repo.findByBookingId(bookingId);
    const hasCaptured = transactions.some(
      (t) => t.transaction_type === 'PAYMENT_CAPTURE' && t.status === 'COMPLETED',
    );

    if (hasCaptured) {
      // Post-capture cancellation: issue refund
      await this.repo.insertTransaction({
        booking_id: bookingId,
        seeker_id: booking.seeker_id,
        provider_id: booking.provider_id,
        amount_halalas: booking.price_halalas,
        currency: booking.currency ?? 'SAR',
        transaction_type: 'REFUND',
        status: 'COMPLETED',
        payment_hold_id: null,
        gateway_transaction_id: null,
        ops_note: `Cancelled by ${cancelledBy}`,
      });
    } else {
      // Pre-capture cancellation: release hold
      await this.repo.insertTransaction({
        booking_id: bookingId,
        seeker_id: booking.seeker_id,
        provider_id: booking.provider_id,
        amount_halalas: booking.price_halalas,
        currency: booking.currency ?? 'SAR',
        transaction_type: 'PAYMENT_RELEASE',
        status: 'COMPLETED',
        payment_hold_id: booking.payment_hold_id ?? null,
        gateway_transaction_id: null,
        ops_note: `Hold released — cancelled by ${cancelledBy}`,
      });
    }
  }

  // Step 4: Mark transaction payout-eligible on booking completion
  async recordBookingCompleted(bookingId: string, completedAt: Date): Promise<void> {
    // No additional transaction needed — payout eligibility is computed from
    // PAYMENT_CAPTURE (COMPLETED) + booking status = COMPLETED in repository query.
    // This method exists as a hook for future payout scheduling logic.
    await this.db('bookings')
      .where({ id: bookingId })
      .update({ completed_at: completedAt, updated_at: new Date() });
  }

  // Finance summary for provider dashboard
  async getProviderFinanceSummary(providerId: string): Promise<{
    totalEarnedHalalas: number;
    pendingPayoutHalalas: number;
    transactions: FinanceTransaction[];
    payouts: PayoutBatch[];
  }> {
    const [transactions, payouts, pendingPayout] = await Promise.all([
      this.repo.findByProviderId(providerId),
      this.repo.findPayoutsByProviderId(providerId),
      this.repo.getProviderPayoutEligibleBalance(providerId),
    ]);

    const totalEarned = transactions
      .filter((t) => t.transaction_type === 'PAYMENT_CAPTURE' && t.status === 'COMPLETED')
      .reduce((sum, t) => sum + Number(t.amount_halalas), 0);

    return {
      totalEarnedHalalas: totalEarned,
      pendingPayoutHalalas: pendingPayout,
      transactions,
      payouts,
    };
  }

  // Transactions for a booking — caller must be the seeker or provider on that booking
  async getBookingTransactions(
    bookingId: string,
    callerId: string,
    callerProviderId?: string,
  ): Promise<FinanceTransaction[]> {
    const booking = await this.db('bookings').where({ id: bookingId }).first();
    if (!booking) throw new Error(`NOT_FOUND: Booking ${bookingId}`);

    const isSeeker = booking.seeker_id === callerId;
    const isProvider = callerProviderId && booking.provider_id === callerProviderId;
    if (!isSeeker && !isProvider) {
      throw new Error('FORBIDDEN: Not authorized to view these transactions');
    }

    return this.repo.findByBookingId(bookingId);
  }

  // ── Dashboard-facing aliases (names expected by dashboard.routes.ts) ─────────

  async getProviderSummary(providerId: string) {
    return this.getProviderFinanceSummary(providerId);
  }

  async getProviderPayouts(providerId: string, opts: { limit?: number; offset?: number } = {}): Promise<PayoutBatch[]> {
    const all = await this.repo.findPayoutsByProviderId(providerId);
    const start = opts.offset ?? 0;
    return all.slice(start, start + (opts.limit ?? 20));
  }

  async getProviderTransactions(providerId: string, opts: { limit?: number; offset?: number } = {}): Promise<FinanceTransaction[]> {
    const all = await this.repo.findByProviderId(providerId);
    const start = opts.offset ?? 0;
    return all.slice(start, start + (opts.limit ?? 20));
  }
}
