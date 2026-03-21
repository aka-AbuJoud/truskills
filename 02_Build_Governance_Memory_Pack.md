---
name: TruSkills Build Governance Memory Pack
type: project
---

# 1. Section
- **Name:** Build Governance Memory Pack
- **Version:** 1.1
- **Date:** 2026-03-20
- **Prepared by:** Build Lead + QA Auditor

---

# 2. Purpose
Complete locked governance rules for TruSkills Phase 1 build execution. Covers provider-agnostic adapter pattern, production safety validators, configurable commercial constants, repository governance (CODEOWNERS, branch protection), exception record process, and sprint-end QA audit procedure. Load alongside the Master Continuity Record for any session involving build execution, deployment, or governance.

---

# 3. Locked Decisions

- All vendor-specific integrations are built behind provider-agnostic adapter interfaces
- Production safety validators are hard stops — not warnings, not optional
- No mock adapter may be active in a production environment
- No placeholder config value may be active in a production environment
- All 4 commercial constants are configurable via environment config — never hardcoded
- No permanent exception to any production safety rule is permitted
- Governance-protected paths require Director + QA Auditor review before merge — no exceptions
- Admin bypass of branch protection requires a logged exception record before execution
- Sprint-end QA audit is mandatory — not deferrable
- Build Lead controls placeholder usage. Build Lead + Director sign-off required before any placeholder becomes a production value.
- Vendor procurement runs parallel to engineering — it is not on the engineering critical path.

---

# 4. Ownership Boundaries

This pack defines the locked governance rules for:
- adapter abstraction
- production safety validation
- repository protection
- exception handling
- sprint-end governance audit

Execution remains with the responsible roles (Build Lead, QA Auditor, Director/Ops as applicable).

**This pack does not own**
- Vendor selection (Ops/Director)
- Commercial rate decisions (Director)
- Legal/compliance matrix (Legal/Director)
- Production credential provisioning (Ops)

---

# 5. Dependencies

**Upstream**
- Director approval required before any placeholder becomes a production value
- Director + QA Auditor approval required before any PR merging to governance-protected paths

**Downstream**
- All modules depend on adapter interfaces being defined before vendor-specific code is written
- All production deployments depend on safety validators passing
- All sprint closures depend on QA audit completing

**Trigger Relationships**
- PR touches protected path → governance gate activates (both approvals required)
- Admin bypass event → immediate P0 escalation to Director (no waiting for sprint end)
- Exception record expires → validator re-engagement automatic
- Sprint ends → QA audit executes before sprint formally closes

---

# 6. Final Rules / Logic

**Provider-Agnostic Adapter Pattern**

The provider-agnostic adapter pattern is locked for the currently required integration surfaces: Payment, Storage, Notification, and Video.

All vendor-dependent integrations ship as a two-layer construct:

```
Layer 1: Interface (defined at build start, never vendor-specific)
  PaymentAdapter      → charge(), refund(), getStatus()
  StorageAdapter      → upload(), getUrl(), delete()
  NotificationAdapter → send(type, recipient, payload)
  VideoAdapter        → uploadVideo(), getStreamUrl(), getAccessUrl()

Layer 2: Provider implementation (swapped in when credentials arrive)
  MockPaymentProvider      implements PaymentAdapter  [isMock = true]
  RealPaymentProvider      implements PaymentAdapter
  MockStorageProvider      implements StorageAdapter  [isMock = true]
  RealStorageProvider      implements StorageAdapter
  (same pattern for all adapters)
```

Rule: No business logic may call vendor-specific APIs directly. All calls go through adapter interface.
Rule: Every mock class must carry `isMock = true` as a class property.

**Production Safety Validators (3 checks — all mandatory, all hard stops)**

```
Check 1: Adapter binding validation
  → If ENV = production and any adapter resolves to a mock (isMock = true) → hard throw

Check 2: Placeholder config value detection
  → If ENV = production and any commercial constant = '__PLACEHOLDER__' or unset → hard throw
  → Constants checked: PLATFORM_FEE_RATE, PAYOUT_MINIMUM_THRESHOLD,
                       PAYOUT_SCHEDULE_DAYS, BOOST_DAILY_SPEND_CAP

Check 3: Required credentials presence
  → If ENV = production and any required credential is missing → hard throw
  → Credentials checked: PAYMENT_GATEWAY_API_KEY, PAYMENT_GATEWAY_SECRET,
                         STORAGE_BUCKET_NAME, STORAGE_ACCESS_KEY,
                         NOTIFICATION_API_KEY, VIDEO_CDN_ENDPOINT
```

