# Mid-Session Budget Requests

## Problem

Buyers and agents have no way to request or add budget mid-session. When an agent needs more tokens to finish a job, or a buyer wants to extend work, the only option is the clunky extension flow that always shows a payment form — even when the agent offers free extensions. There's no structured way for the agent to say "this job will cost 75 VRSC" and have the buyer approve inline.

## Design

### Overview

Either party can request additional budget during an active session. The agent calculates its own cost (model rates × tokens × markup × complexity), or sends a raw token count for the backend to calculate as fallback. Requests appear as action cards inline in the chat terminal. Payment uses a single combined `sendcurrency` transaction (agent + platform fee), same as the initial hire flow.

### VDXF Key: `agent.markup`

- Key: `agentplatform::agent.markup`
- Format: Single number (multiplier, e.g. `5` = 5x base model cost)
- Default: `1` (no markup) if not set
- Purpose: Profile transparency (buyer sees it before hiring) + backend fallback calculation
- Indexed to `agents.markup` column
- Displayed on marketplace tiles and agent profile

The agent is the authority on pricing. `agent.markup` is a declared policy, not a hard calculation input. Per-job quotes come from the agent directly.

### Budget Request Flow

```
Agent (SDK)                         J41 Backend                      Buyer (dashboard chat)
   |                                    |                                   |
   | requestBudget({                    |                                   |
   |   amount: 75,                      |                                   |
   |   currency: "VRSCTEST",            |                                   |
   |   reason: "Full audit",            |                                   |
   |   breakdown: "2M tokens, 5x" })    |                                   |
   |                                    |                                   |
   |-- POST /v1/jobs/:id/budget-req --->|                                   |
   |                                    | Store in budget_requests          |
   |                                    |-- WS: budget_request ------------>|
   |                                    |                                   |
   |                                    |   Action card in chat:            |
   |                                    |   "Agent requests 75 VRSCTEST"   |
   |                                    |   [Approve] [Decline]             |
   |                                    |                                   |
   |                                    |<-- POST .../approve --------------|
   |                                    |                                   |
   |                                    | Create extension                  |
   |                                    |-- WS: payment card -------------->|
   |                                    |                                   |
   |                                    |   Combined sendcurrency command   |
   |                                    |   [GUI] [CLI] [QR]               |
   |                                    |   txid input + submit             |
   |                                    |                                   |
   |                                    |<-- POST .../payment --------------|
   |                                    | Verify on-chain                   |
   |<-- WS: budget_approved ------------|                                   |
   |    { amount, tokens }              |                                   |
   |                                    |                                   |
   | Agent continues work               |                                   |
```

Buyer-initiated (reverse): Buyer clicks [+ budget] in input bar, enters amount, creates extension directly. Agent notified via `budget_added` event. No agent approval needed — buyer is paying.

### Input Formats

**Agent-calculated (preferred):**
```json
{
  "amount": 75,
  "currency": "VRSCTEST",
  "reason": "Full codebase audit",
  "breakdown": "~2M tokens at sonnet-4.6 rates, 5x markup, private tier"
}
```

**Token-only (fallback — backend calculates):**
```json
{
  "tokens": 500000,
  "model": "sonnet-4.6",
  "reason": "Need more for debugging"
}
```
Backend: `tokens × model_rate × agent.markup = amount`

### API Endpoints

**POST /v1/jobs/:id/budget-request**
- Auth: either buyer or agent (session required)
- Body: `{ amount?, tokens?, model?, currency?, reason?, breakdown? }`
- Creates `budget_requests` row, emits WebSocket event to other party
- Returns: `{ id, amount, status: 'pending' }`

**POST /v1/jobs/:id/budget-request/:reqId/approve**
- Auth: the OTHER party (not the requester)
- Creates a `job_extensions` row, links via `extension_id`
- If amount is 0 or free → auto-completes, no payment
- Returns extension invoice (combined sendcurrency params)

**POST /v1/jobs/:id/budget-request/:reqId/decline**
- Auth: the OTHER party
- Sets status to `declined`, notifies requester via WebSocket

### WebSocket Events

| Event | Direction | Payload |
|-------|-----------|---------|
| `budget_request` | → other party | `{ id, requester, amount, tokens, reason, breakdown }` |
| `budget_approved` | → requester | `{ id, amount, extensionId }` |
| `budget_declined` | → requester | `{ id, reason? }` |
| `budget_added` | → agent | `{ amount, currency }` (buyer-initiated, no approval needed) |

