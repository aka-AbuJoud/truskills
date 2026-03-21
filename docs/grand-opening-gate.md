# TruSkills — Grand Opening Gate
**Version:** 1.0
**Date:** 2026-03-21
**Status:** READY FOR LAUNCH — conditional on 4 named owner-action items

---

## Gate Verdict

Engineering complete. Architecture discipline held across all 11 phases (A–K).
Locked decisions not reopened. Ownership boundaries not crossed.
No hidden assumptions in launch blocker set.

**Grand Opening is authorized the moment the 4 blockers below close.**

---

## The 4 Blockers

### BLOCKER 1 — Governance sign-off on production-safety-validator.ts
**Owner:** Director + QA Auditor
**File:** `src/startup/production-safety-validator.ts`
**Why it blocks:** Governance-protected path. Cannot merge to production branch without both approvals. Without this file live, bootstrap Check 1 is unavailable, meaning a mock adapter could silently reach production — violating the hardest governance rule in the project.
**Closure:** Director approves + QA Auditor approves. PR merged. Confirmation on file.

---

### BLOCKER 2 — Production credentials provisioned
**Owner:** Ops / Director
**Credentials required:**
- PAYMENT_GATEWAY_API_KEY
- PAYMENT_GATEWAY_SECRET
- STORAGE_BUCKET_NAME
- STORAGE_ACCESS_KEY
- NOTIFICATION_API_KEY
- VIDEO_CDN_ENDPOINT
**Why it blocks:** Server will not start in production without all 6 (bootstrap Check 3). No financial transactions, file uploads, notifications, or video delivery are possible without them.
**Closure:** All 6 provisioned in production environment. Bootstrap Check 3 passes on pre-launch boot test.

---

### BLOCKER 3 — Real adapter implementations present
**Owner:** Build Lead (code) + Ops (credentials above)
**Adapters:** PaymentAdapter, StorageAdapter, NotificationAdapter, VideoAdapter
**Why it blocks:** Phase A delivered adapter interfaces and mock implementations. Real implementations (RealPaymentProvider, RealStorageProvider, etc.) must exist and be bound for production. Bootstrap Check 1 will hard-throw if any adapter has `isMock = true` in production.
**Closure:** Confirm all 4 real adapter implementations are present and correctly bound. Bootstrap Check 1 passes on pre-launch boot test.

---

### BLOCKER 4 — Ops runbook authored and team briefed
**Owner:** Build Lead + Ops
**Runbook must cover:**
1. Provider restriction triggers, procedure, and resolution path
2. Refund escalation workflow (REFUND_REQUESTED → REFUNDED)
3. Content moderation — blog post rejection, community message removal
4. Merit score manual override procedure (`POST /merit/ops/providers/:id/refresh`)
5. Production incident response — who, escalation chain, rollback procedure
6. Booking dispute handling
7. Provider activation appeals
**Why it blocks:** TruSkills is a trust-centered, Saudi-first marketplace. Operating it without an ops-ready team is not consistent with that identity. A provider or seeker with an escalation on Day 1 that goes unhandled is a trust event, not just an ops gap.
**Closure:** Runbook document complete, reviewed, and accessible to ops team. Team briefed. Lead ops person confirms readiness in writing before Grand Opening date.

---

## What Is Complete

All engineering and architecture work across Phases A–K:

| Phase | Description | Status |
|-------|-------------|--------|
| A | Foundation — auth, infrastructure, adapter interfaces, DB bootstrap | ✅ Closed |
| B | Provider Activation — 8-state machine, activation routes | ✅ Closed |
| C | Finance Core — payment capture, payouts, refunds | ✅ Closed |
| D | Services — Courses (4 channels), Trips, Products | ✅ Closed |
| E | Bookings Engine — state machine, access control, cancellations | ✅ Closed |
| F | Community — threads, DMs, groups (system-triggered only) | ✅ Closed |
| G | Blog + Legacy — review workflow, certificate lineage | ✅ Closed |
| H | Merit Engine — 8 signals, 60/25/15 allocation, tier output | ✅ Closed |
| I | Seeker Experience — discovery, search, reviews, bookings, enrollments | ✅ Closed |
| J | Provider Dashboard — all 13 nav sections, marketing, analytics | ✅ Closed |
| K | Integration + QA — signal triggers, contract reconciliation, safety validator, LB review | ✅ Closed |

Locked decisions in force:
- Discovery allocation: 60/25/15 ✅
- Merit signal hierarchy: 8 signals, heavy 1–4 cannot be outweighed ✅
- Location privacy: city/district pre-booking, exact post-confirmed ✅
- Community: system-triggered only, no self-initiation ✅
- Finance: single authoritative money source ✅
- Blog: all public content requires TruSkills review ✅
- Legacy: on-platform qualification only, no external import ✅
- Activation: 8 states, draft-save permitted, publish/discovery/bookings require ACTIVATED ✅
- Marketing: self-serve boost only at launch ✅

---

## Grand Opening Authorization

When all 4 blockers are signed off:

> **"TruSkills is authorized for Grand Opening."**
> Signed: Director _____________ Date: _______
> Signed: Build Lead _____________ Date: _______
> Signed: QA Auditor _____________ Date: _______
