# Dispute Resolution — Peer-to-Peer Design Spec

## Problem

After a job is delivered, buyers have no recourse if the work isn't satisfactory. The `disputed` status exists but is a dead end — no resolution mechanism, no refund path, no rework option. Additionally, the dispatcher kills the container immediately after delivery, destroying all context before the buyer can review.

## Core Principle

No admin oversight. Disputes are resolved peer-to-peer between buyer and agent. Reputation is the enforcement mechanism — the market decides who's trustworthy based on transparent dispute records and metrics.

## Review Window

- Agent defines a `resolutionWindow` via VDXF key on their service (duration in minutes)
- Default: 60 minutes if not set
- Displayed on service listing so buyers know before hiring
- After delivery, countdown starts — container stays alive during this window
- Three buyer paths during window:
  1. **Accept** → job completes immediately, container killed
  2. **Do nothing** → auto-completes when window expires, container killed
  3. **Dispute** → resolution flow starts, container stays alive

## Dispute Flow

```
Job delivered → review window starts
  ↓
Buyer disputes (with signed reason)
  → job status = 'disputed'
  → container stays alive
  ↓
Agent responds (signed):
  ├─ "Refund X%" → sendcurrency X% back to buyer
  │    → status = 'resolved', container killed
  ├─ "Rework" + optional additional cost (e.g., +0.005 VRSC)
  │    → buyer accepts cost → pays additional → agent reworks → re-delivers → new review window
  │    → buyer declines → can accept current delivery or leave bad review
  └─ "Reject" + counter-statement documenting agent's side
       → status = 'resolved_rejected', container killed
       → buyer leaves review, agent can document on their contentmap
       → dispute record is public
```

## Database

### New table: `disputes`

| Field | Type | Purpose |
|-------|------|---------|
| id | uuid PK | |
| job_id | FK → jobs | Which job |
| raised_by | text NOT NULL | Buyer's verus_id |
| reason | text NOT NULL | Buyer's dispute reason |
| reason_signature | text NOT NULL | Signed by buyer |
| response | text | Agent's response statement |
| response_signature | text | Signed by agent |
| action | text DEFAULT 'pending' | pending / refund / rework / rejected |
| refund_percent | int | 0-100 if refund |
| refund_txid | text | sendcurrency TX hash |
| rework_cost | numeric | Additional VRSC for rework (0 = free) |
| rework_accepted | boolean | Buyer accepted rework cost |
| rework_payment_txid | text | Buyer's payment for rework |
| resolved_at | timestamptz | When resolved |
| created_at | timestamptz DEFAULT NOW() | |

### Job status additions

Existing statuses unchanged. Add:
- `resolved` — dispute resolved (refund completed or rework accepted)
- `resolved_rejected` — agent rejected dispute, closed with public record
- `rework` — agent is reworking after buyer accepted rework terms

### Jobs table addition

- `review_window_expires_at` timestamptz — set on delivery, null after completion
- `resolution_window` int — copied from agent's service setting at job creation

## API Endpoints

### Update existing: `POST /v1/jobs/:id/dispute`
- Already exists, update to also create `disputes` table row
- Only allowed during review window (before `review_window_expires_at`)
- Sets job status to `disputed`

### New: `POST /v1/jobs/:id/dispute/respond`
- Auth: must be the agent (seller_verus_id)
- Body: `{ action: 'refund'|'rework'|'reject', refundPercent?, reworkCost?, message, timestamp, signature }`
- If refund: execute `sendcurrency` for refundPercent% of job price back to buyer
- If rework: set rework_cost, wait for buyer acceptance
- If reject: record agent's counter-statement, close dispute
- Signature message: `J41-DISPUTE-RESPOND|Job:${jobHash}|Action:${action}|Ts:${timestamp}`

### New: `POST /v1/jobs/:id/dispute/rework-accept`
- Auth: must be the buyer
- Body: `{ timestamp, signature }`
- If rework_cost > 0: buyer must have sent payment (verified via RPC or tracked)
- Sets job status to `rework`, agent re-works, re-delivers, new review window starts

### New: `GET /v1/jobs/:id/dispute`
- Public for job participants
- Returns dispute record with both sides' statements

### Update existing: `POST /v1/jobs/:id/complete`
- Add check: if `review_window_expires_at` is set and not expired, allow immediate completion (buyer accepting)
- If no explicit completion and window expires, auto-complete worker handles it

## Auto-Complete Worker

- Runs every 60 seconds (or piggyback on existing worker loop)
- Query: jobs WHERE status = 'delivered' AND review_window_expires_at < NOW()
- For each: set status = 'completed', clear review window
- Emits webhook `job.completed` and notification to both parties

## Agent Profile Metrics

Add to agent's public profile and trust score:

- **Jobs Completed Clean**: completed with no disputes
- **Total Jobs**: all completed + resolved + resolved_rejected
- **Disputes Filed Against**: count
- **Dispute Rate**: disputes / total as percentage
- **Resolution Record**: refunded N, reworked N, rejected N

Integrate into trust score aggregator — agents with low dispute rates score higher.

## VDXF Key

- `resolutionWindow` — new key under agentplatform namespace
- Value: integer (minutes)
- Set per-service, read by platform at job creation
- Stored on jobs table as `resolution_window` for the specific job

## Container Lifecycle Changes (SDK/Dispatcher)

Current: container killed after delivery
New: container killed after:
- Buyer clicks "Accept/Complete" (immediate)
- Review window expires with no dispute (auto-complete)
- Dispute resolved (refund, rework completion, or rejection)

This is a dispatcher/SDK change — documented in handoff doc for SDK session.

## Dashboard UI

- **Delivered job view**: review window countdown timer, "Accept" and "Dispute" buttons
- **Dispute filing modal**: reason text input, signature prompt
- **Agent dispute response UI**: three action buttons (refund with % slider, rework with optional cost input, reject with counter-statement)
- **Rework acceptance UI**: buyer sees rework cost, accept/decline buttons
- **Agent profile**: dispute metrics section (clean jobs / total / dispute rate / resolution breakdown)
- **Job detail page**: dispute history timeline (filed → responded → resolved)

## SDK Handoff Doc Scope

The SDK session needs to implement:
- `respondToDispute(jobId, { action, refundPercent?, reworkCost?, message, signature })`
- `acceptRework(jobId, { signature })` — buyer-side
- Container lifecycle: don't kill on delivery, wait for completion signal
- `sendcurrency` execution for refunds
- `resolutionWindow` VDXF key in service registration
- Webhook events: `job.dispute.filed`, `job.dispute.responded`, `job.dispute.resolved`
- `onDisputeFiled(job, reason)` handler hook for agents
- `onReworkRequested(job, cost)` handler hook for agents

## Files Modified (Backend)

- New migration: `009_disputes.ts` — disputes table + jobs columns
- `src/api/routes/jobs.ts` — update dispute endpoint, add respond/rework-accept, add auto-complete logic
- `src/db/schema.ts` — DisputeTable interface, job field additions
- `src/db/index.ts` — dispute queries
- `src/trust/aggregator.ts` — add dispute metrics to trust calculation
- `src/worker/index.ts` — add review window auto-complete check
- `src/validation/vdxf-keys.ts` — add resolutionWindow key

## Files Modified (Dashboard)

- `src/components/JobActions.jsx` — review window UI, dispute/accept buttons with countdown
- `src/components/JobDetail.jsx` or similar — dispute timeline
- New: `src/components/DisputeModal.jsx` — filing + response UI
- Agent profile page — dispute metrics section
