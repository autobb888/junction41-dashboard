> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

# SDK / MCP Server / Dispatcher — Endpoint Coverage Gap Analysis & Implementation Plan

**Date:** 2026-03-20
**Status:** Ready for implementation
**Scope:** Fill coverage gaps across all 3 agent-facing packages

---

## Coverage Matrix

Legend: Covered / Missing / N/A (not applicable for that package)

### Health & Stats (public, read-only)

| Endpoint | Auth | SDK | MCP | Dispatcher | Notes |
|----------|------|-----|-----|------------|-------|
| `GET /v1/health` | No | `health()` | N/A | N/A | Infrastructure only |
| `GET /v1/stats` | No | Missing | N/A | N/A | Skip — admin/dashboard |
| `GET /v1/public-stats` | No | Missing | Missing | N/A | Useful for agent context |

### Authentication

| Endpoint | Auth | SDK | MCP | Dispatcher | Notes |
|----------|------|-----|-----|------------|-------|
| `GET /auth/challenge` | No | `getAuthChallenge()` | N/A | N/A | Used internally |
| `POST /auth/login` | No | `login()` / `authenticateWithWIF()` | `j41_authenticate` | Used internally | Full coverage |
| `GET /auth/session` | Yes | `getSession()` | N/A | N/A | Internal |
| `POST /auth/logout` | Yes | `logout()` | N/A | N/A | Internal |
| `GET /auth/qr/*` | No | N/A | N/A | N/A | Mobile-only, skip |
| `POST /auth/qr/callback` | No | N/A | N/A | N/A | Mobile-only, skip |

### Agents

| Endpoint | Auth | SDK | MCP | Dispatcher | Notes |
|----------|------|-----|-----|------------|-------|
| `GET /v1/agents` | No | `getAgents()` | Missing | N/A | **MCP gap** — agent discovery |
| `GET /v1/agents/:id` | No | `getAgent()` | Missing | N/A | **MCP gap** — agent lookup |
| `GET /v1/agents/:id/capabilities` | No | `getAgentCapabilities()` | Missing | N/A | **MCP gap** |
| `GET /v1/agents/:id/verification` | No | Missing | Missing | N/A | Low priority |
| `GET /v1/agents/:verusId/transparency` | No | Missing | Missing | N/A | Low priority |
| `GET /v1/agents/:verusId/trust-level` | No | `getTrustScore()` | `j41_get_trust_score` | N/A | Covered |
| `GET /v1/agents/:verusId/data-policy` | No | `getAgentDataPolicy()` | Missing | N/A | **MCP gap** |
| `POST /v1/agents/:id/status` | Yes | `setAgentStatus()` | Missing | N/A | **MCP gap** — agent self-management |
| `POST /v1/agents/register` | Yes | `registerAgent()` | `j41_register_agent` | Used internally | Covered |
| `POST /v1/agents/:id/update` | Yes | Missing | Missing | N/A | **SDK+MCP gap** |
| `POST /v1/agents/:id/deactivate` | Yes | via `agent.deactivate()` | Missing | `deactivate` cmd | Covered at agent level |

### Services

| Endpoint | Auth | SDK | MCP | Dispatcher | Notes |
|----------|------|-----|-----|------------|-------|
| `GET /v1/services` | No | `getServices()` | Missing | N/A | **MCP gap** — service browsing |
| `GET /v1/services/:id` | No | `getService()` | Missing | N/A | **MCP gap** |
| `GET /v1/services/agent/:verusId` | No | `getAgentServices()` | Missing | N/A | **MCP gap** |
| `GET /v1/services/categories` | No | `getServiceCategories()` | Missing | N/A | **MCP gap** |
| `GET /v1/me/services` | Yes | `getMyServices()` | Missing | N/A | **MCP gap** |
| `GET /v1/me/services/:id` | Yes | Missing | Missing | N/A | Low priority (use getService) |
| `POST /v1/me/services` | Yes | `registerService()` | `j41_register_service` | Used internally | Covered |
| `PUT /v1/me/services/:id` | Yes | `updateService()` | Missing | N/A | **MCP gap** |
| `DELETE /v1/me/services/:id` | Yes | `deleteService()` | Missing | N/A | **MCP gap** |

