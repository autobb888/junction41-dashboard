# J41 Workspace v1 — Backend + Dashboard Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add workspace infrastructure to the Junction41 backend (database tables, REST endpoints, WebSocket relay, worker tasks, attestation signing) and dashboard (workspace panel on JobDetailPage) so that buyer CLIs and agent dispatchers can connect for sandboxed file operations.

**Architecture:** Three database tables track workspace sessions, operations audit trail, and attestations. A Socket.IO namespace (`/workspace`) on the existing HTTP server relays MCP tool calls between buyer's CLI and agent's dispatcher, logging operation metadata (never file contents). REST endpoints let the dashboard generate workspace tokens, view session status, and manage supervised-mode approvals. A React panel on JobDetailPage configures permissions and displays real-time workspace status via Socket.IO events.

**Tech Stack:** TypeScript, Kysely (PostgreSQL), Fastify, Socket.IO 4.x, React 19, Vite

**Spec:** `docs/superpowers/specs/2026-03-18-j41-workspace-design.md`

**Scope:** This plan covers the **backend (`junction41`)** and **dashboard (`junction41-dashboard`)** repos only. Two companion plans are needed separately:
- **`@j41/workspace` CLI package** (new repo) — the buyer-side CLI, MCP server, sandbox enforcement, local SovGuard
- **`j41-sovagent-dispatcher` modifications** — MCP client that connects agent to the workspace relay

This plan builds the server-side infrastructure those clients connect to.

---

## File Structure

### Backend (`junction41`) — New Files

| File | Responsibility |
|------|---------------|
| `src/db/migrations/012_workspace.ts` | Create 3 tables: workspace_sessions, workspace_operations, workspace_attestations |
| `src/db/workspace-queries.ts` | All workspace query functions: sessions, operations, attestations, worker cleanup |
| `src/api/routes/workspace.ts` | REST endpoints: generate token, get status, approve/reject operations, abort |
| `src/chat/workspace-relay.ts` | Socket.IO `/workspace` namespace: auth, MCP tool-call relay, disconnect/reconnect, rate limiting |

### Backend (`junction41`) — Modified Files

| File | Change |
|------|--------|
| `src/db/schema.ts` | Add 3 table interfaces + Database registration + type aliases |
| `src/api/server.ts` | Import + register workspaceRoutes, initialize workspace relay |
| `src/notifications/webhook-engine.ts` | Add 4 workspace webhook event types |
| `src/worker/index.ts` | Add 3 worker tasks: expired reconnect tokens, operation archival, stale disconnected sessions |

### Dashboard (`junction41-dashboard`) — New Files

| File | Responsibility |
|------|---------------|
| `src/components/WorkspacePanel.jsx` | Workspace management panel: permission config, token generation, CLI command display, session status, operation counts, supervised-mode approve/reject |

### Dashboard (`junction41-dashboard`) — Modified Files

| File | Change |
|------|--------|
| `src/pages/JobDetailPage.jsx` | Import + render WorkspacePanel when job is `in_progress` and buyer |

---

## Chunk 1: Database Foundation

### Task 1: Migration 012 — workspace tables

**Files:**
- Create: `/home/bigbox/code/junction41/src/db/migrations/012_workspace.ts`

- [ ] **Step 1: Create migration file**

```typescript
import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // ── workspace_sessions ──────────────────────────────────────────
  await db.schema
    .createTable('workspace_sessions')
    .addColumn('id', 'text', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()::text`)
    )
    .addColumn('job_id', 'text', (col) =>
      col.notNull().references('jobs.id')
    )
    .addColumn('buyer_verus_id', 'text', (col) => col.notNull())
    .addColumn('agent_verus_id', 'text', (col) => col.notNull())
    .addColumn('workspace_uid', 'text', (col) => col.notNull().unique())
    .addColumn('reconnect_token', 'text')
    .addColumn('reconnect_expires_at', 'timestamptz')
    .addColumn('permissions', 'jsonb', (col) =>
      col.notNull().defaultTo(sql`'{"read":true,"write":false}'::jsonb`)
    )
    .addColumn('mode', 'text', (col) =>
      col.notNull().defaultTo('supervised')
    )
    .addColumn('status', 'text', (col) =>
      col.notNull().defaultTo('pending')
    )
    .addColumn('directory_hash', 'text')
    .addColumn('excluded_files', 'jsonb')
    .addColumn('exclusion_overrides', 'jsonb')
    .addColumn('connected_at', 'timestamptz')
    .addColumn('disconnected_at', 'timestamptz')
    .addColumn('completed_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`)
    )
    .execute();

  await db.schema
    .createIndex('idx_workspace_sessions_job')
    .on('workspace_sessions')
    .column('job_id')
    .execute();

  await db.schema
    .createIndex('idx_workspace_sessions_status')
    .on('workspace_sessions')
    .column('status')
    .execute();

  // ── workspace_operations ────────────────────────────────────────
  await db.schema
    .createTable('workspace_operations')
    .addColumn('id', 'text', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()::text`)
    )
    .addColumn('session_id', 'text', (col) =>
      col.notNull().references('workspace_sessions.id')
    )
    .addColumn('operation', 'text', (col) => col.notNull())
    .addColumn('path', 'text', (col) => col.notNull())
    .addColumn('content_hash', 'text')
    .addColumn('size_bytes', 'integer')
    .addColumn('sovguard_score', 'numeric')
    .addColumn('approved', 'boolean')
    .addColumn('blocked', 'boolean', (col) =>
      col.notNull().defaultTo(false)
    )
    .addColumn('block_reason', 'text')
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`)
    )
    .execute();

  await db.schema
    .createIndex('idx_workspace_ops_session')
    .on('workspace_operations')
    .column('session_id')
    .execute();

  await db.schema
    .createIndex('idx_workspace_ops_created')
    .on('workspace_operations')
    .column('created_at')
    .execute();

  // ── workspace_attestations ──────────────────────────────────────
  await db.schema
    .createTable('workspace_attestations')
    .addColumn('id', 'text', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()::text`)
    )
    .addColumn('session_id', 'text', (col) =>
      col.notNull().references('workspace_sessions.id').unique()
    )
    .addColumn('job_id', 'text', (col) =>
      col.notNull().references('jobs.id')
    )
    .addColumn('agent_verus_id', 'text', (col) => col.notNull())
    .addColumn('buyer_verus_id', 'text', (col) => col.notNull())
    .addColumn('data', 'jsonb', (col) => col.notNull())
    .addColumn('platform_signature', 'text', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`)
    )
    .execute();

  await db.schema
    .createIndex('idx_workspace_attestations_agent')
    .on('workspace_attestations')
    .column('agent_verus_id')
    .execute();

  await db.schema
    .createIndex('idx_workspace_attestations_job')
    .on('workspace_attestations')
    .column('job_id')
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('workspace_attestations').execute();
  await db.schema.dropTable('workspace_operations').execute();
  await db.schema.dropTable('workspace_sessions').execute();
}
```

- [ ] **Step 2: Run migration to verify**

```bash
cd /home/bigbox/code/junction41 && sudo docker compose up -d --build
```

Then check logs for migration success:

```bash
sudo docker compose logs --tail=50 api 2>&1 | grep -i "migrat"
```

Expected: Migration 012 applied without errors.

- [ ] **Step 3: Verify tables exist**

```bash
sudo docker compose exec j41-postgres psql -U junction41 -d junction41 -c "\dt workspace_*"
```

Expected: Three tables listed: workspace_sessions, workspace_operations, workspace_attestations.

- [ ] **Step 4: Commit**

```bash
git add src/db/migrations/012_workspace.ts
git commit -m "feat(workspace): migration 012 — workspace_sessions, workspace_operations, workspace_attestations tables"
```

---

### Task 2: Schema types

**Files:**
- Modify: `/home/bigbox/code/junction41/src/db/schema.ts`

- [ ] **Step 1: Add WorkspaceSessionTable interface**

After the `BountyApplicationTable` interface (after line 630), add:

```typescript
// ─── workspace_sessions ─────────────────────────────────────────────────────

export interface WorkspaceSessionTable {
  id: Generated<string>;
  job_id: string;
  buyer_verus_id: string;
  agent_verus_id: string;
  workspace_uid: string;
  reconnect_token: string | null;
  reconnect_expires_at: string | null;
  permissions: Generated<string>;
  mode: Generated<string>;
  status: Generated<string>;
  directory_hash: string | null;
  excluded_files: string | null;
  exclusion_overrides: string | null;
  connected_at: string | null;
  disconnected_at: string | null;
  completed_at: string | null;
  created_at: Generated<string>;
}
```

- [ ] **Step 2: Add WorkspaceOperationTable interface**

Immediately after WorkspaceSessionTable:

```typescript
// ─── workspace_operations ───────────────────────────────────────────────────

export interface WorkspaceOperationTable {
  id: Generated<string>;
  session_id: string;
  operation: string;
  path: string;
  content_hash: string | null;
  size_bytes: number | null;
  sovguard_score: number | null;
  approved: boolean | null;
  blocked: Generated<boolean>;
  block_reason: string | null;
  created_at: Generated<string>;
}
```

- [ ] **Step 3: Add WorkspaceAttestationTable interface**

Immediately after WorkspaceOperationTable:

```typescript
// ─── workspace_attestations ─────────────────────────────────────────────────

