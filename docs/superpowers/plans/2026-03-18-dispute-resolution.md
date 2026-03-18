# Dispute Resolution Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement peer-to-peer dispute resolution with review windows, refunds, rework with optional cost, and public dispute metrics on agent profiles.

**Architecture:** Disputes table tracks the full lifecycle (filed → agent responds → resolved). A review window countdown prevents container destruction until the buyer accepts or the window expires. Auto-complete worker handles expired windows. Refunds execute via `sendcurrency` RPC. Dispute metrics feed into trust scores.

**Tech Stack:** Kysely (migrations + queries), Fastify (routes), Verus RPC (sendcurrency for refunds), React + Tailwind (dashboard UI)

**Important:** Never run npm/node on host. All builds via `sudo docker compose up -d --build`. All DB operations via `sudo docker exec`.

---

## File Structure

### Backend (`/home/bigbox/code/junction41`)

| File | Action | Responsibility |
|------|--------|----------------|
| `src/db/migrations/009_dispute_resolution.ts` | Create | disputes table + jobs columns |
| `src/db/schema.ts` | Modify | DisputeTable interface, JobTable additions |
| `src/db/dispute-queries.ts` | Create | All dispute CRUD queries |
| `src/api/routes/jobs.ts` | Modify | Update dispute endpoint, add respond/rework-accept, auto-complete on delivery |
| `src/worker/index.ts` | Modify | Add review window auto-complete check |
| `src/trust/aggregator.ts` | Modify | Add dispute resolution metrics |
| `src/validation/vdxf-keys.ts` | Modify | Add resolutionWindow key |

### Dashboard (`/home/bigbox/code/junction41-dashboard`)

| File | Action | Responsibility |
|------|--------|----------------|
| `src/components/DisputeModal.jsx` | Create | Filing + response + rework acceptance UI |
| `src/components/JobActions.jsx` | Modify | Review window countdown, accept/dispute buttons |
| `src/components/DisputeTimeline.jsx` | Create | Dispute history on job detail |
| `src/components/DisputeMetrics.jsx` | Create | Agent profile dispute stats |
| `src/pages/AgentProfilePage.jsx` | Modify | Add dispute metrics section |

---

## Chunk 1: Database Migration + Schema

### Task 1: Create migration 009_dispute_resolution

**Files:**
- Create: `src/db/migrations/009_dispute_resolution.ts`

- [ ] **Step 1: Write the migration**

```typescript
import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // Disputes table
  await db.schema
    .createTable('disputes')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('job_id', 'uuid', col => col.notNull().references('jobs.id'))
    .addColumn('raised_by', 'text', col => col.notNull())
    .addColumn('reason', 'text', col => col.notNull())
    .addColumn('reason_signature', 'text', col => col.notNull())
    .addColumn('response', 'text')
    .addColumn('response_signature', 'text')
    .addColumn('action', 'text', col => col.notNull().defaultTo('pending'))
    .addColumn('refund_percent', 'integer')
    .addColumn('refund_txid', 'text')
    .addColumn('rework_cost', 'numeric')
    .addColumn('rework_accepted', 'boolean')
    .addColumn('rework_payment_txid', 'text')
    .addColumn('resolved_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(sql`NOW()`))
    .execute();

  await db.schema.createIndex('idx_disputes_job_id').on('disputes').column('job_id').execute();
  await db.schema.createIndex('idx_disputes_raised_by').on('disputes').column('raised_by').execute();

  // Add review window columns to jobs
  await db.schema.alterTable('jobs')
    .addColumn('review_window_expires_at', 'timestamptz')
    .execute();
  await db.schema.alterTable('jobs')
    .addColumn('resolution_window', 'integer')
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('jobs').dropColumn('resolution_window').execute();
  await db.schema.alterTable('jobs').dropColumn('review_window_expires_at').execute();
  await db.schema.dropTable('disputes').execute();
}
```

- [ ] **Step 2: Register migration**

Check how migrations are registered. Look at `src/db/migrate.ts` or equivalent — if migrations auto-discover from the directory, no action needed. If manually listed, add `009_dispute_resolution`.

- [ ] **Step 3: Update schema types**

**File:** `src/db/schema.ts` — add after AdminAccessLogTable (around line 550):

```typescript
export interface DisputeTable {
  id: Generated<string>;
  job_id: string;
  raised_by: string;
  reason: string;
  reason_signature: string;
  response: string | null;
  response_signature: string | null;
  action: Generated<string>;  // 'pending' | 'refund' | 'rework' | 'rejected'
  refund_percent: number | null;
  refund_txid: string | null;
  rework_cost: number | null;
  rework_accepted: boolean | null;
  rework_payment_txid: string | null;
  resolved_at: string | null;
  created_at: Generated<string>;
}
```

Add to the Database interface:

```typescript
disputes: DisputeTable;
```

Add to JobTable interface (around line 226):

```typescript
review_window_expires_at: string | null;
resolution_window: number | null;
```

- [ ] **Step 4: Build and run migration**

```bash
cd /home/bigbox/code/junction41
sudo docker compose up -d --build
sudo docker exec j41-backend node dist/db/migrate.js
```

