# Mid-Session Budget Requests — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let buyers and agents request additional budget mid-session via inline chat action cards with combined sendcurrency payment.

**Architecture:** New `budget_requests` table + 3 REST endpoints + 4 WebSocket events + chat UI action cards. Reuses existing `job_extensions` + `extension-invoice` infrastructure for payment. New VDXF key `agent.markup` for profile transparency.

**Tech Stack:** Kysely (migrations/queries), Fastify (endpoints), Socket.IO (events), React (chat cards), verus-typescript-primitives (VDXF).

**Spec:** `docs/superpowers/specs/2026-03-25-mid-session-budget-requests.md`

**Repos:** junction41 (backend), junction41-dashboard (frontend), j41-sovagent-sdk (SDK)

---

## Task 1: VDXF Key Registration — agent.markup

**Prerequisite:** Testnet daemon must be running.

- [ ] **Step 1: Get the VDXF key i-address**

```bash
sudo docker exec verusd-testnet /opt/verus/verus -testnet getvdxfid "agentplatform::agent.markup"
```

Record the `vdxfid` (i-address) from the output.

- [ ] **Step 2: Add to vdxf-keys.ts**

**File:** `/home/bigbox/code/junction41/src/validation/vdxf-keys.ts`

Add after the `models` entry (line 23):

```typescript
'markup': '<i-address-from-step-1>',
```

- [ ] **Step 3: Update VDXF-SCHEMA.md**

**File:** `/home/bigbox/code/junction41/docs/VDXF-SCHEMA.md`

Add `agent.markup` entry with i-address and format description (single number, 1-50x multiplier).

- [ ] **Step 4: Commit**

```bash
cd /home/bigbox/code/junction41
git add src/validation/vdxf-keys.ts docs/VDXF-SCHEMA.md
git commit -m "feat: register agent.markup VDXF key (#20)"
```

---

## Task 2: Migration 021 — budget_requests table + agents.markup column

**Files:**
- Create: `/home/bigbox/code/junction41/src/db/migrations/021_budget_requests.ts`

- [ ] **Step 1: Create migration**

```typescript
import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // budget_requests table
  await db.schema
    .createTable('budget_requests')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('job_id', 'text', (col) => col.notNull().references('jobs.id'))
    .addColumn('requester', 'text', (col) => col.notNull())
    .addColumn('requester_verus_id', 'text', (col) => col.notNull())
    .addColumn('amount', 'numeric')
    .addColumn('currency', 'text', (col) => col.notNull().defaultTo('VRSCTEST'))
    .addColumn('reason', 'text')
    .addColumn('breakdown', 'text')
    .addColumn('status', 'text', (col) => col.notNull().defaultTo('pending'))
    .addColumn('extension_id', 'text')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`NOW()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`NOW()`))
    .execute();

  await sql`CREATE INDEX idx_budget_req_job ON budget_requests (job_id)`.execute(db);
  await sql`CREATE UNIQUE INDEX idx_budget_req_pending ON budget_requests (job_id) WHERE status = 'pending'`.execute(db);

  // agents.markup column
  await db.schema
    .alterTable('agents')
    .addColumn('markup', 'numeric')
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('budget_requests').ifExists().execute();
  await db.schema.alterTable('agents').dropColumn('markup').execute();
}
```

- [ ] **Step 2: Commit**

```bash
git add src/db/migrations/021_budget_requests.ts
git commit -m "feat: migration 021 — budget_requests table + agents.markup"
```

---

## Task 3: Schema — BudgetRequestTable + markup column

**Files:**
- Modify: `/home/bigbox/code/junction41/src/db/schema.ts`

- [ ] **Step 1: Add BudgetRequestTable interface**

Insert after the `LoginConsentChallengeTable` interface (before the services section):

```typescript
// ─── budget_requests ────────────────────────────────────────────────────────

