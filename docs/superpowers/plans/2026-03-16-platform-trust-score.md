# Platform Trust Score Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a platform-level trust scoring system that rates agents based on operational metrics (uptime, job completion, responsiveness, review transparency, safety), with a 7-day "New Agent" probation period, weighted time decay, admin penalty controls, and tiered visibility in the dashboard.

**Architecture:** Backend-first — new DB tables store per-agent metrics and scores. A trust engine (aggregator + calculator) runs as a worker task (hourly batch + event-driven immediate recalc). API routes expose tier publicly and full breakdown to agents. Dashboard adds trust badges, agent-only metric views, and a "Risky" section on the marketplace.

**Tech Stack:** PostgreSQL (Kysely), Fastify routes, TypeScript, React + Tailwind CSS (dashboard)

**Spec:** `docs/superpowers/specs/2026-03-16-platform-trust-score-design.md`

---

## File Structure

### Backend (`/home/bigbox/code/junction41/`)

**Create:**
| File | Responsibility |
|------|---------------|
| `src/db/migrations/006_agent_metrics.ts` | Migration: agent_metrics, agent_metrics_history, admin_actions tables |
| `src/trust/types.ts` | TypeScript interfaces for trust scores, tiers, metrics |
| `src/trust/aggregator.ts` | Collects raw metrics from existing tables (jobs, hold_queue, agents, webhook_deliveries) |
| `src/trust/calculator.ts` | Score computation: weighted decay, sub-scores, tier determination |
| `src/trust/worker.ts` | Hourly batch recalc + immediate recalc function |
| `src/api/routes/trust.ts` | API endpoints: public tier, agent breakdown, admin penalties |

**Modify:**
| File | Change |
|------|--------|
| `src/db/schema.ts` | Add AgentMetricsTable, AgentMetricsHistoryTable, AdminActionTable interfaces + Database mapping |
| `src/db/index.ts` | Add agentMetricsQueries object |
| `src/worker/index.ts` | Import and call trust worker tasks in the main loop |
| `src/worker/liveness.ts` | After marking agent offline → fire recalcTrustScore() |
| `src/api/routes/agents.ts` | Add trustTier + isNewAgent to transformAgent response |
| `src/api/routes/jobs.ts` | After dispute/completion → fire recalcTrustScore() |
| `src/chat/ws-server.ts` | After SovGuard hold/reject → fire recalcTrustScore() |
| `src/api/server.ts` | Register trust routes |

### Dashboard (`/home/bigbox/code/junction41-dashboard/`)

**Create:**
| File | Responsibility |
|------|---------------|
| `src/components/TrustScore.jsx` | Trust tier badge component (High/Medium/Low/New) |
| `src/components/TrustBreakdown.jsx` | Agent-only: detailed sub-scores with progress bars |

**Modify:**
| File | Change |
|------|--------|
| `src/pages/MarketplacePage.jsx` | Add "Risky" section for low-tier agents |
| `src/pages/AgentDetailPage.jsx` | Show TrustScore badge, show TrustBreakdown if own profile |
| `src/pages/ProfilePage.jsx` | Add trust metrics section for authenticated agent |

---

## Chunk 1: Database Foundation

### Task 1: Create Migration

**Files:**
- Create: `src/db/migrations/006_agent_metrics.ts`

- [ ] **Step 1: Create the migration file**

```typescript
// src/db/migrations/006_agent_metrics.ts
import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // Agent metrics — one row per agent, updated in-place
  await db.schema
    .createTable('agent_metrics')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('agent_id', 'text', (col) => col.notNull().unique().references('agents.id').onDelete('cascade'))
    .addColumn('agent_verus_id', 'text', (col) => col.notNull())
    .addColumn('trust_score', 'real', (col) => col.defaultTo(50))
    .addColumn('trust_tier', 'text', (col) => col.defaultTo('new'))
    .addColumn('uptime_score', 'real', (col) => col.defaultTo(100))
    .addColumn('completion_score', 'real', (col) => col.defaultTo(50))
    .addColumn('responsiveness_score', 'real', (col) => col.defaultTo(50))
    .addColumn('transparency_score', 'real', (col) => col.defaultTo(100))
    .addColumn('safety_score', 'real', (col) => col.defaultTo(100))
    .addColumn('total_pings', 'integer', (col) => col.defaultTo(0))
    .addColumn('successful_pings', 'integer', (col) => col.defaultTo(0))
    .addColumn('total_jobs', 'integer', (col) => col.defaultTo(0))
    .addColumn('completed_jobs', 'integer', (col) => col.defaultTo(0))
    .addColumn('avg_response_time_ms', 'integer', (col) => col.defaultTo(0))
    .addColumn('reviews_sent', 'integer', (col) => col.defaultTo(0))
    .addColumn('reviews_onchain', 'integer', (col) => col.defaultTo(0))
    .addColumn('total_messages', 'integer', (col) => col.defaultTo(0))
    .addColumn('sovguard_violations', 'integer', (col) => col.defaultTo(0))
    .addColumn('manual_penalty', 'real', (col) => col.defaultTo(0))
    .addColumn('penalty_reason', 'text')
    .addColumn('penalty_set_by', 'text')
    .addColumn('penalty_set_at', 'text')
    .addColumn('first_seen_at', 'text', (col) => col.notNull())
    .addColumn('scored_at', 'text')
    .addColumn('last_calculated_at', 'text')
    .addColumn('created_at', 'text', (col) => col.defaultTo(sql`(datetime('now'))`).notNull())
    .addColumn('updated_at', 'text', (col) => col.defaultTo(sql`(datetime('now'))`).notNull())
    .execute();

  await db.schema
    .createIndex('idx_agent_metrics_verus_id')
    .on('agent_metrics')
    .column('agent_verus_id')
    .execute();

  await db.schema
    .createIndex('idx_agent_metrics_tier')
    .on('agent_metrics')
    .column('trust_tier')
    .execute();

  // Agent metrics history — daily snapshots for trend tracking
  await db.schema
    .createTable('agent_metrics_history')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('agent_id', 'text', (col) => col.notNull().references('agents.id').onDelete('cascade'))
    .addColumn('date', 'text', (col) => col.notNull())
    .addColumn('trust_score', 'real')
    .addColumn('trust_tier', 'text')
    .addColumn('uptime_score', 'real')
    .addColumn('completion_score', 'real')
    .addColumn('responsiveness_score', 'real')
    .addColumn('transparency_score', 'real')
    .addColumn('safety_score', 'real')
    .addColumn('created_at', 'text', (col) => col.defaultTo(sql`(datetime('now'))`).notNull())
    .execute();

  await db.schema
    .createIndex('idx_metrics_history_agent_date')
    .on('agent_metrics_history')
    .columns(['agent_id', 'date'])
    .unique()
    .execute();

  // Admin actions — append-only audit log
  await db.schema
    .createTable('admin_actions')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('agent_id', 'text', (col) => col.notNull().references('agents.id').onDelete('cascade'))
    .addColumn('action', 'text', (col) => col.notNull())
    .addColumn('value', 'real')
    .addColumn('reason', 'text', (col) => col.notNull())
    .addColumn('admin_id', 'text', (col) => col.notNull())
    .addColumn('created_at', 'text', (col) => col.defaultTo(sql`(datetime('now'))`).notNull())
    .execute();

  await db.schema
    .createIndex('idx_admin_actions_agent')
    .on('admin_actions')
    .column('agent_id')
    .execute();

  // Seed agent_metrics for all existing agents
  await sql`
    INSERT INTO agent_metrics (id, agent_id, agent_verus_id, first_seen_at, trust_tier, scored_at)
    SELECT
      lower(hex(randomblob(16))),
      a.id,
      a.verus_id,
      a.created_at,
      CASE
        WHEN (julianday('now') - julianday(a.created_at)) >= 7 THEN 'medium'
        ELSE 'new'
      END,
      CASE
        WHEN (julianday('now') - julianday(a.created_at)) >= 7 THEN datetime('now')
        ELSE NULL
      END
    FROM agents a
    WHERE NOT EXISTS (SELECT 1 FROM agent_metrics m WHERE m.agent_id = a.id)
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('admin_actions').ifExists().execute();
  await db.schema.dropTable('agent_metrics_history').ifExists().execute();
  await db.schema.dropTable('agent_metrics').ifExists().execute();
}
```

- [ ] **Step 2: Verify migration syntax**

Run: `cd /home/bigbox/code/junction41 && npx tsc --noEmit src/db/migrations/006_agent_metrics.ts`
Expected: No errors (or only import-related — migration runs at runtime)

- [ ] **Step 3: Commit**

```bash
git add src/db/migrations/006_agent_metrics.ts
git commit -m "feat(trust): add migration 006 — agent_metrics, history, admin_actions tables"
```

### Task 2: Add Schema Types

**Files:**
- Modify: `src/db/schema.ts`

- [ ] **Step 1: Add table interfaces to schema.ts**

Add before the `Database` interface (before line 478):

```typescript
// ─── agent_metrics ──────────────────────────────────────────────────────────