Verify tables created:
```bash
sudo docker exec j41-db psql -U j41 -d junction41 -c "\d disputes"
sudo docker exec j41-db psql -U j41 -d junction41 -c "SELECT column_name FROM information_schema.columns WHERE table_name='jobs' AND column_name IN ('review_window_expires_at','resolution_window');"
```

- [ ] **Step 5: Commit**

```bash
git add src/db/migrations/009_dispute_resolution.ts src/db/schema.ts
git commit -m "feat: add disputes table and review window columns to jobs"
```

---

### Task 2: Create dispute queries

**Files:**
- Create: `src/db/dispute-queries.ts`

- [ ] **Step 1: Write dispute query functions**

```typescript
import { getDb } from './index.js';
import { sql } from 'kysely';

export const disputeQueries = {
  create: async (data: {
    jobId: string;
    raisedBy: string;
    reason: string;
    reasonSignature: string;
  }) => {
    return getDb()
      .insertInto('disputes')
      .values({
        job_id: data.jobId,
        raised_by: data.raisedBy,
        reason: data.reason,
        reason_signature: data.reasonSignature,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  getByJobId: async (jobId: string) => {
    return getDb()
      .selectFrom('disputes')
      .selectAll()
      .where('job_id', '=', jobId)
      .orderBy('created_at', 'desc')
      .executeTakeFirst();
  },

  respond: async (jobId: string, data: {
    response: string;
    responseSignature: string;
    action: 'refund' | 'rework' | 'rejected';
    refundPercent?: number;
    reworkCost?: number;
  }) => {
    const update: any = {
      response: data.response,
      response_signature: data.responseSignature,
      action: data.action,
    };
    if (data.action === 'refund') {
      update.refund_percent = data.refundPercent ?? 0;
      update.resolved_at = sql`NOW()`;
    }
    if (data.action === 'rework') {
      update.rework_cost = data.reworkCost ?? 0;
    }
    if (data.action === 'rejected') {
      update.resolved_at = sql`NOW()`;
    }
    return getDb()
      .updateTable('disputes')
      .set(update)
      .where('job_id', '=', jobId)
      .where('action', '=', 'pending')
      .returningAll()
      .executeTakeFirst();
  },

  setRefundTxid: async (jobId: string, txid: string) => {
    return getDb()
      .updateTable('disputes')
      .set({ refund_txid: txid })
      .where('job_id', '=', jobId)
      .execute();
  },

  acceptRework: async (jobId: string, paymentTxid?: string) => {
    const update: any = {
      rework_accepted: true,
    };
    if (paymentTxid) {
      update.rework_payment_txid = paymentTxid;
    }
    return getDb()
      .updateTable('disputes')
      .set(update)
      .where('job_id', '=', jobId)
      .where('action', '=', 'rework')
      .execute();
  },

  resolveRework: async (jobId: string) => {
    return getDb()
      .updateTable('disputes')
      .set({ resolved_at: sql`NOW()` })
      .where('job_id', '=', jobId)
      .where('action', '=', 'rework')
      .execute();
  },

  getDisputeMetrics: async (verusId: string) => {
    const db = getDb();
    const result = await db
      .selectFrom('jobs')
      .select([
        sql<number>`COUNT(*) FILTER (WHERE status IN ('completed', 'resolved', 'resolved_rejected'))`.as('total_completed'),
        sql<number>`COUNT(*) FILTER (WHERE status IN ('completed') AND id NOT IN (SELECT job_id FROM disputes))`.as('clean_jobs'),
        sql<number>`COUNT(*) FILTER (WHERE id IN (SELECT job_id FROM disputes))`.as('total_disputes'),
        sql<number>`COUNT(*) FILTER (WHERE id IN (SELECT job_id FROM disputes WHERE action = 'refund'))`.as('refunded'),
        sql<number>`COUNT(*) FILTER (WHERE id IN (SELECT job_id FROM disputes WHERE action = 'rework'))`.as('reworked'),
        sql<number>`COUNT(*) FILTER (WHERE id IN (SELECT job_id FROM disputes WHERE action = 'rejected'))`.as('rejected'),
      ])
      .where('seller_verus_id', '=', verusId)
      .executeTakeFirst();
    return result;
  },
};
```

- [ ] **Step 2: Commit**

```bash
git add src/db/dispute-queries.ts
git commit -m "feat: add dispute query functions"
```

---

## Chunk 2: Backend API Endpoints

### Task 3: Update existing dispute endpoint + add review window to delivery

**Files:**
- Modify: `src/api/routes/jobs.ts` (lines 772-864 deliver, lines 1244-1340 dispute)

- [ ] **Step 1: Add import for dispute queries**

At the top of `jobs.ts`, add:

```typescript
import { disputeQueries } from '../../db/dispute-queries.js';
```

- [ ] **Step 2: Set review window on delivery**

In the deliver endpoint (around line 832, after `setDelivered` succeeds), add:

```typescript
// Set review window expiry
const service = await db.selectFrom('services')
  .select('resolution_window')
  .where('id', '=', job.service_id)
  .executeTakeFirst();
const windowMinutes = service?.resolution_window || 60; // default 60 min
const expiresAt = new Date(Date.now() + windowMinutes * 60 * 1000).toISOString();
await db.updateTable('jobs')
  .set({
    review_window_expires_at: expiresAt,
    resolution_window: windowMinutes,
  })
  .where('id', '=', id)
  .execute();
```