All 3 validators run in bootstrap before server accepts any traffic.
All 3 validators also run in CI/CD pre-deployment step (static, no server start).
Server does not start if any check fails. Release candidate is blocked.

**Prohibited bypass patterns (code review rejection criteria)**
```
SKIP_VALIDATION=true           → rejected
--bypass-safety-check          → rejected
if (FORCE_START) return        → rejected
try { validate() } catch {}    → rejected (swallowed failure = silent bypass)
warnings.push() instead of throw new Error() → rejected (downgrade to warning)
allow_failure: true in pipeline step → rejected without Director approval + exception record
```

**Configurable Commercial Constants**

```
PLATFORM_FEE_RATE          → env / config  [PLACEHOLDER — NOT PRODUCTION]
PAYOUT_MINIMUM_THRESHOLD   → env / config  [PLACEHOLDER — NOT PRODUCTION]
PAYOUT_SCHEDULE_DAYS       → env / config  [PLACEHOLDER — NOT PRODUCTION]
BOOST_DAILY_SPEND_CAP      → env / config  [PLACEHOLDER — NOT PRODUCTION]
```

Default value for all = `__PLACEHOLDER__`. Not `0`, not `null`, not a real-looking number.
Hardcoding any of these = build error.

**Repository Governance — Protected Paths**
```
scripts/production-readiness-check.*     → Director + QA Auditor review required
bootstrap.* / src/bootstrap/             → Director + QA Auditor review required
src/startup/                             → Director + QA Auditor review required
.github/workflows/deploy*                → Director + QA Auditor review required
.github/workflows/production*           → Director + QA Auditor review required
exceptions/production-safety/           → Director + QA Auditor review required
```

CODEOWNERS: all protected paths assigned to @director and @qa-auditor.
Branch protection: `required_approving_review_count: 2`, `require_code_owner_reviews: true`.
`bypass_pull_request_allowances: []` — empty. No bypass users, no bypass teams.

**Exception Record — Required Structure**
```
ID:            EX-[sequential number]
Date:          [ISO date]
Approved by:   Director (name + confirmation reference)
Validator(s):  [which check(s) are excepted]
Reason:        [specific — not generic]
Scope:         [which environment / deployment / service]
Duration:      [start date → end date — mandatory, no open-ended entries]
Owner:         [named individual responsible for rollback]
Rollback plan: [exact steps to restore full validation]

Logged to:     /exceptions/production-safety/EX-[id].md
```

No deployment proceeds without this record committed and visible to QA.
No permanent exception. Duration field must have an explicit end date.
Exception records are themselves governance-protected (Director + QA Auditor to modify).

**Exception Approval Chain**
```
Engineer identifies need → Build Lead assesses → if unresolvable: escalates to Director
→ Director approves → exception record created and committed → QA notified in writing
→ deployment proceeds within stated scope and duration
→ exception expires on stated date → validators re-engage automatically
```

Any step skipped = exception invalid = deployment blocked.
Build Lead cannot self-approve. Director sign-off is mandatory.

**Sprint-End QA Audit — 4 Steps**

```
Step 1: Protected path PR review
  → List all merged PRs for sprint period
  → Filter by protected paths
  → Verify each PR has Director approval, QA Auditor approval, no auto-merge, correct timestamp order

Step 2: Exception record audit
  → Verify all records have required fields and explicit end dates
  → Verify expired records = validators re-engaged
  → Verify extended records = new Director approval present

Step 3: Admin bypass audit
  → Review repository audit log for admin push / protection override events
  → Every bypass must have a matching exception record committed BEFORE the bypass

Step 4: Cross-reference check
  → PR list ↔ exception records ↔ bypass log
  → Any event in repo history with no corresponding exception record = BREACH LOG entry
```

**Breach Log Entry — Required Fields**
```
ID, Sprint, Detected date, Detected by, Type, Event reference,
Description, Severity (P0/P1/P2), Escalated to, Escalation timestamp, Resolution
```

Breach log entries are committed to `/exceptions/production-safety/audits/`.
Breach log entries are themselves governance-protected.