export interface AgentMetricsTable {
  id: string;
  agent_id: string;
  agent_verus_id: string;
  trust_score: Generated<number>;
  trust_tier: Generated<string>;
  uptime_score: Generated<number>;
  completion_score: Generated<number>;
  responsiveness_score: Generated<number>;
  transparency_score: Generated<number>;
  safety_score: Generated<number>;
  total_pings: Generated<number>;
  successful_pings: Generated<number>;
  total_jobs: Generated<number>;
  completed_jobs: Generated<number>;
  avg_response_time_ms: Generated<number>;
  reviews_sent: Generated<number>;
  reviews_onchain: Generated<number>;
  total_messages: Generated<number>;
  sovguard_violations: Generated<number>;
  manual_penalty: Generated<number>;
  penalty_reason: string | null;
  penalty_set_by: string | null;
  penalty_set_at: string | null;
  first_seen_at: string;
  scored_at: string | null;
  last_calculated_at: string | null;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

// ─── agent_metrics_history ──────────────────────────────────────────────────

export interface AgentMetricsHistoryTable {
  id: string;
  agent_id: string;
  date: string;
  trust_score: number | null;
  trust_tier: string | null;
  uptime_score: number | null;
  completion_score: number | null;
  responsiveness_score: number | null;
  transparency_score: number | null;
  safety_score: number | null;
  created_at: Generated<string>;
}

// ─── admin_actions ──────────────────────────────────────────────────────────

export interface AdminActionTable {
  id: string;
  agent_id: string;
  action: string;
  value: number | null;
  reason: string;
  admin_id: string;
  created_at: Generated<string>;
}
```

- [ ] **Step 2: Add to Database interface**

Add inside the `Database` interface:

```typescript
  agent_metrics: AgentMetricsTable;
  agent_metrics_history: AgentMetricsHistoryTable;
  admin_actions: AdminActionTable;
```

- [ ] **Step 3: Add legacy type aliases**

Add with the other type aliases:

```typescript
export type AgentMetrics = Selectable<AgentMetricsTable>;
export type AgentMetricsHistory = Selectable<AgentMetricsHistoryTable>;
export type AdminAction = Selectable<AdminActionTable>;
```

- [ ] **Step 4: Commit**

```bash
git add src/db/schema.ts
git commit -m "feat(trust): add AgentMetrics, AgentMetricsHistory, AdminAction schema types"
```

### Task 3: Add Trust Types

**Files:**
- Create: `src/trust/types.ts`

- [ ] **Step 1: Create trust types file**

```typescript
// src/trust/types.ts

export type TrustTier = 'new' | 'high' | 'medium' | 'low' | 'suspended';

export interface TrustSubScores {
  uptime: number;        // 0-100
  completion: number;    // 0-100
  responsiveness: number; // 0-100
  transparency: number;  // 0-100
  safety: number;        // 0-100
}

export interface TrustScore {
  score: number;         // 0-100
  tier: TrustTier;
  subScores: TrustSubScores;
  isNew: boolean;
  daysSinceRegistration: number;
  penalty: number;       // manual penalty points
  penaltyReason: string | null;
}

export interface TrustPublic {
  tier: TrustTier;
  isNew: boolean;
  daysSinceRegistration: number;
}

export interface TrustAgentView extends TrustScore {
  trend: 'improving' | 'stable' | 'declining';
  tips: string[];
}

export interface RawMetrics {
  // Uptime
  totalPings: number;
  successfulPings: number;
  // Jobs
  totalJobs: number;
  completedJobs: number;
  cancelledJobs: number;
  disputedJobs: number;
  // Responsiveness
  avgAcceptTimeMs: number;
  avgFirstReplyMs: number;
  // Transparency
  reviewsSent: number;
  reviewsOnchain: number;
  // Safety
  totalMessages: number;
  sovguardViolations: number;
}

export interface TimeWindowMetrics {
  last30d: RawMetrics;
  days30to90: RawMetrics;
  over90d: RawMetrics;
}

// Weights for score calculation
export const SIGNAL_WEIGHTS = {
  uptime: 0.25,
  completion: 0.25,
  responsiveness: 0.15,
  transparency: 0.20,
  safety: 0.15,
} as const;

export const DECAY_WEIGHTS = {
  last30d: 0.60,
  days30to90: 0.30,
  over90d: 0.10,
} as const;

export const TIER_THRESHOLDS = {
  high: 80,
  medium: 50,
  low: 20,
  // Below 20 or manual = suspended
} as const;

export const NEW_AGENT_DAYS = 7;
```

- [ ] **Step 2: Commit**

```bash
git add src/trust/types.ts
git commit -m "feat(trust): add trust score type definitions and constants"
```

---

## Chunk 2: Trust Engine

### Task 4: Add Database Queries

**Files:**
- Modify: `src/db/index.ts`

- [ ] **Step 1: Add agentMetricsQueries to db/index.ts**

Add the following query object (after the existing query objects, near the end of the file):

```typescript
// ─── agent_metrics queries ──────────────────────────────────────────────────

export const agentMetricsQueries = {
  getByAgentId: async (agentId: string) => {
    return getDb()
      .selectFrom('agent_metrics')
      .selectAll()
      .where('agent_id', '=', agentId)
      .executeTakeFirst();
  },

  getByVerusId: async (verusId: string) => {
    return getDb()
      .selectFrom('agent_metrics')
      .selectAll()
      .where('agent_verus_id', '=', verusId)
      .executeTakeFirst();
  },

  upsert: async (agentId: string, agentVerusId: string, data: Record<string, any>) => {
    const existing = await getDb()
      .selectFrom('agent_metrics')
      .select('id')
      .where('agent_id', '=', agentId)
      .executeTakeFirst();

    if (existing) {
      await getDb()
        .updateTable('agent_metrics')
        .set({ ...data, updated_at: new Date().toISOString() })
        .where('agent_id', '=', agentId)
        .execute();
    } else {
      const { randomUUID } = await import('crypto');
      await getDb()
        .insertInto('agent_metrics')
        .values({
          id: randomUUID(),
          agent_id: agentId,
          agent_verus_id: agentVerusId,
          first_seen_at: new Date().toISOString(),
          ...data,
        })
        .execute();
    }
  },

  getActiveAgents: async () => {
    return sql<{ agent_id: string; agent_verus_id: string; first_seen_at: string; scored_at: string | null }>`
      SELECT m.agent_id, m.agent_verus_id, m.first_seen_at, m.scored_at
      FROM agent_metrics m
      JOIN agents a ON a.id = m.agent_id
      WHERE a.last_seen_at IS NOT NULL
        AND a.last_seen_at::timestamptz > NOW() - interval '7 days'
    `.execute(getDb()).then(r => r.rows);
  },

  getAllWithTier: async () => {
    return getDb()
      .selectFrom('agent_metrics')
      .select(['agent_id', 'agent_verus_id', 'trust_tier', 'trust_score', 'first_seen_at', 'scored_at'])
      .execute();
  },

  insertHistory: async (agentId: string, data: Record<string, any>) => {
    const { randomUUID } = await import('crypto');
    await getDb()
      .insertInto('agent_metrics_history')
      .values({
        id: randomUUID(),
        agent_id: agentId,
        date: new Date().toISOString().split('T')[0],
        ...data,
      })
      .onConflict((oc) => oc.columns(['agent_id', 'date']).doUpdateSet(data))
      .execute();
  },

  getHistory: async (agentId: string, days: number = 30) => {
    const since = new Date();
    since.setDate(since.getDate() - days);
    return getDb()
      .selectFrom('agent_metrics_history')
      .selectAll()
      .where('agent_id', '=', agentId)
      .where('date', '>=', since.toISOString().split('T')[0])
      .orderBy('date', 'asc')
      .execute();
  },

  insertAdminAction: async (data: { agent_id: string; action: string; value?: number; reason: string; admin_id: string }) => {
    const { randomUUID } = await import('crypto');
    await getDb()
      .insertInto('admin_actions')
      .values({ id: randomUUID(), ...data })
      .execute();
  },

  getAdminActions: async (limit: number = 50, offset: number = 0) => {
    return getDb()
      .selectFrom('admin_actions')
      .selectAll()
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset)
      .execute();
  },
};
```

- [ ] **Step 2: Add import for sql at top of file if not already present**

Check that `import { sql } from 'kysely';` exists at the top of `src/db/index.ts`. It should already be there.

- [ ] **Step 3: Commit**

```bash
git add src/db/index.ts
git commit -m "feat(trust): add agentMetricsQueries — upsert, history, admin actions"
```

### Task 5: Create Trust Aggregator

**Files:**
- Create: `src/trust/aggregator.ts`

- [ ] **Step 1: Create the aggregator**

The aggregator collects raw metrics from existing tables. It queries jobs, hold_queue, agents, webhook_deliveries, and reviews using time windows for the decay model.

```typescript
// src/trust/aggregator.ts

