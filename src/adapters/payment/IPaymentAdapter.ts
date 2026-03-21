// Payment adapter interface — provider-agnostic (LOCKED).
// All payment operations route through this interface.
// No business logic may call vendor-specific APIs directly.

export interface PaymentHoldResult {
  id: string;                  // hold/authorization ID — referenced by bookings
  status: 'HELD';
  amount_halalas: number;
  currency: string;
  created_at: Date;
}

export interface PaymentCaptureResult {
  id: string;                  // capture/charge ID
  hold_id: string;
  status: 'CAPTURED';
  amount_halalas: number;
  currency: string;
  captured_at: Date;
}

export interface PaymentRefundResult {
  id: string;
  charge_id: string;
  status: 'REFUNDED' | 'PARTIAL_REFUND';
  amount_halalas: number;
  currency: string;
  refunded_at: Date;
}

export interface PayoutResult {
  id: string;
  provider_id: string;
  status: 'PROCESSING' | 'PAID';
  amount_halalas: number;
  currency: string;
  initiated_at: Date;
  estimated_arrival: Date | null;
}

export interface IPaymentAdapter {
  readonly isMock: boolean;

  // Pre-authorize (hold) funds at booking creation
  hold(params: {
    seekerId: string;
    providerId: string;
    listingId: string;
    amountHalalas: number;
    currency: string;
    paymentMethodId: string;
  }): Promise<PaymentHoldResult>;

  // Capture held funds at booking confirmation
  capture(holdId: string): Promise<PaymentCaptureResult>;

  // Release a hold without capture (cancelled before confirmation)
  releaseHold(holdId: string): Promise<void>;

  // Refund a captured charge (post-confirmation cancellation)
  refund(params: {
    chargeId: string;
    amountHalalas: number;
    reason: string;
  }): Promise<PaymentRefundResult>;

  // Initiate payout to provider (Finance-initiated)
  payout(params: {
    providerId: string;
    amountHalalas: number;
    currency: string;
    bankAccountReference: string;
  }): Promise<PayoutResult>;

  // Health check — used by bootstrap to confirm adapter is responsive
  ping(): Promise<boolean>;
}