- [ ] **Step 3: Update dispute endpoint to create dispute record**

In the existing POST `/v1/jobs/:id/dispute` handler (around line 1313, after `setDisputed` succeeds), add dispute record creation:

```typescript
// Create dispute record
await disputeQueries.create({
  jobId: id,
  raisedBy: sessionVerusId,
  reason,
  reasonSignature: signature,
});
```

Also add a check that dispute is within review window (before the `setDisputed` call):

```typescript
// Check review window (only enforce if set — legacy jobs without window can still be disputed)
if (job.review_window_expires_at) {
  const windowExpired = new Date(job.review_window_expires_at) < new Date();
  if (windowExpired) {
    return reply.code(400).send({
      error: { code: 'REVIEW_WINDOW_EXPIRED', message: 'The review window for this job has expired.' },
    });
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add src/api/routes/jobs.ts
git commit -m "feat: set review window on delivery, create dispute record on dispute"
```

---

### Task 4: Add dispute respond endpoint

**Files:**
- Modify: `src/api/routes/jobs.ts`

- [ ] **Step 1: Add POST /v1/jobs/:id/dispute/respond**

Add after the existing dispute endpoint (after line ~1340):

```typescript
// POST /v1/jobs/:id/dispute/respond — agent responds to dispute
fastify.post<{ Params: { id: string }; Body: {
  action: 'refund' | 'rework' | 'rejected';
  refundPercent?: number;
  reworkCost?: number;
  message: string;
  timestamp: number;
  signature: string;
} }>('/v1/jobs/:id/dispute/respond', {
  config: { rateLimit: { max: 10, timeWindow: 60_000 } },
}, async (request, reply) => {
  const { id } = request.params;
  const { action, refundPercent, reworkCost, message, timestamp, signature } = request.body;

  // Validate inputs
  if (!['refund', 'rework', 'rejected'].includes(action)) {
    return reply.code(400).send({ error: { code: 'INVALID_ACTION', message: 'Action must be refund, rework, or rejected.' } });
  }
  if (!message || message.length < 1 || message.length > 2000) {
    return reply.code(400).send({ error: { code: 'INVALID_MESSAGE', message: 'Message required (1-2000 chars).' } });
  }
  if (action === 'refund') {
    if (typeof refundPercent !== 'number' || refundPercent < 1 || refundPercent > 100) {
      return reply.code(400).send({ error: { code: 'INVALID_REFUND', message: 'Refund percent must be 1-100.' } });
    }
  }
  if (action === 'rework' && reworkCost !== undefined) {
    if (typeof reworkCost !== 'number' || reworkCost < 0) {
      return reply.code(400).send({ error: { code: 'INVALID_COST', message: 'Rework cost must be >= 0.' } });
    }
  }

  // Auth — must be the seller
  const sessionVerusId = await getSessionVerusId(request);
  if (!sessionVerusId) {
    return reply.code(401).send({ error: { code: 'UNAUTHORIZED' } });
  }

  const db = getDb();
  const job = await db.selectFrom('jobs').selectAll().where('id', '=', id).executeTakeFirst();
  if (!job) return reply.code(404).send({ error: { code: 'NOT_FOUND' } });
  if (job.seller_verus_id !== sessionVerusId) {
    return reply.code(403).send({ error: { code: 'NOT_SELLER', message: 'Only the agent can respond to disputes.' } });
  }
  if (job.status !== 'disputed') {
    return reply.code(400).send({ error: { code: 'NOT_DISPUTED', message: 'Job is not in disputed status.' } });
  }

  // Check dispute exists and is pending
  const dispute = await disputeQueries.getByJobId(id);
  if (!dispute || dispute.action !== 'pending') {
    return reply.code(400).send({ error: { code: 'DISPUTE_NOT_PENDING', message: 'No pending dispute found.' } });
  }

  // Verify signature
  const jobHash = job.request_signature?.slice(0, 16) || id.slice(0, 16);
  const sigMessage = `J41-DISPUTE-RESPOND|Job:${jobHash}|Action:${action}|Ts:${timestamp}`;
  const sigValid = await verifySignatureForIdentity(sessionVerusId, sigMessage, signature);
  if (!sigValid) {
    return reply.code(400).send({ error: { code: 'INVALID_SIGNATURE' } });
  }

  // Execute response
  const updated = await disputeQueries.respond(id, {
    response: message,
    responseSignature: signature,
    action,
    refundPercent: action === 'refund' ? refundPercent : undefined,
    reworkCost: action === 'rework' ? (reworkCost ?? 0) : undefined,
  });

  if (!updated) {
    return reply.code(400).send({ error: { code: 'UPDATE_FAILED' } });
  }

  // Handle refund
  if (action === 'refund' && refundPercent && job.price) {
    const refundAmount = (job.price * refundPercent) / 100;
    try {
      const rpc = getRpcClient();
      const txid = await rpc.rpcCall<string>('sendtoaddress', [job.buyer_address, refundAmount]);
      await disputeQueries.setRefundTxid(id, txid);
      logger.info({ jobId: id, refundAmount, txid }, 'Dispute refund sent');
    } catch (err: any) {
      logger.error({ err, jobId: id }, 'Dispute refund failed');
      // Non-fatal — record the intent, admin can manually process
    }

    // Update job status to resolved
    await db.updateTable('jobs')
      .set({ status: 'resolved', updated_at: sql`NOW()` })
      .where('id', '=', id)
      .execute();

    // Notify buyer
    emitWebhook(job.buyer_verus_id, 'job.dispute.resolved', { jobId: id, action: 'refund', refundPercent });
    await notifyParticipant(job.buyer_verus_id, `Dispute resolved: ${refundPercent}% refund issued`, id);
  }

  // Handle reject
  if (action === 'rejected') {
    await db.updateTable('jobs')
      .set({ status: 'resolved_rejected', updated_at: sql`NOW()` })
      .where('id', '=', id)
      .execute();

    emitWebhook(job.buyer_verus_id, 'job.dispute.resolved', { jobId: id, action: 'rejected' });
    await notifyParticipant(job.buyer_verus_id, 'Agent rejected your dispute', id);
  }

  // Handle rework — wait for buyer acceptance
  if (action === 'rework') {
    emitWebhook(job.buyer_verus_id, 'job.dispute.responded', {
      jobId: id, action: 'rework', reworkCost: reworkCost ?? 0,
    });
    await notifyParticipant(job.buyer_verus_id, `Agent offered rework${reworkCost ? ` (+${reworkCost} VRSC)` : ''}`, id);
  }

  // Record response as signed job message
  await db.insertInto('job_messages').values({
    job_id: id,
    sender_verus_id: sessionVerusId,
    message: `[DISPUTE RESPONSE: ${action.toUpperCase()}] ${message}`,
    signature,
    signed: true,
  }).execute();

  // Recalc trust
  recalcTrustScore(job.seller_verus_id).catch(() => {});

  return reply.send({
    status: 'ok',
    action,
    dispute: updated,
  });
});
```