### Jobs — Core Lifecycle

| Endpoint | Auth | SDK | MCP | Dispatcher | Notes |
|----------|------|-----|-----|------------|-------|
| `POST /v1/jobs` | Yes | `createJob()` | Missing | N/A | **MCP gap** — job creation |
| `GET /v1/jobs/:id` | Yes | `getJob()` | `j41_get_job` | Used internally | Covered |
| `GET /v1/jobs/hash/:hash` | Yes | `getJobByHash()` | Missing | N/A | Low priority |
| `GET /v1/me/jobs` | Yes | `getMyJobs()` | `j41_list_jobs` | Used internally | Covered |
| `POST /v1/jobs/:id/accept` | Yes | `acceptJob()` | `j41_accept_job` | Used internally | Covered |
| `POST /v1/jobs/:id/payment` | Yes | `recordPayment()` | `j41_record_payment` | N/A | Covered |
| `POST /v1/jobs/:id/deliver` | Yes | `deliverJob()` | `j41_deliver_job` | Used internally | Covered |
| `POST /v1/jobs/:id/complete` | Yes | `completeJob()` | `j41_complete_job` | N/A | Covered |
| `POST /v1/jobs/:id/cancel` | Yes | `cancelJob()` | `j41_cancel_job` | N/A | Covered |
| `POST /v1/jobs/:id/reject-delivery` | Yes | Missing | Missing | N/A | **SDK+MCP gap** |
| `POST /v1/jobs/:id/end-session` | Yes | `requestEndSession()` | Missing | N/A | **MCP gap** |
| `POST /v1/jobs/:id/platform-fee` | Yes | `recordPlatformFee()` | Missing | N/A | **MCP gap** |
| `GET /v1/jobs/message/request` | Yes | `getJobRequestMessage()` | Missing | N/A | Needed for `createJob` MCP tool |

### Jobs — Disputes

| Endpoint | Auth | SDK | MCP | Dispatcher | Notes |
|----------|------|-----|-----|------------|-------|
| `POST /v1/jobs/:id/dispute` | Yes | `disputeJob()` | `j41_dispute_job` | `job.dispute.filed` | Covered |
| `POST /v1/jobs/:id/dispute/respond` | Yes | `respondToDispute()` | `j41_respond_to_dispute` | N/A | Covered |
| `POST /v1/jobs/:id/dispute/rework-accept` | Yes | `acceptRework()` | `j41_accept_rework` | `job.dispute.rework_accepted` | Covered |
| `GET /v1/jobs/:id/dispute` | Yes | Missing | Missing | N/A | **SDK+MCP gap** |
| `GET /v1/agents/:verusId/dispute-metrics` | No | Missing | Missing | N/A | **SDK+MCP gap** — public reputation |
| `POST /v1/jobs/:id/dispute/refund-txid` | Yes | Missing | Missing | N/A | **SDK+MCP gap** — refund flow |

### Jobs — Extensions

| Endpoint | Auth | SDK | MCP | Dispatcher | Notes |
|----------|------|-----|-----|------------|-------|
| `GET /v1/jobs/:id/extensions` | Yes | `getExtensions()` | Missing | N/A | **MCP gap** |
| `POST /v1/jobs/:id/extensions` | Yes | `requestExtension()` | `j41_request_extension` | N/A | Covered |
| `POST /v1/jobs/:id/extensions/:extId/approve` | Yes | `approveExtension()` | `j41_approve_extension` | N/A | Covered |
| `POST /v1/jobs/:id/extensions/:extId/payment` | Yes | `payExtension()` | Missing | N/A | **MCP gap** |
| `POST /v1/jobs/:id/extensions/:extId/reject` | Yes | `rejectExtension()` | `j41_reject_extension` | N/A | Covered |

### Jobs — Messages & Files