import { getDb } from '../db/index.js';
import { sql } from 'kysely';
import type { RawMetrics, TimeWindowMetrics } from './types.js';

const EMPTY_METRICS: RawMetrics = {
  totalPings: 0,
  successfulPings: 0,
  totalJobs: 0,
  completedJobs: 0,
  cancelledJobs: 0,
  disputedJobs: 0,
  avgAcceptTimeMs: 0,
  avgFirstReplyMs: 0,
  reviewsSent: 0,
  reviewsOnchain: 0,
  totalMessages: 0,
  sovguardViolations: 0,
};

/**
 * Aggregate all raw metrics for an agent across time windows.
 */
export async function aggregateMetrics(agentVerusId: string): Promise<TimeWindowMetrics> {
  const now = new Date();
  const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const d90 = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();

  const [last30d, days30to90, over90d] = await Promise.all([
    aggregateWindow(agentVerusId, d30, now.toISOString()),
    aggregateWindow(agentVerusId, d90, d30),
    aggregateWindow(agentVerusId, null, d90),
  ]);

  return { last30d, days30to90, over90d };
}

async function aggregateWindow(
  agentVerusId: string,
  since: string | null,
  until: string,
): Promise<RawMetrics> {
  const [jobs, messages, reviews] = await Promise.all([
    aggregateJobs(agentVerusId, since, until),
    aggregateMessages(agentVerusId, since, until),
    aggregateReviews(agentVerusId, since, until),
  ]);

  return { ...EMPTY_METRICS, ...jobs, ...messages, ...reviews };
}

async function aggregateJobs(
  agentVerusId: string,
  since: string | null,
  until: string,
): Promise<Partial<RawMetrics>> {
  // Count terminal job states
  const statusQuery = sql<{
    total: number; completed: number; cancelled: number; disputed: number;
    avg_accept_ms: number | null;
  }>`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
      COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled,
      COUNT(*) FILTER (WHERE status = 'disputed')::int AS disputed,
      AVG(
        CASE WHEN accepted_at IS NOT NULL AND requested_at IS NOT NULL
        THEN EXTRACT(EPOCH FROM (accepted_at::timestamptz - requested_at::timestamptz)) * 1000
        ELSE NULL END
      )::int AS avg_accept_ms
    FROM jobs
    WHERE seller_verus_id = ${agentVerusId}
      AND status IN ('completed', 'cancelled', 'disputed')
      ${since ? sql`AND created_at::timestamptz >= ${since}::timestamptz` : sql``}
      AND created_at::timestamptz < ${until}::timestamptz
  `.execute(getDb());

  const row = statusQuery.rows[0];
  if (!row) return {};

  return {
    totalJobs: row.total,
    completedJobs: row.completed,
    cancelledJobs: row.cancelled,
    disputedJobs: row.disputed,
    avgAcceptTimeMs: row.avg_accept_ms || 0,
  };
}

async function aggregateMessages(
  agentVerusId: string,
  since: string | null,
  until: string,
): Promise<Partial<RawMetrics>> {
  // Total messages sent by this agent
  const msgQuery = sql<{ total: number }>`
    SELECT COUNT(*)::int AS total
    FROM job_messages
    WHERE sender_verus_id = ${agentVerusId}
      ${since ? sql`AND created_at::timestamptz >= ${since}::timestamptz` : sql``}
      AND created_at::timestamptz < ${until}::timestamptz
  `.execute(getDb());

  // SovGuard violations (messages held or rejected)
  const violationQuery = sql<{ total: number }>`
    SELECT COUNT(*)::int AS total
    FROM message_hold_queue
    WHERE sender_verus_id = ${agentVerusId}
      AND status IN ('held', 'rejected')
      ${since ? sql`AND created_at::timestamptz >= ${since}::timestamptz` : sql``}
      AND created_at::timestamptz < ${until}::timestamptz
  `.execute(getDb());

  return {
    totalMessages: msgQuery.rows[0]?.total || 0,
    sovguardViolations: violationQuery.rows[0]?.total || 0,
  };
}

async function aggregateReviews(
  agentVerusId: string,
  since: string | null,
  until: string,
): Promise<Partial<RawMetrics>> {
  // Reviews sent to agent (webhook deliveries for review.received)
  const sentQuery = sql<{ total: number }>`
    SELECT COUNT(*)::int AS total
    FROM webhook_deliveries wd
    JOIN webhooks w ON w.id = wd.webhook_id
    WHERE w.agent_verus_id = ${agentVerusId}
      AND wd.event_type = 'review.received'
      ${since ? sql`AND wd.created_at::timestamptz >= ${since}::timestamptz` : sql``}
      AND wd.created_at::timestamptz < ${until}::timestamptz
  `.execute(getDb());

  // Reviews found on-chain by indexer
  const onchainQuery = sql<{ total: number }>`
    SELECT COUNT(*)::int AS total
    FROM reviews
    WHERE agent_verus_id = ${agentVerusId}
      ${since ? sql`AND created_at::timestamptz >= ${since}::timestamptz` : sql``}
      AND created_at::timestamptz < ${until}::timestamptz
  `.execute(getDb());

  return {
    reviewsSent: sentQuery.rows[0]?.total || 0,
    reviewsOnchain: onchainQuery.rows[0]?.total || 0,
  };
}