export interface BudgetRequestTable {
  id: string;
  job_id: string;
  requester: string;
  requester_verus_id: string;
  amount: number | null;
  currency: Generated<string>;
  reason: string | null;
  breakdown: string | null;
  status: Generated<string>;
  extension_id: string | null;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}
```

- [ ] **Step 2: Add markup to AgentTable**

After `models: Generated<string | null>;` (line 41), add:

```typescript
markup: Generated<number | null>;
```

- [ ] **Step 3: Register in Database interface**

After `login_consent_challenges: LoginConsentChallengeTable;` add:

```typescript
budget_requests: BudgetRequestTable;
```

- [ ] **Step 4: Commit**

```bash
git add src/db/schema.ts
git commit -m "feat: BudgetRequestTable schema + agents.markup column"
```

---

## Task 4: Backend — 3 budget request endpoints

**Files:**
- Modify: `/home/bigbox/code/junction41/src/api/routes/jobs.ts`

This is the largest task. Add three endpoints after the existing extension endpoints (~line 2970).

- [ ] **Step 1: Add POST /v1/jobs/:id/budget-request**

Insert after the extension reject endpoint. Validation: `amount` required (v1), must be party to job, job must be `in_progress` or `paused`, one pending per job.

```typescript
// ── POST /v1/jobs/:id/budget-request ─────────────────────────────
fastify.post('/v1/jobs/:id/budget-request', {
  preHandler: requireAuth,
  config: { rateLimit: { max: 10, timeWindow: 60_000 } },
}, async (request, reply) => {
  const session = (request as any).session as { verusId: string; identityName: string | null };
  const { id } = request.params as { id: string };

  const bodySchema = z.object({
    amount: z.coerce.number().min(0).max(1000000),
    currency: z.string().max(20).optional(),
    reason: z.string().max(2000).optional(),
    breakdown: z.string().max(2000).optional(),
  });

  const parsed = bodySchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message || 'Invalid body' } });
  }

  const job = await jobQueries.getById(id);
  if (!job) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Job not found' } });

  const isBuyer = job.buyer_verus_id === session.verusId;
  const isSeller = job.seller_verus_id === session.verusId;
  if (!isBuyer && !isSeller) {
    return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Not a party to this job' } });
  }

  if (!['in_progress', 'paused'].includes(job.status)) {
    return reply.code(400).send({ error: { code: 'INVALID_STATUS', message: 'Job must be in_progress or paused' } });
  }

  const db = getDb();
  const reqId = (await import('crypto')).randomBytes(16).toString('hex');
  try {
    await db.insertInto('budget_requests')
      .values({
        id: reqId,
        job_id: id,
        requester: isBuyer ? 'buyer' : 'agent',
        requester_verus_id: session.verusId,
        amount: parsed.data.amount,
        currency: parsed.data.currency || job.currency,
        reason: parsed.data.reason || null,
        breakdown: parsed.data.breakdown || null,
      })
      .execute();
  } catch (err: any) {
    // Unique index violation = already has pending request
    if (err.code === '23505' || err.message?.includes('unique')) {
      return reply.code(409).send({ error: { code: 'ALREADY_PENDING', message: 'A budget request is already pending for this job' } });
    }
    throw err;
  }

  // Notify the other party
  const recipientVerusId = isBuyer ? job.seller_verus_id : job.buyer_verus_id;
  const io = getIO();
  io.to(`job:${id}`).emit('budget_request', {
    id: reqId,
    requester: isBuyer ? 'buyer' : 'agent',
    amount: parsed.data.amount,
    currency: parsed.data.currency || job.currency,
    reason: parsed.data.reason,
    breakdown: parsed.data.breakdown,
  });

  await createNotification({
    recipientVerusId,
    type: 'budget.request',
    title: `Budget request: ${parsed.data.amount} ${parsed.data.currency || job.currency}`,
    body: parsed.data.reason || 'Additional budget requested',
    jobId: id,
  });

  return { data: { id: reqId, amount: parsed.data.amount, status: 'pending' } };
});
```

- [ ] **Step 2: Add POST /v1/jobs/:id/budget-request/:reqId/approve**

Atomic claim, creates extension, returns sendcurrency invoice.

```typescript
// ── POST /v1/jobs/:id/budget-request/:reqId/approve ──────────────
fastify.post('/v1/jobs/:id/budget-request/:reqId/approve', {
  preHandler: requireAuth,
  config: { rateLimit: { max: 10, timeWindow: 60_000 } },
}, async (request, reply) => {
  const session = (request as any).session as { verusId: string; identityName: string | null };
  const { id, reqId } = request.params as { id: string; reqId: string };

  const job = await jobQueries.getById(id);
  if (!job) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Job not found' } });

  if (!['in_progress', 'paused'].includes(job.status)) {
    return reply.code(400).send({ error: { code: 'INVALID_STATUS', message: 'Job is no longer active' } });
  }

  // Must be the OTHER party
  const isBuyer = job.buyer_verus_id === session.verusId;
  const isSeller = job.seller_verus_id === session.verusId;
  if (!isBuyer && !isSeller) {
    return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Not a party to this job' } });
  }

  const db = getDb();

  // Atomic claim — prevents double-approve
  const budgetReq = await db.updateTable('budget_requests')
    .set({ status: 'approved', updated_at: sql`NOW()` })
    .where('id', '=', reqId)
    .where('job_id', '=', id)
    .where('status', '=', 'pending')
    .returning(['amount', 'currency', 'requester_verus_id', 'requester'])
    .executeTakeFirst();

  if (!budgetReq) {
    return reply.code(400).send({ error: { code: 'NOT_FOUND', message: 'Request not found, expired, or already handled' } });
  }

  // Verify approver is not the requester
  if (budgetReq.requester_verus_id === session.verusId) {
    // Roll back
    await db.updateTable('budget_requests').set({ status: 'pending', updated_at: sql`NOW()` }).where('id', '=', reqId).execute();
    return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Cannot approve your own request' } });
  }

  const amount = Number(budgetReq.amount) || 0;

  // Free request — auto-complete, no extension needed
  if (amount === 0) {
    const io = getIO();
    io.to(`job:${id}`).emit('budget_approved', { id: reqId, amount: 0 });
    return { data: { id: reqId, status: 'approved', amount: 0, free: true } };
  }

  // Create extension (reuse existing infrastructure)
  const extId = (await import('crypto')).randomBytes(16).toString('hex');
  await db.insertInto('job_extensions')
    .values({
      id: extId,
      job_id: id,
      requested_by: budgetReq.requester_verus_id,
      amount,
      reason: 'Budget request approved',
      status: job.status === 'paused' ? 'approved' : 'approved',
      created_at: sql`NOW()`,
      updated_at: sql`NOW()`,
    })
    .execute();

  // Link extension to budget request
  await db.updateTable('budget_requests')
    .set({ extension_id: extId })
    .where('id', '=', reqId)
    .execute();

  // Generate combined sendcurrency invoice (reuse extension-invoice logic)
  const PLATFORM_FEE_RATE = 0.05;
  const fee = Math.round(amount * PLATFORM_FEE_RATE * 100000000) / 100000000;
  const platformAddress = process.env.PLATFORM_FEE_ADDRESS || 'agentplatform@';
  const agentAddress = job.payment_address || job.seller_verus_id;

  const sendParams = [
    { address: agentAddress, amount },
    { address: platformAddress, amount: fee },
  ];
  const cliCommand = `sendcurrency "${job.buyer_verus_id}" '[${sendParams.map(p => JSON.stringify(p)).join(',')}]'`;

  // Notify requester
  const io = getIO();
  io.to(`job:${id}`).emit('budget_approved', { id: reqId, amount, extensionId: extId });

  return {
    data: {
      id: reqId,
      status: 'approved',
      extensionId: extId,
      amount,
      fee,
      total: amount + fee,
      currency: budgetReq.currency,
      sendParams,
      cliCommand,
    },
  };
});
```

- [ ] **Step 3: Add POST /v1/jobs/:id/budget-request/:reqId/decline**

```typescript
// ── POST /v1/jobs/:id/budget-request/:reqId/decline ──────────────
fastify.post('/v1/jobs/:id/budget-request/:reqId/decline', {
  preHandler: requireAuth,
  config: { rateLimit: { max: 10, timeWindow: 60_000 } },
}, async (request, reply) => {
  const session = (request as any).session as { verusId: string; identityName: string | null };
  const { id, reqId } = request.params as { id: string; reqId: string };

  const job = await jobQueries.getById(id);
  if (!job) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Job not found' } });

  const isBuyer = job.buyer_verus_id === session.verusId;
  const isSeller = job.seller_verus_id === session.verusId;
  if (!isBuyer && !isSeller) {
    return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Not a party to this job' } });
  }

  const db = getDb();
  const result = await db.updateTable('budget_requests')
    .set({ status: 'declined', updated_at: sql`NOW()` })
    .where('id', '=', reqId)
    .where('job_id', '=', id)
    .where('status', '=', 'pending')
    .executeTakeFirst();

  if (Number(result.numUpdatedRows) === 0) {
    return reply.code(400).send({ error: { code: 'NOT_FOUND', message: 'Request not found or already handled' } });
  }

  // Notify requester
  const io = getIO();
  io.to(`job:${id}`).emit('budget_declined', { id: reqId });

  // Get requester to send notification
  const budgetReq = await db.selectFrom('budget_requests').select(['requester_verus_id']).where('id', '=', reqId).executeTakeFirst();
  if (budgetReq) {
    await createNotification({
      recipientVerusId: budgetReq.requester_verus_id,
      type: 'budget.declined',
      title: 'Budget request declined',
      body: 'Your budget request was declined.',
      jobId: id,
    });
  }

  return { data: { id: reqId, status: 'declined' } };
});
```

- [ ] **Step 4: Add import for getIO**

Verify `getIO` is already imported in jobs.ts. If not, add:

```typescript
import { getIO } from '../../chat/ws-server.js';
```

- [ ] **Step 5: Build and verify**

```bash
cd /home/bigbox/code/junction41
sudo docker compose build api
```

- [ ] **Step 6: Commit**

```bash
git add src/api/routes/jobs.ts
git commit -m "feat: budget request endpoints (create, approve, decline)"
```

---

## Task 5: Worker — 24h budget request expiry

**Files:**
- Modify: `/home/bigbox/code/junction41/src/worker/index.ts`

- [ ] **Step 1: Add expiry task**

Insert after the workspace operations archive section (~line 432):

```typescript
// ── 19b. Budget requests: auto-decline stale pending requests (>24h) ─
try {
  const expiredResult = await getDb().updateTable('budget_requests')
    .set({ status: 'declined', updated_at: sql`NOW()` })
    .where('status', '=', 'pending')
    .where(sql`created_at < NOW() - interval '24 hours'` as any)
    .executeTakeFirst();
  const expiredCount = Number((expiredResult as any)?.numUpdatedRows || 0);
  if (expiredCount > 0) {
    logger.info({ count: expiredCount }, 'Auto-declined expired budget requests');
  }
} catch (err) {
  logger.error({ err }, 'Budget request expiry failed');
}
```

- [ ] **Step 2: Commit**

```bash
git add src/worker/index.ts
git commit -m "feat: auto-decline stale budget requests after 24h"
```

---

## Task 6: Indexer — parse agent.markup from VDXF

**Files:**
- Modify: `/home/bigbox/code/junction41/src/indexer/indexer.ts`

- [ ] **Step 1: Add markup parsing**

After the `modelsJson` parsing (~line 302), add:

```typescript
const markupRaw = (data as any).markup;
const markup = markupRaw ? Math.max(1, Math.min(50, parseFloat(markupRaw) || 1)) : null;
```

- [ ] **Step 2: Add markup to agent update and insert**

In the `updateTable('agents')` call, add `markup` alongside `models`. Same for the `insertInto('agents')` path.

- [ ] **Step 3: Commit**

```bash
git add src/indexer/indexer.ts
git commit -m "feat: parse agent.markup from VDXF contentmultimap"
```

---

## Task 7: Backend deploy + verify

- [ ] **Step 1: Build and deploy**

```bash
cd /home/bigbox/code/junction41
sudo docker compose up -d --build
```

Migration 021 runs automatically on startup.

- [ ] **Step 2: Verify endpoints**

```bash
# Test budget request creation (should fail — no active job)
sudo docker exec junction41 node -e "fetch('http://localhost:3000/v1/jobs/fake/budget-request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({amount:50})}).then(r=>r.json()).then(d=>console.log(JSON.stringify(d)))"
```

- [ ] **Step 3: Commit any fixes**

---

## Task 8: Dashboard — Budget request action cards in Chat

**Files:**
- Modify: `/home/bigbox/code/junction41-dashboard/src/components/Chat.jsx`

- [ ] **Step 1: Add budget request state**

After existing state declarations (~line 144), add:

```javascript
const [budgetRequests, setBudgetRequests] = useState([]);
const [budgetPayment, setBudgetPayment] = useState(null); // { reqId, sendParams, cliCommand, amount, fee, total, currency }
const [budgetTxid, setBudgetTxid] = useState('');
const [addBudgetOpen, setAddBudgetOpen] = useState(false);
const [addBudgetAmount, setAddBudgetAmount] = useState('');
const [addBudgetReason, setAddBudgetReason] = useState('');
```

- [ ] **Step 2: Add WebSocket listeners for budget events**

Inside the socket connection handler (after existing event listeners ~line 316), add:

```javascript
socket.on('budget_request', (data) => {
  // Only show to the OTHER party (not the requester)
  if (data.requester === (isBuyer ? 'buyer' : 'agent')) return;
  setBudgetRequests(prev => [...prev, { ...data, status: 'pending' }]);
});

