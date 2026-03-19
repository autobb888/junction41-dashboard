# VDXF Key Overhaul — Consolidation + Workspace Keys

## Overview

Consolidate 50 VDXF DefinedKeys on `agentplatform@` down to 18. Add workspace and job completion keys. Big bang migration on testnet (pre-launch).

**Current state:** 50 keys across 6 batches (agent 13, svc 11, bounty 16, review 6, platform 3, session 1). Registered on `agentplatform@` (VRSCTEST).

**Target state:** 18 keys. 10 new consolidated keys registered, 42 old keys retired, 8 existing keys kept/renamed.

## Critical: updateidentity REPLACES contentmultimap

**Confirmed by testing:** `updateidentity` with a `contentmultimap` field **replaces the entire map**. Omitted keys are deleted. Any code that updates an identity MUST:

1. Read current identity via `getidentity`
2. Merge changes into the existing contentmultimap
3. Write the full merged map via `updateidentity`

**Cost:** ~0.0043 VRSCTEST per `updateidentity` call. Minimize transactions by bundling related updates (e.g., job completion + review + attestation = 1 transaction, not 3).

**History:** `getidentitycontent` aggregates contentmultimap values across ALL historical `updateidentity` transactions for a given VDXF key. This provides an append-only audit trail even though the current identity only shows the latest state.

## The 18 Keys

### Agent (8 keys — down from 13)

| # | Key | Format | Purpose |
|---|-----|--------|---------|
| 1 | `agent.displayname` | string | Display name (renamed from agent.name) |
| 2 | `agent.type` | string | autonomous / assisted / tool |
| 3 | `agent.description` | string | What the agent does |
| 4 | `agent.status` | string | active / inactive |
| 5 | `agent.owner` | string | Owner VerusID |
| 6 | `agent.services` | JSON array | Service listings with pricing |
| 7 | `agent.network` | JSON blob | capabilities, endpoints, protocols (consolidated from 3 keys) |
| 8 | `agent.profile` | JSON blob | tags, website, avatar, category (consolidated from 4 keys) |

**`agent.network` format:**
```json
{
  "capabilities": ["research", "summarize", "code-review"],
  "endpoints": ["https://mybot.example.com/api"],
  "protocols": ["verusid", "rest", "mcp"]
}
```

**`agent.profile` format:**
```json
{
  "tags": ["ai", "research", "nlp"],
  "website": "https://mybot.example.com",
  "avatar": "https://mybot.example.com/avatar.png",
  "category": "research"
}
```

### Service schema (2 keys — down from 11)

| # | Key | Format | Purpose |
|---|-----|--------|---------|
| 9 | `svc.schema` | JSON blob | Base service field definitions (name, description, pricing, category, turnaround, status, paymentTerms, privateMode, sovguard) |
| 10 | `svc.dispute` | JSON blob | resolutionWindow + refundPolicy |

These are schema-only keys on `agentplatform@`. Agents store their actual service data in `agent.services`. `svc.resolutionwindow` and `svc.refundpolicy` (currently separate keys) fold into `svc.dispute`.

### Review (1 key — down from 6)

| # | Key | Format | Purpose |
|---|-----|--------|---------|
| 11 | `review.record` | JSON blob | Complete review: buyer, jobHash, message, rating, signature, timestamp |

### Bounty (2 keys — down from 16)

| # | Key | Format | Purpose |
|---|-----|--------|---------|
| 12 | `bounty.record` | JSON blob | Full bounty: title, description, amount, currency, poster, deadline, qualifications, status, signature |
| 13 | `bounty.application` | JSON blob | Applicant, message, selected |

Schema keys on `agentplatform@` for future on-chain bounties.

### Platform (1 key — down from 3)

| # | Key | Format | Purpose |
|---|-----|--------|---------|
| 14 | `platform.config` | JSON blob | datapolicy, trustlevel, disputeresolution |

### Session (1 key — unchanged)

| # | Key | Format | Purpose |
|---|-----|--------|---------|
| 15 | `session.params` | JSON blob | duration, tokenLimit, etc. |

### NEW — Workspace (2 keys)

| # | Key | Format | Purpose |
|---|-----|--------|---------|
| 16 | `workspace.attestation` | JSON blob | Platform-signed workspace session record |
| 17 | `workspace.capability` | JSON blob | Agent's workspace support declaration |

**`workspace.attestation` format:**
```json
{
  "jobId": "uuid",
  "buyer": "alice@",
  "duration": 3600,
  "filesRead": 47,
  "filesWritten": 12,
  "sovguardFlags": 0,
  "completedClean": true,
  "mode": "supervised",
  "platformSignature": "sig..."
}
```

**`workspace.capability` format:**
```json
{
  "workspace": true,
  "modes": ["supervised", "standard"],
  "tools": ["read_file", "write_file", "list_directory"]
}
```

### NEW — Job (1 key)

| # | Key | Format | Purpose |
|---|-----|--------|---------|
| 18 | `job.record` | JSON blob | Signed job completion receipt |

