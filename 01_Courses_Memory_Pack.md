---
name: TruSkills Courses Memory Pack
type: project
---

# 1. Section
- **Name:** Courses Memory Pack
- **Version:** 1.2
- **Date:** 2026-03-20
- **Prepared by:** Product Architect (Pam) + QA Auditor

---

# 2. Purpose
Complete locked architecture for the Courses module. Covers all 4 delivery channels, field logic, state model, access window rules, location/link privacy, Hybrid composition rules, and channel behavior matrix.

Use this pack when working on: course creation, delivery rules, course booking behavior, self-paced access logic, hybrid composition, attendance, completion, and certificate eligibility.

---

# 3. Locked Decisions

- 4 delivery channels: In-Person, Online Live, Self-Paced Video, Hybrid
- Online Live = external-link-only at Phase 1 at the infrastructure level. No integrated room delivery.
- Self-Paced Video = platform-hosted required at launch. External URL is an alternative input method only — not a replacement path.
- Hybrid = composition of the first 3 channels only. Minimum 2 components. Must include at least one live component (In-Person or Online Live). Cannot be Self-Paced-only.
- Self-Paced access window: bounded period (7–365 days). Starts on enrollment confirmation. Hard lockout at 23:59 on final day. No grace period.
- Self-Paced access window appears in seeker calendar as a bounded period, not as a session.
- 1 extension permitted per enrollment, via ops-approved workflow only.
- Location privacy: city/district only pre-booking. Exact address/link revealed post-confirmed booking only. No exceptions.
- Compliance requirements are injected dynamically by category, subcategory, and delivery channel where relevant. High-risk categories add an additional compliance layer.
- Hybrid compliance = union of all component channels included.
- Providers may create and save course drafts before activation, but cannot publish, appear in discovery, accept bookings, or receive payouts until provider activation is complete (Activated state).

---

# 4. Ownership Boundaries

**Courses owns**
- Course creation and configuration (all 4 channels)
- Delivery channel rules and enforcement
- Access window logic (Self-Paced)
- Location and link privacy enforcement
- Compliance field requirements per channel
- Course parent-level state (Draft → Published → Archived)
- Certificate availability and issuance declaration

**Courses does not own**
- Booking reservation state and seat/order control → owned by Bookings Engine
- Payment capture, refund execution, and payout truth → owned by Finance
- Community group creation → triggered by Bookings, not Courses
- Listing ranking and visibility → owned by Merit Engine
- Legacy feed entries → triggered by eligible certificate issuance events, not manually by Courses
- Video hosting infrastructure → owned by StorageAdapter via Dile pipeline

---

# 5. Dependencies

**Upstream**
- Provider must be in Activated state before publishing (draft creation is permitted pre-activation)
- Taxonomy: categories, subcategories, tags, regions must be seeded
- Storage provider must be live before Self-Paced video upload works

**Downstream**
- Bookings Engine consumes: channel type, session schedule, access window config, capacity
- Finance consumes: price, currency, refund policy
- Merit Engine consumes: taxonomy match, review signals, reliability signals
- Seeker Experience consumes: listing cards, detail pages, provider profiles
- Legacy system receives: certificate issuance events from eligible completions

**Trigger Relationships**
- BOOKING_CONFIRMED → Self-Paced access window starts
- BOOKING_CONFIRMED → exact address/link revealed to confirmed enrollee
- ACCESS_WINDOW_EXPIRED → hard lockout at 23:59 on final day
- COURSE_PUBLISHED → listing enters merit-ranked discovery feed
- CERTIFICATE_ISSUED → Legacy feed entry triggered (eligibility-gated)

---

# 6. Final Rules / Logic

**Course Parent-Level State Model (LOCKED)**

| State | Description |
|---|---|
| Draft | Created, not visible publicly. Editable. Permitted pre-activation. |
| Ready to Publish | All required fields complete. Provider is Activated. Publishing is unblocked. |
| Published | Live and visible in discovery. Bookings can be accepted. |
| Unpublished | Removed from discovery by provider. Existing bookings are not cancelled. |
| Archived | Permanently closed. No new bookings. Historical record preserved. |

**Rule:** Operational delivery status (session-level, live component status, access-window execution state) belongs to sessions and live components — not to the parent course publishing state.

---

**Channel Behavior Matrix**

