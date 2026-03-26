# Response: Pricing Calculator — Gaps and Recommendations

**To:** SDK/Dispatcher team (Kodasan-V)
**From:** Junction41 Backend
**Date:** 2026-03-26
**Re:** Response to pricing calculator gaps report

---

## 1. Model Table — UPDATED

All three pricing tables have been updated to March 2026 current-gen models:

| Table | Location | Models |
|-------|----------|--------|
| SDK `tables.ts` | `j41-sovagent-sdk/src/pricing/tables.ts` | 21 models |
| Backend `pricing.ts` | `junction41/src/api/routes/pricing.ts` | 22 models |
| Dashboard ticker | `junction41-dashboard/src/components/InfoTicker.jsx` | 17 models |

**Kimi K2 is now in all three tables** with estimated pricing:
- Input: $0.20/1M tokens
- Output: $1.00/1M tokens

Models added: `grok-4.20`, `grok-4-1-fast`, `kimi-k2`, `mistral-small-4`, `codestral`, `deepseek-v3`, `deepseek-r1`, `gemini-2.5-pro`, `gemini-2.5-flash`, `llama-4-scout`.

Models removed: `gpt-4o`, `gpt-5`, `gpt-5-mini`, `claude-3.5-sonnet`, `claude-3-opus`, `claude-3-haiku`, `gemini-1.5-*`, `deepseek-v2`, `mixtral-8x7b`, `llama-3.1-*`.

**The SDK table is the source of truth.** The backend table is a synced copy (comment says "keep in sync with SDK"). The dashboard ticker is for display only.

---

## 2. VRSC/USD Rate — ENDPOINT COMING

We will add a `GET /v1/price/vrsc` endpoint that derives the VRSC/USD rate from the Verus blockchain itself:

```
verus getcurrency bridge.veth
```

The `bridge.veth` basket contains `DAI.veth` (pegged to $1 USD). The conversion rate is:
```
1 DAI.veth via bridge.veth → X VRSC = VRSC price in USD = 1/X
```

This will be a cached endpoint (refreshes every 5 minutes). The SDK can call it instead of requiring `vrscUsdRate` to be passed manually.

**Status:** Planned, not yet implemented. Will be in next deploy.

---

## 3. Model Registry — agent.models maps to pricing entries

**Decision:** The agent's `agent.models` VDXF values should match the SDK pricing table model names exactly. There is no separate mapping registry.

When an agent sets `agent.models: ["kimi-k2"]` on-chain, the marketplace can look up `kimi-k2` directly in the SDK/backend pricing table to estimate costs.

**Naming convention:** Use the pricing table model names as the canonical names. The dispatcher should set these exact strings in the VDXF key:
- `claude-sonnet-4.6` (not `anthropic/claude-sonnet-4.6`)
- `kimi-k2` (not `moonshotai/kimi-k2.5`)
- `grok-4.20` (not `xai/grok-4.20-0309-reasoning`)

If the dispatcher currently sets `moonshotai/kimi-k2.5`, update to `kimi-k2`.

---

## 4. Store Token Usage in Job Records — YES

We agree this is valuable. The job completion API (`POST /v1/jobs/:id/complete`) should accept token usage stats. Proposed addition to the request body:

```json
{
  "timestamp": 1711497600,
  "signature": "...",
  "tokenUsage": {
    "promptTokens": 3200,
    "completionTokens": 1800,
    "totalTokens": 5000,
    "llmCalls": 5,
    "model": "kimi-k2"
  }
}
```

This will be stored in the `jobs` table (new `token_usage` JSONB column) and included in the workspace attestation.

**Status:** Planned, not yet implemented. Needs a migration + endpoint update.

---

## 5. Workspace Cost Multiplier — Agent Self-Declares via agent.markup

We've implemented `agent.markup` as a VDXF key (`agentplatform::agent.markup`, i-address: `iBLx3rga8DewiN6gyQyC5avFin8fnnojnS`). Agents set a single multiplier (1-50x) that covers:

- Complexity level
- Privacy tier overhead
- Infrastructure costs
- Operator margin
- Workspace overhead

The dispatcher/executor should set this based on its deployment:
- Chat-only agent on cheap model: `markup: 3`
- Workspace-enabled agent on premium model: `markup: 10`
- Self-hosted sovereign agent: `markup: 20`

The marketplace displays this as a badge (e.g., "10x") and uses it for fallback cost estimation.

For per-job dynamic pricing, agents use the new `requestBudget()` SDK method to send a calculated quote to the buyer inline in the chat session.

---

## 6. agent.models ↔ Pricing Table — See #3 Above

Use exact SDK pricing table model names in the VDXF key. No mapping layer needed.

---

## Additional: Budget Requests (New Feature)

We've deployed mid-session budget requests. The dispatcher can now:

```typescript
agent.requestBudget(jobId, {
  amount: 75,
  currency: 'VRSCTEST',
  reason: 'Full codebase audit — ~2M tokens',
  breakdown: 'kimi-k2: 2M tokens × $0.001/1K × 10x markup',
});

// Listen for buyer response
agent.on('budget:approved', (data) => { /* continue work */ });
agent.on('budget:declined', (data) => { /* wrap up */ });
```

Buyer sees an inline action card in the terminal chat with Approve/Decline buttons and a combined sendcurrency payment command.

---

## Dispatcher Bug: Agent Reads Excluded Files

From the test logs, the agent repeatedly tried to read `run_overnight.sh` (6 times, blocked each time) and tried Python files (`src/main.py`, `src/data_collector.py`) in a Rust project. Two issues:

1. **Agent should respect the exclusion list** — The exclusion list is available to the agent. When `run_overnight.sh` is blocked, the agent should not retry.

2. **Agent should detect the project language** — `Cargo.toml` is present, meaning it's Rust. The agent tried to read `src/main.py` (Python). The executor should detect the language from project files and adjust its approach.

Both are dispatcher-side fixes. The relay is correctly blocking excluded files.

---

## Summary of Actions Taken

| Item | Status |
|------|--------|
| Model tables updated (SDK + backend + dashboard) | DONE — deployed |
| VRSC/USD price endpoint | PLANNED — via `getcurrency bridge.veth` |
| Model registry | NOT NEEDED — use exact pricing table names |
| Token usage in jobs | PLANNED — migration + endpoint update |
| Workspace multiplier | DONE — `agent.markup` VDXF key deployed |
| Budget requests | DONE — 3 endpoints + chat UI + SDK method |
