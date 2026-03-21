// Adapter Registry — bootstrap binding for all provider-agnostic adapters.
//
// Usage:
//   const adapters = buildAdapters();
//   runProductionSafetyValidatorsOrExit(adapters.validationTargets());
//   // Then inject adapters into services that need them.
//
// Environment tiers:
//   NODE_ENV=production  → Real adapters (throws on missing credentials)
//   NODE_ENV=staging     → Staging adapters (sandbox payment, local storage, console notifications, mock video)
//   Any other value      → Mock adapters (pure in-memory, no I/O, safe for unit tests)

import { IPaymentAdapter } from './payment/IPaymentAdapter';
import { MockPaymentAdapter } from './payment/MockPaymentAdapter';
import { SandboxPaymentAdapter } from './payment/SandboxPaymentAdapter';
import { RealPaymentAdapter } from './payment/RealPaymentAdapter';

import { IStorageAdapter } from './storage/IStorageAdapter';
import { MockStorageAdapter } from './storage/MockStorageAdapter';
import { LocalStorageAdapter } from './storage/LocalStorageAdapter';
import { RealStorageAdapter } from './storage/RealStorageAdapter';

import { INotificationAdapter } from './notification/INotificationAdapter';
import { MockNotificationAdapter } from './notification/MockNotificationAdapter';
import { ConsoleNotificationAdapter } from './notification/ConsoleNotificationAdapter';
import { RealNotificationAdapter } from './notification/RealNotificationAdapter';

import { IVideoAdapter } from './video/IVideoAdapter';
import { MockVideoAdapter } from './video/MockVideoAdapter';
import { RealVideoAdapter } from './video/RealVideoAdapter';

import { AdapterValidationTarget } from '../startup/production-safety-validator';

export interface AdapterRegistry {
  payment: IPaymentAdapter;
  storage: IStorageAdapter;
  notification: INotificationAdapter;
  video: IVideoAdapter;
  validationTargets(): AdapterValidationTarget[];
}

export function buildAdapters(): AdapterRegistry {
  const env = process.env.NODE_ENV;
  const isProduction = env === 'production';
  const isStaging = env === 'staging';

  // ── Payment ──────────────────────────────────────────────────────────────────
  // staging: Moyasar sandbox (sk_test_*) — requires PAYMENT_SANDBOX_API_KEY
  // production: Real gateway — requires PAYMENT_GATEWAY_API_KEY + SECRET
  const payment: IPaymentAdapter = isProduction
    ? new RealPaymentAdapter()
    : isStaging
      ? new SandboxPaymentAdapter()
      : new MockPaymentAdapter();

  // ── Storage ──────────────────────────────────────────────────────────────────
  // staging: Local filesystem — writes to LOCAL_STORAGE_DIR (default ./tmp/storage)
  // production: Real S3-compatible — requires STORAGE_BUCKET_NAME + STORAGE_ACCESS_KEY
  const storage: IStorageAdapter = isProduction
    ? new RealStorageAdapter()
    : isStaging
      ? new LocalStorageAdapter()
      : new MockStorageAdapter();

  // ── Notification ─────────────────────────────────────────────────────────────
  // staging: Console/log output — optionally writes to NOTIFICATION_LOG_FILE
  // production: Real email provider — requires NOTIFICATION_API_KEY
  const notification: INotificationAdapter = isProduction
    ? new RealNotificationAdapter()
    : isStaging
      ? new ConsoleNotificationAdapter()
      : new MockNotificationAdapter();

  // ── Video ────────────────────────────────────────────────────────────────────
  // staging: Mock (in-memory) — video vendor TBD, mock sufficient for staging flow validation
  // production: Real video provider — requires VIDEO_CDN_ENDPOINT + VIDEO_API_KEY
  // Replace MockVideoAdapter with a real staging video adapter once vendor confirmed.
  const video: IVideoAdapter = isProduction
    ? new RealVideoAdapter()
    : new MockVideoAdapter(); // used for both staging and test

  return {
    payment,
    storage,
    notification,
    video,
    validationTargets(): AdapterValidationTarget[] {
      return [
        { name: 'PaymentAdapter', isMock: payment.isMock },
        { name: 'StorageAdapter', isMock: storage.isMock },
        { name: 'NotificationAdapter', isMock: notification.isMock },
        { name: 'VideoAdapter', isMock: video.isMock },
      ];
    },
  };
}