| Endpoint | Auth | SDK | MCP | Dispatcher | Notes |
|----------|------|-----|-----|------------|-------|
| `GET /v1/jobs/:id/messages` | Yes | `getChatMessages()` | `j41_get_messages` | N/A | Covered |
| `POST /v1/jobs/:id/messages` | Yes | `sendChatMessage()` | `j41_send_message` | N/A | Covered |
| `POST /v1/jobs/:id/files` | Yes | `uploadFile()` | `j41_upload_file` | N/A | Covered |
| `GET /v1/jobs/:id/files` | Yes | `getJobFiles()` | `j41_list_files` | N/A | Covered |
| `GET /v1/jobs/:id/files/:fid` | Yes | `downloadFile()` | `j41_download_file` | N/A | Covered |
| `DELETE /v1/jobs/:id/files/:fid` | Yes | `deleteFile()` | `j41_delete_file` | N/A | Covered |

### Data Handling & Attestations

| Endpoint | Auth | SDK | MCP | Dispatcher | Notes |
|----------|------|-----|-----|------------|-------|
| `PUT /v1/me/data-policy` | Yes | `setDataPolicy()` | Missing | N/A | **MCP gap** |
| `GET /v1/jobs/:id/data-terms` | Yes | `getJobDataTerms()` | Missing | N/A | **MCP gap** |
| `POST /v1/jobs/:id/deletion-attestation` | Yes | `submitDeletionAttestation()` | `j41_attest_deletion` | Used internally | Covered |
| `GET /v1/jobs/:id/deletion-attestation` | Yes | `getDeletionAttestation()` | Missing | N/A | Low priority |
| `POST /v1/me/attestations` | Yes | `submitAttestation()` | N/A | N/A | Internal |
| `GET /v1/agents/:id/attestations` | No | `getAttestations()` | Missing | N/A | Low priority |

### Chat & Inbox

| Endpoint | Auth | SDK | MCP | Dispatcher | Notes |
|----------|------|-----|-----|------------|-------|
| `GET /v1/chat/token` | Yes | Internal (ChatClient) | `j41_connect_chat` | N/A | Covered |
| `GET /v1/me/unread-jobs` | Yes | `getUnreadJobs()` | Missing | N/A | **MCP gap** |
| `GET /v1/me/inbox` | Yes | `getInbox()` | Missing | N/A | **MCP gap** — critical for job flow |
| `GET /v1/me/inbox/count` | Yes | `getInboxCount()` | Missing | N/A | **MCP gap** |
| `GET /v1/me/inbox/:id` | Yes | `getInboxItem()` | Missing | N/A | **MCP gap** |
| `POST /v1/me/inbox/:id/accept` | Yes | `acceptInboxItem()` | Missing | N/A | **MCP gap** |
| `POST /v1/me/inbox/:id/reject` | Yes | `rejectInboxItem()` | Missing | N/A | **MCP gap** |
| `GET /v1/me/identity/raw` | Yes | `getIdentityRaw()` | Missing | N/A | **MCP gap** — identity management |

### Notifications & Alerts

| Endpoint | Auth | SDK | MCP | Dispatcher | Notes |
|----------|------|-----|-----|------------|-------|
| `GET /v1/me/notifications` | Yes | Missing | `j41_get_notifications` | N/A | **SDK gap** |
| `POST /v1/me/notifications/ack` | Yes | Missing | `j41_ack_notification` | N/A | **SDK gap** |
| `GET /v1/me/alerts` | Yes | `getAlerts()` | Missing | N/A | **MCP gap** |
| `POST /v1/alerts/:id/dismiss` | Yes | `dismissAlert()` | Missing | N/A | **MCP gap** |
| `POST /v1/alerts/:id/report` | Yes | `reportAlert()` | Missing | N/A | Low priority |

### Webhooks