socket.on('budget_approved', (data) => {
  setBudgetRequests(prev =>
    prev.map(r => r.id === data.id ? { ...r, status: 'approved' } : r)
  );
});

socket.on('budget_declined', (data) => {
  setBudgetRequests(prev =>
    prev.map(r => r.id === data.id ? { ...r, status: 'declined' } : r)
  );
});

socket.on('budget_added', (data) => {
  // Buyer added budget directly — show as system message
  setMessages(prev => [...prev, {
    id: `budget-${Date.now()}`,
    senderVerusId: 'system',
    content: `Budget increased by ${data.amount} ${data.currency}`,
    createdAt: new Date().toISOString(),
    system: true,
  }]);
});
```

- [ ] **Step 3: Add budget action card rendering**

After the held messages section (before `<div ref={messagesEndRef} />`), add budget request cards:

```jsx
{budgetRequests.map(req => (
  <div key={req.id} style={{
    padding: '10px 12px', margin: '4px 0', borderRadius: 4,
    border: `1px solid ${req.status === 'pending' ? '#1a1a2e' : req.status === 'approved' ? 'rgba(52,211,153,0.3)' : 'rgba(239,68,68,0.3)'}`,
    background: req.status === 'pending' ? '#0f0f14' : 'transparent',
    fontFamily: 'inherit',
  }}>
    {req.status === 'pending' && (
      <>
        <div style={{ fontSize: 11, color: '#818cf8', fontWeight: 600, marginBottom: 6 }}>
          budget request
        </div>
        <div style={{ fontSize: 13, color: '#d1d5db', marginBottom: 4 }}>
          {req.requester === 'agent' ? 'Agent' : 'Buyer'} requests {req.amount} {req.currency || 'VRSCTEST'}
        </div>
        {req.reason && (
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>{req.reason}</div>
        )}
        {req.breakdown && (
          <div style={{ fontSize: 11, color: '#4b5563', marginBottom: 8, fontStyle: 'italic' }}>{req.breakdown}</div>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={async () => {
              try {
                const res = await apiFetch(`/v1/jobs/${jobId}/budget-request/${req.id}/approve`, { method: 'POST' });
                const data = await res.json();
                if (res.ok && data.data) {
                  setBudgetRequests(prev => prev.map(r => r.id === req.id ? { ...r, status: 'approved' } : r));
                  if (data.data.free) return;
                  setBudgetPayment({
                    reqId: req.id,
                    ...data.data,
                  });
                }
              } catch {}
            }}
            style={{
              padding: '4px 12px', fontSize: 11, fontFamily: 'inherit', cursor: 'pointer',
              background: 'rgba(52,211,153,0.1)', color: '#34d399', border: '1px solid rgba(52,211,153,0.3)',
              borderRadius: 3,
            }}
          >approve</button>
          <button
            onClick={async () => {
              try {
                await apiFetch(`/v1/jobs/${jobId}/budget-request/${req.id}/decline`, { method: 'POST' });
                setBudgetRequests(prev => prev.map(r => r.id === req.id ? { ...r, status: 'declined' } : r));
              } catch {}
            }}
            style={{
              padding: '4px 12px', fontSize: 11, fontFamily: 'inherit', cursor: 'pointer',
              background: 'rgba(239,68,68,0.06)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 3,
            }}
          >decline</button>
        </div>
      </>
    )}
    {req.status === 'approved' && (
      <div style={{ fontSize: 11, color: '#34d399' }}>
        -- budget approved -- {req.amount} {req.currency || 'VRSCTEST'} --
      </div>
    )}
    {req.status === 'declined' && (
      <div style={{ fontSize: 11, color: '#ef4444' }}>
        -- budget declined -- agent notified --
      </div>
    )}
  </div>
))}
```

- [ ] **Step 4: Add payment card for approved budget requests**

After the budget request cards, add payment card (shown when `budgetPayment` is set):

```jsx
{budgetPayment && (
  <div style={{
    padding: '10px 12px', margin: '4px 0', borderRadius: 4,
    border: '1px solid #1a1a2e', background: '#0f0f14', fontFamily: 'inherit',
  }}>
    <div style={{ fontSize: 11, color: '#818cf8', fontWeight: 600, marginBottom: 6 }}>payment</div>
    <div style={{ fontSize: 12, color: '#d1d5db', marginBottom: 8 }}>
      Send {budgetPayment.total} {budgetPayment.currency} ({budgetPayment.amount} + {budgetPayment.fee} fee)
    </div>
    <div style={{ position: 'relative', marginBottom: 8 }}>
      <pre style={{
        background: '#0a0a0a', padding: '8px 10px', borderRadius: 3,
        fontSize: 11, color: '#34d399', overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
        border: '1px solid #1a1a2e',
      }}>
        {budgetPayment.cliCommand}
      </pre>
      <SignCopyButtons command={budgetPayment.cliCommand} className="absolute top-1 right-1" />
    </div>
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <input
        type="text"
        value={budgetTxid}
        onChange={e => setBudgetTxid(e.target.value)}
        placeholder="Transaction ID"
        style={{
          flex: 1, background: 'transparent', border: '1px solid #1a1a2e',
          borderRadius: 3, padding: '6px 8px', color: '#d1d5db',
          fontSize: 12, fontFamily: 'inherit', outline: 'none',
        }}
      />
      <button
        onClick={async () => {
          if (!budgetTxid.trim()) return;
          try {
            const res = await apiFetch(`/v1/jobs/${jobId}/extensions/${budgetPayment.extensionId}/payment`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ agentTxid: budgetTxid.trim(), feeTxid: budgetTxid.trim() }),
            });
            if (res.ok) {
              setBudgetPayment(null);
              setBudgetTxid('');
              onJobStatusChanged?.();
            }
          } catch {}
        }}
        disabled={!budgetTxid.trim()}
        style={{
          padding: '6px 12px', fontSize: 11, fontFamily: 'inherit', cursor: 'pointer',
          background: budgetTxid.trim() ? 'rgba(52,211,153,0.1)' : 'transparent',
          color: budgetTxid.trim() ? '#34d399' : '#374151',
          border: '1px solid rgba(52,211,153,0.3)', borderRadius: 3,
        }}
      >submit</button>
    </div>
  </div>
)}
```

- [ ] **Step 5: Add [+ budget] button in input bar**

In the input form, add a budget button before the attach button:

```jsx
<button
  type="button"
  onClick={() => setAddBudgetOpen(!addBudgetOpen)}
  disabled={inputDisabled}
  title="Add budget"
  style={{
    background: 'none', border: 'none', cursor: inputDisabled ? 'default' : 'pointer',
    padding: '8px 6px 8px 14px', color: addBudgetOpen ? '#34d399' : '#4b5563',
    opacity: inputDisabled ? 0.3 : 0.7, fontSize: 12, fontFamily: 'inherit',
    flexShrink: 0,
  }}
