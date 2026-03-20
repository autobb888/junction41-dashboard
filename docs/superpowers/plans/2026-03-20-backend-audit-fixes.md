# Backend 5-Pass Audit Fixes Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all 7 Critical + 7 High issues found across the 5-pass backend audit (security, data integrity, workspace, VDXF, API completeness).

**Architecture:** All fixes are in the `junction41` backend. Most are small targeted edits — adding WHERE clauses, rate limits, auth guards. One new migration (013) for the job status CHECK constraint. README update at the end.

**Tech Stack:** TypeScript, Kysely, Fastify, PostgreSQL

**Audit source:** 5 parallel audit agents on 2026-03-20 produced 65 findings. This plan covers the 14 Critical + High items.

---

## Task 1: Fix agent status toggle (C1 — MOST URGENT)

**File:** `/home/bigbox/code/junction41/src/api/routes/agents.ts`

The `POST /v1/agents/:id/status` endpoint has NO authentication and NO signature verification. Anyone can toggle any agent's status.

- [ ] Add `preHandler: requireAuth` to the route
- [ ] Add ownership check: verify `session.verusId` matches the agent's `verus_id` or `owner`
- [ ] Add signature verification using `getRpcClient().verifyMessage()` with a deterministic message format
- [ ] Add rate limiting: `config: { rateLimit: { max: 10, timeWindow: 60_000 } }`
- [ ] Add try/catch error handling
- [ ] Commit: `fix(security): agent status toggle — add auth, signature verification, rate limit`

---

## Task 2: Migration 013 — job status CHECK constraint (C2)

**File:** Create `/home/bigbox/code/junction41/src/db/migrations/013_job_status_check.ts`

The jobs table CHECK constraint only allows 7 statuses but the code writes 10. Dispute flows (`rework`, `resolved`, `resolved_rejected`) may silently fail.

- [ ] Create migration that drops old CHECK constraint and adds new one with all 10 statuses: `requested, accepted, in_progress, delivered, completed, disputed, cancelled, rework, resolved, resolved_rejected`
- [ ] Verify migration runs: `sudo docker compose up -d --build`
- [ ] Commit: `fix(db): migration 013 — add rework, resolved, resolved_rejected to jobs status CHECK`

---

## Task 3: Update webhook VALID_EVENTS (C3)

**File:** `/home/bigbox/code/junction41/src/api/routes/webhooks.ts`

The VALID_EVENTS array is missing 15 event types. Agents can't subscribe to dispute, bounty, workspace, or review events individually.

- [ ] Update the `VALID_EVENTS` array (around line 25) to include ALL event types from the `WebhookEventType` union in `webhook-engine.ts`:
  - Add: `job.dispute.filed`, `job.dispute.responded`, `job.dispute.resolved`, `job.dispute.rework_accepted`
  - Add: `job.started`, `job.delivery_rejected`, `job.extension_request`, `job.end_session_request`
  - Add: `review.received`, `inbox.new`
  - Add: `bounty.posted`, `bounty.applied`, `bounty.awarded`, `bounty.expired`
  - Add: `workspace.ready`, `workspace.connected`, `workspace.disconnected`, `workspace.completed`
- [ ] Commit: `fix(webhooks): add 15 missing event types to VALID_EVENTS subscription list`

---

## Task 4: Payment + dispute status guards (C4 + H3)

**Files:**
- `/home/bigbox/code/junction41/src/db/index.ts` (setPayment, setPlatformFee)
- `/home/bigbox/code/junction41/src/api/routes/jobs.ts` (dispute respond, rework-accept, refund-txid)

- [ ] `setPayment`: Add `.where('payment_txid', 'is', null)` to prevent overwriting existing payment
- [ ] `setPlatformFee`: Add `.where('platform_fee_txid', 'is', null)` same pattern
- [ ] Dispute respond (around line 1491): Add `.where('status', '=', 'disputed')` and check `numUpdatedRows`
- [ ] Rework accept (around line 1582): Add `.where('status', '=', 'disputed')` and check `numUpdatedRows`
- [ ] Refund txid (around line 1637): Add `.where('status', '=', 'disputed')` and check `numUpdatedRows`
- [ ] Commit: `fix(security): payment/dispute status guards — prevent overwrites and race conditions`

---

## Task 5: Bounty security fixes (C5 + C6)

**File:** `/home/bigbox/code/junction41/src/api/routes/bounties.ts`

- [ ] C5: Remove the testnet signature verification bypass (around line 204-211). Block bounty creation when sig verification fails regardless of environment. Return 503 instead of allowing unsigned.
- [ ] C6: Wrap bounty cancel in `db.transaction().execute()` with `SELECT...FOR UPDATE` on the bounty row, then re-check status and job existence inside the transaction.
- [ ] Commit: `fix(security): bounty — mandatory sig verification, transactional cancel`

---

## Task 6: Workspace state machine fixes (C7 + H6)

**File:** `/home/bigbox/code/junction41/src/chat/workspace-relay.ts`

- [ ] C7: Add status guard to `workspace:pause` handler — only allow from `active`:
  ```typescript
  const current = await getSessionById(session.id);
  if (current?.status !== 'active') return;
  ```
- [ ] C7: Add status guard to `workspace:resume` handler — only allow from `paused`:
  ```typescript
  const current = await getSessionById(session.id);
  if (current?.status !== 'paused') return;
  ```
- [ ] H6: Check `markSessionCompleted` return value in `workspace:accept` handler. If false, skip attestation:
  ```typescript
  const completed = await markSessionCompleted(session.id);
  if (!completed) return; // already aborted/completed
  ```
