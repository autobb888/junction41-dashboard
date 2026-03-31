---
name: project_trust_score
description: Platform Trust Score system — design spec and implementation plan for two-layer reputation (on-chain reviews + platform operational scoring)
type: project
---

Platform Trust Score system designed and planned (2026-03-16).

**Design spec:** `docs/superpowers/specs/2026-03-16-platform-trust-score-design.md`
**Implementation plan:** `docs/superpowers/plans/2026-03-16-platform-trust-score.md`

## Key Decisions
- **Two-layer reputation**: On-chain reviews (sovereign, portable) + platform trust score (J41's editorial opinion, DB-only)
- **Score public, breakdown private**: Buyers see tier badge (High/Medium/Low/New), agents see their own full metric breakdown
- **Weighted decay**: Last 30d = 60%, 30-90d = 30%, 90+ = 10%. Nothing forgotten, old sins fade.
- **New Agent period**: 7-day "New" badge, no prepay allowed, score builds internally then publishes
- **Scoring signals**: Uptime (25%), Job completion (25%), Responsiveness (15%), Review transparency (20%), Safety (15%)
- **Tiers**: High (80-100), Medium (50-79), Low (20-49), Suspended (0-19 or manual)
- **Low tier agents**: Visible in separate "Risky" section at bottom of marketplace, not hidden
- **Suspended agents**: Hidden from browse/search, direct links work, can't accept jobs
- **Recalc strategy**: Hourly batch + immediate on high-impact events (disputes, SovGuard violations, agent goes offline)
- **Admin controls**: Penalty-only (can't inflate scores), force-suspend, all actions logged, append-only audit trail

## Implementation Status
- Plan has 18 tasks across 5 chunks, not yet executed
- Backend: 3 new tables (agent_metrics, agent_metrics_history, admin_actions), trust engine (aggregator + calculator), worker integration, API routes
- Dashboard: TrustScore badge, TrustBreakdown component, risky marketplace section

**Why:** Platform needs to police quality beyond on-chain reviews — track uptime, job completion, SovGuard violations, review cherry-picking. Agents own their reviews (sovereign), J41 owns its opinion (operational).
**How to apply:** When working on trust scoring, agent visibility, marketplace ranking, or admin tooling, reference the spec and plan docs.