- [ ] **Step 2: Commit**

```bash
git add src/api/routes/jobs.ts
git commit -m "feat: add dispute respond endpoint (refund/rework/reject)"
```

---

### Task 5: Add rework-accept endpoint

**Files:**
- Modify: `src/api/routes/jobs.ts`

- [ ] **Step 1: Add POST /v1/jobs/:id/dispute/rework-accept**

```typescript
// POST /v1/jobs/:id/dispute/rework-accept — buyer accepts rework terms
fastify.post<{ Params: { id: string }; Body: {
  timestamp: number;
  signature: string;
} }>('/v1/jobs/:id/dispute/rework-accept', {
  config: { rateLimit: { max: 10, timeWindow: 60_000 } },
}, async (request, reply) => {
  const { id } = request.params;
  const { timestamp, signature } = request.body;

  const sessionVerusId = await getSessionVerusId(request);
  if (!sessionVerusId) {
    return reply.code(401).send({ error: { code: 'UNAUTHORIZED' } });
  }

  const db = getDb();
  const job = await db.selectFrom('jobs').selectAll().where('id', '=', id).executeTakeFirst();
  if (!job) return reply.code(404).send({ error: { code: 'NOT_FOUND' } });
  if (job.buyer_verus_id !== sessionVerusId) {
    return reply.code(403).send({ error: { code: 'NOT_BUYER' } });
  }
  if (job.status !== 'disputed') {
    return reply.code(400).send({ error: { code: 'NOT_DISPUTED' } });
  }

  const dispute = await disputeQueries.getByJobId(id);
  if (!dispute || dispute.action !== 'rework') {
    return reply.code(400).send({ error: { code: 'NO_REWORK_OFFER' } });
  }
  if (dispute.rework_accepted) {
    return reply.code(400).send({ error: { code: 'ALREADY_ACCEPTED' } });
  }

  // Verify signature
  const jobHash = job.request_signature?.slice(0, 16) || id.slice(0, 16);
  const sigMessage = `J41-REWORK-ACCEPT|Job:${jobHash}|Ts:${timestamp}`;
  const sigValid = await verifySignatureForIdentity(sessionVerusId, sigMessage, signature);
  if (!sigValid) {
    return reply.code(400).send({ error: { code: 'INVALID_SIGNATURE' } });
  }

  // If rework has cost, buyer needs to have paid (future: verify payment)
  // For now, accept and track
  await disputeQueries.acceptRework(id);

  // Set job to rework status
  await db.updateTable('jobs')
    .set({ status: 'rework', updated_at: sql`NOW()`, review_window_expires_at: null })
    .where('id', '=', id)
    .execute();

  // Notify agent
  emitWebhook(job.seller_verus_id, 'job.dispute.rework_accepted', { jobId: id });
  await notifyParticipant(job.seller_verus_id, 'Buyer accepted rework — please re-deliver', id);

  // Record as signed message
  await db.insertInto('job_messages').values({
    job_id: id,
    sender_verus_id: sessionVerusId,
    message: '[REWORK ACCEPTED] Buyer accepted rework terms.',
    signature,
    signed: true,
  }).execute();

  return reply.send({ status: 'ok', message: 'Rework accepted. Agent will re-deliver.' });
});
```

- [ ] **Step 2: Add GET /v1/jobs/:id/dispute**

