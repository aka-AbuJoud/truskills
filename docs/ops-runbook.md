# TruSkills Ops Runbook
**Version:** 1.0 — Launch
**Owner:** Ops Lead
**Approvers:** Director, QA Auditor
**Last updated:** 2026-03-21

---

## 1. Provider Restriction Procedure

**Trigger:** Trust & Safety flag, legal request, or Director escalation.

**Steps:**

1. Verify the restriction reason is documented in the case management system.
2. Call `PATCH /ops/providers/:id/restrict` with `{ reason, ops_token }` — requires `OPS_TOKEN` header.
3. Confirm provider activation state transitions to `RESTRICTED_ON_HOLD` in `providers` table.
4. System automatically cancels all PENDING and CONFIRMED bookings for this provider (refunds issued to seekers via Finance module).
5. Notify provider via `RealNotificationAdapter` — type: `ACTIVATION_STATUS_CHANGED`.
6. Log restriction event in `provider_activation_log` with ops actor ID and timestamp.
7. If restriction is time-bound, schedule an unrestriction review in the case management system.

**Rollback (unrestrict):** Director approval required. Set activation state back to `ACTIVATED` via direct DB update + log entry. Re-notify provider.

---

## 2. Refund Escalation Workflow

**Trigger:** Seeker disputes charge; automatic refund failed; provider-initiated refund > 30 days post-booking.

**Steps:**

1. Identify the booking ID and associated `finance_transactions` rows.
2. Confirm the booking status — only CANCELLED or COMPLETED bookings are eligible for manual refund.
3. For automatic failure: check `RealPaymentAdapter` logs for `releaseHold()` or `refund()` error detail.
4. Initiate manual refund via payment gateway dashboard (offline — `RealPaymentAdapter.refund()` does not yet support manual trigger from ops panel).
5. Update `finance_transactions` row: set `status = 'REFUNDED'`, add `ops_note` with actor ID and reason.
6. Send `BOOKING_CANCELLED` notification to seeker confirming refund amount and timeline.
7. Record escalation in case management system with resolution outcome.

**SLA:** Refund escalation resolved within 3 business days.

---

## 3. Content Moderation Procedure

**Trigger:** User report, automated flag, or proactive review cycle.

**Scope:** Blog posts, course descriptions, product listings, trip listings, provider profiles.

**Steps:**

1. **Blog posts:** Set `blog_posts.status = 'UNDER_REVIEW'` directly in DB. Post becomes invisible to seekers. Send `BLOG_POST_REVIEWED` notification to provider with reason.
2. **Listings (courses/trips/products):** Set `is_active = false` on the listing row. No seeker-facing removal notification required at launch — ops discretion.
3. **Profiles:** Use Provider Restriction Procedure (Section 1) for full account action. For profile-only edits (bio/image), update directly in `providers` table and notify provider.
4. Document all moderation actions in case management system with content snapshot and rule violated.
5. If content requires permanent removal: DELETE the row only after Director approval. Retain audit log.

**Appeals:** Provider may reply to the moderation notification. Ops Lead reviews within 5 business days.

---

## 4. Merit Override Procedure

**Trigger:** Strategic placement request (Director-approved), data correction, or audit finding.

**Scope:** `listing_merit_overrides` table — controls `STRATEGIC` discovery slot assignment.

**Steps:**

1. Director approval required before any insert or update to `listing_merit_overrides`.
2. Insert override row: `{ listing_id, override_reason, approved_by, expires_at }`.
3. Merit engine reads this table at discovery feed build time — no cache flush needed.
4. Log the override in case management system with approval evidence.
5. All overrides must have an `expires_at` — no permanent strategic overrides at launch.
6. Run post-override audit at `expires_at` to confirm listing returns to merit-based allocation.

**Prohibited:** Setting merit scores directly. All merit scores are computed by the Merit Engine from signal events. Override table controls slot type only, not score.

---

## 5. Production Incident Response

### Severity Levels

| Level | Description | Response Time |
|-------|-------------|---------------|
| SEV-1 | Platform down / payment processing failed / data loss | 15 min |
| SEV-2 | Major feature broken / booking flow blocked | 1 hour |
| SEV-3 | Degraded feature / non-blocking bug | Next business day |

### SEV-1 / SEV-2 Procedure

