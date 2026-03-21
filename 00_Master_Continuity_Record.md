---
name: TruSkills Master Continuity Record
type: project
---

# 1. Section
- **Name:** TruSkills Master Continuity Record
- **Version:** 1.3
- **Date:** 2026-03-20
- **Prepared by:** Build Lead + Product Architect (Pam)

> This file is the root continuity file and should be updated whenever a platform-wide locked decision changes.

---

# 2. Purpose
Central context file for TruSkills. Covers platform identity, all modules at summary level, agent team structure, build sequence, critical path, and cross-module locked decisions. Load this file first in any new session before loading module-specific packs.

---

# 3. Locked Decisions

**Platform**
- TruSkills is a premium, trust-centered skill and experience marketplace — Saudi-first, built for Saudi regulatory, cultural, and operational reality. Not limited to Saudi-only providers or seekers where expansion is relevant.
- Core roles: Skill Seeker (buyer) and Skill Provider (Instructor or Center)
- Account model: Seeker = fast open; Provider = fast open + post-login activation required

**Provider Types**
- Instructor: individual provider
- Center: organizational provider
- One shared activation state machine for both — provider-type-specific requirement groups inside it
- Center reputation is separate from individual instructor reputation within it

**Services — 3 types at launch**
- Courses (4 delivery channels: In-Person, Online Live, Self-Paced, Hybrid)
- Trips
- Products

**Location Privacy**
- City/district only pre-booking
- Exact address / link revealed post-confirmed booking only
- No exceptions

**Community Trigger Model**
- Community is system-triggered shared infrastructure. It is not an open free-start social layer.
- Triggered by: Bookings (group creation), Blog (thread creation)
- No self-initiated community features at launch

**Finance — Single Hub**
- Finance is the single authoritative money source of truth. Other modules may trigger finance-linked actions or display finance-linked summaries, but do not own financial truth.

**Blog — Promotional Classification**
- Educational / Community / Editorial / Promotional
- Provider-requested content = Promotional = fee applies
- TruSkills editorial selections = no provider fee regardless of content
- All public content requires TruSkills review before publish

**Marketing**
- Launch: self-serve boost only
- Post-launch Tier 1: campaign request UI (deferred)
- Post-launch Tier 2: promotional blog request UI (deferred)
- Boost labels: self-serve → "Sponsored"; Campaign → "Promoted"; Strategic alignment → no label

**Discovery Allocation (LOCKED)**
- 60% merit-based
- 25% boost
- 15% strategic alignment

**Merit Engine — 8-Signal Hierarchy (LOCKED)**
- Signal 1: Verification & Compliance (Heavy)
- Signal 2: Review Quality (Heavy)
- Signal 3: Operational Reliability (Heavy)
- Signal 4: Trust Standing (Heavy)
- Signal 5: Relevance (Medium)
- Signal 6: Blog (Light)
- Signal 7: Activity (Light)
- Signal 8: Boost (Capped)
- Positions 1–4 cannot be outweighed by signals 5–8
- Listing score ceiling: provider composite score × 1.25 max uplift
- Hard tier boundary: listing cannot appear in higher tier than provider's assigned tier
- Merit tier output is required at launch even if Analytics UI is deferred

**Online Live (LOCKED)**
- External-link-only at Phase 1
- No integrated room model at Phase 1

---

# 4. Ownership Boundaries

**Platform-level truths**
- Finance is the single money source of truth — no payment, payout, or refund data lives elsewhere
- Analytics is the single authoritative insights hub for provider performance and platform interpretation.
- Community is shared triggered infrastructure — modules trigger it, they do not own or duplicate it
- Settings is account-level configuration only. It is not item editing, live pricing, or campaign management.
- Marketing is a controlled request surface, not an open ad manager — providers cannot self-configure arbitrary promotions
- Legacy is qualification-unlocked, on-platform lineage only — no external credential import or provider-defined lineage