**`job.record` format:**
```json
{
  "jobHash": "a1b2c3...",
  "buyer": "alice@",
  "description": "Build a dashboard",
  "amount": 50,
  "currency": "VRSCTEST",
  "completedAt": 1710720000,
  "completionSignature": "sig...",
  "paymentTxid": "txid...",
  "hasWorkspace": true,
  "hasReview": true
}
```

## Write Pattern (read-merge-write)

Every `updateidentity` call must read the current identity first, merge changes, and write the full contentmultimap. This minimizes cost and prevents data loss.

| Event | Keys written/updated | Transaction count |
|-------|---------------------|-------------------|
| Agent registration | Keys 1-8, 17 (workspace capability) | 1 tx |
| Service listing change | Read all, update key 6 | 1 tx |
| Status toggle | Read all, update key 4 | 1 tx |
| Job completion (no review, no workspace) | Read all, add key 18 | 1 tx |
| Job completion + review + workspace | Read all, add keys 11 + 16 + 18 | 1 tx (bundled) |
| Profile update | Read all, update key 8 | 1 tx |

**History retrieval:** `getidentitycontent` with a specific VDXF key (e.g., `job.record`) returns ALL historical values across all `updateidentity` transactions — providing a complete work/review/attestation history without bloating the current identity.

## New VDXF Keys to Register

10 new keys need `getvdxfid` registration on `agentplatform@`:

```bash
verus -chain=VRSCTEST getvdxfid "agentplatform::agent.displayname"
verus -chain=VRSCTEST getvdxfid "agentplatform::agent.network"
verus -chain=VRSCTEST getvdxfid "agentplatform::agent.profile"
verus -chain=VRSCTEST getvdxfid "agentplatform::svc.schema"
verus -chain=VRSCTEST getvdxfid "agentplatform::svc.dispute"
verus -chain=VRSCTEST getvdxfid "agentplatform::review.record"
verus -chain=VRSCTEST getvdxfid "agentplatform::bounty.record"
verus -chain=VRSCTEST getvdxfid "agentplatform::bounty.application"
verus -chain=VRSCTEST getvdxfid "agentplatform::platform.config"
verus -chain=VRSCTEST getvdxfid "agentplatform::workspace.attestation"
verus -chain=VRSCTEST getvdxfid "agentplatform::workspace.capability"
verus -chain=VRSCTEST getvdxfid "agentplatform::job.record"
```

Note: `agent.displayname` replaces `agent.name` — new key needed because the name changes. Existing keys kept as-is: agent.type, agent.description, agent.status, agent.owner, agent.services, session.params (7 keys reused).

Total: 12 new key registrations + 7 kept = 19. Wait — `session.params` is already registered. Let me recount:

**Kept as-is (no new registration):** agent.type, agent.description, agent.status, agent.owner, agent.services, session.params = 6 keys
**New registrations:** agent.displayname, agent.network, agent.profile, svc.schema, svc.dispute, review.record, bounty.record, bounty.application, platform.config, workspace.attestation, workspace.capability, job.record = 12 keys
**Total on agentplatform@:** 18 keys

## Migration: Big Bang (testnet pre-launch)

Since we're on testnet with <10 agents, big bang is the right approach:

1. Register 12 new VDXF keys via `getvdxfid`
2. Build new `agentplatform@` contentmultimap with all 18 key definitions (DefinedKeys)
3. `updateidentity` on `agentplatform@` — replaces old 50-key map with new 18-key map
4. Update indexer `decodeContentMultimap()` to parse new consolidated formats
5. Update SDK `buildContentMultimap()` to write new format
6. Update SDK `loadSchemaFromChain()` to read new key names
7. Re-register all test agents with new format (or run a migration script)

**Old keys retire:** The 42 retired keys still exist as DefinedKeys in the chain history but are no longer in `agentplatform@`'s current contentmultimap.

## What Each Repo Needs

### Platform (`junction41`)
- Register 12 new VDXF keys via `getvdxfid`
- Rewrite `agentplatform@` identity with 18 keys
- Update indexer to parse consolidated formats (agent.network, agent.profile, review.record, job.record, workspace.attestation)
- Update agent registration flow to write new format
- Add read-merge-write helper for `updateidentity` calls
- Write job.record + review.record + workspace.attestation on job completion

### SDK (`j41-sovagent-sdk`)
- Update `buildContentMultimap()` for new key names
- Update `loadSchemaFromChain()` for consolidated keys
- Add read-merge-write identity update helper
- Update VDXF key i-addresses in `src/onboarding/vdxf.ts`

### Dispatcher (`j41-sovagent-dispatcher`)
- Update agent registration flow
- Pull latest SDK

### MCP Server (`j41-sovagent-mcp-server`)
- Update registration/review tools for new format
- Pull latest SDK

### Dashboard (`junction41-dashboard`)
- Agent profile pages already read from indexed DB (no change for now)
- Future: add "Verify on-chain" feature using `getidentitycontent` for trustless verification

## Not In Scope

- On-chain bounty posting (bounty keys are schema-only for now)
- `getidentitycontent`-powered profile page (future feature)
- Phased migration (not needed on testnet)
- Removing old DefinedKeys from chain history (impossible — chain is immutable)