1. **Declare incident** in Ops channel with: severity, affected system, initial symptoms, incident commander name.
2. **Triage:** Check production logs, `runProductionSafetyValidators` output, and adapter `ping()` status for all 4 adapters.
3. **Isolate:** If a single adapter is failing, determine if mock fallback is safe for the affected flow. **Mock adapters must NOT be re-enabled in production without Director approval.**
4. **Mitigate:** Roll back last deploy if symptoms began post-deploy. Use `git revert` — do not force-push main.
5. **Notify:** If booking or payment data is affected, notify impacted users within 2 hours via direct email (manual send via notification provider dashboard if `RealNotificationAdapter` is the failure).
6. **Resolve and document:** Post-incident report required within 48 hours. Include timeline, root cause, fix applied, and prevention measure.

### Key health checks

```bash
# Adapter ping checks (from server)
GET /health          # returns { payment, storage, notification, video } ping results

# DB connectivity
knex.raw('SELECT 1')

# Production safety static check (CI/CD)
NODE_ENV=production npx ts-node -e "require('./src/startup/production-safety-validator').runStaticProductionChecks()"
```

---

## 6. Booking Dispute Handling

**Trigger:** Seeker claims service not delivered; provider claims no-show; quality dispute.

**Steps:**

1. Retrieve booking record — confirm status is COMPLETED (only completed bookings are disputable post-service).
2. Pull associated community group messages as evidence of service contact (read-only; do not alter message records).
3. Review any session attendance data (if video session — pull `VideoSession` records from video provider dashboard).
4. **Ruling options:**
   - **Dispute upheld (seeker):** Issue partial or full refund via Refund Escalation Workflow (Section 2). Update booking with dispute resolution note.
   - **Dispute denied (provider):** Notify seeker of outcome. No financial action.
   - **Partial resolution:** Ops-negotiated amount. Manual refund for partial amount only.
5. Send outcome notification to both parties via notification provider dashboard.
6. Document ruling in case management system. Repeat disputes from same provider flagged for Trust & Safety review.

**Escalation:** If dispute involves > 5,000 SAR, Director approval required before ruling.

---

## 7. Provider Activation Appeals

**Trigger:** Provider's activation request was rejected (`NEEDS_REVISION` or not approved) and provider disputes the decision.

**Steps:**

1. Provider submits appeal via support channel — ops creates appeal case in case management system.
2. Original reviewer must not handle the appeal — assign to a different ops team member.
3. Reviewer re-examines submitted activation documents against current activation criteria.
4. If new information is provided: re-open activation review (`status = 'UNDER_REVIEW'`).
5. If no new information: uphold original decision and send formal rejection notice.
6. Appeals must be resolved within 10 business days.
7. Second appeal requires Director review — no further appeals after Director ruling.

**State transitions (appeals only):**
- `NEEDS_REVISION` → `UNDER_REVIEW` (if new docs submitted and appeal upheld by reviewer)
- `UNDER_REVIEW` → `APPROVED` → `ACTIVATED` (normal flow resumes if appeal successful)

---

## Appendix A — Required Environment Variables (Production)

| Variable | Owner | Purpose |
|----------|-------|---------|
| `PAYMENT_GATEWAY_API_KEY` | Ops | Payment adapter authentication |
| `PAYMENT_GATEWAY_SECRET` | Ops | Payment adapter signing secret |
| `STORAGE_BUCKET_NAME` | Ops | S3-compatible bucket name |
| `STORAGE_ACCESS_KEY` | Ops | Storage adapter access key |
| `NOTIFICATION_API_KEY` | Ops | Transactional email provider key |
| `VIDEO_CDN_ENDPOINT` | Ops | Video provider CDN base URL |
| `VIDEO_API_KEY` | Ops | Video provider API key |
| `PLATFORM_FEE_RATE` | Director | Platform fee percentage (decimal) |
| `PAYOUT_MINIMUM_THRESHOLD` | Director | Minimum payout in halalas |
| `PAYOUT_SCHEDULE_DAYS` | Director | Days between payout cycles |
| `BOOST_DAILY_SPEND_CAP` | Director | Max daily boost spend in halalas |
| `OPS_TOKEN` | Ops | Token for ops-protected endpoints |

All variables must be provisioned before first production deploy. See Grand Opening Gate checklist.

---

## Appendix B — Governance-Protected Files

The following files require Director + QA Auditor dual-approval before any merge:

- `src/startup/production-safety-validator.ts`
- `src/modules/merit/merit.service.ts` (weight distribution and allocation formula)
- `src/modules/finance/finance.service.ts`
- `.github/CODEOWNERS`

Any PR touching these files without dual-approval must be blocked at review.