**This file owns**
- Platform identity and positioning
- Agent team structure
- Cross-module locked decisions
- Build sequence and critical path
- Launch blocker registry

**This file does not own**
- Module-level field logic (see module memory packs)
- Build governance controls (see 02_Build_Governance_Memory_Pack)

---

# 5. Agent Team Structure

| Role | Identity | Scope |
|------|----------|-------|
| Product Architect | Pam | Platform structure, field logic, state machines, validation rules, system integrity |
| Build Lead | — | Full-stack execution, implementation sequencing, delivery, system cohesion |
| Backend | — | API development, database, services, state machines, integrations |
| Frontend | — | UI implementation, component library, UX flows |
| QA Auditor | — | System testing, edge cases, failure scenarios, quality control, sprint-end governance audit |
| AI | — | AI-driven features, model integrations, intelligent automation |
| Dile | Knowledge Controller | File processing, document pipeline, data structuring, system safety |
| Service Architect | — | Service-layer design, integration contracts, API boundaries |
| Director / Ops / Legal | — | Final approvals, vendor decisions, compliance sign-off, governance exceptions |

---

# 6. Dependencies

**Upstream**
- None — this is the root context file

**Downstream**
- All module memory packs depend on this file for platform-wide locked decisions
- Build execution depends on Phase A–K sequence defined here

**Trigger Relationships**
- Bookings → Community (group creation)
- Bookings → Finance (payment capture)
- Bookings → Merit (Signals 2, 3)
- Blog publish → Community (thread creation)
- Blog publish → Merit (Signal 6)
- Activation → Services (publishing gate — Activated state required)
- Activation → Finance (payout eligibility — Activated state required)

---

# 7. Final Rules / Logic

**Provider Activation State Machine — 8 States (LOCKED)**

| State | Description |
|---|---|
| Not Started | Account created. No activation requirements touched. |
| In Progress | At least one requirement group has partial progress. |
| Submitted | Provider has submitted for review — waiting for ops pickup. |
| Under Review | Ops is actively reviewing the submission. |
| Needs Revision | Specific requirement groups flagged. Provider returns to In Progress for flagged groups only. Previously approved groups are not re-reviewed unless specifically flagged. |
| Approved | All reviewed requirements passed. Final gates (payout setup + provider service contract acceptance) must be completed before Activated status is granted. |
| Activated | Fully live. Provider can publish, appear in search, accept bookings, and receive payouts. |
| Restricted / On Hold | Post-activation control state. Triggered by compliance breach, document expiry, payment issue, trust or safety flag, or ops review. Always includes reason and resolution path. |

**Provider action rule:**
Providers may create and save drafts before activation, but cannot publish, appear in discovery, accept bookings, or receive payouts until activation is complete (Activated state).

**Build Phase Sequence (A–K, LOCKED)**

```
A: Foundation (schema, auth, infrastructure)
B: Provider Activation
C: Finance Core
D: Services (Courses, Trips, Products)
E: Bookings Engine
F: Community
G: Blog + Legacy
H: Merit Engine
I: Seeker Experience
J: Provider Dashboard
K: Integration + QA
```

**Hard sequencing rules within phases:**
- F3 (thread infrastructure) = first mandatory deliverable in Phase F. Blog thread bridge (G5) cannot be built before F3 is live.
- Dile document upload pipeline = Day 1 start, parallel dependency for Activation. Does not wait for phase sequencing.
- Self-Paced platform-hosted delivery = required at launch. External URL is an alternative input method only.
- Merit tier output = required at launch even if Analytics UI is deferred.

**Critical Path (14 gates — irreducible)**
```
CP-01: Adapters initialized (vendor procurement runs parallel — not an engineering stop)
CP-02: All 11 domain schemas migrated
CP-03: Auth API live
CP-04: Activation state machine live
CP-05: Payment adapter live
CP-06: Services creation live (all 3 types)
CP-07: Bookings engine live (all 3 state machines)
CP-08: Finance capture + payout live
CP-09: Thread infrastructure live (F3)
CP-10: Merit Engine scoring live (all 8 signal feeds)
CP-11: Discovery feed live (60/25/15 enforced)
CP-12: Seeker discovery + purchase flow live
CP-13: LB-01 through LB-28 all green
CP-14: Ops runbook complete + team briefed
→ GRAND OPENING
```