| Dimension | In-Person | Online Live | Self-Paced | Hybrid |
|---|---|---|---|---|
| Location reveal | Post-confirmed | Post-confirmed (link) | N/A | Per component |
| Scheduling | Fixed sessions | Fixed sessions | None | Per live component |
| Access model | Session attendance | Session attendance | Bounded window | Composition |
| Platform hosting | No | No | Yes (required) | Per component |
| Live component required | Yes | Yes | No | Yes (at least 1) |
| Compliance complexity | Dynamic by category | Dynamic by category | Dynamic by category | Union of all components |
| Calendar entry type | Session | Session | Bounded period | Mixed |
| Automation suitability | Low | Medium | High | Medium |

---

**Location Privacy Enforcement**
- Pre-booking listing: city + district only
- Post-confirmed booking: exact address (In-Person) or meeting link (Online Live) revealed to confirmed enrollee only
- Exact location stored encrypted on backend — never exposed in public API response
- Post-booking reveal is a Bookings Engine trigger, not a Courses field toggle

---

**Online Live — Phase 1 Link Model**
- Platform Type options at course/session creation:
  - Integrated platform (if available in future — not Phase 1)
  - External platform link (Phase 1 — required)
  - TBD at session (allowed with time-bound provider obligation before session start)
- Meeting/session link is never public pre-booking
- Revealed only to confirmed enrollees after BOOKING_CONFIRMED
- Link updates notify enrolled seekers automatically
- No platform-side room creation, scheduling API calls, or session management in Phase 1

---

**Self-Paced Access Window**
- Content structure: module/lesson based
- Access window: required, 7 days minimum / 365 days maximum
- Window start: triggered by BOOKING_CONFIRMED (not by purchase initiation)
- Hard lockout: 23:59 on the final calendar day of the window
- No grace period
- Extension: 1 permitted per enrollment, via ops-approved workflow only
- Calendar: bounded access period displayed — not a session slot
- Completion tracking: differs by content type (video watch percentage, quiz pass, module completion)
- Certificate logic: depends on completion threshold where certificate issuance is enabled
- Access after lockout: no — seeker must re-enroll

---

**Hybrid Composition Rules**
- Minimum 2 components required
- Valid components: In-Person, Online Live, Self-Paced
- Must include at least 1 live component — Self-Paced-only Hybrid is not valid
- Component sequence: defined by provider at course creation
- Self-Paced window advisory: if Self-Paced window end date falls before the final live session, provider is warned at creation
- Self-Paced window runs concurrently with the live session schedule if included
- Compliance requirements = union of all included components
- Calendar entries = mix of session entries (live components) + bounded period (Self-Paced component)
- Community group: exists if any live component is present (triggered by Bookings)
- Certificate: requires all components to qualify — partial completion does not unlock certificate

---

# 7. Field Logic

**Shared Course Fields (parent level — all channels)**
- Course title
- Course description
- Category
- Subcategory
- Delivery channel (In-Person / Online Live / Self-Paced / Hybrid)
- Skill level
- Language
- Cover image
- Pricing or Free toggle
- Visibility / publish state
- Cancellation policy
- Certificate availability / issuance declaration

**Channel-Specific Field Groups**

| Field | In-Person | Online Live | Self-Paced | Hybrid |
|---|---|---|---|---|
| Exact address (encrypted) | Required | — | — | If In-Person component |
| Meeting/session link (encrypted) | — | Required or TBD | — | If Online Live component |
| Session schedule | Required | Required | — | Required (live components) |
| City / District | Required | Optional | Optional | If In-Person component |
| Capacity (min/max) | Required | Required | Optional | Required (live components) |
| Access window duration | — | — | Required (7–365 days) | If Self-Paced component |
| Video content (platform-hosted) | — | — | Required | If Self-Paced component |
| Module / lesson structure | — | — | Required | If Self-Paced component |
| Completion threshold (for certificate) | — | — | Conditional | Conditional |
| High-risk compliance docs | Conditional | Conditional | Conditional | Conditional (union) |
| Waiver requirement flag | Optional | Optional | Optional | Optional |

**Hybrid-Specific Control Fields**
- Component list (ordered)
- Component types declared
- Self-Paced window relative to live schedule (advisory flag)
- Certificate eligibility rule (all components required)
- Compliance union declaration (system-generated at creation based on components)

**Optional Fields (all channels)**
- Intro video
- Prerequisites
- What you'll learn (list)
- Materials list
- Refund policy override
- Featured image

**Deferred Fields (post-launch)**
- Content series grouping (Blog integration)
- Certificate template override
- Legacy lineage reference