### Chat UI — Action Cards (Terminal Style)

**Budget request received:**
```
┌─ budget request ──────────────────────────────────┐
│ Agent requests additional budget                   │
│ Amount: 75 VRSCTEST                                │
│ Reason: Full codebase audit — ~2M tokens, 5x      │
│                                                    │
│ [Approve]  [Decline]                               │
└────────────────────────────────────────────────────┘
```

**After approve — combined payment (single sendcurrency):**
```
┌─ payment ─────────────────────────────────────────┐
│ Send 78.75 VRSCTEST (75 + 3.75 platform fee)      │
│                                                    │
│ sendcurrency '[{                    [GUI] [CLI]    │
│   "address":"agent@","amount":75},                 │
│   {"address":"agentplatform@","amount":3.75}]'     │
│                                                    │
│         [QR] (mobile pay)                          │
│                                                    │
│ Transaction ID: [_________________________]        │
│                              [Submit Payment]      │
└────────────────────────────────────────────────────┘
```

**After payment / declined:**
```
── budget approved ── 75 VRSCTEST ── paid ──
── budget declined ── agent notified ──
```

**Buyer-initiated:**
- `[+ budget]` button next to send in input bar
- Inline form: amount + reason (optional) + submit
- Creates extension directly, agent gets `budget_added` event

### Database

**New table: `budget_requests`**
```sql
CREATE TABLE budget_requests (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id),
  requester TEXT NOT NULL,            -- 'agent' or 'buyer'
  requester_verus_id TEXT NOT NULL,
  amount NUMERIC,                     -- VRSC amount (null if token-only)
  tokens INTEGER,                     -- raw token count (null if amount-only)
  model TEXT,                         -- model name for fallback calc
  currency TEXT NOT NULL DEFAULT 'VRSCTEST',
  reason TEXT,
  breakdown TEXT,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending|approved|declined|paid
  extension_id TEXT,                  -- links to job_extensions on approval
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_budget_req_job ON budget_requests (job_id);
```

**Agents table migration:**
- Add `markup NUMERIC` column (from VDXF `agent.markup`, default 1)

### SDK Changes

**New methods on agent client:**
```typescript
agent.requestBudget({
  amount?: number,
  tokens?: number,
  model?: string,
  currency?: string,
  reason?: string,
  breakdown?: string
}): Promise<{ id: string; status: string }>

// Events
agent.on('budgetApproved', (data: { id, amount, extensionId }) => { ... })
agent.on('budgetDeclined', (data: { id }) => { ... })
agent.on('budgetAdded', (data: { amount, currency }) => { ... })
```

### Indexer Change

Parse `agent.markup` from VDXF contentmultimap, store in `agents.markup`:
```typescript
const markupJson = (data as any).markup;
const markup = markupJson ? Math.max(1, Math.min(100, parseFloat(markupJson) || 1)) : null;
```

### Files Summary

**Backend (junction41):**
- `src/db/migrations/0XX_budget_requests.ts` — new table + agents.markup column
- `src/db/schema.ts` — BudgetRequestTable + markup on AgentTable
- `src/api/routes/jobs.ts` — 3 new endpoints (budget-request, approve, decline)
- `src/chat/ws-server.ts` — WebSocket events for budget_request/approved/declined/added
- `src/indexer/indexer.ts` — parse agent.markup from VDXF
- `src/validation/vdxf-keys.ts` — add markup key i-address

**Dashboard (junction41-dashboard):**
- `src/components/Chat.jsx` — budget request action cards + [+ budget] button
- `src/components/marketplace/MarketplaceCard.jsx` — show markup on tiles
- `src/pages/AgentDetailPage.jsx` — show markup on profile

**SDK (j41-sovagent-sdk):**
- `src/agent.ts` — requestBudget() method + budget events
- `src/index.ts` — export new types

### Out of Scope

- Automatic budget approval (buyer pre-approves up to X amount) — future feature
- Token usage tracking/metering — agent self-reports, not platform-enforced
- Multi-currency budget requests — VRSC/VRSCTEST only for now
- Budget request negotiation (counter-offers) — approve or decline only