export interface WorkspaceAttestationTable {
  id: Generated<string>;
  session_id: string;
  job_id: string;
  agent_verus_id: string;
  buyer_verus_id: string;
  data: string;
  platform_signature: string;
  created_at: Generated<string>;
}
```

- [ ] **Step 4: Register tables in Database interface**

In the `Database` interface (after `bounty_applications: BountyApplicationTable;` on line 673), add:

```typescript
  workspace_sessions: WorkspaceSessionTable;
  workspace_operations: WorkspaceOperationTable;
  workspace_attestations: WorkspaceAttestationTable;
```

- [ ] **Step 5: Add type aliases**

After `export type BountyApplication = Selectable<BountyApplicationTable>;` (line 721), add:

```typescript
export type WorkspaceSession = Selectable<WorkspaceSessionTable>;
export type WorkspaceOperation = Selectable<WorkspaceOperationTable>;
export type WorkspaceAttestation = Selectable<WorkspaceAttestationTable>;
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
cd /home/bigbox/code/junction41 && sudo docker compose up -d --build
```

Check logs for compilation errors:

```bash
sudo docker compose logs --tail=30 api 2>&1 | grep -i "error"
```

Expected: No TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add src/db/schema.ts
git commit -m "feat(workspace): add WorkspaceSession, WorkspaceOperation, WorkspaceAttestation schema types"
```

---

### Task 3: Workspace queries

**Files:**
- Create: `/home/bigbox/code/junction41/src/db/workspace-queries.ts`

- [ ] **Step 1: Create workspace-queries.ts with session management functions**

```typescript
/**
 * Workspace Queries
 *
 * Database operations for workspace sessions, operations audit trail,
 * and attestations. Used by REST routes, WebSocket relay, and worker.
 */

import { getDb } from './index.js';
import { sql, type SqlBool } from 'kysely';
import { randomBytes } from 'crypto';
import { logger } from '../utils/logger.js';
import type { WorkspaceSessionTable } from './schema.js';

// ── Session Management ──────────────────────────────────────────

export async function createSession(
  jobId: string,
  buyerVerusId: string,
  agentVerusId: string,
  permissions: { read: boolean; write: boolean },
  mode: 'supervised' | 'standard',
): Promise<{ id: string; workspaceUid: string }> {
  const db = getDb();
  const workspaceUid = randomBytes(16).toString('hex'); // 128-bit
  const result = await db
    .insertInto('workspace_sessions')
    .values({
      id: sql`gen_random_uuid()::text`,
      job_id: jobId,
      buyer_verus_id: buyerVerusId,
      agent_verus_id: agentVerusId,
      workspace_uid: workspaceUid,
      permissions: JSON.stringify(permissions),
      mode,
      status: 'pending',
      created_at: sql`NOW()`,
    })
    .returning(['id', 'workspace_uid'])
    .executeTakeFirstOrThrow();
  return { id: result.id, workspaceUid: result.workspace_uid };
}

export async function getSessionByJobId(jobId: string) {
  const db = getDb();
  return db
    .selectFrom('workspace_sessions')
    .selectAll()
    .where('job_id', '=', jobId)
    .where('status', 'in', ['pending', 'active', 'paused', 'disconnected'])
    .orderBy('created_at', 'desc')
    .executeTakeFirst();
}

export async function getSessionByUid(uid: string) {
  const db = getDb();
  return db
    .selectFrom('workspace_sessions')
    .selectAll()
    .where('workspace_uid', '=', uid)
    .executeTakeFirst();
}

export async function getSessionById(id: string) {
  const db = getDb();
  return db
    .selectFrom('workspace_sessions')
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirst();
}

// Typed subset of columns that routes/relay may update alongside status
type SessionStatusExtras = Partial<Pick<WorkspaceSessionTable,
  'connected_at' | 'disconnected_at' | 'completed_at' | 'directory_hash' |
  'excluded_files' | 'exclusion_overrides'
>>;

export async function updateSessionStatus(
  sessionId: string,
  status: string,
  extras?: SessionStatusExtras,
) {
  const db = getDb();
  await db
    .updateTable('workspace_sessions')
    .set({ status, ...extras })
    .where('id', '=', sessionId)
    .execute();
}

export async function getSessionByJobIdAndAgent(jobId: string, agentVerusId: string) {
  const db = getDb();
  return db
    .selectFrom('workspace_sessions')
    .selectAll()
    .where('job_id', '=', jobId)
    .where('agent_verus_id', '=', agentVerusId)
    .where('status', 'in', ['pending', 'active', 'paused', 'disconnected'])
    .orderBy('created_at', 'desc')
    .executeTakeFirst();
}

export async function setReconnectToken(sessionId: string): Promise<string> {
  const db = getDb();
  const token = randomBytes(32).toString('hex');
  await db
    .updateTable('workspace_sessions')
    .set({
      reconnect_token: token,
      reconnect_expires_at: sql`NOW() + interval '5 minutes'`,
      status: 'disconnected',
      disconnected_at: sql`NOW()`,
    })
    .where('id', '=', sessionId)
    .execute();
  return token;
}

export async function getSessionByReconnectToken(token: string) {
  const db = getDb();
  return db
    .selectFrom('workspace_sessions')
    .selectAll()
    .where('reconnect_token', '=', token)
    .where('status', '=', 'disconnected')
    .where(sql<SqlBool>`reconnect_expires_at > NOW()`)
    .executeTakeFirst();
}

export async function clearReconnectToken(sessionId: string) {
  const db = getDb();
  await db
    .updateTable('workspace_sessions')
    .set({
      reconnect_token: null,
      reconnect_expires_at: null,
    })
    .where('id', '=', sessionId)
    .execute();
}

// ── Operation Logging ───────────────────────────────────────────

export async function logOperation(
  sessionId: string,
  operation: string,
  path: string,
  metadata: {
    contentHash?: string;
    sizeBytes?: number;
    sovguardScore?: number;
    approved?: boolean;
    blocked?: boolean;
    blockReason?: string;
  },
): Promise<string> {
  const db = getDb();
  const result = await db
    .insertInto('workspace_operations')
    .values({
      id: sql`gen_random_uuid()::text`,
      session_id: sessionId,
      operation,
      path,
      content_hash: metadata.contentHash ?? null,
      size_bytes: metadata.sizeBytes ?? null,
      sovguard_score: metadata.sovguardScore ?? null,
      approved: metadata.approved ?? null,
      blocked: metadata.blocked ?? false,
      block_reason: metadata.blockReason ?? null,
      created_at: sql`NOW()`,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  return result.id;
}

export async function getOperationCounts(sessionId: string) {
  const db = getDb();
  const result = await sql<{
    reads: number;
    writes: number;
    list_dirs: number;
    blocked: number;
  }>`
    SELECT
      COUNT(*) FILTER (WHERE operation = 'read')::int AS reads,
      COUNT(*) FILTER (WHERE operation = 'write')::int AS writes,
      COUNT(*) FILTER (WHERE operation = 'list_dir')::int AS list_dirs,
      COUNT(*) FILTER (WHERE blocked = true)::int AS blocked
    FROM workspace_operations
    WHERE session_id = ${sessionId}
  `.execute(db);
  return result.rows[0] || { reads: 0, writes: 0, list_dirs: 0, blocked: 0 };
}

export async function getPendingApprovals(sessionId: string) {
  const db = getDb();
  return db
    .selectFrom('workspace_operations')
    .selectAll()
    .where('session_id', '=', sessionId)
    .where('approved', 'is', null)
    .where('blocked', '=', false)
    .where('operation', '=', 'write')
    .orderBy('created_at', 'asc')
    .execute();
}

export async function getOperationById(operationId: string) {
  const db = getDb();
  return db
    .selectFrom('workspace_operations')
    .selectAll()
    .where('id', '=', operationId)
    .executeTakeFirst();
}

export async function updateOperationApproval(
  operationId: string,
  approved: boolean,
) {
  const db = getDb();
  await db
    .updateTable('workspace_operations')
    .set({ approved })
    .where('id', '=', operationId)
    .execute();
}

// ── Attestation ─────────────────────────────────────────────────

export async function createAttestation(
  sessionId: string,
  jobId: string,
  agentVerusId: string,
  buyerVerusId: string,
  data: Record<string, any>,
  platformSignature: string,
): Promise<string> {
  const db = getDb();
  const result = await db
    .insertInto('workspace_attestations')
    .values({
      id: sql`gen_random_uuid()::text`,
      session_id: sessionId,
      job_id: jobId,
      agent_verus_id: agentVerusId,
      buyer_verus_id: buyerVerusId,
      data: JSON.stringify(data),
      platform_signature: platformSignature,
      created_at: sql`NOW()`,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  return result.id;
}

export async function getAttestationsByAgent(agentVerusId: string) {
  const db = getDb();
  return db
    .selectFrom('workspace_attestations')
    .selectAll()
    .where('agent_verus_id', '=', agentVerusId)
    .orderBy('created_at', 'desc')
    .execute();
}

export async function getAttestationBySession(sessionId: string) {
  const db = getDb();
  return db
    .selectFrom('workspace_attestations')
    .selectAll()
    .where('session_id', '=', sessionId)
    .executeTakeFirst();
}

// ── Worker Queries ──────────────────────────────────────────────

export async function getExpiredReconnectTokens() {
  const db = getDb();
  return db
    .selectFrom('workspace_sessions')
    .selectAll()
    .where('status', '=', 'disconnected')
    .where('reconnect_token', 'is not', null)
    .where(sql<SqlBool>`reconnect_expires_at < NOW()`)
    .execute();
}

export async function archiveOldOperations(days: number = 90) {
  const db = getDb();
  const safeDays = Math.max(1, Math.min(365, Math.floor(days)));
  const interval = `${safeDays} days`;
  // Preserve operations for disputed jobs
  const result = await sql`
    DELETE FROM workspace_operations
    WHERE created_at < NOW() - CAST(${interval} AS INTERVAL)
      AND session_id NOT IN (
        SELECT ws.id FROM workspace_sessions ws
        JOIN jobs j ON ws.job_id = j.id
        WHERE j.status = 'disputed'
      )
  `.execute(db);
  const count = Number(result.numAffectedRows ?? 0);
  if (count > 0) {
    logger.info({ count, olderThanDays: safeDays }, 'Archived old workspace operations');
  }
  return count;
}

export async function getDisconnectedSessions(gracePeriodMinutes: number = 5) {
  const db = getDb();
  const interval = `${gracePeriodMinutes} minutes`;
  return db
    .selectFrom('workspace_sessions')
    .selectAll()
    .where('status', '=', 'disconnected')
    .where(sql<SqlBool>`disconnected_at < NOW() - CAST(${interval} AS INTERVAL)`)
    .execute();
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /home/bigbox/code/junction41 && sudo docker compose up -d --build
```