| Endpoint | Auth | SDK | MCP | Dispatcher | Notes |
|----------|------|-----|-----|------------|-------|
| `GET /v1/me/webhooks` | Yes | `listWebhooks()` | `j41_list_webhooks` | Used internally | Covered |
| `POST /v1/me/webhooks` | Yes | `registerWebhook()` | `j41_register_webhook` | Used internally | Covered |
| `PATCH /v1/me/webhooks/:id` | Yes | Missing | Missing | N/A | **SDK+MCP gap** |
| `DELETE /v1/me/webhooks/:id` | Yes | `deleteWebhook()` | `j41_delete_webhook` | N/A | Covered |
| `POST /v1/me/webhooks/:id/test` | Yes | Missing | Missing | N/A | **SDK+MCP gap** |
| `GET /v1/me/webhooks/:id/deliveries` | Yes | Missing | Missing | N/A | Low priority |

### Reviews & Reputation

| Endpoint | Auth | SDK | MCP | Dispatcher | Notes |
|----------|------|-----|-----|------------|-------|
| `GET /v1/reviews/agent/:verusId` | No | `getAgentReviews()` | `j41_get_reviews` | N/A | Covered |
| `GET /v1/reviews/buyer/:verusId` | No | `getBuyerReviews()` | Missing | N/A | Low priority |
| `GET /v1/reviews/job/:jobHash` | No | `getJobReview()` | Missing | N/A | Low priority |
| `GET /v1/reviews/message` | No | Internal | `j41_submit_review` (internal) | N/A | Covered |
| `POST /v1/reviews` | Yes | Missing | `j41_submit_review` | N/A | **SDK gap** |
| `GET /v1/reputation/:verusId` | No | `getReputation()` | Missing | N/A | **MCP gap** |
| `GET /v1/reputation/top` | No | `getTopAgents()` | Missing | N/A | **MCP gap** |

### Trust Score

| Endpoint | Auth | SDK | MCP | Dispatcher | Notes |
|----------|------|-----|-----|------------|-------|
| `GET /v1/agents/:verusId/trust` | No | `getTrustScore()` | `j41_get_trust_score` | N/A | Covered |
| `GET /v1/me/trust` | Yes | `getMyTrust()` | `j41_get_my_trust` | N/A | Covered |
| `GET /v1/me/trust/history` | Yes | `getMyTrustHistory()` | Missing | N/A | **MCP gap** |
| `POST /v1/admin/*` | Admin | N/A | N/A | N/A | Admin only, skip |

### Bounties (6 endpoints, 0 coverage)

| Endpoint | Auth | SDK | MCP | Dispatcher | Notes |
|----------|------|-----|-----|------------|-------|
| `GET /v1/bounties` | No | **Missing** | **Missing** | N/A | Browse bounties |
| `GET /v1/bounties/:id` | No | **Missing** | **Missing** | N/A | Bounty detail |
| `POST /v1/bounties` | Yes | **Missing** | **Missing** | N/A | Post bounty (signed) |
| `POST /v1/bounties/:id/apply` | Yes | **Missing** | **Missing** | N/A | Apply to bounty |
| `POST /v1/bounties/:id/select` | Yes | **Missing** | **Missing** | N/A | Select claimants |
| `DELETE /v1/bounties/:id` | Yes | **Missing** | **Missing** | N/A | Cancel bounty |

### Workspace

| Endpoint | Auth | SDK | MCP | Dispatcher | Notes |
|----------|------|-----|-----|------------|-------|
| `POST /v1/workspace/:jobId/token` | Yes | Internal | N/A | N/A | Buyer-only |
| `GET /v1/workspace/:jobId` | Yes | `getWorkspaceStatus()` | `j41_workspace_status` | N/A | Covered |
| `POST /v1/workspace/:jobId/approve/:opId` | Yes | N/A | N/A | N/A | Buyer-only |
| `POST /v1/workspace/:jobId/reject/:opId` | Yes | N/A | N/A | N/A | Buyer-only |
| `POST /v1/workspace/:jobId/abort` | Yes | N/A | N/A | N/A | Buyer-only |
| `GET /v1/workspace/:jobId/connect-token` | Yes | Internal (WorkspaceClient) | Internal | N/A | Covered |

### Search, Capabilities, Pricing, Transactions

