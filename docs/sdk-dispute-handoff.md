# Dispute Resolution — SDK Handoff

Everything the SDK/dispatcher session needs to implement for dispute resolution.

## 1. New VDXF Key: `resolutionWindow`

Register `agentplatform::svc::resolutionwindow` on-chain and provide the i-address back to the platform team. This key stores an integer (minutes) per service — how long the buyer has to review and potentially dispute after delivery.

**Current placeholder in platform:** `iPendingVDXFKeyRegistration` in `src/validation/vdxf-keys.ts`

## 2. Container Lifecycle Change

**Current behavior:** Container killed immediately after delivery.

**New behavior:** Container stays alive after delivery. Kill only after one of:
- `job.completed` webhook (buyer accepted or auto-complete after review window)
- `job.dispute.resolved` webhook (dispute closed — refund, rework completion, or rejection)

The platform sets `review_window_expires_at` on the job when delivered. If the buyer doesn't dispute within that window, the platform auto-completes the job and emits `job.completed`.

## 3. New SDK Methods

### `respondToDispute(jobId, options)`

Agent responds to a buyer's dispute.

```typescript
respondToDispute(jobId: string, options: {
  action: 'refund' | 'rework' | 'rejected';
  refundPercent?: number;  // 1-100, required if action='refund'
  reworkCost?: number;     // additional VRSC for rework, 0 = free
  message: string;         // agent's statement
  timestamp: number;
  signature: string;
}): Promise<{ status: string; dispute: object }>
```

**Endpoint:** `POST /v1/jobs/:id/dispute/respond`
**Auth:** Must be the seller (agent)

### `acceptRework(jobId, options)` — buyer-side

Buyer accepts the agent's rework offer.

```typescript
acceptRework(jobId: string, options: {
  timestamp: number;
  signature: string;
}): Promise<{ status: string }>
```

**Endpoint:** `POST /v1/jobs/:id/dispute/rework-accept`
**Auth:** Must be the buyer

## 4. Refund Execution

When an agent chooses `action: 'refund'`, the platform calculates the refund amount:

```
refundAmount = job.amount * (refundPercent / 100)
```

The platform executes `sendtoaddress` to send VRSC back to the buyer's payment address. The SDK doesn't need to handle refund execution — the platform does it.

## 5. New Webhook Events

| Event | When | Payload |
|-------|------|---------|
| `job.dispute.filed` | Buyer files a dispute | `{ jobId, disputedBy, reason }` |
| `job.dispute.responded` | Agent responds (rework offer pending acceptance) | `{ jobId, action, reworkCost }` |
| `job.dispute.resolved` | Dispute closed (refund completed or rejected) | `{ jobId, action, refundPercent? }` |
| `job.dispute.rework_accepted` | Buyer accepted rework terms | `{ jobId }` |

## 6. New Agent Handler Hooks

```typescript
// Agent is notified a dispute was filed
onDisputeFiled(job: Job, reason: string): void

// After rework is accepted, agent is told to rework
onReworkRequested(job: Job, cost: number): void
```

These hooks let agents react to disputes programmatically — e.g., auto-refund, auto-rework, or log the dispute.

## 7. Signature Formats

**Dispute respond:**
```
J41-DISPUTE-RESPOND|Job:${jobHash.slice(0,16)}|Action:${action}|Ts:${timestamp}
```

**Rework accept:**
```
J41-REWORK-ACCEPT|Job:${jobHash.slice(0,16)}|Ts:${timestamp}
```

Where `jobHash` is `job.request_signature.slice(0, 16)` or `job.id.slice(0, 16)` as fallback.

## 8. Service Registration

Add `resolutionWindow` field to service VDXF data during registration:

```json
{
  "resolutionWindow": 120
}
```

Value is integer minutes. Default is 60 if not set. Displayed to buyers on service listing.

## 9. Job Status Flow

```
delivered → (review window starts)
  ├─ buyer accepts → completed (container killed)
  ├─ window expires → completed (auto, container killed)
  └─ buyer disputes → disputed
       ├─ agent refunds → resolved (container killed)
       ├─ agent rejects → resolved_rejected (container killed)
       └─ agent offers rework
            ├─ buyer accepts → rework → agent re-delivers → delivered (new window)
            └─ buyer declines → stays disputed (buyer can accept current or leave review)
```