Expected: No TypeScript errors. The queries import `getDb` from `./index.js` which already exists.

- [ ] **Step 3: Commit**

```bash
git add src/db/workspace-queries.ts
git commit -m "feat(workspace): workspace-queries.ts — session, operation, attestation, and worker query functions"
```

---

## Chunk 2: REST API + Server Integration

### Task 4: Workspace REST routes

**Files:**
- Create: `/home/bigbox/code/junction41/src/api/routes/workspace.ts`

This file provides REST endpoints for the dashboard to manage workspace sessions. The WebSocket relay (Chunk 3) handles real-time MCP tool routing separately.

- [ ] **Step 1: Create workspace.ts route file**

```typescript
/**
 * Workspace REST Routes
 *
 * Dashboard-facing endpoints for workspace session management.
 * Real-time MCP relay is handled by workspace-relay.ts (Socket.IO).
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getDb } from '../../db/index.js';
import { sql } from 'kysely';
import { getSessionFromRequest } from './auth.js';
import {
  createSession,
  getSessionByJobId,
  getSessionById,
  getOperationCounts,
  getPendingApprovals,
  getOperationById,
  updateOperationApproval,
  updateSessionStatus,
  getAttestationBySession,
} from '../../db/workspace-queries.js';
import { emitWebhookEvent } from '../../notifications/webhook-engine.js';
import { emitPlatformEvent } from '../../db/platform-event-queries.js';
import { logger } from '../../utils/logger.js';

async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return reply.code(401).send({
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
  }
  (request as any).session = session;
}

export async function workspaceRoutes(fastify: FastifyInstance): Promise<void> {

  // ── POST /v1/workspace/:jobId/token ─────────────────────────────
  // Generate workspace token. Buyer only. Job must be in_progress.
  fastify.post('/v1/workspace/:jobId/token', {
    preHandler: requireAuth,
    config: { rateLimit: { max: 10, timeWindow: 60_000 } },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const session = (request as any).session;
    const { jobId } = request.params as { jobId: string };
    const body = request.body as {
      mode?: 'supervised' | 'standard';
      permissions?: { read?: boolean; write?: boolean };
    } | null;

    // Fetch job
    const db = getDb();
    const job = await db
      .selectFrom('jobs')
      .select(['id', 'buyer_verus_id', 'seller_verus_id', 'status'])
      .where('id', '=', jobId)
      .executeTakeFirst();

    if (!job) {
      return reply.code(404).send({
        error: { code: 'NOT_FOUND', message: 'Job not found' },
      });
    }

    // Must be buyer
    if (job.buyer_verus_id !== session.verusId) {
      return reply.code(403).send({
        error: { code: 'FORBIDDEN', message: 'Only the buyer can generate a workspace token' },
      });
    }

    // Job must be in_progress (prepay gate)
    if (job.status !== 'in_progress') {
      return reply.code(400).send({
        error: { code: 'INVALID_STATUS', message: 'Workspace requires job to be in_progress (payment verified)' },
      });
    }

    // Trust floor: agent must not be tier 'new'
    const agentMetrics = await db
      .selectFrom('agent_metrics')
      .select(['trust_tier'])
      .where('agent_verus_id', '=', job.seller_verus_id)
      .executeTakeFirst();

    if (!agentMetrics || agentMetrics.trust_tier === 'new') {
      return reply.code(403).send({
        error: { code: 'TRUST_FLOOR', message: 'Agent trust tier too low for workspace access' },
      });
    }

    // Check for existing active session
    const existing = await getSessionByJobId(jobId);
    if (existing) {
      return reply.code(409).send({
        error: { code: 'SESSION_EXISTS', message: 'An active workspace session already exists for this job' },
      });
    }

    // Normalize inputs
    const mode = body?.mode === 'standard' ? 'standard' : 'supervised';
    const permissions = {
      read: true, // always on
      write: body?.permissions?.write !== false, // default true
    };

    // Create session
    const { id, workspaceUid } = await createSession(
      jobId,
      session.verusId,
      job.seller_verus_id,
      permissions,
      mode,
    );

    // Build CLI command
    const flags = ['--read'];
    if (permissions.write) flags.push('--write');
    flags.push(`--${mode}`);
    const command = `j41-workspace ./my-project --uid ${workspaceUid} ${flags.join(' ')}`;

    // Emit webhook to agent's dispatcher
    emitWebhookEvent({
      type: 'workspace.ready' as any,
      agentVerusId: job.seller_verus_id,
      jobId,
      data: { jobId, sessionId: id, permissions, mode },
    });

    emitPlatformEvent({
      type: 'workspace_created',
      agent_name: null,
      agent_verus_id: session.verusId,
      detail: `workspace token generated for job ${jobId.slice(0, 8)}`,
    });

    return reply.code(201).send({
      data: {
        sessionId: id,
        workspaceUid,
        command,
        installCommand: 'yarn global add @j41/workspace',
        mode,
        permissions,
      },
    });
  });

  // ── GET /v1/workspace/:jobId ────────────────────────────────────
  // Get workspace session status. Buyer or seller.
  fastify.get('/v1/workspace/:jobId', {
    preHandler: requireAuth,
    config: { rateLimit: { max: 30, timeWindow: 60_000 } },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const session = (request as any).session;
    const { jobId } = request.params as { jobId: string };

    // Verify user is buyer or seller
    const db = getDb();
    const job = await db
      .selectFrom('jobs')
      .select(['buyer_verus_id', 'seller_verus_id'])
      .where('id', '=', jobId)
      .executeTakeFirst();

    if (!job) {
      return reply.code(404).send({
        error: { code: 'NOT_FOUND', message: 'Job not found' },
      });
    }

    const isBuyer = job.buyer_verus_id === session.verusId;
    const isSeller = job.seller_verus_id === session.verusId;
    if (!isBuyer && !isSeller) {
      return reply.code(403).send({
        error: { code: 'FORBIDDEN', message: 'Access denied' },
      });
    }

    const wsSession = await getSessionByJobId(jobId);
    if (!wsSession) {
      return reply.send({ data: null });
    }

    const counts = await getOperationCounts(wsSession.id);
    const pending = isBuyer ? await getPendingApprovals(wsSession.id) : [];
    const attestation = wsSession.status === 'completed'
      ? await getAttestationBySession(wsSession.id)
      : null;

    return reply.send({
      data: {
        id: wsSession.id,
        status: wsSession.status,
        mode: wsSession.mode,
        permissions: JSON.parse(wsSession.permissions),
        connectedAt: wsSession.connected_at,
        disconnectedAt: wsSession.disconnected_at,
        completedAt: wsSession.completed_at,
        createdAt: wsSession.created_at,
        counts,
        pendingApprovals: pending.map((op) => ({
          id: op.id,
          operation: op.operation,
          path: op.path,
          sizeBytes: op.size_bytes,
          createdAt: op.created_at,
        })),
        attestation: attestation ? {
          id: attestation.id,
          data: JSON.parse(attestation.data),
          platformSignature: attestation.platform_signature,
        } : null,
      },
    });
  });

  // ── POST /v1/workspace/:jobId/approve/:operationId ──────────────
  // Approve a pending write operation. Buyer only. Supervised mode.
  fastify.post('/v1/workspace/:jobId/approve/:operationId', {
    preHandler: requireAuth,
    config: { rateLimit: { max: 30, timeWindow: 60_000 } },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const session = (request as any).session;
    const { jobId, operationId } = request.params as { jobId: string; operationId: string };

    // Verify buyer
    const db = getDb();
    const job = await db
      .selectFrom('jobs')
      .select(['buyer_verus_id'])
      .where('id', '=', jobId)
      .executeTakeFirst();

    if (!job || job.buyer_verus_id !== session.verusId) {
      return reply.code(403).send({
        error: { code: 'FORBIDDEN', message: 'Only the buyer can approve operations' },
      });
    }

    // Verify operation belongs to this job's session
    const wsSession = await getSessionByJobId(jobId);
    if (!wsSession || wsSession.status !== 'active') {
      return reply.code(400).send({
        error: { code: 'NO_ACTIVE_SESSION', message: 'No active workspace session' },
      });
    }

    const operation = await getOperationById(operationId);
    if (!operation || operation.session_id !== wsSession.id) {
      return reply.code(404).send({
        error: { code: 'NOT_FOUND', message: 'Operation not found in this session' },
      });
    }

    if (operation.approved !== null) {
      return reply.code(409).send({
        error: { code: 'ALREADY_DECIDED', message: 'Operation already approved or rejected' },
      });
    }

    await updateOperationApproval(operationId, true);

    return reply.send({ data: { approved: true } });
  });

  // ── POST /v1/workspace/:jobId/reject/:operationId ───────────────
  // Reject a pending write operation. Buyer only. Supervised mode.
  fastify.post('/v1/workspace/:jobId/reject/:operationId', {
    preHandler: requireAuth,
    config: { rateLimit: { max: 30, timeWindow: 60_000 } },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const session = (request as any).session;
    const { jobId, operationId } = request.params as { jobId: string; operationId: string };

    const db = getDb();
    const job = await db
      .selectFrom('jobs')
      .select(['buyer_verus_id'])
      .where('id', '=', jobId)
      .executeTakeFirst();

    if (!job || job.buyer_verus_id !== session.verusId) {
      return reply.code(403).send({
        error: { code: 'FORBIDDEN', message: 'Only the buyer can reject operations' },
      });
    }

    const wsSession = await getSessionByJobId(jobId);
    if (!wsSession || wsSession.status !== 'active') {
      return reply.code(400).send({
        error: { code: 'NO_ACTIVE_SESSION', message: 'No active workspace session' },
      });
    }

    const operation = await getOperationById(operationId);
    if (!operation || operation.session_id !== wsSession.id) {
      return reply.code(404).send({
        error: { code: 'NOT_FOUND', message: 'Operation not found in this session' },
      });
    }

    if (operation.approved !== null) {
      return reply.code(409).send({
        error: { code: 'ALREADY_DECIDED', message: 'Operation already approved or rejected' },
      });
    }

    await updateOperationApproval(operationId, false);

    return reply.send({ data: { approved: false } });
  });

  // ── POST /v1/workspace/:jobId/abort ─────────────────────────────
  // Abort workspace. Buyer only. Immediate disconnect, no grace period.
  fastify.post('/v1/workspace/:jobId/abort', {
    preHandler: requireAuth,
    config: { rateLimit: { max: 5, timeWindow: 60_000 } },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const session = (request as any).session;
    const { jobId } = request.params as { jobId: string };

    const db = getDb();
    const job = await db
      .selectFrom('jobs')
      .select(['buyer_verus_id', 'seller_verus_id'])
      .where('id', '=', jobId)
      .executeTakeFirst();

    if (!job || job.buyer_verus_id !== session.verusId) {
      return reply.code(403).send({
        error: { code: 'FORBIDDEN', message: 'Only the buyer can abort the workspace' },
      });
    }

    const wsSession = await getSessionByJobId(jobId);
    if (!wsSession) {
      return reply.code(400).send({
        error: { code: 'NO_SESSION', message: 'No active workspace session' },
      });
    }

    // Note: Task 6 adds markSessionAborted() helper. After Task 6,
    // replace this with: await markSessionAborted(wsSession.id);
    await updateSessionStatus(wsSession.id, 'aborted');

    // Notify agent
    emitWebhookEvent({
      type: 'workspace.disconnected' as any,
      agentVerusId: job.seller_verus_id,
      jobId,
      data: { jobId, sessionId: wsSession.id, reason: 'buyer_aborted' },
    });

    return reply.send({ data: { aborted: true } });
  });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /home/bigbox/code/junction41 && sudo docker compose up -d --build
```