**Automation with Manual Fallback**

| Action | Automation | Manual Fallback |
|---|---|---|
| Access window start | Auto-triggered on BOOKING_CONFIRMED | Ops can manually set start date |
| Hard lockout | Auto at 23:59 on final day | Ops can apply 1 extension via approved workflow |
| Post-booking reveal | Auto on BOOKING_CONFIRMED | Ops can manually trigger reveal |
| Compliance injection | Auto on category/subcategory selection | Ops review manually clears or adds |
| Link update notification | Auto on provider link edit | Ops can manually resend |
| Certificate issuance | Auto on completion threshold met | Ops can manually issue or block |

---

# 8. QA Resolutions

| Flag | Severity | Final Ruling |
|------|----------|--------------|
| Self-Paced external URL as launch path | P0 | Rejected. Platform-hosted = required at launch. External URL = alternative input, not replacement. |
| Hybrid without live component | P1 | Blocked at validation. Hybrid must include at least one live component. Hard rule. |
| Access window grace period | P2 | No grace period. Hard lockout at 23:59 on final day. 1 extension via ops-approved workflow is the only relief path. |
| Location reveal before confirmation | P0 | Not permitted. Reveal triggered only by BOOKING_CONFIRMED. No exceptions. |
| Online Live room management in Phase 1 | P1 | Out of scope. External-link-only at infrastructure level. No platform-side session management at Phase 1. |
| Compliance as flat mandatory for all channels | P1 | Replaced. Compliance is dynamically injected by category, subcategory, and channel. Risk level affects depth and fields, not a flat blanket rule. |

---

# 9. Open Items

These are implementation and default-value decisions only. None reopen locked structural architecture.

| Item | Owner | Status |
|------|-------|--------|
| Exact compliance field list per category | Legal/Pam | Locked category/risk architecture in schema — detailed field list pending Legal sign-off |
| Certificate template design | Product | Post-launch |
| Content series engine | Product | Post-launch Tier 1 |
| Completion threshold defaults per content type | Pam | Operational default values pending — does not reopen locked completion-threshold architecture |
| TBD meeting link obligation window duration | Pam/Ops | Timing/default value pending — does not reopen locked Online Live external-link model |

---

# 10. Do Not Reopen

- 4 delivery channels (In-Person, Online Live, Self-Paced, Hybrid)
- Online Live = external-link-only at Phase 1 infrastructure level
- Self-Paced = platform-hosted required at launch
- Hybrid minimum 2 components, must include at least 1 live component
- Self-Paced access window = bounded period, starts on BOOKING_CONFIRMED, hard lockout at 23:59, no grace period, 1 extension via ops-approved workflow only
- Location/link privacy (city/district pre-booking; exact post-confirmed only)
- Hybrid compliance = union of all components
- Hybrid certificate = all components must qualify
- Course parent state model (Draft / Ready to Publish / Published / Unpublished / Archived)
- Operational delivery status belongs to sessions/components, not to parent course state
- Draft creation permitted pre-activation; publishing requires Activated state

---

# 11. Refresh Instruction
Use this as the active locked context for the Courses module. All 4 delivery channels are locked. Online Live is external-link-only at the infrastructure level in Phase 1. Self-Paced requires platform-hosted video. Hybrid must include a live component and minimum 2 components. Access window rules are final. Location privacy is absolute. Do not reopen any item in the Do Not Reopen list unless a real structural conflict is identified.

Load this pack only for: course creation, delivery channel rules, course booking behavior, self-paced access-window logic, hybrid composition, attendance, completion, or certificate eligibility. Do not load for general platform, bookings engine, finance, or merit engine work.

---

# 12. Changelog
- [2026-03-20] Version 1.0 — initial creation from locked architecture session
- [2026-03-20] Version 1.1 — fixed activation gate rule (drafts permitted pre-activation), replaced state machine with locked 5-state parent model, restructured field logic into shared/channel-specific/hybrid-specific, fixed compliance wording (dynamic injection), expanded Online Live link model (Platform Type + TBD option), expanded Self-Paced logic (module/lesson structure, completion tracking, certificate), expanded Hybrid logic (min 2 components, sequence, window advisory, certificate rule, community group), strengthened ownership boundaries, tightened dependencies, added memory-use value to Purpose and Refresh
- [2026-03-20] Version 1.2 — tightened open items (implementation/default-value decisions only, not architecture reopeners), tightened refresh instruction (explicit scope, load boundaries stated)