**28 Launch Blockers (LB-01 through LB-28)**
All 28 must be green before grand opening. No partial launch permitted.
Reference: Launch Blocker Tracker artifact.

**Database Domains (11 bounded contexts)**
1. Identity + Auth
2. Activation + Compliance
3. Taxonomy
4. Courses
5. Trips
6. Products
7. Bookings + Finance
8. Community
9. Blog + Legacy
10. Merit Engine
11. Notifications + Marketing

**Provider Dashboard Navigation (LOCKED)**
- TODAY: Home, Calendar, Bookings
- MY SERVICES: Courses, Trips, Products, Blog
- AUDIENCE: Customers, Community
- GROWTH: Marketing
- BUSINESS: Finance, Analytics
- ACCOUNT: Settings, Legacy

**Module Boundaries (LOCKED)**

| Module | Ownership Anchor |
|--------|-----------------|
| Home | Today summary and action prioritisation only |
| Calendar | Session and booking timeline only |
| Bookings | Booking state management and fulfilment tracking only |
| Courses | Course creation, delivery configuration, and listing management only |
| Trips | Trip creation, coordination, safety, and listing management only |
| Products | Product creation, inventory, variants, and fulfilment only |
| Blog | Content creation, review workflow, and publishing only |
| Community | Triggered communication infrastructure — DMs, groups, threads, moderation |
| Marketing | Controlled boost and promotion request surface only — not an open ad manager |
| Finance | Single authoritative money source — payments, payouts, refunds only |
| Analytics | Single authoritative insights hub — provider performance and platform interpretation only |
| Settings | Account-level configuration only — not item editing, pricing, or campaign management |
| Legacy | Qualification-unlocked, on-platform lineage only — no external credential import |

---

# 8. Field Logic

**Cross-module field rules:**
- Location: city/district stored on listing; exact address stored encrypted, revealed only post-confirmed booking
- Platform fee: loaded from config (PLATFORM_FEE_RATE) — not hardcoded
- All commercial constants: configurable, marked [PLACEHOLDER] until Director + Build Lead sign-off

---

# 9. QA Resolutions

| Flag | Resolution |
|------|------------|
| Merit signal count inconsistency (7 vs 8) | Locked at 8 signals. References must not specify a count number — use "full locked Merit model" |
| Self-Paced launch path contradiction | Platform-hosted video = required at launch. External URL = alternative input only. Not a swap. |
| Finance/Marketing boundary drift | Spend-cap enforcement = Marketing. Billing record = Finance. No duplication. |
| Thread infrastructure sequencing | F3 is first mandatory deliverable in Phase F. Hard rule, not a soft note. |
| Dile pipeline sequencing | Document upload pipeline starts Day 1, parallel to Activation. Cannot wait for phase sequencing. |
| Self-serve boost vs campaign split | Launch = self-serve only. Campaign request UI = post-launch Tier 1. Promotional blog = post-launch Tier 2. |

---

# 10. Open Items

**Abstracted vendor decisions — parallel to engineering, not blockers**
| Item | Owner |
|------|-------|
| Payment gateway vendor + production credentials | Ops/Director |
| File storage + CDN vendor | Ops/Director |
| Email delivery vendor | Ops/Director |
| Database production hosting + region | Ops/Director |

**Legal / ops decisions — required before launch**
| Item | Owner |
|------|-------|
| Legal review and sign-off on waiver template (Trips) | Legal |
| First provider cohort size before grand opening | Growth/Director |
| Compliance matrix per category — detailed field list | Legal/Director |

