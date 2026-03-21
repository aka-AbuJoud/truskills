import {
  IPaymentAdapter,
  PaymentHoldResult,
  PaymentCaptureResult,
  PaymentRefundResult,
  PayoutResult,
} from './IPaymentAdapter';

// SandboxPaymentAdapter — non-production, staging/dev only.
// Targets Moyasar test API (Saudi-first payment gateway).
// Sandbox key prefix: sk_test_* — obtain free at moyasar.com
// Swap-ready: replace with RealPaymentAdapter when production keys confirmed.
// DO NOT use in production — isMock flag triggers safety validator rejection.
//
// Required env:
//   PAYMENT_SANDBOX_API_KEY=sk_test_xxxx   (Moyasar test key)

const MOYASAR_API_BASE = 'https://api.moyasar.com/v1';

export class SandboxPaymentAdapter implements IPaymentAdapter {
  readonly isMock = true as const; // intentional: blocks production boot

  private readonly apiKey: string | undefined;

  constructor() {
    // Key validated lazily at first API call. Constructor must not throw — see RealPaymentAdapter.
    this.apiKey = process.env.PAYMENT_SANDBOX_API_KEY;
  }

  private get authHeader(): string {
    if (!this.apiKey) throw new Error('SandboxPaymentAdapter: PAYMENT_SANDBOX_API_KEY is not set.');
    return 'Basic ' + Buffer.from(`${this.apiKey}:`).toString('base64');
  }

  private async _post(path: string, body: Record<string, unknown>): Promise<any> {
    const res = await fetch(`${MOYASAR_API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Authorization': this.authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`SandboxPaymentAdapter: ${path} failed ${res.status}: ${text}`);
    }
    return res.json();
  }

  async hold(params: {
    seekerId: string;
    providerId: string;
    listingId: string;
    amountHalalas: number;
    currency: string;
    paymentMethodId: string;
  }): Promise<PaymentHoldResult> {
    const data = await this._post('/payments', {
      amount: params.amountHalalas,
      currency: params.currency,
      source: { type: 'token', token: params.paymentMethodId },
      description: `Booking: listing ${params.listingId}`,
      capture: false, // authorize-only (hold)
      metadata: { seeker_id: params.seekerId, provider_id: params.providerId },
    });
    return {
      id: data.id,
      status: 'HELD',
      amount_halalas: data.amount,
      currency: data.currency,
      created_at: new Date(data.created_at ?? Date.now()),
    };
  }

  async capture(holdId: string): Promise<PaymentCaptureResult> {
    const data = await this._post(`/payments/${holdId}/capture`, {});
    return {
      id: data.id,
      hold_id: holdId,
      status: 'CAPTURED',
      amount_halalas: data.amount,
      currency: data.currency,
      captured_at: new Date(),
    };
  }

  async releaseHold(holdId: string): Promise<void> {
    await this._post(`/payments/${holdId}/void`, {});
  }

  async refund(params: { chargeId: string; amountHalalas: number; reason: string }): Promise<PaymentRefundResult> {
    const data = await this._post(`/payments/${params.chargeId}/refund`, {
      amount: params.amountHalalas,
      description: params.reason,
    });
    return {
      id: data.id,
      charge_id: params.chargeId,
      status: 'REFUNDED',
      amount_halalas: params.amountHalalas,
      currency: data.currency ?? 'SAR',
      refunded_at: new Date(),
    };
  }

  async payout(params: {
    providerId: string;
    amountHalalas: number;
    currency: string;
    bankAccountReference: string;
  }): Promise<PayoutResult> {
    // Moyasar Transfers API requires additional setup — stub for sandbox
    return {
      id: `sandbox_payout_${Date.now()}`,
      provider_id: params.providerId,
      status: 'PROCESSING',
      amount_halalas: params.amountHalalas,
      currency: params.currency,
      initiated_at: new Date(),
      estimated_arrival: null,
    };
  }

  async ping(): Promise<boolean> {
    if (!this.apiKey) return false;
    try {
      const res = await fetch(`${MOYASAR_API_BASE}/payments?per_page=1`, {
        headers: { 'Authorization': this.authHeader },
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}