```typescript
// GET /v1/jobs/:id/dispute — get dispute details
fastify.get<{ Params: { id: string } }>('/v1/jobs/:id/dispute', {
  config: { rateLimit: { max: 30, timeWindow: 60_000 } },
}, async (request, reply) => {
  const { id } = request.params;

  const sessionVerusId = await getSessionVerusId(request);
  if (!sessionVerusId) {
    return reply.code(401).send({ error: { code: 'UNAUTHORIZED' } });
  }

  const db = getDb();
  const job = await db.selectFrom('jobs').select(['buyer_verus_id', 'seller_verus_id']).where('id', '=', id).executeTakeFirst();
  if (!job) return reply.code(404).send({ error: { code: 'NOT_FOUND' } });

  // Only participants can view
  if (job.buyer_verus_id !== sessionVerusId && job.seller_verus_id !== sessionVerusId) {
    return reply.code(403).send({ error: { code: 'NOT_PARTICIPANT' } });
  }

  const dispute = await disputeQueries.getByJobId(id);
  if (!dispute) {
    return reply.code(404).send({ error: { code: 'NO_DISPUTE' } });
  }

  return reply.send({ dispute });
});
```

- [ ] **Step 3: Add GET /v1/agents/:verusId/dispute-metrics**

```typescript
// GET /v1/agents/:verusId/dispute-metrics — public dispute stats
fastify.get<{ Params: { verusId: string } }>('/v1/agents/:verusId/dispute-metrics', {
  config: { rateLimit: { max: 30, timeWindow: 60_000 } },
}, async (request, reply) => {
  const { verusId } = request.params;
  const metrics = await disputeQueries.getDisputeMetrics(verusId);
  if (!metrics) {
    return reply.send({ totalCompleted: 0, cleanJobs: 0, totalDisputes: 0, disputeRate: 0, refunded: 0, reworked: 0, rejected: 0 });
  }
  const total = Number(metrics.total_completed) || 0;
  const disputes = Number(metrics.total_disputes) || 0;
  return reply.send({
    totalCompleted: total,
    cleanJobs: Number(metrics.clean_jobs) || 0,
    totalDisputes: disputes,
    disputeRate: total > 0 ? Math.round((disputes / total) * 100) : 0,
    refunded: Number(metrics.refunded) || 0,
    reworked: Number(metrics.reworked) || 0,
    rejected: Number(metrics.rejected) || 0,
  });
});
```

- [ ] **Step 4: Commit**

```bash
git add src/api/routes/jobs.ts
git commit -m "feat: add rework-accept, dispute detail, and dispute metrics endpoints"
```

---

### Task 6: Add review window auto-complete worker

**Files:**
- Modify: `src/worker/index.ts` (insert after line 282)

- [ ] **Step 1: Add auto-complete function**

Add import at top:
```typescript
import { getDb } from '../db/index.js';
import { sql } from 'kysely';
```

Add after the trust snapshot scheduler (line 282):

```typescript
// Review window auto-complete: check every 60 seconds
setInterval(async () => {
  try {
    const db = getDb();
    const expired = await db
      .selectFrom('jobs')
      .select(['id', 'buyer_verus_id', 'seller_verus_id'])
      .where('status', '=', 'delivered')
      .where('review_window_expires_at', 'is not', null)
      .where('review_window_expires_at', '<', sql`NOW()`)
      .execute();

    for (const job of expired) {
      await db.updateTable('jobs')
        .set({
          status: 'completed',
          completed_at: sql`NOW()`,
          updated_at: sql`NOW()`,
          review_window_expires_at: null,
        })
        .where('id', '=', job.id)
        .where('status', '=', 'delivered')
        .execute();

      logger.info({ jobId: job.id }, 'Review window expired — auto-completed');

      // Notify both parties
      emitWebhook(job.buyer_verus_id, 'job.completed', { jobId: job.id, auto: true });
      emitWebhook(job.seller_verus_id, 'job.completed', { jobId: job.id, auto: true });
    }

    if (expired.length > 0) {
      logger.info({ count: expired.length }, 'Auto-completed expired review windows');
    }
  } catch (err) {
    logger.error({ err }, 'Review window auto-complete failed');
  }
}, 60_000);
```

- [ ] **Step 2: Commit**

```bash
git add src/worker/index.ts
git commit -m "feat: add review window auto-complete worker (60s interval)"
```

---

### Task 7: Add resolutionWindow VDXF key

**Files:**
- Modify: `src/validation/vdxf-keys.ts` (line ~38, in SERVICE_KEYS)

- [ ] **Step 1: Add key**

Add to SERVICE_KEYS object:
```typescript
resolutionWindow: 'iPutNewIAddressHere', // agentplatform::svc::resolutionwindow
```

Note: The actual i-address needs to be registered on-chain. For now use a placeholder — the SDK session will register the real VDXF key and provide the i-address.

- [ ] **Step 2: Add resolution_window to services schema**

In `src/db/schema.ts`, add to ServiceTable interface:
```typescript
resolution_window: number | null;
```

- [ ] **Step 3: Update indexer to parse resolutionWindow**

In `src/indexer/indexer.ts`, where service VDXF fields are parsed, add:
```typescript
if (key === SERVICE_KEYS.resolutionWindow) {
  serviceData.resolution_window = parseInt(value, 10) || null;
}
```

- [ ] **Step 4: Commit**

```bash
git add src/validation/vdxf-keys.ts src/db/schema.ts src/indexer/indexer.ts
git commit -m "feat: add resolutionWindow VDXF key and indexer parsing"
```

---

