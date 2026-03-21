// ── Production Safety Validator ───────────────────────────────────────────────
//
// GOVERNANCE-PROTECTED FILE — requires Director + QA Auditor review before merge.
// Ref: 02_Build_Governance_Memory_Pack.md — "Production Safety Validators (3 checks)"
//
// All 3 checks are hard stops. Server does not start if any check fails.
// No bypass patterns are permitted. See prohibited bypass list in governance pack.
// This file also runs in CI/CD pre-deployment (static, no server start required).

const REQUIRED_CREDENTIALS = [
  'PAYMENT_GATEWAY_API_KEY',
  'PAYMENT_GATEWAY_SECRET',
  'STORAGE_BUCKET_NAME',
  'STORAGE_ACCESS_KEY',
  'NOTIFICATION_API_KEY',
  'VIDEO_CDN_ENDPOINT',
] as const;

const COMMERCIAL_CONSTANTS = [
  'PLATFORM_FEE_RATE',
  'PAYOUT_MINIMUM_THRESHOLD',
  'PAYOUT_SCHEDULE_DAYS',
  'BOOST_DAILY_SPEND_CAP',
] as const;

// Adapter instances are passed in from bootstrap — not imported here.
// This keeps the validator decoupled from specific adapter implementations.
export interface AdapterValidationTarget {
  name: string;
  isMock: boolean;
}

export function runProductionSafetyValidators(adapters: AdapterValidationTarget[]): void {
  const env = process.env.NODE_ENV;

  if (env !== 'production') {
    // Non-production: log warnings but do not throw.
    // This allows dev/staging to run with mocks and placeholder values.
    _warnNonProduction(adapters);
    return;
  }

  // ── Check 1: Adapter binding validation ────────────────────────────────────
  // No mock adapter may be active in production.
  const mockAdapters = adapters.filter((a) => a.isMock);
  if (mockAdapters.length > 0) {
    throw new Error(
      `PRODUCTION_SAFETY_VIOLATION [Check 1 — Adapter Binding]: ` +
      `Mock adapters detected in production: ${mockAdapters.map((a) => a.name).join(', ')}. ` +
      `No mock adapter may be active in a production environment. ` +
      `Replace with real adapter implementations before deploying.`,
    );
  }

  // ── Check 2: Placeholder config value detection ────────────────────────────
  // No commercial constant may be '__PLACEHOLDER__' or unset in production.
  const badConstants: string[] = [];
  for (const key of COMMERCIAL_CONSTANTS) {
    const val = process.env[key];
    if (!val || val === '__PLACEHOLDER__' || val.trim() === '') {
      badConstants.push(key);
    }
  }
  if (badConstants.length > 0) {
    throw new Error(
      `PRODUCTION_SAFETY_VIOLATION [Check 2 — Placeholder Config]: ` +
      `Unset or placeholder commercial constants detected: ${badConstants.join(', ')}. ` +
      `All constants must be set to real production values (Director + Build Lead sign-off required). ` +
      `Default '__PLACEHOLDER__' values must not reach production.`,
    );
  }

  // ── Check 3: Required credentials presence ─────────────────────────────────
  // All required credentials must be present in production.
  const missingCreds: string[] = [];
  for (const key of REQUIRED_CREDENTIALS) {
    const val = process.env[key];
    if (!val || val.trim() === '') {
      missingCreds.push(key);
    }
  }
  if (missingCreds.length > 0) {
    throw new Error(
      `PRODUCTION_SAFETY_VIOLATION [Check 3 — Required Credentials]: ` +
      `Missing required credentials: ${missingCreds.join(', ')}. ` +
      `All production credentials must be provisioned before deployment (Ops responsibility). ` +
      `Server will not start without them.`,
    );
  }
}

// Utility: run validators and hard-exit if any fail (use at bootstrap entry point)
export function runProductionSafetyValidatorsOrExit(adapters: AdapterValidationTarget[]): void {
  try {
    runProductionSafetyValidators(adapters);
  } catch (err: any) {
    // eslint-disable-next-line no-console
    console.error('\n\n🚨 PRODUCTION SAFETY VIOLATION — SERVER WILL NOT START\n');
    // eslint-disable-next-line no-console
    console.error(err.message);
    // eslint-disable-next-line no-console
    console.error('\nTo fix: provision all required values. Contact Build Lead or Ops.\n');
    process.exit(1);
  }
}

// Static variant for CI/CD pre-deployment check (no adapters available — checks 2 + 3 only)
export function runStaticProductionChecks(): void {
  const env = process.env.NODE_ENV;
  if (env !== 'production') return;

  const badConstants: string[] = [];
  for (const key of COMMERCIAL_CONSTANTS) {
    const val = process.env[key];
    if (!val || val === '__PLACEHOLDER__' || val.trim() === '') {
      badConstants.push(key);
    }
  }

  const missingCreds: string[] = [];
  for (const key of REQUIRED_CREDENTIALS) {
    const val = process.env[key];
    if (!val || val.trim() === '') {
      missingCreds.push(key);
    }
  }

  const violations = [...badConstants, ...missingCreds];
  if (violations.length > 0) {
    throw new Error(
      `STATIC_PRODUCTION_CHECK_FAILED: Missing or placeholder values: ${violations.join(', ')}. ` +
      `Release candidate blocked.`,
    );
  }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function _warnNonProduction(adapters: AdapterValidationTarget[]): void {
  const mockAdapters = adapters.filter((a) => a.isMock);
  const badConstants = COMMERCIAL_CONSTANTS.filter((k) => {
    const v = process.env[k];
    return !v || v === '__PLACEHOLDER__';
  });
  const missingCreds = REQUIRED_CREDENTIALS.filter((k) => !process.env[k]?.trim());

  if (mockAdapters.length > 0) {
    // eslint-disable-next-line no-console
    console.warn(`[ProductionSafetyValidator] Non-production: mock adapters active: ${mockAdapters.map((a) => a.name).join(', ')}`);
  }
  if (badConstants.length > 0) {
    // eslint-disable-next-line no-console
    console.warn(`[ProductionSafetyValidator] Non-production: placeholder constants: ${badConstants.join(', ')}`);
  }
  if (missingCreds.length > 0) {
    // eslint-disable-next-line no-console
    console.warn(`[ProductionSafetyValidator] Non-production: missing credentials: ${missingCreds.join(', ')}`);
  }
}
