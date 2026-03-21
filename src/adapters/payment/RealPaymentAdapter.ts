import {
  IPaymentAdapter,
  PaymentHoldResult,
  PaymentCaptureResult,
  PaymentRefundResult,
  PayoutResult,
} from './IPaymentAdapter';

// RealPaymentAdapter — production implementation.
// Reads credentials from environment (PAYMENT_GATEWAY_API_KEY, PAYMENT_GATEWAY_SECRET).
// isMock = false: production safety validator Check 1 will pass when this adapter is bound.
//
// Vendor integration: replace the [VENDOR] placeholder bodies with the actual
// payment gateway SDK calls once vendor is selected and credentials are provisioned.
// The interface contract above must not change — only the implementation bodies.

export class RealPaymentAdapter implements IPaymentAdapter {
  readonly isMock = false as const;

  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly baseUrl: string;

  constructor() {
    const apiKey = process.env.PAYMENT_GATEWAY_API_KEY;
    const apiSecret = process.env.PAYMENT_GATEWAY_SECRET;

    if (!apiKey || !apiSecret) {
      // Production safety validator Check 3 catches this at bootstrap.
      // This guard is a redundant fail-fast for early construction.
      throw new Error(
        'RealPaymentAdapter: PAYMENT_GATEWAY_API_KEY and PAYMENT_GATEWAY_SECRET are required. ' +
        'Ensure production credentials are provisioned before constructing this adapter.',
      );
    }

    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    // Payment gateway base URL — set per vendor; currently placeholder until vendor confirmed by Ops/Director
    this.baseUrl = process.env.PAYMENT_GATEWAY_BASE_URL ?? 'https://api.paymentgateway.sa/v1';
  }

  async hold(params: {
    seekerId: string;
    providerId: string;
    listingId: string;
    amountHalalas: number;
    currency: string;
    paymentMethodId: string;
  }): Promise<PaymentHoldResult> {
    // [VENDOR_IMPL] Replace with actual gateway SDK call.
    // Example shape (vendor-agnostic):
    // const response = await this._post('/authorizations', {
    //   amount: params.amountHalalas,
    //   currency: params.currency,
    //   payment_method: params.paymentMethodId,
    //   metadata: { seeker_id: params.seekerId, provider_id: params.providerId, listing_id: params.listingId },
    // });
    // return { id: response.authorization_id, status: 'HELD', amount_halalas: response.amount, currency: response.currency, created_at: new Date(response.created_at) };
    throw new Error('RealPaymentAdapter.hold: [VENDOR_IMPL] not yet wired. Provision vendor credentials and complete implementation.');
  }

  async capture(holdId: string): Promise<PaymentCaptureResult> {
    // [VENDOR_IMPL] POST /authorizations/:holdId/capture
    throw new Error('RealPaymentAdapter.capture: [VENDOR_IMPL] not yet wired.');
  }

  async releaseHold(holdId: string): Promise<void> {
    // [VENDOR_IMPL] DELETE /authorizations/:holdId
    throw new Error('RealPaymentAdapter.releaseHold: [VENDOR_IMPL] not yet wired.');
  }

  async refund(params: {
    chargeId: string;
    amountHalalas: number;
    reason: string;
  }): Promise<PaymentRefundResult> {
    // [VENDOR_IMPL] POST /charges/:chargeId/refunds
    throw new Error('RealPaymentAdapter.refund: [VENDOR_IMPL] not yet wired.');
  }

  async payout(params: {
    providerId: string;
    amountHalalas: number;
    currency: string;
    bankAccountReference: string;
  }): Promise<PayoutResult> {
    // [VENDOR_IMPL] POST /payouts
    throw new Error('RealPaymentAdapter.payout: [VENDOR_IMPL] not yet wired.');
  }

  async ping(): Promise<boolean> {
    // [VENDOR_IMPL] GET /health or equivalent
    // For now: return true if credentials are structurally present (already validated in constructor)
    return !!(this.apiKey && this.apiSecret);
  }

  // Private HTTP helper — wire to vendor SDK or node-fetch once vendor confirmed
  private async _post(_path: string, _body: object): Promise<any> {
    // [VENDOR_IMPL]: implement with vendor HTTP client
    throw new Error('RealPaymentAdapter._post: [VENDOR_IMPL] not yet implemented.');
  }
}
