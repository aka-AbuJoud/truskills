import {
  IPaymentAdapter,
  PaymentHoldResult,
  PaymentCaptureResult,
  PaymentRefundResult,
  PayoutResult,
} from './IPaymentAdapter';

// MockPaymentAdapter — development and test use only.
// isMock = true: production safety validator WILL HARD-THROW if this is active in production.
// All operations succeed deterministically. No external calls.

export class MockPaymentAdapter implements IPaymentAdapter {
  readonly isMock = true as const;

  async hold(params: {
    seekerId: string;
    providerId: string;
    listingId: string;
    amountHalalas: number;
    currency: string;
    paymentMethodId: string;
  }): Promise<PaymentHoldResult> {
    return {
      id: `mock_hold_${Date.now()}`,
      status: 'HELD',
      amount_halalas: params.amountHalalas,
      currency: params.currency,
      created_at: new Date(),
    };
  }

  async capture(holdId: string): Promise<PaymentCaptureResult> {
    return {
      id: `mock_capture_${Date.now()}`,
      hold_id: holdId,
      status: 'CAPTURED',
      amount_halalas: 0, // mock — amount not tracked across calls
      currency: 'SAR',
      captured_at: new Date(),
    };
  }

  async releaseHold(_holdId: string): Promise<void> {
    // no-op in mock
  }

  async refund(params: {
    chargeId: string;
    amountHalalas: number;
    reason: string;
  }): Promise<PaymentRefundResult> {
    return {
      id: `mock_refund_${Date.now()}`,
      charge_id: params.chargeId,
      status: 'REFUNDED',
      amount_halalas: params.amountHalalas,
      currency: 'SAR',
      refunded_at: new Date(),
    };
  }

  async payout(params: {
    providerId: string;
    amountHalalas: number;
    currency: string;
    bankAccountReference: string;
  }): Promise<PayoutResult> {
    return {
      id: `mock_payout_${Date.now()}`,
      provider_id: params.providerId,
      status: 'PROCESSING',
      amount_halalas: params.amountHalalas,
      currency: params.currency,
      initiated_at: new Date(),
      estimated_arrival: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
    };
  }

  async ping(): Promise<boolean> {
    return true;
  }
}