Check for errors:
```bash
sudo docker compose logs --tail=30 api 2>&1 | grep -i "error"
```

Expected: No TypeScript errors. Note: the route is NOT yet registered in server.ts (that's Step 4).

- [ ] **Step 3: Commit**

```bash
git add src/api/routes/workspace.ts
git commit -m "feat(workspace): REST routes — token generation, status, approve/reject, abort"
```

---

### Task 5: Server registration + webhook event types

**Files:**
- Modify: `/home/bigbox/code/junction41/src/api/server.ts`
- Modify: `/home/bigbox/code/junction41/src/notifications/webhook-engine.ts`

- [ ] **Step 1: Add import to server.ts**

After line 40 (`import { bountyRoutes } from './routes/bounties.js';`), add:

```typescript
import { workspaceRoutes } from './routes/workspace.js';
```

- [ ] **Step 2: Register workspace routes in server.ts**

After line 228 (`await fastify.register(bountyRoutes);`), add:

```typescript
  await fastify.register(workspaceRoutes);
```

- [ ] **Step 3: Add workspace webhook event types**

In `/home/bigbox/code/junction41/src/notifications/webhook-engine.ts`, add 4 workspace event types to the `WebhookEventType` union. After `'bounty.expired'` (line 41), add:

```typescript
  | 'workspace.ready'
  | 'workspace.connected'
  | 'workspace.disconnected'
  | 'workspace.completed';
```

- [ ] **Step 4: Verify full build succeeds**

```bash
cd /home/bigbox/code/junction41 && sudo docker compose up -d --build
```

Test the token endpoint (should fail with 401 since no session):
```bash
curl -s http://localhost:3001/v1/workspace/test-job-id/token -X POST -H "Content-Type: application/json" | jq .
```

Expected: `{"error":{"code":"UNAUTHORIZED","message":"Authentication required"}}`

Test the status endpoint:
```bash
curl -s http://localhost:3001/v1/workspace/test-job-id -H "Content-Type: application/json" | jq .
```

Expected: Same 401 response (auth required).

- [ ] **Step 5: Commit**

```bash
git add src/api/server.ts src/notifications/webhook-engine.ts
git commit -m "feat(workspace): register workspace routes + add 4 workspace webhook event types"
```

---

## Chunk 3: WebSocket Relay

### Task 6: State transition helpers + agent connect-token endpoint

**Files:**
- Modify: `/home/bigbox/code/junction41/src/db/workspace-queries.ts`
- Modify: `/home/bigbox/code/junction41/src/api/routes/workspace.ts`

The relay needs to set timestamps (`connected_at`, `completed_at`) using `sql\`NOW()\`` which doesn't type-check through `SessionStatusExtras`. Add dedicated transition helpers that handle timestamps internally.

- [ ] **Step 1: Add state transition helpers to workspace-queries.ts**

After the `clearReconnectToken` function, add:

```typescript
// ── State Transition Helpers ────────────────────────────────────
// These encapsulate sql`NOW()` calls so the relay doesn't import Kysely directly.

export async function markSessionConnected(sessionId: string) {
  const db = getDb();
  await db.updateTable('workspace_sessions')
    .set({ status: 'active', connected_at: sql`NOW()` })
    .where('id', '=', sessionId)
    .execute();
}

export async function markSessionAborted(sessionId: string) {
  const db = getDb();
  await db.updateTable('workspace_sessions')
    .set({ status: 'aborted', completed_at: sql`NOW()` })
    .where('id', '=', sessionId)
    .execute();
}

export async function markSessionCompleted(sessionId: string) {
  const db = getDb();
  await db.updateTable('workspace_sessions')
    .set({ status: 'completed', completed_at: sql`NOW()` })
    .where('id', '=', sessionId)
    .execute();
}
```

- [ ] **Step 2: Add agent connect-token endpoint to workspace.ts**

At the end of the `workspaceRoutes` function (before the closing `}`), add:

```typescript
  // ── GET /v1/workspace/:jobId/connect-token ──────────────────────
  // Agent requests a one-time token to connect via WebSocket.
  // The token is also included in the workspace.ready webhook payload.
  fastify.get('/v1/workspace/:jobId/connect-token', {
    preHandler: requireAuth,
    config: { rateLimit: { max: 10, timeWindow: 60_000 } },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const session = (request as any).session;
    const { jobId } = request.params as { jobId: string };

    // Verify agent is the seller
    const db = getDb();
    const job = await db
      .selectFrom('jobs')
      .select(['seller_verus_id'])
      .where('id', '=', jobId)
      .executeTakeFirst();

    if (!job || job.seller_verus_id !== session.verusId) {
      return reply.code(403).send({
        error: { code: 'FORBIDDEN', message: 'Only the assigned agent can get a connect token' },
      });
    }

    const wsSession = await getSessionByJobId(jobId);
    if (!wsSession) {
      return reply.code(404).send({
        error: { code: 'NO_SESSION', message: 'No workspace session for this job' },
      });
    }

    // Import dynamically to avoid circular dependency
    const { generateAgentConnectToken } = await import('../../chat/workspace-relay.js');
    const token = generateAgentConnectToken(wsSession.id, session.verusId);

    return reply.send({
      data: {
        token,
        wsUrl: `${process.env.CORS_ORIGIN || 'http://localhost:3000'}/ws`,
        namespace: '/workspace',
      },
    });
  });
```

- [ ] **Step 3: Update the token generation endpoint to include agent connect token in webhook**

In the `POST /v1/workspace/:jobId/token` handler, update the `emitWebhookEvent` call. Find this block in workspace.ts:

```typescript
    emitWebhookEvent({
      type: 'workspace.ready' as any,
      agentVerusId: job.seller_verus_id,
      jobId,
      data: { jobId, sessionId: id, permissions, mode },
    });
```

Replace with:

```typescript
    // Generate connect token for agent's dispatcher
    let agentConnectToken: string | undefined;
    try {
      const { generateAgentConnectToken } = await import('../../chat/workspace-relay.js');
      agentConnectToken = generateAgentConnectToken(id, job.seller_verus_id);
    } catch {
      // Relay not yet initialized — agent can use GET /connect-token fallback
    }

    emitWebhookEvent({
      type: 'workspace.ready' as any,
      agentVerusId: job.seller_verus_id,
      jobId,
      data: { jobId, sessionId: id, permissions, mode, connectToken: agentConnectToken },
    });
```

- [ ] **Step 4: Commit**

```bash
git add src/db/workspace-queries.ts src/api/routes/workspace.ts
git commit -m "feat(workspace): state transition helpers + agent connect-token endpoint"
```

---

### Task 7: Workspace relay

**Files:**
- Create: `/home/bigbox/code/junction41/src/chat/workspace-relay.ts`
- Modify: `/home/bigbox/code/junction41/src/api/server.ts`

The workspace relay creates a Socket.IO namespace (`/workspace`) on the existing server. It relays MCP tool calls between buyer CLI and agent dispatcher, logging operation metadata to the database.

**Key design decisions:**
- The relay forwards MCP messages (including file contents) as opaque data — it does NOT parse MCP protocol
- The buyer CLI sends operation metadata alongside results (path, hash, SovGuard score) — the relay logs these
- The relay NEVER stores file contents in the database — only metadata
- Rate limiting: 10 ops/second, 300/minute per workspace session
- Disconnection: 5-minute grace period with reconnect token
- Buyer CLI auth: workspace UID (128-bit crypto random)
- Agent auth: one-time connect token (from webhook or REST endpoint)

- [ ] **Step 1: Create workspace-relay.ts**

```typescript
/**
 * Workspace Relay (Socket.IO)
 *
 * Relays MCP tool calls between buyer CLI and agent dispatcher.
 * Logs operation metadata (paths, hashes, SovGuard scores) — never file contents.
 * Handles auth, rate limiting, disconnection/reconnection.
 *
 * Namespace: /workspace
 * Buyer auth: workspace UID
 * Agent auth: one-time connect token
 */

import { Server as SocketIOServer, Socket } from 'socket.io';
import { randomBytes } from 'crypto';
import {
  getSessionByUid,
  getSessionById,
  markSessionConnected,
  markSessionAborted,
  markSessionCompleted,
  setReconnectToken,
  getSessionByReconnectToken,
  clearReconnectToken,
  updateSessionStatus,
  logOperation,
  getOperationCounts,
} from '../db/workspace-queries.js';
import { emitWebhookEvent } from '../notifications/webhook-engine.js';
import { logger } from '../utils/logger.js';

// ── Types ───────────────────────────────────────────────────────

interface WorkspaceSocket extends Socket {
  wsRole: 'buyer' | 'agent';
  wsSessionId: string;
  wsJobId: string;
  wsVerusId: string;
}

interface McpCallPayload {
  id: string;
  tool: string;
  params: Record<string, any>;
}

interface McpResultPayload {
  id: string;
  success: boolean;
  result?: any;
  error?: string;
  metadata: {
    operation: string;
    path: string;
    sizeBytes?: number;
    contentHash?: string;
    sovguardScore?: number;
    approved?: boolean;
    blocked?: boolean;
    blockReason?: string;
  };
}

// ── In-Memory Stores ────────────────────────────────────────────

// One-time connect tokens for agent auth
const agentConnectTokens = new Map<string, {
  sessionId: string;
  agentVerusId: string;
  expiresAt: number;
}>();

// UID attempt tracking — keyed by IP address per spec (5 fails per IP = 15 min lockout)
const uidAttempts = new Map<string, {
  count: number;
  lockedUntil: number;
}>();

// Per-session operation rate limiter
const sessionRates = new Map<string, {
  perSecond: { count: number; start: number };
  perMinute: { count: number; start: number };
}>();

// Reference to main Socket.IO for dashboard notifications
let mainIo: SocketIOServer | null = null;

// ── Public API ──────────────────────────────────────────────────

export function generateAgentConnectToken(sessionId: string, agentVerusId: string): string {
  // Clean up expired tokens periodically (every 100 calls)
  if (agentConnectTokens.size > 100) {
    const now = Date.now();
    for (const [k, v] of agentConnectTokens) {
      if (v.expiresAt < now) agentConnectTokens.delete(k);
    }
  }

  const token = randomBytes(32).toString('hex');
  agentConnectTokens.set(token, {
    sessionId,
    agentVerusId,
    expiresAt: Date.now() + 30 * 60 * 1000, // 30 min
  });
  return token;
}

export function initWorkspaceRelay(io: SocketIOServer): void {
  mainIo = io;
  const ns = io.of('/workspace');

  ns.on('connection', async (rawSocket: Socket) => {
    const socket = rawSocket as WorkspaceSocket;

    try {
      const auth = socket.handshake.auth || {};

      if (auth.type === 'buyer') {
        await handleBuyerConnect(socket, auth.uid, auth.reconnectToken, ns);
      } else if (auth.type === 'agent') {
        await handleAgentConnect(socket, auth.token, ns);
      } else {
        socket.emit('ws:error', { code: 'INVALID_TYPE', message: 'auth.type must be buyer or agent' });
        socket.disconnect(true);
      }
    } catch (err) {
      logger.error({ err }, 'Workspace relay connection error');
      socket.disconnect(true);
    }
  });

  logger.info('Workspace relay initialized on /workspace namespace');
}

// ── Connection Handlers ─────────────────────────────────────────

async function handleBuyerConnect(
  socket: WorkspaceSocket,
  uid: string | undefined,
  reconnectToken: string | undefined,
  ns: SocketIOServer['_nsps'] extends Map<string, infer V> ? V : any,
) {
  let session;

  if (reconnectToken) {
    // Reconnection flow
    session = await getSessionByReconnectToken(reconnectToken);
    if (!session) {
      socket.emit('ws:error', { code: 'INVALID_TOKEN', message: 'Invalid or expired reconnect token' });
      socket.disconnect(true);
      return;
    }
    await clearReconnectToken(session.id);
    logger.info({ sessionId: session.id }, 'Buyer reconnected via token');
  } else if (uid) {
    // Rate limit UID attempts by IP (spec: 5 failed per IP = 15 min lockout)
    const ip = socket.handshake.address;
    const rateCheck = checkUidRate(ip);
    if (!rateCheck.allowed) {
      socket.emit('ws:error', { code: 'LOCKED', message: 'Too many failed attempts, locked for 15 minutes' });
      socket.disconnect(true);
      return;
    }

    session = await getSessionByUid(uid);
    if (!session) {
      socket.emit('ws:error', { code: 'INVALID_UID', message: 'Invalid workspace UID' });
      socket.disconnect(true);
      return;
    }

    // Clear attempt counter on successful UID
    uidAttempts.delete(ip);

    // UID only valid for initial connection (pending). Reconnection requires fresh token.
    if (session.status !== 'pending') {
      socket.emit('ws:error', { code: 'INVALID_STATUS', message: `Session is ${session.status}. Use --resume <token> to reconnect.` });
      socket.disconnect(true);
      return;
    }

    // Verify underlying job is still in_progress (spec: workspace only active when job in_progress)
    const db = (await import('../db/index.js')).getDb();
    const job = await db.selectFrom('jobs').select(['status']).where('id', '=', session.job_id).executeTakeFirst();
    if (!job || job.status !== 'in_progress') {
      socket.emit('ws:error', { code: 'JOB_NOT_ACTIVE', message: 'Job is no longer in progress' });
      socket.disconnect(true);
      return;
    }
  } else {
    socket.emit('ws:error', { code: 'MISSING_AUTH', message: 'uid or reconnectToken required' });
    socket.disconnect(true);
    return;
  }

  // Populate socket
  socket.wsRole = 'buyer';
  socket.wsSessionId = session.id;
  socket.wsJobId = session.job_id;
  socket.wsVerusId = session.buyer_verus_id;
  socket.join(`ws:${session.id}`);

  // Mark connected
  await markSessionConnected(session.id);
  ns.to(`ws:${session.id}`).emit('workspace:status_changed', { status: 'active' });
  emitDashboardUpdate(session.job_id, session.id, 'active');

  emitWebhookEvent({
    type: 'workspace.connected' as any,
    agentVerusId: session.agent_verus_id,
    jobId: session.job_id,
    data: { jobId: session.job_id, sessionId: session.id, side: 'buyer' },
  });

  // Register handlers
  registerBuyerHandlers(socket, session, ns);
  logger.info({ sessionId: session.id, jobId: session.job_id }, 'Buyer connected to workspace');
}

async function handleAgentConnect(
  socket: WorkspaceSocket,
  token: string | undefined,
  ns: any,
) {
  if (!token) {
    socket.emit('ws:error', { code: 'MISSING_TOKEN', message: 'auth.token required' });
    socket.disconnect(true);
    return;
  }

  const tokenData = agentConnectTokens.get(token);
  if (!tokenData || tokenData.expiresAt < Date.now()) {
    agentConnectTokens.delete(token);
    socket.emit('ws:error', { code: 'INVALID_TOKEN', message: 'Invalid or expired connect token' });
    socket.disconnect(true);
    return;
  }

  // One-time use
  agentConnectTokens.delete(token);

  const session = await getSessionById(tokenData.sessionId);
  if (!session || session.agent_verus_id !== tokenData.agentVerusId) {
    socket.emit('ws:error', { code: 'SESSION_MISMATCH', message: 'Session not found or agent mismatch' });
    socket.disconnect(true);
    return;
  }

  socket.wsRole = 'agent';
  socket.wsSessionId = session.id;
  socket.wsJobId = session.job_id;
  socket.wsVerusId = session.agent_verus_id;
  socket.join(`ws:${session.id}`);

  registerAgentHandlers(socket, session, ns);
  logger.info({ sessionId: session.id, agentVerusId: session.agent_verus_id }, 'Agent connected to workspace');
}

// ── Event Handlers ──────────────────────────────────────────────

function registerBuyerHandlers(socket: WorkspaceSocket, session: any, ns: any) {
  // Buyer sends MCP result (response to agent's tool call)
  socket.on('mcp:result', async (data: McpResultPayload) => {
    try {
      // Log operation metadata (never file contents)
      await logOperation(session.id, data.metadata.operation, data.metadata.path, {
        sizeBytes: data.metadata.sizeBytes,
        contentHash: data.metadata.contentHash,
        sovguardScore: data.metadata.sovguardScore,
        approved: data.metadata.approved,
        blocked: data.metadata.blocked,
        blockReason: data.metadata.blockReason,
      });

      // Forward result to agent (strip metadata — agent gets MCP result only)
      socket.to(`ws:${session.id}`).emit('mcp:result', {
        id: data.id,
        success: data.success,
        result: data.result,
        error: data.error,
      });

      // Update dashboard with latest counts
      const counts = await getOperationCounts(session.id);
      emitDashboardUpdate(session.job_id, session.id, 'active', counts);
    } catch (err) {
      logger.error({ err, sessionId: session.id }, 'Error processing MCP result');
    }
  });

  // Buyer reports pre-scan exclusions
  socket.on('workspace:pre_scan_done', async (data: {
    directoryHash: string;
    excludedFiles: string[];
    exclusionOverrides?: string[];
  }) => {
    try {
      await updateSessionStatus(session.id, 'active', {
        directory_hash: data.directoryHash,
        excluded_files: JSON.stringify(data.excludedFiles),
        exclusion_overrides: data.exclusionOverrides
          ? JSON.stringify(data.exclusionOverrides) : null,
      });
    } catch (err) {
      logger.error({ err, sessionId: session.id }, 'Error saving pre-scan data');
    }
  });

  // Buyer pauses
  socket.on('workspace:pause', async () => {
    await updateSessionStatus(session.id, 'paused');
    ns.to(`ws:${session.id}`).emit('workspace:status_changed', { status: 'paused' });
    emitDashboardUpdate(session.job_id, session.id, 'paused');
  });

  // Buyer resumes
  socket.on('workspace:resume', async () => {
    await updateSessionStatus(session.id, 'active');
    ns.to(`ws:${session.id}`).emit('workspace:status_changed', { status: 'active' });
    emitDashboardUpdate(session.job_id, session.id, 'active');
  });

  // Buyer aborts (immediate, no grace)
  socket.on('workspace:abort', async () => {
    await markSessionAborted(session.id);
    ns.to(`ws:${session.id}`).emit('workspace:status_changed', { status: 'aborted', reason: 'buyer_aborted' });
    emitDashboardUpdate(session.job_id, session.id, 'aborted');
    emitWebhookEvent({
      type: 'workspace.disconnected' as any,
      agentVerusId: session.agent_verus_id,
      jobId: session.job_id,
      data: { jobId: session.job_id, reason: 'buyer_aborted' },
    });
  });

  // Buyer accepts agent's completion signal
  socket.on('workspace:accept', async () => {
    await markSessionCompleted(session.id);
    ns.to(`ws:${session.id}`).emit('workspace:status_changed', { status: 'completed' });
    emitDashboardUpdate(session.job_id, session.id, 'completed');
    emitWebhookEvent({
      type: 'workspace.completed' as any,
      agentVerusId: session.agent_verus_id,
      jobId: session.job_id,
      data: { jobId: session.job_id, sessionId: session.id },
    });
  });

  // Buyer disconnects unexpectedly
  socket.on('disconnect', async () => {
    try {
      const current = await getSessionById(session.id);
      if (current && (current.status === 'active' || current.status === 'paused')) {
        // 5-minute grace period
        const reconnToken = await setReconnectToken(session.id);
        emitDashboardUpdate(session.job_id, session.id, 'disconnected', undefined, reconnToken);
        ns.to(`ws:${session.id}`).emit('workspace:status_changed', {
          status: 'disconnected',
          reason: 'buyer_disconnected',
          gracePeriodSeconds: 300,
        });
        emitWebhookEvent({
          type: 'workspace.disconnected' as any,
          agentVerusId: session.agent_verus_id,
          jobId: session.job_id,
          data: { jobId: session.job_id, reason: 'buyer_disconnected', gracePeriodSeconds: 300 },
        });
      }
    } catch (err) {
      logger.error({ err, sessionId: session.id }, 'Error handling buyer disconnect');
    }
    logger.info({ sessionId: session.id }, 'Buyer disconnected from workspace');
  });
}

function registerAgentHandlers(socket: WorkspaceSocket, session: any, ns: any) {
  // Agent sends MCP tool call
  socket.on('mcp:call', async (data: McpCallPayload) => {
    // Rate limit: 10/sec, 300/min
    if (!checkOpRate(session.id)) {
      socket.emit('mcp:error', {
        id: data.id,
        code: 'RATE_LIMITED',
        message: 'Too many operations — max 10/sec, 300/min',
      });
      return;
    }

    // Forward to buyer CLI
    socket.to(`ws:${session.id}`).emit('mcp:call', data);
  });

  // Agent signals work is done
  socket.on('workspace:agent_done', async () => {
    ns.to(`ws:${session.id}`).emit('workspace:agent_done', {
      message: 'Agent signals work is complete. Review and accept to close workspace.',
    });
    emitDashboardUpdate(session.job_id, session.id, 'active');
  });

  // Agent disconnects
  socket.on('disconnect', async () => {
    try {
      const current = await getSessionById(session.id);
      if (current && (current.status === 'active' || current.status === 'paused')) {
        // Don't change session status — buyer is still in control
        ns.to(`ws:${session.id}`).emit('workspace:agent_disconnected', {
          message: 'Agent disconnected. Workspace remains open.',
          gracePeriodSeconds: 300,
        });
      }
    } catch (err) {
      logger.error({ err, sessionId: session.id }, 'Error handling agent disconnect');
    }
    logger.info({ sessionId: session.id }, 'Agent disconnected from workspace');
  });
}

// ── Rate Limiting ───────────────────────────────────────────────

// Rate limit keyed by IP address — attacker sending different UIDs still hits the same counter
function checkUidRate(ip: string): { allowed: boolean } {
  const now = Date.now();
  let entry = uidAttempts.get(ip);

  if (entry && entry.lockedUntil > now) {
    return { allowed: false };
  }

  if (!entry || entry.lockedUntil <= now) {
    entry = { count: 0, lockedUntil: 0 };
  }

  entry.count++;
  if (entry.count >= 5) {
    entry.lockedUntil = now + 15 * 60 * 1000; // 15 min lockout
    uidAttempts.set(ip, entry);
    return { allowed: false };
  }

  uidAttempts.set(ip, entry);
  return { allowed: true };
}

function checkOpRate(sessionId: string): boolean {
  const now = Date.now();
  let entry = sessionRates.get(sessionId);

  if (!entry) {
    entry = {
      perSecond: { count: 0, start: now },
      perMinute: { count: 0, start: now },
    };
  }

  // Reset per-second window
  if (now - entry.perSecond.start >= 1000) {
    entry.perSecond = { count: 0, start: now };
  }
  entry.perSecond.count++;
  if (entry.perSecond.count > 10) {
    sessionRates.set(sessionId, entry);
    return false;
  }

  // Reset per-minute window
  if (now - entry.perMinute.start >= 60_000) {
    entry.perMinute = { count: 0, start: now };
  }
  entry.perMinute.count++;
  if (entry.perMinute.count > 300) {
    sessionRates.set(sessionId, entry);
    return false;
  }

  sessionRates.set(sessionId, entry);
  return true;
}

// ── Dashboard Notifications ─────────────────────────────────────

function emitDashboardUpdate(
  jobId: string,
  sessionId: string,
  status: string,
  counts?: any,
  reconnectToken?: string,
) {
  if (!mainIo) return;
  // Emit to the main Socket.IO job room so the dashboard gets workspace status
  mainIo.to(`job:${jobId}`).emit('workspace:update', {
    sessionId,
    status,
    counts,
    reconnectToken,
  });
}
```

- [ ] **Step 2: Initialize workspace relay in server.ts**

In `/home/bigbox/code/junction41/src/api/server.ts`, in the `startServer` function, after line 246 (`logger.info('Socket.IO server initialized on /ws');`), add:

```typescript
    // Initialize workspace relay on same Socket.IO instance
    try {
      const { initWorkspaceRelay } = await import('../chat/workspace-relay.js');
      initWorkspaceRelay(io);
    } catch (err) {
      logger.warn({ err: (err as Error).message }, 'Workspace relay initialization failed');
    }
```

- [ ] **Step 3: Verify full build succeeds**

```bash
cd /home/bigbox/code/junction41 && sudo docker compose up -d --build
```

Check for compilation errors:

```bash
sudo docker compose logs --tail=50 api 2>&1 | grep -iE "error|workspace"
```

Expected: "Workspace relay initialized on /workspace namespace" in logs, no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add src/chat/workspace-relay.ts src/api/server.ts
git commit -m "feat(workspace): WebSocket relay — MCP routing, auth, rate limiting, disconnection handling"
```

---

## Chunk 4: Worker + Dashboard + Attestation

### Task 8: Worker cleanup tasks

**Files:**
- Modify: `/home/bigbox/code/junction41/src/worker/index.ts`

Add 3 workspace-related cleanup tasks to the existing worker loop.

- [ ] **Step 1: Add workspace-queries imports**

At the top of the file, after the existing bounty imports (line 27), add:

```typescript
import { getExpiredReconnectTokens, archiveOldOperations, getDisconnectedSessions, updateSessionStatus } from '../db/workspace-queries.js';
```

Note: `updateSessionStatus` is already imported from bounty-queries — rename the workspace one:

```typescript
import { getExpiredReconnectTokens, archiveOldOperations, getDisconnectedSessions, updateSessionStatus as updateWorkspaceStatus } from '../db/workspace-queries.js';
```

- [ ] **Step 2: Add workspace worker tasks to the loop**

After step 16 (stale reviewing bounties, around line 391), before the closing `catch`, add:

```typescript
    // ── 17. Workspace: expire reconnect tokens ────────────────────
    try {
      const expiredTokens = await getExpiredReconnectTokens();
      for (const session of expiredTokens) {
        await updateWorkspaceStatus(session.id, 'disconnected', {
          reconnect_token: null,
          reconnect_expires_at: null,
        });
        logger.info({ sessionId: session.id }, 'Workspace reconnect token expired');
      }
    } catch (err) {
      logger.error({ err }, 'Workspace reconnect cleanup failed');
    }

    // ── 18. Workspace: close stale disconnected sessions ──────────
    try {
      const staleSessions = await getDisconnectedSessions(5); // 5 min grace
      for (const session of staleSessions) {
        await updateWorkspaceStatus(session.id, 'aborted');
        logger.info({ sessionId: session.id }, 'Stale disconnected workspace closed');
        emitWebhookEvent({
          type: 'workspace.disconnected' as any,
          agentVerusId: session.agent_verus_id,
          jobId: session.job_id,
          data: { jobId: session.job_id, reason: 'grace_period_expired' },
        });
      }
    } catch (err) {
      logger.error({ err }, 'Stale workspace cleanup failed');
    }

    // ── 19. Workspace: archive old operations (>90 days) ──────────
    try {
      await archiveOldOperations(90);
    } catch (err) {
      logger.error({ err }, 'Workspace operations archive failed');
    }
```

- [ ] **Step 3: Verify build**

```bash
cd /home/bigbox/code/junction41 && sudo docker compose up -d --build
```

Expected: No TypeScript errors. Worker log should show the workspace tasks running every 30 seconds.

- [ ] **Step 4: Commit**

```bash
git add src/worker/index.ts
git commit -m "feat(workspace): worker tasks — reconnect expiry, stale session cleanup, operation archival"
```

---

### Task 9: WorkspacePanel component

**Files:**
- Create: `/home/bigbox/code/junction41-dashboard/src/components/WorkspacePanel.jsx`

This component renders on JobDetailPage when a job is `in_progress`. It handles:
1. Permission configuration (mode, read/write checkboxes)
2. Token generation (POST to /v1/workspace/:jobId/token)
3. CLI command display with copy button
4. Session status display (active/paused/disconnected/completed/aborted)
5. Operation counts (files read, written, blocked)
6. Socket.IO listener for real-time status updates

- [ ] **Step 1: Create WorkspacePanel.jsx**

```jsx
import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../utils/api';
import { io } from 'socket.io-client';
import { Terminal, Copy, Check, Shield, Eye, Pause, Play, XCircle } from 'lucide-react';

const WS_URL = import.meta.env.VITE_WS_URL || window.location.origin;

export default function WorkspacePanel({ job }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  // Permission config (before token generation)
  const [mode, setMode] = useState('supervised');
  const [writeEnabled, setWriteEnabled] = useState(true);

  // Generated token data
  const [tokenData, setTokenData] = useState(null);

  // Fetch existing session on mount
  useEffect(() => {
    fetchSession();
  }, [job.id]);

  // Socket.IO for real-time workspace status updates
  // Uses the main /ws namespace (same as Chat.jsx) — workspace updates are emitted to job rooms
  useEffect(() => {
    if (!session) return;
    let socket;

    (async () => {
      // Get chat token for Socket.IO auth (same pattern as Chat.jsx)
      try {
        const tokenRes = await apiFetch('/v1/chat/token');
        if (!tokenRes.ok) return;
        const tokenData = await tokenRes.json();
        const chatToken = tokenData.data?.token;
        if (!chatToken) return;

        socket = io(WS_URL, {
          path: '/ws',
          auth: { token: chatToken },
          withCredentials: true,
          transports: ['websocket', 'polling'],
        });

        socket.on('connect', () => {
          socket.emit('join_job', { jobId: job.id });
        });

        socket.on('workspace:update', (data) => {
          setSession((prev) => prev ? {
            ...prev,
            status: data.status,
            counts: data.counts || prev.counts,
          } : prev);
        });
      } catch {
        // Socket.IO connection failed — fall back to polling
      }
    })();

    return () => { if (socket) socket.disconnect(); };
  }, [session?.id, job.id]);

  async function fetchSession() {
    try {
      const res = await apiFetch(`/v1/workspace/${job.id}`);
      if (res.status === 401) return;
      if (!res.ok) return;
      const data = await res.json();
      if (data.data) {
        setSession(data.data);
      }
    } catch {
      // No session yet — that's fine
    } finally {
      setLoading(false);
    }
  }

  async function generateToken() {
    setGenerating(true);
    setError(null);
    try {
      const res = await apiFetch(`/v1/workspace/${job.id}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          permissions: { read: true, write: writeEnabled },
        }),
      });
      if (res.status === 401) return;
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message || 'Failed to generate token');
        return;
      }
      setTokenData(data.data);
      // Refresh session status
      await fetchSession();
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  }

  async function abortWorkspace() {
    if (!confirm('Abort workspace? This will immediately disconnect the agent.')) return;
    try {
      const res = await apiFetch(`/v1/workspace/${job.id}/abort`, { method: 'POST' });
      if (res.ok) {
        await fetchSession();
      }
    } catch (err) {
      setError(err.message);
    }
  }

  function copyCommand() {
    if (!tokenData) return;
    const full = `# Install (once):\nyarn global add @j41/workspace\n\n# Start workspace:\n${tokenData.command}`;
    navigator.clipboard.writeText(full);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) return null;

  // ── Active Session View ────────────────────────────────────────
  if (session && session.status !== 'completed' && session.status !== 'aborted') {
    return (
      <div className="card" style={{ borderColor: 'var(--border-accent)' }}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Terminal size={18} style={{ color: 'var(--accent-primary)' }} />
            <h3 className="text-white font-semibold">Workspace</h3>
          </div>
          <div className="flex items-center gap-2">
            <span className={`badge badge-${session.status === 'active' ? 'in_progress' : session.status}`}>
              {session.status}
            </span>
            {session.status !== 'aborted' && (
              <button
                onClick={abortWorkspace}
                className="text-red-400 hover:text-red-300 transition-colors"
                title="Abort workspace"
              >
                <XCircle size={18} />
              </button>
            )}
          </div>
        </div>

        {/* Mode + Permissions */}
        <div className="flex gap-4 text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
          <span className="flex items-center gap-1">
            {session.mode === 'supervised' ? <Eye size={14} /> : <Shield size={14} />}
            {session.mode}
          </span>
          <span>Read: on</span>
          {session.permissions?.write && <span>Write: on</span>}
        </div>

        {/* Operation Counts */}
        {session.counts && (
          <div className="grid grid-cols-4 gap-3 mb-4">
            {[
              { label: 'Read', value: session.counts.reads, color: 'var(--accent-primary)' },
              { label: 'Written', value: session.counts.writes, color: '#60a5fa' },
              { label: 'Listed', value: session.counts.list_dirs, color: 'var(--text-secondary)' },
              { label: 'Blocked', value: session.counts.blocked, color: session.counts.blocked > 0 ? '#f87171' : 'var(--text-tertiary)' },
            ].map(({ label, value, color }) => (
              <div key={label} className="text-center p-2 rounded-lg" style={{ background: 'var(--bg-inset)' }}>
                <div className="text-lg font-bold" style={{ color }}>{value}</div>
                <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Disconnected — show reconnect info */}
        {session.status === 'disconnected' && (
          <div className="p-3 rounded-lg" style={{ background: 'rgba(251, 191, 36, 0.1)', border: '1px solid rgba(251, 191, 36, 0.3)' }}>
            <p className="text-yellow-400 text-sm font-medium">CLI disconnected — 5 min grace period</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
              Reconnect with: <code>j41-workspace --resume &lt;token&gt;</code>
            </p>
          </div>
        )}
      </div>
    );
  }

  // ── Completed/Aborted View ─────────────────────────────────────
  if (session && (session.status === 'completed' || session.status === 'aborted')) {
    return (
      <div className="card">
        <div className="flex items-center gap-2 mb-3">
          <Terminal size={18} style={{ color: 'var(--text-tertiary)' }} />
          <h3 className="text-white font-semibold">Workspace</h3>
          <span className={`badge badge-${session.status}`}>
            {session.status}
          </span>
        </div>
        {session.counts && (
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {session.counts.reads} files read, {session.counts.writes} written, {session.counts.blocked} blocked
          </p>
        )}
        {session.attestation && (
          <div className="mt-3 p-3 rounded-lg" style={{ background: 'var(--bg-inset)' }}>
            <p className="text-xs font-medium" style={{ color: 'var(--accent-primary)' }}>
              Workspace attestation signed by platform
            </p>
          </div>
        )}
      </div>
    );
  }

  // ── Token Generation View (no active session) ──────────────────
  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-4">
        <Terminal size={18} style={{ color: 'var(--accent-primary)' }} />
        <h3 className="text-white font-semibold">Workspace</h3>
      </div>

      <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
        Give the agent sandboxed access to your local files. SovGuard scans everything locally — file contents never leave your machine.
      </p>

      {/* Mode Selection */}
      <div className="mb-4">
        <label className="text-sm font-medium text-white block mb-2">Mode</label>
        <div className="flex gap-3">
          {[
            { value: 'supervised', label: 'Supervised', desc: 'Approve each action' },
            { value: 'standard', label: 'Standard', desc: 'Watch live feed' },
          ].map((opt) => (
            <label key={opt.value}
              className="flex items-start gap-2 cursor-pointer p-3 rounded-lg flex-1"
              style={{
                background: mode === opt.value ? 'rgba(52, 211, 153, 0.1)' : 'var(--bg-inset)',
                border: `1px solid ${mode === opt.value ? 'var(--accent-primary)' : 'var(--border-subtle)'}`,
              }}
            >
              <input
                type="radio"
                name="workspace-mode"
                value={opt.value}
                checked={mode === opt.value}
                onChange={(e) => setMode(e.target.value)}
                className="mt-0.5"
              />
              <div>
                <span className="text-white text-sm font-medium">{opt.label}</span>
                <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{opt.desc}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Permissions */}
      <div className="mb-4">
        <label className="text-sm font-medium text-white block mb-2">Permissions</label>
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
            <input type="checkbox" checked disabled />
            Read files (always on)
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
            <input
              type="checkbox"
              checked={writeEnabled}
              onChange={(e) => setWriteEnabled(e.target.checked)}
            />
            Write files
          </label>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg mb-4" style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* Generated Command */}
      {tokenData ? (
        <div className="mb-4">
          <div className="rounded-lg p-4 font-mono text-xs" style={{ background: 'var(--bg-inset)', border: '1px solid var(--border-subtle)' }}>
            <p style={{ color: 'var(--text-tertiary)' }}># Install (once):</p>
            <p className="text-white mb-2">yarn global add @j41/workspace</p>
            <p style={{ color: 'var(--text-tertiary)' }}># Start workspace:</p>
            <p className="text-white break-all">{tokenData.command}</p>
          </div>
          <button
            onClick={copyCommand}
            className="mt-2 flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg transition-colors"
            style={{
              background: copied ? 'rgba(52, 211, 153, 0.2)' : 'var(--bg-elevated)',
              color: copied ? 'var(--accent-primary)' : 'var(--text-secondary)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? 'Copied!' : 'Copy command'}
          </button>
        </div>
      ) : (
        <button
          onClick={generateToken}
          disabled={generating}
          className="w-full py-3 rounded-lg font-medium text-sm transition-colors"
          style={{
            background: generating ? 'var(--bg-elevated)' : 'var(--accent-primary)',
            color: generating ? 'var(--text-tertiary)' : 'white',
          }}
        >
          {generating ? 'Generating...' : 'Generate Workspace Token'}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
cd /home/bigbox/code/junction41-dashboard && sudo docker compose up -d --build
```

Expected: No build errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/WorkspacePanel.jsx
git commit -m "feat(workspace): WorkspacePanel — token generation, status display, permission config"
```

---

### Task 10: Integrate WorkspacePanel into JobDetailPage

**Files:**
- Modify: `/home/bigbox/code/junction41-dashboard/src/pages/JobDetailPage.jsx`

- [ ] **Step 1: Add WorkspacePanel import**

At the top of JobDetailPage.jsx, after the existing imports (after line 11):

```jsx
import WorkspacePanel from '../components/WorkspacePanel';
```

- [ ] **Step 2: Add WorkspacePanel to the render**

After the Job Actions section (after line 301, after the `</div>` that closes the JobActions card), add:

```jsx
      {/* Workspace Panel — buyer only, in_progress jobs */}
      {isBuyer && job.status === 'in_progress' && (
        <WorkspacePanel job={job} />
      )}
```

- [ ] **Step 3: Verify visually**

```bash
cd /home/bigbox/code/junction41-dashboard && sudo docker compose up -d --build
```

Navigate to an `in_progress` job as the buyer. The workspace panel should appear between Job Actions and Chat, showing the token generation UI.

- [ ] **Step 4: Commit**

```bash
git add src/pages/JobDetailPage.jsx
git commit -m "feat(workspace): integrate WorkspacePanel into JobDetailPage for in_progress buyer jobs"
```

---

### Task 11: Workspace attestation signing

**Files:**
- Modify: `/home/bigbox/code/junction41/src/chat/workspace-relay.ts`

After a workspace completes cleanly (buyer accepts via `workspace:accept`), the platform signs a workspace attestation and stores it. This task adds the attestation generation logic to the relay's `workspace:accept` handler.

- [ ] **Step 1: Add attestation imports to workspace-relay.ts**

At the top of workspace-relay.ts, add `createAttestation` to the existing workspace-queries import list (alongside `getOperationCounts` which is already imported):

```typescript
// Add createAttestation to the existing import from '../db/workspace-queries.js'
// Add this new import:
import { getRpcClient } from '../indexer/rpc-client.js';
```

- [ ] **Step 2: Add attestation generation to the workspace:accept handler**

In the `registerBuyerHandlers` function, find the `workspace:accept` handler:

```typescript
  socket.on('workspace:accept', async () => {
    await markSessionCompleted(session.id);
```

Replace the entire `workspace:accept` handler with:

```typescript
  // Buyer accepts agent's completion signal → generate attestation
  socket.on('workspace:accept', async () => {
    await markSessionCompleted(session.id);
    ns.to(`ws:${session.id}`).emit('workspace:status_changed', { status: 'completed' });
    emitDashboardUpdate(session.job_id, session.id, 'completed');

    // Generate workspace attestation
    try {
      const counts = await getOperationCounts(session.id);
      const current = await getSessionById(session.id);
      const connectedAt = current?.connected_at ? new Date(current.connected_at).getTime() : Date.now();
      const sessionDuration = Math.floor((Date.now() - connectedAt) / 1000);

      const attestationData = {
        type: 'workspace_attestation',
        jobId: session.job_id,
        agentVerusId: session.agent_verus_id,
        buyerVerusId: session.buyer_verus_id,
        sessionDuration,
        filesRead: counts.reads,
        filesWritten: counts.writes,
        commandsRun: 0, // v1: no commands
        sovguardFlags: counts.blocked, // v1: same as operationsBlocked (no separate SovGuard counter yet)
        operationsBlocked: counts.blocked,
        buyerAborted: false,
        completedClean: true,
        mode: session.mode,
        permissions: typeof session.permissions === 'string' ? JSON.parse(session.permissions) : session.permissions,
      };

      // Sign with platform VerusID
      let platformSignature = 'unsigned'; // fallback
      try {
        const rpc = getRpcClient();
        const signMessage = JSON.stringify(attestationData);
        const sigResult = await rpc.signMessage(
          process.env.PLATFORM_IDENTITY || 'agentplatform@',
          signMessage,
        );
        platformSignature = sigResult;
      } catch (signErr) {
        logger.warn({ err: signErr }, 'Failed to sign workspace attestation — storing unsigned');
      }

      await createAttestation(
        session.id,
        session.job_id,
        session.agent_verus_id,
        session.buyer_verus_id,
        attestationData,
        platformSignature,
      );

      logger.info({ sessionId: session.id, jobId: session.job_id }, 'Workspace attestation created');
    } catch (err) {
      logger.error({ err, sessionId: session.id }, 'Failed to create workspace attestation');
    }

    emitWebhookEvent({
      type: 'workspace.completed' as any,
      agentVerusId: session.agent_verus_id,
      jobId: session.job_id,
      data: { jobId: session.job_id, sessionId: session.id },
    });
  });
```

- [ ] **Step 3: Add platform event emission**

In workspace.ts token generation handler, the platform event is already emitted. Add one more for completion. In the `workspace:accept` handler (just added above), after the attestation is created, add:

```typescript
      emitPlatformEvent({
        type: 'workspace_completed',
        agent_verus_id: session.agent_verus_id,
        detail: `workspace completed for job ${session.job_id.slice(0, 8)}`,
      });
```

Add the import at the top of workspace-relay.ts:

```typescript
import { emitPlatformEvent } from '../db/platform-event-queries.js';
```

- [ ] **Step 4: Verify full build**

```bash
cd /home/bigbox/code/junction41 && sudo docker compose up -d --build
```

Expected: No TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add src/chat/workspace-relay.ts
git commit -m "feat(workspace): attestation signing on workspace completion + platform event emission"
```