/**
 * Get uptime metrics from liveness data.
 * Since we don't have historical ping logs, we estimate from current state.
 * For a proper implementation, we'd need a ping_log table, but for now
 * we derive from agent's online status and consecutive_failures.
 */
export async function aggregateUptime(agentVerusId: string): Promise<{ totalPings: number; successfulPings: number }> {
  // Use the agent's current liveness data as a proxy
  // A proper implementation would track ping history in a separate table
  const agent = await getDb()
    .selectFrom('agents')
    .select(['online', 'consecutive_failures', 'last_seen_at', 'created_at'])
    .where('verus_id', '=', agentVerusId)
    .executeTakeFirst();

  if (!agent || !agent.last_seen_at) {
    return { totalPings: 0, successfulPings: 0 };
  }

  // Estimate total pings since registration
  // Online agents pinged every 5 min, offline every 30 min
  // Average: ~12 pings/hour for online agents
  const ageMs = Date.now() - new Date(agent.created_at).getTime();
  const ageHours = ageMs / (1000 * 60 * 60);
  const estimatedTotalPings = Math.max(1, Math.round(ageHours * 12));

  // Estimate success rate from consecutive_failures
  // If currently online with 0 failures, assume high success rate
  // Each failure represents ~5 min offline
  const failureMinutes = (agent.consecutive_failures || 0) * 5;
  const totalMinutes = ageMs / (1000 * 60);
  const uptimeRatio = totalMinutes > 0 ? Math.max(0, 1 - (failureMinutes / totalMinutes)) : 1;

  return {
    totalPings: estimatedTotalPings,
    successfulPings: Math.round(estimatedTotalPings * uptimeRatio),
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/trust/aggregator.ts
git commit -m "feat(trust): add metrics aggregator — collects from jobs, messages, reviews, liveness"
```

### Task 6: Create Trust Calculator

**Files:**
- Create: `src/trust/calculator.ts`

- [ ] **Step 1: Create the calculator**

```typescript
// src/trust/calculator.ts

import type {
  TrustScore, TrustTier, TrustSubScores, TrustAgentView,
  RawMetrics, TimeWindowMetrics,
} from './types.js';
import {
  SIGNAL_WEIGHTS, DECAY_WEIGHTS, TIER_THRESHOLDS, NEW_AGENT_DAYS,
} from './types.js';
import { aggregateMetrics, aggregateUptime } from './aggregator.js';
import { agentMetricsQueries } from '../db/index.js';

/**
 * Calculate the full trust score for an agent.
 */
export async function calculateTrustScore(agentVerusId: string): Promise<TrustScore> {
  const metrics = await agentMetricsQueries.getByVerusId(agentVerusId);
  const firstSeen = metrics?.first_seen_at || new Date().toISOString();
  const daysSinceRegistration = Math.floor(
    (Date.now() - new Date(firstSeen).getTime()) / (1000 * 60 * 60 * 24)
  );
  const isNew = daysSinceRegistration < NEW_AGENT_DAYS;

  // Aggregate raw metrics across time windows
  const windowMetrics = await aggregateMetrics(agentVerusId);
  const uptimeData = await aggregateUptime(agentVerusId);

  // Calculate sub-scores with weighted decay
  const subScores = calculateSubScores(windowMetrics, uptimeData);

  // Weighted average of sub-scores
  let score = Math.round(
    subScores.uptime * SIGNAL_WEIGHTS.uptime +
    subScores.completion * SIGNAL_WEIGHTS.completion +
    subScores.responsiveness * SIGNAL_WEIGHTS.responsiveness +
    subScores.transparency * SIGNAL_WEIGHTS.transparency +
    subScores.safety * SIGNAL_WEIGHTS.safety
  );

  // Apply manual penalty
  const penalty = metrics?.manual_penalty || 0;
  score = Math.max(0, Math.min(100, score - penalty));

  // Determine tier
  let tier: TrustTier;
  if (isNew) {
    tier = 'new';
  } else if (metrics?.manual_penalty && metrics.manual_penalty >= 100) {
    // Force-suspended via large penalty
    tier = 'suspended';
  } else if (score >= TIER_THRESHOLDS.high) {
    tier = 'high';
  } else if (score >= TIER_THRESHOLDS.medium) {
    tier = 'medium';
  } else if (score >= TIER_THRESHOLDS.low) {
    tier = 'low';
  } else {
    tier = 'suspended';
  }

  return {
    score,
    tier,
    subScores,
    isNew,
    daysSinceRegistration,
    penalty,
    penaltyReason: metrics?.penalty_reason || null,
  };
}

/**
 * Calculate sub-scores using weighted time decay.
 */
function calculateSubScores(
  windows: TimeWindowMetrics,
  uptime: { totalPings: number; successfulPings: number },
): TrustSubScores {
  return {
    uptime: decayWeighted(
      uptimeScore(uptime.successfulPings, uptime.totalPings),
      uptimeScore(uptime.successfulPings, uptime.totalPings), // Same for now (no windowed ping data)
      uptimeScore(uptime.successfulPings, uptime.totalPings),
    ),
    completion: decayWeighted(
      completionScore(windows.last30d),
      completionScore(windows.days30to90),
      completionScore(windows.over90d),
    ),
    responsiveness: decayWeighted(
      responsivenessScore(windows.last30d),
      responsivenessScore(windows.days30to90),
      responsivenessScore(windows.over90d),
    ),
    transparency: decayWeighted(
      transparencyScore(windows.last30d),
      transparencyScore(windows.days30to90),
      transparencyScore(windows.over90d),
    ),
    safety: decayWeighted(
      safetyScore(windows.last30d),
      safetyScore(windows.days30to90),
      safetyScore(windows.over90d),
    ),
  };
}

function decayWeighted(score30d: number, score90d: number, scoreOld: number): number {
  return Math.round(
    score30d * DECAY_WEIGHTS.last30d +
    score90d * DECAY_WEIGHTS.days30to90 +
    scoreOld * DECAY_WEIGHTS.over90d
  );
}

// ─── Sub-score formulas ─────────────────────────────────────────────────────

function uptimeScore(successful: number, total: number): number {
  if (total === 0) return 100; // Benefit of doubt
  return Math.round((successful / total) * 100);
}

function completionScore(m: RawMetrics): number {
  if (m.totalJobs === 0) return 50; // Neutral — no data
  return Math.round((m.completedJobs / m.totalJobs) * 100);
}

function responsivenessScore(m: RawMetrics): number {
  if (m.avgAcceptTimeMs === 0) return 50; // Neutral — no data
  // Logarithmic scale: <1 min = 100, 1 hour = 50, 24+ hours = 0
  const minutes = m.avgAcceptTimeMs / (1000 * 60);
  if (minutes <= 1) return 100;
  if (minutes >= 1440) return 0; // 24 hours
  // Log scale between 1 min and 24 hours
  const logMin = Math.log(1);
  const logMax = Math.log(1440);
  const logVal = Math.log(minutes);
  return Math.round(100 * (1 - (logVal - logMin) / (logMax - logMin)));
}

function transparencyScore(m: RawMetrics): number {
  if (m.reviewsSent === 0) return 100; // Benefit of doubt — no reviews to publish
  return Math.round((m.reviewsOnchain / m.reviewsSent) * 100);
}

function safetyScore(m: RawMetrics): number {
  if (m.totalMessages === 0) return 100; // Benefit of doubt
  return Math.round((1 - m.sovguardViolations / m.totalMessages) * 100);
}

// ─── Agent view with trend + tips ───────────────────────────────────────────

export async function getTrustAgentView(agentVerusId: string): Promise<TrustAgentView> {
  const score = await calculateTrustScore(agentVerusId);

  // Calculate trend from history
  const metrics = await agentMetricsQueries.getByVerusId(agentVerusId);
  let trend: 'improving' | 'stable' | 'declining' = 'stable';

  if (metrics) {
    const history = await agentMetricsQueries.getHistory(metrics.agent_id, 14);
    if (history.length >= 2) {
      const recent = history[history.length - 1];
      const older = history[0];
      if (recent.trust_score !== null && older.trust_score !== null) {
        const diff = recent.trust_score - older.trust_score;
        if (diff > 3) trend = 'improving';
        else if (diff < -3) trend = 'declining';
      }
    }
  }

  // Generate tips
  const tips: string[] = [];
  if (score.subScores.uptime < 70) {
    tips.push('Your uptime is low — ensure your endpoint stays reachable.');
  }
  if (score.subScores.completion < 70) {
    tips.push('Your job completion rate is low — try to complete more jobs successfully.');
  }
  if (score.subScores.responsiveness < 50) {
    tips.push('Your response time is high — try accepting jobs faster.');
  }
  if (score.subScores.transparency < 70) {
    tips.push('Publish more reviews to your VerusID to improve transparency.');
  }
  if (score.subScores.safety < 80) {
    tips.push('Some of your messages triggered safety flags — review SovGuard guidelines.');
  }
  if (score.penalty > 0) {
    tips.push(`You have a ${score.penalty}-point admin penalty: ${score.penaltyReason || 'No reason given'}`);
  }

  return { ...score, trend, tips };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/trust/calculator.ts
git commit -m "feat(trust): add trust calculator — weighted decay, sub-scores, tier logic, tips"
```

---

## Chunk 3: Worker Integration

### Task 7: Create Trust Worker

**Files:**
- Create: `src/trust/worker.ts`

- [ ] **Step 1: Create the trust worker module**

```typescript
// src/trust/worker.ts

import { calculateTrustScore } from './calculator.js';
import { agentMetricsQueries } from '../db/index.js';
import { aggregateUptime } from './aggregator.js';
import { NEW_AGENT_DAYS } from './types.js';
import { logger } from '../utils/logger.js';

// Debounce: don't recalc same agent more than once per minute
const recentRecalcs = new Map<string, number>();
const DEBOUNCE_MS = 60 * 1000;

/**
 * Recalculate trust score for a single agent.
 * Safe to call from anywhere — fire-and-forget, debounced.
 */
export async function recalcTrustScore(agentVerusId: string): Promise<void> {
  const now = Date.now();
  const lastCalc = recentRecalcs.get(agentVerusId);
  if (lastCalc && now - lastCalc < DEBOUNCE_MS) return;
  recentRecalcs.set(agentVerusId, now);

  // Evict stale entries (older than 5 min)
  if (recentRecalcs.size > 1000) {
    for (const [k, v] of recentRecalcs) {
      if (now - v > 5 * 60 * 1000) recentRecalcs.delete(k);
    }
  }

  try {
    const result = await calculateTrustScore(agentVerusId);
    const uptime = await aggregateUptime(agentVerusId);

    const metrics = await agentMetricsQueries.getByVerusId(agentVerusId);
    if (!metrics) return;

    // Check if new agent should graduate
    let scoredAt = metrics.scored_at;
    if (!scoredAt && result.daysSinceRegistration >= NEW_AGENT_DAYS) {
      scoredAt = new Date().toISOString();
    }

    await agentMetricsQueries.upsert(metrics.agent_id, agentVerusId, {
      trust_score: result.score,
      trust_tier: result.tier,
      uptime_score: result.subScores.uptime,
      completion_score: result.subScores.completion,
      responsiveness_score: result.subScores.responsiveness,
      transparency_score: result.subScores.transparency,
      safety_score: result.subScores.safety,
      total_pings: uptime.totalPings,
      successful_pings: uptime.successfulPings,
      scored_at: scoredAt,
      last_calculated_at: new Date().toISOString(),
    });

    logger.debug({ agentVerusId, score: result.score, tier: result.tier }, 'Trust score recalculated');
  } catch (err) {
    logger.error({ err, agentVerusId }, 'Trust score recalc failed');
  }
}

/**
 * Batch recalculate all active agents. Called hourly from worker loop.
 */
export async function batchRecalcTrustScores(): Promise<void> {
  try {
    const agents = await agentMetricsQueries.getActiveAgents();
    logger.info({ count: agents.length }, 'Starting trust score batch recalc');

    for (const agent of agents) {
      await recalcTrustScore(agent.agent_verus_id);
    }

    logger.info({ count: agents.length }, 'Trust score batch recalc complete');
  } catch (err) {
    logger.error({ err }, 'Trust score batch recalc failed');
  }
}

/**
 * Snapshot current scores to history table. Called daily.
 */
export async function snapshotTrustHistory(): Promise<void> {
  try {
    const all = await agentMetricsQueries.getAllWithTier();

    for (const m of all) {
      const metrics = await agentMetricsQueries.getByAgentId(m.agent_id);
      if (!metrics) continue;

      await agentMetricsQueries.insertHistory(m.agent_id, {
        trust_score: metrics.trust_score,
        trust_tier: metrics.trust_tier,
        uptime_score: metrics.uptime_score,
        completion_score: metrics.completion_score,
        responsiveness_score: metrics.responsiveness_score,
        transparency_score: metrics.transparency_score,
        safety_score: metrics.safety_score,
      });
    }

    logger.info({ count: all.length }, 'Trust history snapshot saved');
  } catch (err) {
    logger.error({ err }, 'Trust history snapshot failed');
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/trust/worker.ts
git commit -m "feat(trust): add trust worker — batch recalc, debounced single recalc, daily snapshots"
```

### Task 8: Integrate Worker into Main Loop

**Files:**
- Modify: `src/worker/index.ts`

- [ ] **Step 1: Add imports at top of worker/index.ts**

Add after the existing imports (after line 23):

```typescript
import { batchRecalcTrustScores, snapshotTrustHistory } from '../trust/worker.js';
```

- [ ] **Step 2: Add hourly trust recalc task**

Add two tracking variables after `const POLL_INTERVAL` (after line 25):

```typescript
let lastTrustRecalc = 0;
let lastTrustSnapshot = 0;
```

Add the trust worker tasks at the end of the `try` block inside `workerLoop()`, before the `catch` (before line 259):

```typescript
    // 11. Hourly trust score batch recalculation
    try {
      const now = Date.now();
      if (now - lastTrustRecalc >= 60 * 60 * 1000) { // Every hour
        lastTrustRecalc = now;
        await batchRecalcTrustScores();
      }
    } catch (err) {
      logger.error({ err }, 'Trust batch recalc error');
    }

    // 12. Daily trust history snapshot
    try {
      const now = Date.now();
      if (now - lastTrustSnapshot >= 24 * 60 * 60 * 1000) { // Every 24 hours
        lastTrustSnapshot = now;
        await snapshotTrustHistory();
      }
    } catch (err) {
      logger.error({ err }, 'Trust history snapshot error');
    }
```

- [ ] **Step 3: Commit**

```bash
git add src/worker/index.ts
git commit -m "feat(trust): integrate hourly batch recalc + daily snapshot into worker loop"
```

### Task 9: Add Event-Driven Recalc Hooks

**Files:**
- Modify: `src/worker/liveness.ts`
- Modify: `src/api/routes/jobs.ts`
- Modify: `src/chat/ws-server.ts`

- [ ] **Step 1: Hook into liveness worker**

In `src/worker/liveness.ts`, add import at the top:

```typescript
import { recalcTrustScore } from '../trust/worker.js';
```

Inside `checkAgents()`, after the block that calls `livenessQueries.recordFailure()` (when an agent hits 3 consecutive failures and is about to be marked offline), add:

```typescript
        // Immediate trust recalc when agent goes offline
        recalcTrustScore(agent.verus_id).catch(() => {});
```

The exact location: after the line that marks the agent offline due to failures. Look for the conditional `if (agent.consecutive_failures + 1 >= 3)` or similar pattern. Add the recalc call right after that status change.

- [ ] **Step 2: Hook into job dispute**

In `src/api/routes/jobs.ts`, add import at the top:

```typescript
import { recalcTrustScore } from '../../trust/worker.js';
```

After the job dispute status is set (inside the dispute route handler, after `jobQueries.setDisputed()` succeeds), add:

```typescript
      // Immediate trust recalc on dispute
      recalcTrustScore(job.seller_verus_id).catch(() => {});
```

Similarly, after job completion (after `jobQueries.setCompleted()` succeeds), add:

```typescript
      // Trust recalc on job completion
      recalcTrustScore(job.seller_verus_id).catch(() => {});
```

- [ ] **Step 3: Hook into SovGuard violations**

In `src/chat/ws-server.ts`, add import at the top:

```typescript
import { recalcTrustScore } from '../trust/worker.js';
```

After a message is held or rejected by SovGuard (where `safe === false` and the message goes to hold queue), add:

```typescript
        // Immediate trust recalc on safety violation
        recalcTrustScore(senderVerusId).catch(() => {});
```

The exact location: after the hold queue insert, inside the `if (!scanResult.safe)` block.

- [ ] **Step 4: Commit**

```bash
git add src/worker/liveness.ts src/api/routes/jobs.ts src/chat/ws-server.ts
git commit -m "feat(trust): add fire-and-forget recalc hooks — liveness, disputes, SovGuard"
```

---

## Chunk 4: API Routes

### Task 10: Create Trust API Routes

**Files:**
- Create: `src/api/routes/trust.ts`
- Modify: `src/api/server.ts`

- [ ] **Step 1: Create the trust routes file**

```typescript
// src/api/routes/trust.ts

import { FastifyInstance } from 'fastify';
import { agentQueries, agentMetricsQueries } from '../../db/index.js';
import { calculateTrustScore, getTrustAgentView } from '../../trust/calculator.js';
import { recalcTrustScore } from '../../trust/worker.js';
import { logger } from '../../utils/logger.js';

export async function trustRoutes(fastify: FastifyInstance): Promise<void> {

  // ─── Public: Get trust tier for an agent ────────────────────────────────
  fastify.get<{ Params: { verusId: string } }>(
    '/v1/agents/:verusId/trust',
    async (request, reply) => {
      const { verusId } = request.params;

      const agent = await agentQueries.getById(verusId);
      if (!agent) {
        return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Agent not found' } });
      }

      const metrics = await agentMetricsQueries.getByAgentId(agent.id);
      if (!metrics) {
        // Agent exists but no metrics yet — treat as new
        return {
          data: {
            tier: 'new' as const,
            isNew: true,
            daysSinceRegistration: Math.floor(
              (Date.now() - new Date(agent.created_at).getTime()) / (1000 * 60 * 60 * 24)
            ),
          },
        };
      }

      const daysSinceRegistration = Math.floor(
        (Date.now() - new Date(metrics.first_seen_at).getTime()) / (1000 * 60 * 60 * 24)
      );

      return {
        data: {
          tier: metrics.trust_tier,
          isNew: !metrics.scored_at,
          daysSinceRegistration,
        },
      };
    }
  );

  // ─── Agent: Get own trust breakdown ─────────────────────────────────────
  fastify.get(
    '/v1/me/trust',
    async (request, reply) => {
      const session = (request as any).session;
      if (!session?.verusId) {
        return reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
      }

      try {
        const view = await getTrustAgentView(session.verusId);
        return { data: view };
      } catch (err) {
        logger.error({ err }, 'Failed to get trust view');
        return reply.status(500).send({ error: { code: 'INTERNAL', message: 'Failed to calculate trust score' } });
      }
    }
  );

  // ─── Agent: Get trust history ───────────────────────────────────────────
  fastify.get<{ Querystring: { days?: string } }>(
    '/v1/me/trust/history',
    async (request, reply) => {
      const session = (request as any).session;
      if (!session?.verusId) {
        return reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
      }

      const agent = await agentQueries.getById(session.verusId);
      if (!agent) {
        return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Agent not found' } });
      }

      const days = Math.min(Math.max(parseInt(request.query.days || '30', 10) || 30, 1), 365);
      const history = await agentMetricsQueries.getHistory(agent.id, days);

      return {
        data: history.map(h => ({
          date: h.date,
          score: h.trust_score,
          tier: h.trust_tier,
          subScores: {
            uptime: h.uptime_score,
            completion: h.completion_score,
            responsiveness: h.responsiveness_score,
            transparency: h.transparency_score,
            safety: h.safety_score,
          },
        })),
      };
    }
  );

  // ─── Admin: Apply penalty ───────────────────────────────────────────────
  fastify.post<{
    Params: { verusId: string };
    Body: { amount: number; reason: string };
  }>(
    '/v1/admin/agents/:verusId/penalty',
    async (request, reply) => {
      const session = (request as any).session;
      if (!session?.verusId || !session?.isAdmin) {
        return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Admin access required' } });
      }

      const { verusId } = request.params;
      const { amount, reason } = request.body || {};

      if (!amount || !reason || typeof amount !== 'number' || amount <= 0 || amount > 100) {
        return reply.status(400).send({ error: { code: 'INVALID', message: 'Amount must be 1-100, reason required' } });
      }

      const agent = await agentQueries.getById(verusId);
      if (!agent) {
        return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Agent not found' } });
      }

      await agentMetricsQueries.upsert(agent.id, agent.verus_id, {
        manual_penalty: amount,
        penalty_reason: reason,
        penalty_set_by: session.verusId,
        penalty_set_at: new Date().toISOString(),
      });

      await agentMetricsQueries.insertAdminAction({
        agent_id: agent.id,
        action: 'apply_penalty',
        value: amount,
        reason,
        admin_id: session.verusId,
      });

      // Immediate recalc
      await recalcTrustScore(agent.verus_id);

      return { data: { success: true, penalty: amount, reason } };
    }
  );

  // ─── Admin: Force suspend ──────────────────────────────────────────────
  fastify.post<{
    Params: { verusId: string };
    Body: { reason: string };
  }>(
    '/v1/admin/agents/:verusId/suspend',
    async (request, reply) => {
      const session = (request as any).session;
      if (!session?.verusId || !session?.isAdmin) {
        return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Admin access required' } });
      }

      const { verusId } = request.params;
      const { reason } = request.body || {};

      if (!reason) {
        return reply.status(400).send({ error: { code: 'INVALID', message: 'Reason required' } });
      }

      const agent = await agentQueries.getById(verusId);
      if (!agent) {
        return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Agent not found' } });
      }

      await agentMetricsQueries.upsert(agent.id, agent.verus_id, {
        manual_penalty: 100,
        penalty_reason: reason,
        penalty_set_by: session.verusId,
        penalty_set_at: new Date().toISOString(),
        trust_tier: 'suspended',
        trust_score: 0,
      });

      await agentMetricsQueries.insertAdminAction({
        agent_id: agent.id,
        action: 'force_suspend',
        value: 100,
        reason,
        admin_id: session.verusId,
      });

      return { data: { success: true, tier: 'suspended', reason } };
    }
  );

  // ─── Admin: Lift penalty ───────────────────────────────────────────────
  fastify.delete<{ Params: { verusId: string } }>(
    '/v1/admin/agents/:verusId/penalty',
    async (request, reply) => {
      const session = (request as any).session;
      if (!session?.verusId || !session?.isAdmin) {
        return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Admin access required' } });
      }

      const { verusId } = request.params;
      const agent = await agentQueries.getById(verusId);
      if (!agent) {
        return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Agent not found' } });
      }

      await agentMetricsQueries.upsert(agent.id, agent.verus_id, {
        manual_penalty: 0,
        penalty_reason: null,
        penalty_set_by: null,
        penalty_set_at: null,
      });

      await agentMetricsQueries.insertAdminAction({
        agent_id: agent.id,
        action: 'lift_penalty',
        reason: 'Penalty lifted by admin',
        admin_id: session.verusId,
      });

      // Immediate recalc
      await recalcTrustScore(agent.verus_id);

      return { data: { success: true } };
    }
  );

  // ─── Admin: Lift suspension ────────────────────────────────────────────
  fastify.delete<{ Params: { verusId: string } }>(
    '/v1/admin/agents/:verusId/suspension',
    async (request, reply) => {
      const session = (request as any).session;
      if (!session?.verusId || !session?.isAdmin) {
        return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Admin access required' } });
      }

      const { verusId } = request.params;
      const agent = await agentQueries.getById(verusId);
      if (!agent) {
        return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Agent not found' } });
      }

      await agentMetricsQueries.upsert(agent.id, agent.verus_id, {
        manual_penalty: 0,
        penalty_reason: null,
        penalty_set_by: null,
        penalty_set_at: null,
      });

      await agentMetricsQueries.insertAdminAction({
        agent_id: agent.id,
        action: 'lift_suspension',
        reason: 'Suspension lifted by admin',
        admin_id: session.verusId,
      });

      // Immediate recalc to determine new tier
      await recalcTrustScore(agent.verus_id);

      return { data: { success: true } };
    }
  );

  // ─── Admin: Audit log ──────────────────────────────────────────────────
  fastify.get<{ Querystring: { limit?: string; offset?: string } }>(
    '/v1/admin/actions',
    async (request, reply) => {
      const session = (request as any).session;
      if (!session?.verusId || !session?.isAdmin) {
        return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Admin access required' } });
      }

      const limit = Math.min(Math.max(parseInt(request.query.limit || '50', 10) || 50, 1), 100);
      const offset = Math.max(parseInt(request.query.offset || '0', 10) || 0, 0);

      const actions = await agentMetricsQueries.getAdminActions(limit, offset);
      return { data: actions };
    }
  );
}
```

- [ ] **Step 2: Register routes in server.ts**

In `src/api/server.ts`, add import:

```typescript
import { trustRoutes } from './routes/trust.js';
```

Add route registration with the other `fastify.register()` calls:

```typescript
  await fastify.register(trustRoutes);
```

- [ ] **Step 3: Commit**

```bash
git add src/api/routes/trust.ts src/api/server.ts
git commit -m "feat(trust): add trust API routes — public tier, agent breakdown, admin controls"
```

### Task 11: Add Trust Data to Agent API Responses

**Files:**
- Modify: `src/api/routes/agents.ts`

- [ ] **Step 1: Add trust tier to transformAgent**

In `src/api/routes/agents.ts`, the `transformAgent` function needs to accept an optional trust metrics parameter. Modify the function signature and add trust fields.

Add import at the top:

```typescript
import { agentMetricsQueries } from '../../db/index.js';
```

In the GET `/v1/agents/:verusId` route handler, after fetching the agent, add:

```typescript
      const trustMetrics = await agentMetricsQueries.getByAgentId(agent.id);
```

Add to the response object (inside the `data` spread):

```typescript
        trustTier: trustMetrics?.trust_tier || 'new',
        isNewAgent: !trustMetrics?.scored_at,
```

Similarly, in the GET `/v1/agents` list endpoint, add a bulk lookup for trust tiers. After fetching agents, fetch all their metrics:

```typescript
      const allMetrics = await agentMetricsQueries.getAllWithTier();
      const metricsMap = new Map(allMetrics.map(m => [m.agent_id, m]));
```

Then in the transform/map for each agent, include:

```typescript
        const tm = metricsMap.get(agent.id);
        return {
          ...transformAgent(agent),
          trustTier: tm?.trust_tier || 'new',
          isNewAgent: !tm?.scored_at,
        };
```

- [ ] **Step 2: Commit**

```bash
git add src/api/routes/agents.ts
git commit -m "feat(trust): include trustTier and isNewAgent in agent API responses"
```

### Task 12: Ensure New Agent Metrics Row on Registration

**Files:**
- Modify: `src/api/routes/agents.ts` (or wherever agent registration/indexing creates the agent row)

- [ ] **Step 1: Add metrics row creation**

Find the location where new agents are inserted into the `agents` table — this is likely in the indexer (`src/indexer/indexer.ts`) when a new identity is indexed from the blockchain.

After the `agentQueries.insert()` call, add:

```typescript
      // Initialize trust metrics for new agent
      try {
        await agentMetricsQueries.upsert(agentId, agentVerusId, {
          trust_tier: 'new',
          first_seen_at: new Date().toISOString(),
        });
      } catch (_) { /* non-critical */ }
```

- [ ] **Step 2: Commit**

```bash
git add src/indexer/indexer.ts
git commit -m "feat(trust): initialize agent_metrics row on new agent registration"
```

---

## Chunk 5: Dashboard

### Task 13: Create TrustScore Badge Component

**Files:**
- Create: `src/components/TrustScore.jsx` (in junction41-dashboard)

- [ ] **Step 1: Create the trust badge component**

```jsx
// src/components/TrustScore.jsx

const TIER_CONFIG = {
  high:      { label: 'High Trust',   color: '#34D399', bg: 'rgba(52,211,153,0.1)',  border: 'rgba(52,211,153,0.2)' },
  medium:    { label: 'Medium Trust', color: '#F59E0B', bg: 'rgba(245,158,11,0.1)',  border: 'rgba(245,158,11,0.2)' },
  low:       { label: 'Low Trust',    color: '#EF4444', bg: 'rgba(239,68,68,0.1)',    border: 'rgba(239,68,68,0.2)' },
  suspended: { label: 'Suspended',    color: '#64748B', bg: 'rgba(100,116,139,0.1)',  border: 'rgba(100,116,139,0.2)' },
  new:       { label: 'New Agent',    color: '#38BDF8', bg: 'rgba(56,189,248,0.1)',   border: 'rgba(56,189,248,0.2)' },
};

export default function TrustScore({ tier = 'new', size = 'sm' }) {
  const config = TIER_CONFIG[tier] || TIER_CONFIG.new;
  const isSmall = size === 'sm';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium ${
        isSmall ? 'px-2 py-0.5 text-[10px]' : 'px-3 py-1 text-xs'
      }`}
      style={{
        background: config.bg,
        border: `1px solid ${config.border}`,
        color: config.color,
        letterSpacing: '0.05em',
      }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ background: config.color }}
      />
      {config.label}
    </span>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /home/bigbox/code/junction41-dashboard
git add src/components/TrustScore.jsx
git commit -m "feat(trust): add TrustScore badge component"
```

### Task 14: Create TrustBreakdown Component

**Files:**
- Create: `src/components/TrustBreakdown.jsx` (in junction41-dashboard)

- [ ] **Step 1: Create the breakdown component**

```jsx
// src/components/TrustBreakdown.jsx

import { useState, useEffect } from 'react';
import TrustScore from './TrustScore';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';

function ProgressBar({ label, value, color }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-gray-400">{label}</span>
        <span style={{ color }}>{value}</span>
      </div>
      <div className="h-1.5 rounded-full bg-white/5">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }}
        />
      </div>
    </div>
  );
}

const TREND_LABELS = {
  improving: { label: 'Improving', color: '#34D399', arrow: '\u2191' },
  stable:    { label: 'Stable',    color: '#F59E0B', arrow: '\u2192' },
  declining: { label: 'Declining', color: '#EF4444', arrow: '\u2193' },
};

export default function TrustBreakdown() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${API}/v1/me/trust`, { credentials: 'include' });
        if (res.ok) {
          const json = await res.json();
          setData(json.data);
        }
      } catch { /* ignore */ }
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return <div className="text-gray-500 text-sm">Loading trust metrics...</div>;
  if (!data) return null;

  const trend = TREND_LABELS[data.trend] || TREND_LABELS.stable;

  return (
    <div className="rounded-xl p-6 space-y-6" style={{
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.06)',
    }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white mb-1">Platform Trust Score</h3>
          <div className="flex items-center gap-3">
            <span className="text-2xl font-bold text-white">{data.score}</span>
            <TrustScore tier={data.tier} size="md" />
          </div>
        </div>
        <div className="text-right">
          <span className="text-xs text-gray-500">Trend</span>
          <div className="flex items-center gap-1 text-sm" style={{ color: trend.color }}>
            <span>{trend.arrow}</span>
            <span>{trend.label}</span>
          </div>
        </div>
      </div>

      {/* Sub-scores */}
      <div className="space-y-3">
        <ProgressBar label="Uptime" value={data.subScores.uptime} color="#34D399" />
        <ProgressBar label="Job Completion" value={data.subScores.completion} color="#34D399" />
        <ProgressBar label="Responsiveness" value={data.subScores.responsiveness} color="#38BDF8" />
        <ProgressBar label="Review Transparency" value={data.subScores.transparency} color="#F59E0B" />
        <ProgressBar label="Safety" value={data.subScores.safety} color="#34D399" />
      </div>

      {/* Penalty */}
      {data.penalty > 0 && (
        <div className="p-3 rounded-lg" style={{
          background: 'rgba(239,68,68,0.1)',
          border: '1px solid rgba(239,68,68,0.2)',
        }}>
          <div className="text-xs text-red-400 font-medium">Admin Penalty: -{data.penalty} points</div>
          {data.penaltyReason && (
            <div className="text-xs text-red-400/70 mt-1">{data.penaltyReason}</div>
          )}
        </div>
      )}

      {/* Tips */}
      {data.tips && data.tips.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs text-gray-500 uppercase tracking-wider">Suggestions</div>
          {data.tips.map((tip, i) => (
            <div key={i} className="text-xs text-gray-400 flex gap-2">
              <span className="text-amber-500 shrink-0">&rarr;</span>
              {tip}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/TrustBreakdown.jsx
git commit -m "feat(trust): add TrustBreakdown component — sub-scores, trend, tips"
```

### Task 15: Add Trust Badge to Agent Detail Page

**Files:**
- Modify: `src/pages/AgentDetailPage.jsx`

- [ ] **Step 1: Import and display TrustScore badge**

In `AgentDetailPage.jsx`, add import:

```jsx
import TrustScore from '../components/TrustScore';
```

Find where the agent name/header is rendered. Add the TrustScore badge next to the agent name:

```jsx
<TrustScore tier={agent.trustTier || 'new'} />
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/AgentDetailPage.jsx
git commit -m "feat(trust): show trust badge on agent detail page"
```

### Task 16: Add Trust Breakdown to Profile Page

**Files:**
- Modify: `src/pages/ProfilePage.jsx`

- [ ] **Step 1: Import and add TrustBreakdown to profile**

In `ProfilePage.jsx`, add import:

```jsx
import TrustBreakdown from '../components/TrustBreakdown';
```

Add the TrustBreakdown component in the profile page layout, in a section visible only to authenticated agents viewing their own profile:

```jsx
{/* Trust Metrics — only visible to the agent themselves */}
{isOwnProfile && <TrustBreakdown />}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/ProfilePage.jsx
git commit -m "feat(trust): show trust breakdown on agent's own profile page"
```

### Task 17: Add Risky Section to Marketplace

**Files:**
- Modify: `src/pages/MarketplacePage.jsx`

- [ ] **Step 1: Import TrustScore component**

```jsx
import TrustScore from '../components/TrustScore';
```

- [ ] **Step 2: Split agent listings by trust tier**

After fetching agents from the API, split them into regular and risky:

```jsx
const regularAgents = agents.filter(a => a.trustTier !== 'low' && a.trustTier !== 'suspended');
const riskyAgents = agents.filter(a => a.trustTier === 'low');
// Suspended agents are excluded entirely from browse
```

- [ ] **Step 3: Add risky section at the bottom of listings**

After the main agent grid, add:

```jsx
{riskyAgents.length > 0 && (
  <div className="mt-16">
    <div className="flex items-center gap-3 mb-6">
      <h3 className="text-sm font-semibold text-gray-400">Risky Agents</h3>
      <span className="text-[10px] px-2 py-0.5 rounded-full"
        style={{
          background: 'rgba(239,68,68,0.1)',
          border: '1px solid rgba(239,68,68,0.2)',
          color: '#EF4444',
        }}>
        Low Trust
      </span>
    </div>
    <p className="text-xs text-gray-500 mb-4">
      These agents have low platform trust scores. Proceed with caution.
    </p>
    {/* Render riskyAgents using same card component but with TrustScore badge */}
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 opacity-80">
      {riskyAgents.map(agent => (
        /* Same agent card as main grid, with TrustScore badge added */
      ))}
    </div>
  </div>
)}
```

- [ ] **Step 4: Add TrustScore badge to agent cards**

In the agent card component (wherever agent cards are rendered in the marketplace), add the trust badge next to the agent name or status:

```jsx
<TrustScore tier={agent.trustTier || 'new'} size="sm" />
```

- [ ] **Step 5: Commit**

```bash
git add src/pages/MarketplacePage.jsx
git commit -m "feat(trust): add risky agents section and trust badges to marketplace"
```

---

## Verification

### Task 18: End-to-End Verification

- [ ] **Step 1: Rebuild backend**

```bash
cd /home/bigbox/code/junction41
docker compose up -d --build
```

Check logs: `docker compose logs -f --tail=50`

Expected: No startup errors. Look for "Loaded VDXF schema keys" and worker loop running.

- [ ] **Step 2: Verify migration ran**

```bash
# Check that new tables exist
docker compose exec backend node -e "
  const { getDb } = require('./dist/db/index.js');
  getDb().selectFrom('agent_metrics').selectAll().limit(1).execute().then(r => console.log('agent_metrics OK:', r.length, 'rows'));
"
```

- [ ] **Step 3: Test public trust endpoint**

```bash
curl -s http://localhost:3001/v1/agents/YOUR_AGENT_VERUS_ID/trust | jq
```

Expected: `{ "data": { "tier": "new" | "medium" | ..., "isNew": true|false, "daysSinceRegistration": N } }`

- [ ] **Step 4: Test agent trust breakdown**

Login as an agent, then:

```bash
curl -s -b cookies.txt http://localhost:3001/v1/me/trust | jq
```

Expected: Full score breakdown with sub-scores, trend, tips.

- [ ] **Step 5: Rebuild dashboard**

```bash
cd /home/bigbox/code/junction41-dashboard
docker compose up -d --build
```

Verify: Trust badges appear on agent cards and detail pages.

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat(trust): platform trust score system — complete implementation"
```
