# Platform Trust Score — Design Spec

## Overview

Two-layer reputation system for Junction41:

1. **On-chain reviews** (peer-to-peer): Buyer signs review data, platform sends it to agent via webhook, agent publishes on their VerusID. Platform reads from chain, doesn't store. Portable and sovereign.
2. **Platform trust score** (J41's opinion): Algorithmic score based on operational metrics observed through the API. Lives in DB. Not portable — intentionally scoped to behavior on J41.

**Goal**: Give buyers a reliable signal about agent quality while keeping the self-sovereign model intact. Agents own their reviews; J41 owns its editorial opinion.

---

## Agent Lifecycle

### Days 1-7: "New Agent" Period

- Trust score calculates internally but displays as **"New"** badge publicly
- Agent can see their own metrics building in their dashboard
- **Payment terms restricted**: No prepay allowed during first week (postpay only, buyer pays on completion)
- Agent still gets paid normally when jobs complete and buyer confirms

### Day 7+: Scored

- First score published based on week 1 data
- Trust tier displayed publicly on all agent cards and profiles
- Detailed metric breakdown visible **only to the agent** (score public, breakdown private)

---

## Scoring Model

### Time Windows (Weighted Decay)

All-time data contributes, but recent activity weighted heavier:

| Window | Weight |
|--------|--------|
| Last 30 days | 60% |
| 30-90 days | 30% |
| 90+ days | 10% |

Nothing is ever forgotten, but old problems fade. An agent who improves sees their score recover. An agent coasting on historical goodwill sees it erode.

### Input Signals

| Signal | Weight | Description | Data Source |
|--------|--------|-------------|-------------|
| **Uptime** | 25% | Ping success rate over the time window | `agents.last_seen_at`, `agents.online`, `agents.consecutive_failures` via liveness worker (`src/worker/liveness.ts`) |
| **Job Completion Rate** | 25% | `completed / (completed + cancelled + disputed)` | `jobs` table — has `requested_at`, `accepted_at`, `delivered_at`, `completed_at` timestamps, status field |
| **Responsiveness** | 15% | Avg time from job request to acceptance + avg time to first reply in chat | `jobs.requested_at` → `jobs.accepted_at` delta; `job_messages` table for first reply timing |
| **Review Transparency** | 20% | Reviews published on-chain / reviews sent to agent via webhook | Webhook delivery logs (`webhook_deliveries` table for `review.received` events) vs on-chain reviews found by indexer |
| **Safety** | 15% | Inverse of SovGuard violation rate (`1 - violations/total_messages`) | `hold_queue` table — per-message safety scores and held/rejected status |

### Tier Thresholds

| Tier | Score Range | Visibility |
|------|-------------|------------|
| **High** | 80-100 | Normal listing, prominent placement |
| **Medium** | 50-79 | Normal listing |
| **Low** | 20-49 | Separated into "Risky" section at bottom of listings or dedicated page, clearly labeled |
| **Suspended** | 0-19 (or manual) | Hidden from browse/search, direct links still work, cannot accept new jobs |

### Score Calculation

Each signal produces a 0-100 sub-score. These are combined using the weighted decay model:

```
For each signal S:
  score_30d  = calculate(S, last 30 days of data)
  score_90d  = calculate(S, 30-90 days of data)
  score_all  = calculate(S, 90+ days of data)
  weighted_S = score_30d * 0.60 + score_90d * 0.30 + score_all * 0.10

trust_score = sum(weighted_S * signal_weight for each S)
            = uptime * 0.25 + completion * 0.25 + responsiveness * 0.15
              + transparency * 0.20 + safety * 0.15

// Apply admin penalty if present
trust_score = max(0, trust_score - manual_penalty)

// Determine tier
tier = score >= 80 ? 'high' : score >= 50 ? 'medium' : score >= 20 ? 'low' : 'suspended'
```

**Sub-score formulas**:

- **Uptime**: `(successful_pings / total_expected_pings) * 100` — expected pings based on check intervals (5 min when online, 30 min when offline)
- **Job Completion**: `(completed / total_terminal_jobs) * 100` — where terminal = completed + cancelled + disputed. Agents with 0 jobs get 50 (neutral)
- **Responsiveness**: Inverse of average response time, scaled 0-100. Sub-1-minute avg = 100, 1-hour avg = 50, 24+ hours = 0. Logarithmic scale.
- **Review Transparency**: `(reviews_onchain / reviews_sent) * 100` — agents with 0 reviews sent get 100 (benefit of doubt)
- **Safety**: `(1 - violations / total_messages) * 100` — agents with 0 messages get 100 (benefit of doubt)

---

## Recalculation Strategy

### Hybrid: Batch + Event-Driven

- **Hourly batch**: Worker recalculates all active agents (agents with `last_seen_at` within 7 days)
- **Immediate recalc on high-impact events**:
  - SovGuard violation (message held or rejected)
  - Job dispute opened
  - Agent goes offline (3 consecutive ping failures)
  - Admin penalty applied
- **Daily snapshot**: Save score + all sub-scores to history table for trend tracking

### Implementation

Immediate recalc events are fire-and-forget: the existing event handler (job dispute route, SovGuard scan, liveness worker) emits a `recalcTrustScore(agentVerusId)` call after its normal work. If recalc fails, the hourly batch catches it. This means **existing flows are never blocked or broken by trust score failures**.

---

## Visibility & Ranking

### Buyers See

- Trust tier badge on agent cards in browse/search: **High** / **Medium** / **Low** / **New**
- "New Agent" badge during first 7 days
- Low-tier agents in a clearly labeled "Risky" subsection at the bottom of listings
- Suspended agents hidden from browse/search (direct links still work)

### Agents See (Own Profile/Settings)

- Their trust score (0-100) and tier
- Breakdown of each sub-score: uptime %, completion rate, avg response time, transparency ratio, safety rate
- Trend indicator: improving / stable / declining (based on 7-day delta)
- If admin penalty applied: penalty amount and reason displayed
- Tips for improvement (e.g. "Your response time is high — try accepting jobs faster")

### Search/Browse Ranking

- Trust score is a ranking signal (higher = higher in results)
- Within same tier, existing sort options still apply (price, rating, newest)
- Low-tier agents sorted into bottom "Risky" section
- Suspended agents excluded from browse/search entirely

---

## Admin Controls

### Capabilities

- **Apply penalty**: Subtract points from score (e.g. -30). Cannot add points — penalty only.
- **Force suspend**: Override tier to Suspended regardless of score.
- **Lift penalty/suspension**: Remove manual override, score recalculates normally.

### Constraints

- Cannot inflate scores (penalty-only)
- All actions logged: admin identifier, action, reason, timestamp
- Overrides persist until manually lifted
- Audit trail is append-only (admin_actions log table)

---

## Data Model

### New Table: `agent_metrics`

Primary table for real-time trust score data. One row per agent.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `agent_id` | UUID | FK → agents.id (unique) |
| `agent_verus_id` | TEXT | Agent i-address (indexed) |
| `trust_score` | REAL | Computed score 0-100 |
| `trust_tier` | TEXT | 'new' / 'high' / 'medium' / 'low' / 'suspended' |
| `uptime_score` | REAL | Sub-score 0-100 |
| `completion_score` | REAL | Sub-score 0-100 |
| `responsiveness_score` | REAL | Sub-score 0-100 |
| `transparency_score` | REAL | Sub-score 0-100 |
| `safety_score` | REAL | Sub-score 0-100 |
| `total_pings` | INTEGER | Total pings attempted |
| `successful_pings` | INTEGER | Successful pings |
| `total_jobs` | INTEGER | Terminal jobs (completed + cancelled + disputed) |
| `completed_jobs` | INTEGER | Successfully completed |
| `avg_response_time_ms` | INTEGER | Average job acceptance time |
| `reviews_sent` | INTEGER | Reviews sent to agent via webhook |
| `reviews_onchain` | INTEGER | Reviews found on-chain by indexer |
| `total_messages` | INTEGER | Total chat messages sent by agent |
| `sovguard_violations` | INTEGER | Messages held or rejected by SovGuard |
| `manual_penalty` | REAL | Admin penalty points (0 = none) |
| `penalty_reason` | TEXT | Why penalty was applied (nullable) |
| `penalty_set_by` | TEXT | Admin identifier (nullable) |
| `penalty_set_at` | TIMESTAMP | When penalty was applied (nullable) |
| `first_seen_at` | TIMESTAMP | When agent first registered (for new agent window) |
| `scored_at` | TIMESTAMP | When agent graduated from "new" to scored (nullable) |
| `last_calculated_at` | TIMESTAMP | Last score recalculation |
| `created_at` | TIMESTAMP | Row creation |
| `updated_at` | TIMESTAMP | Last update |

### New Table: `agent_metrics_history`

Daily snapshots for trend tracking.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `agent_id` | UUID | FK → agents.id |
| `date` | DATE | Snapshot date (unique with agent_id) |
| `trust_score` | REAL | Score on this date |
| `trust_tier` | TEXT | Tier on this date |
| `uptime_score` | REAL | |
| `completion_score` | REAL | |
| `responsiveness_score` | REAL | |
| `transparency_score` | REAL | |
| `safety_score` | REAL | |
| `created_at` | TIMESTAMP | |

### New Table: `admin_actions`

Append-only audit log for admin overrides.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `agent_id` | UUID | FK → agents.id |
| `action` | TEXT | 'apply_penalty' / 'force_suspend' / 'lift_penalty' / 'lift_suspension' |
| `value` | REAL | Penalty amount (nullable) |
| `reason` | TEXT | Required explanation |
| `admin_id` | TEXT | Who did this |
| `created_at` | TIMESTAMP | Immutable |

---

## API Endpoints

### Public

- `GET /v1/agents/:verusId/trust` — Returns `{ tier, isNew, daysSinceRegistration }` (no score number, no breakdown)
- `GET /v1/agents` and `GET /v1/services` — Include `trustTier` and `isNewAgent` in response objects. Ranking influenced by trust score. Low-tier agents flagged with `risky: true`.

### Agent (Authenticated)

- `GET /v1/me/trust` — Returns full breakdown: `{ score, tier, subscores: { uptime, completion, responsiveness, transparency, safety }, trend, penalty, tips }`
- `GET /v1/me/trust/history` — Returns daily snapshots for charting trend

### Admin (Authenticated + Admin Role)

- `POST /v1/admin/agents/:verusId/penalty` — Body: `{ amount, reason }` — apply penalty
- `POST /v1/admin/agents/:verusId/suspend` — Body: `{ reason }` — force suspend
- `DELETE /v1/admin/agents/:verusId/penalty` — Lift penalty
- `DELETE /v1/admin/agents/:verusId/suspension` — Lift suspension
- `GET /v1/admin/actions` — Audit log (paginated)

---

## Backend Implementation

### Files to Create

| File | Purpose |
|------|---------|
| `src/trust/calculator.ts` | Score calculation engine — takes raw metrics, applies decay weights, produces score + tier |
| `src/trust/aggregator.ts` | Collects raw metrics from existing tables (jobs, hold_queue, agents, webhook_deliveries, reviews) |
| `src/trust/types.ts` | TypeScript types for metrics, scores, tiers |
| `src/api/routes/trust.ts` | API endpoints (public, agent, admin) |
| `migrations/006_agent_metrics.ts` | New tables: agent_metrics, agent_metrics_history, admin_actions |

### Files to Modify (Minimal, Additive Only)

| File | Change |
|------|--------|
| `src/worker/index.ts` | Add hourly trust score batch recalc task + daily snapshot task |
| `src/worker/liveness.ts` | After marking agent offline → fire `recalcTrustScore()` |
| `src/api/routes/jobs.ts` | After dispute → fire `recalcTrustScore()`. After completion → increment counters. |
| `src/chat/ws-server.ts` | After SovGuard hold/reject → fire `recalcTrustScore()` |
| `src/api/routes/agents.ts` | Include `trustTier` and `isNewAgent` in agent response transform |
| `src/api/routes/services.ts` | Include `trustTier` in service response transform |
| `src/db/index.ts` | Add `agentMetricsQueries` |
| `src/db/schema.ts` | Add table type definitions |
| `src/api/server.ts` | Register trust routes |

### Safety Guarantees

All modifications to existing files are **additive fire-and-forget calls**:

```typescript
// Example: in jobs.ts after dispute
try { recalcTrustScore(job.seller_verus_id); } catch (_) { /* hourly batch catches it */ }
```

If the trust system crashes, throws, or is slow — the original flow completes normally. The hourly batch serves as a guaranteed catch-up. No existing behavior is altered.

### New Agent Enforcement

On job creation (`POST /v1/jobs`), check `agent_metrics.first_seen_at`:
- If agent is within 7-day new window AND `paymentTerms === 'prepay'` → reject with message explaining new agent restriction
- This is the **only** place existing behavior changes, and it's a single guard clause

---

## Dashboard Implementation

### Components to Create

| Component | Purpose |
|-----------|---------|
| `TrustBadge.jsx` | Small badge showing tier (High/Medium/Low/New) with appropriate color |
| `TrustBreakdown.jsx` | Agent-only: detailed sub-scores with progress bars + trend arrow |
| `TrustHistory.jsx` | Agent-only: line chart of score over time |
| `RiskyAgentSection.jsx` | Marketplace: separated section for low-tier agents with "Risky" label |

### Pages to Modify

| Page | Change |
|------|--------|
| `MarketplacePage.jsx` | Split listings: normal agents above, risky section below. Hide suspended. |
| `AgentDetailPage.jsx` | Show TrustBadge next to agent name. If own profile, show TrustBreakdown. |
| `ProfilePage.jsx` or `SettingsPage.jsx` | Add trust metrics section for authenticated agent |

### Badge Colors (Matching Existing Palette)

- **High**: Green (`var(--lp-accent)` / `#34D399`)
- **Medium**: Amber (`#F59E0B`)
- **Low**: Red/orange (`#EF4444`)
- **Suspended**: Gray (`#64748B`)
- **New**: Blue (`#38BDF8`)

---

## Review Decentralization (Related Change)

As part of this work, reviews shift from platform-stored to agent-sovereign:

### Current Flow
Buyer signs review → platform stores in inbox DB → agent runs updateidentity → on-chain

### New Flow
Buyer signs review → platform sends full review payload (`buyer, jobHash, message, rating, signature, timestamp`) to agent via webhook → agent publishes on their VerusID → indexer reads from chain

- Platform stops storing reviews in its own DB
- Platform tracks `reviews_sent` count (for transparency scoring)
- Indexer continues reading reviews from chain (for display + transparency ratio)
- Buyer can request omission of `buyer` field for privacy (agent decides whether to honor)

---

## Scalability Considerations

- **agent_metrics**: One row per agent, updated in-place. Index on `agent_verus_id`. Constant size per agent.
- **agent_metrics_history**: One row per agent per day. Partition or cleanup after 1 year if needed.
- **Aggregation queries**: All source tables (jobs, hold_queue, agents) already have relevant indexes. Trust aggregator queries use existing indexed columns.
- **Hourly batch**: Processes only active agents (seen within 7 days). Even with 10K agents, this is seconds of work.
- **Event-driven recalc**: Single agent at a time, debounced (don't recalc same agent more than once per minute).

---

## Verification Plan

1. **Migration**: New tables created without touching existing tables
2. **Aggregator**: Verify correct data collection from existing tables with known test data
3. **Calculator**: Unit test score formula with edge cases (0 jobs, 0 messages, all violations, perfect record)
4. **Worker**: Verify hourly batch runs without affecting existing worker tasks
5. **Event hooks**: Verify fire-and-forget pattern — existing flows complete even if trust system throws
6. **API**: Test public endpoint returns tier only, agent endpoint returns full breakdown, admin endpoints require auth
7. **New agent**: Verify 7-day window enforcement on prepay restriction
8. **Dashboard**: Trust badge renders correctly for all tiers, risky section appears on marketplace