- [ ] Commit: `fix(workspace): pause/resume status guards, accept checks completion result`

---

## Task 7: Rate limits for unprotected endpoints (H1 + H2)

**Files:**
- `/home/bigbox/code/junction41/src/api/routes/agents.ts`
- `/home/bigbox/code/junction41/src/api/routes/services.ts`
- `/home/bigbox/code/junction41/src/api/routes/reviews.ts`
- `/home/bigbox/code/junction41/src/api/routes/jobs.ts`
- `/home/bigbox/code/junction41/src/api/routes/webhooks.ts`
- `/home/bigbox/code/junction41/src/api/routes/notifications.ts`
- `/home/bigbox/code/junction41/src/api/routes/inbox.ts`

- [ ] Public listing endpoints (agents, services, reviews, reputation, stats): Add `config: { rateLimit: { max: 30, timeWindow: 60_000 } }`
- [ ] Job state-changing endpoints (accept, deliver, complete, cancel, dispute, payment): Add `config: { rateLimit: { max: 10, timeWindow: 60_000 } }`
- [ ] Webhook CRUD endpoints: Add `config: { rateLimit: { max: 30, timeWindow: 60_000 } }`
- [ ] Notification/inbox GET endpoints: Add `config: { rateLimit: { max: 30, timeWindow: 60_000 } }`
- [ ] Commit: `fix(security): add rate limits to 20+ unprotected endpoints`

---

## Task 8: Workspace duplicate session + job cancel cleanup (H4 + Audit 2 I10)

**Files:**
- `/home/bigbox/code/junction41/src/db/migrations/013_job_status_check.ts` (add unique index)
- `/home/bigbox/code/junction41/src/api/routes/jobs.ts` (cancel handler)

- [ ] H4: Add unique partial index to prevent duplicate active workspace sessions:
  ```sql
  CREATE UNIQUE INDEX idx_workspace_sessions_active_job
  ON workspace_sessions (job_id)
  WHERE status IN ('pending', 'active', 'paused', 'disconnected');
  ```
  (Add to migration 013 alongside the CHECK constraint fix)
- [ ] I10: In the job cancel handler, after setting status to `cancelled`, check for active workspace sessions and abort them:
  ```typescript
  const wsSession = await getSessionByJobId(jobId);
  if (wsSession) await markSessionAborted(wsSession.id);
  ```
- [ ] Commit: `fix(workspace): unique active session per job + abort on job cancel`

---

## Task 9: VDXF + profile fixes (Audit 4)

**Files:**
- `/home/bigbox/code/junction41/src/api/routes/profile.ts`
- `/home/bigbox/code/junction41/src/validation/vdxf-keys.ts`
- `/home/bigbox/code/junction41/src/validation/vdxf-schema.ts`

- [ ] Profile schema: Add workspace, job, bounty categories to the `/v1/me/identity` response. Update comment from "33 keys across 5 groups" to "18 keys across 8 groups"
- [ ] Remove dead `getFieldName()` export from vdxf-keys.ts
- [ ] Rename `VDXF_KEYS` export in vdxf-schema.ts to `VDXF_KEY_NAMES` to avoid naming collision
- [ ] Commit: `fix(vdxf): profile schema + naming collision + dead code cleanup`

---

## Task 10: README update (H5 + H7)

**File:** `/home/bigbox/code/junction41/README.md`

- [ ] Fix admin trust route paths to match actual implementation:
  - `POST /v1/admin/agents/:verusId/penalty` (not `/admin/trust/`)
  - `POST /v1/admin/agents/:verusId/suspend`
  - `DELETE /v1/admin/agents/:verusId/penalty` (lift penalty)
  - `DELETE /v1/admin/agents/:verusId/suspension` (lift suspension)
  - Remove `POST /v1/admin/trust/:verusId/recalc` (not implemented)
- [ ] Add missing documented endpoints (top 10 most important):
  - `POST /v1/agents/:id/status`
  - `POST /v1/jobs/:id/end-session`
  - `POST /v1/jobs/:id/reject-delivery`
  - `POST /v1/jobs/:id/dispute/refund-txid`
  - Workspace endpoints section (already added previously)
- [ ] Update table count: "39 tables" is correct
- [ ] Commit: `docs: README — fix admin routes, add undocumented endpoints`

---

## Task 11: Build + verify + push

- [ ] `cd /home/bigbox/code/junction41 && sudo docker compose up -d --build`
- [ ] Verify health: `curl http://localhost:3001/v1/health`
- [ ] Verify migration 013 applied
- [ ] `git push`

---

## Medium fixes (do if time permits)

These are important but not blocking:

- [ ] Bounty `updateBountyStatus` — add conditional WHERE guard
- [ ] Workspace `updateSessionStatus` — make unexported or add transition guards
- [ ] Add missing indexes: `bounties.application_deadline`, `workspace_sessions.disconnected_at`, `jobs.review_window_expires_at` (add to migration 013)
- [ ] Workspace relay: SDK should listen for `mcp:error` events
- [ ] Workspace relay: `uidAttempts` periodic cleanup
- [ ] Reviews endpoint: Add limit cap (`Math.min(limit, 100)`)
- [ ] Profile REVERSE_LOOKUP: Build lazily instead of at module load
- [ ] Agent refund txid: Add on-chain verification
- [ ] Zero-amount jobs: Change `min(0)` to `gt(0)` in job creation schema
