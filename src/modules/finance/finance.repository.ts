import { Knex } from 'knex';

export interface FinanceTransaction {
  id: string;
  booking_id: string | null;
  seeker_id: string | null;
  provider_id: string | null;
  amount_halalas: number;
  currency: string;
  transaction_type: 'PAYMENT_HOLD' | 'PAYMENT_CAPTURE' | 'PAYMENT_RELEASE' | 'REFUND' | 'PAYOUT';
  status: 'PENDING' | 'COMPLETED' | 'FAILED' | 'REFUNDED';
  payment_hold_id: string | null;
  gateway_transaction_id: string | null;
  ops_note: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface PayoutBatch {
  id: string;
  provider_id: string;
  total_halalas: number;
  currency: string;
  status: 'PENDING' | 'QUEUED' | 'PROCESSED' | 'FAILED';
  payout_reference: string | null;
  scheduled_at: Date | null;
  processed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export class FinanceRepository {
  constructor(private readonly db: Knex) {}

  async insertTransaction(
    data: Omit<FinanceTransaction, 'id' | 'created_at' | 'updated_at'>,
  ): Promise<FinanceTransaction> {
    const [row] = await this.db('finance_transactions')
      .insert({ ...data, created_at: new Date(), updated_at: new Date() })
      .returning('*');
    return row as FinanceTransaction;
  }

  async findByBookingId(bookingId: string): Promise<FinanceTransaction[]> {
    return this.db('finance_transactions')
      .where({ booking_id: bookingId })
      .orderBy('created_at', 'asc') as unknown as FinanceTransaction[];
  }

  async findByProviderId(providerId: string): Promise<FinanceTransaction[]> {
    return this.db('finance_transactions')
      .where({ provider_id: providerId })
      .orderBy('created_at', 'desc') as unknown as FinanceTransaction[];
  }

  async updateTransactionStatus(
    transactionId: string,
    status: FinanceTransaction['status'],
    gatewayTxId?: string,
    opsNote?: string,
  ): Promise<FinanceTransaction> {
    const update: Record<string, unknown> = { status, updated_at: new Date() };
    if (gatewayTxId !== undefined) update.gateway_transaction_id = gatewayTxId;
    if (opsNote !== undefined) update.ops_note = opsNote;

    const [row] = await this.db('finance_transactions')
      .where({ id: transactionId })
      .update(update)
      .returning('*');
    return row as FinanceTransaction;
  }

  async getProviderPayoutEligibleBalance(providerId: string): Promise<number> {
    // Sum of COMPLETED captures for COMPLETED bookings not yet included in a PROCESSED payout
    const result = await this.db('finance_transactions as ft')
      .join('bookings as b', 'b.id', 'ft.booking_id')
      .where('ft.provider_id', providerId)
      .where('ft.transaction_type', 'PAYMENT_CAPTURE')
      .where('ft.status', 'COMPLETED')
      .where('b.status', 'COMPLETED')
      .whereNotExists(
        this.db('payout_batches as pb')
          .whereRaw('pb.provider_id = ft.provider_id')
          .whereIn('pb.status', ['QUEUED', 'PROCESSED']),
      )
      .sum('ft.amount_halalas as total')
      .first();
    return Number(result?.total ?? 0);
  }

  async createPayoutBatch(
    data: Omit<PayoutBatch, 'id' | 'created_at' | 'updated_at'>,
  ): Promise<PayoutBatch> {
    const [row] = await this.db('payout_batches')
      .insert({ ...data, created_at: new Date(), updated_at: new Date() })
      .returning('*');
    return row as PayoutBatch;
  }

  async findPayoutsByProviderId(providerId: string): Promise<PayoutBatch[]> {
    return this.db('payout_batches')
      .where({ provider_id: providerId })
      .orderBy('created_at', 'desc') as unknown as PayoutBatch[];
  }
}