>$</button>
```

And above the input form, add the inline budget form:

```jsx
{addBudgetOpen && (
  <div style={{
    padding: '8px 14px', borderTop: '1px solid #1a1a2e', background: '#0f0f14',
    display: 'flex', gap: 8, alignItems: 'center', fontFamily: 'inherit',
  }}>
    <span style={{ color: '#4b5563', fontSize: 11 }}>add budget:</span>
    <input
      type="number"
      value={addBudgetAmount}
      onChange={e => setAddBudgetAmount(e.target.value)}
      placeholder="amount"
      style={{
        width: 80, background: 'transparent', border: '1px solid #1a1a2e',
        borderRadius: 3, padding: '4px 6px', color: '#d1d5db',
        fontSize: 12, fontFamily: 'inherit', outline: 'none',
      }}
    />
    <input
      type="text"
      value={addBudgetReason}
      onChange={e => setAddBudgetReason(e.target.value)}
      placeholder="reason (optional)"
      style={{
        flex: 1, background: 'transparent', border: '1px solid #1a1a2e',
        borderRadius: 3, padding: '4px 6px', color: '#d1d5db',
        fontSize: 12, fontFamily: 'inherit', outline: 'none',
      }}
    />
    <button
      onClick={async () => {
        if (!addBudgetAmount || Number(addBudgetAmount) <= 0) return;
        try {
          await apiFetch(`/v1/jobs/${jobId}/extensions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount: Number(addBudgetAmount), reason: addBudgetReason || 'Buyer added budget' }),
          });
          setAddBudgetOpen(false);
          setAddBudgetAmount('');
          setAddBudgetReason('');
          onJobStatusChanged?.();
        } catch {}
      }}
      disabled={!addBudgetAmount || Number(addBudgetAmount) <= 0}
      style={{
        padding: '4px 10px', fontSize: 11, fontFamily: 'inherit', cursor: 'pointer',
        background: 'rgba(52,211,153,0.1)', color: '#34d399',
        border: '1px solid rgba(52,211,153,0.3)', borderRadius: 3,
      }}
    >send</button>
    <button
      onClick={() => { setAddBudgetOpen(false); setAddBudgetAmount(''); setAddBudgetReason(''); }}
      style={{
        background: 'none', border: 'none', color: '#4b5563', cursor: 'pointer',
        fontSize: 11, fontFamily: 'inherit',
      }}
    >[x]</button>
  </div>
)}
```

- [ ] **Step 6: Build and deploy dashboard**

```bash
cd /home/bigbox/code/junction41-dashboard
sudo docker compose up -d --build
```

- [ ] **Step 7: Commit**

```bash
git add src/components/Chat.jsx
git commit -m "feat: budget request action cards + [+ budget] button in chat"
```

---

## Task 9: Dashboard — Show markup on marketplace tiles + profile

**Files:**
- Modify: `/home/bigbox/code/junction41-dashboard/src/components/marketplace/MarketplaceCard.jsx`
- Modify: `/home/bigbox/code/junction41-dashboard/src/pages/AgentDetailPage.jsx`

- [ ] **Step 1: Add markup badge to MarketplaceCard**

Near the model badges, add a markup indicator when the agent has a markup > 1:

```jsx
{service.agent_markup && service.agent_markup > 1 && (
  <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(251,191,36,0.1)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.2)' }}>
    {service.agent_markup}x
  </span>
)}
```

- [ ] **Step 2: Add markup to AgentDetailPage**

In the agent profile section, after protocol badges:

```jsx
{agent.markup && agent.markup > 1 && (
  <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(251,191,36,0.1)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.2)' }}>
    {agent.markup}x markup
  </span>
)}
```

- [ ] **Step 3: Add agent_markup to service query**

**File:** `/home/bigbox/code/junction41/src/db/index.ts`

In the service query JOIN that already includes `a.models as agent_models`, add:

```typescript
a.markup as agent_markup,
```

- [ ] **Step 4: Update ServiceRow type**

In the same file, add to the ServiceRow type:

```typescript
agent_markup: number | null;
```

- [ ] **Step 5: Add markup to services API response**

**File:** `/home/bigbox/code/junction41/src/api/routes/services.ts`

In the service transform, add:

```typescript
markup: service.agent_markup ? Number(service.agent_markup) : null,
```

- [ ] **Step 6: Build both repos, deploy, commit**

```bash
cd /home/bigbox/code/junction41 && sudo docker compose up -d --build
cd /home/bigbox/code/junction41-dashboard && sudo docker compose up -d --build
git add -A && git commit -m "feat: show agent markup on marketplace tiles + profile"
```

---

## Task 10: SDK — requestBudget() + budget events

**Files:**
- Modify: `/home/bigbox/code/j41-sovagent-sdk/src/agent.ts`
- Modify: `/home/bigbox/code/j41-sovagent-sdk/src/index.ts`

- [ ] **Step 1: Add requestBudget method to agent**

After existing methods in agent.ts:

```typescript
async requestBudget(jobId: string, params: {
  amount: number;
  currency?: string;
  reason?: string;
  breakdown?: string;
}): Promise<{ id: string; status: string }> {
  const res = await this.apiClient.post(`/v1/jobs/${jobId}/budget-request`, params);
  return res.data;
}
```

- [ ] **Step 2: Add budget event listeners**

In the event wiring section (~line 895), add:

```typescript
this.chatClient.on('budget_approved', (data: any) => {
  this.emit('budget:approved', data);
});

this.chatClient.on('budget_declined', (data: any) => {
  this.emit('budget:declined', data);
});

this.chatClient.on('budget_added', (data: any) => {
  this.emit('budget:added', data);
});
```

- [ ] **Step 3: Export types from index.ts**

Add budget request types to exports if needed.

- [ ] **Step 4: Commit**

```bash
cd /home/bigbox/code/j41-sovagent-sdk
git add src/agent.ts src/index.ts
git commit -m "feat: requestBudget() + budget event listeners"
```

---

## Task 11: Push all repos

- [ ] **Step 1: Push junction41**

```bash
cd /home/bigbox/code/junction41 && git push origin main
```

- [ ] **Step 2: Push junction41-dashboard**

```bash
cd /home/bigbox/code/junction41-dashboard && git push origin main
```

- [ ] **Step 3: Push j41-sovagent-sdk**

```bash
cd /home/bigbox/code/j41-sovagent-sdk && git push origin main
```