| Endpoint | Auth | SDK | MCP | Dispatcher | Notes |
|----------|------|-----|-----|------------|-------|
| `GET /v1/search` | No | `searchAgents()` | Missing | N/A | **MCP gap** |
| `GET /v1/capabilities` | No | `getCapabilities()` | Missing | N/A | Low priority |
| `POST /v1/resolve-names` | Yes | Missing | Missing | N/A | **SDK+MCP gap** |
| `GET /v1/pricing/recommend` | No | `queryPricingOracle()` | `j41_recommend_price` | N/A | Covered |
| `GET /v1/pricing/models` | No | `getPricingModels()` | N/A | N/A | Covered |
| `POST /v1/tx/broadcast` | Yes | `broadcast()` | `j41_broadcast_tx` | N/A | Covered |
| `GET /v1/tx/utxos` | Yes | `getUtxos()` | `j41_get_utxos` | N/A | Covered |
| `POST /v1/onboard` | No | `onboard()` / `registerIdentity()` | `j41_register_identity` | Used internally | Covered |
| `GET /v1/onboard/status/:id` | No | `onboardStatus()` | N/A | N/A | Internal |

### Dispatcher — Webhook Event Coverage

| Event | Handled | Notes |
|-------|---------|-------|
| `job.requested` | Handled | Triggers container spawn |
| `job.accepted` | N/A | Agent-side, not dispatcher |
| `job.payment` | N/A | Verified via API polling |
| `job.started` | Handled | Triggers container spawn (fallback) |
| `job.delivered` | N/A | Agent handles internally |
| `job.completed` | Handled | Kills container, IPC to job-agent |
| `job.delivery_rejected` | Handled | Logged |
| `job.disputed` / `job.dispute.filed` | Handled | IPC to job-agent |
| `job.dispute.responded` | Handled | Logged |
| `job.dispute.resolved` | Handled | IPC to job-agent |
| `job.dispute.rework_accepted` | Handled | IPC to job-agent |
| `job.cancelled` | Handled | Kills container |
| `job.end_session_request` | **Missing** | Should forward to job-agent |
| `job.extension_request` | **Missing** | Should forward to job-agent |
| `message.new` | N/A | Handled via WebSocket |
| `file.uploaded` | N/A | Handled via WebSocket |
| `review.received` | N/A | No dispatcher action needed |
| `inbox.new` | N/A | No dispatcher action needed |
| `bounty.posted` | **Missing** | Could auto-apply if matching |
| `bounty.applied` | N/A | Poster-side |
| `bounty.awarded` | **Missing** | Should spawn container for won bounty |
| `bounty.expired` | N/A | Informational |
| `workspace.ready` | Handled | IPC to job-agent |
| `workspace.connected` | N/A | Informational |
| `workspace.disconnected` | Handled | IPC to job-agent |
| `workspace.completed` | Handled | IPC to job-agent |

---

## Gap Summary

| Package | Covered | Missing | Total Agent-Facing | Coverage % |
|---------|---------|---------|-------------------|------------|
| **SDK (J41Client)** | ~62 | ~14 | ~76 | 82% |
| **MCP Server** | ~38 | ~28 | ~66 | 58% |
| **Dispatcher** | ~10 | ~4 | ~14 | 71% |

### Critical Gaps (blocking agent autonomy)

1. **Bounties** — 6 endpoints, 0 SDK, 0 MCP
2. **Inbox** — SDK has methods, 0 MCP tools (agents cannot process inbox via MCP)
3. **Agent/Service Discovery** — SDK has methods, 0 MCP tools (agents cannot browse marketplace)
4. **Job Creation** — SDK has method, 0 MCP (agents cannot hire other agents)
5. **Dispute Details** — Missing `getDispute()`, `submitRefundTxid()`, `getDisputeMetrics()` in both

---

## Implementation Plan

### Task 1: Bounties — SDK + MCP (Priority: HIGH)

6 new SDK methods, 6 new MCP tools. Zero current coverage.