**Audit Output File**
`/exceptions/production-safety/audits/AUDIT-[sprint-id].md`
Sprint does not formally close if status = BREACH DETECTED. Director must acknowledge first.

---

# 7. Field Logic

**Exception record fields**

| Field | Required | Notes |
|---|---|---|
| ID | Required | Sequential, EX-[n] |
| Date | Required | ISO date |
| Approved by | Required | Director only — Build Lead cannot self-approve |
| Validator(s) | Required | Specific checks, not "all" |
| Reason | Required | Specific, not generic |
| Scope | Required | Specific environment/service |
| Duration | Required | Explicit end date — blank or "permanent" = rejected |
| Owner | Required | Named individual |
| Rollback plan | Required | Exact steps |

**Breach log severity handling**

| Severity | Trigger | Action |
|---|---|---|
| P0 | Admin bypass without exception record | Escalate to Director immediately. Production deployments paused. Do not wait for sprint end. |
| P1 | Missing approval on merged PR | Escalate at sprint end. PR flagged for retroactive review. Assess revert. |
| P2 | Exception record defect | Log, notify owner. Correct within 24 hours. If not corrected → escalates to P1. |

---

# 8. QA Resolutions

| Flag | Severity | Final Ruling |
|------|----------|--------------|
| Vendors as Day 1 engineering blockers | P1 | Resolved. Vendor procurement is parallel to engineering, not on critical path. Adapters unblock engineering. |
| Commission rate hardcoded in Finance | P0 | Rejected. PLATFORM_FEE_RATE = configurable constant. Default = __PLACEHOLDER__. Cannot be hardcoded. |
| Mock adapter reaching production | P0 | Blocked by Check 1 of production safety validators. Hard throw at startup. |
| Placeholder value reaching production | P0 | Blocked by Check 2 of production safety validators. Hard throw at startup. |
| Admin bypass without record | P0 | Governance breach. Immediate Director escalation. Production deployments paused. |
| Sprint closing with unresolved breach | P1 | Sprint does not formally close until Director acknowledges breach. QA Auditor owns enforcement. |

---

# 9. Open Items

**A. Vendor / config readiness**
| Item | Owner | Status |
|------|-------|--------|
| Actual vendor credentials (all adapter surfaces) | Ops/Director | Parallel to build — not an engineering blocker |
| PLATFORM_FEE_RATE final value | Director + Build Lead | Configurable placeholder in use — sign-off required before production |
| Production database hosting provisioned | Ops | Parallel to build — dev DB used until ready |

**B. Launch operations readiness**
| Item | Owner | Status |
|------|-------|--------|
| Ops team briefing + runbook | Build Lead + Ops | Required before grand opening |

---

# 10. Do Not Reopen

- Provider-agnostic adapter pattern (locked for currently required surfaces: Payment, Storage, Notification, Video)
- 3 production safety validators (mock check, placeholder check, credentials check)
- All 3 validators = hard stops, not warnings
- No mock adapter in production
- No placeholder value in production
- No permanent exception
- Governance-protected paths list
- Director + QA Auditor dual-approval requirement on protected paths
- Admin bypass = exception record required before execution
- Sprint-end audit = mandatory, not deferrable
- Build Lead cannot self-approve exceptions

---

# 11. Refresh Instruction
Use this as the active locked context for TruSkills build governance. All adapter interfaces, production safety validators, governance-protected paths, and audit procedures are final. Vendor procurement is parallel to engineering — it is not a blocker. Commercial constants use __PLACEHOLDER__ defaults until Director + Build Lead sign-off. No exception is permanent. Do not reopen any item in the Do Not Reopen list unless a real structural conflict appears.

Load this pack only for: build sequencing, deployment safety, production readiness checks, repository governance, exception handling, or sprint-end audit and governance review. Do not load for product architecture, module field logic, or course/service delivery work.

---

# 12. Changelog
- [2026-03-20] Version 1.0 — initial creation from locked governance directives
- [2026-03-21] Version 1.1 — tightened ownership wording (governance rules vs execution roles), tied Director + QA Auditor approval explicitly to governance-protected path PRs, relaxed adapter count wording (currently required surfaces), split open items into vendor/config readiness and launch operations readiness, tightened refresh instruction with explicit load scope