### Task 8: Update job status to allow new states + update complete endpoint

**Files:**
- Modify: `src/db/index.ts`
- Modify: `src/api/routes/jobs.ts`

- [ ] **Step 1: Update setCompleted to clear review window**

In `src/db/index.ts` around line 994, update the `setCompleted` method to also clear the review window:

```typescript
review_window_expires_at: null,
```

Add to the `.set()` object alongside the existing `status: 'completed'` update.

- [ ] **Step 2: Update deliver endpoint to handle re-delivery after rework**

In `src/api/routes/jobs.ts`, the deliver endpoint (line ~790) currently only allows delivery from `accepted` or `in_progress`. Add `rework` to the allowed statuses:

Find the status check and add `'rework'` to the list of valid statuses for delivery.

Also after re-delivery, resolve the rework dispute:

```typescript
if (previousStatus === 'rework') {
  await disputeQueries.resolveRework(id);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/db/index.ts src/api/routes/jobs.ts
git commit -m "feat: handle rework re-delivery and clear review window on completion"
```

---

## Chunk 3: Trust Score Integration

### Task 9: Add dispute metrics to trust aggregator

**Files:**
- Modify: `src/trust/aggregator.ts` (around line 53-89)

- [ ] **Step 1: Add dispute resolution data to aggregation**

In the job metrics query, add counts for resolved disputes:

```typescript
sql<number>`COUNT(*) FILTER (WHERE status = 'resolved')`.as('resolved_disputes'),
sql<number>`COUNT(*) FILTER (WHERE status = 'resolved_rejected')`.as('rejected_disputes'),
```

In the returned metrics object, include:
```typescript
resolvedDisputes: Number(row.resolved_disputes) || 0,
rejectedDisputes: Number(row.rejected_disputes) || 0,
```

- [ ] **Step 2: Factor dispute rate into trust calculation**

In `src/trust/calculator.ts`, add dispute rate as a negative signal in the completion sub-score. High dispute rates should lower the score. Agents who resolve disputes (accept refunds/rework) should be penalized less than those who reject everything.

- [ ] **Step 3: Commit**

```bash
git add src/trust/aggregator.ts src/trust/calculator.ts
git commit -m "feat: integrate dispute metrics into trust score calculation"
```

---

## Chunk 4: Dashboard UI

### Task 10: Build DisputeModal component

**Files:**
- Create: `src/components/DisputeModal.jsx` (in junction41-dashboard)

- [ ] **Step 1: Create the modal**

Component handles three states:
1. **Filing** (buyer) — reason input + sign
2. **Responding** (agent) — refund % slider, rework + cost input, or reject with statement
3. **Rework acceptance** (buyer) — shows rework terms, accept/decline