**Commercial constants — configurable placeholders, require sign-off before production**
| Constant | Owner |
|----------|-------|
| PLATFORM_FEE_RATE | Director + Build Lead |
| PAYOUT_MINIMUM_THRESHOLD | Director + Build Lead |
| PAYOUT_SCHEDULE_DAYS | Director + Build Lead |
| BOOST_DAILY_SPEND_CAP | Director + Build Lead |

---

# 11. Do Not Reopen

- Discovery allocation (60/25/15)
- Merit signal hierarchy (8 signals, heavy/medium/light/capped)
- Position lock (signals 1–4 cannot be outweighed by 5–8)
- Merit tier output required at launch
- Online Live = external-link-only at Phase 1
- Self-Paced = platform-hosted required at launch
- Location privacy (city/district pre-booking; exact post-confirmed only)
- Community trigger model (triggered, not self-initiating)
- Finance as single money source of truth (no duplication in other modules)
- Blog review requirement (all public content requires TruSkills review)
- Boost label rules (Sponsored / Promoted / no label)
- Provider Dashboard navigation structure
- Module boundaries list
- Build phase sequence (A–K)
- Activation state machine (8 states — Not Started through Restricted / On Hold)
- Draft-save permitted pre-activation; publish/discovery/bookings/payouts require Activated state
- Legacy = qualification-unlocked, on-platform lineage only
- Marketing = controlled request surface, not open ad manager

---

# 12. Refresh Instruction
Load this file first in any new TruSkills session. Then load only the relevant section memory pack(s) needed for the current task. Do not load unnecessary packs. Do not reopen decisions listed in Do Not Reopen unless a real structural conflict is identified.

---

## Memory Use Triggers

**A. Same-thread refresh**
Use when:
- staying in the same thread
- resuming after a pause
- re-entering a specific module or section

Action:
- load only the relevant memory pack(s)
- do not reload the full project unless there is real context loss

Examples:
- Courses work → load `01_Courses_Memory_Pack.md`
- Build/governance work → load `02_Build_Governance_Memory_Pack.md`

**B. New-thread refresh**
Use when:
- starting a completely new thread
- thread context is lost
- moving work to a fresh session

Action:
- load `00_Master_Continuity_Record.md` first
- then load only the relevant section memory pack(s)
- do not paste the whole project unless specifically needed

---

## Reminder Rule

At the start of any resumed TruSkills session, first determine whether this is:
1. same-thread continuation, or
2. new-thread continuation

- If same-thread continuation: recommend only the relevant memory pack
- If new-thread continuation: recommend the Master Continuity Record first, then the relevant memory pack
- Do not ask for unnecessary files
- Do not ask for the whole project when a scoped memory pack is enough

---

## Current Next Step

**Active workstream:** No active workstream — new-thread continuation point.

**Pack loading rule:**
- Load `00_Master_Continuity_Record.md` first (always)
- Do not load a scoped pack until the task is known
- If the first task is clearly Courses → auto-load `01_Courses_Memory_Pack.md`
- If the first task is clearly build / governance / deployment → auto-load `02_Build_Governance_Memory_Pack.md`
- Otherwise stay on master context only until the task is given

**Update rule:** Update this section whenever the active workstream changes so a new thread can continue without asking which file to load.

---

# 13. Changelog
- [2026-03-20] Version 1.0 — initial creation from locked architecture session
- [2026-03-20] Version 1.1 — corrected activation state machine (8 actual locked states), fixed platform identity wording, corrected service creation rule (draft-save permitted pre-activation), added platform-level ownership truths, added agent team structure, tightened build sequence section, restructured open items into 3 categories, improved refresh instruction, added memory-system note
- [2026-03-20] Version 1.2 — tightened Community/Finance/Analytics/Settings wording, expanded provider dashboard navigation to full locked structure, replaced module list with ownership-anchored table, added Memory Use Triggers section, added Reminder Rule section
- [2026-03-21] Version 1.3 — added Current Next Step section