- [ ] **1.1 SDK: Add bounty methods to J41Client**
  - File: `/home/bigbox/code/j41-sovagent-sdk/src/client/index.ts`
  - Add after the workspace section (~line 1202):
    - `getBounties(params?: { category?: string; minAmount?: number; maxAmount?: number; status?: string; limit?: number; offset?: number })` → `GET /v1/bounties`
    - `getBounty(bountyId: string)` → `GET /v1/bounties/:id`
    - `postBounty(data: PostBountyData)` → `POST /v1/bounties` (signed)
    - `applyToBounty(bountyId: string, data: { message: string; signature: string; timestamp: number })` → `POST /v1/bounties/:id/apply`
    - `selectBountyClaimants(bountyId: string, data: { applicantIds: string[]; signature: string; timestamp: number })` → `POST /v1/bounties/:id/select`
    - `cancelBounty(bountyId: string)` → `DELETE /v1/bounties/:id`
  - Add types: `Bounty`, `BountyApplication`, `PostBountyData`, `BountySearchParams`

- [ ] **1.2 SDK: Add signing builders for bounty messages**
  - File: `/home/bigbox/code/j41-sovagent-sdk/src/signing/messages.ts`
  - Add: `buildPostBountyMessage()`, `buildApplyBountyMessage()`, `buildSelectClaimantsMessage()`

- [ ] **1.3 SDK: Add bounty convenience methods to J41Agent**
  - File: `/home/bigbox/code/j41-sovagent-sdk/src/agent.ts`
  - Add: `postBounty()`, `applyToBounty()`, `selectBountyClaimants()`, `cancelBounty()`
  - These should handle signing internally (like `acceptJob()`)

- [ ] **1.4 MCP: Create bounty tools**
  - File: `/home/bigbox/code/j41-sovagent-mcp-server/src/tools/bounties.ts` (NEW)
  - Tools:
    - `j41_browse_bounties` — browse open bounties with filters
    - `j41_get_bounty` — get bounty detail + applicants
    - `j41_post_bounty` — post a new bounty (signing handled internally)
    - `j41_apply_to_bounty` — apply to a bounty
    - `j41_select_bounty_claimants` — select winners (poster only)
    - `j41_cancel_bounty` — cancel a bounty
  - Register in `/home/bigbox/code/j41-sovagent-mcp-server/src/tools/index.ts` (or equivalent registration file)

- [ ] **1.5 SDK: Export bounty types from package index**
  - File: `/home/bigbox/code/j41-sovagent-sdk/src/index.ts`
  - Export `Bounty`, `BountyApplication`, `PostBountyData`

### Task 2: Inbox & Notifications — MCP (Priority: HIGH)

SDK already has full coverage. 6 new MCP tools needed.

- [ ] **2.1 MCP: Create inbox tools**
  - File: `/home/bigbox/code/j41-sovagent-mcp-server/src/tools/inbox.ts` (NEW)
  - Tools:
    - `j41_get_inbox` — list inbox items (status filter, pagination)
    - `j41_get_inbox_count` — get pending count
    - `j41_get_inbox_item` — get item detail with updateidentity command
    - `j41_accept_inbox_item` — accept inbox item (optionally record txid)
    - `j41_reject_inbox_item` — reject inbox item
    - `j41_get_identity_raw` — get on-chain identity data + UTXOs
  - Register in tool index

- [ ] **2.2 MCP: Add alert tools**
  - File: Add to `/home/bigbox/code/j41-sovagent-mcp-server/src/tools/notifications.ts`
  - Tools:
    - `j41_get_alerts` — get safety alerts
    - `j41_dismiss_alert` — dismiss an alert

- [ ] **2.3 SDK: Add notification methods to J41Client**
  - File: `/home/bigbox/code/j41-sovagent-sdk/src/client/index.ts`
  - Add:
    - `getNotifications()` → `GET /v1/me/notifications`
    - `ackNotifications(ids: string[])` → `POST /v1/me/notifications/ack`

### Task 3: Agent & Service Discovery — MCP (Priority: HIGH)

SDK is fully covered. MCP has zero browse/discovery tools.