```jsx
import { useState } from 'react';
import { AlertTriangle, RefreshCw, X, DollarSign } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || '';

export default function DisputeModal({ job, dispute, role, onClose, onAction }) {
  // role: 'buyer' or 'seller'
  // dispute: null (filing) or existing dispute object
  const [reason, setReason] = useState('');
  const [response, setResponse] = useState('');
  const [action, setAction] = useState('refund');
  const [refundPercent, setRefundPercent] = useState(50);
  const [reworkCost, setReworkCost] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isFilingPhase = !dispute;
  const isRespondPhase = dispute?.action === 'pending' && role === 'seller';
  const isReworkAcceptPhase = dispute?.action === 'rework' && !dispute?.rework_accepted && role === 'buyer';

  async function handleFile() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/v1/jobs/${job.id}/dispute`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason, timestamp: Date.now(), signature: 'pending' }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || 'Failed to file dispute');
      }
      onAction?.('filed');
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRespond() {
    setLoading(true);
    setError('');
    try {
      const body = {
        action,
        message: response,
        timestamp: Date.now(),
        signature: 'pending',
      };
      if (action === 'refund') body.refundPercent = refundPercent;
      if (action === 'rework') body.reworkCost = reworkCost;

      const res = await fetch(`${API_BASE}/v1/jobs/${job.id}/dispute/respond`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || 'Failed to respond');
      }
      onAction?.('responded');
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleReworkAccept() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/v1/jobs/${job.id}/dispute/rework-accept`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timestamp: Date.now(), signature: 'pending' }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || 'Failed');
      }
      onAction?.('rework_accepted');
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <div className="w-full max-w-md rounded-xl p-6" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}>
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <AlertTriangle size={18} className="text-amber-400" />
            <h3 className="text-base font-bold text-white">
              {isFilingPhase ? 'File a Dispute' : isRespondPhase ? 'Respond to Dispute' : 'Rework Offer'}
            </h3>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X size={18} /></button>
        </div>

        {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

        {/* Filing phase — buyer */}
        {isFilingPhase && (
          <>
            <p className="text-sm text-gray-400 mb-3">Describe the issue with the delivered work.</p>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              className="w-full rounded-lg p-3 text-sm text-white resize-none"
              style={{ background: 'var(--bg-inset)', border: '1px solid var(--border-subtle)' }}
              rows={4}
              placeholder="What went wrong?"
              maxLength={2000}
            />
            <p className="text-xs text-gray-500 mt-1 text-right">{reason.length}/2000</p>
            <button
              onClick={handleFile}
              disabled={loading || reason.length < 10}
              className="w-full mt-4 py-2.5 rounded-lg text-sm font-semibold bg-amber-500 text-black disabled:opacity-50"
            >
              {loading ? 'Filing...' : 'File Dispute'}
            </button>
          </>
        )}

        {/* Respond phase — agent */}
        {isRespondPhase && (
          <>
            <div className="mb-4 p-3 rounded-lg" style={{ background: 'var(--bg-inset)' }}>
              <p className="text-xs text-gray-500 mb-1">Buyer says:</p>
              <p className="text-sm text-gray-300 italic">{dispute.reason}</p>
            </div>

            {/* Action selector */}
            <div className="flex gap-2 mb-4">
              {[
                { key: 'refund', label: 'Refund', icon: DollarSign },
                { key: 'rework', label: 'Rework', icon: RefreshCw },
                { key: 'rejected', label: 'Reject', icon: X },
              ].map(opt => (
                <button
                  key={opt.key}
                  onClick={() => setAction(opt.key)}
                  className={`flex-1 py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${
                    action === opt.key ? 'text-white' : 'text-gray-500'
                  }`}
                  style={{
                    background: action === opt.key ? 'rgba(255,255,255,0.1)' : 'transparent',
                    border: `1px solid ${action === opt.key ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.06)'}`,
                  }}
                >
                  <opt.icon size={14} /> {opt.label}
                </button>
              ))}
            </div>

            {/* Refund slider */}
            {action === 'refund' && (
              <div className="mb-4">
                <label className="text-xs text-gray-400 mb-1 block">Refund: {refundPercent}%</label>
                <input
                  type="range" min={10} max={100} step={5}
                  value={refundPercent}
                  onChange={e => setRefundPercent(Number(e.target.value))}
                  className="w-full accent-emerald-400"
                />
                {job.price && (
                  <p className="text-xs text-emerald-400 mt-1">
                    {((job.price * refundPercent) / 100).toFixed(4)} VRSC back to buyer
                  </p>
                )}
              </div>
            )}

            {/* Rework cost */}
            {action === 'rework' && (
              <div className="mb-4">
                <label className="text-xs text-gray-400 mb-1 block">Additional cost (0 = free rework)</label>
                <input
                  type="number" min={0} step={0.001}
                  value={reworkCost}
                  onChange={e => setReworkCost(Number(e.target.value))}
                  className="w-full rounded-lg p-2 text-sm text-white"
                  style={{ background: 'var(--bg-inset)', border: '1px solid var(--border-subtle)' }}
                />
              </div>
            )}

            <textarea
              value={response}
              onChange={e => setResponse(e.target.value)}
              className="w-full rounded-lg p-3 text-sm text-white resize-none"
              style={{ background: 'var(--bg-inset)', border: '1px solid var(--border-subtle)' }}
              rows={3}
              placeholder={action === 'rejected' ? 'Explain your side...' : 'Add a note (optional)'}
              maxLength={2000}
            />
            <button
              onClick={handleRespond}
              disabled={loading || response.length < 1}
              className={`w-full mt-4 py-2.5 rounded-lg text-sm font-semibold text-black disabled:opacity-50 ${
                action === 'rejected' ? 'bg-red-500' : action === 'refund' ? 'bg-emerald-400' : 'bg-amber-400'
              }`}
            >
              {loading ? 'Submitting...' : action === 'refund' ? `Refund ${refundPercent}%` : action === 'rework' ? 'Offer Rework' : 'Reject Dispute'}
            </button>
          </>
        )}

        {/* Rework acceptance — buyer */}
        {isReworkAcceptPhase && (
          <>
            <div className="mb-4 p-3 rounded-lg" style={{ background: 'var(--bg-inset)' }}>
              <p className="text-xs text-gray-500 mb-1">Agent offered to rework:</p>
              <p className="text-sm text-gray-300">{dispute.response}</p>
              {dispute.rework_cost > 0 && (
                <p className="text-sm text-amber-400 mt-2 font-medium">
                  Additional cost: +{dispute.rework_cost} VRSC
                </p>
              )}
              {(!dispute.rework_cost || dispute.rework_cost === 0) && (
                <p className="text-sm text-emerald-400 mt-2 font-medium">Free rework</p>
              )}
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleReworkAccept}
                disabled={loading}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-emerald-400 text-black disabled:opacity-50"
              >
                {loading ? 'Accepting...' : 'Accept Rework'}
              </button>
              <button
                onClick={onClose}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium text-gray-400"
                style={{ border: '1px solid rgba(255,255,255,0.1)' }}
              >
                Decline
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/DisputeModal.jsx
git commit -m "feat: add DisputeModal component (file, respond, rework accept)"
```

---

### Task 11: Update JobActions with review window + dispute UI

**Files:**
- Modify: `src/components/JobActions.jsx` (lines 461-466)

- [ ] **Step 1: Add review window countdown**

Import at top:
```jsx
import { useState, useEffect } from 'react';
import DisputeModal from './DisputeModal';
```

Add countdown timer when job is `delivered` and `review_window_expires_at` is set. Show time remaining. Show "Accept Delivery" and "Dispute" buttons.

When job is `disputed`, show DisputeModal for the appropriate role (buyer or seller).

- [ ] **Step 2: Wire dispute modal triggers**

Replace the existing simple dispute button (lines 461-466) with the full dispute flow:
- `delivered` + buyer → show countdown + "Accept" + "Dispute" buttons
- `disputed` + pending + seller → show "Respond" button → opens DisputeModal in respond mode
- `disputed` + rework offered + buyer → show "Rework Offer" → opens DisputeModal in rework-accept mode

- [ ] **Step 3: Commit**

```bash
git add src/components/JobActions.jsx
git commit -m "feat: add review window countdown and dispute modal integration"
```

---

### Task 12: Create DisputeMetrics component for agent profiles

**Files:**
- Create: `src/components/DisputeMetrics.jsx`

- [ ] **Step 1: Create the component**

```jsx
import { useState, useEffect } from 'react';
import { ShieldCheck, AlertTriangle } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || '';

export default function DisputeMetrics({ verusId }) {
  const [metrics, setMetrics] = useState(null);

  useEffect(() => {
    if (!verusId) return;
    fetch(`${API_BASE}/v1/agents/${encodeURIComponent(verusId)}/dispute-metrics`)
      .then(r => r.ok ? r.json() : null)
      .then(setMetrics)
      .catch(() => {});
  }, [verusId]);

  if (!metrics || metrics.totalCompleted === 0) return null;

  return (
    <div className="rounded-xl p-5" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
      <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
        <ShieldCheck size={16} className="text-emerald-400" />
        Track Record
      </h3>
      <div className="grid grid-cols-3 gap-4 text-center">
        <div>
          <div className="text-2xl font-bold text-emerald-400">{metrics.cleanJobs}</div>
          <div className="text-xs text-gray-500 mt-1">Clean Jobs</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-white">{metrics.totalCompleted}</div>
          <div className="text-xs text-gray-500 mt-1">Total Completed</div>
        </div>
        <div>
          <div className={`text-2xl font-bold ${metrics.totalDisputes > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
            {metrics.disputeRate}%
          </div>
          <div className="text-xs text-gray-500 mt-1">Dispute Rate</div>
        </div>
      </div>
      {metrics.totalDisputes > 0 && (
        <div className="mt-4 pt-3 flex gap-4 text-xs text-gray-500" style={{ borderTop: '1px solid var(--border-subtle)' }}>
          <span>Refunded: {metrics.refunded}</span>
          <span>Reworked: {metrics.reworked}</span>
          <span>Rejected: {metrics.rejected}</span>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add to agent profile page**

Import and render `<DisputeMetrics verusId={agent.verus_id} />` on the agent's public profile page, near the trust score section.

- [ ] **Step 3: Commit**

```bash
git add src/components/DisputeMetrics.jsx src/pages/AgentProfilePage.jsx
git commit -m "feat: add dispute metrics component to agent profiles"
```

---

## Chunk 5: Build, Deploy, and Write SDK Handoff Doc

### Task 13: Build and verify

- [ ] **Step 1: Build backend**

```bash
cd /home/bigbox/code/junction41
sudo docker compose up -d --build
```

- [ ] **Step 2: Run migration**

```bash
sudo docker exec j41-backend node dist/db/migrate.js
```

- [ ] **Step 3: Verify disputes table**

```bash
sudo docker exec j41-db psql -U j41 -d junction41 -c "\d disputes"
```

- [ ] **Step 4: Build dashboard**

```bash
cd /home/bigbox/code/junction41-dashboard
sudo docker compose up -d --build
```

- [ ] **Step 5: Verify endpoints respond**

```bash
# Should return 401 (not 404) — endpoint exists
curl -s http://localhost:3000/v1/agents/test/dispute-metrics | head
```

---

### Task 14: Write SDK handoff document

- [ ] **Step 1: Create handoff doc**

Write to `docs/sdk-dispute-handoff.md` with everything the SDK Claude session needs:

1. **New VDXF key:** `resolutionWindow` — register on-chain, provide i-address back
2. **Container lifecycle change:** Don't kill on delivery. Wait for:
   - `job.completed` webhook (buyer accepted or auto-complete)
   - `job.dispute.resolved` webhook (dispute closed)
   - Kill only after one of these
3. **New SDK methods:**
   - `respondToDispute(jobId, { action, refundPercent?, reworkCost?, message, signature })`
   - `acceptRework(jobId, { signature })` (buyer-side)
4. **Refund execution:** `sendcurrency` for refund percent of job price
5. **New webhook events:**
   - `job.dispute.filed` — buyer filed dispute
   - `job.dispute.responded` — agent responded
   - `job.dispute.resolved` — dispute closed (refund/rework/reject)
   - `job.dispute.rework_accepted` — buyer accepted rework
6. **New agent handler hooks:**
   - `onDisputeFiled(job, reason)` — agent notified of dispute
   - `onReworkRequested(job, cost)` — agent told to rework
7. **Signature formats:**
   - Dispute respond: `J41-DISPUTE-RESPOND|Job:${jobHash}|Action:${action}|Ts:${timestamp}`
   - Rework accept: `J41-REWORK-ACCEPT|Job:${jobHash}|Ts:${timestamp}`
8. **Service registration:** Add `resolutionWindow` field (integer, minutes) to service VDXF data

- [ ] **Step 2: Commit everything**

```bash
git add docs/sdk-dispute-handoff.md
git commit -m "docs: SDK handoff for dispute resolution"
```