- [ ] **3.1 MCP: Create service discovery tools**
  - File: `/home/bigbox/code/j41-sovagent-mcp-server/src/tools/services.ts` (NEW)
  - Tools:
    - `j41_browse_services` — browse marketplace services (category, price, pagination)
    - `j41_get_service` — get service detail
    - `j41_get_agent_services` — list services by agent
    - `j41_get_service_categories` — list available categories
    - `j41_get_my_services` — list own services
    - `j41_update_service` — update service listing
    - `j41_delete_service` — delete service listing
  - Register in tool index

- [ ] **3.2 MCP: Create agent discovery tools**
  - File: `/home/bigbox/code/j41-sovagent-mcp-server/src/tools/discovery.ts` (NEW)
  - Tools:
    - `j41_browse_agents` — list agents with filters
    - `j41_get_agent_detail` — get agent detail
    - `j41_search` — search agents and services by keyword
    - `j41_get_agent_capabilities` — get agent capabilities
    - `j41_get_agent_data_policy` — get agent data policy
  - Register in tool index

### Task 4: Job Creation & Missing Job Lifecycle — MCP (Priority: HIGH)

- [ ] **4.1 MCP: Add job creation tool**
  - File: `/home/bigbox/code/j41-sovagent-mcp-server/src/tools/jobs.ts`
  - Add tool: `j41_create_job` — create a job request (handles message building + signing)
    - Steps: call `getJobRequestMessage()` to build the sign message, sign it, then call `createJob()`
  - Add tool: `j41_end_session` — request end of session
  - Add tool: `j41_record_platform_fee` — submit platform fee txid

- [ ] **4.2 SDK+MCP: Add reject-delivery**
  - SDK file: `/home/bigbox/code/j41-sovagent-sdk/src/client/index.ts`
  - Add: `rejectDelivery(jobId: string, reason: string)` → `POST /v1/jobs/:id/reject-delivery`
  - MCP file: `/home/bigbox/code/j41-sovagent-mcp-server/src/tools/jobs.ts`
  - Add tool: `j41_reject_delivery`

- [ ] **4.3 MCP: Add extension list + payment tools**
  - File: `/home/bigbox/code/j41-sovagent-mcp-server/src/tools/extensions.ts`
  - Add: `j41_list_extensions` — list extensions for a job
  - Add: `j41_pay_extension` — submit extension payment txids

### Task 5: Dispute Completion — SDK + MCP (Priority: MEDIUM)

- [ ] **5.1 SDK: Add missing dispute methods**
  - File: `/home/bigbox/code/j41-sovagent-sdk/src/client/index.ts`
  - Add:
    - `getDispute(jobId: string)` → `GET /v1/jobs/:id/dispute`
    - `submitRefundTxid(jobId: string, txid: string)` → `POST /v1/jobs/:id/dispute/refund-txid`
    - `getDisputeMetrics(verusId: string)` → `GET /v1/agents/:verusId/dispute-metrics`

- [ ] **5.2 MCP: Add dispute detail tools**
  - File: `/home/bigbox/code/j41-sovagent-mcp-server/src/tools/disputes.ts`
  - Add:
    - `j41_get_dispute` — get dispute details for a job
    - `j41_submit_refund_txid` — submit refund transaction ID
    - `j41_get_dispute_metrics` — get an agent's public dispute track record

### Task 6: Reviews & Reputation — SDK + MCP (Priority: MEDIUM)

- [ ] **6.1 SDK: Add submitReview to J41Client**
  - File: `/home/bigbox/code/j41-sovagent-sdk/src/client/index.ts`
  - Add: `submitReview(data: SubmitReviewData)` → `POST /v1/reviews`
  - Add: `getReviewMessage(params)` → `GET /v1/reviews/message`
  - Add type: `SubmitReviewData`

- [ ] **6.2 MCP: Add reputation tools**
  - File: `/home/bigbox/code/j41-sovagent-mcp-server/src/tools/reviews.ts`
  - Add:
    - `j41_get_reputation` — get agent reputation score
    - `j41_get_top_agents` — get top agents leaderboard
    - `j41_get_trust_history` — get trust score history over time

### Task 7: Remaining SDK Gaps (Priority: MEDIUM)

- [ ] **7.1 SDK: Add webhook update + test**
  - File: `/home/bigbox/code/j41-sovagent-sdk/src/client/index.ts`
  - Add:
    - `updateWebhook(webhookId: string, data)` → `PATCH /v1/me/webhooks/:id`
    - `testWebhook(webhookId: string)` → `POST /v1/me/webhooks/:id/test`

- [ ] **7.2 SDK: Add resolve-names**
  - File: `/home/bigbox/code/j41-sovagent-sdk/src/client/index.ts`
  - Add: `resolveNames(iAddresses: string[])` → `POST /v1/resolve-names`

- [ ] **7.3 MCP: Add data policy tools**
  - File: `/home/bigbox/code/j41-sovagent-mcp-server/src/tools/privacy.ts`
  - Add:
    - `j41_set_data_policy` — set data handling policy
    - `j41_get_job_data_terms` — get job data terms

- [ ] **7.4 MCP: Add unread-jobs tool**
  - File: `/home/bigbox/code/j41-sovagent-mcp-server/src/tools/chat.ts`
  - Add: `j41_get_unread_jobs` — get jobs with unread messages

- [ ] **7.5 MCP: Add agent status toggle**
  - File: `/home/bigbox/code/j41-sovagent-mcp-server/src/tools/agent.ts`
  - Add: `j41_set_agent_status` — toggle active/inactive (handles signing)

### Task 8: Dispatcher Webhook Gaps (Priority: MEDIUM)

- [ ] **8.1 Dispatcher: Handle job.end_session_request**
  - File: `/home/bigbox/code/j41-sovagent-dispatcher/src/cli.js` (webhook handler switch)
  - Add case for `job.end_session_request` — forward to running job-agent via IPC

- [ ] **8.2 Dispatcher: Handle job.extension_request**
  - File: `/home/bigbox/code/j41-sovagent-dispatcher/src/cli.js`
  - Add case for `job.extension_request` — forward to running job-agent via IPC

- [ ] **8.3 Dispatcher: Handle bounty.awarded**
  - File: `/home/bigbox/code/j41-sovagent-dispatcher/src/cli.js`
  - Add case for `bounty.awarded` — treat like `job.requested` (spawn container for the new job)
  - The `bounty.awarded` event includes `jobId` — the platform creates the job automatically

### Task 9: MCP Tool Registration (Priority: HIGH — required for Tasks 1-4)

- [ ] **9.1 Register all new tool modules**
  - File: Locate the MCP server entry point that calls `registerXxxTools(server)`
  - Add imports and calls for: `registerBountyTools`, `registerInboxTools`, `registerServiceTools`, `registerDiscoveryTools`

---

## Implementation Order

1. **Task 1** (Bounties SDK+MCP) — Highest priority, 0% coverage on 6 endpoints
2. **Task 2** (Inbox MCP) — Critical for agent job flow
3. **Task 3** (Discovery MCP) — Agents need to browse marketplace
4. **Task 4** (Job Creation MCP) — Agent-to-agent hiring
5. **Task 9** (Registration) — Wire up all new tool modules
6. **Task 5** (Disputes) — Complete the dispute lifecycle
7. **Task 6** (Reviews/Reputation) — Fill remaining review gaps
8. **Task 7** (Misc SDK/MCP) — Smaller gaps
9. **Task 8** (Dispatcher) — Webhook handler additions

## Build & Test Notes

- SDK: `cd /home/bigbox/code/j41-sovagent-sdk && yarn build` (never `npm`)
- MCP: `cd /home/bigbox/code/j41-sovagent-mcp-server && yarn build`
- Dispatcher: No build step (CommonJS)
- All 3 packages must NOT use `npm` directly on host — use Docker or `yarn`
- SDK is a dependency of MCP and Dispatcher — rebuild SDK first after changes
